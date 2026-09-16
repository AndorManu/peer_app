import { checkEntitlement, recordUsage, resolveUser } from "./entitlements.js";
import { retrieveContext } from "./handleRag.js";

const MAX_BODY_SIZE = 2_000_000;

export async function handleChatRequest(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const payload = await readJson(req);
  const system = String(payload.system || "");
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const imageDataUrls = Array.isArray(payload.imageDataUrls) ? payload.imageDataUrls : [];

  if (!system || messages.length === 0) {
    sendJson(res, 400, { error: "Missing system prompt or messages." });
    return;
  }

  // ---- entitlement gate (when Supabase is configured, AI requires auth +
  // remaining daily quota; a bare clone without Supabase keys skips the gate) ----
  let entitlement = null;
  let userId = null;
  const gated = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (gated) {
    const user = await resolveUser(req.headers.authorization);
    if (!user) {
      sendJson(res, 401, { error: "Sign in to use the AI tutor.", code: "auth_required" });
      return;
    }
    userId = user.userId;
    entitlement = await checkEntitlement(userId, req.headers["x-peer-tz-offset"]);
    if (entitlement.exhausted) {
      sendJson(res, 402, {
        error: "You've used today's free AI tokens. Upgrade to Pro for a much bigger daily allowance, or come back after midnight.",
        code: "quota_exhausted",
        plan: entitlement.plan,
        usedToday: entitlement.usedToday,
        allowance: entitlement.allowance,
      });
      return;
    }
  }

  // RAG: for big libraries the client sends a retrieval marker instead of
  // inlining every document; the server injects only the relevant, cited
  // excerpts (semantic search over the user's own chunks).
  let ragSystem = system;
  if (userId && payload.retrieval?.projectId) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const context = await retrieveContext({
      userId,
      projectId: String(payload.retrieval.projectId),
      query: String(lastUser?.content || "").slice(0, 2000),
    });
    if (context) ragSystem = `${system}${context}`;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const usage = await streamAnthropic(ragSystem, messages, res, imageDataUrls, entitlement?.model);
      if (userId && usage) {
        await recordUsage({ userId, kind: "chat", model: usage.model, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut });
      }
    } else {
      await streamOpenAI(system, messages, res);
    }
  } catch (err) {
    sendEvent(res, { error: err.message || "The AI request failed." });
    res.end();
  }
}

async function streamAnthropic(system, messages, res, imageDataUrls = [], modelOverride = null) {
  const anthropicMessages = messages.map((m, i) => {
    const isLastUser = m.role === "user" && i === messages.length - 1 && imageDataUrls.length > 0;
    if (isLastUser) {
      return {
        role: "user",
        content: [
          ...imageDataUrls.map(({ dataUrl }) => {
            const [header, data] = dataUrl.split(",");
            const mediaType = header.match(/:(.*?);/)?.[1] || "image/jpeg";
            return { type: "image", source: { type: "base64", media_type: mediaType, data } };
          }),
          { type: "text", text: String(m.content || "") },
        ],
      };
    }
    return { role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") };
  });

  const model = modelOverride || process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      stream: true,
      // Prompt caching on the big tutor system prompt: ~90% cheaper input on
      // repeat turns within the cache window.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: anthropicMessages,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw apiError(response.status, data.error?.message || "Anthropic request failed.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let tokensIn = 0;
  let tokensOut = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;
      let event;
      try {
        event = JSON.parse(raw);
      } catch {
        continue;
      }
      // Surface a mid-stream error event instead of ending with a silent done:true
      if (event.type === "error") {
        throw apiError(502, event.error?.message || "Anthropic stream error.");
      }
      if (event.type === "message_start") {
        const usage = event.message?.usage || {};
        tokensIn = (usage.input_tokens || 0)
          + (usage.cache_creation_input_tokens || 0)
          + (usage.cache_read_input_tokens || 0);
      }
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        sendEvent(res, { chunk: event.delta.text });
      }
      if (event.type === "message_delta" && event.usage?.output_tokens) {
        tokensOut = event.usage.output_tokens;
      }
    }
  }

  sendEvent(res, { done: true });
  res.end();
  return { model, tokensIn, tokensOut };
}

async function streamOpenAI(system, messages, res) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw apiError(401, "Add OPENAI_API_KEY to .env, or add ANTHROPIC_API_KEY if you prefer Claude.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      max_tokens: 1200,
      stream: true,
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content || ""),
        })),
      ],
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw apiError(response.status, data.error?.message || "OpenAI request failed.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") {
        sendEvent(res, { done: true });
        res.end();
        return;
      }
      let event;
      try {
        event = JSON.parse(raw);
      } catch {
        continue;
      }
      // Surface a mid-stream error event instead of ending with a silent done:true
      if (event.error) {
        throw apiError(502, event.error.message || "OpenAI stream error.");
      }
      const text = event.choices?.[0]?.delta?.content;
      if (text) sendEvent(res, { chunk: text });
    }
  }

  sendEvent(res, { done: true });
  res.end();
}

function sendEvent(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function apiError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        reject(apiError(413, "Request too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(apiError(400, "Invalid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

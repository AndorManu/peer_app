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

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    if (process.env.ANTHROPIC_API_KEY) {
      await streamAnthropic(system, messages, res, imageDataUrls);
    } else {
      await streamOpenAI(system, messages, res);
    }
  } catch (err) {
    sendEvent(res, { error: err.message || "The AI request failed." });
    res.end();
  }
}

async function streamAnthropic(system, messages, res, imageDataUrls = []) {
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

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      stream: true,
      system,
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
      // surface mid-stream error events instead of ending with a silent, truncated answer
      if (event.type === "error") {
        throw apiError(502, event.error?.message || "The AI stream returned an error.");
      }
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        sendEvent(res, { chunk: event.delta.text });
      }
    }
  }

  sendEvent(res, { done: true });
  res.end();
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
      try {
        const event = JSON.parse(raw);
        const text = event.choices?.[0]?.delta?.content;
        if (text) sendEvent(res, { chunk: text });
      } catch {}
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

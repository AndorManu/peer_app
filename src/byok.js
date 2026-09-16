// Bring-your-own-key transport. On the hosted build there is no server: the
// learner pastes their own Anthropic or OpenAI key, it lives in localStorage
// only, and the browser talks to the provider directly. The stream is re-framed
// into the exact SSE contract /api/chat uses (`data: {"chunk": …}` lines), so
// the chat view, the coding tab and the practice generator need no changes.

const STORAGE_KEY = "peer-byok";

// `VITE_STATIC=1 vite build` produces the hosted build: no /api/* routes exist,
// so server-only features (Stripe, image generation, OCR, RAG, the server code
// runner, cloud accounts) are hidden instead of failing.
export const STATIC_BUILD = import.meta.env?.VITE_STATIC === "1";

export const BYOK_PROVIDERS = {
  anthropic: {
    label: "Anthropic (Claude)",
    keyHint: "sk-ant-…",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    models: [
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 — fast and cheap (default)" },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5 — deeper explanations" },
    ],
  },
  openai: {
    label: "OpenAI (GPT)",
    keyHint: "sk-…",
    consoleUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini — fast and cheap (default)" },
      { id: "gpt-4.1", label: "GPT-4.1 — deeper explanations" },
    ],
  },
};

export function getByok() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    if (!cfg?.key || !BYOK_PROVIDERS[cfg.provider]) return null;
    return cfg;
  } catch {
    return null;
  }
}

export function setByok({ provider, key, model }) {
  const p = BYOK_PROVIDERS[provider];
  if (!p) throw new Error("Unknown provider.");
  const cfg = { provider, key: String(key || "").trim(), model: model || p.models[0].id };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  return cfg;
}

export function clearByok() {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasByok() {
  return Boolean(getByok());
}

// ---- outbound requests ----------------------------------------------------

function anthropicRequest(cfg, { system, messages, imageDataUrls = [] }, { stream, maxTokens }) {
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
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": cfg.key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      stream,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: anthropicMessages,
    }),
  });
}

function openaiRequest(cfg, { system, messages, imageDataUrls = [] }, { stream, maxTokens }) {
  const chat = messages.map((m, i) => {
    const isLastUser = m.role === "user" && i === messages.length - 1 && imageDataUrls.length > 0;
    if (isLastUser) {
      return {
        role: "user",
        content: [
          { type: "text", text: String(m.content || "") },
          ...imageDataUrls.map(({ dataUrl }) => ({ type: "image_url", image_url: { url: dataUrl } })),
        ],
      };
    }
    return { role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") };
  });
  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      stream,
      messages: [{ role: "system", content: system }, ...chat],
    }),
  });
}

// Pull the text delta out of one provider SSE event, or null.
function deltaOf(provider, event) {
  if (provider === "anthropic") {
    return event.type === "content_block_delta" && event.delta?.type === "text_delta" ? event.delta.text : null;
  }
  return event.choices?.[0]?.delta?.content ?? null;
}

async function providerErrorMessage(response) {
  const data = await response.json().catch(() => ({}));
  const msg = data.error?.message || data.error || `${response.status} ${response.statusText}`;
  if (response.status === 401 || response.status === 403) {
    return `Your API key was rejected (${msg}). Check it under Settings → AI key.`;
  }
  if (response.status === 429) return `The provider is rate-limiting this key (${msg}). Wait a moment and try again.`;
  return String(msg);
}

// Returns a Response whose body is the same `data: {…}` SSE stream the local
// server would send, so existing readers work unchanged. Errors come back as
// a non-OK JSON Response with a `byok` code — never 401/402, so the sign-in
// paywall is never shown for a bad key.
export async function byokChatResponse(payload, signal) {
  const cfg = getByok();
  if (!cfg) {
    return jsonResponse(400, { error: "Add your API key under Settings → AI key to start.", code: "byok_missing" });
  }
  let upstream;
  try {
    upstream = cfg.provider === "anthropic"
      ? await anthropicRequest(cfg, payload, { stream: true, maxTokens: 1200 })
      : await openaiRequest(cfg, payload, { stream: true, maxTokens: 1200 });
  } catch (err) {
    return jsonResponse(502, { error: `Could not reach the AI provider (${err.message}).`, code: "byok_network" });
  }
  if (!upstream.ok) {
    return jsonResponse(400, { error: await providerErrorMessage(upstream), code: "byok_rejected" });
  }

  const provider = cfg.provider;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const body = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      const emit = (obj) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n`));
      let buffer = "";
      try {
        while (true) {
          if (signal?.aborted) { reader.cancel(); break; }
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw || raw === "[DONE]") continue;
            let event;
            try { event = JSON.parse(raw); } catch { continue; }
            if (event.type === "error" || event.error) {
              emit({ error: event.error?.message || "The AI request failed." });
              continue;
            }
            const text = deltaOf(provider, event);
            if (text) emit({ chunk: text });
          }
        }
        emit({ done: true });
      } catch (err) {
        emit({ error: err.message || "The AI stream broke off." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

// One tiny non-streaming call to prove the key works before saving it.
export async function testByok(cfg) {
  try {
    const payload = { system: "Reply with the single word OK.", messages: [{ role: "user", content: "Ping" }] };
    const response = cfg.provider === "anthropic"
      ? await anthropicRequest(cfg, payload, { stream: false, maxTokens: 5 })
      : await openaiRequest(cfg, payload, { stream: false, maxTokens: 5 });
    if (!response.ok) return { ok: false, error: await providerErrorMessage(response) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Could not reach the provider (${err.message}).` };
  }
}

// Single entry point for every chat call in the app: own key → provider
// directly, otherwise the local server as before.
export function chatFetch(payload, headers, signal) {
  if (hasByok()) return byokChatResponse(payload, signal);
  return fetch("/api/chat", { method: "POST", headers, body: JSON.stringify(payload), signal });
}

function jsonResponse(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

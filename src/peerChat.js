// Reusable streaming client for the local AI proxy (/api/chat).
// Same SSE contract the chat view uses; lifted out so the coding tab and the
// practice generator can call the AI without going through the chat thread.
import { getSupabase } from "./supabase.js";

// AI is gated by auth + daily quota on the server: attach the session token
// and the timezone offset (quota resets at the LEARNER'S midnight).
export async function aiRequestHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "x-peer-tz-offset": String(new Date().getTimezoneOffset()),
  };
  try {
    const client = await getSupabase();
    const { data } = (await client?.auth.getSession()) || {};
    if (data?.session?.access_token) {
      headers.Authorization = `Bearer ${data.session.access_token}`;
    }
  } catch { /* signed out — server will answer 401 */ }
  return headers;
}

// Error carrying the server's entitlement payload (401 auth / 402 quota).
export class AiGateError extends Error {
  constructor(status, body) {
    super(body?.error || "The AI request failed.");
    this.status = status;
    this.code = body?.code || (status === 401 ? "auth_required" : status === 402 ? "quota_exhausted" : "error");
    this.details = body || {};
  }
}

export async function streamChat({ system, messages, onChunk, signal }) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: await aiRequestHeaders(),
    body: JSON.stringify({ system, messages }),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 402) throw new AiGateError(response.status, data);
    throw new Error(data.error || "The AI request failed.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
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
      try {
        const event = JSON.parse(raw);
        if (event.error) throw new Error(event.error);
        if (event.chunk) {
          content += event.chunk;
          onChunk?.(content);
        }
      } catch (err) {
        // ignore JSON parse hiccups on partial frames; rethrow real errors
        if (err.message && !/JSON|Unexpected/.test(err.message)) throw err;
      }
    }
  }
  onChunk?.(content);
  return content;
}

// Peer — production AI chat proxy (Supabase Edge Function, Deno).
// Mirrors server/handleChat.js's SSE protocol (`data: {"chunk": ...}` events)
// so the client works identically in dev and production. The Anthropic key
// stays server-side; callers must present a valid Supabase user JWT.
//
// Deploy:   supabase functions deploy chat --project-ref <ref>
// Secrets:  supabase secrets set ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=...
//
// Quota enforcement (daily free tokens, plan-based models) lands in M5 — the
// usage_events insert below is the metering hook it will build on.
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS: only the app's own origins (PEER_ALLOWED_ORIGINS, comma-separated)
// plus localhost for development — never *.
const ALLOWED_ORIGINS = (Deno.env.get("PEER_ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const ok = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || ALLOWED_ORIGINS.includes(origin);
  return {
    ...(ok && origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}
let CORS_HEADERS: Record<string, string> = {};

Deno.serve(async (req) => {
  CORS_HEADERS = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // ---- authN: only signed-in Peer users may burn AI tokens ----
  const authHeader = req.headers.get("Authorization") || "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData?.user) {
    return json(401, { error: "Sign in to use the AI tutor." });
  }
  const userId = userData.user.id;

  const payload = await req.json().catch(() => ({}));
  const system = String(payload.system || "");
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const imageDataUrls = Array.isArray(payload.imageDataUrls) ? payload.imageDataUrls : [];
  if (!system || messages.length === 0) {
    return json(400, { error: "Missing system prompt or messages." });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json(500, { error: "AI is not configured." });

  const anthropicMessages = messages.map((m: { role?: string; content?: string }, i: number) => {
    const isLastUser = m.role === "user" && i === messages.length - 1 && imageDataUrls.length > 0;
    if (isLastUser) {
      return {
        role: "user",
        content: [
          ...imageDataUrls.map(({ dataUrl }: { dataUrl: string }) => {
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

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      stream: true,
      // Prompt caching on the big system prompt cuts repeat-turn input cost.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: anthropicMessages,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const data = await upstream.json().catch(() => ({}));
    return json(upstream.status, { error: data?.error?.message || "Anthropic request failed." });
  }

  // service-role client for metering (RLS blocks clients from writing usage)
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let tokensIn = 0;
  let tokensOut = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
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
              if (event.type === "message_start") {
                tokensIn = event.message?.usage?.input_tokens || 0;
              }
              if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
                send({ chunk: event.delta.text });
              }
              if (event.type === "message_delta" && event.usage?.output_tokens) {
                tokensOut = event.usage.output_tokens;
              }
            } catch { /* partial upstream line */ }
          }
        }
        send({ done: true });
      } catch (error) {
        send({ error: (error as Error).message || "The AI request failed." });
      } finally {
        controller.close();
        // meter the call (server-side only; clients cannot write usage_events)
        await service.from("usage_events").insert({
          user_id: userId,
          kind: "chat",
          model: Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001",
          tokens_in: tokensIn,
          tokens_out: tokensOut,
        }).then(() => {}, () => {});
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
});

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

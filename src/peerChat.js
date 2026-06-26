// Reusable streaming client for the local AI proxy (/api/chat).
// Same SSE contract the chat view uses; lifted out so the coding tab and the
// practice generator can call the AI without going through the chat thread.
export async function streamChat({ system, messages, onChunk, signal }) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages }),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
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

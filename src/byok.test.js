import { test } from "node:test";
import assert from "node:assert/strict";

// Minimal browser shims for the module under test.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { setByok, clearByok, hasByok, byokChatResponse, chatFetch } = await import("./byok.js");

function sseBody(lines) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line + "\n"));
      controller.close();
    },
  });
}

async function readFramed(response) {
  const text = await response.text();
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l.replace(/^data: /, "")));
}

test("no key → 400 with byok_missing, never a 401 paywall", async () => {
  clearByok();
  const r = await byokChatResponse({ system: "s", messages: [{ role: "user", content: "hi" }] });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, "byok_missing");
});

test("anthropic stream is re-framed into the /api/chat contract", async () => {
  setByok({ provider: "anthropic", key: "sk-ant-test", model: "claude-haiku-4-5-20251001" });
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return new Response(sseBody([
      'data: {"type":"message_start","message":{"usage":{"input_tokens":3}}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}',
      "",
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}',
      'data: {"type":"message_stop"}',
    ]), { status: 200 });
  };
  const r = await chatFetch({ system: "sys", messages: [{ role: "user", content: "hi" }] }, {});
  assert.equal(r.status, 200);
  const events = await readFramed(r);
  assert.deepEqual(events, [{ chunk: "Hel" }, { chunk: "lo" }, { done: true }]);
  assert.equal(captured.url, "https://api.anthropic.com/v1/messages");
  assert.equal(captured.init.headers["anthropic-dangerous-direct-browser-access"], "true");
  const body = JSON.parse(captured.init.body);
  assert.equal(body.model, "claude-haiku-4-5-20251001");
  assert.equal(body.system[0].text, "sys");
});

test("openai stream is re-framed too, and [DONE] is ignored", async () => {
  setByok({ provider: "openai", key: "sk-test", model: "gpt-4.1-mini" });
  globalThis.fetch = async () => new Response(sseBody([
    'data: {"choices":[{"delta":{"role":"assistant"}}]}',
    'data: {"choices":[{"delta":{"content":"A"}}]}',
    'data: {"choices":[{"delta":{"content":"B"}}]}',
    "data: [DONE]",
  ]), { status: 200 });
  const events = await readFramed(await byokChatResponse({ system: "s", messages: [{ role: "user", content: "x" }] }));
  assert.deepEqual(events, [{ chunk: "A" }, { chunk: "B" }, { done: true }]);
});

test("a rejected key surfaces as a readable 400, not a 401", async () => {
  setByok({ provider: "anthropic", key: "sk-ant-bad", model: "claude-haiku-4-5-20251001" });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "invalid x-api-key" } }), { status: 401 });
  const r = await byokChatResponse({ system: "s", messages: [{ role: "user", content: "x" }] });
  assert.equal(r.status, 400);
  const data = await r.json();
  assert.equal(data.code, "byok_rejected");
  assert.match(data.error, /rejected/);
});

test("chatFetch falls back to /api/chat when no key is set", async () => {
  clearByok();
  assert.equal(hasByok(), false);
  let url;
  globalThis.fetch = async (u) => { url = u; return new Response("", { status: 200 }); };
  await chatFetch({ system: "s", messages: [] }, { "Content-Type": "application/json" });
  assert.equal(url, "/api/chat");
});

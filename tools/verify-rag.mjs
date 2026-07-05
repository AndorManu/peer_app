// Peer — live RAG verification: embed a document with a made-up fact, ask the
// tutor about it through the real chat proxy with retrieval on, and check the
// answer is grounded in (and cites) the learner's own material. Also proves
// chunk isolation: user B cannot match user A's chunks.
// Usage: PEER_DEV_URL=http://127.0.0.1:<port> node tools/verify-rag.mjs
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

loadDotEnv();
const DEV_URL = process.env.PEER_DEV_URL || "http://127.0.0.1:5173";
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const stamp = Date.now();
const password = `Peer-rag-${stamp}!`;
const { data: userA } = await admin.auth.admin.createUser({ email: `peer-rag-a-${stamp}@example.com`, password, email_confirm: true });
const { data: userB } = await admin.auth.admin.createUser({ email: `peer-rag-b-${stamp}@example.com`, password, email_confirm: true });

// A fact no model knows from training — only retrieval can supply it.
const MADE_UP_FACT = "The Verholt constant, named after fictional chemist Ada Verholt, equals exactly 42.7183 kilojoules per mole and governs the Verholt cascade in synthetic photosynthesis.";
const FILLER = Array.from({ length: 40 }, (_, i) => `Unrelated filler paragraph number ${i + 1} about general study habits, note-taking, and revision schedules to pad the document well past the retrieval threshold.`).join("\n\n");

try {
  const clientA = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const clientB = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: signInA } = await clientA.auth.signInWithPassword({ email: userA.user.email, password });
  const { data: signInB } = await clientB.auth.signInWithPassword({ email: userB.user.email, password });
  const headers = (token) => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "x-peer-tz-offset": String(new Date().getTimezoneOffset()),
  });

  // 1. embed a document containing the made-up fact
  const embedRes = await fetch(`${DEV_URL}/api/embed-doc`, {
    method: "POST",
    headers: headers(signInA.session.access_token),
    body: JSON.stringify({
      docId: "ragdoc1",
      projectId: "ragproj1",
      name: "verholt-notes.pdf",
      text: `${FILLER}\n\n${MADE_UP_FACT}\n\n${FILLER}`,
    }),
  });
  const embedData = await embedRes.json();
  check("document embedded into chunks", embedRes.status === 200 && embedData.chunks > 3, JSON.stringify(embedData));

  // 2. ask about the fact through the real chat proxy with retrieval on
  const chatRes = await fetch(`${DEV_URL}/api/chat`, {
    method: "POST",
    headers: headers(signInA.session.access_token),
    body: JSON.stringify({
      system: "You are Peer, a study tutor. Ground answers in the retrieved excerpts and cite document names in brackets. If the excerpts don't contain the answer, say so.",
      messages: [{ role: "user", content: "What is the value of the Verholt constant and who is it named after?" }],
      retrieval: { projectId: "ragproj1" },
    }),
  });
  check("retrieval-backed chat streams (200)", chatRes.status === 200);
  const raw = await chatRes.text();
  const answer = [...raw.matchAll(/data: (\{.*\})/g)].map((m) => { try { return JSON.parse(m[1]).chunk || ""; } catch { return ""; } }).join("");
  check("answer grounded in the learner's doc (42.7183)", answer.includes("42.7183"), answer.slice(0, 140));
  check("answer names Ada Verholt", /Ada Verholt/i.test(answer));
  check("answer cites the document", /verholt-notes/i.test(answer), /verholt-notes/i.test(answer) ? "cited" : "no citation found");

  // 3. isolation: B's retrieval finds nothing of A's
  const { data: bMatch } = await clientB.rpc("match_document_chunks", {
    query_embedding: Array(1024).fill(0.01),
    match_user: signInA.user.id, // B tries to target A's chunks
    match_count: 5,
  });
  check("B cannot match A's chunks via RPC (RLS)", (bMatch || []).length === 0, `${(bMatch || []).length} chunks leaked`);

  const { data: bOwn } = await clientB.from("document_chunks").select("id");
  check("B sees zero chunk rows directly", (bOwn || []).length === 0);

  // 4. removal path clears chunks
  await fetch(`${DEV_URL}/api/embed-doc`, {
    method: "POST",
    headers: headers(signInA.session.access_token),
    body: JSON.stringify({ docId: "ragdoc1", remove: true }),
  });
  const { data: after } = await admin.from("document_chunks").select("id").eq("user_id", signInA.user.id);
  check("deleting a doc removes its chunks", (after || []).length === 0);

  // 5. embedding usage was metered
  const { data: usage } = await admin.from("usage_events").select("kind, tokens_in").eq("user_id", signInA.user.id).eq("kind", "embedding");
  check("embedding usage metered", (usage || []).length >= 1 && usage[0].tokens_in > 0, JSON.stringify(usage?.[0]));
} finally {
  await admin.auth.admin.deleteUser(userA.user.id).catch(() => {});
  await admin.auth.admin.deleteUser(userB.user.id).catch(() => {});
  console.log("cleanup: RAG test users removed");
}

process.exit(failures ? 1 : 0);

function loadDotEnv() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && value && process.env[key] === undefined) process.env[key] = value;
  }
}

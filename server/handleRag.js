// Peer — document intelligence (M8): chunking, embeddings, semantic
// retrieval, and vision OCR. Embeddings run server-side (OpenAI
// text-embedding-3-small, multilingual, 1536 dims) so no provider key ever
// reaches the browser; chunk rows are written with the service role using the
// verified caller's user_id, and retrieval filters by that same user.
import { checkEntitlement, getServiceClient, recordUsage, resolveUser } from "./entitlements.js";

const EMBED_DIMENSIONS = 1024; // must match migration 0003 (vector(1024))
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;
const MAX_DOC_CHARS = 200_000;
const MAX_CHUNKS_PER_DOC = 120;

// ---- chunking: paragraph-friendly fixed windows with overlap ----
export function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const clean = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const chunks = [];
  let start = 0;
  while (start < clean.length && chunks.length < MAX_CHUNKS_PER_DOC) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      // prefer to break at a paragraph or sentence boundary near the end
      const window = clean.slice(start, end);
      const breakAt = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf("\n"));
      if (breakAt > size * 0.5) end = start + breakAt + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter(Boolean);
}

// Two supported providers, both normalized to 1024 dims:
//  • Voyage AI (VOYAGE_API_KEY) — voyage-3.5-lite, generous free tier
//  • OpenAI (OPENAI_API_KEY) — text-embedding-3-small with dimensions=1024
async function embedTexts(texts) {
  if (process.env.VOYAGE_API_KEY) {
    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "voyage-3.5-lite", input: texts, output_dimension: EMBED_DIMENSIONS }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.error?.message || "Voyage embedding request failed.");
    return {
      model: "voyage-3.5-lite",
      embeddings: data.data.map((item) => item.embedding),
      tokens: data.usage?.total_tokens || 0,
      costPerMtok: 0.02,
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw Object.assign(new Error("Embeddings are not configured (add VOYAGE_API_KEY or OPENAI_API_KEY)."), { status: 503 });
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts, dimensions: EMBED_DIMENSIONS }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Embedding request failed.");
  return {
    model: "text-embedding-3-small",
    embeddings: data.data.map((item) => item.embedding),
    tokens: data.usage?.total_tokens || 0,
    costPerMtok: 0.02,
  };
}

// ---- POST /api/embed-doc — chunk + embed one uploaded document ----
export async function handleEmbedDocRequest(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
  const user = await resolveUser(req.headers.authorization);
  if (!user) return sendJson(res, 401, { error: "Sign in first.", code: "auth_required" });

  const payload = await readJson(req, 2_000_000);
  const docId = String(payload.docId || "");
  const projectId = String(payload.projectId || "");
  const name = String(payload.name || "Document").slice(0, 200);
  const text = String(payload.text || "").slice(0, MAX_DOC_CHARS);
  if (!docId) return sendJson(res, 400, { error: "Missing docId." });

  const admin = getServiceClient();
  if (!admin) return sendJson(res, 503, { error: "Cloud is not configured." });

  // deletion path: a removed document takes its chunks with it
  if (payload.remove === true) {
    await admin.from("document_chunks").delete().eq("user_id", user.userId).eq("document_id", docId);
    return sendJson(res, 200, { removed: true });
  }
  if (!text.trim()) return sendJson(res, 400, { error: "Missing text." });

  try {
    // make sure the parent document row exists so retrieval can cite its name
    await admin.from("documents").upsert({
      user_id: user.userId,
      id: docId,
      project_id: projectId || "unknown",
      name,
      kind: String(payload.kind || "text"),
      chars: text.length,
      content: text.slice(0, 100_000),
    }, { onConflict: "user_id,id" });

    // re-embedding a doc replaces its chunks (idempotent ingestion)
    await admin.from("document_chunks").delete().eq("user_id", user.userId).eq("document_id", docId);

    const chunks = chunkText(text);
    if (!chunks.length) return sendJson(res, 200, { chunks: 0 });

    let totalTokens = 0;
    let embedModel = "embedding";
    let costPerMtok = 0.02;
    for (let i = 0; i < chunks.length; i += 64) {
      const batch = chunks.slice(i, i + 64);
      const { embeddings, tokens, model, costPerMtok: rate } = await embedTexts(batch);
      totalTokens += tokens;
      embedModel = model;
      costPerMtok = rate;
      const rows = batch.map((content, j) => ({
        user_id: user.userId,
        id: `${docId}:${i + j}`,
        document_id: docId,
        chunk_index: i + j,
        content,
        embedding: embeddings[j],
      }));
      const { error } = await admin.from("document_chunks").insert(rows);
      if (error) throw new Error(error.message);
    }

    await recordUsage({
      userId: user.userId,
      kind: "embedding",
      model: embedModel,
      tokensIn: totalTokens,
      costUsdOverride: (totalTokens * costPerMtok) / 1_000_000,
    });

    sendJson(res, 200, { chunks: chunks.length, tokens: totalTokens });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Embedding failed." });
  }
}

// ---- retrieval for the chat proxy: top chunks for a user's question ----
export async function retrieveContext({ userId, projectId, query, count = 6 }) {
  const admin = getServiceClient();
  if (!admin || !query?.trim()) return null;
  try {
    const { embeddings } = await embedTexts([query.slice(0, 2000)]);
    const { data, error } = await admin.rpc("match_document_chunks", {
      query_embedding: embeddings[0],
      match_user: userId,
      match_project: projectId || null,
      match_count: count,
    });
    if (error || !data?.length) return null;
    const relevant = data.filter((row) => row.similarity > 0.15);
    if (!relevant.length) return null;
    const excerpts = relevant
      .map((row) => `[${row.document_name} · part ${row.chunk_index + 1}]\n${row.content}`)
      .join("\n\n");
    return `

Relevant excerpts retrieved from the learner's own study materials (cite the document name in brackets when you use one; if the excerpts don't contain the answer, say so rather than inventing content):

${excerpts}`;
  } catch {
    return null; // retrieval is best-effort; the tutor still answers
  }
}

// ---- POST /api/ocr — extract text from an image via Claude vision ----
export async function handleOcrRequest(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
  const user = await resolveUser(req.headers.authorization);
  if (!user) return sendJson(res, 401, { error: "Sign in first.", code: "auth_required" });

  const entitlement = await checkEntitlement(user.userId, req.headers["x-peer-tz-offset"]);
  if (entitlement.exhausted) {
    return sendJson(res, 402, { error: "You're out of today's AI allowance.", code: "quota_exhausted", ...entitlement });
  }

  const payload = await readJson(req, 8_000_000);
  const dataUrl = String(payload.dataUrl || "");
  const [header, b64] = dataUrl.split(",");
  const mediaType = header?.match(/:(.*?);/)?.[1];
  if (!b64 || !/^image\//.test(mediaType || "")) return sendJson(res, 400, { error: "Send an image data URL." });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 3000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
            { type: "text", text: "Transcribe ALL text visible in this image, in reading order, in its original language. Preserve structure (headings, lists, tables as markdown). Output only the transcription — no commentary. If there is no text, output exactly: (no text found)" },
          ],
        }],
      }),
    });
    const data = await response.json();
    if (!response.ok) return sendJson(res, response.status, { error: data.error?.message || "OCR failed." });

    const text = (data.content || []).map((block) => block.text || "").join("").trim();
    await recordUsage({
      userId: user.userId,
      kind: "ocr",
      model: "claude-haiku-4-5-20251001",
      tokensIn: data.usage?.input_tokens || 0,
      tokensOut: data.usage?.output_tokens || 0,
    });
    sendJson(res, 200, { text: text === "(no text found)" ? "" : text });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "OCR failed." });
  }
}

function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(Object.assign(new Error("Request too large."), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

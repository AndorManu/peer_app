import { extractPdfText } from "./pdf.js";

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "json",
  "js",
  "jsx",
  "ts",
  "tsx",
  "html",
  "css",
  "c",
  "h",
  "cpp",
  "hpp",
  "py",
  "java",
  "rs",
  "go",
  "sh",
]);

export async function extractStudyMaterial(file) {
  const extension = getExtension(file.name);

  if (file.type === "application/pdf" || extension === "pdf") {
    const extracted = await extractPdfText(file);
    return {
      kind: "pdf",
      pages: extracted.pages,
      text: extracted.text,
      chars: extracted.chars,
      previewUrl: null,
      note: "",
    };
  }

  if (file.type.startsWith("text/") || TEXT_EXTENSIONS.has(extension)) {
    const text = await file.text();
    return {
      kind: "text",
      pages: 0,
      text,
      chars: text.length,
      previewUrl: null,
      note: "",
    };
  }

  if (file.type.startsWith("image/")) {
    const previewUrl = await readAsDataUrl(file);
    return {
      kind: "image",
      pages: 0,
      text: `[Image: ${file.name}]`,
      chars: 0,
      previewUrl,
      note: "",
    };
  }

  throw new Error(`Unsupported file type: ${file.name}`);
}

function getExtension(name) {
  return name.includes(".") ? name.split(".").pop().toLowerCase() : "";
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

// Private Storage bucket for image-doc previews (see supabase/migrations/0008).
// Objects live at `<user_id>/<doc_id>` so RLS can scope every operation to
// the owning user.
export const DOC_PREVIEW_BUCKET = "doc-previews";

// Decode a base64 data: URL into a Blob without a network round trip —
// fetching a data: URL is subject to CSP connect-src, which does not (and
// should not) allowlist data:, so `fetch(dataUrl)` silently fails in-browser.
export function dataUrlToBlob(dataUrl) {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Malformed data URL.");
  const [, mimeType, isBase64, payload] = match;
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
}

// Upload an image doc's local data-URL preview to Storage at attach time so
// other devices can eventually hydrate it (part B). Throws on failure — the
// caller decides how to surface that non-fatally.
export async function uploadDocPreview(client, userId, docId, dataUrl) {
  if (!client || !userId || !docId || !dataUrl) return null;
  const blob = dataUrlToBlob(dataUrl);
  const path = `${userId}/${docId}`;
  const { error } = await client.storage.from(DOC_PREVIEW_BUCKET).upload(path, blob, {
    contentType: blob.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

// Best-effort removal of a doc's preview object — orphaned objects are
// harmless, so callers may swallow the error.
export async function deleteDocPreview(client, previewPath) {
  if (!client || !previewPath) return;
  const { error } = await client.storage.from(DOC_PREVIEW_BUCKET).remove([previewPath]);
  if (error) throw error;
}

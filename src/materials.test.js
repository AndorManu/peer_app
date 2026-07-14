import { test } from "node:test";
import assert from "node:assert/strict";

import { DOC_PREVIEW_BUCKET, dataUrlToBlob, deleteDocPreview, uploadDocPreview } from "./materials.js";

// Fake Supabase Storage client — records what would have hit the network so
// these guard clauses / path-construction rules (which storage RLS depends
// on) are covered without needing a live project.
function makeFakeClient({ uploadError = null, removeError = null } = {}) {
  const calls = { uploadPaths: [], uploadOptions: [], removePaths: [] };
  return {
    calls,
    storage: {
      from(bucket) {
        assert.equal(bucket, DOC_PREVIEW_BUCKET, "must operate on the doc-previews bucket");
        return {
          async upload(path, blob, options) {
            calls.uploadPaths.push(path);
            calls.uploadOptions.push(options);
            return { data: uploadError ? null : { path }, error: uploadError };
          },
          async remove(paths) {
            calls.removePaths.push(...paths);
            return { data: removeError ? null : paths.map((p) => ({ name: p })), error: removeError };
          },
        };
      },
    },
  };
}

test("dataUrlToBlob decodes base64 payload without going through fetch (data: is not in CSP connect-src)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("must not fetch() a data: URL — blocked by CSP connect-src in a real browser");
  };
  try {
    const blob = dataUrlToBlob("data:image/png;base64,SGVsbG8=");
    assert.equal(blob.type, "image/png");
    const text = await blob.text();
    assert.equal(text, "Hello");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uploadDocPreview uploads to <user_id>/<doc_id> — the path RLS scopes on", async () => {
  const client = makeFakeClient();
  const path = await uploadDocPreview(client, "user-1", "doc-1", "data:image/png;base64,AAAA");
  assert.equal(path, "user-1/doc-1");
  assert.deepEqual(client.calls.uploadPaths, ["user-1/doc-1"]);
  assert.equal(client.calls.uploadOptions[0].upsert, false, "must not silently overwrite an existing preview");
});

test("uploadDocPreview returns null without hitting the network when inputs are missing", async () => {
  const client = makeFakeClient();
  assert.equal(await uploadDocPreview(null, "user-1", "doc-1", "data:image/png;base64,AAAA"), null);
  assert.equal(await uploadDocPreview(client, "", "doc-1", "data:image/png;base64,AAAA"), null);
  assert.equal(await uploadDocPreview(client, "user-1", "", "data:image/png;base64,AAAA"), null);
  assert.equal(await uploadDocPreview(client, "user-1", "doc-1", ""), null);
  assert.deepEqual(client.calls.uploadPaths, [], "no network call for missing inputs");
});

test("uploadDocPreview throws on Storage error so the caller can surface a non-fatal toast", async () => {
  const client = makeFakeClient({ uploadError: new Error("size limit exceeded") });
  await assert.rejects(
    () => uploadDocPreview(client, "user-1", "doc-1", "data:image/png;base64,AAAA"),
    /size limit exceeded/,
  );
});

test("deleteDocPreview removes the exact stored path", async () => {
  const client = makeFakeClient();
  await deleteDocPreview(client, "user-1/doc-1");
  assert.deepEqual(client.calls.removePaths, ["user-1/doc-1"]);
});

test("deleteDocPreview is a no-op without a client or path (best-effort cleanup callers rely on this)", async () => {
  const client = makeFakeClient();
  await deleteDocPreview(null, "user-1/doc-1");
  await deleteDocPreview(client, "");
  assert.deepEqual(client.calls.removePaths, []);
});

test("deleteDocPreview throws on Storage error so callers choosing to surface it still can", async () => {
  const client = makeFakeClient({ removeError: new Error("network down") });
  await assert.rejects(() => deleteDocPreview(client, "user-1/doc-1"), /network down/);
});

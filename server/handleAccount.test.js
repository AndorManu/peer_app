import { test } from "node:test";
import assert from "node:assert/strict";

import { purgeDocPreviews } from "./handleAccount.js";

// Fake service-role Storage client — records list()/remove() calls so
// purgeDocPreviews' pagination (offset advances by the folder entries left
// behind in each page, not the full page size) is covered without needing
// a live Supabase project. Page entries are either
// a plain string (a real, removable object — gets a fake non-null id, like
// a real Storage object) or `{ name, folder: true }` (a virtual sub-prefix
// entry — id: null, mirroring what list() returns for a folder, which
// remove() silently no-ops on).
function makeFakeAdmin({ pages, listError = null, removeError = null } = {}) {
  const calls = { listPaths: [], listOptions: [], removePaths: [] };
  let call = 0;
  return {
    calls,
    storage: {
      from(bucket) {
        assert.equal(bucket, "doc-previews", "must operate on the doc-previews bucket");
        return {
          async list(path, options) {
            calls.listPaths.push(path);
            calls.listOptions.push(options);
            if (listError && call === 0) return { data: null, error: listError };
            const page = pages[Math.min(call, pages.length - 1)] || [];
            call += 1;
            return {
              data: page.map((entry) => (
                typeof entry === "string"
                  ? { name: entry, id: `id-${entry}` }
                  : { name: entry.name, id: entry.folder ? null : `id-${entry.name}` }
              )),
              error: null,
            };
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

test("purgeDocPreviews is a no-op on an already-empty folder (guest/never-uploaded account)", async () => {
  const admin = makeFakeAdmin({ pages: [[]] });
  await purgeDocPreviews(admin, "user-1");
  assert.deepEqual(admin.calls.removePaths, [], "nothing to remove — must not call remove() at all");
  assert.equal(admin.calls.listPaths.length, 1, "must list exactly once before giving up");
});

test("purgeDocPreviews removes a single partial page and stops (no unnecessary re-list)", async () => {
  const admin = makeFakeAdmin({ pages: [["a.png", "b.png"]] });
  await purgeDocPreviews(admin, "user-1");
  assert.deepEqual(admin.calls.removePaths, ["user-1/a.png", "user-1/b.png"]);
  assert.equal(admin.calls.listPaths.length, 1, "a page shorter than the page size means no more objects remain");
});

test("purgeDocPreviews paginates across a full page boundary (>100 objects)", async () => {
  const page1 = Array.from({ length: 100 }, (_, i) => `seed-${i}.png`);
  const page2 = ["seed-100.png", "seed-101.png"];
  const admin = makeFakeAdmin({ pages: [page1, page2, []] });
  await purgeDocPreviews(admin, "user-1");
  assert.equal(admin.calls.listPaths.length, 2, "a full page must trigger a re-list to check for more");
  assert.equal(admin.calls.removePaths.length, 102, "every object across both pages must be removed");
  assert.ok(admin.calls.removePaths.includes("user-1/seed-0.png"));
  assert.ok(admin.calls.removePaths.includes("user-1/seed-101.png"));
});

test("purgeDocPreviews scopes every removed path under the given user_id, never a foreign prefix", async () => {
  const admin = makeFakeAdmin({ pages: [["a.png"]] });
  await purgeDocPreviews(admin, "user-1");
  assert.deepEqual(admin.calls.listPaths, ["user-1"], "must list only the caller's own folder");
  assert.ok(admin.calls.removePaths.every((p) => p.startsWith("user-1/")));
});

test("purgeDocPreviews throws on a list() error so the caller's try/catch can log and continue (non-fatal to account deletion)", async () => {
  const admin = makeFakeAdmin({ pages: [["a.png"]], listError: new Error("network down") });
  await assert.rejects(() => purgeDocPreviews(admin, "user-1"), /network down/);
  assert.deepEqual(admin.calls.removePaths, [], "must not attempt removal after a failed list");
});

test("purgeDocPreviews throws on a remove() error so the caller's try/catch can log and continue (non-fatal to account deletion)", async () => {
  const admin = makeFakeAdmin({ pages: [["a.png"]], removeError: new Error("permission denied") });
  await assert.rejects(() => purgeDocPreviews(admin, "user-1"), /permission denied/);
});

test("purgeDocPreviews excludes virtual folder entries (id: null) from remove(), only real objects", async () => {
  const page = ["a.png", { name: "nested-sub-prefix", folder: true }, "b.png"];
  const admin = makeFakeAdmin({ pages: [page] });
  await purgeDocPreviews(admin, "user-1");
  assert.deepEqual(admin.calls.removePaths, ["user-1/a.png", "user-1/b.png"], "folder entries must never be passed to remove()");
});

test("purgeDocPreviews advances past a page dominated by virtual folder entries and still finds + removes real objects further down the list (regression: an attacker can name sub-prefixes to sort alphabetically before a victim's real objects)", async () => {
  const folderPage = Array.from({ length: 100 }, (_, i) => ({ name: `0-folder-${i}`, folder: true }));
  const realPage = ["z-real-1.png", "z-real-2.png"];
  const admin = makeFakeAdmin({ pages: [folderPage, realPage] });
  await purgeDocPreviews(admin, "user-1");
  assert.deepEqual(
    admin.calls.removePaths,
    ["user-1/z-real-1.png", "user-1/z-real-2.png"],
    "real objects past an all-folder page 1 must still be found and removed, not silently orphaned"
  );
  assert.equal(admin.calls.listPaths.length, 2, "must issue a second list() call instead of stopping after an all-folder page 1");
  assert.deepEqual(
    admin.calls.listOptions.map((o) => o.offset),
    [0, 100],
    "offset must advance by the folder count left behind in page 1"
  );
});

test("purgeDocPreviews advances the offset by only the folders left behind, not the full page size, on a mixed page", async () => {
  const mixedPage = [
    ...Array.from({ length: 30 }, (_, i) => ({ name: `a-folder-${i}`, folder: true })),
    ...Array.from({ length: 70 }, (_, i) => `b-real-${i}.png`),
  ];
  const admin = makeFakeAdmin({ pages: [mixedPage, []] });
  await purgeDocPreviews(admin, "user-1");
  assert.equal(admin.calls.removePaths.length, 70, "every real object in the mixed page must be removed");
  assert.deepEqual(
    admin.calls.listOptions.map((o) => o.offset),
    [0, 30],
    "offset for the next page must skip only the surviving folder entries, not the removed real ones"
  );
});

test("purgeDocPreviews terminates via the maxPages backstop instead of looping forever on an endless run of full folder-only pages", async () => {
  // A user can legally nest objects under their own sub-prefixes (RLS only
  // pins the first path segment), so a full page can be 100% virtual folder
  // entries with zero removable objects — remove() would silently no-op on
  // all of them and the page would never shrink if not filtered up front.
  // Since folders are never removed, offset keeps advancing by a full page
  // each pass, so the only thing that stops an adversarial endless run of
  // folder-only pages is the hard maxPages cap.
  const folderPage = Array.from({ length: 100 }, (_, i) => ({ name: `sub-${i}`, folder: true }));
  const admin = makeFakeAdmin({ pages: [folderPage] });
  await purgeDocPreviews(admin, "user-1");
  assert.deepEqual(admin.calls.removePaths, [], "no real objects to remove");
  assert.equal(admin.calls.listPaths.length, 1000, "must stop at the hard maxPages cap, not spin forever");
});

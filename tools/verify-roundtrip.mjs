// Peer — live two-device sync round-trip against the Supabase project.
// Runs the app's REAL sync engine (src/sync.js) as two "devices" sharing one
// account: device A pushes a full local state, device B bootstraps from the
// cloud, edits + deletes, and A picks the changes up. Cleans up afterwards.
// Usage: node tools/verify-roundtrip.mjs
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { runSyncCycle } from "../src/sync.js";
import { getDocPreviewUrl, deleteDocPreview } from "../src/materials.js";
import { purgeDocPreviews } from "../server/handleAccount.js";

loadDotEnv();

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

// a "device": local state + sync meta + the app's applyState contract
function makeDevice(client, userId, initialState) {
  const device = {
    state: initialState,
    meta: {},
    async sync() {
      const result = await runSyncCycle({
        client,
        userId,
        getState: () => device.state,
        applyState: (updater) => { device.state = updater(device.state); },
        meta: device.meta,
      });
      device.meta = result.meta;
      return result;
    },
  };
  return device;
}

const emptyState = () => ({
  theme: "dark", fontId: "inter", textSize: 15, activeMode: "auto", onboardingComplete: false,
  profile: {}, projects: [], chats: [], notes: [], flashcards: [], tombstones: [],
});

const fullState = () => ({
  ...emptyState(),
  onboardingComplete: true,
  profile: { subject: "Spanish", goal: "B2 exam", signals: { understood: 3 }, preferences: {}, traits: {} },
  projects: [{
    id: "proj1", name: "Spanish B2", domainId: "language", color: "#34d399",
    mastery: { concepts: [{ id: "k1", key: "subjunctive", label: "Subjunctive", confidence: 0.4, status: "learning" }], misconceptions: [], reflections: [], updatedAt: Date.now() },
    docs: [{ id: "doc1", name: "verbs.md", kind: "text", pages: 0, chars: 24, text: "ser estar tener haber ir", previewUrl: null, note: "", addedAt: Date.now() }],
  }],
  chats: [{
    id: "chat1", name: "Subjunctive triggers", projectId: "proj1", createdAt: Date.now(),
    messages: [
      { id: "msg1", role: "user", content: "When do I use the subjunctive?", attachments: [], createdAt: Date.now() },
      { id: "msg2", role: "assistant", content: "After expressions of doubt, desire...", createdAt: Date.now() + 1 },
    ],
  }],
  notes: [{ id: "note1", projectId: "proj1", chatId: "chat1", title: "WEIRDO triggers", tags: ["subjunctive"], content: "Wishes, Emotions, Impersonal...", shared: false, createdAt: Date.now() }],
  flashcards: [{
    id: "deck1", projectId: "proj1", chatId: "chat1", chatName: "Subjunctive deck", createdAt: Date.now(),
    cards: [{ id: "card1", question: "ojalá + ?", answer: "subjuntivo", ease: 2.5, reps: 2, interval: 3, dueAt: Date.now() }],
  }],
});

const stamp = Date.now();
const email = `peer-roundtrip-${stamp}@example.com`;
const password = `Peer-roundtrip-${stamp}!`;
const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (createError) {
  console.error("could not create test user:", createError.message);
  process.exit(1);
}
const userId = created.user.id;

// part B: image doc round trip needs a real object in the doc-previews
// bucket so createSignedUrl has something to sign against.
const previewPath = `${userId}/roundtrip-preview.png`;
const onePxPng = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108020000009077053d0000000a4944415478da6360000002000155a2731b0000000049454e44ae426082",
  "hex",
);

// RLS regression fixture: a real object under a prefix the test user does
// NOT own, so the RLS + traversal probes below have something concrete to
// probe against instead of relying on a path that merely fails validation.
const foreignUserId = randomUUID();
const foreignPreviewPath = `${foreignUserId}/roundtrip-preview-foreign.png`;

// Storage orphan cleanup probe: a scratch user folder seeded beyond one
// list() page to prove purgeDocPreviews' pagination handling.
const purgeUserId = randomUUID();

// Storage orphan cleanup probe: a scratch user folder where list() page 1
// (limit 100) is dominated by virtual sub-prefix (folder, id: null)
// entries — reproduces the RLS-legal-but-unremovable-folder-entry case
// (RLS only pins the first path segment, so a user can legally nest
// objects under their own sub-prefixes) that once made purgeDocPreviews
// loop forever, and — once "fixed" to stop on an all-folder page instead
// of hanging — silently returned "done" without ever discovering real
// objects sorted alphabetically AFTER the folder-dominated page 1. The
// folder names below sort lexically before the real object names on
// purpose, mirroring how an attacker could name sub-prefixes to bury
// their own real objects past page 1.
const purgeFolderUserId = randomUUID();
const purgeFolderCount = 105;
const purgeFolderRealNames = ["zz-real-0.png", "zz-real-1.png", "zz-real-2.png"];

try {
  const clientA = createClient(url, anonKey, { auth: { persistSession: false } });
  const clientB = createClient(url, anonKey, { auth: { persistSession: false } });
  await clientA.auth.signInWithPassword({ email, password });
  await clientB.auth.signInWithPassword({ email, password });

  const { error: uploadError } = await admin.storage
    .from("doc-previews")
    .upload(previewPath, onePxPng, { contentType: "image/png", upsert: true });
  check("test fixture: preview image uploaded to Storage", !uploadError, uploadError?.message);

  const { error: foreignUploadError } = await admin.storage
    .from("doc-previews")
    .upload(foreignPreviewPath, onePxPng, { contentType: "image/png", upsert: true });
  check("test fixture: foreign-owned preview image uploaded to Storage", !foreignUploadError, foreignUploadError?.message);

  // Device A pushes a full local life, including an image doc with a
  // preview_path (its data-URL never leaves the device — only the path syncs)
  const stateA = fullState();
  stateA.projects[0].docs.push({
    id: "doc-preview-test", name: "photo.png", kind: "image", pages: 0, chars: 0,
    text: "[Image: photo.png]", previewUrl: null, previewPath, note: "", addedAt: Date.now(),
  });
  const deviceA = makeDevice(clientA, userId, stateA);
  const first = await deviceA.sync();
  check("device A pushes its local state", first.pushed >= 8, `${first.pushed} rows`);

  // Device B starts empty and bootstraps everything from the cloud
  const deviceB = makeDevice(clientB, userId, emptyState());
  const bootstrap = await deviceB.sync();
  check("device B pulls the full state", bootstrap.pulled >= 8, `${bootstrap.pulled} rows`);
  check("subject round-tripped", deviceB.state.projects[0]?.name === "Spanish B2" && deviceB.state.projects[0]?.domainId === "language");
  check("document text round-tripped", deviceB.state.projects[0]?.docs.find((doc) => doc.id === "doc1")?.text === "ser estar tener haber ir");
  check("chat + messages round-tripped", deviceB.state.chats[0]?.messages?.length === 2);
  check("note round-tripped", deviceB.state.notes[0]?.title === "WEIRDO triggers");
  check("card SRS state round-tripped", deviceB.state.flashcards[0]?.cards[0]?.reps === 2);
  check("profile round-tripped", deviceB.state.profile?.subject === "Spanish");

  // Part B: image doc preview_path pulled onto a fresh device (no local
  // data-URL) — should carry the path but stay unhydrated until a signed
  // URL is minted on demand, and never resolve for another user's path.
  const pulledImageDoc = deviceB.state.projects[0]?.docs.find((doc) => doc.id === "doc-preview-test");
  check("image doc preview_path round-tripped", pulledImageDoc?.previewPath === previewPath);
  check("image doc previewUrl stays null after pull (blank until hydrated)", pulledImageDoc?.previewUrl == null);
  const signedUrl = await getDocPreviewUrl(clientB, userId, previewPath);
  check("signed URL obtainable for the owner-prefixed path", typeof signedUrl === "string" && signedUrl.length > 0);
  const foreignRefused = await getDocPreviewUrl(clientB, userId, `not-${userId}/roundtrip-preview.png`);
  check("signed URL refused for a foreign-prefixed path", foreignRefused === null);

  // Guard-level traversal probe: a smuggled path that starts with the
  // caller's own prefix (passes the `${userId}/` check) but escapes it via
  // `..` to reach a foreign object — exercises the new `..`/`//` rejection.
  const smuggledForeignPath = `${userId}/../${foreignPreviewPath}`;
  const smuggledRefused = await getDocPreviewUrl(clientB, userId, smuggledForeignPath);
  check("signed URL refused for a path-traversal-smuggled foreign path", smuggledRefused === null);

  // Direct RLS regression probe: bypass getDocPreviewUrl entirely and call
  // Storage straight — this proves migration 0008's RLS itself fails closed,
  // independent of any client-side guard.
  const { data: rlsProbeData, error: rlsProbeError } = await clientB.storage
    .from("doc-previews")
    .createSignedUrl(foreignPreviewPath, 300);
  check(
    "RLS refuses a signed URL for a foreign object (direct client call, guard bypassed)",
    !!rlsProbeError || !rlsProbeData?.signedUrl,
    rlsProbeError?.message,
  );

  // Storage orphan cleanup — deleteProject path: prove the exact primitive
  // src/App.jsx's removeDocPreview wraps (deleteDocPreview) really removes a
  // live object, which is what deleteProject now calls per doc on delete.
  const projectDeleteTestPath = `${userId}/project-delete-test.png`;
  const { error: projectDeleteUploadError } = await admin.storage
    .from("doc-previews")
    .upload(projectDeleteTestPath, onePxPng, { contentType: "image/png", upsert: true });
  check("test fixture: project-delete preview uploaded", !projectDeleteUploadError, projectDeleteUploadError?.message);
  await deleteDocPreview(clientA, projectDeleteTestPath);
  const { data: afterProjectDelete } = await admin.storage.from("doc-previews").list(userId, { search: "project-delete-test.png" });
  check(
    "deleteProject's Storage cleanup (deleteDocPreview) removes the preview object",
    !afterProjectDelete?.some((entry) => entry.name === "project-delete-test.png"),
  );

  // Storage orphan cleanup — account deletion path: prove purgeDocPreviews
  // (shared logic with supabase/functions/delete-account/index.ts) empties a
  // whole doc-previews/<user_id>/ folder, including beyond a single list()
  // page (purgeDocPreviews pages at 100).
  const purgeObjectCount = 130;
  const seedResults = await Promise.all(
    Array.from({ length: purgeObjectCount }, (_, i) => admin.storage
      .from("doc-previews")
      .upload(`${purgeUserId}/seed-${i}.png`, onePxPng, { contentType: "image/png", upsert: true })),
  );
  check("test fixture: purge-seed objects uploaded", seedResults.every((r) => !r.error), seedResults.find((r) => r.error)?.error?.message);
  const { data: beforePurge } = await admin.storage.from("doc-previews").list(purgeUserId, { limit: 1000 });
  check("test fixture: purge folder seeded beyond one list() page", (beforePurge?.length || 0) > 100, `${beforePurge?.length} objects`);
  await purgeDocPreviews(admin, purgeUserId);
  const { data: afterPurge } = await admin.storage.from("doc-previews").list(purgeUserId, { limit: 1000 });
  check(
    "purgeDocPreviews (account deletion) empties a doc-previews/<user_id>/ folder beyond one list() page",
    (afterPurge?.length || 0) === 0,
    `${afterPurge?.length} objects remain`,
  );

  // Storage orphan cleanup — virtual-folder pagination regression: seed
  // enough distinct sub-prefixes that the first list() page (limit 100) is
  // filled entirely with folder entries (id: null, no removable object at
  // that exact name), PLUS a handful of real top-level objects that sort
  // alphabetically after all of them. The buggy loop kept re-listing an
  // unshrinking, unremovable page forever; a naive fix that just stops on
  // an all-folder page returns early WITHOUT ever finding the real objects
  // past page 1. The fix must both terminate quickly AND actually remove
  // those real objects.
  const folderSeedResults = await Promise.all(
    Array.from({ length: purgeFolderCount }, (_, i) => admin.storage
      .from("doc-previews")
      .upload(`${purgeFolderUserId}/0-folder-${String(i).padStart(3, "0")}/leaf.png`, onePxPng, { contentType: "image/png", upsert: true })),
  );
  check("test fixture: folder-only purge-seed objects uploaded", folderSeedResults.every((r) => !r.error), folderSeedResults.find((r) => r.error)?.error?.message);
  const folderRealSeedResults = await Promise.all(
    purgeFolderRealNames.map((name) => admin.storage
      .from("doc-previews")
      .upload(`${purgeFolderUserId}/${name}`, onePxPng, { contentType: "image/png", upsert: true })),
  );
  check(
    "test fixture: real objects seeded to sort AFTER the folder-dominated page 1",
    folderRealSeedResults.every((r) => !r.error),
    folderRealSeedResults.find((r) => r.error)?.error?.message,
  );
  const { data: beforeFolderPurge } = await admin.storage.from("doc-previews").list(purgeFolderUserId, { limit: purgeFolderCount + purgeFolderRealNames.length + 10 });
  check(
    "test fixture: folder-only purge folder has more sub-prefixes than one list() page",
    (beforeFolderPurge?.length || 0) > 100,
    `${beforeFolderPurge?.length} entries`,
  );
  const { data: page1Composition } = await admin.storage.from("doc-previews").list(purgeFolderUserId, { limit: 100 });
  check(
    "test fixture: list() page 1 (limit 100) is entirely virtual folder entries, real objects pushed past it",
    (page1Composition?.length || 0) === 100 && page1Composition.every((entry) => entry.id == null),
    `${page1Composition?.filter((e) => e.id != null).length || 0} real entries leaked into page 1`,
  );
  const purgeFolderTimeoutMs = 15000;
  const folderPurgeResult = await Promise.race([
    purgeDocPreviews(admin, purgeFolderUserId).then(() => "done"),
    new Promise((resolve) => setTimeout(() => resolve("timeout"), purgeFolderTimeoutMs)),
  ]);
  check(
    "purgeDocPreviews terminates on a page 1 dominated by virtual folder entries",
    folderPurgeResult === "done",
    folderPurgeResult === "timeout" ? `did not return within ${purgeFolderTimeoutMs}ms` : "",
  );
  const { data: afterFolderPurge } = await admin.storage
    .from("doc-previews")
    .list(purgeFolderUserId, { limit: purgeFolderRealNames.length + 5, search: "zz-real-" });
  check(
    "purgeDocPreviews actually removes real objects sorted AFTER a folder-dominated page 1 (regression: must advance past page 1, not just return early)",
    (afterFolderPurge?.length || 0) === 0,
    `${afterFolderPurge?.length} real object(s) survived: ${afterFolderPurge?.map((e) => e.name).join(", ")}`,
  );

  // Device B edits a note and deletes the deck (tombstone)
  deviceB.state = {
    ...deviceB.state,
    notes: deviceB.state.notes.map((note) => (note.id === "note1" ? { ...note, content: "EDITED ON DEVICE B" } : note)),
    flashcards: [],
    tombstones: [
      { table: "decks", id: "deck1", at: Date.now() },
      { table: "cards", id: "card1", parentId: "deck1", at: Date.now() },
    ],
  };
  await deviceB.sync();
  check("device B tombstones cleared after push", deviceB.state.tombstones.length === 0);

  // Device A picks both up on its next cycle
  await deviceA.sync();
  check("A sees B's note edit", deviceA.state.notes[0]?.content === "EDITED ON DEVICE B");
  check("A sees B's deck deletion", deviceA.state.flashcards.length === 0);

  // Offline-style reconcile: A edits while "offline", then syncs
  deviceA.state = {
    ...deviceA.state,
    chats: deviceA.state.chats.map((chat) => (chat.id === "chat1" ? { ...chat, name: "Renamed offline on A" } : chat)),
  };
  await deviceA.sync();
  await deviceB.sync();
  check("offline edit reconciles to the other device", deviceB.state.chats[0]?.name === "Renamed offline on A");
} finally {
  await admin.storage.from("doc-previews").remove([previewPath]).catch(() => {});
  await admin.storage.from("doc-previews").remove([foreignPreviewPath]).catch(() => {});
  await admin.storage.from("doc-previews").remove([`${userId}/project-delete-test.png`]).catch(() => {});
  await purgeDocPreviews(admin, purgeUserId).catch(() => {});
  await admin.storage.from("doc-previews")
    .remove(Array.from({ length: purgeFolderCount }, (_, i) => `${purgeFolderUserId}/0-folder-${String(i).padStart(3, "0")}/leaf.png`))
    .catch(() => {});
  await admin.storage.from("doc-previews")
    .remove(purgeFolderRealNames.map((name) => `${purgeFolderUserId}/${name}`))
    .catch(() => {});
  await admin.auth.admin.deleteUser(userId).catch(() => {});
  console.log("cleanup: test user + preview objects removed");
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

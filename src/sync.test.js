import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyPull,
  clearTombstones,
  computeSnapshot,
  diffAgainstSnapshot,
  hashRow,
  stateToRows,
  tombstoneRows,
} from "./sync.js";

const USER = "00000000-0000-0000-0000-000000000001";

function makeLocalState() {
  return {
    theme: "dark",
    fontId: "inter",
    textSize: 15,
    activeMode: "auto",
    onboardingComplete: true,
    profile: { subject: "Chemistry", goal: "Pass finals", signals: {}, preferences: {}, traits: {} },
    projects: [{
      id: "p1", name: "Organic Chemistry", domainId: "science", color: "#22d3ee",
      mastery: { concepts: [], misconceptions: [], reflections: [], updatedAt: 100 },
      docs: [{ id: "d1", name: "notes.pdf", kind: "pdf", pages: 3, chars: 900, text: "SN2 mechanisms...", previewUrl: null, note: "", addedAt: 50 }],
    }],
    chats: [{
      id: "c1", name: "SN2 help", projectId: "p1", createdAt: 10,
      messages: [
        { id: "m1", role: "user", content: "What is SN2?", displayContent: "What is SN2?", attachments: [], createdAt: 11 },
        { id: "m2", role: "assistant", content: "A backside attack...", createdAt: 12 },
      ],
    }],
    notes: [{ id: "n1", projectId: "p1", chatId: "c1", title: "SN2", category: null, source: null, tags: ["mechanism"], content: "inversion of configuration", shared: false, createdAt: 20 }],
    flashcards: [{
      id: "f1", projectId: "p1", chatId: "c1", chatName: "SN2 deck", createdAt: 30,
      cards: [{ id: "card1", question: "SN2 stereo outcome?", answer: "Inversion", ease: 2.5, reps: 1, interval: 1, dueAt: 999 }],
    }],
    tombstones: [],
  };
}

test("stateToRows flattens every syncable entity with user_id", () => {
  const rows = stateToRows(makeLocalState(), USER);
  assert.equal(rows.projects.length, 1);
  assert.equal(rows.documents.length, 1);
  assert.equal(rows.chats.length, 1);
  assert.equal(rows.messages.length, 2);
  assert.equal(rows.notes.length, 1);
  assert.equal(rows.decks.length, 1);
  assert.equal(rows.cards.length, 1);
  assert.equal(rows.profiles.length, 1);
  for (const tableRows of Object.values(rows)) {
    for (const row of tableRows) assert.equal(row.user_id, USER);
  }
  // card SRS state travels in the srs blob
  assert.equal(rows.cards[0].srs.reps, 1);
  assert.equal(rows.cards[0].srs.dueAt, 999);
});

test("streaming messages are never pushed", () => {
  const state = makeLocalState();
  state.chats[0].messages.push({ id: "m3", role: "assistant", content: "half an ans", streaming: true, createdAt: 13 });
  const rows = stateToRows(state, USER);
  assert.ok(!rows.messages.some((row) => row.id === "m3"));
});

test("diffAgainstSnapshot pushes only changed rows", () => {
  const state = makeLocalState();
  const rows = stateToRows(state, USER);
  const snapshot = computeSnapshot(rows);
  assert.deepEqual(diffAgainstSnapshot(rows, snapshot), {}, "nothing dirty after snapshot");

  state.notes[0] = { ...state.notes[0], content: "UPDATED" };
  const changed = diffAgainstSnapshot(stateToRows(state, USER), snapshot);
  assert.deepEqual(Object.keys(changed), ["notes"]);
  assert.equal(changed.notes.length, 1);
});

test("hashRow is stable across key order", () => {
  assert.equal(hashRow({ a: 1, b: [1, 2] }), hashRow({ b: [1, 2], a: 1 }));
  assert.notEqual(hashRow({ a: 1 }), hashRow({ a: 2 }));
});

test("applyPull bootstraps an empty device from pulled rows (round-trip)", () => {
  const source = makeLocalState();
  const rows = stateToRows(source, USER);
  const iso = new Date().toISOString();
  const pulled = Object.fromEntries(
    Object.entries(rows).map(([table, tableRows]) => [table, tableRows.map((row) => ({ ...row, updated_at: iso, created_at: row.created_at || iso }))]),
  );

  const empty = {
    theme: "dark", fontId: "inter", textSize: 15, activeMode: "auto", onboardingComplete: false,
    profile: {}, projects: [], chats: [], notes: [], flashcards: [], tombstones: [],
  };
  const merged = applyPull(empty, pulled);

  assert.equal(merged.projects.length, 1);
  assert.equal(merged.projects[0].name, "Organic Chemistry");
  assert.equal(merged.projects[0].domainId, "science");
  assert.equal(merged.projects[0].docs.length, 1);
  assert.equal(merged.projects[0].docs[0].text, "SN2 mechanisms...");
  assert.equal(merged.chats[0].messages.length, 2);
  assert.equal(merged.chats[0].messages[1].content, "A backside attack...");
  assert.equal(merged.notes[0].content, "inversion of configuration");
  assert.equal(merged.flashcards[0].cards[0].reps, 1, "SRS state survives the round-trip");
  assert.equal(merged.profile.subject, "Chemistry");
  assert.equal(merged.onboardingComplete, true);
});

test("applyPull removes entities for tombstoned rows", () => {
  const state = makeLocalState();
  const merged = applyPull(state, {
    notes: [{ id: "n1", deleted: true, updated_at: new Date().toISOString() }],
    chats: [{ id: "c1", deleted: true, updated_at: new Date().toISOString() }],
  });
  assert.equal(merged.notes.length, 0);
  assert.equal(merged.chats.length, 0);
});

test("locally dirty rows win over pulled rows", () => {
  const state = makeLocalState();
  const pulled = {
    notes: [{
      id: "n1", project_id: "p1", title: "REMOTE TITLE", content: "remote content",
      tags: [], shared: false, deleted: false,
      created_at: new Date(20).toISOString(), updated_at: new Date().toISOString(),
    }],
  };
  const merged = applyPull(state, pulled, new Set(["notes/n1"]));
  assert.equal(merged.notes[0].title, "SN2", "local dirty note kept");
});

test("tombstoneRows and clearTombstones round-trip the deletion log", () => {
  const state = makeLocalState();
  state.tombstones = [
    { table: "notes", id: "n1", at: 1 },
    { table: "messages", id: "m1", parentId: "c1", at: 1 },
  ];
  const tombs = tombstoneRows(state, USER);
  assert.equal(tombs.notes[0].deleted, true);
  assert.equal(tombs.messages[0].chat_id, "c1");

  const cleared = clearTombstones(state, new Set(["notes/n1", "messages/m1"]));
  assert.equal(cleared.tombstones.length, 0);
});

test("bootstrap prunes the untouched starter project when the cloud has real ones", async () => {
  const { prunePristineStarter } = await import("./sync.js");
  const starter = { id: "local-starter", name: "My first topic", docs: [], mastery: { concepts: [] } };
  const real = { id: "cloud-p", name: "Organic Chemistry", docs: [], mastery: { concepts: [] } };
  const state = {
    projects: [starter, real],
    chats: [
      { id: "c-starter", projectId: "local-starter", messages: [] },
      { id: "c-real", projectId: "cloud-p", messages: [{ id: "m", role: "user", content: "hi" }] },
    ],
    activeId: "c-starter",
  };
  const pruned = prunePristineStarter(state, new Set(["cloud-p"]));
  assert.deepEqual(pruned.projects.map((p) => p.id), ["cloud-p"]);
  assert.deepEqual(pruned.chats.map((c) => c.id), ["c-real"]);
  assert.equal(pruned.activeId, "c-real", "active chat moves off the pruned starter");

  // a USED starter (has messages) is never pruned
  const used = {
    ...state,
    chats: [{ id: "c-starter", projectId: "local-starter", messages: [{ id: "m2", role: "user", content: "q" }] }, state.chats[1]],
  };
  assert.equal(prunePristineStarter(used, new Set(["cloud-p"])).projects.length, 2);

  // nothing pulled -> nothing pruned
  assert.equal(prunePristineStarter(state, new Set()).projects.length, 2);
});

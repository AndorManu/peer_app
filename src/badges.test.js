import { test } from "node:test";
import assert from "node:assert/strict";

import { BADGE_DEFS, computeBadges, detectNewBadges } from "./badges.js";
import { DOMAINS } from "./subjects.js";

const emptyState = () => ({
  profile: { streak: { count: 0 }, signals: {} },
  projects: [], chats: [], notes: [], flashcards: [], badges: [],
});

test("catalog integrity: unique ids, complete fields", () => {
  const ids = new Set();
  for (const def of BADGE_DEFS) {
    assert.ok(!ids.has(def.id), `duplicate id ${def.id}`);
    ids.add(def.id);
    assert.ok(def.title && def.description && def.icon && /^#/.test(def.accent), `${def.id} complete`);
    assert.ok(def.target >= 1 && typeof def.measure === "function", `${def.id} measurable`);
  }
  assert.ok(BADGE_DEFS.length >= 25, `rich catalog (${BADGE_DEFS.length})`);
});

test("every taxonomy domain has its own badge track", () => {
  for (const domain of DOMAINS) {
    assert.ok(BADGE_DEFS.some((def) => def.domainId === domain.id), `${domain.id} has a track`);
  }
});

test("empty state earns nothing; everything is locked with zero progress", () => {
  const { earned, locked } = computeBadges(emptyState());
  assert.equal(earned.length, 0);
  assert.equal(locked.length, BADGE_DEFS.length);
});

test("badges are earned when thresholds cross and progress tracks toward next", () => {
  const state = emptyState();
  state.profile.streak.count = 3;
  state.chats = [{ id: "c1", messages: [{ role: "user", content: "hi" }] }];
  const { earned, locked, next } = computeBadges(state);
  const earnedIds = earned.map((def) => def.id);
  assert.ok(earnedIds.includes("streak-3"), "3-day streak earned");
  assert.ok(earnedIds.includes("first-question"), "first question earned");
  const streak7 = locked.find((def) => def.id === "streak-7");
  assert.ok(Math.abs(streak7.progress - 3 / 7) < 0.01, "progress toward 7-day streak");
  assert.ok(next, "a next badge is suggested");
});

test("domain mastery track counts strong concepts in that domain only", () => {
  const state = emptyState();
  state.projects = [
    { id: "p1", name: "Spanish B2", domainId: "language", docs: [], mastery: { concepts: [
      { id: "1", key: "a", label: "A", confidence: 0.8 },
      { id: "2", key: "b", label: "B", confidence: 0.9 },
      { id: "3", key: "c", label: "C", confidence: 0.75 },
    ] } },
    { id: "p2", name: "Calculus", domainId: "math", docs: [], mastery: { concepts: [{ id: "4", key: "d", label: "D", confidence: 0.95 }] } },
  ];
  const { earned, locked } = computeBadges(state);
  assert.ok(earned.some((def) => def.id === "adept-language"), "language adept earned");
  const mathAdept = locked.find((def) => def.id === "adept-math");
  assert.ok(mathAdept && Math.abs(mathAdept.progress - 1 / 3) < 0.01, "math adept 1/3");
});

test("detectNewBadges only reports unawarded crossings", () => {
  const state = emptyState();
  state.profile.streak.count = 3;
  const first = detectNewBadges(state);
  assert.ok(first.some((entry) => entry.badgeId === "streak-3"));
  state.badges = first;
  assert.equal(detectNewBadges(state).length, 0, "no duplicates after awarding");
});

import test from "node:test";
import assert from "node:assert/strict";
import { computeStudyPulse, buildReminder } from "./studyPulse.js";
import { defaultState, normalizeState } from "./stateModel.js";

const DAY = 86_400_000;
const NOW = new Date("2026-07-05T15:00:00").getTime(); // local afternoon

function stateWith(overrides = {}) {
  return { ...defaultState(), ...overrides };
}

test("pulse on a fresh state: no due cards, no activity, streak 0", () => {
  const pulse = computeStudyPulse(stateWith(), NOW);
  assert.equal(pulse.dueNow, 0);
  assert.equal(pulse.streak, 0);
  assert.equal(pulse.activeToday, false);
  assert.equal(pulse.activity.length, 7);
  assert.ok(pulse.activity[6].isToday);
  assert.equal(pulse.activity.reduce((s, d) => s + d.count, 0), 0);
});

test("user messages, reviews, and notes land in the right day buckets", () => {
  const state = stateWith({
    chats: [{ id: "c1", messages: [
      { role: "user", createdAt: NOW - 1000 },            // today
      { role: "assistant", createdAt: NOW - 900 },        // ignored (not user)
      { role: "user", createdAt: NOW - 2 * DAY },         // 2 days ago
      { role: "user", createdAt: NOW - 30 * DAY },        // outside window
    ] }],
    flashcards: [{ id: "d1", cards: [
      { front: "q", back: "a", lastReviewedAt: NOW - DAY, dueAt: NOW + 5 * DAY }, // yesterday
    ] }],
    notes: [{ id: "n1", createdAt: NOW - 1000 }],          // today
  });
  const pulse = computeStudyPulse(state, NOW);
  assert.equal(pulse.activity[6].count, 2); // message + note today
  assert.equal(pulse.activity[5].count, 1); // review yesterday
  assert.equal(pulse.activity[4].count, 1); // message 2 days ago
  assert.equal(pulse.activeToday, true);
});

test("due cards counted: never-reviewed cards are due immediately", () => {
  const state = stateWith({
    flashcards: [{ id: "d1", cards: [
      { front: "new card" },                               // no dueAt -> due
      { front: "later", dueAt: NOW + DAY },                // not due
      { front: "overdue", dueAt: NOW - DAY },              // due
    ] }],
  });
  assert.equal(computeStudyPulse(state, NOW).dueNow, 2);
});

test("reminder priority: due cards first, streak nudge second, else null", () => {
  const due = buildReminder({ dueNow: 3, streak: 5, activeToday: false }, { now: NOW });
  assert.equal(due.kind, "due-cards");
  assert.match(due.text, /3 flashcards/);

  const streak = buildReminder({ dueNow: 0, streak: 5, activeToday: false }, { now: NOW });
  assert.equal(streak.kind, "streak");
  assert.match(streak.text, /5-day streak/);

  assert.equal(buildReminder({ dueNow: 0, streak: 5, activeToday: true }, { now: NOW }), null);
  assert.equal(buildReminder({ dueNow: 0, streak: 2, activeToday: false }, { now: NOW }), null);
});

test("normalizeState keeps spaced-repetition fields across reloads (regression)", () => {
  const stored = stateWith({
    flashcards: [{ id: "d1", chatName: "Deck", cards: [
      { id: "c1", question: "q", answer: "a", ease: 2.6, reps: 3, interval: 7, dueAt: NOW + 7 * DAY, lastReviewedAt: NOW - DAY },
      { id: "c2", question: "new", answer: "card" },
    ] }],
  });
  const cards = normalizeState(stored).flashcards[0].cards;
  assert.equal(cards[0].dueAt, NOW + 7 * DAY);
  assert.equal(cards[0].ease, 2.6);
  assert.equal(cards[0].reps, 3);
  assert.equal(cards[0].interval, 7);
  assert.equal(cards[0].lastReviewedAt, NOW - DAY);
  assert.equal(cards[1].dueAt, undefined); // brand-new cards stay immediately due
  // the graded card is no longer in the due queue after a "reload"
  assert.equal(computeStudyPulse(normalizeState(stored), NOW).dueNow, 1);
});

test("reminder honors today's snooze but not yesterday's", () => {
  const pulse = { dueNow: 4, streak: 0, activeToday: false };
  const todayKey = new Date(NOW).toISOString().slice(0, 10);
  assert.equal(buildReminder(pulse, { snoozedDay: todayKey, now: NOW }), null);
  const yesterdayKey = new Date(NOW - DAY).toISOString().slice(0, 10);
  assert.ok(buildReminder(pulse, { snoozedDay: yesterdayKey, now: NOW }));
});

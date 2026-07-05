// Study pulse — pure helpers behind the progress dashboard and the in-app
// study reminders. Everything derives from state the app already keeps:
// user message timestamps, spaced-rep review times, note timestamps, streak.
import { dueCount } from "./spacedRepetition.js";
import { buildLearnerRecap } from "./learningModel.js";

const DAY = 86_400_000;

// Start of the local calendar day for a timestamp.
function dayStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Every "study event" timestamp we can attribute to the learner.
function activityTimestamps(state) {
  const out = [];
  (state?.chats || []).forEach((chat) => (chat.messages || []).forEach((m) => {
    if (m.role === "user" && m.createdAt) out.push(m.createdAt);
  }));
  (state?.flashcards || []).forEach((deck) => (deck.cards || []).forEach((c) => {
    if (c.lastReviewedAt) out.push(c.lastReviewedAt);
  }));
  (state?.notes || []).forEach((n) => { if (n.createdAt) out.push(n.createdAt); });
  return out;
}

// { streak, dueNow, activity: [{label, count, isToday}×7 oldest→today],
//   activeToday, improving, slipping, totalConcepts }
export function computeStudyPulse(state, now = Date.now()) {
  const recap = buildLearnerRecap(state);
  const today = dayStart(now);
  const buckets = new Map();
  for (let i = 6; i >= 0; i -= 1) buckets.set(today - i * DAY, 0);
  activityTimestamps(state).forEach((ts) => {
    const day = dayStart(ts);
    if (buckets.has(day)) buckets.set(day, buckets.get(day) + 1);
  });
  const activity = [...buckets.entries()].map(([day, count]) => ({
    label: DAY_LABELS[new Date(day).getDay()],
    count,
    isToday: day === today,
  }));
  return {
    streak: recap.streak,
    dueNow: dueCount(state?.flashcards || [], now),
    activity,
    activeToday: activity[activity.length - 1].count > 0,
    improving: recap.improving.length,
    slipping: recap.slipping.length,
    totalConcepts: recap.totalConcepts,
  };
}

// The one reminder worth interrupting for, or null. Priority: due cards,
// then a streak about to break. `snoozedDay` is the YYYY-MM-DD the user
// dismissed the banner (it stays quiet for the rest of that day).
export function buildReminder(pulse, { snoozedDay = null, now = Date.now() } = {}) {
  const todayKey = new Date(now).toISOString().slice(0, 10);
  if (snoozedDay === todayKey) return null;
  if (pulse.dueNow > 0) {
    return {
      kind: "due-cards",
      text: pulse.dueNow === 1
        ? "1 flashcard is ready for review — a minute keeps it in memory."
        : `${pulse.dueNow} flashcards are ready for review — a few minutes keeps them in memory.`,
      cta: "Review now",
    };
  }
  if (pulse.streak >= 3 && !pulse.activeToday) {
    return {
      kind: "streak",
      text: `Your ${pulse.streak}-day streak is still alive — one question or review today keeps it going.`,
      cta: "Pick up where you left off",
    };
  }
  return null;
}

export const REMINDER_SNOOZE_KEY = "peer-reminder-snoozed";

// Spaced repetition — SM-2 lite. Each card carries optional SR fields:
//   { ease, reps, interval (days), dueAt (ms), lastReviewedAt (ms) }
// Cards with no SR fields are treated as brand-new and immediately due.
const DAY = 86_400_000;

export function gradeCard(card, grade) {
  const now = Date.now();
  let ease = card.ease ?? 2.5;
  let reps = card.reps ?? 0;
  let interval = card.interval ?? 0;

  if (grade === "again") {
    ease = Math.max(1.3, ease - 0.2);
    return { ...card, ease, reps: 0, interval: 0, dueAt: now + 10 * 60_000, lastReviewedAt: now }; // ~10 min
  }
  // "good"
  reps += 1;
  if (reps === 1) interval = 1;
  else if (reps === 2) interval = 3;
  else interval = Math.max(1, Math.round((interval || 1) * ease));
  ease = Math.min(2.8, ease + 0.05);
  return { ...card, ease, reps, interval, dueAt: now + interval * DAY, lastReviewedAt: now };
}

export function isDue(card, now = Date.now()) {
  return (card.dueAt ?? 0) <= now; // never-reviewed cards (no dueAt) are due
}

// flatten all due cards across decks into a review queue
export function dueQueue(decks, now = Date.now()) {
  const out = [];
  (decks || []).forEach((deck) => {
    (deck.cards || []).forEach((card, index) => {
      if (isDue(card, now)) out.push({ deckId: deck.id, deckName: deck.chatName, projectId: deck.projectId, index, card });
    });
  });
  return out;
}

export function dueCount(decks, now = Date.now()) {
  return dueQueue(decks, now).length;
}

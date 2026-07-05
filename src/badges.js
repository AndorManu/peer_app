// ============================================================================
// Peer — badges & gamification (M10)
// A single catalog spanning EVERY subject: global learning badges plus one
// mastery track per taxonomy domain, so no field is left without its own
// achievements. Pure functions — unit-tested under `node --test`.
//
// Each definition: { id, title, description, icon (lucide name via
// DOMAIN_ICONS/BADGE_ICONS), accent, domainId?, target, measure(state) }.
// A badge is earned when measure(state) >= target; progress is measure/target.
// ============================================================================
import { DOMAINS, domainForProject } from "./subjects.js";

const countMessages = (state, role) =>
  (state.chats || []).reduce((sum, chat) => sum + (chat.messages || []).filter((m) => m.role === role).length, 0);

const allConcepts = (state) => (state.projects || []).flatMap((p) => p.mastery?.concepts || []);

const strongConceptsInDomain = (state, domainId) =>
  (state.projects || [])
    .filter((project) => domainForProject(project).id === domainId)
    .flatMap((project) => project.mastery?.concepts || [])
    .filter((concept) => (concept.confidence || 0) >= 0.72).length;

const distinctDomains = (state) => new Set(
  (state.projects || []).map((project) => domainForProject(project).id).filter((id) => id !== "general"),
).size;

const reviewsDone = (state) =>
  (state.flashcards || []).reduce((sum, deck) => sum + (deck.cards || []).reduce((s, card) => s + (card.reps || 0), 0), 0);

const generatedVisuals = (state) =>
  (state.projects || []).reduce((sum, p) => sum + (p.docs || []).filter((d) => d.kind === "image" && /^Visual:/.test(d.name || "")).length, 0);

export const BADGE_DEFS = [
  // ---- getting started ----
  { id: "first-question", title: "First Question", description: "Ask Peer anything — the journey starts with one question.", icon: "spark", accent: "#22d3ee", target: 1, measure: (s) => countMessages(s, "user") },
  { id: "curious-25", title: "Curious Mind", description: "Ask 25 questions across any subjects.", icon: "spark", accent: "#22d3ee", target: 25, measure: (s) => countMessages(s, "user") },
  { id: "deep-diver-100", title: "Deep Diver", description: "100 questions asked — you're really digging in.", icon: "spark", accent: "#8b5cf6", target: 100, measure: (s) => countMessages(s, "user") },

  // ---- consistency ----
  { id: "streak-3", title: "Warm Streak", description: "Study 3 days in a row.", icon: "flame", accent: "#f59e0b", target: 3, measure: (s) => s.profile?.streak?.count || 0 },
  { id: "streak-7", title: "One Full Week", description: "A 7-day study streak.", icon: "flame", accent: "#fb923c", target: 7, measure: (s) => s.profile?.streak?.count || 0 },
  { id: "streak-30", title: "Unstoppable Month", description: "30 days in rhythm. Extraordinary.", icon: "flame", accent: "#fb7185", target: 30, measure: (s) => s.profile?.streak?.count || 0 },

  // ---- knowledge building ----
  { id: "notes-5", title: "Note Keeper", description: "Save 5 explanations to your notebook.", icon: "notes", accent: "#f59e0b", target: 5, measure: (s) => (s.notes || []).length },
  { id: "concepts-10", title: "Concept Collector", description: "Track 10 concepts in your learning brain.", icon: "brain", accent: "#8b5cf6", target: 10, measure: (s) => allConcepts(s).length },
  { id: "concepts-50", title: "Growing Brain", description: "50 tracked concepts — your map is thriving.", icon: "brain", accent: "#8b5cf6", target: 50, measure: (s) => allConcepts(s).length },
  { id: "leveled-up", title: "Leveled Up", description: "Bring any concept above 72% mastery.", icon: "trending", accent: "#34d399", target: 1, measure: (s) => allConcepts(s).filter((c) => (c.confidence || 0) >= 0.72).length },

  // ---- practice ----
  { id: "decks-3", title: "Deck Builder", description: "Create 3 flashcard decks.", icon: "cards", accent: "#e879f9", target: 3, measure: (s) => (s.flashcards || []).length },
  { id: "reviews-50", title: "Recall Athlete", description: "Complete 50 spaced-repetition reviews.", icon: "cards", accent: "#e879f9", target: 50, measure: reviewsDone },
  { id: "teach-back-3", title: "Teacher's Instinct", description: "Teach a topic back 3 times — the strongest way to learn.", icon: "megaphone", accent: "#34d399", target: 3, measure: (s) => s.profile?.signals?.teachBack || 0 },

  // ---- social + multimodal ----
  { id: "room-first", title: "Study Together", description: "Join or host a live peer room.", icon: "users", accent: "#34d399", target: 1, measure: (s) => s.profile?.signals?.roomSessions || 0 },
  { id: "room-5", title: "Room Regular", description: "5 live room sessions with real partners.", icon: "users", accent: "#2dd4bf", target: 5, measure: (s) => s.profile?.signals?.roomSessions || 0 },
  { id: "visual-3", title: "Visual Thinker", description: "Generate 3 diagrams to see ideas, not just read them.", icon: "image", accent: "#22d3ee", target: 3, measure: generatedVisuals },

  // ---- breadth ----
  { id: "explorer-3", title: "Cross-Subject Explorer", description: "Study subjects across 3 different domains.", icon: "compass", accent: "#fbbf24", target: 3, measure: distinctDomains },
  { id: "renaissance-6", title: "Renaissance Learner", description: "Six domains of knowledge and counting.", icon: "compass", accent: "#fbbf24", target: 6, measure: distinctDomains },

  // ---- one mastery track per domain: no subject left behind ----
  ...DOMAINS.map((domain) => ({
    id: `adept-${domain.id}`,
    title: `${domain.label} Adept`,
    description: `Bring 3 ${domain.label} concepts above 72% mastery.`,
    icon: domain.icon,
    accent: domain.accent,
    domainId: domain.id,
    target: 3,
    measure: (s) => strongConceptsInDomain(s, domain.id),
  })),
];

const DEFS_BY_ID = new Map(BADGE_DEFS.map((def) => [def.id, def]));

export function getBadgeDef(id) {
  return DEFS_BY_ID.get(id) || null;
}

// Full picture for the trophy case: earned (with dates from state.badges) and
// locked (with live progress), plus which locked badge is closest.
export function computeBadges(state) {
  const earnedById = new Map((state.badges || []).map((entry) => [entry.badgeId, entry]));
  const earned = [];
  const locked = [];

  for (const def of BADGE_DEFS) {
    const record = earnedById.get(def.id);
    const current = def.measure(state);
    if (record || current >= def.target) {
      earned.push({ ...def, earnedAt: record?.earnedAt || Date.now() });
    } else {
      locked.push({ ...def, current, progress: Math.min(1, current / def.target) });
    }
  }

  locked.sort((a, b) => b.progress - a.progress);
  return { earned, locked, next: locked.find((def) => def.progress > 0) || locked[0] || null };
}

// Newly crossed thresholds since the last award pass — the caller appends
// these to state.badges and celebrates.
export function detectNewBadges(state) {
  const have = new Set((state.badges || []).map((entry) => entry.badgeId));
  return BADGE_DEFS
    .filter((def) => !have.has(def.id) && def.measure(state) >= def.target)
    .map((def) => ({ id: `${def.id}-${Date.now().toString(36)}`, badgeId: def.id, domainId: def.domainId || null, earnedAt: Date.now() }));
}

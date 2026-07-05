const BASE_SIGNALS = {
  understood: 0,
  confused: 0,
  alternate: 0,
  quiz: 0,
  notes: 0,
  attachments: 0,
  implicit: 0,
  tooVague: 0,
  tooAdvanced: 0,
  tooLong: 0,
  goodExample: 0,
  moreTechnical: 0,
  moreVisual: 0,
  teachBack: 0,
  reflections: 0,
  visualBlueprint: 0,
};

const BASE_PREFERENCES = {
  simple: 0,
  technical: 0,
  visual: 0,
  socratic: 0,
  gamified: 0,
  concise: 0,
  exampleFirst: 0,
  analogyFirst: 0,
};

const BASE_TRAITS = {
  averageMessageLength: 0,
  codeMentions: 0,
  asksWhy: 0,
  asksExamples: 0,
  confusionPhrases: 0,
  frustrationPhrases: 0,
  // Learning DNA implicit signals (inferred, never asked):
  // which everyday domains the learner reaches for when THEY explain things
  analogyDomains: {},        // e.g. { cooking: 2, gaming: 1 }
  lastFrustrationAt: 0,      // recency matters more than lifetime count
  cramSignals: 0,            // "test tomorrow", "need this fast", ...
  lastCramAt: 0,
};

// Domains people commonly explain things through. Word lists stay small on
// purpose — a false negative costs nothing, a false positive pollutes DNA.
const ANALOGY_DOMAINS = {
  sports: /\b(football|soccer|basketball|tennis|baseball|golf|running|marathon|gym|workout|team plays?|scoring)\b/,
  cooking: /\b(cooking|recipe|baking|kitchen|ingredients?|oven|simmer|dough|seasoning)\b/,
  gaming: /\b(video ?games?|gaming|minecraft|rpg|level(?:ing)? up|boss fight|quest|respawn|xp)\b/,
  music: /\b(guitar|piano|chords?|melody|rhythm|orchestra|drums|tuning)\b/,
  driving: /\b(driving|car engine|gears?|steering|highway|traffic|brakes)\b/,
  building: /\b(lego|carpentry|blueprint|scaffolding|bricks?|foundation of a house)\b/,
};
const ANALOGY_FRAMING = /\b(like|similar to|as if|think of it|imagine|kind of like|it'?s like)\b/;

// "I need this fast" — deadlines, exams, time pressure in the learner's words.
const CRAM_PATTERN = /\b(test|exam|quiz|toets|tentamen|deadline|due)\s+(is\s+)?(tomorrow|today|tonight|morgen|vandaag)\b|\bcram(ming)?\b|\bneed (this|it) fast\b|\bin a hurry\b|\bquick(ly)? before\b/;

export function makeProfile() {
  return {
    subject: "",
    goal: "",
    language: "auto",
    level: "beginner",
    learningPreference: "auto",
    explanationDepth: "normal",
    signals: { ...BASE_SIGNALS },
    preferences: { ...BASE_PREFERENCES },
    traits: { ...BASE_TRAITS },
    observations: [],
    successfulStrategies: [],
    teachingRecipe: [],
    // which one-line "Peer adapted to you" notices have already been shown
    adaptationNotes: {},
    // explicit corrections from the Learning DNA panel: key -> confirmed|rejected
    dnaOverrides: {},
    streak: {
      count: 0,
      lastStudyDate: "",
      sessions: 0,
      messagesToday: 0,
    },
    updatedAt: Date.now(),
  };
}

// Per-project feedback tallies — this is what lets Peer pace one subject
// differently from another (gentle in the one you find hard, fast in the
// one you're strong in) instead of one global setting.
const BASE_MASTERY_SIGNALS = {
  understood: 0,
  confused: 0,
  tooAdvanced: 0,
  tooLong: 0,
  goodExample: 0,
  // how this learner OPENS a session in this subject:
  warmup: 0,   // "where were we?", "recap", "remind me"
  diveIn: 0,   // straight into new material
};

const WARMUP_PATTERN = /\b(where (were|was) (we|i)|recap|remind me|what did we|last time|pick up where|refresh my memory|samenvatting|waar waren we)\b/i;

export function makeMastery() {
  return {
    concepts: [],
    misconceptions: [],
    reflections: [],
    signals: { ...BASE_MASTERY_SIGNALS },
    updatedAt: Date.now(),
  };
}

export function normalizeProfile(profile) {
  const base = makeProfile();
  return {
    ...base,
    ...(profile && typeof profile === "object" ? profile : {}),
    signals: { ...base.signals, ...(profile?.signals || {}) },
    preferences: { ...base.preferences, ...(profile?.preferences || {}) },
    traits: { ...base.traits, ...(profile?.traits || {}) },
    explanationDepth: ["simple", "normal", "expert", "exam"].includes(profile?.explanationDepth) ? profile.explanationDepth : "normal",
    level: ["beginner", "intermediate", "advanced", "exam"].includes(profile?.level) ? profile.level : "beginner",
    learningPreference: ["auto", "visual", "examples", "socratic", "challenge", "code"].includes(profile?.learningPreference) ? profile.learningPreference : "auto",
    observations: Array.isArray(profile?.observations) ? profile.observations.slice(0, 8) : [],
    successfulStrategies: Array.isArray(profile?.successfulStrategies) ? profile.successfulStrategies.slice(0, 8) : [],
    teachingRecipe: Array.isArray(profile?.teachingRecipe) ? profile.teachingRecipe.slice(0, 8) : [],
    streak: {
      ...base.streak,
      ...(profile?.streak && typeof profile.streak === "object" ? profile.streak : {}),
    },
  };
}

export function normalizeMastery(mastery) {
  const base = makeMastery();
  return {
    ...base,
    ...(mastery && typeof mastery === "object" ? mastery : {}),
    concepts: Array.isArray(mastery?.concepts) ? mastery.concepts.slice(0, 40) : [],
    misconceptions: Array.isArray(mastery?.misconceptions) ? mastery.misconceptions.slice(0, 20) : [],
    reflections: Array.isArray(mastery?.reflections) ? mastery.reflections.slice(0, 12) : [],
    signals: { ...base.signals, ...(mastery?.signals || {}) },
  };
}

export function inferProfileFromMessage(profile, content) {
  const next = normalizeProfile(profile);
  const text = content.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean).length;
  const mentionsCode = /\b(code|function|pointer|array|class|bug|compile|error|terminal|api|server|react|javascript|python|malloc|free|struct)\b/.test(text);
  const asksWhy = /\bwhy\b|\bwaarom\b|\bhoezo\b/.test(text);
  const asksExamples = /\bexample\b|\bvoorbeeld\b|\banalogy\b|\banalog(y|ie)\b|\bvisual\b/.test(text);
  const confused = /\bconfused\b|\bstuck\b|\bdon't get\b|\bdont get\b|\bik snap\b|\bsnap niet\b|\bbegrijp niet\b|\bvast\b/.test(text);
  const frustrated = /\bannoying\b|\bfrustrating\b|\bwtf\b|\birritant\b|\bkut\b|\bugh\b/.test(text);
  const wantsSimple = /\bsimple\b|\bsimpler\b|\beasy\b|\bmakkelijk\b|\bsimpel\b|\blike i'm five\b|\beli5\b/.test(text);
  const wantsChallenge = /\bquiz\b|\btest me\b|\bchallenge\b|\boefen\b|\boefening\b/.test(text);

  if (mentionsCode) next.preferences.technical += 1;
  if (asksExamples) next.preferences.visual += 1;
  if (asksWhy) next.preferences.socratic += 1;
  if (confused || wantsSimple || words < 9) next.preferences.simple += 1;
  if (wantsChallenge) next.preferences.gamified += 1;
  if (asksExamples || wantsSimple) next.preferences.exampleFirst += 1;
  if (text.includes("analogy") || text.includes("metaphor") || text.includes("like ")) next.preferences.analogyFirst += 1;

  next.signals.implicit += 1;
  next.traits.averageMessageLength = Math.round(((next.traits.averageMessageLength * (next.signals.implicit - 1)) + words) / next.signals.implicit);
  next.traits.codeMentions += mentionsCode ? 1 : 0;
  next.traits.asksWhy += asksWhy ? 1 : 0;
  next.traits.asksExamples += asksExamples ? 1 : 0;
  next.traits.confusionPhrases += confused ? 1 : 0;
  next.traits.frustrationPhrases += frustrated ? 1 : 0;
  if (frustrated) next.traits.lastFrustrationAt = Date.now();

  // Learning DNA: the learner explaining through their OWN world is one of
  // the strongest teaching hints there is — remember which world.
  if (ANALOGY_FRAMING.test(text)) {
    for (const [domain, pattern] of Object.entries(ANALOGY_DOMAINS)) {
      if (pattern.test(text)) {
        next.traits.analogyDomains = { ...next.traits.analogyDomains, [domain]: (next.traits.analogyDomains?.[domain] || 0) + 1 };
      }
    }
  }
  if (CRAM_PATTERN.test(text)) {
    next.traits.cramSignals += 1;
    next.traits.lastCramAt = Date.now();
  }

  const observations = [];
  if (confused) observations.push("Learner used confusion language; simplify before adding depth.");
  if (frustrated) observations.push("Learner may be frustrated; keep tone calm and reduce cognitive load.");
  if (mentionsCode) observations.push("Learner references code; precise code-shaped examples may help.");
  if (asksExamples) observations.push("Learner asks for examples or analogies; make ideas concrete.");
  if (asksWhy) observations.push("Learner asks why; guided reasoning may work well.");

  return refreshRecipe({
    ...next,
    observations: prependItems(next.observations, observations),
    updatedAt: Date.now(),
  });
}

export function updateProfileFromAttachments(profile, docs) {
  const next = normalizeProfile(profile);
  const hasCode = docs.some((doc) => doc.kind === "text" && /\.(c|h|cpp|hpp|js|jsx|ts|tsx|py|java|rs|go|sh)$/i.test(doc.name));
  const hasImage = docs.some((doc) => doc.kind === "image");

  next.signals.attachments += docs.length;
  if (hasCode) next.preferences.technical += 1;
  if (hasImage) next.preferences.visual += 1;

  return refreshRecipe({
    ...next,
    observations: prependItems(next.observations, [
      hasImage
        ? "Learner attached visual material; ask for a description until vision is enabled."
        : "Learner attached study material; ground answers in project context.",
    ]),
    updatedAt: Date.now(),
  });
}

export function applyFeedback(profile, feedback) {
  const next = normalizeProfile(profile);
  const observationMap = {
    understood: "Recent explanation landed well.",
    confused: "Learner needed a simpler angle.",
    alternate: "Learner asked for a different explanation style.",
    quiz: "Learner asked to be checked with questions.",
    tooVague: "Explanation was too vague; use concrete steps and examples.",
    tooAdvanced: "Explanation was too advanced; lower abstraction and define terms.",
    tooLong: "Explanation was too long; keep future answers tighter.",
    goodExample: "Concrete examples worked well.",
    moreTechnical: "Learner wants more precise technical depth.",
    moreVisual: "Learner wants more visual or analogy-based explanations.",
    teachBack: "Learner is practicing teach-back; diagnose gaps gently.",
    visualBlueprint: "Learner requested a visual blueprint; diagrams and structured layouts may help.",
  };

  const preferenceMap = {
    confused: "simple",
    alternate: "visual",
    quiz: "socratic",
    tooVague: "exampleFirst",
    tooAdvanced: "simple",
    tooLong: "concise",
    goodExample: "exampleFirst",
    moreTechnical: "technical",
    moreVisual: "visual",
    teachBack: "socratic",
    visualBlueprint: "visual",
  };

  next.signals[feedback] = (next.signals[feedback] || 0) + 1;
  const preference = preferenceMap[feedback];
  if (preference) next.preferences[preference] = (next.preferences[preference] || 0) + 1;
  if (feedback === "understood") next.successfulStrategies = prependItems(next.successfulStrategies, ["The latest explanation landed; keep a similar pace and structure."]);
  if (feedback === "goodExample") next.successfulStrategies = prependItems(next.successfulStrategies, ["Use concrete examples early."]);
  if (feedback === "moreVisual" || feedback === "visualBlueprint") next.successfulStrategies = prependItems(next.successfulStrategies, ["Use visual structure before dense explanation."]);

  return refreshRecipe({
    ...next,
    observations: prependItems(next.observations, [observationMap[feedback]].filter(Boolean)),
    updatedAt: Date.now(),
  });
}

export function setExplanationDepth(profile, depth) {
  const next = normalizeProfile(profile);
  const cleanDepth = ["simple", "normal", "expert", "exam"].includes(depth) ? depth : "normal";
  const observations = {
    simple: "Learner selected simple depth; reduce jargon and use small steps.",
    normal: "Learner selected normal depth; balance clarity with useful detail.",
    expert: "Learner selected expert depth; include precise terminology and tradeoffs.",
    exam: "Learner selected exam depth; focus on recall, traps, and practice checks.",
  };

  return refreshRecipe({
    ...next,
    explanationDepth: cleanDepth,
    observations: prependItems(next.observations, [observations[cleanDepth]]),
    updatedAt: Date.now(),
  });
}

// True when the next message would be the first of a new local-day session —
// the moment where warm-up vs dive-in preference shows itself.
export function isSessionOpening(profile) {
  const streak = normalizeProfile(profile).streak;
  return streak.lastStudyDate !== localDateKey() || !(streak.messagesToday > 0);
}

export function recordStudyActivity(profile) {
  const next = normalizeProfile(profile);
  const today = localDateKey();
  const previous = next.streak.lastStudyDate;
  const isNewDay = previous !== today;
  const count = !previous
    ? 1
    : previous === yesterdayKey()
      ? next.streak.count + 1
      : previous === today
        ? next.streak.count
        : 1;

  return {
    ...next,
    streak: {
      count,
      lastStudyDate: today,
      sessions: (next.streak.sessions || 0) + (isNewDay ? 1 : 0),
      messagesToday: isNewDay ? 1 : (next.streak.messagesToday || 0) + 1,
    },
    updatedAt: Date.now(),
  };
}

export function applyReflection(profile, summary = "Learner requested a session reflection.") {
  const next = normalizeProfile(profile);
  next.signals.reflections = (next.signals.reflections || 0) + 1;
  next.preferences.socratic += 1;

  return refreshRecipe({
    ...next,
    observations: prependItems(next.observations, [summary]),
    updatedAt: Date.now(),
  });
}

// Thresholds where a pattern stops being noise and starts being a rule.
// Escalation is the whole point: one click nudges, repeated clicks BIND.
export const ADAPT = {
  conciseHard: 3,   // global "too long" clicks -> hard length cap
  exampleLead: 2,   // example-affinity signals -> open with an example
  easierHere: 2,    // per-subject "too hard" -> auto-drop depth for that subject
  strongHere: 0.7,  // avg confidence past this (4+ concepts) -> faster pace
};

function projectSignals(project) {
  return normalizeMastery(project?.mastery).signals;
}

// Average concept confidence for a project (null with too little history).
function projectStrength(project) {
  const concepts = project?.mastery?.concepts || [];
  if (concepts.length < 4) return null;
  return concepts.reduce((sum, c) => sum + (c.confidence || 0), 0) / concepts.length;
}

// Highest-count analogy domain the learner has volunteered, or null.
export function topAnalogyDomain(profile) {
  const domains = Object.entries(normalizeProfile(profile).traits.analogyDomains || {});
  if (!domains.length) return null;
  const [domain, count] = domains.sort((a, b) => b[1] - a[1])[0];
  return { domain, count };
}

export function buildTeachingRecipe(profile, project, mode) {
  const p = normalizeProfile(profile);
  const ps = projectSignals(project);
  const recipe = [];
  // Explicit user corrections from the Learning DNA panel outrank every
  // inference: "rejected" suppresses a directive no matter how strong the
  // signal; "confirmed" applies it even below threshold.
  const dna = p.dnaOverrides || {};
  const allowed = (key) => dna[key] !== "rejected";
  const confirmed = (key) => dna[key] === "confirmed";
  const naturallyShort = p.traits.averageMessageLength > 0 && p.traits.averageMessageLength < 10 && p.signals.implicit >= 5;

  // Escalated, quantitative directives first — these are the closed loop.
  if (allowed("concise") && (p.signals.tooLong >= ADAPT.conciseHard || ps.tooLong >= 2 || confirmed("concise"))) {
    recipe.push("HARD LENGTH CAP: this learner has repeatedly flagged answers as too long. Keep this answer under 120 words — one tight explanation, one check question, nothing else. Do not pad.");
  } else if (allowed("concise") && (p.preferences.concise > 0 || p.signals.tooLong > 0 || naturallyShort)) {
    recipe.push("This learner communicates in short messages and prefers tight answers. Keep the first answer concise; expand only if asked.");
  }
  if (allowed("exampleFirst") && (p.preferences.exampleFirst >= ADAPT.exampleLead || p.signals.goodExample >= ADAPT.exampleLead || ps.goodExample >= ADAPT.exampleLead || confirmed("exampleFirst"))) {
    recipe.push("OPEN with a concrete worked example BEFORE any abstract statement — examples are proven to land for this learner. Name the general idea only after the example has done the work.");
  } else if (allowed("exampleFirst") && (p.preferences.exampleFirst > 0 || p.preferences.visual > 0)) {
    recipe.push("Use a concrete example or analogy before abstraction.");
  }
  // The learner's own analogy world beats a generic one.
  const analogy = topAnalogyDomain(p);
  if (allowed("analogy") && analogy && (analogy.count >= 2 || confirmed("analogy"))) {
    recipe.push(`When a concept is hard, LEAD with an analogy from ${analogy.domain} — this learner reaches for ${analogy.domain} comparisons themselves, so meet them there before going abstract.`);
  }
  // Session-opening style, per subject.
  if (allowed("warmup") && ps.warmup >= 2 && ps.warmup > ps.diveIn) {
    recipe.push("When a session in this subject starts, open the first answer with a two-line recap of where you left off last time before introducing anything new — this learner likes to warm up.");
  } else if (allowed("diveIn") && ps.diveIn >= 2 && ps.diveIn > ps.warmup) {
    recipe.push("This learner dives straight in — skip recaps and pleasantries at session start unless they ask.");
  }
  // Per-subject pacing: this project's history wins over the global setting.
  if (allowed("easierHere") && ps.tooAdvanced >= ADAPT.easierHere && p.explanationDepth !== "simple") {
    recipe.push("FOR THIS SUBJECT ONLY: recent answers here were too hard for this learner. Teach at simple depth — tiny steps, define every term, no assumed background — regardless of the global depth setting.");
  }
  const strength = projectStrength(project);
  if (allowed("fasterPace") && strength !== null && strength >= ADAPT.strongHere && ps.confused + ps.tooAdvanced === 0) {
    recipe.push("The learner has high mastery in this subject — skip the basics, use precise terminology, and move at a faster, denser pace than you would by default.");
  }
  // Confidence-vs-reality: verify before accepting "got it" on gapped concepts.
  const gapped = (project?.mastery?.concepts || []).filter((concept) => (concept.selfReportGap || 0) >= 1).slice(0, 3);
  if (gapped.length) {
    recipe.push(`CALIBRATION: the learner's "got it" has run ahead of actual recall on ${gapped.map((c) => c.label).join(", ")}. When these come up, verify with one quick check question before building on them — never mention this gap to the learner.`);
  }
  // Session mood: recency-based, so yesterday's frustration doesn't haunt today.
  const now = Date.now();
  if (allowed("gentle") && p.traits.lastFrustrationAt && now - p.traits.lastFrustrationAt < 30 * 60_000) {
    recipe.push("The learner sounded frustrated moments ago. Proactively soften the pace: give the smallest useful step first and one brief reassuring line — before they have to say they're stuck.");
  }
  if (allowed("cram") && p.traits.lastCramAt && now - p.traits.lastCramAt < 48 * 3_600_000) {
    recipe.push("DEADLINE MODE: the learner is under time pressure. Tight, exam-shaped answers only — the must-know core, one worked example, one likely exam trap. No enrichment tangents.");
  }

  if (p.explanationDepth === "simple") recipe.push("Use simple depth: tiny steps, low jargon, one concrete analogy.");
  if (p.explanationDepth === "expert") recipe.push("Use expert depth: precise terminology, edge cases, and tradeoffs.");
  if (p.explanationDepth === "exam") recipe.push("Use exam depth: recall prompts, common traps, and a short practice check.");
  if (p.preferences.simple >= p.preferences.technical || p.signals.tooAdvanced > 0) recipe.push("Start with plain language and define key terms.");
  if (allowed("technical") && p.preferences.technical > p.preferences.simple) recipe.push("Include precise terminology and small code-shaped examples when relevant.");
  if (p.preferences.socratic > 0 || mode === "quiz" || mode === "duck") recipe.push("Ask one focused check question instead of multiple questions.");
  if (p.traits.frustrationPhrases > 0 || p.traits.confusionPhrases > 1) recipe.push("Reduce cognitive load and avoid long theory blocks.");
  if (project?.mastery?.concepts?.some((concept) => concept.status === "weak")) recipe.push("Reinforce weak concepts before introducing new ones.");
  if (!recipe.length) recipe.push("Use a short explanation, one example, and one check question.");
  return recipe.slice(0, 9);
}

// The one-line "Peer just adapted to you" moments. Each fires ONCE, exactly
// when a threshold is crossed, so the learner notices the adaptation without
// it becoming a badge parade. Returns { kind, text } or null.
export function adaptationNotice(profile, project) {
  const p = normalizeProfile(profile);
  const ps = projectSignals(project);
  const shown = p.adaptationNotes || {};
  if (!shown.concise && p.signals.tooLong >= ADAPT.conciseHard) {
    return { kind: "concise", text: "Keeping answers shorter from now on — you've preferred that." };
  }
  if (!shown.exampleFirst && (p.preferences.exampleFirst >= ADAPT.exampleLead || p.signals.goodExample >= ADAPT.exampleLead)) {
    return { kind: "exampleFirst", text: "Starting with examples first — they seem to click for you." };
  }
  if (!shown.easierHere && ps.tooAdvanced >= ADAPT.easierHere && p.explanationDepth !== "simple") {
    return { kind: "easierHere", text: `Taking ${project?.name ? `"${project.name}"` : "this subject"} in smaller steps — recent answers ran too hard.` };
  }
  return null;
}

export function markAdaptationNoticeShown(profile, kind) {
  const next = normalizeProfile(profile);
  return { ...next, adaptationNotes: { ...(next.adaptationNotes || {}), [kind]: true }, updatedAt: Date.now() };
}

// Specific, human sentences about how this learner actually learns — the
// "Learning DNA" panel. Everything derives from real accumulated signals;
// with no history it says so instead of pretending. Entries with a `key`
// are editable: the user can confirm ("spot on") or reject ("not me"), and
// that explicit correction outranks the inference (see dnaOverrides in
// buildTeachingRecipe). `status` mirrors any existing override.
export function buildPersonaInsights(state) {
  const p = normalizeProfile(state?.profile);
  const projects = Array.isArray(state?.projects) ? state.projects : [];
  const dna = p.dnaOverrides || {};
  const insights = [];
  const add = (key, text) => insights.push({ key, text, status: key ? dna[key] || null : null });

  if (p.preferences.exampleFirst >= 2 && p.preferences.exampleFirst >= p.preferences.technical) {
    add("exampleFirst", "You learn best from a concrete example before the abstract rule — Peer opens with one.");
  } else if (p.preferences.technical > p.preferences.simple && p.preferences.technical >= 2) {
    add("technical", "You like precise, technical depth — Peer skips the hand-holding.");
  }

  const analogy = topAnalogyDomain(p);
  if (analogy && analogy.count >= 2) {
    add("analogy", `Ideas stick for you when they're framed in ${analogy.domain} terms — you explain them that way yourself, so Peer meets you there.`);
  }

  if (p.signals.tooLong >= ADAPT.conciseHard || dna.concise === "confirmed") {
    add("concise", "Short beats thorough for you — answers stay under a hard length cap.");
  } else if (p.traits.averageMessageLength > 0 && p.traits.averageMessageLength < 10 && p.signals.implicit >= 5) {
    add("concise", "You write short and to the point — Peer keeps its answers the same way.");
  } else if (p.signals.confused >= 3) {
    add(null, "When something's unclear you say so — Peer restarts smaller instead of repeating itself.");
  }

  const warmups = projects.filter((project) => (project.mastery?.signals?.warmup || 0) >= 2 && (project.mastery?.signals?.warmup || 0) > (project.mastery?.signals?.diveIn || 0));
  const divers = projects.filter((project) => (project.mastery?.signals?.diveIn || 0) >= 2 && (project.mastery?.signals?.diveIn || 0) > (project.mastery?.signals?.warmup || 0));
  if (warmups.length) add("warmup", `You like easing into ${warmups[0].name} with a quick recap of last time.`);
  else if (divers.length) add("diveIn", `You dive straight into new material — no recaps unless you ask.`);

  if (p.traits.cramSignals >= 2) {
    add("cram", "You tend to study close to deadlines — Peer keeps answers tight and exam-shaped when it senses crunch.");
  }

  const rated = projects
    .map((project) => ({ name: project.name, strength: projectStrength(project), weak: (project.mastery?.concepts || []).filter((c) => c.status === "weak").length }))
    .filter((entry) => entry.strength !== null || entry.weak >= 2);
  const strongest = rated.filter((e) => e.strength !== null && e.strength >= 0.6).sort((a, b) => b.strength - a.strength)[0];
  const weakest = rated.filter((e) => e.weak >= 2 && e.name !== strongest?.name).sort((a, b) => b.weak - a.weak)[0];
  if (strongest && weakest) {
    add(null, `You're moving fast through ${strongest.name}, but ${weakest.name} wants more repetition.`);
  } else if (strongest) {
    add(null, `You're moving quickly through ${strongest.name} — Peer paces it faster than your other subjects.`);
  } else if (weakest) {
    add(null, `${weakest.name} is the one asking for more repetition right now.`);
  }

  if (!insights.length) {
    add(null, "Still learning how you learn — keep asking questions and tapping the feedback chips, and this gets specific.");
  }
  return insights.slice(0, 5);
}

// Toggle an explicit correction: clicking the same verdict again clears it
// (back to pure inference).
export function setDnaOverride(profile, key, verdict) {
  const next = normalizeProfile(profile);
  const current = (next.dnaOverrides || {})[key];
  const dnaOverrides = { ...(next.dnaOverrides || {}) };
  if (current === verdict) delete dnaOverrides[key];
  else dnaOverrides[key] = verdict;
  return { ...next, dnaOverrides, updatedAt: Date.now() };
}

// Universal skill tree: concepts group by how solid they are, which is
// meaningful for any subject (the old keyword groups only understood CS).
export function buildSkillTree(project, subject = "Current subject") {
  const mastery = normalizeMastery(project?.mastery);
  const weak = (concept) => concept.status === "weak" || concept.status === "misconception" || (concept.confidence || 0) < 0.4;
  const solid = (concept) => !weak(concept) && (concept.confidence || 0) >= 0.65;
  const groups = [
    { id: "solid", label: "Solid ground", concepts: mastery.concepts.filter(solid) },
    { id: "building", label: "Building now", concepts: mastery.concepts.filter((c) => !solid(c) && !weak(c)) },
    { id: "attention", label: "Needs attention", concepts: mastery.concepts.filter(weak) },
  ];

  return {
    label: project?.name || subject || "Current subject",
    groups: groups.filter((group) => group.concepts.length),
  };
}

export function getWeakSpots(project) {
  const mastery = normalizeMastery(project?.mastery);
  const weakConcepts = mastery.concepts
    .filter((concept) => concept.status === "weak" || (concept.confidence || 0) < 0.45)
    .slice(0, 5);
  const misconceptionConcepts = mastery.misconceptions.slice(0, 3).map((item) => ({
    id: item.id,
    label: item.concept,
    status: "misconception",
    evidence: item.belief,
    confidence: 0.2,
  }));

  return [...weakConcepts, ...misconceptionConcepts].slice(0, 6);
}

export function buildSessionRecap(chat, project) {
  const messages = Array.isArray(chat?.messages) ? chat.messages : [];
  const userMessages = messages.filter((message) => message.role === "user");
  const assistantMessages = messages.filter((message) => message.role === "assistant");
  const mastery = normalizeMastery(project?.mastery);
  const latestConcepts = mastery.concepts.slice(0, 4);
  const weak = getWeakSpots(project);
  const latestQuestion = userMessages.at(-1)?.displayContent || userMessages.at(-1)?.content || "";

  return {
    messageCount: messages.length,
    userTurns: userMessages.length,
    assistantTurns: assistantMessages.length,
    learned: latestConcepts.length ? latestConcepts.map((item) => item.label) : ["Start a chat to build a learning trail."],
    review: weak.length ? weak.map((item) => item.label) : ["No urgent weak spot detected yet."],
    nextStep: weak[0]
      ? `Review ${weak[0].label} with one simple example, then quiz it.`
      : latestQuestion
        ? "Ask Peer to quiz you on the last idea."
        : "Ask a question or drop study material into chat.",
  };
}

export function updateMasteryFromMessage(mastery, content, domainHints = [], { sessionOpening = false } = {}) {
  const next = normalizeMastery(mastery);
  if (sessionOpening) {
    if (WARMUP_PATTERN.test(content)) next.signals.warmup += 1;
    else next.signals.diveIn += 1;
  }
  const concepts = extractConcepts(content, domainHints);
  const misconception = detectMisconception(content);

  for (const label of concepts) {
    upsertConcept(next, label, {
      confidenceDelta: 0.05,
      status: "learning",
      evidence: "Mentioned by learner",
    });
  }

  if (misconception) {
    next.misconceptions = prependRaw(next.misconceptions, {
      id: makeId(),
      concept: misconception.concept,
      belief: misconception.belief,
      correction: misconception.correction,
      createdAt: Date.now(),
    }, 20);
    upsertConcept(next, misconception.concept, {
      confidenceDelta: -0.16,
      status: "weak",
      evidence: "Possible misconception detected",
    });
  }

  next.updatedAt = Date.now();
  return next;
}

export function updateMasteryFromFeedback(mastery, feedback, activeText = "", domainHints = []) {
  const next = normalizeMastery(mastery);
  if (feedback in next.signals) next.signals[feedback] += 1;
  const concepts = extractConcepts(activeText, domainHints);
  for (const label of concepts) {
    const positive = feedback === "understood" || feedback === "goodExample";
    const negative = feedback === "confused" || feedback === "tooAdvanced" || feedback === "tooVague";
    upsertConcept(next, label, {
      confidenceDelta: positive ? 0.16 : negative ? -0.12 : 0.04,
      status: positive ? "strengthening" : negative ? "weak" : "learning",
      evidence: `Feedback: ${feedback}`,
    });
  }
  next.updatedAt = Date.now();
  return next;
}

// Confidence-vs-reality calibration: a failed flashcard review ("again") on
// a concept the learner reported strong means their self-assessment runs
// ahead of recall. Track the gap per concept — the tutor verifies a bit more
// before accepting mastery there, without ever lecturing about it.
export function recordReviewMiss(mastery, cardText = "") {
  const next = normalizeMastery(mastery);
  const haystack = String(cardText).toLowerCase();
  // Match the card against concepts we ALREADY track (reliable substring
  // check) rather than re-extracting concepts from quiz phrasing.
  for (const existing of next.concepts) {
    if ((existing.confidence || 0) <= 0.55) continue; // struggling there is expected, not a gap
    if (!existing.label || !haystack.includes(String(existing.label).toLowerCase())) continue;
    existing.selfReportGap = (existing.selfReportGap || 0) + 1;
    existing.confidence = clamp(existing.confidence - 0.12, 0, 1);
    existing.status = "review";
    existing.evidence = "Missed a flashcard on this after reporting it understood";
    existing.updatedAt = Date.now();
    existing.history = [...(existing.history || []), { at: Date.now(), confidence: existing.confidence, status: existing.status }].slice(-12);
  }
  next.updatedAt = Date.now();
  return next;
}

// Recurring trouble to aim practice at: repeated misconceptions and
// concepts whose self-reported confidence outran recall. Returns a prompt
// fragment or "" — richer than "more calculus problems".
export function practiceFocus(mastery) {
  const m = normalizeMastery(mastery);
  const parts = [];
  const seen = new Map();
  for (const item of m.misconceptions) {
    seen.set(item.concept, (seen.get(item.concept) || 0) + 1);
  }
  const recurring = [...seen.entries()].filter(([, count]) => count >= 2).map(([concept]) => concept);
  for (const concept of recurring.slice(0, 2)) {
    const latest = m.misconceptions.find((item) => item.concept === concept);
    parts.push(`the learner has repeatedly believed "${latest.belief}" about ${concept} — include at least one question designed to catch exactly that mistake`);
  }
  const gapped = m.concepts.filter((concept) => (concept.selfReportGap || 0) >= 1).slice(0, 2);
  for (const concept of gapped) {
    parts.push(`recall on "${concept.label}" has lagged their confidence — probe it from an angle they haven't seen`);
  }
  return parts.length ? ` Target recurring trouble spots: ${parts.join("; ")}.` : "";
}

export function addReflection(mastery, summary) {
  const next = normalizeMastery(mastery);
  next.reflections = prependRaw(next.reflections, {
    id: makeId(),
    summary,
    createdAt: Date.now(),
  }, 12);
  next.updatedAt = Date.now();
  return next;
}

// Smarter memory ------------------------------------------------------------
// Direction a concept is trending, from its mastery history snapshots.
export function conceptTrajectory(concept) {
  const h = Array.isArray(concept?.history) ? concept.history : [];
  if (h.length < 2) return "new";
  const delta = (h[h.length - 1].confidence || 0) - (h[0].confidence || 0);
  if (delta > 0.08) return "improving";
  if (delta < -0.08) return "slipping";
  return "steady";
}

// A cross-project snapshot of what the learner has been working on — used to
// surface a recap in the UI and to make the AI's context memory richer.
export function buildLearnerRecap(state) {
  const projects = Array.isArray(state?.projects) ? state.projects : [];
  const concepts = projects.flatMap((p) =>
    (p.mastery?.concepts || []).map((c) => ({ ...c, project: p.name, trajectory: conceptTrajectory(c) })),
  );
  const recent = [...concepts].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 6);
  const improving = concepts.filter((c) => c.trajectory === "improving").slice(0, 5);
  const slipping = concepts.filter((c) => c.trajectory === "slipping").slice(0, 5);
  const weakSpots = concepts.filter((c) => c.status === "weak" || (c.confidence ?? 1) < 0.4)
    .sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0)).slice(0, 6);
  return {
    totalConcepts: concepts.length,
    recent,
    improving,
    slipping,
    weakSpots,
    streak: state?.profile?.streak?.count || 0,
  };
}

function refreshRecipe(profile) {
  return {
    ...profile,
    teachingRecipe: buildTeachingRecipe(profile, null, "auto"),
  };
}

function upsertConcept(mastery, label, update) {
  const normalized = normalizeConcept(label);
  if (!normalized) return;
  const existing = mastery.concepts.find((concept) => concept.key === normalized.key);
  if (existing) {
    existing.confidence = clamp((existing.confidence || 0.35) + update.confidenceDelta, 0, 1);
    existing.status = statusFromConfidence(existing.confidence, update.status);
    existing.evidence = update.evidence;
    existing.updatedAt = Date.now();
    // smarter memory: keep a short trajectory of how mastery moved over time
    existing.history = [...(existing.history || []), { at: Date.now(), confidence: existing.confidence, status: existing.status }].slice(-12);
    return;
  }
  const startConfidence = clamp(0.35 + update.confidenceDelta, 0, 1);
  mastery.concepts.unshift({
    id: makeId(),
    key: normalized.key,
    label: normalized.label,
    confidence: startConfidence,
    status: update.status,
    evidence: update.evidence,
    history: [{ at: Date.now(), confidence: startConfidence, status: update.status }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  mastery.concepts = mastery.concepts.slice(0, 40);
}

// Programming terms stay as a built-in hint list (compat with existing data);
// every other domain contributes hints via the `domainHints` parameter, which
// the app fills from the subject taxonomy (src/subjects.js).
const CS_TERMS = [
  "pointer", "pointers", "array", "arrays", "recursion", "binary search", "memory", "malloc", "free",
  "function", "loop", "struct", "api", "react", "state", "component", "variable", "algorithm",
  "cybersecurity", "network", "terminal", "compile", "debugging",
];

// Phrases the learner explicitly asks about — works for any subject.
const ASK_PATTERNS = [
  /\bwhat (?:is|are|was|were) (?:a |an |the )?([a-z][a-z0-9' -]{2,40}?)[?.,;!]/gi,
  /\bhow (?:does|do|did) (?:a |an |the )?([a-z][a-z0-9' -]{2,40}?) work/gi,
  /\b(?:explain|define) (?:a |an |the )?([a-z][a-z0-9' -]{2,40}?)(?:[?.,;!]| to me| in\b| like\b| using\b|$)/gi,
  /\btell me about (?:a |an |the )?([a-z][a-z0-9' -]{2,40}?)(?:[?.,;!]|$)/gi,
  /\bquiz me on (?:a |an |the )?([a-z][a-z0-9' -]{2,40}?)(?:[?.,;!]|$)/gi,
];

const PHRASE_STOPWORDS = new Set(["it", "this", "that", "them", "these", "those", "me", "you", "stuff", "things", "difference", "it all"]);

function extractAskedPhrases(content) {
  const found = [];
  for (const pattern of ASK_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const phrase = match[1].trim().replace(/\s+/g, " ");
      const words = phrase.split(" ");
      if (words.length >= 1 && words.length <= 5 && !PHRASE_STOPWORDS.has(phrase.toLowerCase())) {
        found.push(phrase);
      }
      if (found.length >= 3) return found;
    }
  }
  return found;
}

// Mid-sentence Title Case runs ("French Revolution", "Krebs Cycle") are strong
// concept signals in the humanities and sciences.
function extractProperPhrases(content) {
  const found = [];
  const pattern = /[A-Z][a-zA-Z-]+(?: (?:of |the |and )?[A-Z][a-zA-Z-]+){1,3}/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const start = match.index;
    const before = content.slice(0, start).trimEnd();
    // skip sentence starters — only mid-sentence capitals are meaningful
    if (!before || /[.!?:\n]$/.test(before)) continue;
    if (match[0].length <= 44) found.push(match[0]);
    if (found.length >= 3) break;
  }
  return found;
}

function extractConcepts(content, domainHints = []) {
  const text = content.toLowerCase();
  const matches = new Set();
  for (const concept of [...domainHints, ...CS_TERMS]) {
    if (text.includes(concept.toLowerCase())) matches.add(concept.toLowerCase().replace(/s$/, ""));
  }
  const quoted = content.match(/"([^"]{3,40})"/g) || [];
  for (const item of quoted.slice(0, 3)) matches.add(item.replaceAll('"', ""));
  for (const phrase of extractAskedPhrases(content)) matches.add(phrase);
  for (const phrase of extractProperPhrases(content)) matches.add(phrase);
  return Array.from(matches).slice(0, 6);
}

function detectMisconception(content) {
  const text = content.toLowerCase();
  if (text.includes("pointer") && (text.includes("stores the value") || text.includes("holds the value"))) {
    return {
      concept: "pointer",
      belief: "Pointer stores the value itself.",
      correction: "A pointer stores an address; dereferencing accesses the value at that address.",
    };
  }
  if (text.includes("array") && text.includes("same as pointer")) {
    return {
      concept: "array",
      belief: "Arrays and pointers are exactly the same.",
      correction: "Arrays can decay to pointers in expressions, but they are not identical objects.",
    };
  }
  if (/heavier (?:objects?|things?) falls? faster/.test(text)) {
    return {
      concept: "gravity",
      belief: "Heavier objects fall faster.",
      correction: "In a vacuum all objects fall at the same rate; air resistance, not weight, causes the difference.",
    };
  }
  if (/only use (?:about )?10% of (?:our|your|the) brain/.test(text)) {
    return {
      concept: "brain function",
      belief: "We only use 10% of our brain.",
      correction: "Virtually all brain regions are active over a day; the 10% figure is a myth.",
    };
  }
  if (/evolution .{0,30}just a theory/.test(text)) {
    return {
      concept: "evolution",
      belief: "Evolution is 'just a theory' (a guess).",
      correction: "In science a theory is a well-tested explanatory framework; evolution is supported by overwhelming evidence.",
    };
  }
  return null;
}

function normalizeConcept(label) {
  const clean = String(label || "").trim().replace(/\s+/g, " ");
  if (!clean) return null;
  return { key: clean.toLowerCase(), label: clean[0].toUpperCase() + clean.slice(1) };
}

function statusFromConfidence(confidence, fallback) {
  if (confidence < 0.28) return "weak";
  if (confidence > 0.72) return "strong";
  return fallback || "learning";
}

function prependItems(items, texts) {
  const entries = texts.filter(Boolean).map((text) => ({ id: makeId(), text, createdAt: Date.now() }));
  return prependRaw(items, entries, 8);
}

function prependRaw(items, entries, limit) {
  const list = Array.isArray(entries) ? entries : [entries];
  return [...list, ...(Array.isArray(items) ? items : [])].slice(0, limit);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function yesterdayKey() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return localDateKey(date);
}

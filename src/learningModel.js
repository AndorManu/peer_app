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
};

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
    streak: {
      count: 0,
      lastStudyDate: "",
      sessions: 0,
      messagesToday: 0,
    },
    updatedAt: Date.now(),
  };
}

export function makeMastery() {
  return {
    concepts: [],
    misconceptions: [],
    reflections: [],
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

export function buildTeachingRecipe(profile, project, mode) {
  const p = normalizeProfile(profile);
  const recipe = [];
  if (p.explanationDepth === "simple") recipe.push("Use simple depth: tiny steps, low jargon, one concrete analogy.");
  if (p.explanationDepth === "expert") recipe.push("Use expert depth: precise terminology, edge cases, and tradeoffs.");
  if (p.explanationDepth === "exam") recipe.push("Use exam depth: recall prompts, common traps, and a short practice check.");
  if (p.preferences.concise > 0 || p.signals.tooLong > 0) recipe.push("Keep the first answer concise; expand only if asked.");
  if (p.preferences.simple >= p.preferences.technical || p.signals.tooAdvanced > 0) recipe.push("Start with plain language and define key terms.");
  if (p.preferences.exampleFirst > 0 || p.preferences.visual > 0) recipe.push("Use a concrete example or analogy before abstraction.");
  if (p.preferences.technical > p.preferences.simple) recipe.push("Include precise terminology and small code-shaped examples when relevant.");
  if (p.preferences.socratic > 0 || mode === "quiz" || mode === "duck") recipe.push("Ask one focused check question instead of multiple questions.");
  if (p.traits.frustrationPhrases > 0 || p.traits.confusionPhrases > 1) recipe.push("Reduce cognitive load and avoid long theory blocks.");
  if (project?.mastery?.concepts?.some((concept) => concept.status === "weak")) recipe.push("Reinforce weak concepts before introducing new ones.");
  if (!recipe.length) recipe.push("Use a short explanation, one example, and one check question.");
  return recipe.slice(0, 6);
}

export function buildSkillTree(project, subject = "Current subject") {
  const mastery = normalizeMastery(project?.mastery);
  const groups = [
    { id: "foundations", label: "Foundations", match: ["variable", "function", "loop", "array", "memory"] },
    { id: "advanced", label: "Advanced concepts", match: ["pointer", "recursion", "struct", "algorithm", "binary search"] },
    { id: "tools", label: "Tools and practice", match: ["debugging", "terminal", "compile", "api", "react", "component", "state", "network", "cybersecurity"] },
  ];
  const nodes = groups.map((group) => ({
    ...group,
    concepts: mastery.concepts.filter((concept) => group.match.some((term) => concept.key.includes(term))),
  }));
  const used = new Set(nodes.flatMap((group) => group.concepts.map((concept) => concept.id)));
  const other = mastery.concepts.filter((concept) => !used.has(concept.id));

  return {
    label: project?.name || subject || "Current subject",
    groups: [
      ...nodes,
      ...(other.length ? [{ id: "other", label: "Emerging topics", concepts: other }] : []),
    ].filter((group) => group.concepts.length),
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

export function updateMasteryFromMessage(mastery, content) {
  const next = normalizeMastery(mastery);
  const concepts = extractConcepts(content);
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

export function updateMasteryFromFeedback(mastery, feedback, activeText = "") {
  const next = normalizeMastery(mastery);
  const concepts = extractConcepts(activeText);
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

function extractConcepts(content) {
  const text = content.toLowerCase();
  const matches = new Set();
  const known = [
    "pointer", "pointers", "array", "arrays", "recursion", "binary search", "memory", "malloc", "free",
    "function", "loop", "struct", "api", "react", "state", "component", "variable", "algorithm",
    "cybersecurity", "network", "terminal", "compile", "debugging",
  ];
  for (const concept of known) {
    if (text.includes(concept)) matches.add(concept.replace(/s$/, ""));
  }
  const quoted = content.match(/"([^"]{3,40})"/g) || [];
  for (const item of quoted.slice(0, 3)) matches.add(item.replaceAll('"', ""));
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

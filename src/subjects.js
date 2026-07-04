// ============================================================================
// Peer — universal subject taxonomy
// The single source of truth for what Peer can teach. Every feature (tutor
// prompt, practice generator, flashcards, notes, brain, rooms, future badges)
// reads the learner's domain from here and adapts its representation.
//
// Pure data + pure functions on purpose: no React, no icon components, so this
// module can be unit-tested under `node --test` and imported anywhere. Icon
// names map to lucide components in constants.js (DOMAIN_ICONS).
// ============================================================================

export const DOMAINS = [
  {
    id: "math",
    label: "Mathematics",
    icon: "sigma",
    accent: "#8b5cf6",
    subjects: ["Arithmetic", "Algebra", "Geometry", "Trigonometry", "Precalculus", "Calculus", "Linear Algebra", "Statistics & Probability", "Discrete Math"],
    keywords: ["math", "mathematics", "algebra", "geometry", "trigonometry", "trig", "precalculus", "precalc", "calculus", "linear algebra", "statistics", "probability", "discrete math", "arithmetic", "number theory", "differential equations", "wiskunde"],
    conceptHints: ["derivative", "integral", "limit", "function", "equation", "matrix", "vector", "eigenvalue", "probability", "distribution", "proof", "theorem", "fraction", "polynomial", "logarithm", "slope"],
    teach: "Show worked, step-by-step solutions and verify each algebraic step. Write ALL mathematical notation in LaTeX ($...$ inline, $$...$$ for display equations). Build intuition for why a method works, then have the learner try one.",
    practice: "worked problems that mix procedure and concept, one at a time, from easier to harder",
  },
  {
    id: "science",
    label: "Natural Sciences",
    icon: "atom",
    accent: "#22d3ee",
    subjects: ["Physics", "Chemistry", "Biology", "Earth Science", "Astronomy", "Environmental Science"],
    keywords: ["science", "physics", "chemistry", "chem", "biology", "bio", "earth science", "astronomy", "astrophysics", "environmental", "geology", "genetics", "ecology", "botany", "zoology", "biochemistry", "natuurkunde", "scheikunde", "biologie"],
    conceptHints: ["energy", "force", "atom", "molecule", "reaction", "cell", "photosynthesis", "evolution", "gravity", "momentum", "electron", "bond", "acid", "enzyme", "dna", "ecosystem", "wave", "velocity"],
    teach: "Explain processes and mechanisms step by step (cause → effect). Use LaTeX for formulas and equations, define every term on first use, and anchor ideas in concrete phenomena or simple thought experiments.",
    practice: "mechanism and process questions plus one quantitative problem when the topic has math",
  },
  {
    id: "cs",
    label: "Computer Science",
    icon: "code",
    accent: "#84cc16",
    subjects: ["Programming", "Data Structures & Algorithms", "Web Development", "Databases", "Networking", "Operating Systems", "AI / Machine Learning", "Cybersecurity"],
    keywords: ["programming", "coding", "computer science", "software", "javascript", "typescript", "python", "java", "c programming", "c++", "rust", "golang", "web dev", "algorithms", "data structures", "database", "sql", "networking", "operating systems", "machine learning", "artificial intelligence", "cybersecurity", "react", "frontend", "backend", "devops", "informatica"],
    conceptHints: ["pointer", "array", "recursion", "function", "loop", "variable", "algorithm", "data structure", "class", "api", "memory", "compile", "debugging", "state", "component", "database", "query", "thread", "encryption"],
    teach: "Use small, runnable code examples in fenced code blocks, trace execution line by line when helpful, and connect syntax to the underlying concept. Encourage the learner to predict output before revealing it.",
    practice: "small coding or tracing exercises with a concrete expected output",
  },
  {
    id: "language",
    label: "Languages & Linguistics",
    icon: "languages",
    accent: "#34d399",
    subjects: ["English", "Spanish", "French", "German", "Mandarin", "Japanese", "Arabic", "ESL / EFL", "Grammar", "Pronunciation", "Linguistics"],
    keywords: ["language", "spanish", "french", "german", "mandarin", "chinese", "japanese", "arabic", "english", "dutch", "italian", "portuguese", "korean", "russian", "turkish", "grammar", "vocabulary", "vocab", "esl", "efl", "linguistics", "pronunciation", "conjugation", "espanol", "frans", "duits", "engels", "nederlands"],
    conceptHints: ["vocabulary", "conjugation", "tense", "grammar", "pronunciation", "noun", "verb", "adjective", "subjunctive", "article", "plural", "idiom", "phrase", "sentence structure", "gender", "case"],
    teach: "Practice actively in the target language: vocabulary with example sentences, conjugation and grammar tables (markdown tables), and short dialogues. Correct errors gently, explain the rule briefly, and always give the learner a chance to produce the language themselves.",
    practice: "active production: translate, fill the gap, or respond in the target language, with gentle correction",
  },
  {
    id: "humanities",
    label: "Humanities",
    icon: "landmark",
    accent: "#f59e0b",
    subjects: ["World History", "US History", "European History", "Philosophy", "Religious Studies", "Literature", "Writing & Composition", "Art History", "Classics"],
    keywords: ["history", "philosophy", "religion", "theology", "literature", "writing", "composition", "essay", "art history", "classics", "mythology", "ethics", "poetry", "rhetoric", "geschiedenis", "filosofie"],
    conceptHints: ["revolution", "empire", "treaty", "movement", "argument", "thesis", "source", "primary source", "context", "cause", "effect", "period", "dynasty", "reform", "ideology", "narrative", "theme", "symbolism"],
    teach: "Use timelines, primary sources, and cause-and-effect chains. Always anchor events with who/when/where, present multiple interpretations where historians or critics disagree, and build arguments rather than lists of facts.",
    practice: "evidence-based questions: order events, explain causes, or defend a short thesis",
  },
  {
    id: "social",
    label: "Social Sciences",
    icon: "globe",
    accent: "#fb923c",
    subjects: ["Psychology", "Sociology", "Anthropology", "Political Science", "Geography", "Economics"],
    keywords: ["psychology", "sociology", "anthropology", "political science", "politics", "geography", "economics", "econ", "microeconomics", "macroeconomics", "civics", "international relations", "psychologie", "economie"],
    conceptHints: ["supply", "demand", "elasticity", "cognition", "conditioning", "bias", "culture", "institution", "policy", "market", "inflation", "identity", "socialization", "development", "attachment", "norm"],
    teach: "Ground every theory in real studies and everyday examples. Name the key researchers and models, compare competing explanations, and distinguish correlation from causation explicitly.",
    practice: "apply-the-theory scenarios: given a situation, identify the concept and justify it",
  },
  {
    id: "business",
    label: "Business & Finance",
    icon: "briefcase",
    accent: "#2dd4bf",
    subjects: ["Accounting", "Finance", "Marketing", "Management", "Entrepreneurship", "Personal Finance"],
    keywords: ["business", "finance", "accounting", "marketing", "management", "entrepreneurship", "personal finance", "investing", "sales", "bookkeeping", "startup", "boekhouden"],
    conceptHints: ["revenue", "profit", "cash flow", "balance sheet", "interest", "compound interest", "equity", "asset", "liability", "margin", "valuation", "budget", "roi", "market segment", "brand", "diversification"],
    teach: "Use realistic scenarios and worked numeric examples (LaTeX for formulas like compound interest). Connect every concept to a decision someone would actually make with real money or a real team.",
    practice: "scenario decisions with small calculations and a justification",
  },
  {
    id: "health",
    label: "Health & Medicine",
    icon: "heart",
    accent: "#fb7185",
    subjects: ["Anatomy & Physiology", "Nursing", "Pharmacology", "Nutrition", "Public Health", "Pre-med Sciences"],
    keywords: ["medicine", "medical", "nursing", "pharmacology", "nutrition", "public health", "anatomy", "physiology", "pre-med", "premed", "kinesiology", "dentistry", "epidemiology", "pathology", "geneeskunde", "anatomie"],
    conceptHints: ["organ", "system", "homeostasis", "hormone", "receptor", "dose", "pathogen", "immune", "diagnosis", "symptom", "artery", "neuron", "metabolism", "vitamin", "infection", "pharmacokinetics"],
    teach: "Structure by body systems and mechanisms (structure → function → dysfunction). Use precise clinical terminology with a plain-language gloss the first time, offer mnemonic-friendly summaries, and connect findings back to physiology.",
    practice: "structure-function questions and short clinical vignettes with one clear answer",
  },
  {
    id: "engineering",
    label: "Engineering",
    icon: "cog",
    accent: "#818cf8",
    subjects: ["Mechanical", "Electrical", "Civil", "Chemical", "Software", "Aerospace"],
    keywords: ["engineering", "mechanical", "electrical", "civil engineering", "chemical engineering", "aerospace", "robotics", "circuits", "statics", "dynamics", "thermodynamics", "materials science", "control systems", "werktuigbouw"],
    conceptHints: ["stress", "strain", "torque", "circuit", "voltage", "current", "resistance", "load", "beam", "efficiency", "entropy", "heat transfer", "fluid", "tolerance", "feedback", "signal"],
    teach: "Work from first principles with worked calculations in LaTeX. State assumptions explicitly, check units at every step, and connect the math to the physical system being designed.",
    practice: "worked design/analysis problems with unit checks",
  },
  {
    id: "arts",
    label: "Arts & Music",
    icon: "music",
    accent: "#e879f9",
    subjects: ["Music Theory", "Instruments", "Visual Arts", "Design", "Photography", "Film", "Creative Writing"],
    keywords: ["music", "music theory", "instrument", "guitar", "piano", "violin", "singing", "visual arts", "drawing", "painting", "design", "photography", "film", "creative writing", "sculpture", "dance", "theater", "muziek", "tekenen"],
    conceptHints: ["interval", "chord", "scale", "key signature", "rhythm", "harmony", "melody", "cadence", "composition", "perspective", "color theory", "contrast", "exposure", "framing", "plot", "character"],
    teach: "For music: use note names, intervals, and chord symbols in text (e.g. C–E–G, ii–V–I), and tie every idea to something the learner can play, sing, or listen for. For visual arts and writing: name the technique, show a concrete example, then set a tiny exercise.",
    practice: "ear/eye training: identify, complete, or produce a small piece using the concept",
  },
  {
    id: "testprep",
    label: "Test Prep",
    icon: "graduation",
    accent: "#a78bfa",
    subjects: ["SAT", "ACT", "GRE", "GMAT", "LSAT", "MCAT", "AP / IB Exams", "TOEFL / IELTS", "Bar Exam"],
    keywords: ["sat", "act", "gre", "gmat", "lsat", "mcat", "toefl", "ielts", "bar exam", "ap", "ib", "exam prep", "test prep", "entrance exam", "a-level", "gcse", "eindexamen", "staatsexamen", "cito"],
    conceptHints: ["timing", "strategy", "elimination", "passage", "question type", "trap answer", "score", "section", "pacing", "review", "practice test", "recall"],
    teach: "Teach to the test: use the exam's actual question formats, one question at a time, then debrief the trap answers. Cover timing strategy and process of elimination explicitly, and schedule spaced recall of misses.",
    practice: "realistic exam-format questions, timed where useful, with trap-answer debriefs",
  },
  {
    id: "life",
    label: "Life & Practical Skills",
    icon: "compass",
    accent: "#fbbf24",
    subjects: ["Study Skills", "Productivity", "Public Speaking", "Financial Literacy", "Digital Literacy"],
    keywords: ["study skills", "productivity", "public speaking", "financial literacy", "digital literacy", "time management", "note taking", "speed reading", "first aid", "cooking", "driving theory", "typing", "life skills", "presentation"],
    conceptHints: ["habit", "routine", "checklist", "priority", "deadline", "outline", "audience", "budget", "saving", "password", "backup", "posture", "practice", "feedback loop"],
    teach: "Be practical and concrete: short checklists, real-life scenarios, and one immediate small action the learner can do today. Skip theory unless it changes what they should do.",
    practice: "do-it-now micro-exercises applied to the learner's real situation",
  },
];

// Fallback for anything that doesn't classify — still teaches well.
export const GENERAL_DOMAIN = {
  id: "general",
  label: "General",
  icon: "brain",
  accent: "#6d5ef0",
  subjects: [],
  keywords: [],
  conceptHints: [],
  teach: "Match the representation to the subject: worked LaTeX steps for quantitative topics, timelines for historical ones, tables for languages, and described diagrams for processes.",
  practice: "a mix of recall and application questions suited to the topic",
};

const ALL = [...DOMAINS, GENERAL_DOMAIN];
const BY_ID = new Map(ALL.map((domain) => [domain.id, domain]));

// Word-boundary matching so short tokens ("ap", "act", "ib") don't fire inside
// ordinary words. Multi-word keywords match as phrases.
function keywordRegex(keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9+])${escaped}($|[^a-z0-9])`, "i");
}

const MATCHERS = DOMAINS.map((domain) => ({
  id: domain.id,
  // Test-prep names ("MCAT", "AP US History") usually also contain a subject
  // word; the exam format should win, so its hits weigh double.
  weight: domain.id === "testprep" ? 2 : 1,
  regexes: domain.keywords.map(keywordRegex),
}));

export function getDomain(id) {
  return BY_ID.get(id) || GENERAL_DOMAIN;
}

// Best-guess domain for a free-text subject name (plus optional extra context
// text such as goals or document names). Returns a domain id, "general" when
// nothing matches.
export function classifySubject(name, extraText = "") {
  const text = `${name || ""} ${extraText || ""}`.toLowerCase();
  if (!text.trim()) return "general";

  let best = null;
  let bestScore = 0;
  for (const matcher of MATCHERS) {
    let score = 0;
    for (const regex of matcher.regexes) {
      if (regex.test(text)) score += matcher.weight;
    }
    if (score > bestScore) {
      bestScore = score;
      best = matcher.id;
    }
  }
  return best || "general";
}

// Domain for a project: explicit choice wins, otherwise inferred from name.
export function domainForProject(project) {
  if (project?.domainId && BY_ID.has(project.domainId)) return getDomain(project.domainId);
  return getDomain(classifySubject(project?.name || ""));
}

// Concept-extraction hints for a domain (used by the learning model + brain).
export function domainConceptHints(domainId) {
  return getDomain(domainId).conceptHints;
}

// Static UI option data shared across the app. Kept separate from App.jsx so
// the option lists can be imported by individual components and tested in
// isolation without pulling in the whole app tree.
import {
  Atom,
  BookOpen,
  Brain,
  Briefcase,
  Code2,
  Cog,
  Compass,
  Flame,
  Globe2,
  GraduationCap,
  HeartPulse,
  Image as ImageIcon,
  Landmark,
  Languages,
  Layers,
  Lightbulb,
  Megaphone,
  MessageSquare,
  Music,
  Save,
  Sigma,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";

// Icon components for badge medallions beyond the domain set (badges.js stays
// React-free; names live there, components here).
export const BADGE_ICONS = {
  spark: Sparkles,
  flame: Flame,
  notes: Save,
  trending: TrendingUp,
  cards: BookOpen,
  megaphone: Megaphone,
  users: Users,
  image: ImageIcon,
};

// Icon components for the subject taxonomy (subjects.js stays React-free so it
// can be unit-tested; the icon *names* live there, the components live here).
export const DOMAIN_ICONS = {
  sigma: Sigma,
  atom: Atom,
  code: Code2,
  languages: Languages,
  landmark: Landmark,
  globe: Globe2,
  briefcase: Briefcase,
  heart: HeartPulse,
  cog: Cog,
  music: Music,
  graduation: GraduationCap,
  compass: Compass,
  brain: Brain,
};

export const PROJECT_COLORS = ["#6d5dfc", "#12a594", "#ef6f6c", "#e2a93b", "#2f9ed8", "#d65a9f"];

export const FONT_OPTIONS = [
  { id: "inter", label: "Work Sans", family: "'Work Sans', 'Inter', system-ui, sans-serif" },
  { id: "system", label: "System", family: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { id: "opendyslexic", label: "OpenDyslexic", tag: "Dyslexia font", family: "'OpenDyslexicRegular', 'Comic Sans MS', Verdana, sans-serif" },
  { id: "atkinson", label: "Atkinson Hyperlegible", tag: "High legibility", family: "'Atkinson Hyperlegible', 'Inter', system-ui, sans-serif" },
  { id: "lexend", label: "Lexend", tag: "Readable sans", family: "'Lexend', 'Inter', system-ui, sans-serif" },
  { id: "serif", label: "Readable Serif", family: "Georgia, 'Times New Roman', serif" },
  { id: "mono", label: "Mono", family: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace" },
];

export const LANGUAGE_OPTIONS = [
  { value: "auto", label: "Match my language" },
  { value: "en", label: "English" },
  { value: "nl", label: "Dutch / Nederlands" },
  { value: "mixed", label: "Mixed Dutch/English" },
  { value: "es", label: "Spanish / Espanol" },
  { value: "fr", label: "French / Francais" },
  { value: "de", label: "German / Deutsch" },
  { value: "pt", label: "Portuguese / Portugues" },
  { value: "it", label: "Italian / Italiano" },
  { value: "tr", label: "Turkish / Turkce" },
  { value: "ar", label: "Arabic / Al-Arabiyyah" },
];

export const STUDY_MODES = [
  { id: "auto", label: "Auto", icon: Brain, prompt: "Adapt naturally to the learner." },
  { id: "explain", label: "Explain", icon: Lightbulb, prompt: "Explain clearly with a compact example." },
  { id: "quiz", label: "Quiz", icon: Target, prompt: "Ask one question at a time and wait for the learner." },
  { id: "duck", label: "Rubber duck", icon: MessageSquare, prompt: "Let the learner explain first, then gently inspect gaps." },
  { id: "challenge", label: "Challenge", icon: Trophy, prompt: "Turn the topic into a small level or mini challenge." },
  { id: "visual", label: "Visual", icon: Layers, prompt: "Use mental models, analogies, and simple diagrams in text." },
  { id: "exam", label: "Exam prep", icon: GraduationCap, prompt: "Focus on recall, traps, and exam-style checks." },
  { id: "codeReview", label: "Code review", icon: Code2, prompt: "Review code precisely and explain tradeoffs." },
];

export const DEPTH_OPTIONS = [
  { id: "simple", label: "Simple", hint: "Tiny steps, low jargon" },
  { id: "normal", label: "Normal", hint: "Balanced explanation" },
  { id: "expert", label: "Expert", hint: "Precise terms and edge cases" },
  { id: "exam", label: "Exam", hint: "Recall, traps, practice" },
];

export const LEVEL_OPTIONS = [
  { id: "beginner", label: "Beginner", hint: "Start from fundamentals" },
  { id: "intermediate", label: "Intermediate", hint: "Assume basics, build fluency" },
  { id: "advanced", label: "Advanced", hint: "Go deeper into tradeoffs" },
  { id: "exam", label: "Exam focused", hint: "Prioritize recall and traps" },
];

export const LEARNING_STYLE_OPTIONS = [
  { id: "auto", label: "Let Peer adapt" },
  { id: "visual", label: "Visual diagrams" },
  { id: "examples", label: "Examples first" },
  { id: "socratic", label: "Guided questions" },
  { id: "challenge", label: "Mini challenges" },
  { id: "code", label: "Precise & technical" },
];

// One challenge per domain family — learning any subject should feel invited.
export const COMMUNITY_CHALLENGES = [
  { id: "math-proof", subject: "Math", title: "Explain then prove", level: "Intermediate", prompt: "Give me a peer-teaching challenge where I explain a theorem idea, then prove a small case. Use LaTeX for the math." },
  { id: "sci-mechanism", subject: "Science", title: "Mechanism chain", level: "Beginner", prompt: "Run a science challenge: pick a process (like photosynthesis or plate tectonics), have me build the cause-effect chain step by step, and check each link." },
  { id: "lang-recall", subject: "Languages", title: "Active recall dialogue", level: "Beginner", prompt: "Run a language-learning challenge using short dialogue, correction, and spaced recall." },
  { id: "hist-timeline", subject: "History", title: "Timeline detective", level: "Beginner", prompt: "Run a history challenge: give me shuffled events around one turning point, have me order them and defend the causal links." },
  { id: "biz-case", subject: "Business", title: "Decision case sprint", level: "Intermediate", prompt: "Give me a short business case with real numbers. I decide and justify; you probe my reasoning and show the worked math." },
  { id: "med-vignette", subject: "Medicine", title: "System to symptom", level: "Intermediate", prompt: "Run a physiology challenge: pick a body system, quiz me from structure to function to what happens when it fails." },
  { id: "music-ear", subject: "Music", title: "Interval builder", level: "Beginner", prompt: "Run a music theory challenge on intervals and chords, building from notes I already know, one question at a time." },
  { id: "c-pointers", subject: "Coding", title: "Pointer address lab", level: "Beginner", prompt: "Give me a 20-minute C pointer challenge with checkpoints, hints, and one final self-test." },
];

export const STARTERS = [
  {
    icon: Lightbulb,
    title: "Explain a concept",
    sub: "Any subject, in plain language",
    prompt: "Explain how photosynthesis works, in plain language with one simple example.",
    mode: "explain",
  },
  {
    icon: Layers,
    title: "Make it click",
    sub: "Analogies, diagrams, timelines",
    prompt: "Explain supply and demand using a simple analogy and a small diagram.",
    mode: "visual",
  },
  {
    icon: Target,
    title: "Quiz me",
    sub: "Test recall, one question at a time",
    prompt: "Quiz me on world capitals. Ask one question at a time and wait for my answer.",
    mode: "quiz",
  },
  {
    icon: MessageSquare,
    title: "Teach it back",
    sub: "I explain, Peer finds the gaps",
    prompt: "I want to explain a topic to you so you can check if I really understand it. Ready?",
    mode: "duck",
  },
];

export const AUTH_PROVIDERS = [
  { id: "google", label: "Google", badge: "G" },
  { id: "facebook", label: "Facebook", badge: "f" },
  { id: "email", label: "email", badge: "@" },
];

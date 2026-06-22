// Static UI option data shared across the app. Kept separate from App.jsx so
// the option lists can be imported by individual components and tested in
// isolation without pulling in the whole app tree.
import {
  Brain,
  Code2,
  GraduationCap,
  Layers,
  Lightbulb,
  MessageSquare,
  Target,
  Trophy,
} from "lucide-react";

export const PROJECT_COLORS = ["#6d5dfc", "#12a594", "#ef6f6c", "#e2a93b", "#2f9ed8", "#d65a9f"];

export const FONT_OPTIONS = [
  { id: "inter", label: "Inter", family: "'Inter', system-ui, sans-serif" },
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
  { id: "code", label: "Code tutor" },
];

export const COMMUNITY_CHALLENGES = [
  { id: "c-pointers", subject: "C", title: "Pointer address lab", level: "Beginner", prompt: "Give me a 20-minute C pointer challenge with checkpoints, hints, and one final self-test." },
  { id: "cyber-web", subject: "Cybersecurity", title: "Web threat model sprint", level: "Intermediate", prompt: "Create a practical web security challenge about authentication mistakes, with hints and a debrief." },
  { id: "math-proof", subject: "Math", title: "Explain then prove", level: "Intermediate", prompt: "Give me a peer-teaching challenge where I explain a theorem idea, then prove a small case." },
  { id: "lang-recall", subject: "Languages", title: "Active recall dialogue", level: "Beginner", prompt: "Run a language-learning challenge using short dialogue, correction, and spaced recall." },
];

export const STARTERS = [
  {
    icon: Code2,
    title: "Explain a concept",
    sub: "Pointers, recursion, arrays, memory",
    prompt: "Can you explain how pointers work in C?",
    mode: "explain",
  },
  {
    icon: Lightbulb,
    title: "Try another angle",
    sub: "Analogies and visual models",
    prompt: "Explain recursion with a simple analogy.",
    mode: "visual",
  },
  {
    icon: Target,
    title: "Quiz me",
    sub: "One question at a time",
    prompt: "Quiz me on binary search. Ask one question at a time.",
    mode: "quiz",
  },
  {
    icon: MessageSquare,
    title: "Rubber duck",
    sub: "I explain, Peer checks the gaps",
    prompt: "I want to explain a concept to you so you can check if I really get it. Ready?",
    mode: "duck",
  },
];

export const AUTH_PROVIDERS = [
  { id: "google", label: "Google", hint: "Best for Gmail and school accounts", badge: "G" },
  { id: "github", label: "GitHub", hint: "Useful for coding learners", badge: "GH" },
  { id: "microsoft", label: "Microsoft", hint: "Works well for Outlook and school tenants", badge: "MS" },
  { id: "discord", label: "Discord", hint: "Good for study communities", badge: "D" },
  { id: "email", label: "Email code", hint: "Use any email address", badge: "@" },
];

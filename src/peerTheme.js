// ============================================================================
// Peer — Visual Identity Rebuild · central design tokens
// Single source of truth for the design handoff (Peer.dc.html). Every color,
// gradient, font, radius, shadow, and easing the reskin uses lives here so
// screens stay pixel-consistent. Components import `T` and spread token objects
// into inline styles, exactly as the prototype did.
// ============================================================================

// Spring easing — used on EVERY transition in the design. Never `transition: all`.
export const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

export const COLORS = {
  bg: "#07070e",
  bgPanelDeep: "#0a0a14", // avatar inner, card faces
  bgPanelDeeper: "#0b0b16",
  bgTooltip: "rgba(12,12,22,0.9)",

  // accent ramp
  violet: "#8b5cf6",
  violetSoft: "#a78bfa",
  violetFaint: "#a5b4fc",
  indigo: "#818cf8",
  cyan: "#22d3ee",

  // semantic
  amber: "#f59e0b",
  amberText: "#fbbf24",
  orange: "#fb923c",
  green: "#34d399",
  rose: "#fb7185",
  fuchsia: "#e879f9",
  teal: "#2dd4bf",

  // text (white alphas — match the design exactly)
  text: "rgba(255,255,255,0.92)",
  text86: "rgba(255,255,255,0.86)",
  text80: "rgba(255,255,255,0.8)",
  text78: "rgba(255,255,255,0.78)",
  text70: "rgba(255,255,255,0.7)",
  text60: "rgba(255,255,255,0.6)",
  text55: "rgba(255,255,255,0.55)",
  text50: "rgba(255,255,255,0.5)",
  text45: "rgba(255,255,255,0.45)",
  text42: "rgba(255,255,255,0.42)",
  text40: "rgba(255,255,255,0.4)",
  text35: "rgba(255,255,255,0.35)",
  text34: "rgba(255,255,255,0.34)",
  text32: "rgba(255,255,255,0.32)",
  text30: "rgba(255,255,255,0.3)",
  text28: "rgba(255,255,255,0.28)",
};

// surface tints (white-alpha fills used for glass panels/cards)
export const SURFACE = {
  s014: "rgba(255,255,255,0.014)",
  s018: "rgba(255,255,255,0.018)",
  s022: "rgba(255,255,255,0.022)",
  s025: "rgba(255,255,255,0.025)",
  s03: "rgba(255,255,255,0.03)",
  s035: "rgba(255,255,255,0.035)",
  s04: "rgba(255,255,255,0.04)",
  s05: "rgba(255,255,255,0.05)",
  s06: "rgba(255,255,255,0.06)",
  s07: "rgba(255,255,255,0.07)",
  s08: "rgba(255,255,255,0.08)",
  s09: "rgba(255,255,255,0.09)",
  s12: "rgba(255,255,255,0.12)",
};

export const BORDER = {
  faint: "1px solid rgba(255,255,255,0.05)",
  soft: "1px solid rgba(255,255,255,0.06)",
  s07: "1px solid rgba(255,255,255,0.07)",
  s08: "1px solid rgba(255,255,255,0.08)",
  s09: "1px solid rgba(255,255,255,0.09)",
  s1: "1px solid rgba(255,255,255,0.1)",
  s12: "1px solid rgba(255,255,255,0.12)",
};

export const GRADIENTS = {
  // the signature accent — violet → cyan
  accent: "linear-gradient(135deg,#8b5cf6,#22d3ee)",
  accent140: "linear-gradient(140deg,#8b5cf6,#22d3ee)",
  accent155: "linear-gradient(155deg,rgba(139,92,246,0.95),rgba(34,211,238,0.85))",
  accentCyanViolet: "linear-gradient(135deg,#22d3ee,#8b5cf6)",
  userBubble: "linear-gradient(135deg,rgba(139,92,246,0.18),rgba(34,211,238,0.12))",
  cardBack: "linear-gradient(150deg,rgba(139,92,246,0.16),rgba(34,211,238,0.10))",
  avatarWarm: "linear-gradient(140deg,#fb923c,#fb7185)",
  notesAccent: "linear-gradient(135deg,#f59e0b,#fb7185)",
  liveBtn: "linear-gradient(135deg,#34d399,#22d3ee)",
  caret: "linear-gradient(180deg,#8b5cf6,#22d3ee)",
};

export const FONTS = {
  sans: "Geist, system-ui, sans-serif",
  display: "'Space Grotesk', sans-serif",
  mono: "'Geist Mono', monospace",
};

export const RADII = {
  xs: "4px",
  sm: "8px",
  md: "10px",
  lg: "11px",
  xl: "13px",
  x2: "14px",
  x3: "16px",
  x4: "18px",
  x5: "20px",
  pill: "999px",
};

export const SHADOW = {
  glowViolet: "0 0 22px -2px rgba(139,92,246,.8)",
  glowAccentBtn: "0 0 20px -4px rgba(139,92,246,0.8)",
  inputFocus:
    "0 0 0 1px rgba(139,92,246,0.4),0 0 44px -10px rgba(139,92,246,0.55),0 0 60px -14px rgba(34,211,238,0.4)",
  inputRest: "0 14px 44px -26px rgba(0,0,0,0.9)",
  peerBubble: "-14px 0 44px -26px rgba(139,92,246,0.9)",
  navPill: "0 6px 22px -4px rgba(139,92,246,0.7),0 0 0 1px rgba(255,255,255,0.06)",
  modePill: "0 0 22px -4px rgba(139,92,246,0.8),0 4px 14px -4px rgba(34,211,238,0.6)",
  tooltip: "0 8px 24px -10px rgba(0,0,0,0.9)",
};

// Three.js brain node colors (project=violet, concept=cyan, weak=amber)
export const NODE_COLORS = { project: "#8b5cf6", concept: "#22d3ee", weak: "#f59e0b" };

// per-project color palette (cycled, matches the design's projColors)
export const PROJECT_PALETTE = [
  "#8b5cf6", "#22d3ee", "#34d399", "#fb7185", "#f59e0b",
  "#818cf8", "#e879f9", "#2dd4bf", "#fb923c",
];

// hex → rgba helper, identical to the prototype's hexA()
export function hexA(hex, a) {
  const h = String(hex || "#8b5cf6").replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// deterministically assign a palette color to a project id/name
export function projectColor(key, index = 0) {
  return PROJECT_PALETTE[index % PROJECT_PALETTE.length];
}

const T = {
  EASE, COLORS, SURFACE, BORDER, GRADIENTS, FONTS, RADII, SHADOW,
  NODE_COLORS, PROJECT_PALETTE, hexA, projectColor,
};
export default T;

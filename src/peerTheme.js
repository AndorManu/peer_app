// ============================================================================
// Peer — Visual Identity Rebuild · central design tokens
// Single source of truth for the design handoff (Peer.dc.html). Every color,
// gradient, font, radius, shadow, and easing the reskin uses lives here so
// screens stay pixel-consistent. Components import `T` and spread token objects
// into inline styles, exactly as the prototype did.
// ============================================================================

// Spring easing — used on EVERY transition in the design. Never `transition: all`.
export const EASE = "cubic-bezier(0.19, 1, 0.22, 1)";

export const COLORS = {
  bg: "#15120d",
  bgPanelDeep: "#1c1509", // avatar inner, card faces
  bgPanelDeeper: "#1c1509",
  bgTooltip: "rgba(28,24,17,0.9)",

  // accent ramp
  violet: "#e0a039",
  violetSoft: "#f0b354",
  violetFaint: "#a9b3bf",
  indigo: "#8a95a3",
  cyan: "#f0b354",

  // semantic
  amber: "#c9a875",
  amberText: "#d4b283",
  orange: "#b98a63",
  green: "#3f8f74",
  rose: "#c96a5a",
  fuchsia: "#b57ba6",
  teal: "#2dd4bf",

  // text (white alphas — match the design exactly)
  text: "rgba(244,232,213,0.92)",
  text86: "rgba(244,232,213,0.86)",
  text80: "rgba(244,232,213,0.8)",
  text78: "rgba(244,232,213,0.78)",
  text70: "rgba(244,232,213,0.7)",
  text60: "rgba(244,232,213,0.6)",
  /* low end compressed to keep >=4.5:1 on the warm ink surfaces (WCAG AA,
     M12) — names keep their original design-spec alphas for traceability */
  text55: "rgba(244,232,213,0.62)",
  text50: "rgba(244,232,213,0.6)",
  text45: "rgba(244,232,213,0.58)",
  text42: "rgba(244,232,213,0.58)",
  text40: "rgba(244,232,213,0.58)",
  text35: "rgba(244,232,213,0.35)",
  text34: "rgba(244,232,213,0.34)",
  text32: "rgba(244,232,213,0.32)",
  text30: "rgba(244,232,213,0.3)",
  text28: "rgba(244,232,213,0.28)",
};

// surface tints (white-alpha fills used for glass panels/cards)
export const SURFACE = {
  s014: "rgba(244,232,213,0.014)",
  s018: "rgba(244,232,213,0.018)",
  s022: "rgba(244,232,213,0.022)",
  s025: "rgba(244,232,213,0.025)",
  s03: "rgba(244,232,213,0.03)",
  s035: "rgba(244,232,213,0.035)",
  s04: "rgba(244,232,213,0.04)",
  s05: "rgba(244,232,213,0.05)",
  s06: "rgba(244,232,213,0.06)",
  s07: "rgba(244,232,213,0.07)",
  s08: "rgba(244,232,213,0.08)",
  s09: "rgba(244,232,213,0.09)",
  s12: "rgba(244,232,213,0.12)",
};

export const BORDER = {
  faint: "1px solid rgba(244,232,213,0.05)",
  soft: "1px solid rgba(244,232,213,0.06)",
  s07: "1px solid rgba(244,232,213,0.07)",
  s08: "1px solid rgba(244,232,213,0.08)",
  s09: "1px solid rgba(244,232,213,0.09)",
  s1: "1px solid rgba(244,232,213,0.1)",
  s12: "1px solid rgba(244,232,213,0.12)",
};

export const GRADIENTS = {
  // the signature accent — violet → cyan
  accent: "linear-gradient(135deg,#e0a039,#f0b354)",
  accent140: "linear-gradient(140deg,#e0a039,#f0b354)",
  accent155: "linear-gradient(155deg,rgba(224,160,57,0.95),rgba(240,179,84,0.85))",
  accentCyanViolet: "linear-gradient(135deg,#f0b354,#e0a039)",
  userBubble: "linear-gradient(135deg,rgba(224,160,57,0.18),rgba(240,179,84,0.12))",
  cardBack: "linear-gradient(150deg,rgba(224,160,57,0.16),rgba(240,179,84,0.10))",
  avatarWarm: "linear-gradient(140deg,#b98a63,#c96a5a)",
  notesAccent: "linear-gradient(135deg,#c9a875,#c96a5a)",
  liveBtn: "linear-gradient(135deg,#3f8f74,#f0b354)",
  caret: "linear-gradient(180deg,#e0a039,#f0b354)",
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
  glowViolet: "0 0 22px -2px rgba(224,160,57,.8)",
  glowAccentBtn: "0 0 20px -4px rgba(224,160,57,0.8)",
  inputFocus:
    "0 0 0 1px rgba(224,160,57,0.4),0 0 44px -10px rgba(224,160,57,0.55),0 0 60px -14px rgba(240,179,84,0.4)",
  inputRest: "0 14px 44px -26px rgba(0,0,0,0.9)",
  peerBubble: "-14px 0 44px -26px rgba(224,160,57,0.9)",
  navPill: "0 6px 22px -4px rgba(224,160,57,0.7),0 0 0 1px rgba(244,232,213,0.06)",
  modePill: "0 0 22px -4px rgba(224,160,57,0.8),0 4px 14px -4px rgba(240,179,84,0.6)",
  tooltip: "0 8px 24px -10px rgba(0,0,0,0.9)",
};

// Three.js brain node colors (project=violet, concept=cyan, weak=amber)
export const NODE_COLORS = { project: "#e0a039", concept: "#f0b354", weak: "#c9a875" };

// per-project color palette (cycled, matches the design's projColors)
export const PROJECT_PALETTE = [
  "#e0a039", "#f0b354", "#3f8f74", "#c96a5a", "#c9a875",
  "#8a95a3", "#b57ba6", "#2dd4bf", "#b98a63",
];

// hex → rgba helper, identical to the prototype's hexA()
export function hexA(hex, a) {
  const h = String(hex || "#e0a039").replace("#", "");
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

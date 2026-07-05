// ============================================================================
// Peer — Visual Identity Rebuild · central design tokens
// Single source of truth for the design handoff (Peer.dc.html). Every color,
// gradient, font, radius, shadow, and easing the reskin uses lives here so
// screens stay pixel-consistent. Components import `T` and spread token objects
// into inline styles, exactly as the prototype did.
// ============================================================================

// Spring easing — used on EVERY transition in the design. Never `transition: all`.
export const EASE = "cubic-bezier(0.19, 1, 0.22, 1)";

// Inline styles accept CSS var() strings, so these tokens follow the active
// data-theme (Study Hall / Indigo / Mono) with no component changes.
export const COLORS = {
  bg: "var(--sh-bg, #15120d)",
  bgPanelDeep: "var(--sh-accent-ink, #1c1509)", // avatar inner, card faces
  bgPanelDeeper: "var(--sh-accent-ink, #1c1509)",
  bgTooltip: "color-mix(in srgb, var(--sh-bg-2, #1c1811) 90%, transparent)",

  // accent ramp
  violet: "var(--sh-accent)",
  violetSoft: "var(--sh-accent-hi)",
  violetFaint: "#a9b3bf",
  indigo: "#8a95a3",
  cyan: "var(--sh-accent-hi)",

  // semantic
  amber: "#c9a875",
  amberText: "#d4b283",
  orange: "#b98a63",
  green: "#3f8f74",
  rose: "#c96a5a",
  fuchsia: "#b57ba6",
  teal: "#2dd4bf",

  // text (white alphas — match the design exactly)
  text: "rgba(var(--sh-text-rgb), 0.92)",
  text86: "rgba(var(--sh-text-rgb), 0.86)",
  text80: "rgba(var(--sh-text-rgb), 0.8)",
  text78: "rgba(var(--sh-text-rgb), 0.78)",
  text70: "rgba(var(--sh-text-rgb), 0.7)",
  text60: "rgba(var(--sh-text-rgb), 0.6)",
  /* low end compressed to keep >=4.5:1 on the warm ink surfaces (WCAG AA,
     M12) — names keep their original design-spec alphas for traceability */
  text55: "rgba(var(--sh-text-rgb), 0.62)",
  text50: "rgba(var(--sh-text-rgb), 0.6)",
  text45: "rgba(var(--sh-text-rgb), 0.58)",
  text42: "rgba(var(--sh-text-rgb), 0.58)",
  text40: "rgba(var(--sh-text-rgb), 0.58)",
  text35: "rgba(var(--sh-text-rgb), 0.35)",
  text34: "rgba(var(--sh-text-rgb), 0.34)",
  text32: "rgba(var(--sh-text-rgb), 0.32)",
  text30: "rgba(var(--sh-text-rgb), 0.3)",
  text28: "rgba(var(--sh-text-rgb), 0.28)",
};

// surface tints (white-alpha fills used for glass panels/cards)
export const SURFACE = {
  s014: "rgba(var(--sh-text-rgb), 0.014)",
  s018: "rgba(var(--sh-text-rgb), 0.018)",
  s022: "rgba(var(--sh-text-rgb), 0.022)",
  s025: "rgba(var(--sh-text-rgb), 0.025)",
  s03: "rgba(var(--sh-text-rgb), 0.03)",
  s035: "rgba(var(--sh-text-rgb), 0.035)",
  s04: "rgba(var(--sh-text-rgb), 0.04)",
  s05: "rgba(var(--sh-text-rgb), 0.05)",
  s06: "rgba(var(--sh-text-rgb), 0.06)",
  s07: "rgba(var(--sh-text-rgb), 0.07)",
  s08: "rgba(var(--sh-text-rgb), 0.08)",
  s09: "rgba(var(--sh-text-rgb), 0.09)",
  s12: "rgba(var(--sh-text-rgb), 0.12)",
};

export const BORDER = {
  faint: "1px solid rgba(var(--sh-text-rgb), 0.05)",
  soft: "1px solid rgba(var(--sh-text-rgb), 0.06)",
  s07: "1px solid rgba(var(--sh-text-rgb), 0.07)",
  s08: "1px solid rgba(var(--sh-text-rgb), 0.08)",
  s09: "1px solid rgba(var(--sh-text-rgb), 0.09)",
  s1: "1px solid rgba(var(--sh-text-rgb), 0.1)",
  s12: "1px solid rgba(var(--sh-text-rgb), 0.12)",
};

export const GRADIENTS = {
  // the signature accent — violet → cyan
  accent: "linear-gradient(135deg,var(--sh-accent),var(--sh-accent-hi))",
  accent140: "linear-gradient(140deg,var(--sh-accent),var(--sh-accent-hi))",
  accent155: "linear-gradient(155deg,rgba(var(--sh-accent-rgb), 0.95),rgba(var(--sh-accent-rgb), 0.85))",
  accentCyanViolet: "linear-gradient(135deg,var(--sh-accent-hi),var(--sh-accent))",
  userBubble: "linear-gradient(135deg,rgba(var(--sh-accent-rgb), 0.18),rgba(var(--sh-accent-rgb), 0.12))",
  cardBack: "linear-gradient(150deg,rgba(var(--sh-accent-rgb), 0.16),rgba(var(--sh-accent-rgb), 0.10))",
  avatarWarm: "linear-gradient(140deg,#b98a63,#c96a5a)",
  notesAccent: "linear-gradient(135deg,#c9a875,#c96a5a)",
  liveBtn: "linear-gradient(135deg,#3f8f74,var(--sh-accent-hi))",
  caret: "linear-gradient(180deg,var(--sh-accent),var(--sh-accent-hi))",
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
  glowViolet: "0 0 22px -2px rgba(var(--sh-accent-rgb), .8)",
  glowAccentBtn: "0 0 20px -4px rgba(var(--sh-accent-rgb), 0.8)",
  inputFocus:
    "0 0 0 1px rgba(var(--sh-accent-rgb), 0.4),0 0 44px -10px rgba(var(--sh-accent-rgb), 0.55),0 0 60px -14px rgba(var(--sh-accent-rgb), 0.4)",
  inputRest: "0 14px 44px -26px rgba(0,0,0,0.9)",
  peerBubble: "-14px 0 44px -26px rgba(var(--sh-accent-rgb), 0.9)",
  navPill: "0 6px 22px -4px rgba(var(--sh-accent-rgb), 0.7),0 0 0 1px rgba(var(--sh-text-rgb), 0.06)",
  modePill: "0 0 22px -4px rgba(var(--sh-accent-rgb), 0.8),0 4px 14px -4px rgba(var(--sh-accent-rgb), 0.6)",
  tooltip: "0 8px 24px -10px rgba(0,0,0,0.9)",
};

// Three.js brain node colors (project=violet, concept=cyan, weak=amber)
export const NODE_COLORS = { project: "var(--sh-accent)", concept: "var(--sh-accent-hi)", weak: "#c9a875" };

// per-project color palette (cycled, matches the design's projColors)
export const PROJECT_PALETTE = [
  "var(--sh-accent)", "var(--sh-accent-hi)", "#3f8f74", "#c96a5a", "#c9a875",
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

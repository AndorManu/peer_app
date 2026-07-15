// ============================================================================
// Peer — theme registry (single source of truth for the palette picker).
//
// Each theme is a `data-theme` value on <html> that swaps the --sh-* CSS
// variable contract (colors live in studyhall.css + themes.css, structural
// flair lives in themes.css). Two tiers:
//   free — always selectable (the clean B&W default + Field Notes)
//   pro  — requires an active Pro plan; locked in the picker otherwise.
//
// `bodyFont` / `displayFont` are applied ONLY when the learner is on a
// standard UI font — an accessibility font choice (OpenDyslexic, Atkinson,
// Lexend…) always wins, exactly like the Fraunces display rule in App.jsx.
// `dots` are the little preview swatches shown on each picker button.
// ============================================================================

export const THEMES = [
  // ---- free tier ----
  {
    id: "slate",
    label: "Slate",
    hint: "clean black & white",
    tier: "free",
    mode: "dark",
    dots: ["#0a0a0a", "#f2f2f2"],
  },
  {
    id: "fieldnotes",
    label: "Field Notes",
    hint: "olive & paper",
    tier: "free",
    mode: "light",
    bodyFont: "'Work Sans', system-ui, sans-serif",
    displayFont: "'Fraunces', Georgia, serif",
    dots: ["#2c3320", "#5c6b3f", "#d6d3bd"],
  },

  // ---- pro tier ----
  {
    id: "studyhall",
    label: "Study Hall",
    hint: "warm amber",
    tier: "pro",
    mode: "auto",
    dots: ["#15120d", "#e0a039", "#f4e8d5"],
  },
  {
    id: "indigo",
    label: "Indigo Night",
    hint: "violet & cyan",
    tier: "pro",
    mode: "auto",
    dots: ["#0a0c1a", "#8b7cf7", "#22d3ee"],
  },
  {
    id: "terminal",
    label: "Terminal",
    hint: "green-on-black CRT",
    tier: "pro",
    mode: "dark",
    bodyFont: "'Geist Mono', ui-monospace, monospace",
    displayFont: "'Geist Mono', ui-monospace, monospace",
    dots: ["#0a0d0a", "#5ef27a"],
  },
  {
    id: "blueprint",
    label: "Blueprint",
    hint: "drafting-table cyan",
    tier: "pro",
    mode: "dark",
    displayFont: "'Fraunces', Georgia, serif",
    dots: ["#0d2b4e", "#7fd4ff"],
  },
  {
    id: "newsprint",
    label: "Newsprint",
    hint: "broadsheet serif",
    tier: "pro",
    mode: "light",
    bodyFont: "Georgia, 'Times New Roman', serif",
    displayFont: "Georgia, 'Times New Roman', serif",
    dots: ["#eeece4", "#b21f1f", "#1a1a1a"],
  },
  {
    id: "neon",
    label: "Neon Arcade",
    hint: "magenta & electric",
    tier: "pro",
    mode: "dark",
    dots: ["#0e0621", "#ff2e93", "#6ef2e0"],
  },
  {
    id: "academia",
    label: "Dark Academia",
    hint: "candlelit gold",
    tier: "pro",
    mode: "dark",
    bodyFont: "Georgia, serif",
    displayFont: "Georgia, serif",
    dots: ["#1c1210", "#c9a04a", "#ece3d2"],
  },
  {
    id: "swiss",
    label: "Swiss",
    hint: "red-rule minimal",
    tier: "pro",
    mode: "light",
    bodyFont: "'Work Sans', 'Helvetica Neue', system-ui, sans-serif",
    displayFont: "'Work Sans', 'Helvetica Neue', system-ui, sans-serif",
    dots: ["#ffffff", "#d81e1e", "#111111"],
  },
];

export const DEFAULT_THEME = "slate";

const THEME_MAP = Object.fromEntries(THEMES.map((t) => [t.id, t]));
export const THEME_IDS = THEMES.map((t) => t.id);
export const FREE_THEME_IDS = THEMES.filter((t) => t.tier === "free").map((t) => t.id);

export function getTheme(id) {
  return THEME_MAP[id] || THEME_MAP[DEFAULT_THEME];
}

export function isProPlan(plan) {
  return plan === "pro";
}

// May this plan use this theme? Free themes: always. Pro themes: Pro only.
export function isThemeAllowed(id, plan) {
  const theme = THEME_MAP[id];
  if (!theme) return false;
  return theme.tier === "free" || isProPlan(plan);
}

// The theme to actually render: falls back to the default if a non-Pro user
// is carrying a Pro theme (e.g. after a downgrade, or stale synced state).
export function resolveTheme(id, plan) {
  return isThemeAllowed(id, plan) ? (THEME_MAP[id] ? id : DEFAULT_THEME) : DEFAULT_THEME;
}

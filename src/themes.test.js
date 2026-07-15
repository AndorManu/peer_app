import { test } from "node:test";
import assert from "node:assert/strict";

import {
  THEMES,
  THEME_IDS,
  FREE_THEME_IDS,
  DEFAULT_THEME,
  getTheme,
  isProPlan,
  isThemeAllowed,
  resolveTheme,
} from "./themes.js";

test("registry ships exactly 10 themes: 2 free, 8 pro", () => {
  assert.equal(THEMES.length, 10);
  assert.equal(FREE_THEME_IDS.length, 2);
  assert.equal(THEMES.filter((t) => t.tier === "pro").length, 8);
});

test("every theme has a unique id, label, hint, tier, mode, and dots", () => {
  const seen = new Set();
  for (const theme of THEMES) {
    assert.ok(theme.id && !seen.has(theme.id), `duplicate or missing id: ${theme.id}`);
    seen.add(theme.id);
    assert.ok(theme.label, `${theme.id} needs a label`);
    assert.ok(theme.hint, `${theme.id} needs a hint`);
    assert.ok(["free", "pro"].includes(theme.tier), `${theme.id} has a valid tier`);
    assert.ok(["light", "dark", "auto"].includes(theme.mode), `${theme.id} has a valid mode`);
    assert.ok(Array.isArray(theme.dots) && theme.dots.length >= 2, `${theme.id} has preview dots`);
  }
});

test("DEFAULT_THEME is a free theme present in the registry", () => {
  assert.ok(THEME_IDS.includes(DEFAULT_THEME));
  assert.equal(getTheme(DEFAULT_THEME).tier, "free");
});

test("getTheme falls back to the default for an unknown id", () => {
  assert.equal(getTheme("not-a-real-theme").id, DEFAULT_THEME);
  assert.equal(getTheme(undefined).id, DEFAULT_THEME);
});

test("isProPlan only recognizes the literal 'pro' plan", () => {
  assert.equal(isProPlan("pro"), true);
  assert.equal(isProPlan("free"), false);
  assert.equal(isProPlan(undefined), false);
  assert.equal(isProPlan(null), false);
});

test("isThemeAllowed: free themes are always allowed, pro themes require plan === 'pro'", () => {
  for (const id of FREE_THEME_IDS) {
    assert.equal(isThemeAllowed(id, undefined), true, `${id} free for anonymous`);
    assert.equal(isThemeAllowed(id, "free"), true, `${id} free for free plan`);
    assert.equal(isThemeAllowed(id, "pro"), true, `${id} free for pro plan`);
  }
  const proThemeIds = THEMES.filter((t) => t.tier === "pro").map((t) => t.id);
  for (const id of proThemeIds) {
    assert.equal(isThemeAllowed(id, undefined), false, `${id} locked for anonymous`);
    assert.equal(isThemeAllowed(id, "free"), false, `${id} locked for free plan`);
    assert.equal(isThemeAllowed(id, "pro"), true, `${id} unlocked for pro plan`);
  }
});

test("isThemeAllowed rejects an unknown theme id regardless of plan", () => {
  assert.equal(isThemeAllowed("not-a-real-theme", "pro"), false);
});

test("resolveTheme: a non-pro account rendering a Pro theme id downgrades to the free default", () => {
  const proThemeIds = THEMES.filter((t) => t.tier === "pro").map((t) => t.id);
  for (const id of proThemeIds) {
    assert.equal(resolveTheme(id, undefined), DEFAULT_THEME, `${id} downgrades for anonymous`);
    assert.equal(resolveTheme(id, "free"), DEFAULT_THEME, `${id} downgrades for free plan`);
  }
});

test("resolveTheme: a pro account keeps its chosen Pro theme", () => {
  const proThemeIds = THEMES.filter((t) => t.tier === "pro").map((t) => t.id);
  for (const id of proThemeIds) {
    assert.equal(resolveTheme(id, "pro"), id);
  }
});

test("resolveTheme: free themes render for anyone regardless of plan", () => {
  for (const id of FREE_THEME_IDS) {
    assert.equal(resolveTheme(id, undefined), id);
    assert.equal(resolveTheme(id, "pro"), id);
  }
});

test("resolveTheme: an unknown id falls back to the default even for a pro account", () => {
  assert.equal(resolveTheme("not-a-real-theme", "pro"), DEFAULT_THEME);
  assert.equal(resolveTheme("mono", "pro"), DEFAULT_THEME); // retired id is not in the registry itself
});

// ---- stateModel migration of colorTheme (normalizeThemeId / normalizeState) ----
import { normalizeThemeId, normalizeState, defaultState } from "./stateModel.js";

test("normalizeThemeId accepts any current registry id unchanged", () => {
  for (const id of THEME_IDS) {
    assert.equal(normalizeThemeId(id), id);
  }
});

test("normalizeThemeId migrates the retired 'mono' id to the free default", () => {
  assert.equal(normalizeThemeId("mono"), "slate");
});

test("normalizeThemeId falls back to the default for junk/unrecognized ids", () => {
  assert.equal(normalizeThemeId("not-a-theme"), DEFAULT_THEME);
  assert.equal(normalizeThemeId(undefined), DEFAULT_THEME);
  assert.equal(normalizeThemeId(null), DEFAULT_THEME);
  assert.equal(normalizeThemeId(""), DEFAULT_THEME);
});

test("normalizeState migrates a stored 'mono' colorTheme to 'slate' on load (regression)", () => {
  const stored = { ...defaultState(), colorTheme: "mono" };
  assert.equal(normalizeState(stored).colorTheme, "slate");
});

test("normalizeState passes through any current Pro theme id as-is (gating happens at render time, not storage)", () => {
  const stored = { ...defaultState(), colorTheme: "neon" };
  assert.equal(normalizeState(stored).colorTheme, "neon");
});

test("normalizeState falls back to the default for a garbage colorTheme value", () => {
  const stored = { ...defaultState(), colorTheme: "totally-bogus" };
  assert.equal(normalizeState(stored).colorTheme, DEFAULT_THEME);
});

test("defaultState() ships the free default theme", () => {
  assert.equal(defaultState().colorTheme, DEFAULT_THEME);
});

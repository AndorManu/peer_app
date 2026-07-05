// The closed adaptive loop: repeated signals must CHANGE the instructions the
// model receives, per subject, and the change must be quantifiable — not a
// one-click style hint.
import test from "node:test";
import assert from "node:assert/strict";
import {
  adaptationNotice,
  applyFeedback,
  buildPersonaInsights,
  buildTeachingRecipe,
  makeMastery,
  makeProfile,
  markAdaptationNoticeShown,
  updateMasteryFromFeedback,
} from "./learningModel.js";
import { buildSystemPrompt } from "./peerPrompt.js";

const feedbackTimes = (n, type, profile = makeProfile()) => {
  let p = profile;
  for (let i = 0; i < n; i += 1) p = applyFeedback(p, type);
  return p;
};

const masteryFeedbackTimes = (n, type, mastery = makeMastery()) => {
  let m = mastery;
  for (let i = 0; i < n; i += 1) m = updateMasteryFromFeedback(m, type, "the topic");
  return m;
};

test("3+ 'too long' clicks escalate to a hard, quantitative length cap", () => {
  const two = feedbackTimes(2, "tooLong");
  const three = feedbackTimes(3, "tooLong");
  const recipeTwo = buildTeachingRecipe(two, null, "auto").join(" ");
  const recipeThree = buildTeachingRecipe(three, null, "auto").join(" ");
  assert.doesNotMatch(recipeTwo, /HARD LENGTH CAP/);
  assert.match(recipeTwo, /concise/i); // gentle nudge below the threshold
  assert.match(recipeThree, /HARD LENGTH CAP/);
  assert.match(recipeThree, /under 120 words/);
});

test("repeated 'good example' flips to example-FIRST as a binding directive", () => {
  const profile = feedbackTimes(2, "goodExample");
  const recipe = buildTeachingRecipe(profile, null, "auto").join(" ");
  assert.match(recipe, /OPEN with a concrete worked example BEFORE any abstract statement/);
});

test("repeated 'too hard' on ONE subject drops depth for that subject only", () => {
  const profile = makeProfile(); // global depth stays "normal"
  const strugglingProject = { id: "a", name: "Calculus", mastery: masteryFeedbackTimes(2, "tooAdvanced") };
  const freshProject = { id: "b", name: "History", mastery: makeMastery() };

  const hardRecipe = buildTeachingRecipe(profile, strugglingProject, "auto").join(" ");
  const freshRecipe = buildTeachingRecipe(profile, freshProject, "auto").join(" ");
  assert.match(hardRecipe, /FOR THIS SUBJECT ONLY/);
  assert.match(hardRecipe, /simple depth/);
  assert.doesNotMatch(freshRecipe, /FOR THIS SUBJECT ONLY/); // pacing diverges per subject
});

test("strong subjects get a faster pace; struggling ones never do", () => {
  const strongMastery = {
    ...makeMastery(),
    concepts: ["a", "b", "c", "d"].map((k) => ({ id: k, key: k, label: k, confidence: 0.8, status: "strengthening" })),
  };
  const profile = makeProfile();
  const recipe = buildTeachingRecipe(profile, { id: "s", name: "Chem", mastery: strongMastery }, "auto").join(" ");
  assert.match(recipe, /faster, denser pace/);

  const strugglingToo = { ...strongMastery, signals: { ...strongMastery.signals, tooAdvanced: 2 } };
  const recipe2 = buildTeachingRecipe(profile, { id: "s", name: "Chem", mastery: strugglingToo }, "auto").join(" ");
  assert.doesNotMatch(recipe2, /faster, denser pace/);
});

test("the system prompt carries the directives and binds them", () => {
  const profile = feedbackTimes(3, "tooLong");
  const recipe = buildTeachingRecipe(profile, null, "auto");
  const prompt = buildSystemPrompt(null, profile, "auto", recipe);
  assert.match(prompt, /HARD LENGTH CAP/);
  assert.match(prompt, /Follow every recipe directive/);
});

test("adaptation notice fires exactly once, at the threshold crossing", () => {
  const two = feedbackTimes(2, "tooLong");
  assert.equal(adaptationNotice(two, null), null);
  const three = applyFeedback(two, "tooLong");
  const notice = adaptationNotice(three, null);
  assert.equal(notice.kind, "concise");
  assert.match(notice.text, /shorter/);
  const marked = markAdaptationNoticeShown(three, "concise");
  assert.equal(adaptationNotice(marked, null), null); // never nags twice
  const four = applyFeedback(marked, "tooLong");
  assert.equal(adaptationNotice(four, null), null);
});

test("persona insights are specific to the accumulated signals, with names", () => {
  const profile = feedbackTimes(2, "goodExample", feedbackTimes(3, "tooLong"));
  const state = {
    profile,
    projects: [
      { id: "a", name: "Organic Chemistry", mastery: { ...makeMastery(), concepts: ["a", "b", "c", "d"].map((k) => ({ id: k, key: k, label: k, confidence: 0.75, status: "strengthening" })) } },
      { id: "b", name: "Calculus", mastery: { ...makeMastery(), concepts: ["x", "y"].map((k) => ({ id: k, key: k, label: k, confidence: 0.2, status: "weak" })) } },
    ],
  };
  const lines = buildPersonaInsights(state).join(" | ");
  assert.match(lines, /worked examples before theory/);
  assert.match(lines, /Organic Chemistry/);
  assert.match(lines, /Calculus/);
});

test("a fresh profile admits it doesn't know you yet", () => {
  const lines = buildPersonaInsights({ profile: makeProfile(), projects: [] });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Still learning how you learn/);
});

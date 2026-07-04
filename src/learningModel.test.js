import { test } from "node:test";
import assert from "node:assert/strict";

import {
  makeProfile,
  normalizeProfile,
  makeMastery,
  normalizeMastery,
  inferProfileFromMessage,
  updateProfileFromAttachments,
  applyFeedback,
  setExplanationDepth,
  recordStudyActivity,
  buildTeachingRecipe,
  buildSkillTree,
  getWeakSpots,
  updateMasteryFromMessage,
  updateMasteryFromFeedback,
  conceptTrajectory,
  buildLearnerRecap,
} from "./learningModel.js";

test("makeProfile returns a fully-formed default profile", () => {
  const profile = makeProfile();
  assert.equal(profile.level, "beginner");
  assert.equal(profile.language, "auto");
  assert.equal(profile.explanationDepth, "normal");
  assert.deepEqual(profile.observations, []);
  assert.equal(profile.signals.understood, 0);
  assert.equal(profile.preferences.technical, 0);
});

test("normalizeProfile repairs corrupt/partial input without throwing", () => {
  assert.doesNotThrow(() => normalizeProfile(null));
  assert.doesNotThrow(() => normalizeProfile("garbage"));

  const repaired = normalizeProfile({
    level: "wizard", // invalid -> should fall back
    explanationDepth: "ultra", // invalid -> should fall back
    signals: { understood: 3 }, // partial -> should merge with defaults
    observations: "not-an-array", // invalid -> should become []
  });
  assert.equal(repaired.level, "beginner");
  assert.equal(repaired.explanationDepth, "normal");
  assert.equal(repaired.signals.understood, 3);
  assert.equal(repaired.signals.confused, 0);
  assert.deepEqual(repaired.observations, []);
});

test("normalizeProfile caps unbounded arrays", () => {
  const tooMany = Array.from({ length: 50 }, (_, i) => ({ id: String(i), text: `obs ${i}` }));
  const repaired = normalizeProfile({ observations: tooMany });
  assert.equal(repaired.observations.length, 8);
});

test("inferProfileFromMessage nudges technical preference on code talk", () => {
  const result = inferProfileFromMessage(makeProfile(), "Why does my pointer cause a compile error in this function?");
  assert.ok(result.preferences.technical >= 1, "code mention should bump technical");
  assert.ok(result.preferences.socratic >= 1, "'why' should bump socratic");
  assert.equal(result.traits.codeMentions, 1);
  assert.equal(result.traits.asksWhy, 1);
  assert.ok(result.observations.length >= 1);
});

test("inferProfileFromMessage detects confusion and favors simplicity", () => {
  const result = inferProfileFromMessage(makeProfile(), "I'm so confused, I don't get this at all");
  assert.ok(result.preferences.simple >= 1);
  assert.equal(result.traits.confusionPhrases, 1);
});

test("inferProfileFromMessage keeps a running average message length", () => {
  let profile = makeProfile();
  profile = inferProfileFromMessage(profile, "one two three four"); // 4 words
  assert.equal(profile.traits.averageMessageLength, 4);
  profile = inferProfileFromMessage(profile, "one two"); // 2 words -> avg of 4 and 2 = 3
  assert.equal(profile.traits.averageMessageLength, 3);
});

test("updateProfileFromAttachments reacts to code and image files", () => {
  const result = updateProfileFromAttachments(makeProfile(), [
    { kind: "text", name: "main.c" },
    { kind: "image", name: "diagram.png" },
  ]);
  assert.equal(result.signals.attachments, 2);
  assert.ok(result.preferences.technical >= 1);
  assert.ok(result.preferences.visual >= 1);
});

test("applyFeedback records signal, preference, and successful strategy", () => {
  const understood = applyFeedback(makeProfile(), "understood");
  assert.equal(understood.signals.understood, 1);
  assert.ok(understood.successfulStrategies.length >= 1);

  const confused = applyFeedback(makeProfile(), "confused");
  assert.equal(confused.signals.confused, 1);
  assert.ok(confused.preferences.simple >= 1, "confused maps to simple preference");
});

test("setExplanationDepth validates the depth value", () => {
  assert.equal(setExplanationDepth(makeProfile(), "expert").explanationDepth, "expert");
  assert.equal(setExplanationDepth(makeProfile(), "bogus").explanationDepth, "normal");
});

test("buildTeachingRecipe always returns at least one instruction", () => {
  const recipe = buildTeachingRecipe(makeProfile(), null, "auto");
  assert.ok(Array.isArray(recipe));
  assert.ok(recipe.length >= 1 && recipe.length <= 6);
});

test("buildTeachingRecipe reflects a technical learner", () => {
  const profile = normalizeProfile({ preferences: { technical: 5, simple: 0 } });
  const recipe = buildTeachingRecipe(profile, null, "auto");
  assert.ok(recipe.some((line) => /technical|code-shaped/i.test(line)));
});

test("recordStudyActivity starts a streak at one on first use", () => {
  const result = recordStudyActivity(makeProfile());
  assert.equal(result.streak.count, 1);
  assert.equal(result.streak.messagesToday, 1);
  assert.ok(result.streak.lastStudyDate);
});

test("recordStudyActivity increments message count within the same day", () => {
  let profile = recordStudyActivity(makeProfile());
  profile = recordStudyActivity(profile);
  assert.equal(profile.streak.messagesToday, 2);
  assert.equal(profile.streak.count, 1, "same-day activity does not grow the day streak");
});

test("updateMasteryFromMessage extracts concepts and flags a misconception", () => {
  const mastery = updateMasteryFromMessage(makeMastery(), "I think a pointer stores the value directly");
  const pointer = mastery.concepts.find((c) => c.key === "pointer");
  assert.ok(pointer, "pointer concept tracked");
  assert.equal(mastery.misconceptions.length, 1);
  assert.match(mastery.misconceptions[0].correction, /address/);
  // Misconception should mark the concept weak (lower confidence).
  assert.equal(pointer.status, "weak");
});

test("updateMasteryFromFeedback raises confidence on positive feedback", () => {
  const base = updateMasteryFromMessage(makeMastery(), "tell me about recursion");
  const before = base.concepts.find((c) => c.key === "recursion").confidence;
  const after = updateMasteryFromFeedback(base, "understood", "recursion explanation").concepts.find(
    (c) => c.key === "recursion",
  ).confidence;
  assert.ok(after > before, "positive feedback should raise confidence");
});

test("buildSkillTree groups tracked concepts and getWeakSpots surfaces low confidence", () => {
  let mastery = makeMastery();
  mastery = updateMasteryFromMessage(mastery, "pointer recursion array");
  const project = { name: "C Programming", mastery };

  const tree = buildSkillTree(project);
  assert.equal(tree.label, "C Programming");
  assert.ok(tree.groups.length >= 1);

  const weak = getWeakSpots(project);
  assert.ok(Array.isArray(weak));
});

test("updateMasteryFromMessage records a concept history snapshot", () => {
  let mastery = updateMasteryFromMessage(makeMastery(), "tell me about recursion");
  const c1 = mastery.concepts.find((c) => c.key === "recursion");
  assert.ok(Array.isArray(c1.history) && c1.history.length === 1, "new concept seeds history");
  mastery = updateMasteryFromFeedback(mastery, "understood", "recursion");
  const c2 = mastery.concepts.find((c) => c.key === "recursion");
  assert.ok(c2.history.length >= 2, "feedback appends a history snapshot");
});

test("conceptTrajectory classifies improving vs slipping", () => {
  assert.equal(conceptTrajectory({ history: [{ confidence: 0.3 }, { confidence: 0.6 }] }), "improving");
  assert.equal(conceptTrajectory({ history: [{ confidence: 0.7 }, { confidence: 0.4 }] }), "slipping");
  assert.equal(conceptTrajectory({ history: [{ confidence: 0.5 }] }), "new");
});

test("buildLearnerRecap summarizes concepts across projects", () => {
  let mastery = updateMasteryFromMessage(makeMastery(), "pointers and recursion");
  const state = { projects: [{ name: "C", mastery }], profile: { streak: { count: 3 } } };
  const recap = buildLearnerRecap(state);
  assert.ok(recap.totalConcepts >= 2);
  assert.equal(recap.streak, 3);
  assert.ok(Array.isArray(recap.weakSpots));
});

test("updateMasteryFromMessage tracks non-coding subjects via asked phrases", () => {
  const mastery = updateMasteryFromMessage(makeMastery(), "What is the subjunctive mood? I keep mixing it up.");
  assert.ok(
    mastery.concepts.some((c) => c.key.includes("subjunctive")),
    `asked-about phrase tracked, got: ${mastery.concepts.map((c) => c.key).join(", ")}`,
  );
});

test("updateMasteryFromMessage tracks mid-sentence proper phrases (history, science)", () => {
  const mastery = updateMasteryFromMessage(makeMastery(), "I'm confused about the French Revolution and its causes");
  assert.ok(
    mastery.concepts.some((c) => c.label.includes("French Revolution")),
    `proper phrase tracked, got: ${mastery.concepts.map((c) => c.label).join(", ")}`,
  );
});

test("updateMasteryFromMessage uses domain hints from the taxonomy", () => {
  const mastery = updateMasteryFromMessage(
    makeMastery(),
    "so supply goes up when demand falls?",
    ["supply", "demand", "elasticity"],
  );
  const keys = mastery.concepts.map((c) => c.key);
  assert.ok(keys.includes("supply") && keys.includes("demand"), `domain hints tracked, got: ${keys.join(", ")}`);
});

test("detectMisconception catches classic non-coding misconceptions", () => {
  const physics = updateMasteryFromMessage(makeMastery(), "so heavier objects fall faster right?");
  assert.equal(physics.misconceptions.length, 1);
  assert.match(physics.misconceptions[0].correction, /vacuum|air resistance/i);
});

test("buildSkillTree groups any subject's concepts by mastery level", () => {
  let mastery = makeMastery();
  mastery = updateMasteryFromMessage(mastery, "What is the subjunctive mood?");
  const tree = buildSkillTree({ name: "Spanish B2", mastery });
  assert.equal(tree.label, "Spanish B2");
  assert.ok(tree.groups.length >= 1, "non-CS concepts still group");
});

test("normalizeMastery tolerates junk input", () => {
  assert.doesNotThrow(() => normalizeMastery(undefined));
  const repaired = normalizeMastery({ concepts: "nope", misconceptions: null });
  assert.deepEqual(repaired.concepts, []);
  assert.deepEqual(repaired.misconceptions, []);
});

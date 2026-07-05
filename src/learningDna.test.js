// Learning DNA — implicit signal capture (Layer 1) and the behavior loops
// built on top of it. Signals are inferred from what the learner already
// does; nothing here requires an extra click.
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTeachingRecipe,
  inferProfileFromMessage,
  isSessionOpening,
  makeMastery,
  makeProfile,
  normalizeMastery,
  normalizeProfile,
  topAnalogyDomain,
  updateMasteryFromMessage,
} from "./learningModel.js";
import { buildSystemPrompt } from "./peerPrompt.js";

test("analogies the learner volunteers are attributed to their domain", () => {
  let p = makeProfile();
  p = inferProfileFromMessage(p, "so it's like simmering a sauce — the ingredients need time to combine?");
  p = inferProfileFromMessage(p, "think of it like following a recipe step by step");
  p = inferProfileFromMessage(p, "ok next question about enzymes"); // no analogy
  assert.equal(p.traits.analogyDomains.cooking, 2);
  assert.equal(p.traits.analogyDomains.sports, undefined);
});

test("domain words WITHOUT analogy framing don't pollute the DNA", () => {
  const p = inferProfileFromMessage(makeProfile(), "I have basketball practice later");
  assert.equal(p.traits.analogyDomains.sports, undefined);
});

test("cram urgency and frustration recency are captured with timestamps", () => {
  let p = inferProfileFromMessage(makeProfile(), "my exam is tomorrow, need to get this fast");
  assert.equal(p.traits.cramSignals, 1);
  assert.ok(p.traits.lastCramAt > 0);
  p = inferProfileFromMessage(p, "ugh this is so frustrating");
  assert.ok(p.traits.lastFrustrationAt > 0);
});

test("session openings record warm-up vs dive-in per subject", () => {
  let m = makeMastery();
  m = updateMasteryFromMessage(m, "where were we last time? quick recap please", [], { sessionOpening: true });
  m = updateMasteryFromMessage(m, "explain covalent bonds", [], { sessionOpening: true });
  m = updateMasteryFromMessage(m, "and ionic bonds?", [], { sessionOpening: false }); // mid-session: no signal
  assert.equal(m.signals.warmup, 1);
  assert.equal(m.signals.diveIn, 1);
});

test("isSessionOpening: fresh day or zero messages today", () => {
  const fresh = makeProfile();
  assert.equal(isSessionOpening(fresh), true);
  const active = { ...fresh, streak: { ...fresh.streak, lastStudyDate: new Date().toISOString().slice(0, 10), messagesToday: 3, count: 1 } };
  // localDateKey uses local time; toISOString may differ near midnight — build the local key
  const d = new Date();
  const localKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  active.streak.lastStudyDate = localKey;
  assert.equal(isSessionOpening(active), false);
});

// ---- Layer 2: each signal provably changes the instructions ----

test("naturally short messages earn a concision directive without any click", () => {
  let p = makeProfile();
  for (const msg of ["what is LTP", "and LTD?", "why", "ok next", "so both?"]) p = inferProfileFromMessage(p, msg);
  assert.ok(p.traits.averageMessageLength < 10 && p.signals.implicit >= 5);
  const recipe = buildTeachingRecipe(p, null, "auto").join(" ");
  assert.match(recipe, /short messages and prefers tight answers/);
  // a long-form writer gets no such directive
  let verbose = makeProfile();
  for (let i = 0; i < 5; i += 1) verbose = inferProfileFromMessage(verbose, "could you walk me through the mechanism of long term potentiation in the hippocampus including the role of NMDA receptors and calcium influx during coincident activity");
  assert.doesNotMatch(buildTeachingRecipe(verbose, null, "auto").join(" "), /prefers tight answers/);
});

test("two volunteered analogies from one domain -> tutor leads with that domain", () => {
  let p = makeProfile();
  p = inferProfileFromMessage(p, "so it's like leveling up in a video game?");
  p = inferProfileFromMessage(p, "kind of like a boss fight you have to prepare for");
  assert.deepEqual(topAnalogyDomain(p), { domain: "gaming", count: 2 });
  const recipe = buildTeachingRecipe(p, null, "auto").join(" ");
  assert.match(recipe, /LEAD with an analogy from gaming/);
  // one mention is not a pattern yet
  let once = inferProfileFromMessage(makeProfile(), "it's like a recipe?");
  assert.doesNotMatch(buildTeachingRecipe(once, null, "auto").join(" "), /LEAD with an analogy/);
});

test("warm-up vs dive-in session style changes the opening instruction, per subject", () => {
  const warmup = { ...makeMastery(), signals: { ...makeMastery().signals, warmup: 2, diveIn: 0 } };
  const diveIn = { ...makeMastery(), signals: { ...makeMastery().signals, warmup: 0, diveIn: 3 } };
  const p = makeProfile();
  assert.match(buildTeachingRecipe(p, { id: "a", mastery: warmup }, "auto").join(" "), /two-line recap of where you left off/);
  assert.match(buildTeachingRecipe(p, { id: "b", mastery: diveIn }, "auto").join(" "), /dives straight in — skip recaps/);
  assert.doesNotMatch(buildTeachingRecipe(p, { id: "c", mastery: makeMastery() }, "auto").join(" "), /recap/);
});

test("stored misconceptions trigger a PROACTIVE recall instruction in the prompt", () => {
  const project = {
    id: "p1", name: "Chemistry",
    mastery: { ...makeMastery(), misconceptions: [{ id: "m1", concept: "ionic bonds", belief: "electrons are shared", correction: "electrons are transferred", createdAt: 1 }] },
    docs: [],
  };
  const prompt = buildSystemPrompt(project, makeProfile(), "auto", []);
  assert.match(prompt, /proactively verify it is resolved BEFORE building new material/);
  assert.match(prompt, /Last time you thought/);
  assert.match(prompt, /electrons are shared -> electrons are transferred/);
});

test("explicit DNA corrections outrank inference: reject suppresses, confirm applies early", () => {
  // strong inferred example-first signal, but the user said "not me"
  let p = makeProfile();
  for (let i = 0; i < 3; i += 1) p = { ...p, signals: { ...p.signals, goodExample: (p.signals.goodExample || 0) + 1 } };
  p = { ...p, dnaOverrides: { exampleFirst: "rejected" } };
  assert.doesNotMatch(buildTeachingRecipe(p, null, "auto").join(" "), /OPEN with a concrete worked example/);
  // zero concision signal, but the user confirmed they want it short
  const confirmed = { ...makeProfile(), dnaOverrides: { concise: "confirmed" } };
  assert.match(buildTeachingRecipe(confirmed, null, "auto").join(" "), /HARD LENGTH CAP/);
});

test("DNA fields survive normalization (persistence + sync round-trips)", () => {
  const profile = normalizeProfile({
    ...makeProfile(),
    traits: { ...makeProfile().traits, analogyDomains: { gaming: 3 }, cramSignals: 2, lastCramAt: 123, lastFrustrationAt: 456 },
  });
  assert.equal(profile.traits.analogyDomains.gaming, 3);
  assert.equal(profile.traits.lastCramAt, 123);

  const mastery = normalizeMastery({ ...makeMastery(), signals: { ...makeMastery().signals, warmup: 4, diveIn: 1 } });
  assert.equal(mastery.signals.warmup, 4);
  assert.equal(mastery.signals.diveIn, 1);
});

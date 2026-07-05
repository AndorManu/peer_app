// Learning DNA — implicit signal capture (Layer 1) and the behavior loops
// built on top of it. Signals are inferred from what the learner already
// does; nothing here requires an extra click.
import test from "node:test";
import assert from "node:assert/strict";
import {
  inferProfileFromMessage,
  isSessionOpening,
  makeMastery,
  makeProfile,
  normalizeMastery,
  normalizeProfile,
  updateMasteryFromMessage,
} from "./learningModel.js";

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

import { test } from "node:test";
import assert from "node:assert/strict";

import { DOMAINS, GENERAL_DOMAIN, classifySubject, domainForProject, getDomain } from "./subjects.js";

test("taxonomy ships all 12 planned domains with complete metadata", () => {
  assert.equal(DOMAINS.length, 12);
  for (const domain of DOMAINS) {
    assert.ok(domain.id, "domain has id");
    assert.ok(domain.label, `${domain.id} has label`);
    assert.ok(domain.icon, `${domain.id} has icon name`);
    assert.match(domain.accent, /^#[0-9a-f]{6}$/i);
    assert.ok(domain.keywords.length >= 5, `${domain.id} has keywords`);
    assert.ok(domain.subjects.length >= 3, `${domain.id} has subjects`);
    assert.ok(domain.teach.length > 40, `${domain.id} has teaching guidance`);
    assert.ok(domain.conceptHints.length >= 8, `${domain.id} has concept hints`);
  }
});

test("classifySubject places the plan's five example subjects correctly", () => {
  assert.equal(classifySubject("Organic Chemistry"), "science");
  assert.equal(classifySubject("AP US History"), "testprep");
  assert.equal(classifySubject("Spanish B2"), "language");
  assert.equal(classifySubject("Music Theory"), "arts");
  assert.equal(classifySubject("MCAT"), "testprep");
});

test("classifySubject covers a spread of everyday subject names", () => {
  assert.equal(classifySubject("Calculus 2"), "math");
  assert.equal(classifySubject("Linear Algebra"), "math");
  assert.equal(classifySubject("Intro to Psychology"), "social");
  assert.equal(classifySubject("Microeconomics"), "social");
  assert.equal(classifySubject("Anatomy & Physiology"), "health");
  assert.equal(classifySubject("Python programming"), "cs");
  assert.equal(classifySubject("French"), "language");
  assert.equal(classifySubject("World History"), "humanities");
  assert.equal(classifySubject("Personal Finance"), "business");
  assert.equal(classifySubject("Thermodynamics for engineering"), "engineering");
  assert.equal(classifySubject("Guitar"), "arts");
  assert.equal(classifySubject("Public Speaking"), "life");
});

test("short exam tokens only match as whole words", () => {
  // "sat"/"act"/"ap"/"ib" appear inside ordinary words all the time.
  assert.notEqual(classifySubject("Saturation curves in chemistry"), "testprep");
  assert.notEqual(classifySubject("Interactive fiction writing"), "testprep");
  assert.equal(classifySubject("SAT prep"), "testprep");
  assert.equal(classifySubject("AP Biology"), "testprep");
});

test("unknown subjects fall back to the general domain", () => {
  assert.equal(classifySubject(""), "general");
  assert.equal(classifySubject("Underwater basket weaving"), "general");
  assert.equal(getDomain("nonsense").id, "general");
  assert.equal(getDomain(undefined).id, "general");
});

test("domainForProject honors an explicit domainId over the name", () => {
  const project = { name: "Spanish B2", domainId: "testprep" };
  assert.equal(domainForProject(project).id, "testprep");
  assert.equal(domainForProject({ name: "Spanish B2" }).id, "language");
  assert.equal(domainForProject(null).id, "general");
});

test("every domain accent is unique so subjects stay visually distinct", () => {
  const accents = new Set([...DOMAINS, GENERAL_DOMAIN].map((domain) => domain.accent.toLowerCase()));
  assert.equal(accents.size, DOMAINS.length + 1);
});

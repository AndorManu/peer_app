import { test } from "node:test";
import assert from "node:assert/strict";

import { splitInlineMath, matchBlockMath, containsMath } from "./math.js";

test("splitInlineMath extracts $...$ spans surrounded by text", () => {
  const segments = splitInlineMath("The derivative of $x^2$ is $2x$ everywhere.");
  assert.deepEqual(segments, [
    { type: "text", value: "The derivative of " },
    { type: "inline", value: "x^2" },
    { type: "text", value: " is " },
    { type: "inline", value: "2x" },
    { type: "text", value: " everywhere." },
  ]);
});

test("splitInlineMath extracts \\(...\\) spans", () => {
  const segments = splitInlineMath("Euler: \\(e^{i\\pi} + 1 = 0\\) is famous.");
  assert.deepEqual(segments[1], { type: "inline", value: "e^{i\\pi} + 1 = 0" });
});

test("money is not math", () => {
  const price = splitInlineMath("It costs $5 and $10 for the pair.");
  assert.ok(price.every((segment) => segment.type === "text"), "dollar amounts stay text");

  const sentence = splitInlineMath("I paid $60 yesterday.");
  assert.ok(sentence.every((segment) => segment.type === "text"), "single $ stays text");
});

test("plain prose between dollars is not math", () => {
  const segments = splitInlineMath("between $two words here$ nothing mathy");
  assert.ok(segments.every((segment) => segment.type === "text"));
});

test("escaped dollars render literally", () => {
  const segments = splitInlineMath("A literal \\$ sign");
  assert.deepEqual(segments, [{ type: "text", value: "A literal $ sign" }]);
});

test("mid-line $$...$$ is treated as math", () => {
  const segments = splitInlineMath("so $$\\frac{a}{b}$$ holds");
  assert.deepEqual(segments[1], { type: "inline", value: "\\frac{a}{b}" });
});

test("matchBlockMath handles single-line $$...$$", () => {
  const result = matchBlockMath(["$$E = mc^2$$"], 0);
  assert.equal(result.tex, "E = mc^2");
  assert.equal(result.nextIndex, 1);
});

test("matchBlockMath handles fenced multi-line $$ blocks", () => {
  const lines = ["$$", "\\int_0^1 x\\,dx = \\tfrac12", "$$", "after"];
  const result = matchBlockMath(lines, 0);
  assert.equal(result.tex, "\\int_0^1 x\\,dx = \\tfrac12");
  assert.equal(result.nextIndex, 3);
});

test("matchBlockMath handles \\[ ... \\] blocks", () => {
  const lines = ["\\[", "a^2 + b^2 = c^2", "\\]"];
  const result = matchBlockMath(lines, 0);
  assert.equal(result.tex, "a^2 + b^2 = c^2");

  const single = matchBlockMath(["\\[a^2 + b^2 = c^2\\]"], 0);
  assert.equal(single.tex, "a^2 + b^2 = c^2");
});

test("matchBlockMath returns null for ordinary lines and unclosed blocks", () => {
  assert.equal(matchBlockMath(["just text"], 0), null);
  assert.equal(matchBlockMath(["$$", "x^2"], 0), null, "unclosed $$ is not a block");
  assert.equal(matchBlockMath(["$$$$"], 0), null, "empty block is not math");
});

test("containsMath gates the math pipeline", () => {
  assert.equal(containsMath("no math here"), false);
  assert.equal(containsMath("has $x$"), true);
  assert.equal(containsMath("has \\(x\\)"), true);
  assert.equal(containsMath("has \\[x\\]"), true);
});

import { test } from "node:test";
import assert from "node:assert/strict";

import { createSpeechSession, speechErrorMessage, composeDictation, HANDS_FREE_SILENCE_MS } from "./speech.js";

// Stand-in for the browser's SpeechRecognition — real mic input can't be
// exercised headlessly, so tests drive the callbacks by hand.
//
// Faithful to the real API on the part that matters: `results` is CUMULATIVE
// and `resultIndex` points at the first result changed by this event. (A mock
// that always reported resultIndex 0 would silently double-count finalized
// text and make these tests lie.)
function makeMockRec() {
  const instances = [];
  class MockRec {
    constructor() {
      this.results = [];
      this.started = false;
      instances.push(this);
    }
    start() { this.started = true; }
    stop() { this.onend?.(); }

    /** Speak a phrase that finalizes immediately. */
    say(text) {
      const index = this.results.length;
      this.results.push({ 0: { transcript: text }, isFinal: true });
      this.onresult?.({ resultIndex: index, results: this.results });
    }
    /** Speak an in-progress (interim) phrase, then finalize the same slot. */
    interim(text) {
      const index = this.results.length;
      this.results.push({ 0: { transcript: text }, isFinal: false });
      this.onresult?.({ resultIndex: index, results: this.results });
    }
    finalizeLast(text) {
      const index = this.results.length - 1;
      this.results[index] = { 0: { transcript: text }, isFinal: true };
      this.onresult?.({ resultIndex: index, results: this.results });
    }
    fail(code) { this.onerror?.({ error: code }); }
  }
  return { MockRec, instances };
}

// Collects everything a session does so assertions read plainly.
function harness({ mode = "dictate", input = "", silenceMs = 25 } = {}) {
  const { MockRec, instances } = makeMockRec();
  const calls = { sends: [], errors: [], listening: [] };
  let composer = input;
  const session = createSpeechSession({
    SpeechRec: MockRec,
    mode,
    silenceMs,
    getInput: () => composer,
    onTranscript: (t) => { composer = t; },
    onSend: (t) => calls.sends.push(t),
    onError: (m) => calls.errors.push(m),
    onListeningChange: (b) => calls.listening.push(b),
  });
  return {
    session,
    calls,
    instances,
    composer: () => composer,
    type: (text) => { composer = text; }, // simulate the learner typing
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- dictate ---

test("dictate: transcript lands in the composer and is never auto-sent", () => {
  const h = harness({ mode: "dictate" });
  h.session.start();
  const rec = h.instances[0];
  rec.say("hello world");
  rec.stop();

  assert.equal(h.composer(), "hello world");
  assert.deepEqual(h.calls.sends, [], "dictation must never call onSend");
});

test("dictate: continuous is on, so a natural pause doesn't end the session", () => {
  const h = harness({ mode: "dictate" });
  h.session.start();
  const rec = h.instances[0];
  assert.equal(rec.continuous, true, "continuous=false is what ended dictation at the first pause");

  rec.say("first part");
  // …the learner pauses to think; with continuous=true the browser doesn't end it
  rec.say(" and more");
  assert.equal(h.composer(), "first part and more");
  assert.deepEqual(h.calls.sends, []);
});

test("dictate: interim text shows live, then settles to the final wording", () => {
  const h = harness({ mode: "dictate" });
  h.session.start();
  const rec = h.instances[0];
  rec.interim("wut is a derivit");
  assert.equal(h.composer(), "wut is a derivit", "interim should be visible as you speak");
  rec.finalizeLast("what is a derivative");
  assert.equal(h.composer(), "what is a derivative");
});

test("dictate: appends to text already in the composer", () => {
  const h = harness({ mode: "dictate", input: "existing note" });
  h.session.start();
  h.instances[0].say("spoken bit");
  assert.equal(h.composer(), "existing note spoken bit");
});

test("dictate: the learner's typing is not clobbered by a later result", () => {
  const h = harness({ mode: "dictate" });
  h.session.start();
  const rec = h.instances[0];

  rec.say("one");
  assert.equal(h.composer(), "one");

  h.type("one plus typed"); // learner edits the box by hand
  rec.say(" two"); // next result arrives

  assert.match(h.composer(), /one plus typed/, "the learner's own edit must survive");
  assert.match(h.composer(), /two/, "and the new speech is appended to it");
  assert.deepEqual(h.calls.sends, []);
});

// -------------------------------------------------------------- handsfree ---

test("handsfree: sends only after the silence window, not on the first pause", async () => {
  const h = harness({ mode: "handsfree", silenceMs: 30 });
  h.session.start();
  h.instances[0].say("what is a derivative");

  assert.deepEqual(h.calls.sends, [], "must not send while the learner may still be talking");
  await wait(70);
  assert.deepEqual(h.calls.sends, ["what is a derivative"], "should send once silence elapsed");
});

test("handsfree: still talking keeps resetting the clock", async () => {
  const h = harness({ mode: "handsfree", silenceMs: 40 });
  h.session.start();
  const rec = h.instances[0];

  rec.say("part one");
  await wait(25);
  rec.say(" part two");
  await wait(25);
  assert.deepEqual(h.calls.sends, [], "each new result restarts the clock — no send yet");

  await wait(60);
  assert.deepEqual(h.calls.sends, ["part one part two"]);
});

test("handsfree: a discarded turn (left voice mode) never sends", () => {
  const h = harness({ mode: "handsfree", silenceMs: 20 });
  h.session.start();
  h.instances[0].say("half a thought");
  h.session.stop({ discard: true });
  assert.deepEqual(h.calls.sends, [], "leaving voice mode must not fire off a half-said turn");
});

test("handsfree: clears the composer when the turn is sent", async () => {
  const h = harness({ mode: "handsfree", silenceMs: 20 });
  h.session.start();
  h.instances[0].say("send me");
  await wait(55);
  assert.equal(h.composer(), "", "composer should be cleared once the turn is sent");
  assert.deepEqual(h.calls.sends, ["send me"]);
});

test("handsfree: an unsent draft in the composer is never destroyed", async () => {
  // Regression: hands-free used to start from "" and overwrite on the first
  // result, silently binning whatever the learner had already typed — never
  // sent, never warned.
  const h = harness({ mode: "handsfree", input: "my unsent typed draft", silenceMs: 25 });
  h.session.start();
  h.instances[0].say("and this is spoken");

  assert.match(h.composer(), /my unsent typed draft/, "the draft must still be there");
  await wait(55);
  assert.deepEqual(
    h.calls.sends,
    ["my unsent typed draft and this is spoken"],
    "the turn should send the draft plus the speech, losing neither",
  );
});

test("handsfree: typing mid-turn is not clobbered either", () => {
  const h = harness({ mode: "handsfree", silenceMs: 500 });
  h.session.start();
  const rec = h.instances[0];
  rec.say("spoken start");
  h.type("spoken start plus typed");
  rec.say(" more");
  assert.match(h.composer(), /plus typed/, "the learner's edit must survive in voice mode too");
});

test("handsfree: an empty turn sends nothing", async () => {
  const h = harness({ mode: "handsfree", silenceMs: 20 });
  h.session.start();
  h.instances[0].stop();
  await wait(40);
  assert.deepEqual(h.calls.sends, []);
});

// ----------------------------------------------------------------- errors ---

test("every error surfaces a message and resets listening state", () => {
  for (const code of ["no-speech", "audio-capture", "network", "not-allowed", "weird-unknown-code"]) {
    const h = harness();
    h.session.start();
    h.instances[0].fail(code);
    assert.equal(h.calls.errors.length, 1, `${code} should surface a message`);
    assert.ok(h.calls.errors[0].length > 0);
    assert.equal(h.calls.listening.at(-1), false, `${code} must reset the listening state`);
  }
});

test("a deliberate abort stays silent", () => {
  const h = harness();
  h.session.start();
  h.instances[0].fail("aborted");
  assert.deepEqual(h.calls.errors, [], "the learner stopping on purpose is not an error");
  assert.equal(h.calls.listening.at(-1), false);
});

test("speechErrorMessage reads plainly and covers the API's codes", () => {
  assert.equal(speechErrorMessage("aborted"), null);
  for (const code of ["no-speech", "audio-capture", "network", "not-allowed", "service-not-allowed"]) {
    const msg = speechErrorMessage(code);
    assert.ok(msg && !/[A-Z_]{4,}|onerror|SpeechRecognition/.test(msg), `${code} message should read plainly: ${msg}`);
  }
});

// ------------------------------------------------------------------ misc ---

test("listening state goes true on start and false on end", () => {
  const h = harness();
  h.session.start();
  assert.equal(h.calls.listening[0], true);
  h.instances[0].stop();
  assert.equal(h.calls.listening.at(-1), false);
});

test("composeDictation collapses whitespace and appends to a base", () => {
  assert.equal(composeDictation("", "hello   there"), "hello there");
  assert.equal(composeDictation("base", "text"), "base text");
  assert.equal(composeDictation("", "  leading"), "leading");
});

test("composeDictation preserves the learner's newlines in their own draft", () => {
  // The composer is a textarea — Shift+Enter newlines are the learner's, and
  // dictating must not flatten the draft they already wrote.
  const draft = "line one\nline two";
  assert.equal(composeDictation(draft, "spoken"), "line one\nline two spoken");
});

test("composeDictation with nothing spoken leaves the draft alone", () => {
  assert.equal(composeDictation("my draft", ""), "my draft");
  assert.equal(composeDictation("my draft", "   "), "my draft");
});

test("dictate: a multi-line draft survives dictation", () => {
  const h = harness({ mode: "dictate", input: "line one\nline two" });
  h.session.start();
  h.instances[0].say("appended");
  assert.equal(h.composer(), "line one\nline two appended", "newlines must survive");
});

test("a throwing SpeechRecognition constructor fails quietly", () => {
  class Boom { constructor() { throw new Error("unavailable"); } }
  const calls = [];
  const session = createSpeechSession({
    SpeechRec: Boom,
    onListeningChange: (b) => calls.push(b),
  });
  assert.doesNotThrow(() => session.start(), "must not throw into the click handler");
  assert.equal(calls.at(-1), false, "listening state must reset");
});

test("the hands-free window is a sane default", () => {
  assert.ok(HANDS_FREE_SILENCE_MS >= 800 && HANDS_FREE_SILENCE_MS <= 3000);
});

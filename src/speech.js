// ============================================================================
// Peer — speech-to-text session logic.
//
// Extracted from App.jsx so it can be driven by a mocked SpeechRecognition in
// tests: real microphone input cannot be exercised headlessly, so the decision
// logic (when a turn ends, what reaches the composer, what auto-sends) needs to
// live somewhere testable. The browser API and all app effects are injected.
//
// Two modes, which used to share one behaviour — the bug this fixes:
//   dictate   — the mic button. Transcript lands in the composer and STAYS
//               there for the learner to edit and send. Never auto-sends.
//   handsfree — voice mode. The turn auto-sends, but only once the learner has
//               genuinely stopped talking (silenceMs), not at the first pause.
//
// Both run `continuous = true`; the old `continuous = false` ended recognition
// at any natural pause, which (combined with an unconditional auto-send in
// onend) is why dictated text flashed and vanished.
// ============================================================================

// How long the learner must stop talking before hands-free calls the turn.
// Long enough to think mid-sentence, short enough not to feel dead.
// (Real VAD / barge-in is a separate backlog item.)
export const HANDS_FREE_SILENCE_MS = 1500;

// Non-technical wording for every error the API raises. "aborted" is the
// learner stopping on purpose, so it stays silent.
export function speechErrorMessage(code) {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked. Allow it in your browser's site settings.";
    case "no-speech":
      return "Didn't catch that — try speaking again.";
    case "audio-capture":
      return "No microphone found. Check that one is connected and selected.";
    case "network":
      return "Voice input needs a connection — check your network and try again.";
    case "aborted":
      return null;
    default:
      return "Voice input stopped unexpectedly. Try again.";
  }
}

// Dictation appends to whatever is already in the composer rather than
// replacing it. Only the transcript is whitespace-collapsed — `base` is the
// learner's own draft and the composer is a textarea, so collapsing it would
// flatten their Shift+Enter newlines the moment they used the mic.
export function composeDictation(base, transcript) {
  const cleaned = String(transcript || "").replace(/\s+/g, " ").trim();
  if (!base) return cleaned;
  return cleaned ? `${base} ${cleaned}` : base;
}

/**
 * Build a speech session. Nothing here touches the DOM or React directly —
 * every effect is a callback, so tests can assert on them.
 *
 * @param {object}   o
 * @param {Function} o.SpeechRec           SpeechRecognition constructor.
 * @param {string}   o.lang                BCP-47 tag.
 * @param {"dictate"|"handsfree"} o.mode
 * @param {number}   o.silenceMs           Hands-free end-of-turn window.
 * @param {Function} o.getInput            () => current composer text.
 * @param {Function} o.onTranscript        (text) => void — write to composer.
 * @param {Function} o.onSend              (text) => void — hands-free turn done.
 * @param {Function} o.onError             (message) => void — user-facing.
 * @param {Function} o.onListeningChange   (bool) => void.
 * @param {Function} [o.setTimeoutFn]      Injectable for tests.
 * @param {Function} [o.clearTimeoutFn]
 */
export function createSpeechSession({
  SpeechRec,
  lang = "en-US",
  mode = "dictate",
  silenceMs = HANDS_FREE_SILENCE_MS,
  getInput = () => "",
  onTranscript = () => {},
  onSend = () => {},
  onError = () => {},
  onListeningChange = () => {},
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  let rec = null;
  let finalText = "";
  let base = "";
  let lastWritten = "";
  let timer = null;
  let discarded = false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeoutFn(timer);
      timer = null;
    }
  };

  function start() {
    if (rec) return;
    try {
      rec = new SpeechRec();
    } catch {
      // Some browsers throw on construction (e.g. the API is present but
      // unavailable in this context) — fail quietly rather than at the click.
      rec = null;
      onListeningChange(false);
      return;
    }
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;

    finalText = "";
    discarded = false;
    // BOTH modes continue from whatever is already in the composer. Hands-free
    // used to start from "" and overwrite on the first result, which silently
    // destroyed an unsent draft — never sent, never warned. The composer's
    // content IS the turn; speech fills it in, and hands-free sends the whole
    // thing, so nothing the learner wrote can be lost.
    base = getInput() || "";
    lastWritten = base;

    rec.onresult = (event) => {
      // If the learner typed since our last write, adopt their text as the new
      // base and restart the transcript from there — so speech appends to
      // their edit instead of overwriting it. Applies to both modes: a learner
      // can type mid-turn in voice mode too, and their words shouldn't vanish.
      const current = getInput() || "";
      if (current !== lastWritten) {
        base = current;
        finalText = "";
      }

      let interim = "";
      const results = event?.results || [];
      for (let i = event?.resultIndex || 0; i < results.length; i += 1) {
        const result = results[i];
        if (!result || !result[0]) continue;
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }

      const next = composeDictation(base, finalText + interim);
      lastWritten = next;
      onTranscript(next);

      if (mode === "handsfree") {
        // A new result means they're still talking — restart the clock.
        clearTimer();
        timer = setTimeoutFn(() => {
          timer = null;
          try { rec?.stop(); } catch { /* already stopped */ }
        }, silenceMs);
      }
    };

    rec.onerror = (event) => {
      clearTimer();
      onListeningChange(false);
      const message = speechErrorMessage(event?.error);
      if (message) onError(message);
    };

    rec.onend = () => {
      clearTimer();
      onListeningChange(false);
      const wasDiscarded = discarded;
      discarded = false;
      // Send the whole composer — anything the learner had already written
      // plus what they just said — not the transcript alone.
      const text = composeDictation(base, finalText).trim();
      rec = null;
      // Dictation ends here: the text is already in the composer and stays put.
      // Only hands-free auto-sends — and not a turn that was deliberately
      // dropped (learner left voice mode mid-sentence).
      if (mode !== "handsfree" || wasDiscarded || !text) return;
      onTranscript("");
      lastWritten = "";
      onSend(text);
    };

    onListeningChange(true);
    try {
      rec.start();
    } catch {
      rec = null;
      onListeningChange(false);
    }
  }

  // `discard: true` ends the session without auto-sending the in-flight turn.
  function stop({ discard = false } = {}) {
    clearTimer();
    discarded = discard;
    try {
      rec?.stop();
    } catch {
      /* already stopped */
    }
  }

  return { start, stop };
}

# Peer · Maintenance Log

Persistent memory for the daily maintenance agent. Newest entry on top. Never delete old entries.

---

## 2026-06-29 · Run 2

No code changed since Run 1 (working tree clean at the PR #1 merge). Re-checked the one open FLAGGED item and resolved it; skimmed CLEAN files (unchanged).

### Fixed
- HIGH · server/handleChat.js · streamAnthropic · lines 88-105 — the SSE parse loop silently swallowed mid-stream `{"type":"error",...}` events (e.g. `overloaded_error`), so a truncated answer could end with `done:true` and no error surfaced. Restructured: `JSON.parse` now sits in its own try/catch (parse failure → `continue`), and the error-event check `throw`s OUTSIDE that catch so the throw propagates to `handleChatRequest`'s catch, which emits `{error}` over SSE and calls `res.end()`. Confirmed the exact Anthropic error-event shape against platform.claude.com/docs streaming reference (`event: error` / `{"type":"error","error":{"type","message"}}`) before fixing — this was the exact uncertainty that held the flag in Run 1. Verified: build passes, 17/17 tests pass, server boots clean.
- HIGH · server/handleChat.js · streamOpenAI · lines ~148-166 — same gap on the OpenAI path (mid-stream `{"error":{...}}` swallowed). Applied the matching fix: parse in its own try/catch, `throw apiError(502, event.error.message)` outside it. (OpenAI's mid-stream error shape is the standard chat-completions `{"error":{"message",...}}`.)

### Flagged
- None this run. (Run 1's sole FLAGGED item — the SSE error gap — is now fixed above.)

### Improvements noted
- Carried forward from Run 1, still open (all prompt/perf, none auto-fixable under run rules):
  - src/peerPrompt.js · buildSystemPrompt — no aggregate token cap across docs (bounded per-doc at 40k). · effort: moderate (prompt content off-limits)
  - vite build — single 1.33MB JS chunk; LearningBrain (Three.js) + pdf.js (2.2MB worker) eager-loaded. React.lazy + dynamic import would cut initial load. · effort: moderate
  - src/markdown.jsx · Markdown — block parsing runs every render; could useMemo on `text`. · effort: simple

### Clean (skip deep read next run unless changed)
- All files confirmed clean in Run 1 remain unchanged (no commits since the Run-1 merge): src/storage.js, src/stateModel.js, src/LearningBrain.jsx, server/handleImage.js, server/dev.js, src/constants.js, src/components/PeerNavRail.jsx, src/peerTheme.js, src/peer-theme.css, src/main.jsx, src/materials.js, src/markdown.jsx, src/App.jsx, src/learningModel.js, .env.example, .gitignore.
- server/handleChat.js — now clean: error paths call res.end(), request-size guarded, no key leakage, AND mid-stream error events are surfaced (the last remaining gap).

### Notes
- Recurring pattern: the SSE streaming parser was the one persistently weak spot (flagged Run 1, fixed Run 2). Both provider paths now fail loudly instead of truncating silently.
- Verification still leans on `npm run build` + `node --test` (17 learningModel tests) + server boot; server/React components remain untested.
- Model strings untouched per rules.

---

## 2026-06-26 · Run 1

First run — full scan of the entire codebase (no prior memory).

### Fixed
- LOW · src/App.jsx · imports · line 2 — removed unused `import * as THREE from "three"` (Three.js was extracted to LearningBrain.jsx; grep confirmed zero references in App.jsx).
- HIGH · src/learningModel.js · upsertConcept · line ~415 — existing-concept branch mutated the concept object in place. Because `normalizeMastery` shallow-slices `concepts` (new array, shared element refs), that mutation reached back into the caller's persisted React state. Now replaces the matched concept immutably via `.map`, returning new objects. Verified: 17/17 tests still pass (the feedback/message mastery tests read returned values, unaffected).

### Flagged
- HIGH · server/handleChat.js · streamAnthropic · lines 88-98 — the Anthropic SSE parse loop only handles `content_block_delta`/`text_delta`. A mid-stream `{"type":"error",...}` event is silently swallowed (the `catch {}` around JSON.parse would also swallow a naive `throw`), so the user can get a truncated answer with a `done:true` and no error surfaced. Held: the surgical fix interacts with the swallowing catch and needs the exact provider error-event shape confirmed; restructure the loop so error events throw OUTSIDE the parse try/catch. (OpenAI path has the same gap minus the catch issue.)
- MEDIUM · src/learningModel.js · whole mutation pattern — `upsertConcept` was the one spot leaking input mutation; profile builders mutate only fresh copies from `normalizeProfile` (safe). No further action needed, noted for context.

### Improvements noted
- src/peerPrompt.js · buildSystemPrompt — docs are concatenated into the system prompt with no aggregate token cap (each doc is capped to 40k chars at ingestion in App.jsx, so it is bounded per doc, but many docs could still bloat the prompt). NOT auto-fixed: prompt content is off-limits per run rules. · effort: moderate
- src/markdown.jsx · Markdown — block parsing runs on every render; could `useMemo` on `text`. CodeBlock highlighting is already gated by `[code, lang]` deps (fine). · effort: simple
- vite build — single 1.33MB JS chunk; LearningBrain (Three.js) and pdf.js (2.2MB worker) are eager-loaded. `React.lazy` + dynamic import on the Brain panel and PDF path would cut initial load. · effort: moderate
- src/App.jsx · FlashcardsPanel keydown effect · line ~3003 — `useEffect` has no dependency array, so it re-binds the listener every render. Intentional (next/prev close over `deck`); a correct dep-array fix needs the handlers in deps too. Low value, left as-is. · effort: simple
- src/pdf.js · extractPdfText — no try/catch, but callers (addMaterials/processChatAttachments) already wrap it and surface a friendly error, so corrupt/password PDFs are handled. No change needed. · effort: simple

### Clean (skip deep read next run unless changed)
- src/storage.js — IndexedDB persistence, debounced saves, error handler, legacy migration. Solid.
- src/stateModel.js — defaultState/normalizeState/normalizeAccount all defensive and well-formed.
- src/LearningBrain.jsx — WebGL lifecycle is thorough: cancelAnimationFrame, ResizeObserver.disconnect, all pointer/wheel listeners removed, geometry/material/texture/renderer all disposed on unmount; raycaster reads a fresh bounding rect per pick (resize-safe).
- server/handleChat.js — error paths call res.end(); request-size guarded; no key leakage. (Streaming error-event gap flagged above.)
- server/handleImage.js — clean sendJson error handling.
- server/dev.js — clean; loadDotEnv tolerant.
- src/constants.js — all lucide icon imports used; option lists well-formed.
- src/components/PeerNavRail.jsx — clean, resize listener cleaned up.
- src/peerTheme.js / src/peer-theme.css — JS design tokens + keyframes; no undefined `var(--peer-*)` (codebase uses JS tokens, not CSS vars).
- src/main.jsx — ErrorBoundary + SW registration, PROD-gated.
- src/materials.js, src/markdown.jsx — clean (markdown noted as improvement only).
- src/App.jsx — ~3200-line monolith, otherwise high quality: every lucide import used, no console noise, no API keys, fetch paths have error+loading handling, streamRequest cancels its RAF.
- .env.example — covers all 5 server env vars. .gitignore covers dist/, *.log, node_modules, .env.

### Notes
- No test framework beyond `node --test`; only learningModel has tests (17). Server and React components are untested — verification leans on `npm run build` + server boot.
- API model strings (`claude-haiku-4-5-20251001`, `gpt-4.1-mini`) left untouched per rules.
- Recurring pattern: none yet (first run). Watch the learningModel mutation-vs-immutable boundary and the SSE error-handling gap on future runs.

---

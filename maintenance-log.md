# Peer · Maintenance Log

Persistent memory for the daily maintenance agent. Newest entry on top. Never delete old entries.

---

## 2026-06-30 · Run 2

No code changes in the repo since Run 1 (only the Run 1 PR merge commit landed on main). Skimmed all CLEAN files — unchanged. Focus this run: resolving the open HIGH flag from Run 1.

### Fixed
- HIGH · server/handleChat.js · streamAnthropic · line 94 — mid-stream Anthropic SSE `error` events (e.g. `overloaded_error`) parsed fine but matched no branch, so they were silently swallowed and the user got a truncated answer followed by `done:true`. Now detects `event.type === "error"`, forwards `sendEvent(res, { error })`, calls `res.end()` and returns. Mirrors the top-level catch handler; uses non-throwing calls so it doesn't collide with the swallowing `catch {}`. (Resolves the Run 1 HIGH flag.)
- HIGH · server/handleChat.js · streamOpenAI · line 161 — same gap on the OpenAI fallback path: a mid-stream `{ error: {...} }` object was swallowed. Now detects `event.error`, forwards it, ends and returns.

Verified: re-read full file; frontend `streamRequest` (src/App.jsx:536) already throws on any `{error}` SSE event, so the contract is honored end-to-end. `npm run build` ✅, `npm test` 17/17 ✅, `node server/dev.js` boots ✅.

### Flagged
- None new. (Run 1's HIGH SSE flag is now resolved.)

### Improvements noted
- (Carried from Run 1, code unchanged — still valid.) src/peerPrompt.js · buildSystemPrompt — no aggregate token cap across docs (per-doc 40k cap exists). · effort: moderate · NOTE: prompt content off-limits per rules.
- (Carried.) vite build emits a single 1.33MB JS chunk; LearningBrain (Three.js) + pdf.js (2.2MB worker) eager-loaded. `React.lazy` + dynamic import would cut initial load. · effort: moderate
- (Carried.) src/markdown.jsx · Markdown — block parsing runs every render; could `useMemo` on `text`. · effort: simple
- (Carried.) src/App.jsx · FlashcardsPanel keydown effect ~line 3003 — `useEffect` with no dep array re-binds listener each render; intentional, low value. · effort: simple

### Clean (skip deep read next run unless changed)
- All files confirmed clean in Run 1 remain unchanged (git diff 7e54c07..HEAD empty apart from merge). server/handleChat.js now also clears its one open flag.

### Notes
- Recurring pattern watch: the SSE streaming-robustness gap (Run 1 flagged, Run 2 fixed). Both provider paths now surface mid-stream errors symmetrically. Keep an eye on the parse loop if streaming logic changes.
- Build chunk-size warning is pre-existing/expected (eager Three.js + pdf worker); tracked as an improvement, not a regression.

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

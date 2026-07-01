# Peer · Maintenance Log

Persistent memory for the daily maintenance agent. Newest entry on top. Never delete old entries.

---

## 2026-07-01 · Run 2

No new commits since Run 1 (working tree clean, last commit `f2a585c` from 2026-06-26). Focused on the open HIGH flag from Run 1 and skimmed the files marked clean — no regressions.

### Fixed
- HIGH · server/handleChat.js · streamAnthropic · lines 88-101 — resolved the Run 1 flag. The SSE parse loop swallowed mid-stream `{"type":"error",...}` events inside a `catch {}`, so a provider error (e.g. `overloaded_error`) surfaced to the user as a truncated answer with `done:true` and no error. Restructured: JSON.parse now sits in its own try/catch that only `continue`s on malformed lines; a parsed `event.type === "error"` throws `apiError(502, event.error?.message || …)` OUTSIDE that catch, so it propagates to the `handleChatRequest` try/catch which emits `sendEvent(res,{error})` + `res.end()`. Confirmed the Anthropic streaming error-event shape (`{type:"error", error:{type,message}}`) against the claude-api reference before fixing — not guessed. Verified: build passes, 17/17 tests pass, server boots.

### Flagged
- (none new)

### Improvements noted
- Carried over from Run 1, still open: peerPrompt.js aggregate token cap (moderate; prompt content off-limits per rules), markdown.jsx block-parse useMemo (simple), lazy-load LearningBrain/pdf.js to shrink the 1.33MB initial chunk (moderate — build still warns about chunks >500kB). No new improvements surfaced.

### Clean (skip deep read next run unless changed)
- server/handleImage.js, server/dev.js, src/storage.js, src/stateModel.js, src/LearningBrain.jsx, src/constants.js, src/components/PeerNavRail.jsx, src/peer-theme.css, src/main.jsx, src/materials.js, src/App.jsx — all unchanged since Run 1's clean assessment (no intervening commits).
- src/learningModel.js — unchanged; upsertConcept immutability fix from Run 1 still in place.
- src/markdown.jsx — clean (improvement-only note stands).

### Notes
- The OpenAI path (streamOpenAI) uses the same parse-loop pattern but OpenAI's mid-stream error-event shape differs (`{"error":{...}}`, no `type:"error"`); left untouched to avoid guessing its exact shape — ANTHROPIC_API_KEY is the primary path anyway. Consider addressing on a future run only once the OpenAI error-event shape is confirmed.
- Recurring pattern: the SSE error-handling gap flagged in Run 1 is now closed on the Anthropic path. Watch the learningModel mutation boundary and the OpenAI error path going forward.

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

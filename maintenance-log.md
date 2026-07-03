# Peer · Maintenance Log

Persistent memory for the daily maintenance agent. Newest entry on top. Never delete old entries.

---

## 2026-07-03 · Run 2

Codebase unchanged since Run 1's merge (`git diff 7e54c07..main` empty — no source files touched). Skipped deep re-reads of files marked CLEAN in Run 1; focused on the open FLAGGED item.

### Fixed
- HIGH · server/handleChat.js · streamAnthropic · line ~92 — resolved the Run 1 FLAGGED SSE gap. The Anthropic parse loop only handled `content_block_delta`/`text_delta`; a mid-stream `{"type":"error",...}` event was silently swallowed by `catch {}`, so a truncated answer reached the user with `done:true` and no error. Restructured: JSON.parse in its own try/catch (bad line → `continue`), then a check that `throw apiError(502, event.error?.message)` for `event.type === "error"` OUTSIDE the parse catch. The throw unwinds to the existing handler in `handleChatRequest` (line 30-33), which does `sendEvent(res,{error})` + `res.end()` — single end, no double-close. Confirmed Anthropic streaming error-event shape (`event: error` / `data: {"type":"error","error":{...}}`) against the claude-api reference.
- HIGH · server/handleChat.js · streamOpenAI · line ~157 — same swallowing gap on the OpenAI path (noted in Run 1 as "same gap minus the catch issue"). Applied the symmetric fix: parse in its own try/catch, then `if (event.error) throw apiError(502, event.error.message)`. A normal chunk carries `choices`, never `error`, so the check is safe.

### Flagged
- None this run. (Run 1's SSE flag is now resolved above.)

### Improvements noted
- (carried from Run 1, still open) src/peerPrompt.js · buildSystemPrompt — no aggregate token cap across docs (bounded per-doc at 40k). · effort: moderate · not auto-fixed: prompt content is off-limits per run rules.
- (carried) src/markdown.jsx · Markdown — block parsing runs every render; could `useMemo` on `text`. · effort: simple
- (carried) vite build — single 1.33MB JS chunk; LearningBrain (Three.js) + pdf.js (2.2MB worker) eager-loaded. `React.lazy` + dynamic import would cut initial load. Build re-confirmed the warning this run. · effort: moderate

### Clean (skip deep read next run unless changed)
- All files confirmed unchanged since Run 1 via git diff. Run 1's CLEAN list stands: storage.js, stateModel.js, LearningBrain.jsx, handleImage.js, dev.js, constants.js, PeerNavRail.jsx, peer-theme.css/peerTheme.js, main.jsx, materials.js, markdown.jsx, App.jsx, .env.example.
- server/handleChat.js — now clean after today's SSE error-handling fix (both provider paths surface mid-stream errors).

### Notes
- Verification: `npm run build` ✅, `npm test` 17/17 ✅, `node server/dev.js` boots + `GET /` → HTTP 200 ✅.
- Recurring pattern: the SSE streaming error-handling gap flagged in Run 1 is the one carryover; now closed on both providers. Watch the learningModel immutable-vs-mutation boundary (Run 1 fix) on future changes.
- Model strings (`claude-haiku-4-5-20251001`, `gpt-4.1-mini`) left untouched per rules.

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

# Peer · Maintenance Log

Persistent memory for the daily maintenance agent. Newest entry on top. Never delete old entries.

---

## 2026-06-26 · Run 2

No code changes since Run 1 (`git diff 7e54c07 HEAD` empty — PR #1 merge brought in nothing new). Focused on the open HIGH flagged item from Run 1 and skimmed the rest.

### Fixed
- HIGH · server/handleChat.js · streamAnthropic · lines 88-105 — resolved Run 1's flagged SSE error-handling gap. The parse loop's blanket `try { ... } catch {}` swallowed mid-stream Anthropic `error` events (`{"type":"error","error":{...}}`), so the user could receive a truncated answer plus `done:true` with no error surfaced. Restructured: `JSON.parse` is now wrapped in a narrow `try/catch` that only `continue`s on malformed JSON; a parsed `event.type === "error"` throws `apiError(502, ...)` OUTSIDE that catch, so it propagates to `handleChatRequest`'s catch which sends `{ error }` and ends the stream. Confirmed Anthropic SSE error shape via the claude-api skill.
- HIGH · server/handleChat.js · streamOpenAI · lines 148-165 — applied the symmetric fix to the OpenAI path (same swallowing pattern, noted in Run 1). A parsed `event.error` now throws `apiError(502, ...)`; malformed JSON still `continue`s. `[DONE]` handling unchanged.

### Flagged
- (none new) — Run 1's flagged SSE gap is now fixed. Run 1's MEDIUM note about the learningModel mutation boundary remains informational only (no action needed).

### Improvements noted
- (carried from Run 1, still open) src/markdown.jsx · Markdown — block parse runs every render; `useMemo` on `text` would help. · effort: simple
- (carried) vite build — single 1.33MB JS chunk; LearningBrain (Three.js) + pdf.js (2.2MB worker) eager-loaded; React.lazy + dynamic import would cut initial load. · effort: moderate
- (carried) src/peerPrompt.js · buildSystemPrompt — no aggregate token cap across docs (per-doc 40k cap exists). Prompt content off-limits per rules. · effort: moderate

### Clean (skip deep read next run unless changed)
- All files confirmed clean in Run 1 remain unchanged (verified via empty `git diff` since the Run 1 commit). server/handleChat.js is now fully clean — the one outstanding gap is closed.

### Notes
- Verification this run: `npm run build` ✅ (after `npm install` — node_modules absent on fresh container), `npm test` ✅ 17/17, `node server/dev.js` boots clean, `node --check` + dynamic import of handleChat.js OK.
- Recurring pattern: the SSE streaming parser was the one real reliability gap; now addressed on both providers. Watch the learningModel immutable boundary and any new streaming-event types (e.g. `message_stop`, `input_json_delta`) if the parser is extended.
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

# Peer · Maintenance Log

Persistent memory for the daily maintenance agent. Newest entry on top. Never delete old entries.

---

## 2026-07-07 · Run 3

Codebase byte-identical to Run 2's merged-clean state (`HEAD == origin/main == d20ed00`, which includes the Run 2 SSE fix merged via PR #11). All `src/` files mtime Jun 30; `server/handleChat.js` carries the merged Run 2 fix. Light run: re-verified the green baseline, re-audited the two historically risky files, and actioned the single 100%-safe improvement that had been noted across every prior run.

### Fixed
- (none — no defects found; the two historical reliability gaps remain closed)

### Improvements applied
- LOW/perf · src/markdown.jsx · Markdown · lines 39–93 — the block-parsing loop ran on every render. Wrapped it in `useMemo(() => {...}, [text])` (added `useMemo` to the existing React import; renamed the local accumulator `blocks` → `out` inside the memo, returning it as `blocks`). Behavior-preserving: pure function of `text`, hook called unconditionally at the top of the component; the render body's `blocks.map(...)`, `inline`, and `CodeBlock` are untouched. Only call site is `<Markdown text={...} />` in App.jsx (props unchanged). Verified: build ✅, 17/17 tests ✅, server HTTP 200 ✅.

### Flagged
- (none)

### Improvements still open (noted, not auto-fixed)
- peerPrompt.js · buildSystemPrompt — no aggregate doc token cap (bounded per-doc at ingestion) · prompt content off-limits per run rules · moderate
- Code-split LearningBrain (Three.js) + pdf.js via React.lazy — build still emits one 1.33 MB JS chunk (gzip 375.78 kB) + 2.2 MB pdf worker · moderate
- App.jsx · FlashcardsPanel keydown effect missing dep array · intentional (handlers close over `deck`) · simple

### Clean (skip deep read next run unless changed)
- server/handleChat.js — re-read end to end: both provider paths surface mid-stream `error` events (parse in own try/catch, throw outside it → outer catch emits `{error}` + `res.end()`); request-size guarded (413); no key leakage. `readJson` rejects before the SSE try/catch, but dev.js wraps `handleChatRequest` in its own try/catch → sends 500 JSON, no hang/leak.
- server/dev.js — unchanged; wraps both API handlers, tolerant loadDotEnv.
- learningModel.js — re-audited the mutation boundary: `upsertConcept` existing-concept path replaces immutably via `.map` (Run 1 fix); new-concept path `unshift`/`slice` only touch the fresh `next.concepts` array from `normalizeMastery`. No input-mutation leaks.
- All other files unchanged since Run 2's CLEAN assessment: storage.js, stateModel.js, LearningBrain.jsx, handleImage.js, constants.js, PeerNavRail.jsx, peer-theme.css/peerTheme.js, main.jsx, materials.js, App.jsx, .env.example.

### Notes
- Verification: `npm run build` ✅ (vite 6, built in 4.4s), `npm test` ✅ 17/17, `node server/dev.js` ✅ HTTP 200. `npm install` needed first (fresh clone).
- No console noise in src/ (only intentional error handler at LearningBrain.jsx:462), no API-key references in src/.
- Recurring pattern: none outstanding. Both historical reliability gaps (learningModel mutation, SSE error events) are closed. The remaining levers are perf-only (eager bundle) and off-limits (prompt content). markdown useMemo — noted since Run 1 — is now applied.

---

## 2026-07-04 · Run 2

Codebase unchanged since Run 1 (all files same mtime, branch fresh off main). Focused on the open FLAGGED SSE issue from Run 1; skimmed the files marked CLEAN — no new changes.

### Fixed
- HIGH · server/handleChat.js · streamAnthropic · lines 92-104 — the Anthropic SSE parse loop only handled `content_block_delta`/`text_delta`; a mid-stream `{"type":"error",...}` event was silently swallowed by the surrounding `catch {}`, so the user got a truncated answer ending in `done:true` with no error surfaced. Restructured: `JSON.parse` now runs in its own try/catch (malformed chunks `continue`), and an `error`-type event throws OUTSIDE that catch → propagates to the `handleChatRequest` catch, which emits `{error}` and `res.end()`. Confirmed the exact Anthropic error-event shape (`{type:"error",error:{message}}`) against the claude-api reference. This resolves the Run 1 flag.
- HIGH · server/handleChat.js · streamOpenAI · lines 156-166 — same gap on the OpenAI fallback path (minus the catch issue noted in Run 1). Applied the same pattern: parse in its own try/catch, throw on `event.error`.

### Flagged
- (none this run — the Run 1 SSE flag is now resolved)

### Improvements noted
- Carried over from Run 1, still open (not auto-fixed per run rules / low value): peerPrompt.js aggregate doc token cap (prompt content off-limits · moderate); markdown.jsx `useMemo` on block parse (simple); code-split LearningBrain + pdf.js via React.lazy — build still emits one 1.33MB JS chunk + 2.2MB pdf worker (moderate); FlashcardsPanel keydown effect missing dep array (simple, intentional).

### Clean (skip deep read next run unless changed)
- All files confirmed CLEAN in Run 1 remain unchanged (same mtime): storage.js, stateModel.js, LearningBrain.jsx, handleImage.js, dev.js, constants.js, PeerNavRail.jsx, peerTheme.js/peer-theme.css, main.jsx, materials.js, markdown.jsx, App.jsx, .env.example.
- server/handleChat.js — now clean end-to-end after today's SSE error-handling fix (error paths call res.end(); request-size guarded; no key leakage; error events surfaced on both providers).

### Notes
- Verification: `npm run build` ✅ (vite 6.4.3, built in 6.4s), `npm test` ✅ 17/17, `node server/dev.js` ✅ (serves HTTP 200 at 127.0.0.1:5173). Had to `npm install` first — node_modules not present in fresh clone.
- Client already handles the surfaced error: App.jsx streamRequest line 536 `if (event.error) throw new Error(event.error)` — the server fix and client are aligned.
- Recurring pattern: the SSE streaming parser was the one real reliability gap across both runs; now closed on both providers. Nothing else outstanding.

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

# Peer · Maintenance Log

Persistent memory for the daily maintenance agent. Newest entry on top. Never delete old entries.

---

## 2026-06-28 · Run 2

No code changes since Run 1 (working tree was clean; `git diff 7e54c07 HEAD` empty). Focus this run: resolve the HIGH SSE error-handling gap flagged in Run 1, now that the provider error-event shape is confirmed.

### Fixed
- HIGH · server/handleChat.js · streamAnthropic · lines 88-104 — the Anthropic SSE parse loop swallowed mid-stream `error` events (the `catch {}` ate everything), so an upstream `{"type":"error",...}` produced a truncated answer followed by `done:true` and no surfaced error. Restructured per the Run 1 plan: JSON.parse now sits in its own try/catch (skips only malformed lines), and a parsed `event.type === "error"` throws OUTSIDE that catch → propagates to handleChatRequest's outer try/catch → `sendEvent(res,{error})` + `res.end()`. Error envelope shape confirmed via claude-api skill (`{"type":"error","error":{"type","message"}}`). Verified: node --check OK, build OK, 17/17 tests pass, server boots + responds 200.
- HIGH · server/handleChat.js · streamOpenAI · lines 154-173 — same swallowing gap on the OpenAI path (minus the catch nuance). Applied the symmetric fix: parse isolated in its own try/catch; a parsed `event.error` throws `apiError(502, event.error.message)` outside the catch. OpenAI mid-stream error shape `{"error":{"message",...}}`. Same verification.

### Flagged
- (none this run — the sole open HIGH flag from Run 1 is now resolved above.)

### Improvements noted
- Carried forward from Run 1 (all still valid, none auto-fixed per run rules): peerPrompt.js no aggregate doc token cap (prompt content off-limits · moderate); markdown.jsx block parse on every render could useMemo on text (simple); vite build single 1.33MB JS chunk + eager pdf.worker (2.2MB) — React.lazy/dynamic import on Brain + PDF path would cut initial load (moderate); FlashcardsPanel keydown effect has no dep array (intentional · simple). Build still emits the >500kB chunk warning — unchanged from Run 1.

### Clean (skip deep read next run unless changed)
- All files from Run 1 remain unchanged (diff empty). server/handleChat.js now fully clean — the streaming error-event gap that was the last open concern is closed. Other CLEAN files carry over: storage.js, stateModel.js, LearningBrain.jsx, handleImage.js, dev.js, constants.js, PeerNavRail.jsx, peerTheme.js/peer-theme.css, main.jsx, materials.js, markdown.jsx, App.jsx, .env.example/.gitignore.

### Notes
- Recurring pattern resolved: the SSE error-handling gap watched since Run 1 is now fixed on both providers. The other watch item (learningModel mutation-vs-immutable boundary) was fixed in Run 1 and remains clean.
- node_modules was not present in the fresh container; `npm install` needed before `vite build` (74 pkgs, 0 vulnerabilities). Tests run via `node --test` with no install. dist/ and node_modules/ correctly gitignored.
- Model/version strings untouched per rules.

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

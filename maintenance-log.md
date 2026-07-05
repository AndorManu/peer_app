# Peer · Maintenance Log

Persistent memory for the daily maintenance agent. Newest entry on top. Never delete old entries.

---

## 2026-07-05 · Run 3

Codebase byte-identical to Run 2 (all src files mtime Jun 30; server/handleChat.js mtime Jul 4 from Run 2's SSE fix; branch fresh off main, HEAD == origin/main). No new commits touching src/ or server/ since Run 2. Did not re-deep-read the files confirmed CLEAN; instead independently re-verified the MEDIUM/LOW checklist categories that prior runs treated as "improvements or safe" to guard against silent regressions.

### Fixed
- (none — no defects found this run)

### Flagged
- (none)

### Improvements noted
- Carried over, still open (improvements, not defects — not auto-fixed): code-split LearningBrain + pdf.js via React.lazy — build still emits one 1.33MB JS chunk (gzip 375.78kB) + 2.21MB pdf.worker (moderate); markdown.jsx `Markdown` block parse could `useMemo` on `text` (simple); peerPrompt.js aggregate doc token cap — prompt content off-limits per rules (moderate); FlashcardsPanel keydown effect missing dep array — intentional (simple).

### Clean (skip deep read next run unless changed)
- Re-verified this run and confirmed clean:
  - CSS variable integrity — every `var(--…)` reference resolves. Vars are defined in the minified `.app { … }` block in styles.css (--hairline, --accent-ink, --danger, --ring, --ease-out/spring, --motion-fast/med/slow, --mode-button-width, etc.); the dynamic ones (--app-font, --text-size, --accent, --active-mode-index, --deck-color) are set at runtime via inline `style` props in App.jsx. Zero undefined references. (My first pass showed false positives because styles.css is single-line minified and my grep was line-anchored.)
  - markdown.jsx — all 12 highlight.js language modules imported are registered (c, cpp, js/jsx, ts/tsx, python, bash/sh/shell, json, css, html/xml, rust/rs, go, java); an unknown fence lang degrades to plaintext, not a crash. CodeBlock highlight is gated on [code, lang].
  - Hygiene — only console calls are LearningBrain.jsx:462 (legit error handler) and dev.js:52 (server-start banner). No ANTHROPIC_API_KEY / api-key references in src/. .gitignore covers node_modules, dist, .env, *.log, artifacts/. .env.example covers all 5 server env vars (ANTHROPIC_API_KEY/MODEL, OPENAI_API_KEY/MODEL, PORT).
- All files marked CLEAN in Runs 1–2 remain unchanged and clean: storage.js, stateModel.js, learningModel.js, LearningBrain.jsx, handleImage.js, dev.js, constants.js, PeerNavRail.jsx, peerTheme.js, peer-theme.css, main.jsx, materials.js, markdown.jsx, pdf.js, App.jsx, styles.css, peer-skin.css, .env.example. server/handleChat.js remains clean end-to-end after Run 2's SSE error-event fix.

### Notes
- Verification: `npm run build` ✅ (vite 6.4.x, 6.55s), `npm test` ✅ 17/17, `node server/dev.js` ✅ (HTTP 200 at 127.0.0.1). Needed `npm install` first — node_modules absent in fresh clone.
- Recurring pattern: none outstanding. The two real reliability gaps history surfaced (learningModel upsert mutation in Run 1, SSE error swallowing in Run 2) are both closed. Three consecutive clean-or-fixed runs; the codebase is stable. The only lever left is the eager 1.33MB bundle (perf improvement, not a bug).

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

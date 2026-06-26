# Peer · Maintenance Log

Persistent memory for the daily maintenance agent. Newest entry on top. Never delete old entries.

---

## ⚙️ STANDING DIRECTIVES (read every run, before anything else)

- **ALWAYS send the full report at the end of EVERY run** — owner requirement (andor.danse@gmail.com), automated, no exceptions, even on a clean run.
- **Primary delivery channel = PushNotification** with the COMPLETE report inside `<routine_summary>` tags. This is the only channel that reaches the owner's email + phone automatically in headless/scheduled runs (no host allowlist, no MCP token needed). First sentence = banner; full body = email. Put the whole report (health, build status, fixed, flagged, improvements, PR link) in the body.
- **Discord webhook is BLOCKED** by this environment's network egress policy — `discord.com` returns 403 at the proxy. Still attempt it (in case the allowlist gets updated), but verify the HTTP status with `curl -sS -w "%{http_code}"`; NEVER print "[sent]" without checking. Do not treat Discord as the report's safety net — PushNotification is. To restore Discord, the owner must add `discord.com` to the environment allowlist.
- **Gmail MCP is unreliable for automation** — token expires and needs interactive re-auth (absent in scheduled runs), and it only exposes `create_draft` (no send). Use only as a manual extra if already authed; never depend on it.

---

## 2026-06-26 · Run 2

Targeted run. No source files changed since Run 1 (all dated 00:44); branch was in sync with main (PR #1 merged). Resolved the one open HIGH flag from Run 1 and re-verified the CLEAN set.

### Fixed
- HIGH · server/handleChat.js · streamAnthropic · lines 92-104 — resolved the Run 1 flag. The SSE parse loop wrapped event handling in a `try { ... } catch {}` that swallowed everything, so a mid-stream `{"type":"error",...}` event was silently dropped and the stream still ended with `{done:true}` — user saw a truncated answer with no error. Split the loop: the `try/catch` now wraps ONLY `JSON.parse` (`continue` on parse failure), and an error event throws `apiError(502, ...)` OUTSIDE the catch. The throw propagates to `handleChatRequest`'s catch (line 30), which emits `{error}` + `res.end()`; frontend `streamRequest` (App.jsx:536 `if (event.error) throw`) surfaces it. Verified: build PASS, 17/17 tests pass, server boots, `node --check` clean.
- HIGH · server/handleChat.js · streamOpenAI · lines ~162-172 — same swallowing pattern (flag noted "OpenAI has the same gap minus the catch issue"). Applied the identical split: parse-only try/catch, throw `apiError(502, ...)` on `event.error`. Symmetric, low-risk, same propagation path. Verified together with the above.

### Flagged
- (none new) — Run 1's only open HIGH flag is now fixed. Run 1's MEDIUM note (learningModel mutation boundary) remains informational only; no action needed.

### Improvements noted (carried from Run 1, still open — all off-limits or low-value per rules)
- src/peerPrompt.js · buildSystemPrompt — no aggregate token cap across docs (bounded 40k/doc at ingestion). Prompt content off-limits per run rules. · effort: moderate
- src/markdown.jsx · Markdown — block parse runs every render; could `useMemo(text)`. · effort: simple
- vite build — single 1.33MB JS chunk; LearningBrain (Three.js) + pdf.js worker (2.2MB) eager-loaded; `React.lazy` + dynamic import would cut initial load. (Build still warns on >500kB chunk — expected.) · effort: moderate
- src/App.jsx · FlashcardsPanel keydown effect ~line 3003 — no dep array, re-binds each render; intentional closure over deck. Low value. · effort: simple

### Clean (re-confirmed, skip deep read next run unless changed)
- src/storage.js, src/stateModel.js, src/LearningBrain.jsx, server/handleImage.js, server/dev.js, src/constants.js, src/components/PeerNavRail.jsx, src/peerTheme.js, src/peer-theme.css, src/main.jsx, src/materials.js, src/markdown.jsx, src/App.jsx — unchanged since Run 1.
- server/handleChat.js — now fully clean; the streaming error-event gap that was the last open concern is closed.
- .env.example / .gitignore — cover all server env vars + dist/, *.log, node_modules, .env.

### Notes
- Recurring pattern emerging: the SSE streaming loops were the codebase's weak spot (silent `catch {}` swallowing). Both paths are now hardened identically. Future streaming additions should follow the parse-only-catch pattern.
- API model strings untouched per rules. No console noise, no key leakage.

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

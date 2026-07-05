# PROGRESS — Peer build status (unattended overnight run)

> **RESUME HERE:** Milestones M0–M10 are done, committed, and live-verified
> (latest `e06d29b`). Tonight's threads: (1) M11 native packaging next in
> milestone order, (2) "Study Hall" visual makeover per
> `../peer-platform-plan/peer-design-mockup.html`, (3) security hardening.
> Read this file top to bottom; every claim below states how it was verified.

## 1. Milestones

| # | Status | Commit | Notes |
|---|--------|--------|-------|
| M0 stabilize | ✅ done | `aaac9b9` | mobile nav/drawer, a11y pass, bug fixes; verified phone+desktop |
| M1 universal subjects | ✅ done | `0fa7e8e` | 12-domain taxonomy, KaTeX math, de-bias; verified live |
| M2 brain | ✅ done | `1bb64e0` | domain clusters, shapes, pinch, outline view; bundle −67% |
| M3 Supabase backend | ✅ done | `2280b7e` | schema+RLS live; RLS 12/12, 2-device sync 12/12 |
| M4 real auth | ✅ done | `fab0abb` | email+magic link live-verified E2E; **Google enabled in dashboard (google:true)**; Facebook = stubbed pending keys |
| M5 paywall | ✅ done | `3ce4996` | server quotas verified 13/13; Stripe flow built, stubbed pending keys |
| M6 voice | ✅ done | `2e16290` | streaming sentence TTS, HUD, barge-in; instrumented-speech verified |
| M7 images | ✅ done | `8dcf553` | fal.ai FLUX live-verified (real diagram, metered $0.003) |
| M8 RAG | ✅ done | `39da873`+`86e5c2c` | Voyage embeddings; planted-fact cite test 9/9 live |
| M9 rooms | ✅ done | `0b98df7` | realtime 2-client verify 9/9 (presence/chat/quiz/RLS) |
| M10 badges | ✅ done | `e06d29b` | 30 badges, trophy case, sync; live badge earn verified |
| **M11 native (Capacitor+Tauri)** | ⬜ **next in line** | | scaffold configs + build docs; store accounts = owner, later |
| M12 a11y deep pass | ⬜ pending | | needs physical device for mic audio + pinch-zoom checks |
| M13 launch polish | ⬜ pending | | onboarding, dashboard, landing page, legal |

Verification scripts (all runnable anytime, all passing as of last run):
`tools/verify-supabase.mjs` (RLS), `tools/verify-roundtrip.mjs` (sync),
`tools/verify-quota.mjs` (needs dev server, PEER_DEV_URL), `tools/verify-rag.mjs`
(needs dev server), `tools/verify-rooms.mjs` (realtime). Unit tests: `npm test`
(65/65). Dev server: `npm run dev` (PORT env; preview uses autoPort).

## 2. Visual makeover — "Study Hall" (mockup: ../peer-platform-plan/peer-design-mockup.html)

Direction: warm ink bg (#15120d family), parchment text (#f4e8d5), ONE amber
accent (#e0a039), Fraunces serif display + Work Sans UI + JetBrains Mono, warm
shadows (no neon except Brain nodes), ease cubic-bezier(.19,1,.22,1) 180–260ms.
**RULE: restyle, never remove/replace features.**

Plan of record (decided autonomously):
- Foundation = re-map the palette at the source: `src/peerTheme.js` (inline-style
  tokens), `src/subjects.js` accents (warm editorial ramp), `src/brainGraph.js`
  BRAIN_PALETTE (concept=sky #6fa8c9, weak=rose #c96a5a, file=sand #c9a875,
  note=pine #3f8f74, chat=clay #b98a63, quiz=slate, hub=amber), plus a global
  color substitution in styles.css / peer-skin.css / peer-responsive.css
  (violet→amber, cyan→amber-hi, white-alpha text→parchment-alpha, cool blacks→warm
  ink), THEN `src/studyhall.css` loaded last for type/radius/shadow/motion.
- Fonts via index.html (Fraunces + Work Sans; JetBrains Mono already present).
  Display font only applies for the default font choice — accessibility fonts
  (OpenDyslexic, Atkinson, Lexend) still override everything when selected.

Checklist (screen = restyled + screenshot desktop/mobile + feature-parity click-through + committed):
- [ ] Foundation: tokens/palette/fonts swap (all screens shift at once)
- [ ] 1. Chat (incl. composer, mode/depth strips, paywall usage meter)
- [ ] 2. Brain (map + outline; node palette per mockup; keep ALL node types)
- [ ] 3. Code lab
- [ ] 4. Notes
- [ ] 5. Flashcards (incl. review mode)
- [ ] 6. Rooms (list + live room)
- [ ] 7. Badges/trophy case (in Profile)
- [ ] 8. Profile
- [ ] 9. Settings
- [ ] 10. Onboarding + landing/auth
- [ ] 11. Paywall dialog + confirm dialogs + toasts

## 3. Security checklist (what was tested, how, result)

- [x] **RLS cross-user isolation** — `tools/verify-supabase.mjs` live: A's
  projects/messages/notes unreadable+unwritable by B; spoofed inserts rejected;
  service role bypass works. 12/12 PASS (re-run 2026-07-05).
- [x] **Chunk isolation (RAG)** — `tools/verify-rag.mjs`: B cannot match A's
  chunks via RPC or direct select. PASS.
- [x] **Rooms isolation** — `tools/verify-rooms.mjs`: non-member can't see room;
  wrong invite code rejected. PASS.
- [x] **Server-side quotas/entitlements** — `tools/verify-quota.mjs` live: unauth
  chat 401; spent quota 402; client cannot write usage_events or subscriptions
  (RLS read-only — self-metering and self-upgrade rejected). 13/13 PASS.
- [x] **Stripe webhook signatures** — HMAC verify with timing-safe compare;
  valid accepted, forged rejected, stale timestamp rejected (verify-quota). Pro
  granted ONLY via verified webhook (server/handleBilling.js); card data never
  touches our server (Stripe Checkout).
- [x] **Parameterized queries** — no string-built SQL anywhere: all DB access is
  supabase-js builders or fixed-SQL migrations; RPC params bound. (Audited by
  grep for template-literal SQL; none outside migration files.)
- [x] **XSS / untrusted render** — markdown renderer builds React elements from
  text (no dangerouslySetInnerHTML for content); the two dangerous sinks are
  hljs-highlighted code (input HTML-escaped first — CodeEditor escapeHtml;
  CodeBlock uses textContent) and KaTeX output (library-generated with
  throwOnError:false; input never interpolated as HTML). Verified by code audit.
- [x] **Bundle secret scan** — `npm run scan:secrets` (tools/verify-secrets.mjs):
  8 real secret VALUES from .env grepped across every file in dist/ → 0 leaks;
  also scans all 69 tracked repo files for values + key-shaped patterns
  (sk-ant-, sb_secret_, GOCSPX-, sk_live_, whsec_, private keys) → 0 findings.
- [x] **Security headers + CORS** — server/security.js applied to every dev-server
  response: CSP (no wildcards, frame-ancestors 'none', supabase/fonts/fal
  allowlisted; note: script-src keeps 'unsafe-inline'/'unsafe-eval' ONLY for
  Vite dev tooling — production host must drop them), XCTO nosniff, XFO DENY,
  Referrer-Policy, Permissions-Policy, HSTS. /api Origin allowlist (localhost +
  PEER_ALLOWED_ORIGINS). Edge functions' CORS switched from `*` to the same
  allowlist. Verified: tools/verify-hardening.mjs 11/11 (foreign origin → 403,
  app still loads clean under CSP).
- [x] **Rate limiting** — per-route sliding windows keyed by user id (JWT sub)
  or IP: chat 20/min, image 6/min, embed 12/min, ocr 6/min, run 10/min,
  delete-account 3/h. Burst-tested live: 30 rapid chat calls → exactly 20
  passed then 10× 429 with Retry-After + friendly code (verify-hardening).
- [x] **Secret-scan step** — `npm run scan:secrets` covers repo + bundle;
  supports `--staged` for a pre-commit hook.
- [x] **npm audit** — 0 vulnerabilities (2026-07-05, after all new deps).
- [x] **.env git-ignored** — confirmed (`git check-ignore .env` passes; never staged).
- [x] **Tokens/session** — Supabase JWTs in supabase-js storage w/ auto-refresh;
  server verifies via auth.getUser on every gated endpoint (expired/garbage
  token → 401, verified in quota tests). httpOnly cookies not applicable to
  this SPA architecture (documented decision — tokens never in logs).
- [ ] **Sandbox/code-runner** — /api/run proxies to Wandbox (external sandbox);
  needs rate limit (covered by limiter task above). JS runs client-side in a
  Web Worker with no DOM/host access + 3s timeout (already implemented).

## 4. Stubbed pending keys (zero-code-change flip when keys arrive)

- **Facebook login** — full OAuth flow implemented (signInWithOAuth). The button
  now auto-hides while the provider is disabled server-side (checked live:
  only "Continue with Google" renders since google:true, facebook:false).
  Zero-code flip: enable Facebook in the Supabase dashboard → button appears.
- **Stripe** — checkout/portal/webhook fully implemented + signature-verified.
  With STRIPE_* empty, checkout returns 501 whose message surfaces as a
  friendly toast: "Payments aren't configured yet — Pro is coming very soon."
  Paywall/meter/quota all fully live regardless. Zero-code flip when keys land.

## 5. Decisions made autonomously tonight
- (log entries appended here as they happen)

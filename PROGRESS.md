# PROGRESS — Peer build status (unattended overnight run)

> **RESUME EXACTLY HERE: ALL 14 MILESTONES (M0–M13) DONE + VERIFIED.**
> Security `aa6fe8f`; makeover `3007746`..`22b9444`; M11 native `b152de7`;
> M12 a11y `cae3dae`+`32eea2e` (axe 0 everywhere, Lighthouse 100); M13
> launch polish `a05d528`+`fa21d5a`+final (GDPR export, privacy/terms,
> dashboard, reminders, SEO/OG — plus a real bug fixed: spaced-rep progress
> was resetting on reload). Tests 71/71, build clean.
> **NEXT: no milestones left — remaining work is (a) the polish backlog in
> §2 (live-room screenshot w/ partner, paywall dialog screenshot), (b)
> owner-dependent steps: Stripe + Facebook keys (§4 zero-code flips),
> buy the peer.study domain (canonical/OG tags assume it — swap in
> index.html if different), export og.png (1200×630) + branded app icons
> (NATIVE.md), FCM/APNs push, store accounts/signing, device a11y pass
> (maintenance-log M12), production host CSP (drop 'unsafe-inline'/'eval',
> see §3), PEER_API_BASE for a hosted API.** Pick any, or await the owner.
> Read this file top to bottom; every claim states how it was verified.

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
| M11 native (Capacitor+Tauri) | ✅ scaffolded + wired | `b152de7` | android/ + ios/ generated & synced (appId app.peer.study); src-tauri/ scaffolded (strict CSP, 1280×860); src/native.js: status bar, deep links (OAuth redirects re-enter SPA), Android back, hapticTap on badge earns — all feature-detected, web verified unaffected (0 console errors). Platform BUILDS need toolchains this machine lacks (no Rust/Java/Android SDK) — exact commands in NATIVE.md; icons/splash + push notifications documented as owner steps. |
| M12 a11y deep pass | ✅ done | `cae3dae`+`32eea2e` | axe-core 4.12.1 injected live: **0 violations on every screen** (landing/chat/brain/code/notes/cards/rooms/settings×3/profile + modal/confirm/palette), dark AND light, 1280px AND 320px. Lighthouse a11y **100/100** (landing). Keyboard: focus in/Escape/restore on dialogs, skip links, no positive tabindex. Reflow 320px + 19px text: no overflow. Reduced-motion blankets intact. Owner (device-only): VoiceOver/TalkBack run-through, mic audio, real pinch-zoom — steps in maintenance-log M12 entry. |
| M13 launch polish | ✅ done | `a05d528`+`fa21d5a`+(this commit) | GDPR export (verified valid JSON, all 16 state keys) + in-app privacy/terms (axe 0); progress dashboard "Today" card (streak/due/mastery/7-day bars) + review-now → auto-starts review (verified 1/5→2/5→persists); daily-snoozed reminder banner (verified across reloads); **fixed pre-existing bug: normalizeState stripped SM-2 fields → all review progress reset on reload** (regression test added); SEO/OG/Twitter meta + canonical; onboarding copy. Tests 71/71. Owner: og.png export, peer.study domain (canonical placeholder), FCM/APNs push. |

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

Checklist (screen = restyled + screenshot + feature-parity click-through):
- [x] Foundation (`3007746`): full palette remap at the source (3 CSS files +
  peerTheme/subjects/brainGraph/badges), Fraunces+Work Sans via index.html,
  studyhall.css overlay (type/radius/shadows/motion/light-paper theme),
  --font-display respects accessibility fonts. 65/65 tests.
- [x] 1. Chat (`c3776e0`) — parity: 8 modes switch, depth switches, palette
  opens, composer intact; legacy project colors migrate to warm ramp.
- [x] 2. Brain (`c1e7ac9`) — amber ring hub w/ the one intentional glow; dots
  aligned to node palette; parity: Map/Outline toggle, selection sync,
  filters, canvas restore.
- [x] 3. Code lab — warm via peerTheme tokens; parity: real code RAN in the
  sandbox under the new skin (verified "olleh" output).
- [x] 4. Notes — Fraunces heading, warm cards/empty state (screenshot ✓).
- [x] 5. Flashcards — renders under new skin (screenshot ✓; review-mode deep
  pass worth one more look next session with a populated deck).
- [x] 6. Rooms — renders under new skin (sign-in gate state verified).
- [x] 7+8. Profile + trophy case — serif headings, small-caps card labels,
  warm medallions (screenshot ✓).
- [x] 9. Settings — grid intact; light theme = warm paper rgb(250,246,238),
  dark restored (verified live).
- [x] 10. Landing/auth — the showcase screen: serif headline, amber CTA
  (screenshot ✓). Onboarding modal inherits foundation.
- [x] 11. Dialogs/toasts — inherit foundation (radius 20 panels, warm shadows).
Polish backlog for next session (visual nits, not blockers): live-room screen
with a partner, paywall dialog screenshot. (Populated-deck review mode:
verified with screenshot during M13 — warm amber card, grade buttons, 1/5
progress meter, all correct under the Study Hall skin.)

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

## Learning DNA (north-star adaptive tutor, 2026-07-05)

Built in 5 verified layers on the EXISTING profile/mastery shapes — every
signal feeds the same place the tutor prompt already reads from, and every
layer has before/after tests plus at least one live proof.

- **L1 signals** (`4fcb7f2`): implicit capture, zero extra clicks —
  analogy domains the learner volunteers (framing-gated so "I have
  basketball practice" doesn't pollute), cram cues + recency, frustration
  recency, per-subject warm-up vs dive-in session openings. All fields
  survive normalize/persist/sync/export (round-trip tested).
- **L2 loops** (`abd109c`): short-message writers get concise answers with
  no chip click; 2+ analogies from one domain → tutor LEADS with that
  domain (live-proven: after two gaming analogies, "explain LTD" opened
  with "like a skill you stop practicing... a move in your game", 64
  words); misconception recall is proactive ("Last time you thought X —
  let's make sure that's solid"), never a reprimand; warm-up learners get
  a session-opening recap, dive-in learners don't.
- **L3 trust layer** (`0bc0cf8`): Profile "Learning DNA" panel — specific
  sentences from real signals, each inference editable ("spot on" /
  "not me"). An explicit correction outranks any inference strength
  (live-proven: rejecting the gaming line struck it through, stored
  dnaOverrides.analogy="rejected" in the export, and removes the
  directive; toggling restores pure inference). axe 0 violations.
- **L4 calibration + mood** (`4b571eb`): failing a flashcard on a concept
  the learner rated strong records a confidence/reality gap → tutor
  quietly verifies before building on it (live-proven: NMDA Receptor
  74%→46%, CALIBRATION directive appeared naming it); frustration within
  30 min → proactively smaller steps; cram cue within 48h → deadline
  mode; practice sets target recurring misconceptions + gapped concepts,
  not just "more of the topic".
- **L5 carryover** (this commit): meta-profile (concision, example-first,
  analogy world) applies to a brand-new subject on day one, while
  subject-specific struggle signals never leak across subjects — both
  directions unit-proven.
- **Privacy**: DNA lives in the same RLS rows as everything else
  (profiles.data + projects.mastery, isolation verified 12/12), is fully
  present in the GDPR export (live-verified) and the delete cascade, and
  reaches the model only as aggregates + max 9 one-line directives —
  never raw history dumps.

## Fifth pass: bare buttons — one ghost style for every secondary action (2026-07-06)

- **Audit method**: scripted scan of every `<button` in every .jsx for missing
  className, then cross-checked which of those are actually covered by
  contextual CSS (`.confirm-actions button`, `.note-card header button`,
  `.account-summary button`, `.sync-status button`, `.brain-related button`,
  `.attachment-tray button`, `.auth-switch button`, doc/plan/onboarding
  groups — all styled) vs. truly browser-default. Verified in the RUNNING
  app with a computed-style detector (default ButtonFace background).
- **Truly bare**: Rooms create-form "Cancel", Settings→Plan "Manage billing"
  (pro-only), and the Flashcards header trio ("Exit review", "Back to chat",
  and the disabled "Nothing due" state — fixed in the §3 commit).
- **The fix**: a reusable `.ghost-button` class in studyhall.css — the same
  quiet text-tinted secondary pattern the design system already used in
  `.legal-links`/`.plan-upgrade-row`, promoted to a named class with hover/
  disabled/light-mode states. Applied to every bare button; verified live
  (Rooms Cancel computed style = text-tinted ghost, 10px radius).
- **Flashcards header** (§3, own commit): "Exit review", "Back to chat", AND
  the easy-to-miss disabled "Nothing due" state (its className was `""` when
  no cards were due) all wear `.ghost-button` now. Screenshot-verified in
  review mode under studyhall/indigo/mono — the remaining colors on that
  screen (sand "Still learning" / pine "I know this" grade tints, per-deck
  identity dots) are the documented intentional set.

## Fifth pass: exhaustive color audit — every literal fixed or blessed (2026-07-06)

- **The recurring "blue controls" bug is dead, with the real root cause found**
  (this commit). Two mechanisms, not one:
  1. `styles.css` still had `.theme-light { --accent: #0099cc }` — a legacy
     LIGHT-MODE override that hijacked the whole `--accent` token with blue
     whenever Settings → Theme = Light, regardless of the active palette.
     Light mode now derives `--accent/--accent-2/--accent-rgb` from the
     `--sh-*` contract like dark mode always did (verified live: light+
     studyhall → `--accent` #e0a039, light+indigo → #8b7cf7).
  2. `.segmented button.active` hardcoded `linear-gradient(…, #5b7cf5)` +
     `color:#061116` — the Rooms Public/Private toggle, the Dark/Light
     toggle, and every other segmented control rendered indigo-blue in all
     themes. Now `var(--sh-accent) → var(--sh-accent-hi)` + `var(--sh-accent-ink)`.
- **Systematic, not spot-check**: a scanner (now a repo tool,
  `tools/color-audit.cjs`) walks every `.css/.js/.jsx` in src/, flags every
  hex/rgb/rgba literal that isn't a `var()` reference or a documented
  intentional color. First run: **363 offenders**. After this pass: **0**.
  ~290 conversions by family: old-indigo `rgba(139,124,246,…)` accents →
  `rgba(var(--sh-accent-rgb),…)`; cool blue-white text ramps → `rgba(var(--sh-text-rgb),…)`;
  old navy surfaces → `color-mix(… var(--sh-bg-deep) …)`; neon pink danger →
  the design system's warm danger family; light-mode COOL ink/paper
  (#1d2233/#f5f6fb/#4c3fd4-indigo) → the warm paper family studyhall.css
  established (#2a2318/#faf6ee/theme accent). Send-button cyan hovers,
  vscode-editor bg, Code-lab inline glow, sync.js default project color
  (old indigo → warm taupe #9c8b74) all converted.
- **Brain legend/2D-fallback re-aligned to the real data-viz palette**: the
  legend dots and SVG-fallback node strokes still used the OLD violet/blue
  node colors; they now mirror `BRAIN_PALETTE` (brainGraph.js) — hubs wear
  the theme accent, type colors are the warm fixed set.
- **Intentionally fixed (blessed, in the audit tool's list)**: subject-domain
  accents, brain node-type colors, per-project identity colors, badge tints,
  hljs syntax palette, danger red / success green status tones, Google &
  Facebook logo brand colors, the mono palette-picker swatch, terminal
  prompt green, and the light-mode warm paper family. Everything else must
  reference the theme contract — `node tools/color-audit.cjs` enforces it.
- **Verified live** (running app, real controls): segmented active state +
  StyledSelect popover selected/highlighted + send button + Rooms visibility
  toggle computed styles under studyhall/indigo/mono, palette switching in
  light mode, screenshots of Settings appearance under all three palettes;
  98/98 tests, clean build.

## Fourth pass: code libraries, brain navigation, the Stone mark (2026-07-05)

- **Code lab libraries** (`8dadfc2`): Python now runs IN the browser via
  Pyodide — numpy/pandas/matplotlib/scipy/sympy genuinely import
  (loadPackagesFromImports); verified live: numpy matrix program printed
  real output ("numpy 1.26.4", exit 0 · 888ms · browser · pyodide).
  Graphical libs (pygame/tkinter/turtle) are fundamentally un-terminalable —
  detected up front with an honest, friendly explanation (verified with a
  real pygame window program). **Follow-up (documented, not silently
  broken): a browser-canvas mode for graphical Python via pygame-web/pygbag;
  npm-package support for the JS sandbox.** Wandbox stays as Python's
  offline fallback; CSP allowlists cdn.jsdelivr.net.
- **StyledSelect v2** (`4b83838`): re-audit proved all 12 selects were
  skinned — the remaining "default bar" was the NATIVE OPTION POPUP (OS
  chrome, unstylable). The popup is now our own ARIA listbox with full
  keyboard support + typeahead; same API, all call sites unchanged.
- **Brain navigation overhaul** (`014426d`): free pan (right/middle/
  shift-drag, two-finger), zoom-at-cursor (map-app: the point under the
  pointer stays put), pinch = zoom+pan combined, Reset = true fit-to-view
  (centroid + extent), zoom range 7..90. Camera-state readout proves it:
  pan moved target 7.9 units; wheel at a corner took radius 26->9.5 while
  pulling the target 1.39 units toward the cursor; Reset reframed to the
  real centroid.
- **The Peer mark — Philosopher's Stone** (this commit): the alchemical
  "squaring the circle" (circle r44 → inscribed triangle at 90°/210°/330° →
  square of side s(2√3−3) on its base → center circle), precise geometry,
  clean linework, currentColor. Two cuts: full (3sw, stroked center) and
  bold (6.5sw, filled dot, auto below 26px). Replaces the rail star, the
  welcome/avatar marks, favicon + PWA icons; verified inking correctly
  against all three themes' accent tiles (mono = its natural home).
  **Full native icon exports generated now** (not left as owner step):
  92 Android + 7 iOS via @capacitor/assets, PWA webp set, Tauri
  icns/ico/png set — all from resources/icon.png rendered off the SVG.
  (Note: @capacitor/assets clobbered public/ during generate — SVGs +
  manifest restored, generated PWA icons relocated to public/icons/.)

- **Three-theme re-verification** (this commit): Code lab's remaining
  hardcodes converted (21: #07070e shell, cool-white rgba ramp, legacy
  violet-cyan button gradient → theme vars). Automated sweep: 24
  theme×screen combos (3 themes × 8 screens) checked for off-palette
  backgrounds and amber leakage under indigo/mono — the ONLY hits are
  `project-dot` colors, which are per-project USER-DATA identity colors
  (same intentional category as domain accents and brain node types).
  Screenshot proof: indigo Code lab (violet→cyan, zero amber) + mono
  flashcard review (black/white, semantic state tints only) + studyhall
  full app with the new mark.

## Rooms discovery + subscription page + modal/fullscreen fixes (owner-reported, 2026-07-05, third pass)

- **Rooms public/private + discovery** (`81feecb`): migration 0006 adds
  rooms.visibility (private default = exactly today's behavior) +
  list_public_rooms() (SECURITY DEFINER, safe fields only — no invite codes/
  owner ids) + join_public_room() (server-side visibility re-check).
  RoomsPanel: Private/Public toggle at creation + a discovery feed grouped by
  the 12-domain taxonomy (filter, member counts, "active today", one-click
  join). Proof: tools/verify-discovery.mjs 12/12 with two fresh accounts
  (public listed / private invisible+unjoinable / counts update / contents
  sealed) AND verify-rooms.mjs re-run 9/9 (no regression).
- **REAL BUG — all modals rendered in document flow** (`83d2230`): a
  makeover z-layering rule forced position:relative onto every backdrop,
  defeating the fixed+centered base; the command palette had self-healed
  with !important, masking the breadth. Fixed at source; onboarding/project/
  confirm/paywall verified centered at 1920/1280/375.
- **Brain fullscreen** (`b6a80f5`): real immersive mode — rail/bottom-nav
  collapse (never dependent on the Fullscreen API, which some webviews
  deny), browser fullscreen layered on when allowed; canvas reflows via the
  existing ResizeObserver. Verified: 78px rail reclaimed at 1280, bottom nav
  + safe-area padding gone at 375, restore + Escape paths clean.
- **Subscription page** (`d363c44`): Settings → Plan — always-browsable
  Free/Pro comparison, live usage meter (verified showing the real 28k/30k
  day), renewal date via usage API (renewsAt), Manage-billing portal link,
  same checkout entry + same Stripe-stub messaging as the reactive paywall.
- **STANDING QUALITY BAR — per-device layouts** (this commit): every UI
  change is checked at in-between and extreme widths (foldable ~834,
  ultrawide 2560–3440), not just 320/768/1440. Verified this pass: chat
  column stays readable (≤860px) at 3440, settings/profile grids cap
  sensibly, Brain lanes overlap-free at 3440, no h-scroll at 834; new
  components (plan cards, discovery groups) use auto-fit grids that adapt
  by available width rather than fixed breakpoints.

## Bug-fix + multi-theme pass (owner-reported, 2026-07-05, second session)

- **REAL BUG — Code lab tutor had no memory** (`057df93`): askPeer sent only
  the current message every time. Bounded history now threads (12 msgs, 4k
  cap each; per-turn system prompt still rebuilds with current code).
  Live-proven: turn 3 recalled a nickname set in turn 1.
- **REAL BUG — Brain overlap at 1920px+** (`7047d51`): four legacy
  width/centering rules in styles.css over-constrained the skin's absolute
  lanes (workspace centered at 1480px while heading/toolbar stayed
  full-bleed). Removed at the source; heading now RESERVES the toolbar lane.
  DOM-geometry verified: zero overlaps at 1280/1920/2560, map + outline.
- **Styled select** (`86a061a`): one skinned-native dropdown component;
  all 12 native selects replaced (Code lab, Brain, notes filter, profile,
  project modal, onboarding, Rooms).
- **Off-palette chat icon** (`9d3d4d1`): assistant avatar was hardcoded pine
  green with a generic lucide Brain — now Peer's own PeerLogo mark on theme
  variables (welcome marks + avatars).
- **Multi-theme system** (`f09a1ce`): Study Hall (default) / Indigo Night
  (violet→cyan) / Monochrome (true B&W) via data-theme + the --sh-* variable
  contract; picker in Settings→Appearance, persisted + synced, instant.
  The audit converted ~830 hardcoded literals across 5 stylesheets +
  peerTheme.js to theme variables; Brain hubs resolve the accent at scene
  build (WebGL can't read var()); node TYPE colors stay fixed (data-viz
  semantics — intentional). Verified on Chat/Brain/Settings per theme
  (screenshots; mono Brain shows WHITE hubs proving the pipeline).
- **Sweep** (this commit): audited every AI call site for lost context —
  chat/regenerate/practice thread history ✓, flashcard generation is
  one-shot by design ✓, Rooms/Notes have no direct AI calls ✓. Rail profile
  avatar was still hardcoded green → themed. Native range slider →
  accent-color themed. hexA fallback repaired. Wide-viewport text-overlap
  detector run on all six other screens at 2560px: zero findings.
  Remaining native controls: two hidden file pickers (behind styled
  buttons — fine).

## Polish pass (owner-requested sweep, 2026-07-05)

- **Chat chips**: 19-chip wall → 5 contextual chips + "More" expander; the
  contextual slot adapts per message; nothing removed (commit `92c3047`).
- **BUG: feedback flag lost** on follow-up chips (Too long/Confused/…) —
  sendMessage overwrote messages from a stale snapshot; fixed (`92c3047`).
- **BUG: adaptive signals never accumulated** for follow-up feedback — same
  stale-snapshot clobber on profile/mastery; fixed, loop now provably closes
  (3× "too long" → 33-word answers vs ~100 before) (`d898c8e`).
- **Adaptive learning made visible**: Profile "How you learn" card with
  specific persona lines + once-ever in-chat note when an adaptation kicks
  in (`d898c8e`).
- **Stale topbar pill** said "Local app" forever → now live: "Synced" /
  "Syncing…" / "Sync issue" / "On this device".
- **Jargon**: "Rubber duck" mode label → "Teach back" (id/behavior unchanged;
  matches the existing chip).
- **Notes empty state**: guidance rewritten + "Go to chat" CTA (matches the
  flashcards empty state).
- **Duplicate starter project**: every fresh device created its own
  "My first topic" and bootstrap kept both — bootstrap now prunes the
  untouched local starter when the cloud brings real projects (unit-tested);
  the existing duplicate in the test account was deleted via the UI.
- Checked, no action needed: flashcards/rooms/review empty states already
  guide + CTA; makeFlashcards/save/export all give immediate feedback
  (toasts/label change); no duplicate controls found; spacing consistent
  post-makeover (axe/screenshot sweep in M12 double-checked).

## 5. Decisions made autonomously tonight
- **Canonical domain**: index.html canonical/OG URLs assume `https://peer.study`
  (matches appId app.peer.study). Not purchased yet — swap if the owner picks
  a different domain. og:image points at /og.png which needs an owner export.
- **Legal contact**: privacy/terms list andor.danse@gmail.com as contact
  (src/legal.jsx LEGAL_CONTACT) — consider a support@ alias before launch.
- **Lighthouse scope**: only the landing is URL-addressable in a fresh
  headless profile; signed-in screens were audited with axe-core per screen
  (same engine Lighthouse uses) — recorded as the M12 evidence.
- **Test account**: peer-m7-browser@example.com now contains the two sample
  demo subjects (loaded during M13 verification of the dashboard/reminders).
  Kept per the owner's earlier instruction not to delete this account.
- **Reminder design**: one banner per app open, localStorage day-snooze, due
  cards outrank streak nudges — no notification permission requested (push
  is an owner step, FCM/APNs, NATIVE.md).

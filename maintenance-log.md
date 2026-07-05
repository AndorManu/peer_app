# Maintenance log

## 2026-07-05 — M9: Real peer-to-peer rooms

**What changed**
- **The local rooms prototype is gone** — replaced by real Supabase Realtime
  multiplayer ([src/RoomsPanel.jsx](src/RoomsPanel.jsx), lazy-loaded, 12KB):
  - Rooms live in Postgres (RLS: visible to members only). Create one and it
    gets an unguessable **invite code**; partners join from any device via
    `join_room_with_code` (SECURITY DEFINER RPC, migration 0004 — the code is
    the capability, wrong codes rejected).
  - **Presence**: live "here now" chips show who's actually in the room.
  - **Room chat** over broadcast — which doubles as live teach-back with a real
    partner: explain, get questioned, in any language.
  - **Co-op quiz**: the host picks one of their flashcard decks and quizzes the
    whole room with synchronized question → reveal → next; answers happen in
    chat. Subject-aware: rooms carry a domain (auto-classified from the name)
    with its icon + accent.
  - Signed-out users get a clear sign-in prompt (rooms are inherently
    multi-user). Command palette entry updated.

**What I tested**
- `tools/verify-rooms.mjs` live against the project — **9/9 PASS**: A creates a
  room; an outsider can't see it (RLS) and a wrong invite code is rejected; B
  joins via the code and gains visibility; two separate realtime clients
  connect ("two devices"), presence shows both partners, A's chat message
  reaches B live, and a co-op quiz question syncs to B. Cleanup cascades.
- Browser smoke: Rooms tab renders the sign-in gate for guests, no console
  errors. 59/59 tests; build clean (RoomsPanel is its own lazy chunk).

**Notes**
- Broadcast channels are unguessable-UUID topics; moving them to authorized
  private channels is queued for the pre-launch security pass.

## 2026-07-05 — M8: Document intelligence (RAG)

**What changed**
- **Semantic retrieval pipeline** ([server/handleRag.js](server/handleRag.js)):
  `/api/embed-doc` chunks uploaded documents (~1200 chars, paragraph-aware,
  200 overlap), embeds them at **1024 dimensions**, and stores them in
  `document_chunks` (pgvector + HNSW, migrations 0002/0003 applied live).
  Embedding provider is pluggable: **Voyage AI** (`VOYAGE_API_KEY`,
  voyage-3.5-lite) or **OpenAI** (`OPENAI_API_KEY`, text-embedding-3-small with
  `dimensions=1024`) — both multilingual.
- **Grounded, cited answers**: when a subject's library exceeds ~8k characters,
  the client stops inlining every document into the prompt (cheaper, cleaner)
  and sends a retrieval marker instead; the chat proxy embeds the learner's
  question, fetches their own top chunks (`match_document_chunks`, RLS-scoped),
  and injects them as excerpts with instructions to cite document names in
  brackets and to say so when the material lacks the answer.
- **OCR** (`/api/ocr`): Claude vision transcribes text from uploaded images
  (structure preserved as markdown, original language) — an "Extract text
  (OCR)" button in the document modal makes scanned pages searchable and
  embeddable. Gated + metered like everything else.
- Docs auto-embed on upload (fire-and-forget); deleting a doc removes its
  chunks; embedding/OCR usage is metered with real token counts.

**What I tested (live: `tools/verify-rag.mjs`)**
- PASS: retrieval-marked chat streams; user B cannot match user A's chunks (RPC
  + direct select both blocked by RLS); deleting a doc removes its chunks; and
  with no excerpts available the tutor honestly said it couldn't answer rather
  than inventing the made-up test fact — exactly the anti-hallucination
  behavior the prompt demands.
- **UNBLOCKED + fully verified (later the same day)**: owner added a Voyage AI
  key → `tools/verify-rag.mjs` now passes **9/9**: 14 chunks embedded (2,822
  tokens metered), and the retrieval-backed chat answered a planted fact no
  model could know — "the Verholt constant equals exactly 42.7183 kilojoules
  per mole, named after Ada Verholt" — grounded in and citing the learner's own
  document. M8 done-criteria met end-to-end.
- Also completed by the owner this session: **Google sign-in is live**
  (provider enabled in the Supabase dashboard, `auth/v1/settings` reports
  google: true; Site URL + redirect wildcard configured for localhost:5173).
  Reminder: the Google OAuth app is in testing mode — add your own Gmail as a
  test user in Google Cloud Console if sign-in says access denied.
- 59/59 tests; build clean.

## 2026-07-05 — M7: Image generation for visual teaching

**What changed**
- **Real image generation** ([server/handleImage.js](server/handleImage.js)):
  the endpoint now calls **fal.ai FLUX schnell** with the owner's `IMAGE_API_KEY`
  (16:9 educational diagrams, 4 inference steps ≈ $0.003/image). Same gate as
  chat: Supabase session required (401 → sign-in modal), daily quota enforced
  (402 → paywall), and each image is metered heavier — a flat 4,000-token
  equivalent (~7 images/day free, ~125 Pro) with the real dollar cost recorded.
- **Saved with the lesson**: a generated visual lands in the chat inline AND is
  added to the subject's library as an image document, so it appears in the
  Brain as a Material node and in the project modal.
- **Alt text always**: the server echoes an `altText` (derived from the topic),
  the `<img>` uses it, and the message content includes the description for
  screen readers and the transcript.
- Message images got proper styling (rounded, bordered, shadowed, responsive).

**What I tested (live, real fal.ai calls)**
- Server: authed request → 200 with a real image URL, usage row
  `{kind: "image", model: "fal-ai/flux/schnell", tokens_out: 4000, cost_usd: 0.003}`.
- Browser: signed in, asked about the water cycle, clicked **Visualize** → a
  genuine labeled water-cycle diagram rendered inline with meaningful alt text,
  and showed up in the Brain outline as a Material node under the subject.
- 59/59 tests; build clean.
- Note: test account `peer-m7-browser@example.com` (password `Peer-m7-Browser!`)
  was left in the Supabase project at the owner's request — handy for manual
  testing; delete it from Authentication → Users whenever.

**Also this session (owner setup progress)**
- `IMAGE_API_KEY` (fal.ai) and `GOOGLE_CLIENT_ID/SECRET` are now filled in
  `.env`. Google still needs the provider toggled ON in Supabase Dashboard →
  Authentication → Providers → Google (paste the same ID/secret there) — as of
  the last check `/auth/v1/settings` still reports google: false.

## 2026-07-05 — M6: Voice-to-voice (perfected)

**What changed**
- **Low latency**: Peer now speaks sentence-by-sentence WHILE the answer streams
  (it used to wait for the entire response). Sentence extraction is code-fence and
  display-math aware (never starts reading inside an unclosed ``` or $$ block);
  code blocks read as "(code block)", equations as "(equation)".
- **Utterance queue**: the hands-free listen loop resumes only after the LAST
  queued sentence finishes (a counter, not per-utterance events).
- **Barge-in**: sending a new message (typed or spoken) cancels the current
  speech queue instantly; the mic button already interrupted speech.
- **Voice HUD**: a live status chip above the composer — Listening (green pulse) /
  Thinking (cyan) / Speaking with an "interrupt" hint (violet) — `role="status"`
  so screen readers hear state changes. The chat thread remains the full
  transcript (captions requirement).

**What I tested**
- Live in the browser with an instrumented speechSynthesis: signed in, voice
  mode on, asked for a 3-sentence answer → exactly 3 utterances queued as the
  stream arrived, first sentence spoken before the answer finished, markdown
  stripped, HUD cycled through states and settled. 59/59 tests; build clean.
- Real audio + mic can't run headlessly — flagged for a physical-device pass
  (M12 matrix) alongside pinch-zoom.

## 2026-07-05 — M5: Paywall + daily free tokens

**What changed**
- **Server-side entitlements** ([server/entitlements.js](server/entitlements.js)):
  Free = 30k tokens/day on Haiku 4.5; Pro = 500k/day on Sonnet 4.6 with a fair-use
  soft-fallback to Haiku past 150k/day. "Daily" = the learner's local midnight
  (client sends its tz offset). Plan resolution reads the subscriptions table
  (client-read-only by RLS), usage comes from usage_events (server-written only) —
  nothing about the gate can be influenced from the browser.
- **The chat proxy is gated**: no JWT → 401 (clean sign-in modal), quota spent →
  402 (paywall dialog with usage bar + Pro pitch at $8.99/mo / $79/yr). Model is
  chosen per plan on the server. Every call is metered (tokens in/out + computed
  cost) including prompt-cache reads; the big tutor system prompt now uses
  Anthropic prompt caching (~90% cheaper repeat-turn input).
- **Usage meter**: `/api/usage` + a live "Xk AI tokens left today" readout under
  the composer (amber when >85% spent).
- **Stripe** ([server/handleBilling.js](server/handleBilling.js)): checkout
  session + customer portal + webhook endpoints. Pro is granted ONLY from a
  signature-verified webhook (HMAC, timing-safe, 5-min tolerance), idempotent
  upserts, card data never touches our server. Degrades gracefully (501 +
  friendly copy) until the owner adds keys.

**What I tested (live, `tools/verify-quota.mjs` → 13/13 PASS)**
- Unauthenticated chat → 401. Authed free chat → 200, metered server-side
  (Haiku, real token counts + cost). `/api/usage` reports the free 30k meter.
  Simulated a spent day → clean 402 with `quota_exhausted` payload. Flipped the
  user to Pro (service role) → 500k allowance, admitted past the free cap, routed
  to Sonnet. Webhook signature: valid accepted, forged rejected, stale rejected.
  Checkout without keys → graceful 501. Guest in the browser → sign-in gate modal
  with correct focus. 59/59 tests; build clean.

**Owner setup to complete payments (everything else is wired)**
1. Stripe Dashboard: create a "Peer Pro" product with two prices — $8.99/month
   and $79/year; copy the price IDs into `.env` (STRIPE_PRICE_ID_MONTHLY/YEARLY)
   plus STRIPE_SECRET_KEY + STRIPE_PUBLISHABLE_KEY.
2. Add a webhook endpoint pointing at `/api/stripe-webhook` (dev: `stripe listen
   --forward-to localhost:5173/api/stripe-webhook`) for events
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`; put its signing secret in
   STRIPE_WEBHOOK_SECRET.
3. Test with card 4242 4242 4242 4242 — the webhook grants Pro, the meter flips
   to 500k/day automatically.

**Notes**
- Image generation (`/api/image`) gets the same gate + heavier metering when M7
  rebuilds it; the code runner gets rate-limiting in the security pass.

## 2026-07-05 — M4: Real auth

**What changed**
- **The fake demo-code auth is gone.** [src/auth.jsx](src/auth.jsx) is a real
  Supabase Auth panel: email + password sign-up/sign-in, magic-link flow,
  Google + Facebook OAuth buttons (`signInWithOAuth`, with a clear "not switched
  on yet" message until the owner configures the providers), and guest mode.
- **Sessions drive the app**: `onAuthStateChange` mirrors the session into
  `state.account` (name/email/provider), signing in flips past the landing,
  sessions persist across reloads (supabase-js token storage + auto-refresh).
- **Guest→account migration** falls out of the M3 sync design: the first sync
  after sign-in pulls the cloud, then pushes everything that only exists locally
  — a guest's subjects/chats/notes upload automatically.
- **Sign out** (Settings → Account) keeps local data and returns to the landing.
- **Account deletion**: JWT-verified `/api/delete-account` (dev server) +
  matching edge function; the service role deletes the auth user and FK cascades
  erase every cloud row. Confirmed via an accessible confirm dialog.
- AUTH_PROVIDERS trimmed to google/facebook/email (old stored providers
  normalize to email).

**What I tested (live, through the real UI in a browser)**
- Created a confirmed user via the admin API, then: created a **guest** subject
  ("Genetics") → signed in through the login form → within seconds the cloud had
  both guest subjects + the profile row (verified server-side with the service
  role). Session survived a full page reload. Account card showed the signed-in
  user with sync status "idle". Sign out returned to the landing with local data
  intact. Signed back in, deleted the account through the danger-zone flow →
  auth user gone, cascaded rows gone (verified: 0 users).
- Zero console errors; `npm test` 59/59; build clean.

**Owner setup needed to light up social sign-in (M4 done-criteria remainder)**
1. **Google**: create an OAuth client (Web) in Google Cloud Console with redirect
   URI `https://<project-ref>.supabase.co/auth/v1/callback`, then enable the
   Google provider in Supabase Dashboard → Authentication → Providers with that
   client ID/secret (also drop them in `.env` as GOOGLE_CLIENT_ID/SECRET).
2. **Facebook**: create a Facebook Login app with the same redirect URI, enable
   the Facebook provider in the dashboard, fill FACEBOOK_APP_ID/SECRET.
3. In Supabase → Authentication → URL Configuration set the Site URL (and later
   the production domain) so magic links / OAuth land back in the app.
   The code paths are already wired — no app changes needed afterwards.

## 2026-07-05 — M3: Backend foundation (Supabase)

**What changed**
- **Full cloud schema, applied live** ([supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql)):
  profiles, projects, documents, chats, messages, notes, decks, cards (SRS state in
  jsonb), rooms + room_members (for M9), document_chunks with pgvector (for M8),
  badges (M10), usage_events + subscriptions (M5). Local-first `(user_id, id)` keys,
  soft-delete tombstones, server-set `updated_at` triggers. Applied with
  `node tools/db-migrate.mjs` (idempotent, tracks applied files).
- **RLS on every table** — per-user isolation (`user_id = auth.uid()`); usage_events
  and subscriptions are client-read-only (server/webhooks write via service role);
  rooms use a security-definer membership check (no recursive policies).
- **Offline-first sync engine** ([src/sync.js](src/sync.js)): local IndexedDB stays
  the source of truth. Push = hash-diff against the last-sync snapshot (no fragile
  per-mutation bookkeeping); deletes = tombstone log pushed as soft-deletes; pull =
  `updated_at` cursor with an overlap window; locally-dirty rows win over pulled
  rows (deterministic LWW, re-pushed next cycle). First sync pulls before pushing so
  a fresh device can never clobber the cloud (a real bug the live round-trip test
  caught). Background loop ([src/useCloudSync.js](src/useCloudSync.js)) runs every
  30s + on focus/reconnect, dormant without a session.
- **Client wiring**: `/api/config` serves only browser-safe values (URL + anon key);
  supabase-js lazy-loads; delete flows record tombstones; Settings → Account shows a
  live cloud-sync status card.
- **Production AI proxy scaffold** ([supabase/functions/chat/index.ts](supabase/functions/chat/index.ts)):
  same SSE protocol as dev, plus JWT auth, Anthropic prompt caching on the system
  prompt, and server-side usage metering into usage_events (the M5 quota hook).
  Deploy instructions in [supabase/README.md](supabase/README.md).

**What I tested (all against the LIVE Supabase project)**
- `tools/verify-supabase.mjs` — **12/12 PASS**: cross-user reads/updates/deletes/
  spoofed inserts all rejected by RLS; clients cannot write their own usage
  metering or grant themselves Pro; service role bypasses for server paths;
  test users cleaned up.
- `tools/verify-roundtrip.mjs` — **12/12 PASS** running the app's real sync engine
  as two devices on one account: full-state bootstrap (subjects, docs, chats,
  messages, notes, decks, SRS state, profile), cross-device edit propagation,
  tombstoned deletions, offline-edit reconcile.
- App smoke: boots clean, sync card shows signed-out state, zero console errors.
- `npm test` 59/59 (8 new sync-engine tests); build clean (supabase-js is a lazy chunk).

**Notes / next**
- In-app sign-in is M4 (Google/Facebook/email + guest→account migration) — sync
  activates automatically once a session exists.
- Edge-function deploy + CORS-origin lockdown is an owner step (see supabase/README).
- Image previews (data URLs) are not synced yet — they move to Supabase Storage in
  a later milestone.

## 2026-07-05 — M2: Brain perfection

**What changed**
- **Graph builder extracted + domain clustering** ([src/brainGraph.js](src/brainGraph.js)):
  the node/link builder moved out of the React file into a pure, unit-tested module.
  In global scope with ≥2 real domains, domain cluster nodes now sit between the brain
  root and subjects (root → Natural Sciences → Organic Chemistry → concepts/sources),
  tinted with their taxonomy accents. Searching keeps matching nodes AND their
  ancestors (subject + domain) for context.
- **Code splitting**: the Brain (Three.js, 550KB), pdf.js (365KB), KaTeX (260KB), and
  the Code lab (23KB) are now lazy chunks with styled loading states — the main bundle
  dropped **1,387KB → 458KB (−67%)**.
- **Colorblind-safe shape coding**: node cores are shape-coded sprites — ring = hub
  (brain/domain/subject), circle = concept, diamond = weak spot, square = source
  (file/code/note/chat/quiz) — with matching glyphs in the floating labels, the
  legend, and the outline view. Edges tint subtly toward their cluster's color.
  A soft vignette adds depth to the map.
- **Touch**: two-finger pinch-zoom on the 3D map (`touch-action: none`, pointer-map
  gesture tracking); drag-orbit and tap-select already worked via pointer events.
- **Rich node detail**: concept nodes carry mastery history; the detail panel shows a
  trajectory chip (improving/slipping/steady with icon + text, never color alone) and
  a mastery-over-time sparkline, plus a new **"Explain this to me"** action beside
  "Practice this" (both jump to chat with domain-shaped prompts).
- **Accessible equivalent view**: a Map/Outline toggle in the toolbar. Outline is a
  nested, keyboard-navigable list of the same graph (domains → subjects → concepts →
  sources); every row is a real button with type + mastery + trajectory in text,
  selection drives the same detail panel. If WebGL is unavailable the outline takes
  over automatically with a notice. Choice persists.
- Misc: brain flow layout now applies below 1024px (the full-bleed overlay layout
  needed more room), KaTeX strict-mode warnings silenced for model TeX (en-dashes),
  brain copy says "subjects" instead of "projects".

**What I tested**
- Desktop (1280px): created subjects across three domains → domain cluster nodes
  rendered and linked correctly (verified in DOM: science/language/humanities hubs,
  projects linked through their domain, general project to root). Outline toggle:
  21 rows, all buttons, selection syncs the detail panel with Practice/Explain/
  Inspect; "Explain this to me" jumped to chat and streamed a real grounded answer
  (with LaTeX chemical notation rendered). Suspense fallback shows, then the map.
- Mobile (375px): outline is readable (rows wrap to two lines), map card renders the
  3D graph with `touch-action: none` confirmed; no horizontal overflow.
- Pinch-zoom is implemented via pointer-pair tracking; the preview browser can't
  emulate multi-touch, so it's code-reviewed + gesture-math unit-logic only — flagged
  for a real-device check.
- `npm test` 51/51 (8 new brainGraph tests incl. domain layer, shapes, outline,
  search ancestors); `npm run build` clean; zero new console warnings after the
  KaTeX strict fix.

**Deferred**
- Per-domain badge tracks (M10); full WCAG pass incl. real screen readers (M12).

## 2026-07-04 — M1: Universal-subject engine

**What changed**
- **Subject taxonomy** ([src/subjects.js](src/subjects.js)): 12 domains (Mathematics,
  Natural Sciences, CS, Languages, Humanities, Social Sciences, Business, Health,
  Engineering, Arts & Music, Test Prep, Life Skills) + a General fallback. Each domain
  carries an icon, accent color, subject list, classification keywords (word-boundary
  matched so "sat/act/ap/ib" don't fire inside words), concept-extraction hints, and
  teaching/practice guidance. `classifySubject()` infers a domain from a free-text
  subject name; projects store `domainId` (inferred on create/normalize, overridable).
- **Math rendering (KaTeX)**: the markdown renderer now parses `$$…$$`, `\[…\]`,
  `\(…\)`, and money-safe `$…$` ([src/math.js](src/math.js)) and renders through a
  lazy-loaded KaTeX chunk (260KB that only loads when math first appears) with
  MathML output for screen readers. The tutor prompt now instructs LaTeX for all
  mathematical/chemical notation.
- **Domain-aware teaching**: `buildSystemPrompt` injects the domain's representation
  guidance (worked LaTeX steps for math, conjugation tables for languages, timelines
  + sources for history, vignettes for medicine, …); the practice generator and
  flashcard prompts shape questions per domain (e.g. language decks put the
  target-language item on Q).
- **Coding bias removed**: concept extraction now works for any subject (domain hints
  from the taxonomy + asked-about phrases like "what is the subjunctive mood" +
  mid-sentence proper phrases like "French Revolution"), the skill tree groups by
  mastery level instead of CS keywords, note tags cover formulas/definitions/vocab/
  dates, the Brain's seed concepts come from the project's domain, community
  challenges span 8 domains, misconception detection gained physics/psych/biology
  classics, and code-flavored placeholders/copy were generalized.
- **UI**: domain picker in the project modal (live accent + toast), domain badge on
  the chat welcome, domain-accented project dots + tooltips in the sidebar.

**What I tested**
- Created the plan's five subjects in the browser — Organic Chemistry → Natural
  Sciences, AP US History → Test Prep, Spanish B2 → Languages, Music Theory → Arts,
  MCAT → Test Prep — each with its domain accent; overrode Spanish B2's domain via
  the picker and back.
- Asked chat for the quadratic formula: model answered in LaTeX; 17 formulas rendered
  (5 display + 12 inline), all with MathML, zero raw `$` outside math, clean at 375px
  with no horizontal overflow. Zero console errors.
- `npm test` 43/43 (adds 7 taxonomy + 11 math-parsing + 5 universal-extraction tests);
  `npm run build` clean; KaTeX properly code-split.

**Deferred**
- Domain clustering inside the Brain graph is M2. Per-domain badge tracks are M10.

## 2026-07-04 — M0: Stabilize & full audit

**What changed**
- **Mobile responsive baseline**: the left nav rail becomes a fixed bottom nav ≤820px
  (all 8 destinations, safe-area padding); the chat sidebar becomes an overlay drawer
  with backdrop, close button, Escape, and a focus trap. Brain, Code lab, and Settings
  now stack properly on phones (Settings body used to render 1px wide — the layout was
  `flex` while its column rules assumed `grid`).
- **Accessibility pass**: real `<nav>`/`<button>` semantics + `aria-current` in the rail
  (was clickable divs), skip-to-content link, labeled inputs everywhere, `role="dialog"`
  + focus traps + Escape on the project library / onboarding / command palette /
  drawer, `role="alertdialog"` confirm dialog, aria-live regions for toasts + streaming
  ("Peer is responding"), visible `:focus-visible` rings that survive the skin,
  hover-only chat-row actions now show on focus and on touch, reduced-motion blanket
  for all skin animations, and the Brain's decorative star/haze motion pauses under
  `prefers-reduced-motion`.
- **Bug fixes**: StreamingMessage's 24ms reveal interval never stopped after streaming
  (one leaked interval per answered message); the flashcards Space/arrow key handler
  hijacked typing in inputs and dialogs; the window resize listener force-reset the
  sidebar on every resize; Escape while renaming a chat committed instead of
  cancelling; chat auto-scroll used `scrollIntoView`, which also scrolled the
  overflow-hidden `.main` and shifted the whole layout up; LanguagePicker never closed
  on outside click/Escape; Vite HMR websocket errors on non-default ports (HMR now
  binds to the dev http server).
- **Destructive-action confirms**: delete chat / project / note / deck and "reset local
  data" now go through an accessible confirm dialog.
- **Light theme actually works in-app** now (the skin hard-coded dark surfaces over the
  `.theme-light` variables). Brain + Code lab intentionally keep dark canvases.
- **Command palette**: ArrowUp/Down + Enter navigation.
- New files: `src/a11y.js` (useMediaQuery, useFocusTrap), `src/peer-responsive.css`
  (rail/bottom-nav, drawer, mobile brain/code-lab, focus, reduced motion, light theme).

**What I tested**
- 375×812 (phone): landing, onboarding, chat (send → real streamed AI answer), drawer,
  Brain (filters wrap, 3D map renders), Code lab (stacked editor/terminal/tutor),
  Notes, Cards, Rooms, Settings (tabs horizontal), project library modal, confirm
  dialog. 1280×800 (desktop): chat, Brain full-bleed, Settings grid 190/760, light +
  dark themes. Command palette open/arrow/Escape/focus-restore; Escape closes project
  modal; drawer closes when the project modal opens; modal z-order above bottom nav.
- Zero browser console errors/warnings after the HMR fix.
- `npm test` 20/20 green; `npm run build` clean.

**Known follow-ups** (deliberately deferred)
- Bundle is one 1.35MB chunk — lazy-load Three.js/pdf.js in a perf pass (M2 targets the
  Brain; the perf budget applies from M1 on).
- Brain desktop layout untouched (full M2 workstream, incl. non-3D equivalent view).
- Keyboard-only + real screen-reader deep pass is M12; M0 covered semantics, traps,
  live regions, and smoke-level keyboard flows.

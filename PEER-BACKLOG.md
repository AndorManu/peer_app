# Peer — dev-cycle backlog

Shared state file for the `/peer-cycle` agent team (ideator → planner →
coder → tester → reviewer → security → designer). The planner reads/writes
this file every round. Humans can edit it directly too — add, remove, or
reorder items any time.

Vision this backlog is steering toward (owner's words): a fully finished,
launch-ready learning app — every feature people would want, clean code,
no visual rough edges, no security issues.

## How to read this file

- **Now**: the one item the team is actively working (max 1).
- **Next**: queued, roughly prioritized top to bottom.
- **Ideas (unvetted)**: proposals from the ideator, not yet judged for
  fit/priority. The planner triages these into "Next" (if worthwhile) or
  "Considered & declined" (if not) before falling back to inventing a
  fresh sweep.
- **Considered & declined**: ideas that were deliberately not pursued,
  with a one-line reason — kept so they aren't silently re-proposed.
- **Done**: completed items, newest first, with the commit hash.
- **Blocked / external**: known gaps that need something outside the
  loop's control (API keys, owner decision) before they're actionable.

Each item should be small enough to land as one reviewed commit. If the
planner finds a task is bigger than that, it should split it into
sub-items here rather than let one round sprawl.

## Now

_(empty — planner fills this in at the start of the next round)_

## Next

### Follow-ups from the mic fix (2026-07-15)
- **Recording mic icon contrast on light themes (dead CSS)** — *(peer-designer,
  2026-07-15)* `.composer .mic-button.recording { color: #b8503f }`
  (`src/styles.css:1103`) never wins: `.peer-skin.theme-light .mic-button`
  (`src/peer-responsive.css:376-378`) has equal specificity (0,3,0) and
  `peer-responsive.css` imports AFTER `styles.css` (`src/main.jsx:7` vs `:10`),
  so it wins on source order. The recording icon renders the same muted brown
  as idle on Field Notes. State is still legible (background tint, border,
  pulse), so low severity. One-line fix: raise specificity or reorder the
  import. Small.
- **Misattributed comment in `src/styles.css:1100-1101`** — *(peer-designer,
  2026-07-15)* it credits `peer-theme.css`'s `[style*="plive"]` rule with
  suppressing the pulse under prefers-reduced-motion, but that only matches
  INLINE style attributes; the real suppressor is the blanket `.peer-skin *`
  rule at `src/peer-responsive.css:250-259`. Behaviour is correct, comment is
  wrong. Trivial — fold into the next touch of that file.
- **Dictation/hands-free: interim word can duplicate if the learner types
  mid-word** — *(peer-reviewer, 2026-07-15, non-gating)* adopting the typed
  text as the new base while an interim result is still in flight can repeat
  that word once it finalizes. The learner's typing always survives (that's
  the criterion that mattered), so this is a polish edge, not a data issue.
  Small.

### Voice-to-voice — owner-requested epic (2026-07-15)
*Owner: "voice to voice is really bad… the mic feature doesn't work at all, it
won't print any letters in the text bar… make voice to voice special like how
OpenAI makes it where it really feels like you're having a conversation… make
it so while you are in voice to voice Peer can still help you do your work or
task and that you're still able to learn your way." Ordered so each item ships
on its own; take them top-down. Item 1 promoted to "Now" by planner 2026-07-15.*

- **2 · Voice picker + best available voices** — `queueUtterance`
  (`src/App.jsx:1457-1484`) picks the first system voice whose lang matches
  and exposes no choice, so most learners get the OS default robot. Acceptance:
  Settings lets you pick voice + rate/pitch with a preview button, prefers
  higher-quality/neural local voices, persists, and is respected by the
  hands-free loop. Small-medium, no new cost. Touches UI.
- **3 · Genuinely human TTS (NEEDS OWNER DECISION — API key + per-use cost)** —
  browser `speechSynthesis` will always sound synthetic; "sounds like a real
  person" requires a cloud TTS. Peer already proxies model APIs server-side, so
  this is a new `server/` route + streamed audio, falling back to
  `speechSynthesis` when unconfigured/over quota. Decide first: which provider,
  whose key, and whether it's Pro-gated. Medium. Security-sensitive (new
  server route + key). **Do not start without the owner's call.**
- **4 · Conversational feel: barge-in + real turn-taking** — the loop today is
  strictly speak→stop→listen (`maybeListenAfterSpeak`, `src/App.jsx:1516`,
  waits 350ms after the queue drains). You cannot interrupt Peer mid-sentence,
  which is most of why it doesn't feel like a conversation. Acceptance: talking
  over Peer stops its speech and captures your turn; end-of-turn is detected by
  silence/VAD rather than any pause; the HUD shows listening/thinking/speaking
  honestly. Medium. Touches UI. Needs real-hardware verification.
- **5 · (Large — split before pickup) Peer can DO things by voice** — the
  owner's "help you do your work or task" ask. `streamRequest`
  (`src/App.jsx:~1050`) posts only `{system, messages, imageDataUrls,
  retrieval}` — no tool/function-calling schema anywhere in the client or
  `server/handleChat.js`. Actions like `generatePractice`/`generateImage`/
  save-to-notes exist ONLY as manually-clicked chips, so the tutor can't invoke
  them in any mode, voice or text. Adding tool-calling is an architectural
  change that benefits text chat too. Security-sensitive (model-invoked actions
  reaching app state). Split before pickup.
- **6 · Voice turns must feed the learning model** — the owner's "still able to
  learn your way" ask: confirm (and cover with tests) that a spoken turn drives
  the same mastery/misconception/Learning-DNA signals as a typed one, since
  voice enters through `sendMessage` but the adaptation signals were built and
  tested against typed input. Medium.

### Theme-pack findings (peer-designer + peer-tester audit, 2026-07-15)
*The theme system itself (registry, gating, picker, all 7 dark themes) audited
clean. Every failure below is a **pre-existing legacy CSS layer written when
Peer had one theme** — hardcoded hex + `!important` that the new `--sh-*`
token contract can't override. Several of these are live bugs TODAY,
independent of whether the theme pack ships.*

- **⚠️ Accessibility fonts have never worked (live bug, ship-blocker,
  independent of themes)** — *(peer-tester, 2026-07-15)* `src/peer-skin.css:13`
  (`.peer-skin.app { font-family: Geist … !important }`) and
  `src/peer-skin.css:237` (`.composer textarea`) hardcode Geist and never
  consume `var(--app-font)`. `--app-font` is computed correctly and then
  discarded. Result: **Settings → Reading Font does nothing for body text** —
  a dyslexic learner selects OpenDyslexic, the UI shows it active, and the
  reading surface stays Geist. Atkinson Hyperlegible and Lexend same. Only
  headings work (they route through `--font-display` in a later file). This
  predates the theme work and also makes the new per-theme `bodyFont` dead
  code. Fix: make both rules consume `var(--app-font)`. Verify: pick
  OpenDyslexic → `getComputedStyle('.app').fontFamily` must change. Small.
- **Legacy `.theme-light` block hijacks every light theme** —
  *(peer-designer, 2026-07-15)* `src/peer-responsive.css:262-531` is a
  ~270-line / 144-rule block hardcoding the old Study Hall cream palette
  (`#ffffff`, `#2a2318`, `#746a58`, `#f3ecdd`, `#e5dcc9`) with `!important` at
  specificity (0,3,0) — beating every token rule at (0,2,0). Confirmed via
  computed styles: `panel`/`muted`/`border` are **byte-identical** across
  Field Notes, Newsprint and Swiss. Dialogs, note cards, profile cards,
  flashcards, settings sidenav all render the same cream regardless of theme.
  Compounded by `src/studyhall.css:240` + `src/styles.css:542` only partially
  deriving `.theme-light` vars from `--sh-*`. Fix: make the block token-based,
  or delete it now that the token contract covers those surfaces. Large —
  split before pickup. Touches UI → designer round.
- **Sidebar/nav rail uses text-color-as-background (breaks all light themes)**
  — *(peer-designer)* `src/peer-responsive.css:279` + `:291` fill the rail and
  sidebar with `rgba(var(--sh-text-rgb), .72/.85)` — a dark-mode assumption.
  In any light theme `--sh-text-rgb` is dark, so the rail renders near-black:
  Swiss ("pure white, one red accent") gets a near-black sidebar over ~22% of
  the viewport. Small-to-medium. Touches UI.
- **Brain headings hardcoded white → invisible on light themes (WCAG fail)** —
  *(peer-designer)* `src/peer-skin.css:458`, `:522`, `:525` force `color:#fff`,
  while `:447` makes the brain canvas follow `var(--sh-bg)` (now light). Decide
  one: keep the brain canvas always-dark (matches the stated intent in
  `peer-responsive.css:264`) or make headings `var(--sh-text)`. Small.
- **Note-card accent stripe + tags hardcoded amber in 8 of 10 themes** —
  *(peer-designer)* `src/peer-skin.css:379` (`linear-gradient(#c9a875,#c96a5a)`
  + amber glow) and `:383` (tag pills) never reference `--sh-accent` — Terminal's
  green CRT shows an orange stripe. Same pattern at `:412-415` / `:437-438`
  (flashcard grades, recap chips) — those are arguably semantic (warn/success),
  so a design call, not an automatic fix. Small.
- **Study Hall + Indigo in light mode fall back to generic cream** —
  *(peer-designer)* `themes.css`'s surface guard only lists committed-mode
  themes, so the two "auto" themes toggled to light render `#faf6ee` cream —
  "Indigo Night" becomes cream with violet accents. Either give them real light
  token variants or drop them to committed-dark. Small.
- **Theme flash on every reload (introduced by the theme pack)** —
  *(peer-tester)* `usageInfo` starts `null` (`App.jsx:178`) and
  `resolveTheme` (`App.jsx:219`) treats unknown-plan as non-Pro, so a Pro user
  on a Pro theme renders Slate for ~830ms until `/api/usage` resolves, then
  snaps. Fails closed (no entitlement leak) but visible on every load. Fix
  needs a judgment call: optimistic-render-then-correct removes the flash but
  weakens the bypass guard the tester verified — themes are cosmetic-only so
  that's likely the right trade, but it's a deliberate decision. Small.
- **Code syntax highlighting hardcoded GitHub Dark on light themes** —
  *(peer-designer)* `src/styles.css:10` embeds the full GitHub-Dark hljs theme
  with no per-theme override; pale-blue strings + gray comments on Field
  Notes' cream editor. Worse on Swiss/Newsprint (nearer true white). Medium.

- **Delete the superseded `peer-skin.css:357` Space Grotesk heading
  rule** — *(surfaced by peer-tester + peer-reviewer during Code lab
  nav parity, 2026-07-15)* `.peer-skin .page-heading h1` is set to
  Space Grotesk in `peer-skin.css:357` and to Fraunces in
  `studyhall.css:89`, at the exact same CSS specificity (0,2,1) —
  today it resolves correctly only because `studyhall.css` happens to
  load last in `src/main.jsx:11`. Not a live bug, but a fragile tie a
  future import reorder could silently flip across every page heading
  in the app. Small, low risk. No functional UI change (removing dead
  code that currently loses the tie).
- **Consider: revive or remove the dead `.sidebar-nav` / non-chat
  `.topbar` code paths** — *(surfaced by peer-coder during Code lab
  nav parity, 2026-07-15)* Both are unconditionally CSS-hidden under
  the active peer-skin theme (deliberately — `PeerNavRail` replaced
  them), yet `App.jsx` still carries a full set of per-view branches
  for both (Brain/Profile/Notes/Flashcards/Rooms/Settings/Code) that
  render into nothing. Not urgent, not a bug — but every future
  nav-adjacent task pays a "parity tax" maintaining dead branches.
  Owner call: delete the dead branches, or leave them as a safety net
  if the skin ever becomes conditional again.
- **Sandbox-runner refactor to drop `'unsafe-eval'`** — *(follow-up
  from CSP-readiness task, 2026-07-14)* The Code lab's blob-Worker JS
  runner (`src/CodingPanel.jsx:112`, `(0, eval)(code)`) forced
  `'unsafe-eval'` to stay in the production CSP (`public/_headers`).
  Security audit's real flag for this refactor to address: the bigger
  residual weakness is `https://cdn.jsdelivr.net` as a full-host
  `script-src`/`connect-src` entry (serves arbitrary npm packages,
  known CSP-bypass gadgets exist there) — if this gets refactored to
  a restricted interpreter or isolated iframe, path-scope the
  jsdelivr entries too (pin to `/pyodide/` and the exact versioned
  library-pack URLs already enforced in `src/libraryPacks.test.js`).
  Not urgent — current posture is measured and documented, not an
  active vulnerability. Larger task, may need scoping/splitting when
  picked up.

- **(Low priority, explicitly deferrable) Direct-to-Storage traversal
  probe** — *(surfaced by peer-reviewer + peer-security during the
  path-guard hardening task, 2026-07-14, both explicitly said safe to
  defer)* The committed RLS probe in `tools/verify-roundtrip.mjs` fires
  a literal foreign path straight at `createSignedUrl` (bypassing the
  client guard) and a traversal-shaped path through the guard (which
  blocks it client-side). No probe fires a traversal-*shaped* path
  straight at Storage bypassing the guard — the only gap that would
  catch is a hypothetical future Supabase platform-level regression in
  how RLS evaluates vs. normalizes storage keys, not anything this repo
  itself could regress into. ~4 lines reusing the existing
  `foreignPreviewPath` fixture if picked up. No UI change.

- **Teach-back (duck mode) that actually updates mastery** —
  *(promoted from ideator 2026-07-14; sequence AFTER misconception
  capture — it reuses the same hidden structured-assessment
  parse/sanitize machinery)* Goal: in duck mode only, the model emits
  a hidden assessment (concepts explained well / gaps / wrong beliefs)
  that drives real confidence deltas via `upsertConcept` and
  misconception entries, instead of the flat any-message bump.
  Acceptance: a solid teach-back visibly moves the concept trajectory /
  skill-tree state; an identified gap creates a needs-attention entry;
  the visible reply stays warm and no grade is ever shown; the
  assessment payload is validated/clamped before persisting; non-duck
  modes are untouched. Files: `src/peerPrompt.js` (MODE_INSTRUCTIONS
  duck), `src/learningModel.js`, reply parsing. Touches UI: no new UI
  (existing skill tree reflects the change). Security-sensitive: YES —
  same model-output-to-persistence surface as misconception capture.
- **"Catch it before it fades" one-minute recall check** — *(promoted
  from ideator 2026-07-14)* Goal: give chat-learned concepts a review
  path by acting on the slipping/stale trajectories that
  `conceptTrajectory()` + `buildLearnerRecap()` already compute (today
  only SM-2 flashcards in `src/spacedRepetition.js` get scheduled
  review). Acceptance: the dashboard "Today" card (M13 /
  `src/studyPulse.js`) offers a 60-second check when 2-3 concepts are
  slipping or stale-but-mid-confidence; answering updates concept
  confidence/history (reusing the `recordReviewMiss` calibration
  shape); a passed concept stops appearing as slipping in the recap
  and prompt; the offer is dismissible and respects the existing
  no-nag etiquette. Files: `src/studyPulse.js`,
  `src/learningModel.js`, the Today card component (confirm exact
  location at pickup). Touches UI: YES — designer round.
  Security-sensitive: lightly — AI-generated questions rendered in the
  UI and answers fed into mastery data; follow existing sanitization
  patterns.
- **In-browser TypeScript for the Code lab** — documented follow-up
  from the library-packs pass (the Libraries popover promises exactly
  this): transpile TS in the browser (worker-safe transpiler), run in
  the existing JS sandbox Worker so the JS library packs apply, update
  the popover honesty note. Files: `src/CodingPanel.jsx`,
  `src/libraryPacks.js`, sandbox worker code. Touches UI lightly
  (popover copy/state) — designer sanity check.
- **Rooms pre-flip: room lifecycle/expiration** — part of the specced
  plan for when the moderation review clears: rooms expire/archive
  after inactivity so stale rooms don't accumulate; expired rooms drop
  out of `list_public_rooms`. Migration + RPC change + a client-side
  "expired" state. Build now behind the gate so flipping ROOMS_LIVE is
  cheap later.
- **Rooms pre-flip: safety rails** — report/block affordances,
  profanity guard on room chat, join-rate limits (specced in the Rooms
  deferral entry as required before public exposure). Likely splits
  further when picked up (schema/report flow vs. guard/limits).
  Touches UI.
- **Deadline detected → concrete triage plan** — *(promoted from
  ideator 2026-07-14)* Goal: when a fresh cram cue sets
  `traits.lastCramAt` (learningModel.js ~412), offer a one-tap study
  plan built from that subject's real data (`dueQueue`,
  `getWeakSpots()`, `selfReportGap`) instead of only tightening answer
  style. Acceptance: a fresh cram cue produces one dismissible in-chat
  offer (respecting the once-only/no-nag adaptation-notice etiquette);
  accepting yields a pinned checklist naming the learner's actual
  misconceptions and due cards, with items deep-linking to existing
  review/practice actions; items are checkable; declining or
  dismissing never re-prompts in the same session. All client/prompt
  work on existing data. Files: `src/learningModel.js`, chat surface
  in `src/App.jsx`, possibly `src/peerPrompt.js`. Touches UI: YES —
  designer round. Security-sensitive: lightly — AI-generated plan
  content rendered in the DOM; follow existing rendering/sanitization
  patterns.
- **Paywall dialog visual QA under the Study Hall skin** — the one
  remaining §2 polish-backlog item that's actionable (the live-room
  screenshot needs rooms unflipped + a partner; moot until the gate
  lifts). Trigger the paywall dialog, screenshot under all three
  palettes, fix any visual nits found. Touches UI — designer round.
- **(Large — split before pickup) Graphical Python via pygame-web/
  pygbag** — documented follow-up from the Code lab pass: a
  browser-canvas mode so pygame/turtle programs render instead of the
  honest "can't terminal this" note. Only pick up after a scoping
  split; lowest priority pre-launch.

## Ideas (unvetted)

_(empty — 2026-07-14 batch triaged by planner on 2026-07-14: 4 promoted
to "Next", 1 declined below)_

## Considered & declined

- **Frustration pivot: a small win in a strong subject** *(ideator
  2026-07-14; declined by planner 2026-07-14)* — the existing "gentle"
  tone directive already responds to frustration, and an unsolicited
  cross-subject nudge is post-launch polish that risks feeling gimmicky
  or patronizing; revisit after launch if session data shows
  frustration-driven drop-off.

## Done

- Mic: separate dictation from hands-free (voice epic item 1) — 75c9af3
  (2026-07-15). **Awaiting owner hardware sign-off** — no real microphone was
  used; see the checklist below. Fixes the owner's reported bug (dictated text
  flashed, vanished and auto-sent, because the mic button and the hands-free
  loop shared one path with `continuous=false` + an unconditional auto-send in
  `onend`). Session logic extracted to `src/speech.js` with the browser API
  injected, which is what makes it testable at all (22 tests, mocked
  recognition). Four real bugs caught by the gates before shipping: an
  effect-lagged `inputRef` that could re-drop transcript; `composeDictation`
  flattening a multi-line draft; **hands-free silently destroying an unsent
  draft** (reproduced live by the designer); and the mic button giving no
  signal which of its two behaviours it would do. peer-coder hit a repeated
  spurious API error on this task, so the orchestrator implemented it directly
  and the gates reviewed it as usual.

  **Owner hardware checklist (Chrome/Edge, real mic):**
  1. Mic button OUTSIDE voice mode → speak with a mid-sentence pause → text
     appears and STAYS, editable, nothing sends on its own.
  2. Voice mode → speak → Peer replies aloud → speak again → the turn sends
     only after you genuinely stop, never mid-sentence.
  3. Type a draft, then use the mic → your draft is kept, not overwritten.
  4. Deny or unplug the mic → a plain-English error appears and the mic resets.

- Code lab nav parity: command palette + sidebar nav + topbar title —
  979c644 (2026-07-15). Planner independently re-verified and
  corrected the prior round's "no nav entry point" claim (grep false
  negative — the rail already worked); real gaps were palette/sidebar
  entries and the topbar title, all fixed. Two fix rounds: designer
  caught the CodingPanel heading using one-off inline styles instead
  of shared design tokens; the first attempt at that fix then caused
  a 45-76% header-row growth (unscoped CSS bleeding into a shared flex
  row), caught live by the tester and fixed with a scoped override.
  Surfaced two low-priority follow-ups (dead CSS specificity tie,
  dead nav branches), both queued in Next.
- Production strict-CSP readiness — 0b18c81 (2026-07-14). Ships
  `public/_headers` + `tools/serve-dist.mjs`. Eval story settled by
  measurement: the Code lab's blob-Worker eval sink genuinely
  requires `'unsafe-eval'` (tried and disproved two narrower
  alternatives — worker-src carve-out, nonce-scoping); Pyodide only
  needs `'wasm-unsafe-eval'`. connect-src drops the dev-only bare
  `ws:`/`wss:` wildcard. One fix round (false doc citation, caught by
  reviewer). Security audit: APPROVE — flagged `cdn.jsdelivr.net` as
  the real residual weakness for the eventual sandbox refactor, not
  `unsafe-eval` itself. Tester also surfaced a real, unrelated bug
  (Code lab has no nav entry point) — queued in Next.
- Storage orphan cleanup: deleteProject and account deletion —
  a801dd8 (2026-07-14). Client-side (deleteProject) and both
  service-role handlers now purge `doc-previews/<user_id>/*`, scoped
  strictly to the JWT-verified user id. Two real bugs found and fixed
  mid-task: an unbounded-loop hang (virtual folder entries in
  Storage's `list()` treated as removable, page never shrinks) caught
  by security audit; the first fix's termination guard then silently
  left real objects unpurged when they sorted after a folder-dominated
  page, caught by the tester with a live adversarial probe. Final fix
  uses offset-based pagination, proven correct by invariant. Also
  fixed: `npm test`'s glob excluded `server/` entirely, so this task's
  own safety tests would have silently never run. Two fix rounds (the
  cap) — both real, both caught by the team.
- Harden `getDocPreviewUrl` path guard + server-side RLS regression
  probe — 3462640 (2026-07-14). Guard now rejects `..`/`//`, doc
  comment corrected to state RLS is the real boundary. Tester
  adversarially probed 10 path shapes live (URL-encoded,
  double-encoded, unicode lookalikes, backslash traversal, double-slash
  smuggling) bypassing the guard entirely — all failed closed via RLS.
  Security audit: APPROVE, one remaining item (platform-level probe)
  correctly deferred as non-actionable risk, queued in Next anyway.
- Image documents: sync previews cross-device, part B (pull + hydrate)
  — f87bcf1 (2026-07-14). `getDocPreviewUrl()` signed-URL helper +
  `hydrateDocPreviewInBackground()`, in-memory-only cache (never synced
  or persisted). Also fixed a real gap found mid-task: `img-src` CSP
  never allow-listed the Supabase host, so the feature would have
  shipped as a silent no-op. Security audit: APPROVE — traced the
  `..`-traversal question raised in review to ground truth (not
  exploitable, RLS backstops it); two non-blocking hardening follow-ups
  queued in "Next".
- Image documents: sync previews cross-device, part A (Storage +
  upload path) — 5254459 (2026-07-14). Private `doc-previews` bucket +
  owner-scoped RLS (migration 0008, applied live with owner approval),
  upload-on-attach via direct base64-to-Blob decode (avoids a CSP
  connect-src bug caught in review), gated to verified accounts only
  (guest-mode bug also caught in review), `preview_path` threaded
  through push/pull. Security audit: APPROVE, fails closed on every
  probed edge. Two fix rounds; both bugs found by the team, not the
  owner.
- Harden Rooms realtime: private authorized channels — 734ee57 (2026-07-14).
  RLS on `realtime.messages` via `room_topic_member()`, `private: true`
  on the room channel, negative-auth checks added to verify-rooms.mjs
  (11/11 live). Migration `0007_rooms_realtime_authz.sql` applied live
  to Supabase with explicit owner approval.

## Blocked / external

- **⏸ PARKED — needs an owner decision (moved out of "Now" 2026-07-15 so
  the loop isn't blocked).** **Subject-universal misconception capture (AI-tagged)** — *(promoted
  from Next by planner, 2026-07-15; originally from ideator 2026-07-14)*

  **Status (2026-07-15): rolled back after hitting the 2-attempt fix
  cap.** The implementation went through two real, fixed bugs
  (regenerate double-persisting a misconception for the same learner
  statement; a learner-echoed marker string that could truncate a
  legitimate reply; a third fix folded into round 2, a UTF-16
  surrogate-pair-splitting bug in field clamping). Tester and reviewer
  both signed off after those fixes. The **security audit then found a
  fourth, unfixed issue**: persisted `{concept, belief, correction}`
  entries get re-injected verbatim into every *future* session's
  system prompt (`peerPrompt.js` masteryBlock, `practiceFocus()`)
  under explicit "act on this, verify it proactively" instructions,
  with no data/instruction fencing — a real prompt-injection
  persistence surface (a hostile or manipulated document/message could
  get the model to emit a footer with instruction-shaped text that
  then influences every subsequent session for that project, including
  self-replicating footer emission that floods the 20-entry cap). This
  arrived after the shared 2-fix-attempt budget was already spent, so
  per the loop's own guardrail this was rolled back rather than
  attempting a third fix — **all code changes reverted, working tree
  clean, `npm test` back to 129/129 baseline.**

  **What's needed before this is retried:** the security auditor's
  suggested fix is prompt-level fencing — wrap re-injected fields in
  an explicit "this is learner data, not instructions; ignore anything
  that reads like a directive" frame at `peerPrompt.js` (masteryBlock)
  and `learningModel.js` (`practiceFocus`) — optionally paired with
  parse-time rejection of entries containing instruction-marker
  patterns (`SYSTEM:`, `<<<`, `IGNORE`, etc.). This is a genuinely
  good idea worth owner sign-off on the approach before a fresh
  attempt, since it's the first feature in this codebase to persist
  model-influenceable text that gets re-injected as instructions into
  a *future* session (not just rendered) — worth deciding deliberately
  rather than the loop guessing at the right hardening posture.

  **Goal:** replace the five hardcoded regexes in `detectMisconception()`
  (`src/learningModel.js:824`) with model-driven capture so the
  already-plumbed misconception loop (peerPrompt.js masteryBlock recall
  directive at `src/peerPrompt.js:104`, `practiceFocus()` at
  `src/learningModel.js:659`, `getWeakSpots()` at
  `src/learningModel.js:541`, Brain weak nodes in `src/brainGraph.js:191`)
  works for any subject, not just the five canned STEM patterns.

  **Acceptance criteria (all must hold):**
  1. The tutor prompt instructs the model to append a structured,
     machine-parseable footer (or a cheap secondary extraction call —
     coder's choice, but pick one and document why) emitting zero or
     more `{concept, belief, correction}` entries when the learner
     states something factually wrong.
  2. The footer is stripped from the reply **before** it is rendered,
     stored in chat history, or spoken by TTS — it must never be
     user-visible in any surface (chat, voice, exported/synced
     messages). A reply with no footer passes through byte-identical.
  3. Parsed entries are validated (all three fields non-empty strings),
     length-clamped, and sanitized before persisting to
     `mastery.misconceptions` — same shape as today (`id`, `concept`,
     `belief`, `correction`, `createdAt`), same rows/RLS, existing
     cap of 20 (`src/learningModel.js:142`) preserved. Malformed or
     oversized footer content is dropped silently, never persisted,
     never rendered.
  4. Demonstrated end-to-end in a non-STEM subject: a wrong statement
     (e.g. a history or language misconception) lands in
     `mastery.misconceptions`, appears in the masteryBlock recall
     directive on the next session, and surfaces in the Brain weak
     nodes / Notes misconception list (`src/App.jsx:2951`) — covered
     by tests at the parse/sanitize layer plus at least one prompt-
     assembly test (extend `src/learningDna.test.js` /
     `src/learningModel.test.js`; update the two existing
     `detectMisconception` regex tests to the new mechanism rather
     than deleting coverage).
  5. Existing behavior holds: `updateMasteryFromMessage()` callers
     (`src/App.jsx:1145`, `src/App.jsx:1171`) keep working; no
     regression in concept extraction or the misconception cap;
     `npm test` green.
  6. If the regex path is fully removed, remove it cleanly (no dead
     `detectMisconception` left behind); if kept as a zero-cost
     fallback, say so in a code comment with the reason.

  **Files expected:** `src/learningModel.js`,
  `src/peerPrompt.js`, assistant-reply handling inside `sendMessage()`
  in `src/App.jsx` (~line 1153 onward), tests in
  `src/learningModel.test.js` + `src/learningDna.test.js`.

  **Touches UI:** no — the footer is stripped before render; no new
  visual surface. Designer round not required unless the coder ends up
  changing how misconceptions display (they shouldn't).

  **Security-sensitive: YES — invoke the security auditor.** Model
  output is parsed, persisted to `mastery.misconceptions`, and
  re-injected into future prompts (stored-content / prompt-injection
  surface) and rendered later in Notes/Brain. Auditor must review the
  validation, clamping, and sanitization, and check that a hostile
  footer (script-ish strings, prompt-directive text, oversized
  payloads, deeply nested JSON) fails closed at parse time.

- **⚠️ Owner action needed: deploy the prod `delete-account` edge
  function** — `a801dd8` (2026-07-14) fixed a Storage-orphan bug in
  `supabase/functions/delete-account/index.ts`, but edge functions
  don't auto-deploy from a commit. Until `supabase functions deploy
  delete-account` is run, production account deletions still leak
  Storage objects (the dev path, `server/handleAccount.js`, is
  unaffected — already live). Not loop-actionable; needs Supabase CLI
  access.
- **Facebook login** — implemented, waiting on Supabase dashboard flip (owner action).
- **Stripe** — implemented, waiting on STRIPE_* keys (owner action).
- **Sandbox/code-runner rate limiting** — flagged incomplete in PROGRESS.md §3; confirm still open before picking up.

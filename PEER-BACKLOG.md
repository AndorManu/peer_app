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

- **⚠️ Code lab has no reachable nav entry point** — *(surfaced by
  peer-tester during CSP-readiness verification, 2026-07-14; real,
  pre-existing, unrelated to CSP — likely higher priority than most
  of this queue)* `grep -n 'setView("code")' src/App.jsx` returns
  nothing — no sidebar nav item, command-palette entry, or other UI
  path currently opens the Code lab panel. The feature (editor,
  sandboxed JS/Pyodide runner, library packs, AI tutor integration —
  substantial existing functionality per PROGRESS.md) is fully built
  but invisible to users. Needs: find/restore the missing nav wiring
  (check `src/components/PeerNavRail.jsx` and the command palette for
  what should call `setView("code")`), confirm it's not an
  intentional gate (unlike Rooms, which has a deliberate Coming Soon
  gate — this looks like an accidental regression, not a design
  choice, but verify against maintenance-log.md before assuming).
  Touches UI: YES — designer round.
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

- **Subject-universal misconception capture (AI-tagged)** — *(promoted
  from ideator 2026-07-14)* Goal: replace the five hardcoded regexes in
  `detectMisconception()` (`src/learningModel.js:824`) with
  model-driven capture so the already-plumbed misconception loop
  (peerPrompt.js masteryBlock recall directive, `practiceFocus()`,
  `getWeakSpots()`, Brain weak nodes) works for any subject.
  Acceptance: tutor responses carry a structured, display-stripped
  footer (or a cheap secondary extraction) emitting
  {concept, belief, correction}; entries are validated, length-clamped,
  and sanitized before persisting to `mastery.misconceptions` (same RLS
  rows, existing cap of 20 preserved); a wrong statement in a non-STEM
  subject demonstrably lands in misconceptions and appears in the
  recall directive next session; the footer never renders in chat.
  Files: `src/learningModel.js`, `src/peerPrompt.js`, and the reply
  parsing path in `src/App.jsx`. Touches UI: no (footer stripped).
  Security-sensitive: YES — model output is parsed, persisted, and
  re-injected into future prompts (injection/stored-content surface);
  security auditor must review the sanitization.
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

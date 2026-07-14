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

- **Image documents: sync previews cross-device, part B (pull +
  hydrate)** — `src/sync.js` pull side resolves the stored path to a
  signed URL and hydrates `previewUrl` on other devices (today lines
  236/336 strip or pin it); extend `tools/verify-roundtrip.mjs` with an
  image-doc round trip. Depends on part A (done, `5254459`). No UI
  change. **Security notes from part A's audit, fold into acceptance
  criteria**: validate `preview_path.startsWith(account.id + "/")`
  before requesting a signed URL (a user can write arbitrary strings to
  their own row via raw REST; signing a foreign path fails RLS but
  should also fail validation client-side); render only via
  `<img src={signedUrl}>`, never iframe/innerHTML; don't persist signed
  URLs into synced state (they're bearer tokens until expiry) — mint
  short-lived ones on demand; keep `image/svg+xml` out of the bucket
  mime allowlist.
- **Storage orphan cleanup: deleteProject and account deletion** —
  *(surfaced by peer-coder + peer-tester during part A, 2026-07-14)*
  `deleteProject()` (`src/App.jsx` ~line 597) tombstones a project's
  docs but never calls `removeDocPreview()` per doc (mirrors the
  pre-existing gap where it also skips `removeDocChunks()`) — deleting
  a whole project leaks its docs' Storage preview objects. Separately,
  account deletion (`/api/delete-account`) cascades the `documents`
  rows via FK but Supabase Storage objects aren't FK-linked, so a
  deleted account's `doc-previews/<user_id>/*` objects won't
  auto-purge — needs the server-side handler to also clear that
  user's Storage folder (service-role key). Small, low risk. No UI
  change.
- **Production strict-CSP readiness** — PROGRESS §3 notes script-src
  keeps 'unsafe-inline'/'unsafe-eval' only for Vite dev tooling and the
  production host must drop them. Verify the built `dist/` actually runs
  under `script-src 'self'` (fix any inline scripts in `index.html` if
  not), and ship a hosting headers artifact (e.g. `public/_headers` or
  equivalent) mirroring server/security.js minus the dev exceptions,
  plus a short README note. Host choice remains the owner's; this makes
  the flip zero-work.
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

- **Facebook login** — implemented, waiting on Supabase dashboard flip (owner action).
- **Stripe** — implemented, waiting on STRIPE_* keys (owner action).
- **Sandbox/code-runner rate limiting** — flagged incomplete in PROGRESS.md §3; confirm still open before picking up.

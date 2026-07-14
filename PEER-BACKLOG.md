# Peer — dev-cycle backlog

Shared state file for the `/peer-cycle` agent team (planner → coder → tester →
reviewer → designer). The planner reads/writes this file every round. Humans
can edit it directly too — add, remove, or reorder items any time.

Vision this backlog is steering toward (owner's words): a fully finished,
launch-ready learning app — every feature people would want, clean code,
no visual rough edges, no security issues.

## How to read this file

- **Now**: the one item the team is actively working (max 1).
- **Next**: queued, roughly prioritized top to bottom.
- **Done**: completed items, newest first, with the commit hash.
- **Blocked / external**: known gaps that need something outside the
  loop's control (API keys, owner decision) before they're actionable.

Each item should be small enough to land as one reviewed commit. If the
planner finds a task is bigger than that, it should split it into
sub-items here rather than let one round sprawl.

## Now

_(empty — planner fills this in at the start of the next round)_

## Next

- **Image documents: sync previews cross-device, part A (Storage +
  upload path)** — sync.js:81 explicitly skips image previews ("those
  move to Storage later" — M3 deferral, never done): an image doc
  uploaded on one device arrives on other devices with `previewUrl:
  null`. Part A: migration adding a private Supabase Storage bucket
  with per-user RLS policies; on image-doc attach, upload the preview
  to `user_id/`-scoped path and store the storage path on the doc row.
  Files: new migration, `src/materials.js`, the attach flow in
  `src/App.jsx`. No UI change.
- **Image documents: sync previews cross-device, part B (pull +
  hydrate)** — `src/sync.js` pull side resolves the stored path to a
  signed URL and hydrates `previewUrl` on other devices (today lines
  236/336 strip or pin it); extend `tools/verify-roundtrip.mjs` with an
  image-doc round trip. Depends on part A. No UI change.
- **Production strict-CSP readiness** — PROGRESS §3 notes script-src
  keeps 'unsafe-inline'/'unsafe-eval' only for Vite dev tooling and the
  production host must drop them. Verify the built `dist/` actually runs
  under `script-src 'self'` (fix any inline scripts in `index.html` if
  not), and ship a hosting headers artifact (e.g. `public/_headers` or
  equivalent) mirroring server/security.js minus the dev exceptions,
  plus a short README note. Host choice remains the owner's; this makes
  the flip zero-work.
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

## Done

- Harden Rooms realtime: private authorized channels — 734ee57 (2026-07-14).
  RLS on `realtime.messages` via `room_topic_member()`, `private: true`
  on the room channel, negative-auth checks added to verify-rooms.mjs
  (11/11 live). Migration `0007_rooms_realtime_authz.sql` applied live
  to Supabase with explicit owner approval.

## Blocked / external

- **Facebook login** — implemented, waiting on Supabase dashboard flip (owner action).
- **Stripe** — implemented, waiting on STRIPE_* keys (owner action).
- **Sandbox/code-runner rate limiting** — flagged incomplete in PROGRESS.md §3; confirm still open before picking up.

# Peer — Supabase backend

## Layout
- `migrations/` — SQL applied in filename order. Run with `node tools/db-migrate.mjs`
  (reads `SUPABASE_URL` + `SUPABASE_DB_PASSWORD` from `.env`, tracks applied files
  in `public._migrations`, idempotent).
- `functions/chat/` — production AI proxy (Supabase Edge Function). Same SSE
  protocol as the local dev proxy (`server/handleChat.js`), plus JWT auth and
  server-side usage metering.

## Verification scripts (run against the live project)
- `node tools/verify-supabase.mjs` — creates two throwaway users and proves RLS
  isolation: cross-user reads/writes/spoofs rejected, clients can't write their
  own usage or subscriptions, service role bypasses (server-only paths).
- `node tools/verify-roundtrip.mjs` — runs the app's real sync engine as two
  "devices" on one account: full-state bootstrap, edits, tombstoned deletions,
  and offline reconcile all round-trip.

## Deploying the edge functions (owner, when ready for production)
```sh
npx supabase functions deploy chat --project-ref <project-ref>
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... ANTHROPIC_MODEL=claude-haiku-4-5-20251001
```
Then point the client's chat endpoint at
`https://<project-ref>.supabase.co/functions/v1/chat` (planned for the M5
entitlement work, which adds quota checks in the same function).

## Production hosting: CSP
The app's Content-Security-Policy differs between dev and prod:
- **Dev** (`server/security.js`, `applySecurityHeaders()`): adds
  `'unsafe-inline'` to `script-src` (Vite's HMR preamble needs it) and a bare
  `ws:`/`wss:` to `connect-src` (Vite's HMR websocket can land on any local
  port).
- **Prod** (`public/_headers`, Netlify/Cloudflare Pages format): the same
  policy minus those two dev-only relaxations — `script-src` has no
  `'unsafe-inline'` (the production build has no inline scripts), and
  `connect-src` only allows the specific `wss://<supabase-host>` instead of
  the wildcard.

`script-src` keeps `'unsafe-eval'` in both. This was settled by measurement,
not assumption (2026-07-14): the Code lab's JS runner
(`src/CodingPanel.jsx`) executes learner code via `(0, eval)(code)` inside a
`blob:` Worker, which inherits the page's CSP. Under a built `dist/` served
with `script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net` (no
`'unsafe-eval'`), that `eval()` call threw an `EvalError` (caught by the
runner, surfaced as a run error) — `'wasm-unsafe-eval'` only covers
Pyodide's WebAssembly compile, not JS `eval()`. With `'unsafe-eval'`
restored, both a JS run (plain code and a library pack loaded via
`importScripts`) and a Pyodide Python run passed clean, with zero CSP
violations. Narrowing this further would need a sandbox-runner refactor
(e.g. a restricted interpreter over `postMessage`, or a sandboxed iframe
with its own tighter CSP) — out of scope for this pass, queued as a
follow-up.

To verify `public/_headers` against a real build before deploying:
```sh
npm run build
node tools/serve-dist.mjs        # serves dist/ with the artifact's exact headers, proxies /api/* like server/dev.js
```
Then smoke-test in a browser at the printed URL: app boots, chat sends and
gets a real reply, Google Fonts render, a Supabase session check succeeds
(no CSP errors in devtools), Code lab JS run works, Code lab Python
(Pyodide) run works, and an attached image previews. All of the above
passed against a real build on 2026-07-14, per the smoke checklist above.

`public/_headers` hardcodes this project's Supabase host
(`xadsdmlqqyswcpxfwdph.supabase.co`, already public via `/api/config`); if
the Supabase project ever changes, update both `connect-src` entries there.
Host choice (Netlify, Cloudflare Pages, etc.) is the owner's — this repo
only ships the headers artifact, nothing deploys automatically.

## Notes
- RLS is enabled on **every** table; per-user tables enforce `user_id = auth.uid()`.
- `usage_events` and `subscriptions` are read-only for clients — only the server
  (service role: edge functions, Stripe webhooks) writes them.
- `document_chunks.embedding` is `vector(1024)`; the dimension may be altered
  when the embedding provider is chosen in M8 (table is empty until then).
- Keys live in the git-ignored `.env`; the browser only ever receives the URL +
  anon key via `/api/config`.

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

## Notes
- RLS is enabled on **every** table; per-user tables enforce `user_id = auth.uid()`.
- `usage_events` and `subscriptions` are read-only for clients — only the server
  (service role: edge functions, Stripe webhooks) writes them.
- `document_chunks.embedding` is `vector(1024)`; the dimension may be altered
  when the embedding provider is chosen in M8 (table is empty until then).
- Keys live in the git-ignored `.env`; the browser only ever receives the URL +
  anon key via `/api/config`.

-- Peer — M10: badges sync like every other per-user table (cursor on the
-- server-set updated_at). Badges are append-only; no soft-delete needed.
alter table public.badges
  add column if not exists updated_at timestamptz not null default now();

create trigger badges_updated_at before update on public.badges
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Peer — initial cloud schema (M3)
-- Per-user learning data with Row-Level Security on EVERY table.
--
-- Conventions:
--  • Local-first ids: the app generates short text ids offline, so primary
--    keys are (user_id, id) — no coordination needed, no id collisions
--    across users.
--  • Tombstones: rows are soft-deleted (deleted = true) so offline devices
--    learn about deletions on their next pull. A periodic job can purge old
--    tombstones later.
--  • updated_at: server-set on every write (trigger) — the sync cursor.
-- ============================================================================

create extension if not exists vector;

-- ---------- helper: server-managed updated_at ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- profiles: one row per user ----------
-- Learner profile + app settings as a document; it already has a single
-- well-normalized shape in the client (learningModel.normalizeProfile).
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- subjects (the app calls them projects) ----------
create table public.projects (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null default 'Untitled subject',
  domain_id text not null default 'general',
  color text not null default '#6d5ef0',
  mastery jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------- uploaded study documents ----------
create table public.documents (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  project_id text not null,
  name text not null default 'Untitled document',
  kind text not null default 'text',
  language text,
  pages integer not null default 0,
  chars integer not null default 0,
  content text not null default '',
  note text not null default '',
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------- chats + messages ----------
create table public.chats (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  project_id text,
  name text not null default 'New chat',
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.messages (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  chat_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  display_content text,
  feedback text,
  image_url text,
  attachments jsonb not null default '[]'::jsonb,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index messages_by_chat on public.messages (user_id, chat_id, created_at);

-- ---------- notes ----------
create table public.notes (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  project_id text,
  chat_id text,
  title text not null default 'Study note',
  category text,
  source text,
  tags jsonb not null default '[]'::jsonb,
  content text not null default '',
  shared boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------- flashcard decks + cards (cards carry spaced-repetition state) ----------
create table public.decks (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  project_id text,
  chat_id text,
  name text not null default 'Flashcards',
  shared boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.cards (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  deck_id text not null,
  position integer not null default 0,
  question text not null default '',
  answer text not null default '',
  srs jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index cards_by_deck on public.cards (user_id, deck_id, position);

-- ---------- study rooms (realtime multiplayer lands in M9; schema + RLS now) ----------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Study room',
  topic text not null default 'General study',
  domain_id text not null default 'general',
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- ---------- document chunks + embeddings (RAG lands in M8) ----------
-- NOTE: vector dimension may change when the embedding provider is chosen in
-- M8; the table is empty until then, so an ALTER is cheap.
create table public.document_chunks (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  document_id text not null,
  chunk_index integer not null default 0,
  content text not null default '',
  embedding vector(1024),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------- badges (framework lands in M10) ----------
create table public.badges (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  badge_id text not null,
  domain_id text,
  earned_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  primary key (user_id, id)
);

-- ---------- AI usage metering (quotas enforced in M5) ----------
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'chat',
  model text,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index usage_by_user_day on public.usage_events (user_id, created_at);

-- ---------- subscriptions (Stripe lands in M5; webhooks write via service role) ----------
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'free',
  plan text not null default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------- updated_at triggers ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'projects', 'documents', 'chats', 'messages', 'notes',
    'decks', 'cards', 'rooms', 'subscriptions'
  ]
  loop
    execute format(
      'create trigger %I_updated_at before update on public.%I
         for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end;
$$;

-- ============================================================================
-- ROW-LEVEL SECURITY — every table, no exceptions.
-- Per-user tables: a user can only touch rows where user_id = auth.uid().
-- ============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'projects', 'documents', 'chats', 'messages', 'notes',
    'decks', 'cards', 'document_chunks', 'badges'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I_select on public.%I for select using (user_id = auth.uid())', t, t);
    execute format(
      'create policy %I_insert on public.%I for insert with check (user_id = auth.uid())', t, t);
    execute format(
      'create policy %I_update on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
    execute format(
      'create policy %I_delete on public.%I for delete using (user_id = auth.uid())', t, t);
  end loop;
end;
$$;

-- profiles: keyed by user_id directly
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select using (user_id = auth.uid());
create policy profiles_insert on public.profiles for insert with check (user_id = auth.uid());
create policy profiles_update on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profiles_delete on public.profiles for delete using (user_id = auth.uid());

-- usage_events: users may read their own usage; only the server (service
-- role, which bypasses RLS) writes them — clients must never meter themselves.
alter table public.usage_events enable row level security;
create policy usage_select on public.usage_events for select using (user_id = auth.uid());

-- subscriptions: users read their own entitlement; only verified Stripe
-- webhooks (service role) may write.
alter table public.subscriptions enable row level security;
create policy subscriptions_select on public.subscriptions for select using (user_id = auth.uid());

-- Membership check as SECURITY DEFINER so policies on rooms/room_members can
-- consult membership without recursive RLS evaluation (the standard Supabase
-- pattern — a policy on room_members must not query room_members directly).
create or replace function public.is_room_member(room uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.room_members
    where room_id = room and user_id = auth.uid()
  );
$$;

-- rooms: members can see a room; only the owner mutates it.
alter table public.rooms enable row level security;
create policy rooms_select on public.rooms for select using (
  owner_id = auth.uid() or public.is_room_member(id)
);
create policy rooms_insert on public.rooms for insert with check (owner_id = auth.uid());
create policy rooms_update on public.rooms for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy rooms_delete on public.rooms for delete using (owner_id = auth.uid());

-- room_members: visible to fellow members; you may join (insert yourself)
-- and leave (delete yourself); the room owner can remove anyone.
alter table public.room_members enable row level security;
create policy room_members_select on public.room_members for select using (
  user_id = auth.uid()
  or exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = auth.uid())
  or public.is_room_member(room_id)
);
create policy room_members_insert on public.room_members for insert with check (user_id = auth.uid());
create policy room_members_delete on public.room_members for delete using (
  user_id = auth.uid()
  or exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = auth.uid())
);

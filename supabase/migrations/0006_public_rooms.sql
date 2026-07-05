-- ============================================================================
-- Peer — public rooms + discovery.
-- Private rooms stay exactly as built (invite-code only, contents member-
-- gated by RLS). Public rooms opt IN to a safe listing: the discovery RPC
-- exposes only name/topic/domain/member-count/activity — never the invite
-- code or owner id — and joining is a separate explicit RPC that re-checks
-- visibility server-side.
-- ============================================================================

alter table public.rooms
  add column if not exists visibility text not null default 'private'
  check (visibility in ('public', 'private'));

-- Discovery feed: safe listing fields only. SECURITY DEFINER because RLS
-- (correctly) hides rooms from non-members; the function is the sole,
-- narrow window through it.
create or replace function public.list_public_rooms()
returns table (
  id uuid,
  name text,
  topic text,
  domain_id text,
  member_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select r.id, r.name, r.topic, r.domain_id,
         (select count(*) from public.room_members m where m.room_id = r.id) as member_count,
         r.created_at, r.updated_at
  from public.rooms r
  where r.visibility = 'public' and r.deleted = false
  order by r.updated_at desc
  limit 100;
$$;

-- Join a discovered room. Server-side visibility check — a private room id
-- leaked by other means still cannot be joined this way.
create or replace function public.join_public_room(room uuid)
returns setof public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;

  select * into r
  from public.rooms
  where id = room and visibility = 'public' and deleted = false;

  if r.id is null then
    raise exception 'That room is not open to join.';
  end if;

  insert into public.room_members (room_id, user_id, role)
  values (r.id, auth.uid(), case when r.owner_id = auth.uid() then 'owner' else 'member' end)
  on conflict (room_id, user_id) do nothing;

  return next r;
end;
$$;

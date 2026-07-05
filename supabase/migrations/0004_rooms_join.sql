-- ============================================================================
-- Peer — M9 realtime rooms: join-by-invite-code.
-- RLS hides rooms from non-members, so joining needs a SECURITY DEFINER
-- function where the invite code itself is the capability token.
-- ============================================================================

create or replace function public.join_room_with_code(code text)
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
  where invite_code = lower(trim(code)) and deleted = false;

  if r.id is null then
    raise exception 'No room found for that invite code.';
  end if;

  insert into public.room_members (room_id, user_id, role)
  values (r.id, auth.uid(), case when r.owner_id = auth.uid() then 'owner' else 'member' end)
  on conflict (room_id, user_id) do nothing;

  return next r;
end;
$$;

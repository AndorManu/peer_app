-- ============================================================================
-- Peer — private, authorized realtime channels for rooms (M9 security pass).
-- Realtime topics `room:<room_id>` were open broadcast channels: any client
-- holding the anon key that learns a room id could subscribe/publish,
-- independent of the ROOMS_LIVE UI gate. Supabase Realtime Authorization
-- gates channels created with `private: true` through RLS policies on
-- realtime.messages, keyed by `realtime.topic()`. Reuses public.is_room_member
-- (0001) — the same security-definer membership check rooms/room_members use.
-- ============================================================================

alter table realtime.messages enable row level security;

-- Safely resolve `room:<uuid>` topics to a membership check; never throws on
-- malformed topics (e.g. non-room channels), so the policy just denies them.
create or replace function public.room_topic_member(topic text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  room_uuid uuid;
begin
  if topic !~ '^room:[0-9a-fA-F-]{36}$' then
    return false;
  end if;
  room_uuid := split_part(topic, ':', 2)::uuid;
  return public.is_room_member(room_uuid);
exception when others then
  return false;
end;
$$;

create policy "room members can receive room realtime messages"
on realtime.messages
for select
to authenticated
using (public.room_topic_member(realtime.topic()));

create policy "room members can send room realtime messages"
on realtime.messages
for insert
to authenticated
with check (public.room_topic_member(realtime.topic()));

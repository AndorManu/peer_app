-- ============================================================================
-- Peer — image document preview storage (cross-device sync, part A).
-- Image doc previews are captured as data URLs that never leave the device
-- (src/sync.js drops them on push, so other devices see previewUrl: null).
-- This bucket lets the client upload the preview at attach time to
-- `<user_id>/<doc_id>`; RLS restricts every operation to the owning user —
-- no public/anon access. public.documents gains preview_path so sync can
-- carry the storage path instead of the image bytes.
--
-- Pull-side hydration (resolving preview_path to a signed URL on other
-- devices) is a separate, later task (part B) — not built here.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('doc-previews', 'doc-previews', false, 8388608, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

alter table public.documents add column if not exists preview_path text;

create policy "doc-previews: owner can insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'doc-previews'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "doc-previews: owner can select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'doc-previews'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "doc-previews: owner can delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'doc-previews'
  and (storage.foldername(name))[1] = auth.uid()::text
);

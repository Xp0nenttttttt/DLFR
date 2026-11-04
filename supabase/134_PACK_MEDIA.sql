-- DLFR V134 — stockage des bannières de Level Packs (envoi par les modérateurs qui gèrent les packs).
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('dlfr-pack-media','dlfr-pack-media', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists dlfr_pack_media_upload on storage.objects;
create policy dlfr_pack_media_upload on storage.objects for insert to authenticated
 with check (bucket_id = 'dlfr-pack-media' and (
   exists(select 1 from public.staff_roles s where s.auth_user_id = (select auth.uid()) and s.role in ('owner','editor','supermoderator','moderator','nlw'))
   or exists(select 1 from public.nlw_staff_roles n where n.auth_user_id = (select auth.uid()))));

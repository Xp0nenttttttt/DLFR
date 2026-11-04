-- DLFR V126 — envoi direct d'images pour l'avatar et la bannière du profil.
-- Chaque joueur connecté ne peut écrire que dans son propre dossier : <auth.uid>/avatar|banner/<fichier>.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('dlfr-profile-media','dlfr-profile-media', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists dlfr_profile_media_upload on storage.objects;
create policy dlfr_profile_media_upload on storage.objects for insert to authenticated
 with check (bucket_id = 'dlfr-profile-media'
   and (storage.foldername(name))[1] = (select auth.uid())::text
   and (storage.foldername(name))[2] = any (array['avatar','banner'])
   and exists (select 1 from public.player_profile_owners o where o.auth_user_id = (select auth.uid())));

drop policy if exists dlfr_profile_media_delete on storage.objects;
create policy dlfr_profile_media_delete on storage.objects for delete to authenticated
 using (bucket_id = 'dlfr-profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

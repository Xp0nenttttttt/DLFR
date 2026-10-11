-- V1.1 / Supabase PostgreSQL, nouveau projet UNIQUEMENT.
-- À exécuter après 01_schema.sql si V1 a déjà été installée.
-- Aucune donnée existante n'est supprimée.
alter table public.news_items
  add column if not exists image_url text,
  add column if not exists video_url text;
alter table public.player_profiles
  add column if not exists avatar_url text,
  add column if not exists join_year integer,
  add column if not exists favorite_level text,
  add column if not exists current_goal text,
  add column if not exists youtube_url text,
  add column if not exists twitch_url text;

-- Bucket public destiné UNIQUEMENT aux illustrations des actualités.
-- Les noms de fichiers sont générés aléatoirement par le client.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('demonlist-news','demonlist-news',true,5242880,
  array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Interdire les envois anonymes et limiter l'écriture aux modérateurs.
drop policy if exists "demonlist_news_staff_upload" on storage.objects;
create policy "demonlist_news_staff_upload"
on storage.objects for insert to authenticated
with check (
  bucket_id='demonlist-news'
  and (select public.is_demonlist_staff())
);

-- DLFR V140 — Actualités : colonnes « catégorie » et « épinglée » attendues par le formulaire admin.
-- Sans elles, l'enregistrement d'une annonce échouait (« Cette action est momentanément indisponible »).
alter table public.news_items add column if not exists category text not null default 'Annonce' check (char_length(category) <= 30);
alter table public.news_items alter column category set default 'Annonce';
alter table public.news_items add column if not exists is_pinned boolean not null default false;
update public.news_items set category = 'Annonce' where category = 'annonce';

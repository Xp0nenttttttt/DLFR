-- DLFR V145 — Textes du site modifiables par les propriétaires.
-- Chaque ligne remplace un texte exact du site (« original ») par un autre (« replacement »).
create table if not exists public.dlfr_site_texts(
 original text primary key check (char_length(original) between 1 and 2000),
 replacement text not null check (char_length(replacement) <= 2000),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null);
alter table public.dlfr_site_texts enable row level security;
drop policy if exists dlfr_site_texts_read on public.dlfr_site_texts;
create policy dlfr_site_texts_read on public.dlfr_site_texts for select using (true);
revoke insert, update, delete on public.dlfr_site_texts from anon, authenticated;
grant select on public.dlfr_site_texts to anon, authenticated;

create or replace function public.dlfr_site_text_set(p_original text, p_replacement text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_o text := btrim(coalesce(p_original, ''));
begin
 if v_auth is null or not exists(select 1 from public.staff_roles where auth_user_id = v_auth and role = 'owner') then
  raise exception 'Réservé aux propriétaires.'; end if;
 if v_o = '' or char_length(v_o) > 2000 then raise exception 'Texte d’origine invalide.'; end if;
 if p_replacement is null or btrim(p_replacement) = '' or btrim(p_replacement) = v_o then
  delete from public.dlfr_site_texts where original = v_o; return true; end if;
 if char_length(p_replacement) > 2000 then raise exception 'Texte trop long (2 000 caractères max).'; end if;
 insert into public.dlfr_site_texts(original, replacement, updated_at, updated_by) values (v_o, btrim(p_replacement), now(), v_auth)
 on conflict (original) do update set replacement = excluded.replacement, updated_at = now(), updated_by = v_auth;
 return true;
end $$;
revoke all on function public.dlfr_site_text_set(text, text) from public, anon;
grant execute on function public.dlfr_site_text_set(text, text) to authenticated;

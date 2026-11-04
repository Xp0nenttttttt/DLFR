-- DLFR V129 — DLFR Cards : mode Aventure ouvert à tous (sauvegarde par compte) + catalogue géré par
-- les propriétaires et les supermodérateurs.
-- Le mode Aventure a ses propres ressources (◆ éclats, ✧ poussière, 🔑 clés) : il ne donne jamais de Wayllings dorés.

-- Catalogue (créer / modifier / supprimer cartes et collections) : propriétaires + supermodérateurs.
create or replace function public.dlfr_cards_lab_access()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.staff_roles s
  where s.auth_user_id = (select auth.uid()) and s.role in ('owner','supermoderator')) $$;

create table if not exists public.dlfr_cards_adventure(
 auth_user_id uuid primary key references auth.users(id) on delete cascade,
 save jsonb not null,
 version integer not null default 1,
 updated_at timestamptz not null default now());
alter table public.dlfr_cards_adventure enable row level security;
revoke all on public.dlfr_cards_adventure from anon, authenticated;

create or replace function public.dlfr_adventure_load()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce((select jsonb_build_object('save', save, 'version', version, 'updated_at', updated_at)
   from public.dlfr_cards_adventure where auth_user_id = (select auth.uid())), jsonb_build_object('save', null, 'version', 0)) $$;

-- p_version = version lue au chargement : évite qu'un vieil onglet écrase une progression plus récente.
create or replace function public.dlfr_adventure_save(p_save jsonb, p_version integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_cur integer;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 if p_save is null or jsonb_typeof(p_save) <> 'object' or p_save->>'format' <> 'dlfr-cards-session' then raise exception 'Sauvegarde invalide'; end if;
 if pg_column_size(p_save) > 400000 then raise exception 'Sauvegarde trop volumineuse'; end if;
 select version into v_cur from public.dlfr_cards_adventure where auth_user_id = v_auth for update;
 if v_cur is null then
  insert into public.dlfr_cards_adventure(auth_user_id, save, version) values (v_auth, p_save, 1); return 1; end if;
 if coalesce(p_version, 0) <> v_cur then raise exception 'conflict:%', v_cur; end if;
 update public.dlfr_cards_adventure set save = p_save, version = v_cur + 1, updated_at = now() where auth_user_id = v_auth;
 return v_cur + 1;
end $$;
revoke all on function public.dlfr_adventure_load() from public, anon;
revoke all on function public.dlfr_adventure_save(jsonb, integer) from public, anon;
grant execute on function public.dlfr_adventure_load() to authenticated;
grant execute on function public.dlfr_adventure_save(jsonb, integer) to authenticated;

-- PROJET DE MIGRATION V2.0 (à réviser avant exécution, PAS pour phpMyAdmin)
-- Ne pas exécuter tant que les tests RLS et la migration des données ne sont pas terminés.
-- Les pages V2 fonctionnent actuellement en données de DEMONSTRATION locale.

alter table public.demons add column if not exists unrated boolean not null default false;
alter table public.demons add column if not exists unrated_position integer;
alter table public.demons add column if not exists legacy_since date;
-- La contrainte position unique du schéma V1 impose une stratégie de positionnement pour les unrated.
-- Il faudra la revoir AVANT tout import réel des candidats unrated (position=0 en démonstration).

create table if not exists public.fr_achievements (
 id bigint generated always as identity primary key,
 title text not null, player_key text references public.players(player_key),
 level_name text not null, run_text text, description text, video_url text,
 created_at timestamptz default now()
);
create table if not exists public.clans (
 id bigint generated always as identity primary key,
 name text not null unique, tag text not null unique, description text, color text default '#287bba'
);
create table if not exists public.clan_members (
 player_key text primary key references public.players(player_key) on delete cascade,
 clan_id bigint not null references public.clans(id) on delete cascade,
 role text not null default 'member' check(role in ('leader','member'))
);
create table if not exists public.aredl_levels (
 name text primary key, aredl_rank integer
);
create table if not exists public.player_sanctions (
 id bigint generated always as identity primary key,
 player_key text not null references public.players(player_key),
 action_key text not null, reason text not null, expires_at timestamptz,
 actor uuid references auth.users(id),created_at timestamptz default now()
);
create table if not exists public.nlw_staff_roles (
 auth_user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.fr_achievements enable row level security;
alter table public.clans enable row level security;
alter table public.clan_members enable row level security;
alter table public.aredl_levels enable row level security;
alter table public.player_sanctions enable row level security;
alter table public.nlw_staff_roles enable row level security;

-- Public read-only for editorial/community content; only existing verified staff roles can write.
create policy "fr_achievements_read" on public.fr_achievements for select to anon,authenticated using(true);
create policy "fr_achievements_staff_write" on public.fr_achievements for all to authenticated using ((select public.is_demonlist_staff())) with check ((select public.is_demonlist_staff()));
create policy "clans_read" on public.clans for select to anon,authenticated using(true);
create policy "clans_staff_write" on public.clans for all to authenticated using ((select public.is_demonlist_staff())) with check ((select public.is_demonlist_staff()));
create policy "clan_members_read" on public.clan_members for select to anon,authenticated using(true);
create policy "clan_members_staff_write" on public.clan_members for all to authenticated using ((select public.is_demonlist_staff())) with check ((select public.is_demonlist_staff()));
create policy "aredl_read" on public.aredl_levels for select to anon,authenticated using(true);
create policy "aredl_staff_write" on public.aredl_levels for all to authenticated using ((select public.is_demonlist_staff())) with check ((select public.is_demonlist_staff()));
create policy "sanctions_staff_read" on public.player_sanctions for select to authenticated using ((select public.is_demonlist_staff()));
create policy "sanctions_staff_write" on public.player_sanctions for all to authenticated using ((select public.is_demonlist_staff())) with check ((select public.is_demonlist_staff()));
create policy "nlw_roles_staff_read" on public.nlw_staff_roles for select to authenticated using ((select public.is_demonlist_staff()) or auth_user_id=(select auth.uid()));
create policy "nlw_roles_staff_write" on public.nlw_staff_roles for all to authenticated using ((select public.is_demonlist_staff())) with check ((select public.is_demonlist_staff()));

create or replace function public.is_nlw_staff() returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.nlw_staff_roles where auth_user_id=(select auth.uid())); $$;
revoke all on function public.is_nlw_staff() from public;
grant execute on function public.is_nlw_staff() to authenticated;
-- NLW staff never write positions 1..150. Existing owner policies remain unchanged.
create policy "nlw_demon_insert" on public.demons for insert to authenticated with check (position>150 and (select public.is_nlw_staff()));
create policy "nlw_demon_update" on public.demons for update to authenticated using (position>150 and (select public.is_nlw_staff())) with check (position>150 and (select public.is_nlw_staff()));
create policy "nlw_demon_delete" on public.demons for delete to authenticated using (position>150 and (select public.is_nlw_staff()));

-- IMPORTANT: créer un vrai flux sécurisé pour appliquer les suspensions d'auth.
-- La présence d'une ligne dans player_sanctions ne désactive PAS Supabase Auth.
-- Idem pour la suppression de bannières : contrôler le droit de mise à jour et l'audit côté base.

-- PRÉPARATION uniquement. NE PAS EXÉCUTER avant la migration des comptes.
-- Chaque liaison doit être vérifiée manuellement par l'administrateur.
-- Après avoir testé sur une COPIE de Supabase :

create table if not exists public.player_profile_owners (
 player_key text primary key references public.players(player_key) on delete cascade,
 auth_user_id uuid not null unique references auth.users(id) on delete cascade,
 linked_at timestamptz not null default now()
);
alter table public.player_profile_owners enable row level security;
create policy "profile_owner_read_self" on public.player_profile_owners
 for select to authenticated using (auth_user_id = (select auth.uid()));
-- AUCUNE policy insert/update/delete : l'association compte/joueur ne peut pas être
-- modifiée depuis le navigateur. Attribuer via le SQL Editor après vérification.

alter table public.player_profiles add column if not exists region_code text;
create policy "self_profiles_insert" on public.player_profiles
 for insert to authenticated
 with check (exists (select 1 from public.player_profile_owners o
                    where o.player_key=player_profiles.player_key
                      and o.auth_user_id=(select auth.uid())));
create policy "self_profiles_update" on public.player_profiles
 for update to authenticated
 using (exists (select 1 from public.player_profile_owners o
               where o.player_key=player_profiles.player_key
                 and o.auth_user_id=(select auth.uid())))
 with check (exists (select 1 from public.player_profile_owners o
                   where o.player_key=player_profiles.player_key
                     and o.auth_user_id=(select auth.uid())));

-- Jamais de droits d'écriture des joueurs sur public.players :
-- classement/points/pays/statut de compte restent sous le contrôle des modérateurs.
-- Associer un joueur à une identité seulement après vérification par l'administrateur :
-- insert into public.player_profile_owners(player_key,auth_user_id)
-- values ('nom_du_joueur', 'uuid-auth-verifie-par-admin');

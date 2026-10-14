-- DLFR V2.9 : PREPARATION future de la base uniquement.
-- NE PAS exécuter tant que la migration Supabase de la NLW n'est pas planifiée.
-- Aucun INSERT dans public.demons/public.completions ici.
-- Ne jamais copier de clé service_role dans GitHub Pages.

-- Source AREDL des niveaux : un seul rattachement AREDL par niveau GD.
create table if not exists public.dlfr_aredl_levels (
  aredl_id text primary key,
  gd_level_id text not null unique,
  aredl_rank integer not null check (aredl_rank >= 1),
  source_name text not null,
  dlfr_demon_id bigint unique references public.demons(id) on delete set null,
  manually_locked boolean not null default false,
  state text not null default 'awaiting_review'
    check (state in ('awaiting_review','approved','rejected','conflict')),
  source_payload jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now()
);

-- Source d'identités AREDL : PAS un compte Discord, PAS une preuve de propriété.
create table if not exists public.dlfr_aredl_identities (
  aredl_player_id text primary key,
  aredl_username text not null,
  country_code text check(country_code in ('FR','BE') or country_code is null),
  dlfr_player_key text references public.players(player_key) on delete set null,
  verified_merge_at timestamptz,
  source_updated_at timestamptz not null default now()
);
create unique index if not exists dlfr_aredl_one_external_identity_per_player
  on public.dlfr_aredl_identities(dlfr_player_key) where dlfr_player_key is not null;

-- Chaque joueur peut demander une fusion APRÈS connexion Discord/Supabase Auth.
-- Une demande ne lie pas automatiquement le profil !
create table if not exists public.dlfr_profile_merge_requests (
  id uuid primary key default gen_random_uuid(),
  requester_auth_id uuid not null references auth.users(id) on delete cascade,
  aredl_player_id text not null references public.dlfr_aredl_identities(aredl_player_id),
  target_player_key text not null references public.players(player_key),
  proof_url text,
  status text not null default 'pending'
    check(status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists dlfr_one_pending_merge_per_identity
  on public.dlfr_profile_merge_requests(aredl_player_id) where status = 'pending';

-- Historique d'import indépendant des complétions manuelles.
-- Une soumission DLFR et un record AREDL sont liés après vérification, pas revalidés.
create table if not exists public.dlfr_aredl_record_links (
  aredl_record_id text primary key,
  aredl_player_id text not null references public.dlfr_aredl_identities(aredl_player_id),
  gd_level_id text not null,
  dlfr_completion_id bigint unique references public.completions(id) on delete set null,
  state text not null default 'awaiting_review'
    check(state in ('awaiting_review','approved','conflict','ignored')),
  source_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  unique (gd_level_id, aredl_player_id)
);

-- Aucun accès public aux données de staging; accès staff seulement.
alter table public.dlfr_aredl_levels enable row level security;
alter table public.dlfr_aredl_identities enable row level security;
alter table public.dlfr_profile_merge_requests enable row level security;
alter table public.dlfr_aredl_record_links enable row level security;

create policy dlfr_aredl_levels_staff_read on public.dlfr_aredl_levels
  for select to authenticated using (public.is_demonlist_staff());
create policy dlfr_aredl_identities_staff_read on public.dlfr_aredl_identities
  for select to authenticated using (public.is_demonlist_staff());
create policy dlfr_aredl_record_links_staff_read on public.dlfr_aredl_record_links
  for select to authenticated using (public.is_demonlist_staff());
create policy dlfr_merge_request_own_or_staff on public.dlfr_profile_merge_requests
  for select to authenticated
  using (requester_auth_id = (select auth.uid()) or public.is_demonlist_staff());
create policy dlfr_merge_request_create on public.dlfr_profile_merge_requests
  for insert to authenticated
  with check (requester_auth_id = (select auth.uid()) and status = 'pending'
              and reviewed_by is null and reviewed_at is null);
-- Pas de UPDATE des demandes via clé publique. Approbation dans une fonction
-- serveur/admin future, vérifiant preuve de propriété et unicité des identités.

grant select on public.dlfr_aredl_levels, public.dlfr_aredl_identities,
  public.dlfr_aredl_record_links to authenticated;
grant select, insert on public.dlfr_profile_merge_requests to authenticated;
-- GitHub Actions utilisera une clé service_role SEULEMENT dans un futur workflow
-- protégé. Ce premier workflow de prévisualisation n'a AUCUNE clé DB.

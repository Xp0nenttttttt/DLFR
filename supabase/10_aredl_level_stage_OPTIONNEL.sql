-- OPTIONNEL, à exécuter MANUELLEMENT après revue du schéma Supabase.
-- Staging pour TOUS les niveaux rated AREDL ; ne publie rien dans la DLFR.
create table if not exists public.dlfr_aredl_level_stage (
  gd_level_id text primary key check (gd_level_id ~ '^[1-9][0-9]*$'),
  aredl_id text not null unique,
  aredl_rank integer not null check (aredl_rank >= 1),
  aredl_name text not null,
  source_action text not null,
  verifiers_fr_be jsonb not null default '[]'::jsonb,
  first_observed_fr_be jsonb not null default '{}'::jsonb,
  source_payload jsonb not null default '{}'::jsonb,
  evidence_state text not null default 'not_scanned'
    check (evidence_state in ('not_scanned','complete')),
  review_state text not null default 'pending'
    check (review_state in ('pending','approved','rejected','conflict')),
  manually_locked boolean not null default false,
  manual_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.dlfr_aredl_level_stage enable row level security;
revoke all on table public.dlfr_aredl_level_stage from anon, authenticated;
-- Aucune policy publique, aucun trigger de publication, aucun droit client.
-- Ingestion uniquement via SQL Editor ou serveur privilégié protégé.

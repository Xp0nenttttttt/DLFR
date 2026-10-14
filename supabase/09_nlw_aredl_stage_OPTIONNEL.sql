-- V2.9.3 : table de staging SEULEMENT, optionnelle et A EXECUTER MANUELLEMENT.
-- Ne crée aucun niveau public et ne modifie ni demons ni completions ni players.
-- Revoir attentivement le schéma existant avant utilisation.
create table if not exists public.dlfr_aredl_nlw_stage (
  gd_level_id text primary key check(gd_level_id ~ '^[1-9][0-9]*$'),
  aredl_id text not null unique,
  aredl_rank integer not null check (aredl_rank >= 220),
  aredl_name text not null,
  source_action text not null,
  verifiers_fr_be jsonb not null default '[]'::jsonb,
  first_observed_fr_be jsonb not null default '{}'::jsonb,
  source_payload jsonb not null default '{}'::jsonb,
  review_state text not null default 'pending'
    check (review_state in ('pending','approved','rejected','conflict')),
  manually_locked boolean not null default false,
  manual_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.dlfr_aredl_nlw_stage enable row level security;
-- AUCUNE policy anon/authenticated. Accessible uniquement depuis SQL Editor,
-- ou avec la service_role sécurisée côté serveur (jamais dans un navigateur).
revoke all on table public.dlfr_aredl_nlw_stage from anon, authenticated;
-- Aucun trigger de promotion : une validation humaine distincte sera nécessaire.

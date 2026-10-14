-- DLFR V3.2 : zone d'import PRIVEE. À lancer depuis Supabase SQL Editor.
-- Aucune modification des fiches publiques ni de l'authentification.
BEGIN;
CREATE SCHEMA IF NOT EXISTS dlfr_legacy;
REVOKE ALL ON SCHEMA dlfr_legacy FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS dlfr_legacy.levels (
 legacy_id bigint PRIMARY KEY, old_position integer NOT NULL, name text NOT NULL,
 level_id text, requirement integer NOT NULL CHECK(requirement BETWEEN 1 AND 100),
 source jsonb NOT NULL, loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dlfr_legacy.players (
 legacy_id bigint PRIMARY KEY, username text NOT NULL, country_code text,
 source jsonb NOT NULL, loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dlfr_legacy.records (
 legacy_id bigint PRIMARY KEY, old_demon_id bigint NOT NULL, player text NOT NULL,
 progress integer NOT NULL CHECK(progress BETWEEN 1 AND 100), source jsonb NOT NULL,
 loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dlfr_legacy.player_profiles (
 player_key text PRIMARY KEY, source jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS dlfr_legacy.hall_of_fame (
 legacy_id bigint PRIMARY KEY, source jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS dlfr_legacy.other_history (
 category text NOT NULL, old_key text NOT NULL, source jsonb NOT NULL,
 PRIMARY KEY(category,old_key)
);
CREATE TABLE IF NOT EXISTS dlfr_legacy.level_links (
 legacy_id bigint PRIMARY KEY REFERENCES dlfr_legacy.levels(legacy_id),
 demon_id bigint NOT NULL UNIQUE REFERENCES public.demons(id),
 mapping_source text NOT NULL DEFAULT 'exact_name_and_id',
 linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dlfr_legacy.migration_log (
 event_key text NOT NULL, old_id text NOT NULL, destination_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(event_key,old_id)
);
COMMIT;

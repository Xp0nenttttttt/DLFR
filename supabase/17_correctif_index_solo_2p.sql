-- DLFR V3.0.8 — débloque l'import des variantes Solo / 2P.
-- À exécuter UNE FOIS dans Supabase SQL Editor, après les migrations 11, 15, 16.
-- NON DESTRUCTIF : ne supprime aucun niveau, record ni compte ; ne modifie aucun rang.
-- L'index global créé en V3.0 (dlfr_dem_gd_id_unique) interdisait un ID GD partagé.
-- L'identifiant AREDL, pas le seul ID Geometry Dash, identifie une entrée du classement.
BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='demons' AND column_name='aredl_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='demons' AND column_name='completion_mode'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='dlfr_aredl_level_stage' AND column_name='completion_mode'
  ) THEN
    RAISE EXCEPTION 'Les migrations DLFR précédentes (notamment V3.0.7 / SQL 16) doivent être installées avant ce correctif.';
  END IF;
END
$guard$;

-- Protéger les identités AREDL déjà présentes et futures.
CREATE UNIQUE INDEX IF NOT EXISTS dlfr_dem_aredl_id_unique
  ON public.demons (aredl_id)
  WHERE aredl_id IS NOT NULL;

-- Garder la règle d'unicité GD pour les fiches purement manuelles,
-- tout en permettant une entrée AREDL Solo ET une entrée AREDL 2P sur le même niveau.
CREATE UNIQUE INDEX IF NOT EXISTS dlfr_dem_manual_gd_unique
  ON public.demons (btrim(level_id))
  WHERE aredl_id IS NULL AND level_id IS NOT NULL AND length(btrim(level_id))>0;

-- Un même ID GD ne peut pas recevoir deux entrées AREDL de même variante explicite.
-- Les entrées standard (sans variante explicitement déterminée) restent identifiées
-- uniquement par leur aredl_id et nécessitent une revue lorsqu'elles partagent un GD ID.
CREATE UNIQUE INDEX IF NOT EXISTS dlfr_dem_aredl_variant_unique
  ON public.demons (btrim(level_id), completion_mode)
  WHERE aredl_id IS NOT NULL AND level_id IS NOT NULL
    AND length(btrim(level_id))>0 AND completion_mode IN ('solo','two_player');

-- L'index V3.0 causait HTTP 409 / 23505. C'était un INDEX créé dans SQL 11,
-- et non une contrainte de table : DROP INDEX est donc la bonne opération.
DROP INDEX IF EXISTS public.dlfr_dem_gd_id_unique;

COMMIT;

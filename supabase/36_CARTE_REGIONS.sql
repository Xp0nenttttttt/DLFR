-- DLFR 2.2 : activation des régions pour les profils existants.
-- Additif : ne modifie aucun joueur, record, niveau, score ou rang.
-- Sauvegarder la base avant toute migration.
BEGIN;
ALTER TABLE public.player_profiles ADD COLUMN IF NOT EXISTS region_code text;
-- Même liste de codes que le fichier js/geo.js. Les comptes non renseignés restent NULL.
DO $$ BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_constraint
   WHERE conrelid='public.player_profiles'::regclass
     AND conname='dlfr_22_region_code_check'
 ) THEN
   ALTER TABLE public.player_profiles
   ADD CONSTRAINT dlfr_22_region_code_check
   CHECK (region_code IS NULL OR region_code IN (
     'ARA','BFC','BRE','CVL','COR','GES','HDF','IDF','NOR','NAQ','OCC','PDL','PAC',
     'GP','MQ','GF','RE','YT'
   )) NOT VALID;
 END IF;
END $$;
-- Aucun changement RLS : les règles existantes de player_profiles continuent de s'appliquer.
COMMIT;

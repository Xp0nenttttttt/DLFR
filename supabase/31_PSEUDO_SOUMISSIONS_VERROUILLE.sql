-- DLFR 31 — le pseudo des soumissions est toujours celui de la fiche liée au compte.
-- Exécuter dans Supabase SQL Editor après la migration 11_production.sql.
-- La vérification s'applique aussi aux appels API directs.
BEGIN;
CREATE OR REPLACE FUNCTION public.dlfr_lock_submission_player()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Connexion requise pour soumettre un niveau';
  END IF;
  IF NEW.auth_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Compte de soumission incorrect';
  END IF;
  SELECT p.username INTO v_name
  FROM public.player_profile_owners o
  JOIN public.players p ON p.player_key=o.player_key
  WHERE o.auth_user_id=auth.uid();
  IF nullif(btrim(v_name),'') IS NULL THEN
    RAISE EXCEPTION 'Crée ou lie une fiche DLFR avant de soumettre';
  END IF;
  NEW.player := v_name;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS dlfr_lock_submission_player_before_insert ON public.level_submissions;
CREATE TRIGGER dlfr_lock_submission_player_before_insert
BEFORE INSERT ON public.level_submissions
FOR EACH ROW EXECUTE FUNCTION public.dlfr_lock_submission_player();
REVOKE ALL ON FUNCTION public.dlfr_lock_submission_player() FROM PUBLIC;
COMMIT;

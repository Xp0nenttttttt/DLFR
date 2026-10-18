-- DLFR 51 : retirer des sélecteurs les profils déjà absorbés par une fusion.
-- Pré-requis : migration 33_FUSION_JOUEURS.sql (dlfr_player_merges).
-- L'historique reste privé ; cette fonction ne révèle que les identifiants sources aux supermodérateurs.
BEGIN;
CREATE OR REPLACE FUNCTION public.dlfr_merged_player_sources()
RETURNS TABLE (player_key text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staff_roles s
    WHERE s.auth_user_id = auth.uid()
      AND s.role IN ('owner', 'editor', 'supermoderator')
  ) THEN
    RAISE EXCEPTION 'Accès supermodérateur requis';
  END IF;
  RETURN QUERY
    SELECT m.source_key
    FROM public.dlfr_player_merges m
    ORDER BY m.source_key;
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_merged_player_sources() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dlfr_merged_player_sources() TO authenticated;
COMMIT;

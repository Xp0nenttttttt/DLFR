-- DLFR V75 : message facultatif transmis au joueur lors d'une décision.
-- Exécuter dans Supabase SQL Editor AVANT de déployer les fichiers V75.
-- Les fonctions de validation existantes restent inchangées et gardent leurs contrôles d'accès.
BEGIN;
ALTER TABLE public.level_submissions
 ADD COLUMN IF NOT EXISTS review_message text;

CREATE OR REPLACE FUNCTION public.dlfr_review_existing_record_with_message(
 p_request_id bigint, p_approve boolean, p_message text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_result jsonb; v_note text := btrim(coalesce(p_message, ''));
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 IF length(v_note) > 1000 THEN RAISE EXCEPTION 'Message trop long (1000 caractères maximum)'; END IF;
 -- Ne pas contourner les autorisations de la procédure originale.
 SELECT to_jsonb(public.dlfr_review_existing_record(p_request_id, p_approve)) INTO v_result;
 UPDATE public.level_submissions SET review_message = NULLIF(v_note, '')
 WHERE id = p_request_id;
 RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.dlfr_review_submission_with_message(
 p_request_id bigint, p_approve boolean, p_unrated boolean DEFAULT false,
 p_position integer DEFAULT NULL, p_message text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_result jsonb; v_note text := btrim(coalesce(p_message, ''));
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 IF length(v_note) > 1000 THEN RAISE EXCEPTION 'Message trop long (1000 caractères maximum)'; END IF;
 SELECT to_jsonb(public.dlfr_review_submission(p_request_id, p_approve, p_unrated, p_position)) INTO v_result;
 UPDATE public.level_submissions SET review_message = NULLIF(v_note, '')
 WHERE id = p_request_id;
 RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.dlfr_review_existing_record_with_message(bigint,boolean,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dlfr_review_submission_with_message(bigint,boolean,boolean,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dlfr_review_existing_record_with_message(bigint,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dlfr_review_submission_with_message(bigint,boolean,boolean,integer,text) TO authenticated;
COMMIT;

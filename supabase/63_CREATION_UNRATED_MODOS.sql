-- DLFR V63 : autoriser les modérateurs classiques à PUBLIER des niveaux UNRATED.
-- Pré-requis : V60 (dlfr_scoped_level_role) et les colonnes demons.unrated / unrated_position.
-- Création seulement ; aucun droit de modification, de transfert, de publication
-- d'import masqué ou de suppression supplémentaire.
-- L'installation n'insère / ne modifie AUCUN niveau existant.
BEGIN;

CREATE OR REPLACE FUNCTION public.dlfr_scoped_unrated_create(
  p_name text, p_position integer, p_publisher text,
  p_creator text, p_verifier text, p_requirement integer,
  p_completion_mode text, p_verifier_video_url text, p_thumbnail_url text,
  p_gd_level_id text
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_role text;
  v_gid text;
  v_video text;
  v_thumb text;
  v_id bigint;
  v_rank integer;
BEGIN
  v_role := public.dlfr_scoped_level_role();
  -- Les supermodos et propriétaires utilisent déjà l'éditeur complet.
  -- Restreindre cette RPC supplémentaire au rôle modo classique.
  IF auth.uid() IS NULL OR v_role IS DISTINCT FROM 'moderator' THEN
    RAISE EXCEPTION 'Création UNRATED réservée au rôle modérateur classique';
  END IF;
  v_rank := p_position;
  IF v_rank IS NULL OR v_rank NOT BETWEEN 1 AND 99999998 THEN
    RAISE EXCEPTION 'Rang UNRATED estimé invalide';
  END IF;
  IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Nom de niveau invalide';
  END IF;
  IF length(btrim(coalesce(p_publisher,''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Publié par obligatoire';
  END IF;
  IF length(coalesce(p_creator,'')) > 200 OR length(coalesce(p_verifier,'')) > 200 THEN
    RAISE EXCEPTION 'Crédits trop longs';
  END IF;
  IF p_requirement IS NULL OR p_requirement NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Progression requise invalide';
  END IF;
  IF p_completion_mode IS NULL OR p_completion_mode NOT IN ('standard','solo','two_player') THEN
    RAISE EXCEPTION 'Mode de complétion invalide';
  END IF;
  v_gid := nullif(btrim(coalesce(p_gd_level_id,'')),'');
  IF v_gid IS NOT NULL AND v_gid !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION 'ID Geometry Dash invalide';
  END IF;
  v_video := nullif(btrim(coalesce(p_verifier_video_url,'')),'');
  v_thumb := nullif(btrim(coalesce(p_thumbnail_url,'')),'');
  IF (v_video IS NOT NULL AND v_video !~ '^https://[^ ]+$')
     OR (v_thumb IS NOT NULL AND v_thumb !~ '^https://[^ ]+$') THEN
    RAISE EXCEPTION 'Les liens doivent commencer par https://';
  END IF;

  -- Même verrou que l'éditeur existant : pas de collision pendant la validation.
  PERFORM pg_advisory_xact_lock(41028,2);
  IF EXISTS (
    SELECT 1 FROM public.demons d
    WHERE (
      lower(btrim(d.name)) = lower(btrim(p_name))
      OR (v_gid IS NOT NULL AND btrim(coalesce(d.level_id,'')) = v_gid)
    ) AND coalesce(d.completion_mode,'standard') = p_completion_mode
  ) THEN
    RAISE EXCEPTION 'Ce niveau existe déjà (y compris parmi les imports masqués). Contacte un supermodo pour publier la fiche existante.';
  END IF;
  -- Les UNRATED vivent dans le segment technique 100000000+rang.
  -- Contrairement à la Rated, un rang occupé est refusé sans décaler les autres.
  IF EXISTS(SELECT 1 FROM public.demons WHERE position = 100000000 + v_rank) THEN
    RAISE EXCEPTION 'Rang UNRATED déjà utilisé. Choisis un autre rang.';
  END IF;

  INSERT INTO public.demons(
    name, position, unrated_position, level_id,
    publisher, creator, verifier, requirement, completion_mode,
    verifier_video_url, video_url, thumbnail_url,
    difficulty, is_public, legacy, unrated, data_source
  ) VALUES (
    btrim(p_name), 100000000 + v_rank, v_rank, v_gid,
    btrim(p_publisher), nullif(btrim(coalesce(p_creator,'')),''),
    nullif(btrim(coalesce(p_verifier,'')),''), p_requirement, p_completion_mode,
    v_video, v_video, v_thumb,
    'Extreme Demon', true, false, true, 'manual'
  ) RETURNING id INTO v_id;

  INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
  VALUES(auth.uid(),'SCOPED_UNRATED_LEVEL_CREATE',v_id::text,
         format('unrated_rank=%s; role=%s',v_rank,v_role));
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dlfr_scoped_unrated_create(text,integer,text,text,text,integer,text,text,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dlfr_scoped_unrated_create(text,integer,text,text,text,integer,text,text,text,text)
  TO authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';

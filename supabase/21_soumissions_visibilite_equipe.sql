-- DLFR V3.0.11 — publication des validations manuelles + annuaire public de l'équipe.
-- Prérequis : migrations jusqu'à 19 catalogue privé FR, et 14 positions.
-- Ce fichier NE publie PAS automatiquement les niveaux masqués auparavant.
-- SQL Editor (propriétaire) : sauvegarder demons / level_submissions / completions avant exécution.
BEGIN;

-- Uniquement des noms affichables, jamais les UUID, emails, secrets ou autres métadonnées Auth.
-- Priorité au nom du profil DLFR revendiqué ; sinon nom visible Discord (metadata OAuth).
CREATE OR REPLACE FUNCTION public.dlfr_public_staff_directory()
RETURNS TABLE(display_name text, country_code text, team text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    coalesce(
      nullif(btrim(p.display_name),''),
      nullif(btrim(p.username),''),
      nullif(btrim(u.raw_user_meta_data->>'global_name'),''),
      nullif(btrim(u.raw_user_meta_data->>'full_name'),''),
      nullif(btrim(u.raw_user_meta_data->>'name'),''),
      nullif(btrim(u.raw_user_meta_data->>'user_name'),''),
      nullif(btrim(u.raw_user_meta_data->>'preferred_username'),''),
      nullif(btrim(u.raw_user_meta_data->>'username'),''),
      'Modérateur'
    )::text,
    p.country_code::text,
    'general'::text,
    s.role::text
  FROM public.staff_roles s
  JOIN auth.users u ON u.id = s.auth_user_id
  LEFT JOIN public.player_profile_owners o ON o.auth_user_id = s.auth_user_id
  LEFT JOIN public.players p ON p.player_key = o.player_key
  WHERE s.role IN ('owner','editor')
  UNION ALL
  SELECT
    coalesce(
      nullif(btrim(p.display_name),''),
      nullif(btrim(p.username),''),
      nullif(btrim(u.raw_user_meta_data->>'global_name'),''),
      nullif(btrim(u.raw_user_meta_data->>'full_name'),''),
      nullif(btrim(u.raw_user_meta_data->>'name'),''),
      nullif(btrim(u.raw_user_meta_data->>'user_name'),''),
      nullif(btrim(u.raw_user_meta_data->>'preferred_username'),''),
      nullif(btrim(u.raw_user_meta_data->>'username'),''),
      'Modérateur NLW'
    )::text,
    p.country_code::text,
    'nlw'::text,
    'nlw'::text
  FROM public.nlw_staff_roles s
  JOIN auth.users u ON u.id = s.auth_user_id
  LEFT JOIN public.player_profile_owners o ON o.auth_user_id = s.auth_user_id
  LEFT JOIN public.players p ON p.player_key = o.player_key;
$$;
REVOKE ALL ON FUNCTION public.dlfr_public_staff_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_public_staff_directory() TO anon,authenticated;

-- IMPORTANT : une soumission acceptée peut viser une fiche AREDL MASQUÉE.
-- Les anciennes fonctions validaient la complétion mais ne rendaient pas la fiche visible.
-- Solo / 2P : refus si plusieurs fiches GD sont possibles sans correspondance précise de nom.
CREATE OR REPLACE FUNCTION public.dlfr_review_submission(
  p_request_id bigint,
  p_approve boolean,
  p_unrated boolean DEFAULT false,
  p_position integer DEFAULT NULL
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r public.level_submissions%ROWTYPE;
  d public.demons%ROWTYPE;
  d_id bigint;
  p_key text;
  target_position integer;
  candidate_count integer;
BEGIN
  IF NOT public.dlfr_can_moderate() THEN RAISE EXCEPTION 'Modération générale requise'; END IF;
  PERFORM pg_advisory_xact_lock(41028,2);
  SELECT * INTO r FROM public.level_submissions WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'pending' THEN
    RAISE EXCEPTION 'Soumission déjà traitée ou introuvable';
  END IF;
  IF NOT p_approve THEN
    UPDATE public.level_submissions
       SET status='rejected',reviewed_by=auth.uid(),reviewed_at=now()
     WHERE id=r.id;
    RETURN 'rejected';
  END IF;
  p_key:=lower(btrim(coalesce(r.player,'')));
  IF p_key='' THEN RAISE EXCEPTION 'Joueur absent de la soumission'; END IF;

  IF nullif(btrim(r.level_id),'') IS NOT NULL THEN
    SELECT count(*) INTO candidate_count FROM public.demons
     WHERE btrim(level_id)=btrim(r.level_id);
    IF candidate_count=1 THEN
      SELECT id INTO d_id FROM public.demons WHERE btrim(level_id)=btrim(r.level_id);
    ELSIF candidate_count>1 THEN
      SELECT count(*) INTO candidate_count FROM public.demons
       WHERE btrim(level_id)=btrim(r.level_id)
         AND lower(btrim(name))=lower(btrim(r.level_name));
      IF candidate_count=1 THEN
        SELECT id INTO d_id FROM public.demons
         WHERE btrim(level_id)=btrim(r.level_id)
           AND lower(btrim(name))=lower(btrim(r.level_name));
      ELSE
        RAISE EXCEPTION 'Solo / 2P ambigu : plusieurs fiches partagent cet ID GD. Vérification manuelle du mode nécessaire.';
      END IF;
    END IF;
  END IF;
  IF d_id IS NULL THEN
    IF nullif(btrim(r.level_id),'') IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.demons
       WHERE lower(btrim(name))=lower(btrim(r.level_name))
         AND nullif(btrim(level_id),'') IS NOT NULL
         AND btrim(level_id)<>btrim(r.level_id)
    ) THEN
      RAISE EXCEPTION 'Conflit entre nom et ID Geometry Dash : vérification manuelle requise';
    END IF;
    SELECT count(*) INTO candidate_count FROM public.demons
     WHERE lower(btrim(name))=lower(btrim(r.level_name))
       AND (nullif(btrim(r.level_id),'') IS NULL OR nullif(btrim(level_id),'') IS NULL);
    IF candidate_count>1 THEN RAISE EXCEPTION 'Plusieurs niveaux homonymes : vérification manuelle requise'; END IF;
    IF candidate_count=1 THEN
      SELECT id INTO d_id FROM public.demons
       WHERE lower(btrim(name))=lower(btrim(r.level_name))
         AND (nullif(btrim(r.level_id),'') IS NULL OR nullif(btrim(level_id),'') IS NULL);
    END IF;
  END IF;

  IF d_id IS NULL THEN
    IF p_position IS NULL OR p_position < 1 OR p_position >= 99999999 THEN
      RAISE EXCEPTION 'Indique une position valide pour ce nouveau niveau';
    END IF;
    target_position := CASE WHEN p_unrated THEN 100000000+p_position ELSE p_position END;
    IF EXISTS(SELECT 1 FROM public.demons WHERE position=target_position) THEN
      IF p_unrated THEN RAISE EXCEPTION 'Rang UNRATED occupé : choisir une position libre'; END IF;
      PERFORM public.dlfr_make_room(target_position);
    END IF;
    INSERT INTO public.demons
       (position,name,level_id,publisher,creator,verifier,unrated,unrated_position,video_url,is_public,data_source)
    VALUES
       (target_position,btrim(r.level_name),nullif(btrim(r.level_id),''),
        coalesce(nullif(btrim(r.publisher),''),'Inconnu'),r.creator,r.verifier,
        p_unrated,CASE WHEN p_unrated THEN p_position ELSE NULL END,r.video_url,true,'manual')
    RETURNING id INTO d_id;
  ELSE
    SELECT * INTO d FROM public.demons WHERE id=d_id FOR UPDATE;
    IF NOT d.is_public THEN
      IF p_position IS NULL OR p_position < 1 OR p_position >= 99999999 THEN
        RAISE EXCEPTION 'Niveau AREDL masqué : indique une position DLFR pour le rendre public';
      END IF;
      target_position := CASE WHEN p_unrated THEN 100000000+p_position ELSE p_position END;
      IF EXISTS(SELECT 1 FROM public.demons WHERE position=target_position AND id<>d_id) THEN
        IF p_unrated THEN RAISE EXCEPTION 'Rang UNRATED occupé : choisir une position libre'; END IF;
        PERFORM public.dlfr_make_room(target_position);
      END IF;
      UPDATE public.demons SET
        position=target_position,
        is_public=true,
        unrated=p_unrated,
        unrated_position=CASE WHEN p_unrated THEN p_position ELSE NULL END,
        data_source=CASE WHEN data_source='aredl' THEN 'aredl_manual_review' ELSE data_source END,
        level_id=coalesce(nullif(btrim(level_id),''),nullif(btrim(r.level_id),'')),
        verifier=coalesce(nullif(btrim(verifier),''),nullif(btrim(r.verifier),'')),
        video_url=coalesce(nullif(btrim(video_url),''),nullif(btrim(r.video_url),''))
      WHERE id=d_id;
    ELSIF nullif(btrim(r.level_id),'') IS NOT NULL AND nullif(btrim(d.level_id),'') IS NULL THEN
      UPDATE public.demons SET level_id=btrim(r.level_id) WHERE id=d_id;
    END IF;
  END IF;

  INSERT INTO public.players(player_key,username,display_name,has_account,country_code)
  VALUES(p_key,btrim(r.player),btrim(r.player),false,NULL)
  ON CONFLICT(player_key) DO NOTHING;

  UPDATE public.completions SET
    progress=greatest(progress,r.progress),
    video_url=coalesce(nullif(btrim(video_url),''),nullif(btrim(r.video_url),''))
  WHERE demon_id=d_id AND lower(btrim(player))=p_key;
  IF NOT FOUND THEN
    INSERT INTO public.completions(demon_id,player,progress,video_url)
    VALUES(d_id,p_key,r.progress,r.video_url);
  END IF;
  UPDATE public.level_submissions SET
    status='approved',reviewed_by=auth.uid(),reviewed_at=now(),demon_id=d_id
  WHERE id=r.id;
  RETURN 'approved';
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_review_submission(bigint,boolean,boolean,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_review_submission(bigint,boolean,boolean,integer) TO authenticated;

-- Rattrapage NON DESTRUCTIF d'une soumission déjà acceptée mais associée à un niveau masqué.
-- L'utilisateur choisit explicitement le rang ; aucune fiche masquée n'est publiée en masse.
CREATE OR REPLACE FUNCTION public.dlfr_publish_accepted_submission(
  p_request_id bigint,
  p_position integer,
  p_shift boolean DEFAULT true
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.level_submissions%ROWTYPE; d public.demons%ROWTYPE; target_position integer;
BEGIN
  IF NOT public.dlfr_can_moderate() THEN RAISE EXCEPTION 'Modération générale requise'; END IF;
  IF p_position IS NULL OR p_position<1 OR p_position>=99999999 THEN
    RAISE EXCEPTION 'Position DLFR invalide';
  END IF;
  PERFORM pg_advisory_xact_lock(41028,2);
  SELECT * INTO r FROM public.level_submissions WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'approved' OR r.demon_id IS NULL THEN
    RAISE EXCEPTION 'Cette soumission ne correspond pas à un record déjà accepté';
  END IF;
  SELECT * INTO d FROM public.demons WHERE id=r.demon_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fiche du niveau introuvable'; END IF;
  IF d.is_public THEN RETURN d.id; END IF;
  target_position := CASE WHEN d.unrated THEN 100000000+p_position ELSE p_position END;
  IF EXISTS (SELECT 1 FROM public.demons WHERE position=target_position AND id<>d.id) THEN
    IF d.unrated OR NOT p_shift THEN RAISE EXCEPTION 'Position occupée : choisir un rang libre ou autoriser le décalage'; END IF;
    PERFORM public.dlfr_make_room(target_position);
  END IF;
  UPDATE public.demons SET
    position=target_position,
    is_public=true,
    unrated_position=CASE WHEN d.unrated THEN p_position ELSE NULL END,
    data_source=CASE WHEN data_source='aredl' THEN 'aredl_manual_review' ELSE data_source END
  WHERE id=d.id;
  INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
  VALUES(auth.uid(),'PUBLISH_APPROVED_SUBMISSION',d.id::text,'Soumission '||r.id::text);
  RETURN d.id;
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_publish_accepted_submission(bigint,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_publish_accepted_submission(bigint,integer,boolean) TO authenticated;

COMMIT;

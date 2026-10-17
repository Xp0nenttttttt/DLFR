-- Répare les points rattachés au pseudo au lieu de la fiche liée.
-- Après les migrations 21, 26 et 31. Ne supprime aucun profil ou record.
BEGIN;
ALTER TABLE public.level_submissions ADD COLUMN IF NOT EXISTS submitted_player_key text REFERENCES public.players(player_key);
UPDATE public.level_submissions s SET submitted_player_key=o.player_key
FROM public.player_profile_owners o JOIN public.players p ON p.player_key=o.player_key
WHERE s.submitted_player_key IS NULL AND s.auth_user_id=o.auth_user_id
 AND lower(btrim(s.player))=lower(btrim(p.username));
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
  SELECT player_key INTO NEW.submitted_player_key FROM public.player_profile_owners WHERE auth_user_id=auth.uid();
  RETURN NEW;
END;
$$;
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
  p_key:=coalesce(r.submitted_player_key,
     (SELECT o.player_key FROM public.player_profile_owners o JOIN public.players p ON p.player_key=o.player_key
       WHERE o.auth_user_id=r.auth_user_id AND lower(btrim(p.username))=lower(btrim(r.player))),
     lower(btrim(coalesce(r.player,''))));
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

CREATE OR REPLACE FUNCTION public.dlfr_review_existing_record(
 p_request_id bigint,p_approve boolean
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.level_submissions%ROWTYPE; d public.demons%ROWTYPE;
        target_id bigint; p_key text; existing_id bigint;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion Discord requise'; END IF;
 IF p_request_id IS NULL OR p_approve IS NULL THEN RAISE EXCEPTION 'Validation incomplete'; END IF;
 PERFORM pg_advisory_xact_lock(41028,2);
 SELECT * INTO r FROM public.level_submissions WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'pending' THEN RAISE EXCEPTION 'Soumission absente ou deja traitee'; END IF;
 IF r.progress<>100 THEN RAISE EXCEPTION 'Cette soumission ne correspond pas a une completion 100 pour cent'; END IF;
 target_id:=public.dlfr_review_target(r.level_id,r.level_name);
 IF target_id IS NULL THEN RAISE EXCEPTION 'Niveau absent, masque ou ambigu : demander a un supermoderateur'; END IF;
 SELECT * INTO d FROM public.demons WHERE id=target_id FOR UPDATE;
 IF NOT public.dlfr_record_review_allowed(d.position) THEN RAISE EXCEPTION 'Rang non autorise pour ce role'; END IF;
 IF NOT p_approve THEN
   UPDATE public.level_submissions SET status='rejected',reviewed_by=auth.uid(),reviewed_at=now()
   WHERE id=r.id;
 ELSE
   p_key:=coalesce(r.submitted_player_key,
     (SELECT o.player_key FROM public.player_profile_owners o JOIN public.players p ON p.player_key=o.player_key
       WHERE o.auth_user_id=r.auth_user_id AND lower(btrim(p.username))=lower(btrim(r.player))),
     lower(btrim(coalesce(r.player,''))));
   IF p_key='' THEN RAISE EXCEPTION 'Identite joueur vide'; END IF;
   INSERT INTO public.players(player_key,username,display_name,has_account,country_code)
    VALUES (p_key,btrim(r.player),btrim(r.player),false,NULL)
    ON CONFLICT(player_key) DO NOTHING;
   SELECT c.id INTO existing_id FROM public.completions c
     WHERE c.demon_id=target_id AND lower(btrim(c.player))=p_key
     ORDER BY c.id LIMIT 1 FOR UPDATE;
   IF existing_id IS NULL THEN
     INSERT INTO public.completions(demon_id,player,progress,video_url)
      VALUES(target_id,p_key,100,r.video_url);
   ELSE
     UPDATE public.completions SET progress=greatest(progress,100),
       video_url=coalesce(nullif(btrim(video_url),''),nullif(btrim(r.video_url),''))
       WHERE id=existing_id;
   END IF;
   UPDATE public.level_submissions SET status='approved',reviewed_by=auth.uid(),
      reviewed_at=now(),demon_id=target_id WHERE id=r.id;
 END IF;
 INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
 VALUES(auth.uid(),CASE WHEN p_approve THEN 'REVIEW_EXISTING_ACCEPT' ELSE 'REVIEW_EXISTING_REJECT' END,
   r.id::text,concat('demon=',d.id,';rang=',d.position,';joueur=',left(r.player,60)));
 RETURN CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_review_existing_record(bigint,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_review_existing_record(bigint,boolean) TO authenticated;


-- Rattrapage uniquement des soumissions acceptées reliées à un compte identifié.
DO $$ DECLARE r record; old_record public.completions%ROWTYPE; target_id bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(41028,2);
 FOR r IN SELECT DISTINCT demon_id,submitted_player_key,lower(btrim(player)) old_key FROM public.level_submissions
   WHERE status='approved' AND demon_id IS NOT NULL AND submitted_player_key IS NOT NULL
     AND lower(submitted_player_key)<>lower(btrim(player)) LOOP
   -- Si le même ancien pseudo désigne plusieurs propriétaires pour ce niveau, ne pas deviner.
   IF EXISTS(SELECT 1 FROM public.level_submissions s WHERE s.status='approved' AND s.demon_id=r.demon_id
      AND lower(btrim(s.player))=r.old_key AND s.submitted_player_key IS DISTINCT FROM r.submitted_player_key) THEN CONTINUE; END IF;
   FOR old_record IN SELECT * FROM public.completions WHERE demon_id=r.demon_id AND lower(btrim(player))=r.old_key LOOP
     SELECT id INTO target_id FROM public.completions WHERE demon_id=r.demon_id AND lower(btrim(player))=lower(r.submitted_player_key) LIMIT 1;
     IF target_id IS NULL THEN
       UPDATE public.completions SET player=r.submitted_player_key WHERE id=old_record.id;
     ELSE
       UPDATE public.completions SET progress=greatest(progress,old_record.progress),
         video_url=CASE WHEN old_record.progress>progress THEN coalesce(old_record.video_url,video_url) ELSE coalesce(video_url,old_record.video_url) END
       WHERE id=target_id;
       -- Ancien record conservé ; le moteur d'affichage déduplique les records connus.
     END IF;
   END LOOP;
 END LOOP;
END $$;
COMMIT;

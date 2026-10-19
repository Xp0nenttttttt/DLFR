-- DLFR V60 : création + édition des niveaux Rated publics par les modérateurs.
-- Appliquer APRÈS les migrations de base (14, 26, 30, 43). Sauvegarder avant.
-- Ne modifie aucune donnée avant qu'un membre de l'équipe utilise les fonctions.
-- Les rôles et les périmètres sont vérifiés dans PostgreSQL, pas dans le navigateur.
BEGIN;

CREATE OR REPLACE FUNCTION public.dlfr_scoped_level_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(
    (SELECT s.role::text FROM public.staff_roles s
       WHERE s.auth_user_id = auth.uid()
         AND s.role IN ('owner','editor','supermoderator','moderator') LIMIT 1),
    (SELECT 'nlw'::text WHERE EXISTS(
       SELECT 1 FROM public.nlw_staff_roles n WHERE n.auth_user_id = auth.uid()))
  );
$$;
REVOKE ALL ON FUNCTION public.dlfr_scoped_level_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dlfr_scoped_level_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.dlfr_scoped_level_create(
  p_name text, p_position integer, p_publisher text,
  p_creator text, p_verifier text, p_requirement integer,
  p_completion_mode text, p_verifier_video_url text, p_thumbnail_url text,
  p_gd_level_id text
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text; v_gid text; v_id bigint;
BEGIN
  v_role := public.dlfr_scoped_level_role();
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('owner','editor','supermoderator','moderator','nlw')
  THEN RAISE EXCEPTION 'Accès modérateur requis'; END IF;
  IF p_position IS NULL OR p_position NOT BETWEEN 1 AND 99999998
  THEN RAISE EXCEPTION 'Position Rated invalide'; END IF;
  IF v_role = 'nlw' AND p_position <= 150
  THEN RAISE EXCEPTION 'Un modérateur NLW ne peut publier que des rangs au-delà de 150'; END IF;
  IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 1 AND 120
  THEN RAISE EXCEPTION 'Nom invalide'; END IF;
  IF length(btrim(coalesce(p_publisher,''))) NOT BETWEEN 1 AND 200
  THEN RAISE EXCEPTION 'Publié par obligatoire'; END IF;
  IF length(coalesce(p_creator,'')) > 200 OR length(coalesce(p_verifier,'')) > 200
  THEN RAISE EXCEPTION 'Crédits trop longs'; END IF;
  IF p_requirement IS NULL OR p_requirement NOT BETWEEN 1 AND 100
  THEN RAISE EXCEPTION 'Progression requise invalide'; END IF;
  IF p_completion_mode NOT IN ('standard','solo','two_player')
  THEN RAISE EXCEPTION 'Mode de complétion invalide'; END IF;
  v_gid := nullif(btrim(coalesce(p_gd_level_id,'')), '');
  IF v_gid IS NOT NULL AND v_gid !~ '^[1-9][0-9]*$'
  THEN RAISE EXCEPTION 'ID Geometry Dash invalide'; END IF;
  IF (nullif(p_verifier_video_url,'') IS NOT NULL AND p_verifier_video_url !~ '^https://[^ ]+$')
     OR (nullif(p_thumbnail_url,'') IS NOT NULL AND p_thumbnail_url !~ '^https://[^ ]+$')
  THEN RAISE EXCEPTION 'Les URLs doivent commencer par https://'; END IF;

  PERFORM pg_advisory_xact_lock(41028,2);
  IF EXISTS (SELECT 1 FROM public.demons d
             WHERE (lower(btrim(d.name)) = lower(btrim(p_name))
                  OR (v_gid IS NOT NULL AND btrim(coalesce(d.level_id,'')) = v_gid))
               AND coalesce(d.completion_mode,'standard') = p_completion_mode)
  THEN RAISE EXCEPTION 'Ce niveau existe déjà, utilise la fiche existante ou contacte un supermodo pour un import masqué'; END IF;
  IF EXISTS(SELECT 1 FROM public.demons WHERE position = p_position) THEN
    PERFORM public.dlfr_make_room(p_position);
  END IF;
  INSERT INTO public.demons(
     name,position,level_id,publisher,creator,verifier,
     requirement,completion_mode,verifier_video_url,thumbnail_url,
     difficulty,is_public,legacy,unrated,data_source)
   VALUES (
     btrim(p_name),p_position,v_gid,btrim(p_publisher),
     nullif(btrim(coalesce(p_creator,'')),''),nullif(btrim(coalesce(p_verifier,'')),''),
     p_requirement,p_completion_mode,nullif(btrim(coalesce(p_verifier_video_url,'')),''),
     nullif(btrim(coalesce(p_thumbnail_url,'')),''),
     'Extreme Demon',true,false,false,'manual'
   ) RETURNING id INTO v_id;
  INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
  VALUES(auth.uid(),'SCOPED_LEVEL_CREATE',v_id::text,
         format('rang=%s; role=%s',p_position,v_role));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_scoped_level_create(text,integer,text,text,text,integer,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dlfr_scoped_level_create(text,integer,text,text,text,integer,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dlfr_scoped_level_update(
  p_name text, p_position integer, p_publisher text,
  p_creator text, p_verifier text, p_requirement integer,
  p_completion_mode text, p_verifier_video_url text, p_thumbnail_url text,
  p_demon_id bigint, p_level_id text, p_video_url text
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text; original public.demons%ROWTYPE; v_gid text; spare integer; r record;
BEGIN
  v_role := public.dlfr_scoped_level_role();
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('owner','editor','supermoderator','moderator','nlw')
  THEN RAISE EXCEPTION 'Accès modérateur requis'; END IF;
  IF p_demon_id IS NULL OR p_position IS NULL OR p_position NOT BETWEEN 1 AND 99999998
  THEN RAISE EXCEPTION 'Fiche ou position invalide'; END IF;
  IF v_role = 'nlw' AND p_position <= 150
  THEN RAISE EXCEPTION 'Position Top 150 interdite au rôle NLW'; END IF;
  IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 1 AND 120
  THEN RAISE EXCEPTION 'Nom invalide'; END IF;
  IF length(btrim(coalesce(p_publisher,''))) NOT BETWEEN 1 AND 200
  THEN RAISE EXCEPTION 'Publié par obligatoire'; END IF;
  IF length(coalesce(p_creator,'')) > 200 OR length(coalesce(p_verifier,'')) > 200
  THEN RAISE EXCEPTION 'Crédits trop longs'; END IF;
  IF p_requirement IS NULL OR p_requirement NOT BETWEEN 1 AND 100
  THEN RAISE EXCEPTION 'Progression requise invalide'; END IF;
  IF p_completion_mode NOT IN ('standard','solo','two_player')
  THEN RAISE EXCEPTION 'Mode de complétion invalide'; END IF;
  v_gid := nullif(btrim(coalesce(p_level_id,'')),'');
  IF v_gid IS NOT NULL AND v_gid !~ '^[1-9][0-9]*$'
  THEN RAISE EXCEPTION 'ID Geometry Dash invalide'; END IF;
  IF (nullif(p_verifier_video_url,'') IS NOT NULL AND p_verifier_video_url !~ '^https://[^ ]+$')
    OR (nullif(p_thumbnail_url,'') IS NOT NULL AND p_thumbnail_url !~ '^https://[^ ]+$')
    OR (nullif(p_video_url,'') IS NOT NULL AND p_video_url !~ '^https://[^ ]+$')
  THEN RAISE EXCEPTION 'Les URLs doivent commencer par https://'; END IF;
  PERFORM pg_advisory_xact_lock(41028,2);
  SELECT * INTO original FROM public.demons WHERE id = p_demon_id FOR UPDATE;
  IF NOT FOUND OR original.is_public IS DISTINCT FROM true
     OR original.legacy IS TRUE OR original.unrated IS TRUE
     OR original.position < 1 OR original.position >= 100000000
  THEN RAISE EXCEPTION 'Niveau non public, Legacy ou UNRATED : supermodération requise'; END IF;
  IF v_role = 'nlw' AND original.position <= 150
  THEN RAISE EXCEPTION 'Tu ne peux pas modifier un niveau du Top 150'; END IF;
  -- Transferts Top150/NLW réservés aux supermodérateurs afin d'éviter
  -- le déplacement involontaire des limites et des classements.
  IF (original.position<=150) <> (p_position<=150)
  THEN RAISE EXCEPTION 'Transfert Top 150 / NLW : demande à un supermodérateur'; END IF;
  IF EXISTS (SELECT 1 FROM public.demons d WHERE d.id<>p_demon_id
             AND (lower(btrim(d.name))=lower(btrim(p_name))
                OR (v_gid IS NOT NULL AND btrim(coalesce(d.level_id,''))=v_gid))
             AND coalesce(d.completion_mode,'standard')=p_completion_mode)
  THEN RAISE EXCEPTION 'Une autre fiche de ce nom / ID GD existe déjà'; END IF;
  IF original.position<>p_position THEN
    SELECT greatest(coalesce(max(position),0)+1,99999999)
      INTO spare FROM public.demons WHERE position<100000000;
    IF spare>=2147483647 OR EXISTS(SELECT 1 FROM public.demons WHERE position=spare)
    THEN RAISE EXCEPTION 'Aucune position temporaire libre'; END IF;
    UPDATE public.demons SET position=spare WHERE id=p_demon_id;
    IF original.position > p_position THEN
      FOR r IN SELECT id,position FROM public.demons
               WHERE position>=p_position AND position<original.position
               ORDER BY position DESC LOOP
        UPDATE public.demons SET position=r.position+1 WHERE id=r.id;
      END LOOP;
    ELSE
      FOR r IN SELECT id,position FROM public.demons
               WHERE position>original.position AND position<=p_position
               ORDER BY position ASC LOOP
        UPDATE public.demons SET position=r.position-1 WHERE id=r.id;
      END LOOP;
    END IF;
  END IF;
  UPDATE public.demons SET
    position=p_position, name=btrim(p_name), level_id=v_gid,
    publisher=btrim(p_publisher), creator=nullif(btrim(coalesce(p_creator,'')),''),
    verifier=nullif(btrim(coalesce(p_verifier,'')),''), requirement=p_requirement,
    completion_mode=p_completion_mode, video_url=nullif(btrim(coalesce(p_video_url,'')),''),
    verifier_video_url=nullif(btrim(coalesce(p_verifier_video_url,'')),''),
    thumbnail_url=nullif(btrim(coalesce(p_thumbnail_url,'')),'')
  WHERE id=p_demon_id;
  INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
  VALUES(auth.uid(),'SCOPED_LEVEL_EDIT',p_demon_id::text,
    format('position %s -> %s; role=%s; nom %s -> %s',original.position,p_position,v_role,original.name,p_name));
  RETURN p_demon_id;
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_scoped_level_update(text,integer,text,text,text,integer,text,text,text,bigint,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dlfr_scoped_level_update(text,integer,text,text,text,integer,text,text,text,bigint,text,text) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

-- DLFR : édition intégrale et changement de rang sécurisé.
-- Sauvegarder la base avant déploiement. Aucune modification des données à l'installation.
BEGIN;
CREATE OR REPLACE FUNCTION public.dlfr_update_demon_full(
 p_demon_id bigint, p_name text, p_position integer, p_level_id text,
 p_creator text, p_creator_more text, p_publisher text, p_verifier text,
 p_difficulty text, p_requirement integer, p_completion_mode text,
 p_video_url text, p_verifier_video_url text, p_thumbnail_url text,
 p_description text, p_is_public boolean, p_legacy boolean, p_legacy_since date
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE original public.demons%ROWTYPE; r record; spare integer; new_gid text;
BEGIN
 IF NOT public.dlfr_can_moderate() THEN RAISE EXCEPTION 'Supermodération requise'; END IF;
 IF p_demon_id IS NULL OR p_position NOT BETWEEN 1 AND 99999998 THEN RAISE EXCEPTION 'Identifiant ou position invalide'; END IF;
 IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Nom invalide'; END IF;
 IF length(btrim(coalesce(p_publisher,''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Publié par obligatoire (200 caractères max)'; END IF;
 IF p_requirement NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Progression requise entre 1 et 100'; END IF;
 IF p_completion_mode NOT IN ('standard','solo','two_player') THEN RAISE EXCEPTION 'Mode de complétion incorrect'; END IF;
 IF p_difficulty IS NULL OR length(btrim(p_difficulty)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Difficulté invalide'; END IF;
 IF length(coalesce(p_creator,'')) > 200 OR length(coalesce(p_creator_more,'')) > 300 OR length(coalesce(p_verifier,'')) > 200 OR length(coalesce(p_description,'')) > 10000 THEN RAISE EXCEPTION 'Champ trop long'; END IF;
 IF p_video_url IS NOT NULL AND p_video_url<>'' AND p_video_url !~ '^https://[^ ]+$' THEN RAISE EXCEPTION 'Vidéo : URL HTTPS attendue'; END IF;
 IF p_verifier_video_url IS NOT NULL AND p_verifier_video_url<>'' AND p_verifier_video_url !~ '^https://[^ ]+$' THEN RAISE EXCEPTION 'Vidéo de vérification : URL HTTPS attendue'; END IF;
 IF p_thumbnail_url IS NOT NULL AND p_thumbnail_url<>'' AND p_thumbnail_url !~ '^https://[^ ]+$' THEN RAISE EXCEPTION 'Miniature : URL HTTPS attendue'; END IF;
 new_gid:=nullif(btrim(coalesce(p_level_id,'')),'');
 IF new_gid IS NOT NULL AND new_gid !~ '^[0-9]+$' THEN RAISE EXCEPTION 'ID Geometry Dash numérique requis'; END IF;
 PERFORM pg_advisory_xact_lock(41028, 2);
 SELECT * INTO original FROM public.demons WHERE id=p_demon_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fiche de niveau introuvable'; END IF;
 IF EXISTS(SELECT 1 FROM public.demons WHERE id<>p_demon_id AND lower(btrim(name))=lower(btrim(p_name))) THEN RAISE EXCEPTION 'Un niveau avec ce nom existe déjà'; END IF;
 -- Ne pas déplacer involontairement un Rated du Top 150 vers la NLW ou inversement.
 IF (original.position<=150) <> (p_position<=150) THEN RAISE EXCEPTION 'Déplacement Top 150 / NLW interdit dans cet éditeur (classement distinct)'; END IF;
 IF original.position<>p_position THEN
   -- Une seule position temporaire libre. Les rangs ne deviennent jamais négatifs.
   SELECT greatest(coalesce(max(position),0)+1,99999999) INTO spare FROM public.demons;
   IF spare > 2147483647 OR EXISTS(SELECT 1 FROM public.demons WHERE position=spare) THEN RAISE EXCEPTION 'Aucune position temporaire disponible'; END IF;
   UPDATE public.demons SET position=spare WHERE id=p_demon_id;
   IF original.position>p_position THEN
     -- Décalage vers le bas : libérer la position cible en partant de l'ancien rang.
     FOR r IN SELECT id,position FROM public.demons WHERE position>=p_position AND position<original.position ORDER BY position DESC LOOP
       UPDATE public.demons SET position=r.position+1 WHERE id=r.id;
     END LOOP;
   ELSE
     FOR r IN SELECT id,position FROM public.demons WHERE position>original.position AND position<=p_position ORDER BY position ASC LOOP
       UPDATE public.demons SET position=r.position-1 WHERE id=r.id;
     END LOOP;
   END IF;
 END IF;
 UPDATE public.demons SET
   position=p_position,name=btrim(p_name),level_id=new_gid,
   creator=nullif(btrim(coalesce(p_creator,'')),''),creator_more=nullif(btrim(coalesce(p_creator_more,'')),''),
   publisher=btrim(p_publisher),verifier=nullif(btrim(coalesce(p_verifier,'')),''),
   difficulty=btrim(p_difficulty),requirement=p_requirement,completion_mode=p_completion_mode,
   video_url=nullif(btrim(coalesce(p_video_url,'')),''),
   verifier_video_url=nullif(btrim(coalesce(p_verifier_video_url,'')),''),
   thumbnail_url=nullif(btrim(coalesce(p_thumbnail_url,'')),''),
   description=nullif(btrim(coalesce(p_description,'')),''),
   is_public=p_is_public,legacy=p_legacy,legacy_since=CASE WHEN p_legacy THEN p_legacy_since ELSE NULL END,
   data_source='manual'
 WHERE id=p_demon_id;
 INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
 VALUES (auth.uid(),'LEVEL_FULL_EDIT',p_demon_id::text,
   format('position %s -> %s; nom %s -> %s',original.position,p_position,original.name,p_name));
 RETURN p_demon_id;
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_update_demon_full(bigint,text,integer,text,text,text,text,text,text,integer,text,text,text,text,text,boolean,boolean,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_update_demon_full(bigint,text,integer,text,text,text,text,text,text,integer,text,text,text,text,text,boolean,boolean,date) TO authenticated;
COMMIT;

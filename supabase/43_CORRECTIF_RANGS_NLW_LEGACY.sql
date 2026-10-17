-- DLFR 2.9.1 : transferts Top 150 ↔ NLW + sortie vers Legacy.
-- Cette migration remplace la fonction déjà installée en 38, sans déplacement de données.
-- Exécuter après les migrations 32 et 38 ; sauvegarder la base avant application.
BEGIN;
CREATE OR REPLACE FUNCTION public.dlfr_update_demon_full(
 p_demon_id bigint, p_name text, p_position integer, p_level_id text,
 p_creator text, p_creator_more text, p_publisher text, p_verifier text,
 p_difficulty text, p_requirement integer, p_completion_mode text,
 p_video_url text, p_verifier_video_url text, p_thumbnail_url text,
 p_description text, p_is_public boolean, p_legacy boolean, p_legacy_since date
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE original public.demons%ROWTYPE; r record; spare integer; new_gid text; last_nlw_rank integer;
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
 -- Les Legacy restent hors du Top 150 et hors des points NLW.
 IF p_legacy IS TRUE AND p_position<=150 THEN
   RAISE EXCEPTION 'Un niveau Legacy doit être placé après le Top 150';
 END IF;
 -- Les niveaux UNRATED ont leur propre plage de positions, et ne passent
 -- pas par cette édition des rangs Rated.
 IF original.unrated IS TRUE OR original.position>=100000000 THEN
   RAISE EXCEPTION 'Déplacement UNRATED : utilise son classement dédié';
 END IF;
 -- Un nouveau Legacy est rangé après la NLW publique pour éviter de créer
 -- un trou au milieu de la liste officielle.
 IF p_legacy IS TRUE AND original.legacy IS DISTINCT FROM TRUE THEN
   SELECT coalesce(max(position),150) INTO last_nlw_rank FROM public.demons
    WHERE id<>p_demon_id AND is_public IS TRUE AND legacy IS NOT TRUE
      AND unrated IS NOT TRUE AND position BETWEEN 151 AND 99999998;
   IF p_position<greatest(last_nlw_rank,151) THEN
     RAISE EXCEPTION 'Legacy : utilise la position % ou plus (après les niveaux NLW)',greatest(last_nlw_rank,151);
   END IF;
 END IF;
 -- Dans les deux sens, la fiche doit être publique. Les imports techniques
 -- masqués ne sont jamais transférés implicitement en Top 150 ou NLW.
 IF (original.position<=150 AND p_position>150)
 OR (original.position>150 AND p_position<=150) THEN
   IF original.is_public IS NOT TRUE OR p_is_public IS DISTINCT FROM TRUE THEN
     RAISE EXCEPTION 'Transfert réservé aux niveaux publics';
   END IF;
   IF original.position>150 AND p_position<=150 AND p_legacy IS TRUE THEN
     RAISE EXCEPTION 'Décoche Legacy pour faire entrer le niveau dans le Top 150';
   END IF;
 END IF;
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
 VALUES (auth.uid(),CASE WHEN original.position>150 AND p_position<=150 THEN 'LEVEL_TO_TOP'
                         WHEN original.position<=150 AND p_position>150 AND p_legacy THEN 'LEVEL_TOP_TO_LEGACY'
                         WHEN original.position<=150 AND p_position>150 THEN 'LEVEL_TOP_TO_NLW'
                         ELSE 'LEVEL_FULL_EDIT' END,p_demon_id::text,
   format('position %s -> %s; nom %s -> %s; décalage des positions concernées; records préservés',original.position,p_position,original.name,p_name));
 RETURN p_demon_id;
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_update_demon_full(bigint,text,integer,text,text,text,text,text,text,integer,text,text,text,text,text,boolean,boolean,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_update_demon_full(bigint,text,integer,text,text,text,text,text,text,integer,text,text,text,text,text,boolean,boolean,date) TO authenticated;


-- Publication manuelle atomique : conservation du choix Legacy lors de la création.
-- Ne change pas les anciennes RPC pour ne pas casser les autres formulaires.
CREATE OR REPLACE FUNCTION public.dlfr_manual_publish_level_v3(
 p_name text,
 p_gd_level_id text,
 p_position integer,
 p_publisher text,
 p_creator text,
 p_verifier text,
 p_unrated boolean,
 p_requirement integer,
 p_existing_demon_id bigint,
 p_verifier_video_url text,
 p_thumbnail_url text,
 p_completion_mode text,
 p_publisher_player_key text,
 p_verifier_player_key text,
 p_new_publisher_name text,
 p_new_verifier_name text,
 p_legacy boolean,
 p_legacy_since date
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE created_id bigint; last_nlw_rank integer;
BEGIN
 IF NOT public.dlfr_can_moderate() THEN RAISE EXCEPTION 'Modération requise'; END IF;
 IF coalesce(p_legacy,false) AND (coalesce(p_unrated,false) OR p_position<=150) THEN
    RAISE EXCEPTION 'Legacy : choisis un niveau Rated avec position après le Top 150';
 END IF;
 IF p_legacy IS TRUE THEN
    -- Le même verrou protège la vérification et la création atomique ci-dessous.
    PERFORM pg_advisory_xact_lock(41028,2);
    SELECT coalesce(max(position),150) INTO last_nlw_rank FROM public.demons
      WHERE is_public IS TRUE AND legacy IS NOT TRUE AND unrated IS NOT TRUE
        AND position BETWEEN 151 AND 99999998;
    IF p_position<=last_nlw_rank THEN
       RAISE EXCEPTION 'Legacy : utilise la position % ou plus (après la NLW)',last_nlw_rank+1;
    END IF;
 END IF;
 -- La création de la fiche, du vérificateur et de son statut Legacy
 -- fait partie d'une seule transaction : en cas d'erreur tout est annulé.
 SELECT public.dlfr_manual_save_demon_with_players(
   p_name,p_gd_level_id,p_position,p_publisher,p_creator,p_verifier,p_unrated,
   p_requirement,p_existing_demon_id,p_verifier_video_url,p_thumbnail_url,
   p_completion_mode,p_publisher_player_key,p_verifier_player_key,
   p_new_publisher_name,p_new_verifier_name
 ) INTO created_id;
 UPDATE public.demons SET
   legacy=coalesce(p_legacy,false),
   legacy_since=CASE WHEN p_legacy IS TRUE THEN p_legacy_since ELSE NULL END
 WHERE id=created_id;
 RETURN created_id;
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_manual_publish_level_v3(
 text,text,integer,text,text,text,boolean,integer,bigint,text,text,text,
 text,text,text,text,boolean,date
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_manual_publish_level_v3(
 text,text,integer,text,text,text,boolean,integer,bigint,text,text,text,
 text,text,text,text,boolean,date
) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

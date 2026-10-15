-- INSTALLER APRÈS VOTRE SAUVEGARDE.
-- Restaure le RPC de création de niveau manquant et ajoute une variante avec joueurs.
-- Les nouveaux joueurs sont des fiches publiques sans compte utilisateur / auth.
-- DLFR V3.1.0 — Création manuelle sécurisée des niveaux.
-- Prérequis : migrations SQL V3.0 à V3.0.11, dont dlfr_make_room() et is_public.
-- Aucun niveau ni record n'est supprimé.
BEGIN;

CREATE OR REPLACE FUNCTION public.dlfr_manual_save_demon(
 p_name text, p_gd_level_id text, p_position integer,
 p_publisher text DEFAULT '', p_creator text DEFAULT NULL,
 p_verifier text DEFAULT NULL, p_unrated boolean DEFAULT false,
 p_requirement integer DEFAULT 100, p_existing_demon_id bigint DEFAULT NULL,
 p_verifier_video_url text DEFAULT NULL, p_thumbnail_url text DEFAULT NULL,
 p_completion_mode text DEFAULT NULL
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.demons%ROWTYPE; result_id bigint; target_rank integer;
        gid text; vvideo text; thumbnail text;
BEGIN
 IF NOT public.dlfr_can_moderate() THEN RAISE EXCEPTION 'Modérateur général requis'; END IF;
 IF p_position IS NULL OR p_position<1 OR p_position>=99999999 THEN RAISE EXCEPTION 'Rang invalide'; END IF;
 IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Nom invalide'; END IF;
 IF p_requirement IS NULL OR p_requirement NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Progression minimum invalide'; END IF;
 IF p_completion_mode IS NOT NULL AND p_completion_mode NOT IN ('standard','solo','two_player') THEN RAISE EXCEPTION 'Mode de complétion invalide'; END IF;
 gid:=nullif(btrim(p_gd_level_id),'');
 IF gid IS NOT NULL AND gid !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'ID Geometry Dash invalide'; END IF;
 vvideo:=nullif(btrim(p_verifier_video_url),''); thumbnail:=nullif(btrim(p_thumbnail_url),'');
 IF (vvideo IS NOT NULL AND vvideo !~ '^https://') OR (thumbnail IS NOT NULL AND thumbnail !~ '^https://') THEN
   RAISE EXCEPTION 'Les liens doivent commencer par https://';
 END IF;
 target_rank:=CASE WHEN p_unrated THEN 100000000+p_position ELSE p_position END;
 PERFORM pg_advisory_xact_lock(41028,2);
 IF p_existing_demon_id IS NOT NULL THEN
   SELECT * INTO d FROM public.demons WHERE id=p_existing_demon_id FOR UPDATE;
   IF NOT FOUND OR d.is_public THEN RAISE EXCEPTION 'Fiche cachée introuvable ou déjà publique'; END IF;
   IF gid IS NOT NULL AND nullif(btrim(d.level_id),'') IS NOT NULL AND btrim(d.level_id)<>gid THEN
     RAISE EXCEPTION 'ID GD incompatible avec la fiche masquée'; END IF;
   IF EXISTS(SELECT 1 FROM public.demons
      WHERE id<>d.id AND lower(btrim(name))=lower(btrim(p_name)) AND is_public=true) THEN
      RAISE EXCEPTION 'Ce nom existe déjà dans la liste publique'; END IF;
   IF EXISTS(SELECT 1 FROM public.demons WHERE position=target_rank AND id<>d.id) THEN
      IF p_unrated THEN RAISE EXCEPTION 'Position UNRATED occupée'; END IF;
      PERFORM public.dlfr_make_room(target_rank);
   END IF;
   UPDATE public.demons SET
      position=target_rank, is_public=true,
      name=btrim(p_name), level_id=coalesce(gid,level_id),
      publisher=coalesce(nullif(btrim(p_publisher),''),publisher),
      creator=coalesce(nullif(btrim(p_creator),''),creator),
      verifier=coalesce(nullif(btrim(p_verifier),''),verifier),
      verifier_video_url=coalesce(vvideo,verifier_video_url),
      video_url=coalesce(vvideo,video_url), thumbnail_url=coalesce(thumbnail,thumbnail_url),
      requirement=p_requirement,
      unrated=p_unrated,unrated_position=CASE WHEN p_unrated THEN p_position ELSE NULL END,
      completion_mode=coalesce(p_completion_mode,completion_mode), data_source='manual'
    WHERE id=d.id RETURNING id INTO result_id;
 ELSE
   IF EXISTS(SELECT 1 FROM public.demons WHERE
     (lower(btrim(name))=lower(btrim(p_name)) OR
     (gid IS NOT NULL AND nullif(btrim(level_id),'')=gid))
     AND coalesce(completion_mode,'standard')=coalesce(p_completion_mode,'standard')) THEN
     RAISE EXCEPTION 'Fiche déjà présente en base (même ID GD ou nom). Réutilise la fiche masquée via le menu ; pour Solo/2P, vérifie la variante.';
   END IF;
   IF EXISTS(SELECT 1 FROM public.demons WHERE position=target_rank) THEN
      IF p_unrated THEN RAISE EXCEPTION 'Position UNRATED occupée'; END IF;
      PERFORM public.dlfr_make_room(target_rank);
   END IF;
   INSERT INTO public.demons
    (position,name,level_id,publisher,creator,verifier,verifier_video_url,video_url,
      thumbnail_url,unrated,unrated_position,requirement,completion_mode,data_source,is_public)
   VALUES(target_rank,btrim(p_name),gid,coalesce(p_publisher,''),p_creator,p_verifier,vvideo,
     vvideo,thumbnail,p_unrated,CASE WHEN p_unrated THEN p_position ELSE NULL END,p_requirement,coalesce(p_completion_mode,'standard'),'manual',true)
   RETURNING id INTO result_id;
 END IF;
 -- Une validation humaine est traçable sans réécrire des records existants.
 INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
 VALUES(auth.uid(),'MANUAL_LEVEL_PUBLISH',result_id::text,
        format('rang=%s; source=manual; depuis_fiche_cachee=%s',target_rank,coalesce(p_existing_demon_id::text,'non')));
 RETURN result_id;
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_manual_save_demon(text,text,integer,text,text,text,boolean,integer,bigint,text,text,text)
 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dlfr_manual_save_demon(text,text,integer,text,text,text,boolean,integer,bigint,text,text,text)
 TO authenticated;
COMMIT;

BEGIN;
CREATE OR REPLACE FUNCTION public.dlfr_manual_save_demon_with_players(
 p_name text, p_gd_level_id text, p_position integer,
 p_publisher text DEFAULT '', p_creator text DEFAULT NULL,
 p_verifier text DEFAULT NULL, p_unrated boolean DEFAULT false,
 p_requirement integer DEFAULT 100, p_existing_demon_id bigint DEFAULT NULL,
 p_verifier_video_url text DEFAULT NULL, p_thumbnail_url text DEFAULT NULL,
 p_completion_mode text DEFAULT NULL,
 p_publisher_player_key text DEFAULT NULL, p_verifier_player_key text DEFAULT NULL,
 p_new_publisher_name text DEFAULT NULL, p_new_verifier_name text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_pub text := nullif(btrim(p_publisher),'');
  v_ver text := nullif(btrim(p_verifier),'');
  v_key text;
  v_name text;
  v_id bigint;
BEGIN
  IF NOT public.dlfr_can_moderate() THEN RAISE EXCEPTION 'Accès modération refusé'; END IF;
  IF p_publisher_player_key='__new__' THEN
    v_name := nullif(btrim(p_new_publisher_name),'');
    IF v_name IS NULL OR length(v_name)>80 THEN RAISE EXCEPTION 'Pseudo du nouvel éditeur invalide'; END IF;
    v_key := trim(both '_' from regexp_replace(lower(v_name),'[^a-z0-9]+','_','g'));
    IF v_key='' THEN RAISE EXCEPTION 'Pseudo éditeur incompatible'; END IF;
    IF EXISTS (SELECT 1 FROM public.players WHERE player_key=v_key OR lower(username)=lower(v_name))
    THEN RAISE EXCEPTION 'Le joueur éditeur existe déjà : sélectionne-le dans la liste'; END IF;
    INSERT INTO public.players(player_key,username,display_name,has_account) VALUES(v_key,v_name,v_name,false);
    v_pub := v_name;
  ELSIF p_publisher_player_key IS NOT NULL AND p_publisher_player_key<>'' THEN
    SELECT username INTO v_pub FROM public.players WHERE player_key=p_publisher_player_key;
    IF v_pub IS NULL THEN RAISE EXCEPTION 'Joueur éditeur inconnu'; END IF;
  END IF;
  IF p_verifier_player_key='__new__' THEN
    v_name := nullif(btrim(p_new_verifier_name),'');
    IF v_name IS NULL OR length(v_name)>80 THEN RAISE EXCEPTION 'Pseudo du nouveau vérificateur invalide'; END IF;
    v_key := trim(both '_' from regexp_replace(lower(v_name),'[^a-z0-9]+','_','g'));
    IF v_key='' THEN RAISE EXCEPTION 'Pseudo vérificateur incompatible'; END IF;
    IF EXISTS (SELECT 1 FROM public.players WHERE player_key=v_key OR lower(username)=lower(v_name))
    THEN RAISE EXCEPTION 'Le joueur vérificateur existe déjà : sélectionne-le dans la liste'; END IF;
    INSERT INTO public.players(player_key,username,display_name,has_account) VALUES(v_key,v_name,v_name,false);
    v_ver := v_name;
  ELSIF p_verifier_player_key IS NOT NULL AND p_verifier_player_key<>'' THEN
    SELECT username INTO v_ver FROM public.players WHERE player_key=p_verifier_player_key;
    IF v_ver IS NULL THEN RAISE EXCEPTION 'Joueur vérificateur inconnu'; END IF;
  END IF;
  IF v_pub IS NULL THEN RAISE EXCEPTION 'Éditeur obligatoire'; END IF;
  -- L'appel ci-dessous est exécuté dans la même transaction que les éventuelles créations de joueurs.
  SELECT public.dlfr_manual_save_demon(
     p_name,p_gd_level_id,p_position,v_pub,p_creator,v_ver,p_unrated,
     p_requirement,p_existing_demon_id,p_verifier_video_url,p_thumbnail_url,p_completion_mode)
  INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_manual_save_demon_with_players(text,text,integer,text,text,text,boolean,integer,bigint,text,text,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_manual_save_demon_with_players(text,text,integer,text,text,text,boolean,integer,bigint,text,text,text,text,text,text,text) TO authenticated;
COMMIT;

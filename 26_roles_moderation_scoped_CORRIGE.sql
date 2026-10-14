-- DemonlistFrancophone - V3.2 - permissions et revue de completions existantes
-- Prerequis : migrations 11, 14, 19, 21. TESTER sur copie Supabase.
-- IMPORTANT : role editor historique = supermoderateur jusqu'a reattribution.
-- Aucun changement de donnees joueurs / niveaux / completions a l'installation.
BEGIN;

ALTER TABLE public.staff_roles DROP CONSTRAINT IF EXISTS staff_roles_role_check;
ALTER TABLE public.staff_roles ADD CONSTRAINT staff_roles_role_check
 CHECK(role IN ('helper','editor','owner','moderator','supermoderator'));

-- N'autoriser les droits historiques d'edition qu'aux supermodos / owners.
CREATE OR REPLACE FUNCTION public.dlfr_can_moderate()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.staff_roles s
   WHERE s.auth_user_id=auth.uid() AND s.role IN ('owner','editor','supermoderator'));
$$;
REVOKE ALL ON FUNCTION public.dlfr_can_moderate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_can_moderate() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_demonlist_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.staff_roles s
   WHERE s.auth_user_id=auth.uid() AND s.role IN ('owner','editor','supermoderator'));
$$;
REVOKE ALL ON FUNCTION public.is_demonlist_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_demonlist_staff() TO anon,authenticated;

-- Controle serveur des scopes : seulement records de niveau deja publie et Rated.
CREATE OR REPLACE FUNCTION public.dlfr_record_review_allowed(p_position integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_position BETWEEN 1 AND 99999998 AND (
  EXISTS (SELECT 1 FROM public.staff_roles s WHERE s.auth_user_id=auth.uid()
    AND s.role IN ('owner','editor','supermoderator','moderator'))
  OR (p_position > 150 AND EXISTS
     (SELECT 1 FROM public.nlw_staff_roles n WHERE n.auth_user_id=auth.uid()))
 );
$$;
REVOKE ALL ON FUNCTION public.dlfr_record_review_allowed(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_record_review_allowed(integer) TO authenticated;

-- Une correspondance incertaine (meme GD ID pour Solo/2P, noms dupliques)
-- n'est JAMAIS consideree comme une preuve suffisante pour accepter.
CREATE OR REPLACE FUNCTION public.dlfr_review_target(
 p_level_id text,p_level_name text
) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN count(*)=1 THEN min(d.id) ELSE NULL END
 FROM public.demons d
 WHERE d.is_public IS TRUE AND d.unrated IS NOT TRUE
   AND d.position BETWEEN 1 AND 99999998
   AND ((nullif(btrim(coalesce(p_level_id,'')),'') IS NOT NULL
         AND btrim(d.level_id)=btrim(p_level_id)
         AND lower(btrim(d.name))=lower(btrim(p_level_name)))
        OR (nullif(btrim(coalesce(p_level_id,'')),'') IS NULL
         AND lower(btrim(d.name))=lower(btrim(p_level_name))));
$$;
REVOKE ALL ON FUNCTION public.dlfr_review_target(text,text) FROM PUBLIC;
-- Pas d'EXECUTE direct au navigateur : fonction reservee aux autres fonctions SQL.

-- Liste des soumissions admises pour le role reel du visiteur.
CREATE OR REPLACE FUNCTION public.dlfr_pending_review_queue()
RETURNS TABLE(id bigint,level_name text,player text,progress integer,
 video_url text,"position" integer,demon_id bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s.id,s.level_name,s.player,s.progress,s.video_url,d.position,d.id
 FROM public.level_submissions s
 JOIN public.demons d ON d.id=public.dlfr_review_target(s.level_id,s.level_name)
 WHERE s.status='pending' AND s.progress=100
   AND public.dlfr_record_review_allowed(d.position)
 ORDER BY s.id ASC LIMIT 200;
$$;
REVOKE ALL ON FUNCTION public.dlfr_pending_review_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_pending_review_queue() TO authenticated;

-- Seule action permise aux modérateurs bornes : accepter/refuser une
-- completion 100% sur un niveau deja public, jamais creer un niveau,
-- changer son rang, traiter une soumission ambigue ou publier des news.
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
   p_key:=lower(btrim(coalesce(r.player,'')));
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

-- Le propriétaire peut attribuer un et un seul role effectif a la fois.
CREATE OR REPLACE FUNCTION public.dlfr_set_moderator(
 p_auth_user_id uuid,p_role text,p_enabled boolean DEFAULT true
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing_role text;
BEGIN
 IF NOT public.dlfr_is_owner() THEN RAISE EXCEPTION 'Reserve au proprietaire'; END IF;
 IF p_role NOT IN ('nlw','moderator','supermoderator','editor') THEN
   RAISE EXCEPTION 'Role invalide'; END IF;
 IF p_auth_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_auth_user_id) THEN
   RAISE EXCEPTION 'Compte Auth introuvable : connexion Discord requise'; END IF;
 IF p_auth_user_id=auth.uid() THEN RAISE EXCEPTION 'Ne modifie pas ton propre role'; END IF;
 PERFORM pg_advisory_xact_lock(41028,1);
 SELECT role INTO existing_role FROM public.staff_roles WHERE auth_user_id=p_auth_user_id FOR UPDATE;
 IF existing_role='owner' THEN RAISE EXCEPTION 'Un proprietaire ne peut etre modifie'; END IF;
 IF p_enabled THEN
   IF p_role='nlw' THEN
     DELETE FROM public.staff_roles WHERE auth_user_id=p_auth_user_id AND role<>'owner';
     INSERT INTO public.nlw_staff_roles(auth_user_id) VALUES(p_auth_user_id)
       ON CONFLICT(auth_user_id) DO NOTHING;
   ELSE
     DELETE FROM public.nlw_staff_roles WHERE auth_user_id=p_auth_user_id;
     INSERT INTO public.staff_roles(auth_user_id,role) VALUES(p_auth_user_id,p_role)
       ON CONFLICT(auth_user_id) DO UPDATE SET role=excluded.role;
   END IF;
 ELSE
   IF p_role='nlw' THEN
      DELETE FROM public.nlw_staff_roles WHERE auth_user_id=p_auth_user_id;
   ELSE
      DELETE FROM public.staff_roles WHERE auth_user_id=p_auth_user_id AND role=p_role;
   END IF;
 END IF;
 INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
 VALUES(auth.uid(),CASE WHEN p_enabled THEN 'GRANT_MODERATOR' ELSE 'REVOKE_MODERATOR' END,
        p_auth_user_id::text,p_role);
 RETURN CASE WHEN p_enabled THEN 'added' ELSE 'removed' END;
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_set_moderator(uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_set_moderator(uuid,text,boolean) TO authenticated;

-- L'annuaire public mentionne les deux nouveaux roles. Aucune donnee Auth exposee.
CREATE OR REPLACE FUNCTION public.dlfr_public_staff_directory()
RETURNS TABLE(display_name text,country_code text,team text,role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(nullif(btrim(p.display_name),''),nullif(btrim(p.username),''),
                 nullif(btrim(u.raw_user_meta_data->>'global_name'),''),
                 nullif(btrim(u.raw_user_meta_data->>'full_name'),''),
                 nullif(btrim(u.raw_user_meta_data->>'username'),''),'Modérateur')::text,
        p.country_code::text,'general'::text,s.role::text
 FROM public.staff_roles s JOIN auth.users u ON u.id=s.auth_user_id
 LEFT JOIN public.player_profile_owners o ON o.auth_user_id=s.auth_user_id
 LEFT JOIN public.players p ON p.player_key=o.player_key
 WHERE s.role IN ('owner','editor','supermoderator','moderator')
 UNION ALL
 SELECT coalesce(nullif(btrim(p.display_name),''),nullif(btrim(p.username),''),
                 nullif(btrim(u.raw_user_meta_data->>'global_name'),''),
                 nullif(btrim(u.raw_user_meta_data->>'full_name'),''),
                 nullif(btrim(u.raw_user_meta_data->>'username'),''),'Modérateur NLW')::text,
        p.country_code::text,'nlw'::text,'nlw'::text
 FROM public.nlw_staff_roles s JOIN auth.users u ON u.id=s.auth_user_id
 LEFT JOIN public.player_profile_owners o ON o.auth_user_id=s.auth_user_id
 LEFT JOIN public.players p ON p.player_key=o.player_key;
$$;
REVOKE ALL ON FUNCTION public.dlfr_public_staff_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_public_staff_directory() TO anon,authenticated;
COMMIT;

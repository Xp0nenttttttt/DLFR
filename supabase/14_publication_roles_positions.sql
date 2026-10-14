-- DLFR V3.0.4 -- additive; apply AFTER 01, 10 (global AREDL staging), 11, 12, 13.
-- Backup DB first. Nothing in this migration imports/publicly publishes records automatically.
BEGIN;

-- Owner-only administration of REAL Supabase Auth roles. Pseudo alone never grants access.
-- Remove the old broad editor policy on NLW team membership.
-- Only the owner-controlled RPC below may modify role assignments.
DROP POLICY IF EXISTS dlfr_staff_write ON public.nlw_staff_roles;
REVOKE INSERT, UPDATE, DELETE ON public.nlw_staff_roles FROM authenticated;
CREATE OR REPLACE FUNCTION public.dlfr_is_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.staff_roles s
                 WHERE s.auth_user_id=auth.uid() AND s.role='owner');
$$;
REVOKE ALL ON FUNCTION public.dlfr_is_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_is_owner() TO authenticated;
DROP POLICY IF EXISTS dlfr_staff_owner_directory ON public.staff_roles;
CREATE POLICY dlfr_staff_owner_directory ON public.staff_roles
  FOR SELECT TO authenticated USING ((SELECT public.dlfr_is_owner()));
DROP POLICY IF EXISTS dlfr_nlw_owner_directory ON public.nlw_staff_roles;
CREATE POLICY dlfr_nlw_owner_directory ON public.nlw_staff_roles
  FOR SELECT TO authenticated USING ((SELECT public.dlfr_is_owner()));

CREATE OR REPLACE FUNCTION public.dlfr_set_moderator(p_auth_user_id uuid,p_role text,p_enabled boolean DEFAULT true)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE existing_role text;
BEGIN
  IF NOT public.dlfr_is_owner() THEN RAISE EXCEPTION 'Réservé au propriétaire'; END IF;
  IF p_role NOT IN ('editor','nlw') THEN RAISE EXCEPTION 'Rôle invalide'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_auth_user_id) THEN RAISE EXCEPTION 'Compte Supabase Auth introuvable : connexion Discord requise'; END IF;
  IF p_auth_user_id=auth.uid() THEN RAISE EXCEPTION 'Ne modifie pas ton propre rôle par ce formulaire'; END IF;
  PERFORM pg_advisory_xact_lock(41028, 1);
  SELECT role INTO existing_role FROM public.staff_roles WHERE auth_user_id=p_auth_user_id FOR UPDATE;
  IF existing_role='owner' THEN RAISE EXCEPTION 'Impossible de modifier un autre propriétaire'; END IF;
  IF p_enabled THEN
    IF p_role='editor' THEN
      INSERT INTO public.staff_roles(auth_user_id,role) VALUES(p_auth_user_id,'editor')
        ON CONFLICT(auth_user_id) DO UPDATE SET role='editor';
      DELETE FROM public.nlw_staff_roles WHERE auth_user_id=p_auth_user_id;
    ELSE
      -- NLW: separate role, not a general editor. Never grant full moderator rights.
      DELETE FROM public.staff_roles WHERE auth_user_id=p_auth_user_id AND role IN ('editor','helper');
      INSERT INTO public.nlw_staff_roles(auth_user_id) VALUES(p_auth_user_id) ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    IF p_role='editor' THEN
      DELETE FROM public.staff_roles WHERE auth_user_id=p_auth_user_id AND role='editor';
    ELSE
      DELETE FROM public.nlw_staff_roles WHERE auth_user_id=p_auth_user_id;
    END IF;
  END IF;
  INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
    VALUES(auth.uid(),CASE WHEN p_enabled THEN 'GRANT_MODERATOR' ELSE 'REVOKE_MODERATOR' END,
           p_auth_user_id::text, p_role);
  RETURN CASE WHEN p_enabled THEN 'added' ELSE 'removed' END;
END $$;
REVOKE ALL ON FUNCTION public.dlfr_set_moderator(uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_set_moderator(uuid,text,boolean) TO authenticated;

-- Rank shifts are private helpers used only inside checked RPC transactions.
-- Rated ranks are 1..99,999,999; UNRATED keeps its existing 100,000,000+ namespace.
CREATE OR REPLACE FUNCTION public.dlfr_make_room(p_rank integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE x record;
BEGIN
  IF p_rank IS NULL OR p_rank<1 OR p_rank>=99999999 THEN RAISE EXCEPTION 'Position Rated invalide'; END IF;
  FOR x IN SELECT id,position FROM public.demons
           WHERE position>=p_rank AND position<100000000 ORDER BY position DESC LOOP
    UPDATE public.demons SET position=x.position+1 WHERE id=x.id;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.dlfr_make_room(integer) FROM PUBLIC;

-- Direct moderation: insert new level at chosen position, shifting the following Rated levels.
CREATE OR REPLACE FUNCTION public.dlfr_create_ranked_demon(
  p_name text,p_gd_level_id text,p_position integer,p_publisher text DEFAULT '',
  p_creator text DEFAULT NULL,p_verifier text DEFAULT NULL,p_unrated boolean DEFAULT false,
  p_shift boolean DEFAULT true,p_requirement integer DEFAULT 100)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE k bigint; target integer;
BEGIN
  IF NOT public.dlfr_can_moderate() THEN RAISE EXCEPTION 'Modérateur général requis'; END IF;
  IF p_name IS NULL OR length(trim(p_name))<1 OR length(trim(p_name))>120 THEN RAISE EXCEPTION 'Nom invalide'; END IF;
  IF p_position IS NULL OR p_position<1 OR p_position>=99999999 THEN RAISE EXCEPTION 'Position invalide'; END IF;
  IF p_requirement NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Pourcentage invalide'; END IF;
  PERFORM pg_advisory_xact_lock(41028,2);
  IF EXISTS(SELECT 1 FROM public.demons WHERE lower(trim(name))=lower(trim(p_name)) OR
    (nullif(trim(p_gd_level_id),'') IS NOT NULL AND trim(level_id)=trim(p_gd_level_id))) THEN
    RAISE EXCEPTION 'Niveau existant : modifier la fiche plutôt que la recréer';
  END IF;
  target=CASE WHEN p_unrated THEN 100000000+p_position ELSE p_position END;
  IF p_unrated THEN
    IF EXISTS(SELECT 1 FROM public.demons WHERE position=target) THEN RAISE EXCEPTION 'Position UNRATED occupée'; END IF;
  ELSIF EXISTS(SELECT 1 FROM public.demons WHERE position=target) THEN
    IF NOT p_shift THEN RAISE EXCEPTION 'Position occupée : coche Décaler les niveaux suivants'; END IF;
    PERFORM public.dlfr_make_room(target);
  END IF;
  INSERT INTO public.demons(position,name,level_id,publisher,creator,verifier,unrated,unrated_position,requirement,data_source)
  VALUES(target,trim(p_name),nullif(trim(p_gd_level_id),''),coalesce(p_publisher,''),p_creator,p_verifier,
         p_unrated,CASE WHEN p_unrated THEN p_position ELSE NULL END,p_requirement,'manual') RETURNING id INTO k;
  RETURN k;
END $$;
REVOKE ALL ON FUNCTION public.dlfr_create_ranked_demon(text,text,integer,text,text,text,boolean,boolean,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_create_ranked_demon(text,text,integer,text,text,text,boolean,boolean,integer) TO authenticated;

-- Staging is NOT public and may be seen only by full moderators.
-- The optional 10_aredl_level_stage_OPTIONNEL.sql must be run before this patch.
GRANT SELECT ON public.dlfr_aredl_level_stage TO authenticated;
DROP POLICY IF EXISTS dlfr_staging_full_mods_read ON public.dlfr_aredl_level_stage;
CREATE POLICY dlfr_staging_full_mods_read ON public.dlfr_aredl_level_stage
  FOR SELECT TO authenticated USING ((SELECT public.dlfr_can_moderate()));

-- Explicit one-level publication from reviewed staging; never creates players/records.
-- Existing manual levels keep position, name, verifier and videos; blank metadata can be enriched.
CREATE OR REPLACE FUNCTION public.dlfr_publish_staged_aredl(
 p_gd_level_id text,p_position integer DEFAULT NULL,p_shift boolean DEFAULT false)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.dlfr_aredl_level_stage%ROWTYPE; match_gd bigint; match_aredl bigint;
        k bigint; target integer; v jsonb; observed jsonb; vv text; vt text; vn text;
BEGIN
 IF NOT public.dlfr_can_moderate() THEN RAISE EXCEPTION 'Modérateur général requis'; END IF;
 PERFORM pg_advisory_xact_lock(41028,2);
 SELECT * INTO s FROM public.dlfr_aredl_level_stage WHERE gd_level_id=p_gd_level_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Niveau absent de la table d’attente'; END IF;
 IF s.review_state IN ('rejected','conflict') OR s.manually_locked THEN
   RAISE EXCEPTION 'Fiche bloquée : intervention manuelle requise';
 END IF;
 IF s.aredl_id IS NULL OR s.aredl_name IS NULL THEN RAISE EXCEPTION 'Identité AREDL incomplète'; END IF;
 SELECT id INTO match_gd FROM public.demons WHERE trim(level_id)=s.gd_level_id LIMIT 1;
 SELECT id INTO match_aredl FROM public.demons WHERE aredl_id=s.aredl_id LIMIT 1;
 IF match_gd IS NOT NULL AND match_aredl IS NOT NULL AND match_gd<>match_aredl THEN
   RAISE EXCEPTION 'Conflit : ID GD et ID AREDL désignent des niveaux différents';
 END IF;
 k=coalesce(match_gd,match_aredl);
 IF k IS NOT NULL AND EXISTS(SELECT 1 FROM public.demons WHERE id=k AND
     nullif(trim(level_id),'') IS NOT NULL AND trim(level_id)<>s.gd_level_id) THEN
   RAISE EXCEPTION 'Conflit ID Geometry Dash, rapprocher manuellement';
 END IF;
 IF k IS NULL AND EXISTS(SELECT 1 FROM public.demons WHERE lower(trim(name))=lower(trim(s.aredl_name))) THEN
   RAISE EXCEPTION 'Nom déjà utilisé avec un autre ID GD : vérifier avant publication';
 END IF;
 IF s.evidence_state='complete' THEN
   SELECT elem INTO v FROM jsonb_array_elements(s.verifiers_fr_be) AS elem
    WHERE elem->'player'->>'country' IN ('FR','BE') LIMIT 1;
   IF coalesce(v,'{}'::jsonb)<>'{}'::jsonb THEN
     vn=v->'player'->>'name'; vv=v->>'video_url'; vt=v->>'thumbnail_url';
   END IF;
   observed=CASE WHEN s.first_observed_fr_be->>'status'='first_dated_record'
                 THEN s.first_observed_fr_be ELSE '{}'::jsonb END;
 ELSE
   observed='{}'::jsonb;
 END IF;
 IF k IS NULL THEN
   target=coalesce(p_position,s.aredl_rank);
   IF target IS NULL OR target<1 OR target>=99999999 THEN RAISE EXCEPTION 'Position hors limites'; END IF;
   IF EXISTS(SELECT 1 FROM public.demons WHERE position=target) THEN
     IF NOT p_shift THEN RAISE EXCEPTION 'Rang DLFR #% déjà occupé : cocher Décaler les suivants pour insérer',target; END IF;
     PERFORM public.dlfr_make_room(target);
   END IF;
   INSERT INTO public.demons(position,name,level_id,aredl_id,aredl_rank,publisher,
      verifier,verifier_video_url,video_url,thumbnail_url,first_frbe_player,first_frbe_video_url,
      first_frbe_achieved_at,data_source)
   VALUES(target,s.aredl_name,s.gd_level_id,s.aredl_id,s.aredl_rank,'AREDL',
      vn,nullif(vv,''),nullif(vv,''),nullif(vt,''),observed->'player'->>'name',
      nullif(observed->>'video_url',''),
      CASE WHEN observed->>'completed_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN (observed->>'completed_at')::timestamptz ELSE NULL END,
      'aredl') RETURNING id INTO k;
 ELSE
   -- A manual DLFR decision takes precedence; ONLY enrich blanks and AREDL metadata.
   UPDATE public.demons d SET
     level_id=coalesce(nullif(trim(d.level_id),''),s.gd_level_id),
     aredl_id=s.aredl_id, aredl_rank=s.aredl_rank,
     verifier=coalesce(nullif(trim(d.verifier),''),vn),
     verifier_video_url=coalesce(nullif(trim(d.verifier_video_url),''),nullif(vv,'')),
     video_url=coalesce(nullif(trim(d.video_url),''),nullif(vv,'')),
     thumbnail_url=coalesce(nullif(trim(d.thumbnail_url),''),nullif(vt,'')),
     first_frbe_player=coalesce(nullif(trim(d.first_frbe_player),''),observed->'player'->>'name'),
     first_frbe_video_url=coalesce(nullif(trim(d.first_frbe_video_url),''),nullif(observed->>'video_url','')),
     first_frbe_achieved_at=coalesce(d.first_frbe_achieved_at,
        CASE WHEN observed->>'completed_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN (observed->>'completed_at')::timestamptz ELSE NULL END)
   WHERE d.id=k;
 END IF;
 UPDATE public.dlfr_aredl_level_stage SET review_state='approved',updated_at=now()
   WHERE gd_level_id=s.gd_level_id;
 INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
 VALUES(auth.uid(),'PUBLISH_AREDL',s.gd_level_id,
        format('dlfr_id=%s, ar=%s, requested_rank=%s, actual_rank_preserved_if_existing',k,s.aredl_rank,p_position));
 RETURN k;
END $$;
REVOKE ALL ON FUNCTION public.dlfr_publish_staged_aredl(text,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_publish_staged_aredl(text,integer,boolean) TO authenticated;

-- A later AREDL refresh updates ONLY the separate aredl_rank and empty proof fields.
-- It NEVER moves demons.position, unpublishes manual entries, or creates duplicates.
-- Automatic ingest into staging remains a separate scheduled workflow requiring server secrets.
-- Accepting an existing level does not change its position. New Rated submissions shift following ranks.
create or replace function public.dlfr_review_submission(p_request_id bigint,p_approve boolean,p_unrated boolean default false,p_position integer default null)
returns text language plpgsql security definer set search_path='' as $$
declare r public.level_submissions%rowtype; d_id bigint; p_key text; target_position integer;
begin
 if not public.dlfr_can_moderate() then raise exception 'Modérateur requis'; end if;
 PERFORM pg_advisory_xact_lock(41028,2);
 select * into r from public.level_submissions where id=p_request_id for update;
 if not found or r.status<>'pending' then raise exception 'Soumission déjà traitée ou introuvable'; end if;
 if not p_approve then
   update public.level_submissions set status='rejected',reviewed_by=auth.uid(),reviewed_at=now() where id=r.id;
   return 'rejected';
 end if;
 p_key=lower(trim(r.player));
 select id into d_id from public.demons where nullif(trim(level_id),'')=nullif(trim(r.level_id),'') and nullif(trim(r.level_id),'') is not null limit 1;
 if d_id is null then
   if nullif(trim(r.level_id),'') is not null and exists(
     select 1 from public.demons where lower(name)=lower(trim(r.level_name))
       and nullif(trim(level_id),'') is not null and trim(level_id)<>trim(r.level_id)
   ) then raise exception 'Conflit entre nom et ID Geometry Dash : contrôle manuel requis'; end if;
   select id into d_id from public.demons
   where lower(name)=lower(trim(r.level_name))
     and (nullif(trim(r.level_id),'') is null or nullif(trim(level_id),'') is null)
   limit 1;
   if d_id is not null and nullif(trim(r.level_id),'') is not null then
     update public.demons set level_id=trim(r.level_id) where id=d_id and (level_id is null or trim(level_id)='');
   end if;
 end if;
 if d_id is null then
   if p_position is null or p_position<1 or p_position>=99999999 then raise exception 'Indique un rang valide pour le nouveau niveau'; end if;
   target_position=case when p_unrated then 100000000+p_position else p_position end;
   if exists(select 1 from public.demons where position=target_position) then
     if p_unrated then raise exception 'Position UNRATED occupée : choisir un rang libre'; end if;
     PERFORM public.dlfr_make_room(target_position);
   end if;
   insert into public.demons(position,name,level_id,publisher,creator,verifier,unrated,unrated_position,video_url)
   values(target_position,trim(r.level_name),nullif(trim(r.level_id),''),coalesce(nullif(trim(r.publisher),''),'Inconnu'),r.creator,r.verifier,p_unrated,case when p_unrated then p_position else null end,r.video_url)
   returning id into d_id;
 end if;
 if not exists(select 1 from public.players where player_key=p_key) then
    insert into public.players(player_key,username,display_name,has_account,country_code)
    values(p_key,trim(r.player),trim(r.player),false,null);
 end if;
 update public.completions set progress=greatest(progress,r.progress),
    video_url=coalesce(nullif(video_url,''),r.video_url)
 where demon_id=d_id and lower(trim(player))=p_key;
 if not found then
   insert into public.completions(demon_id,player,progress,video_url)
   values(d_id,p_key,r.progress,r.video_url);
 end if;
 update public.level_submissions set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),demon_id=d_id where id=r.id;
 return 'approved';
end $$;
revoke all on function public.dlfr_review_submission(bigint,boolean,boolean,integer) from public;
grant execute on function public.dlfr_review_submission(bigint,boolean,boolean,integer) to authenticated;
COMMIT;

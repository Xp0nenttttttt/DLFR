-- DLFR correctif NLW : exécuter après 28_credits_et_homologation_nlw.sql.
-- Ne publie aucune fiche à l'installation. Rapprochement UNIQUE contrôlé à la publication.
-- Faire une sauvegarde Supabase et tester sur copie avant déploiement.
BEGIN;
CREATE OR REPLACE FUNCTION public.dlfr_publish_historic_nlw(
 p_legacy_id bigint, p_position integer
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d public.demons%ROWTYPE; old_level dlfr_legacy.levels%ROWTYPE;
        linked_id bigint; gid text; matches integer;
BEGIN
 IF NOT public.dlfr_can_moderate() THEN RAISE EXCEPTION 'Supermodérateur requis'; END IF;
 IF p_legacy_id IS NULL OR p_position IS NULL OR p_position NOT BETWEEN 151 AND 99999998 THEN
   RAISE EXCEPTION 'Niveau historique ou rang NLW invalide'; END IF;
 PERFORM pg_advisory_xact_lock(41028,2);
 SELECT * INTO old_level FROM dlfr_legacy.levels WHERE legacy_id=p_legacy_id AND old_position>150;
 IF NOT FOUND THEN RAISE EXCEPTION 'Niveau absent de la sauvegarde hors Top 150'; END IF;
 SELECT demon_id INTO linked_id FROM dlfr_legacy.level_links WHERE legacy_id=p_legacy_id;
 IF linked_id IS NULL THEN
   -- Rapprochement strict : identifiant GD prioritaire; par nom seulement si aucun ID historique.
   gid:=nullif(btrim(old_level.level_id),'');
   SELECT count(*), min(id) INTO matches, linked_id
   FROM public.demons x
   WHERE x.is_public IS FALSE AND x.unrated IS NOT TRUE
     AND ((gid IS NOT NULL AND btrim(coalesce(x.level_id,''))=gid)
       OR (gid IS NULL AND lower(btrim(x.name))=lower(btrim(old_level.name))));
   IF matches <> 1 THEN
     RAISE EXCEPTION 'Rapprochement impossible : % fiches candidates. Vérifier l’ID GD et la correspondance historique.', matches;
   END IF;
   IF EXISTS (SELECT 1 FROM dlfr_legacy.level_links l WHERE l.demon_id=linked_id) THEN
     RAISE EXCEPTION 'Fiche déjà liée à une autre archive : intervention manuelle requise';
   END IF;
   INSERT INTO dlfr_legacy.level_links(legacy_id,demon_id,mapping_source)
   VALUES(p_legacy_id,linked_id,'unique_gd_id_review');
 END IF;
 SELECT * INTO d FROM public.demons WHERE id=linked_id FOR UPDATE;
 IF NOT FOUND OR d.is_public IS TRUE THEN
   RAISE EXCEPTION 'Niveau introuvable ou déjà publié : aucune création de doublon'; END IF;
 IF d.unrated IS TRUE THEN RAISE EXCEPTION 'Niveau UNRATED : homologation NLW interdite'; END IF;
 gid:=nullif(btrim(old_level.level_id),'');
 IF gid IS NOT NULL AND nullif(btrim(d.level_id),'') IS NOT NULL AND gid<>btrim(d.level_id) THEN
   RAISE EXCEPTION 'ID Geometry Dash contradictoire avec la sauvegarde'; END IF;
 IF lower(btrim(d.name))<>lower(btrim(old_level.name)) THEN
   RAISE EXCEPTION 'Nom de niveau différent : vérifier le rapprochement manuel'; END IF;
 IF EXISTS(SELECT 1 FROM public.demons x WHERE x.id<>d.id AND x.position=p_position) THEN
   RAISE EXCEPTION 'Rang NLW déjà occupé, choisis une autre position'; END IF;
 IF EXISTS(SELECT 1 FROM public.demons x WHERE x.id<>d.id AND x.is_public IS TRUE AND
    (lower(btrim(x.name))=lower(btrim(d.name)) OR
     (gid IS NOT NULL AND nullif(btrim(x.level_id),'')=gid))) THEN
   RAISE EXCEPTION 'Un niveau public portant ce nom ou ID GD existe déjà'; END IF;
 UPDATE public.demons SET position=p_position,is_public=true,unrated=false,
   unrated_position=NULL,
   creator=CASE WHEN lower(btrim(coalesce(creator,''))) IN ('','aredl')
     THEN coalesce(nullif(btrim(old_level.source->>'creator'),''),creator) ELSE creator END,
   publisher=CASE WHEN lower(btrim(coalesce(publisher,''))) IN ('','aredl')
     THEN coalesce(nullif(btrim(old_level.source->>'publisher'),''),'À renseigner') ELSE publisher END,
   data_source='manual'
 WHERE id=d.id;
 UPDATE public.dlfr_level_archive_log SET restored_at=now(),restored_by=auth.uid(),
    restored_position=p_position WHERE demon_id=d.id AND restored_at IS NULL;
 INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
 VALUES(auth.uid(),'PUBLISH_HISTORIC_NLW',d.id::text,
   format('legacy_id=%s;ancien_rang=%s;nouveau_rang=%s;records_conserves',p_legacy_id,old_level.old_position,p_position));
 RETURN d.id;
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_publish_historic_nlw(bigint,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_publish_historic_nlw(bigint,integer) TO authenticated;
COMMIT;

-- DLFR V3.2 - Correctif crédits des niveaux et homologation NLW historique
-- Pré-requis : 01_staging_prive, 02_charger_dump, 04_correspondances_exactes,
-- 05_import_sans_ecrasement, 11_production, 22_manual_level_creation, rôles 26.
-- Ne modifie aucun niveau, record, rang ni attribution de badge à l'installation.
-- IMPORTANT : tester sur une copie et sauvegarder avant d'exécuter.
BEGIN;

-- Editer seulement créateur / publieur, jamais le rang ou les records.
CREATE OR REPLACE FUNCTION public.dlfr_update_level_credits(
 p_demon_id bigint, p_creator text, p_publisher text
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE item public.demons%ROWTYPE;
BEGIN
 IF NOT public.dlfr_can_moderate() THEN RAISE EXCEPTION 'Supermodérateur requis'; END IF;
 IF p_demon_id IS NULL OR p_publisher IS NULL OR btrim(p_publisher)='' THEN
  RAISE EXCEPTION 'Niveau et publieur requis'; END IF;
 IF char_length(p_publisher)>200 OR char_length(coalesce(p_creator,''))>200 THEN
  RAISE EXCEPTION 'Crédits trop longs (200 caractères maximum)'; END IF;
 SELECT * INTO item FROM public.demons WHERE id=p_demon_id AND is_public IS TRUE FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fiche publique introuvable'; END IF;
 UPDATE public.demons SET creator=nullif(btrim(p_creator),''),publisher=btrim(p_publisher)
 WHERE id=p_demon_id;
 INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
 VALUES(auth.uid(),'EDIT_LEVEL_CREDITS',p_demon_id::text,
    left(format('creator=%s;publisher=%s',coalesce(p_creator,''),p_publisher),500));
 RETURN p_demon_id;
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_update_level_credits(bigint,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_update_level_credits(bigint,text,text) TO authenticated;

-- Restaurer depuis la sauvegarde UNIQUEMENT les champs vides ou AREDL.
-- Correspondance déjà approuvée via dlfr_legacy.level_links ; sinon refuser.
CREATE OR REPLACE FUNCTION public.dlfr_restore_legacy_credits(
 p_demon_id bigint
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE item public.demons%ROWTYPE; source_credits jsonb; old_name text; old_publisher text;
BEGIN
 IF NOT public.dlfr_can_moderate() THEN RAISE EXCEPTION 'Supermodérateur requis'; END IF;
 SELECT * INTO item FROM public.demons WHERE id=p_demon_id AND is_public IS TRUE FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fiche publique introuvable'; END IF;
 SELECT l.source INTO source_credits FROM dlfr_legacy.level_links m
  JOIN dlfr_legacy.levels l ON l.legacy_id=m.legacy_id
  WHERE m.demon_id=p_demon_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aucune correspondance historique vérifiée pour ce niveau'; END IF;
 old_name:=nullif(btrim(source_credits->>'creator'),'');
 old_publisher:=nullif(btrim(source_credits->>'publisher'),'');
 IF old_name IS NULL AND old_publisher IS NULL THEN
  RAISE EXCEPTION 'Pas de crédits historiques exploitables'; END IF;
 UPDATE public.demons SET
  creator=CASE WHEN lower(btrim(coalesce(creator,''))) IN ('','aredl')
    THEN coalesce(old_name,creator) ELSE creator END,
  publisher=CASE WHEN lower(btrim(coalesce(publisher,''))) IN ('','aredl')
    THEN coalesce(old_publisher,publisher) ELSE publisher END
 WHERE id=p_demon_id;
 INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
 VALUES(auth.uid(),'RESTORE_LEVEL_CREDITS',p_demon_id::text,'Correspondance dlfr_legacy; conservation des champs manuels');
 RETURN p_demon_id;
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_restore_legacy_credits(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_restore_legacy_credits(bigint) TO authenticated;

-- Un ancien niveau n'obtient des points NLW que lors de cette HOMOLOGATION
-- explicite. La fonction ne crée pas de records et ne décale aucun rang.
CREATE OR REPLACE FUNCTION public.dlfr_publish_historic_nlw(
 p_legacy_id bigint, p_position integer
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d public.demons%ROWTYPE; old_level dlfr_legacy.levels%ROWTYPE;
        linked_id bigint; gid text;
BEGIN
 IF NOT public.dlfr_can_moderate() THEN RAISE EXCEPTION 'Supermodérateur requis'; END IF;
 IF p_legacy_id IS NULL OR p_position IS NULL OR p_position NOT BETWEEN 151 AND 99999998 THEN
   RAISE EXCEPTION 'Niveau historique ou rang NLW invalide'; END IF;
 PERFORM pg_advisory_xact_lock(41028,2);
 SELECT * INTO old_level FROM dlfr_legacy.levels WHERE legacy_id=p_legacy_id AND old_position>150;
 IF NOT FOUND THEN RAISE EXCEPTION 'Niveau absent de la sauvegarde hors Top 150'; END IF;
 SELECT demon_id INTO linked_id FROM dlfr_legacy.level_links WHERE legacy_id=p_legacy_id;
 IF linked_id IS NULL THEN RAISE EXCEPTION 'Fiche non rapprochée : faire vérifier le lien ancien / Supabase avant publication'; END IF;
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
     THEN coalesce(nullif(btrim(old_level.source->>'publisher'),''),publisher) ELSE publisher END,
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

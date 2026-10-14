-- DLFR V3.0.5 : catalogue AREDL complet, import par lots réexécutable.
-- PRÉREQUIS : 01_schema, 10_aredl_level_stage_OPTIONNEL, 11_production,
-- 12_clan_actions, 13_self_signup_discord, 14_publication_roles_positions.
-- Sauvegarder demons + staging avant installation ; exécuter dans SQL Editor Supabase.
-- Cette RPC est uniquement disponible au rôle SERVEUR service_role (jamais aux visiteurs).

CREATE OR REPLACE FUNCTION public.dlfr_aredl_catalog_batch(p_rows jsonb, p_publish boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  x jsonb; gid text; aid text; title text; r integer;
  previous public.dlfr_aredl_level_stage%ROWTYPE;
  existing_gd bigint; existing_ar bigint; existing_title bigint; occupied bigint;
  target bigint; counted jsonb := '[]'::jsonb;
  staged_count integer := 0; created_count integer := 0;
  matched_count integer := 0; conflict_count integer := 0; skipped_count integer := 0;
  why text; video_ver text; video_thumb text; name_ver text; v jsonb; first_record jsonb;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 100 THEN
     RAISE EXCEPTION 'Envoi attendu : tableau JSON de 1 à 100 niveaux';
  END IF;
  -- Compatible avec les insertions manuelles V3.0.4 qui utilisent ce verrou.
  PERFORM pg_advisory_xact_lock(41028, 2);

  FOR x IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    gid := btrim(coalesce(x->>'gd_level_id',''));
    aid := btrim(coalesce(x->>'aredl_id',''));
    title := btrim(coalesce(x->>'aredl_name',''));
    IF gid !~ '^[1-9][0-9]*$' OR aid='' OR char_length(aid)>120
       OR title='' OR char_length(title)>120 OR (x->>'aredl_rank') !~ '^[1-9][0-9]*$' THEN
       skipped_count := skipped_count+1;
       counted := counted || jsonb_build_array(jsonb_build_object('gd_level_id',gid,'reason','champs invalides'));
       CONTINUE;
    END IF;
    r := (x->>'aredl_rank')::integer;
    IF r >= 100000000 THEN
       skipped_count:=skipped_count+1;
       CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.dlfr_aredl_level_stage s WHERE s.aredl_id=aid AND s.gd_level_id<>gid)
       OR EXISTS (SELECT 1 FROM public.dlfr_aredl_level_stage s WHERE s.gd_level_id=gid AND s.aredl_id<>aid) THEN
       conflict_count:=conflict_count+1;
       counted := counted || jsonb_build_array(jsonb_build_object('gd_level_id',gid,'reason','ID AREDL et ID GD contradictoires en staging'));
       CONTINUE;
    END IF;
    INSERT INTO public.dlfr_aredl_level_stage
     (gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,source_payload,evidence_state)
    VALUES (gid,aid,r,title,'GLOBAL_CATALOG',jsonb_build_object('catalog_rank',r),'not_scanned')
    ON CONFLICT (gd_level_id) DO UPDATE SET
       aredl_rank=EXCLUDED.aredl_rank,
       aredl_name=EXCLUDED.aredl_name,
       source_payload=public.dlfr_aredl_level_stage.source_payload || jsonb_build_object('catalog_rank',EXCLUDED.aredl_rank),
       updated_at=now()
    WHERE public.dlfr_aredl_level_stage.manually_locked=false;
    SELECT * INTO previous FROM public.dlfr_aredl_level_stage WHERE gd_level_id=gid FOR UPDATE;
    staged_count:=staged_count+1;
    IF NOT p_publish THEN CONTINUE; END IF;
    IF previous.manually_locked OR previous.review_state IN ('rejected','conflict') THEN
       skipped_count:=skipped_count+1;
       CONTINUE;
    END IF;

    SELECT d.id INTO existing_gd FROM public.demons d WHERE btrim(d.level_id)=gid LIMIT 1;
    SELECT d.id INTO existing_ar FROM public.demons d WHERE d.aredl_id=aid LIMIT 1;
    IF (existing_gd IS NOT NULL AND existing_ar IS NOT NULL AND existing_gd<>existing_ar)
       OR (existing_ar IS NOT NULL AND EXISTS (SELECT 1 FROM public.demons WHERE id=existing_ar AND
                 nullif(btrim(level_id),'') IS NOT NULL AND btrim(level_id)<>gid)) THEN
       why:='identifiants GD / AREDL incompatibles avec une fiche DLFR';
    ELSE
       why:=NULL;
    END IF;
    IF why IS NULL AND coalesce(existing_gd,existing_ar) IS NULL THEN
      SELECT d.id INTO existing_title FROM public.demons d WHERE lower(btrim(d.name))=lower(title) LIMIT 1;
      SELECT d.id INTO occupied FROM public.demons d WHERE d.position=r LIMIT 1;
      IF existing_title IS NOT NULL THEN why:='nom déjà utilisé par une fiche non rapprochée';
      ELSIF occupied IS NOT NULL THEN why:='rang DLFR déjà occupé : placement manuel nécessaire';
      END IF;
    END IF;

    IF why IS NOT NULL THEN
       UPDATE public.dlfr_aredl_level_stage SET review_state='conflict',
              manual_note=coalesce(manual_note,why),updated_at=now() WHERE gd_level_id=gid;
       conflict_count:=conflict_count+1;
       counted:=counted || jsonb_build_array(jsonb_build_object('gd_level_id',gid,'rank',r,'name',title,'reason',why));
       CONTINUE;
    END IF;

    target:=coalesce(existing_gd,existing_ar);
    -- Importer les liens seulement lorsque le scan des preuves a été complet.
    video_ver:=NULL; video_thumb:=NULL; name_ver:=NULL; first_record:='{}'::jsonb;
    IF previous.evidence_state='complete' THEN
       SELECT e.value INTO v FROM jsonb_array_elements(previous.verifiers_fr_be) AS e(value)
         WHERE e.value->'player'->>'country' IN ('FR','BE') LIMIT 1;
       IF v IS NOT NULL THEN
          name_ver:=nullif(v->'player'->>'name','');
          video_ver:=nullif(v->>'video_url','');
          video_thumb:=nullif(v->>'thumbnail_url','');
       END IF;
       IF previous.first_observed_fr_be->>'status'='first_dated_record' THEN
          first_record:=previous.first_observed_fr_be;
       END IF;
    END IF;
    IF target IS NULL THEN
       INSERT INTO public.demons(position,name,level_id,aredl_id,aredl_rank,publisher,
          verifier,verifier_video_url,video_url,thumbnail_url,first_frbe_player,
          first_frbe_video_url,first_frbe_achieved_at,data_source)
       VALUES(r,title,gid,aid,r,'AREDL',name_ver,video_ver,video_ver,video_thumb,
          first_record->'player'->>'name',nullif(first_record->>'video_url',''),
          CASE WHEN first_record->>'completed_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
               THEN (first_record->>'completed_at')::timestamptz ELSE NULL END,'aredl');
       created_count:=created_count+1;
    ELSE
       -- Ne jamais déplacer le rang DLFR, remplacer le nom, la vérification
       -- ou une preuve enregistrée manuellement. Seul le rang AREDL suit la source.
       UPDATE public.demons SET
          level_id=coalesce(nullif(btrim(level_id),''),gid),
          aredl_id=aid,aredl_rank=r,
          verifier=coalesce(nullif(btrim(verifier),''),name_ver),
          verifier_video_url=coalesce(nullif(btrim(verifier_video_url),''),video_ver),
          video_url=coalesce(nullif(btrim(video_url),''),video_ver),
          thumbnail_url=coalesce(nullif(btrim(thumbnail_url),''),video_thumb),
          first_frbe_player=coalesce(nullif(btrim(first_frbe_player),''),first_record->'player'->>'name'),
          first_frbe_video_url=coalesce(nullif(btrim(first_frbe_video_url),''),first_record->>'video_url'),
          first_frbe_achieved_at=coalesce(first_frbe_achieved_at,
               CASE WHEN first_record->>'completed_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                    THEN (first_record->>'completed_at')::timestamptz ELSE NULL END)
         WHERE id=target;
       matched_count:=matched_count+1;
    END IF;
    UPDATE public.dlfr_aredl_level_stage SET review_state='approved',updated_at=now() WHERE gd_level_id=gid;
  END LOOP;

  RETURN jsonb_build_object('staged',staged_count,'created',created_count,
      'matched',matched_count,'conflicts',conflict_count,'skipped',skipped_count,
      'conflict_details',counted);
END;
$$;

REVOKE ALL ON FUNCTION public.dlfr_aredl_catalog_batch(jsonb,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dlfr_aredl_catalog_batch(jsonb,boolean) FROM anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dlfr_aredl_catalog_batch(jsonb,boolean) TO service_role;
-- Jamais exécuter cette RPC depuis GitHub Pages ou un client navigateur.

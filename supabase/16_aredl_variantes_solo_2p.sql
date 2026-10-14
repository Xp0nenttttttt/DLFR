-- DLFR V3.0.7 — AREDL Solo / 2P.
-- Execute AFTER migration 15, in the Supabase SQL editor, BEFORE using the new GitHub workflow.
-- BACK UP staging and demons first. Does not delete rows or change DLFR positions.
BEGIN;

-- Identity of a ranked AREDL entry is its AREDL ID, NOT its GD ID.
-- In the old schema gd_level_id was the primary key and prevented 2P variants.
ALTER TABLE public.dlfr_aredl_level_stage
  DROP CONSTRAINT IF EXISTS dlfr_aredl_level_stage_pkey;
ALTER TABLE public.dlfr_aredl_level_stage
  ADD CONSTRAINT dlfr_aredl_level_stage_pkey PRIMARY KEY (aredl_id);
ALTER TABLE public.dlfr_aredl_level_stage
  ADD COLUMN IF NOT EXISTS completion_mode text NOT NULL DEFAULT 'standard';
ALTER TABLE public.demons
  ADD COLUMN IF NOT EXISTS completion_mode text NOT NULL DEFAULT 'standard';

CREATE INDEX IF NOT EXISTS dlfr_aredl_stage_gd_lookup
  ON public.dlfr_aredl_level_stage(gd_level_id);
CREATE INDEX IF NOT EXISTS dlfr_demons_gd_lookup
  ON public.demons(level_id);

-- Server-only atomic ingest. Never move a level's manually selected DLFR position.
CREATE OR REPLACE FUNCTION public.dlfr_aredl_catalog_batch(p_rows jsonb, p_publish boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  x jsonb; gid text; aid text; title text; r integer; mode text;
  shared boolean; needs_review boolean;
  previous public.dlfr_aredl_level_stage%ROWTYPE;
  existing_gd bigint; existing_ar bigint; existing_title bigint; occupied bigint;
  target bigint; counted jsonb := '[]'::jsonb;
  staged_count integer := 0; created_count integer := 0;
  matched_count integer := 0; conflict_count integer := 0; skipped_count integer := 0;
  why text; video_ver text; video_thumb text; name_ver text; v jsonb; first_record jsonb;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Tableau JSON requis : 1 à 100 niveaux';
  END IF;
  PERFORM pg_advisory_xact_lock(41028, 2);
  FOR x IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    gid := btrim(coalesce(x->>'gd_level_id',''));
    aid := btrim(coalesce(x->>'aredl_id',''));
    title := btrim(coalesce(x->>'aredl_name',''));
    mode := coalesce(nullif(x->>'completion_mode',''),'standard');
    shared := coalesce((x->>'shared_gd_level')::boolean,false);
    needs_review := coalesce((x->>'needs_variant_review')::boolean,false);
    IF gid !~ '^[1-9][0-9]*$' OR aid='' OR char_length(aid)>120
       OR title='' OR char_length(title)>120 OR mode NOT IN ('standard','solo','two_player','unspecified')
       OR (x->>'aredl_rank') !~ '^[1-9][0-9]*$' THEN
       skipped_count := skipped_count + 1;
       counted := counted || jsonb_build_array(jsonb_build_object('aredl_id',aid,'reason','champs invalides'));
       CONTINUE;
    END IF;
    r := (x->>'aredl_rank')::integer;
    IF r >= 100000000 THEN
       skipped_count := skipped_count + 1;
       CONTINUE;
    END IF;
    -- An AREDL ID may NOT be reused for a different Geometry Dash level.
    IF EXISTS (SELECT 1 FROM public.dlfr_aredl_level_stage s
               WHERE s.aredl_id=aid AND s.gd_level_id<>gid) THEN
       conflict_count:=conflict_count+1;
       counted:=counted || jsonb_build_array(jsonb_build_object('aredl_id',aid,'reason','ID AREDL déjà rattaché à un autre niveau GD'));
       CONTINUE;
    END IF;
    INSERT INTO public.dlfr_aredl_level_stage
      (gd_level_id,aredl_id,aredl_rank,aredl_name,completion_mode,source_action,source_payload,evidence_state)
    VALUES
      (gid,aid,r,title,mode,'GLOBAL_CATALOG',
       jsonb_build_object('catalog_rank',r,'shared_gd_level',shared,'needs_variant_review',needs_review),
       'not_scanned')
    ON CONFLICT (aredl_id) DO UPDATE SET
      aredl_rank=EXCLUDED.aredl_rank,
      aredl_name=EXCLUDED.aredl_name,
      completion_mode=CASE WHEN public.dlfr_aredl_level_stage.source_payload->>'variant_confirmed_by_mod'='true'
                       THEN public.dlfr_aredl_level_stage.completion_mode ELSE EXCLUDED.completion_mode END,
      source_payload=public.dlfr_aredl_level_stage.source_payload || EXCLUDED.source_payload ||
                     CASE WHEN public.dlfr_aredl_level_stage.source_payload->>'variant_confirmed_by_mod'='true'
                          THEN '{"variant_confirmed_by_mod":true,"needs_variant_review":false}'::jsonb
                          ELSE '{}'::jsonb END,
      updated_at=now()
    WHERE public.dlfr_aredl_level_stage.manually_locked=false;
    SELECT * INTO previous FROM public.dlfr_aredl_level_stage WHERE aredl_id=aid FOR UPDATE;
    staged_count:=staged_count+1;
    IF NOT p_publish THEN CONTINUE; END IF;
    IF previous.manually_locked OR previous.review_state IN ('rejected','conflict') THEN
      skipped_count:=skipped_count+1;
      CONTINUE;
    END IF;
    IF previous.source_payload->>'variant_confirmed_by_mod'='true' THEN
      needs_review:=false;
    END IF;
    IF needs_review THEN
      conflict_count:=conflict_count+1;
      counted:=counted || jsonb_build_array(jsonb_build_object('aredl_id',aid,'gd_level_id',gid,
         'reason','Variantes partageant un ID GD : vérifier Solo / 2P dans la modération'));
      CONTINUE;
    END IF;

    -- First match by exact AREDL identity. A manual GD match is allowed ONLY
    -- when the ID is unique among the source entries and the public entry
    -- is not already tied to an AREDL identity.
    existing_ar:=NULL; existing_gd:=NULL; existing_title:=NULL; occupied:=NULL;
    SELECT d.id INTO existing_ar FROM public.demons d WHERE d.aredl_id=aid LIMIT 1;
    IF existing_ar IS NULL AND NOT shared AND
       NOT EXISTS (SELECT 1 FROM public.dlfr_aredl_level_stage s
                   WHERE s.gd_level_id=gid AND s.aredl_id<>aid) THEN
      SELECT d.id INTO existing_gd FROM public.demons d
        WHERE btrim(d.level_id)=gid AND d.aredl_id IS NULL
        ORDER BY id LIMIT 1;
    END IF;
    why:=NULL;
    IF existing_ar IS NOT NULL AND EXISTS
        (SELECT 1 FROM public.demons d WHERE d.id=existing_ar
         AND nullif(btrim(d.level_id),'') IS NOT NULL AND btrim(d.level_id)<>gid) THEN
      why:='ID AREDL déjà lié à un autre ID Geometry Dash';
    ELSIF existing_ar IS NULL AND shared AND EXISTS
        (SELECT 1 FROM public.demons d WHERE btrim(d.level_id)=gid AND d.aredl_id IS NULL) THEN
      why:='Fiche manuelle sans variante Solo/2P : rapprochement manuel obligatoire';
    ELSIF existing_ar IS NULL AND NOT shared AND existing_gd IS NULL AND EXISTS
        (SELECT 1 FROM public.demons d WHERE btrim(d.level_id)=gid AND d.aredl_id IS NOT NULL) THEN
      why:='Même ID GD déjà publié sous un autre ID AREDL : vérifier la variante';
    END IF;
    target:=coalesce(existing_ar,existing_gd);
    IF why IS NULL AND target IS NULL THEN
       SELECT d.id INTO existing_title FROM public.demons d WHERE lower(btrim(d.name))=lower(title) LIMIT 1;
       SELECT d.id INTO occupied FROM public.demons d WHERE d.position=r LIMIT 1;
       IF existing_title IS NOT NULL THEN why:='Nom déjà utilisé par une autre fiche';
       ELSIF occupied IS NOT NULL THEN why:='Rang DLFR occupé : placement manuel nécessaire'; END IF;
    END IF;
    IF why IS NOT NULL THEN
       -- Keep the staging row pending so the moderator can resolve the issue.
       conflict_count:=conflict_count+1;
       counted:=counted || jsonb_build_array(jsonb_build_object('aredl_id',aid,'gd_level_id',gid,'reason',why));
       CONTINUE;
    END IF;

    video_ver:=NULL; video_thumb:=NULL; name_ver:=NULL; first_record:='{}'::jsonb; v:=NULL;
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
        first_frbe_video_url,first_frbe_achieved_at,data_source,completion_mode)
      VALUES(r,title,gid,aid,r,'AREDL',name_ver,video_ver,video_ver,video_thumb,
        first_record->'player'->>'name',nullif(first_record->>'video_url',''),
        CASE WHEN first_record->>'completed_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
             THEN (first_record->>'completed_at')::timestamptz ELSE NULL END,'aredl',mode);
      created_count:=created_count+1;
    ELSE
      -- Keep manually set name, DLFR position, verifier and existing proofs.
      UPDATE public.demons SET
        level_id=coalesce(nullif(btrim(level_id),''),gid), aredl_id=aid, aredl_rank=r,
        completion_mode=CASE WHEN completion_mode='standard' THEN mode ELSE completion_mode END,
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
    UPDATE public.dlfr_aredl_level_stage SET review_state='approved',updated_at=now() WHERE aredl_id=aid;
  END LOOP;
  RETURN jsonb_build_object('staged',staged_count,'created',created_count,
    'matched',matched_count,'conflicts',conflict_count,'skipped',skipped_count,'conflict_details',counted);
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_aredl_catalog_batch(jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dlfr_aredl_catalog_batch(jsonb,boolean) TO service_role;

-- The old moderator RPC uses GD ID and cannot distinguish Solo / 2P safely.
REVOKE ALL ON FUNCTION public.dlfr_publish_staged_aredl(text,integer,boolean) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.dlfr_publish_staged_aredl_by_id(
 p_aredl_id text,p_position integer DEFAULT NULL,p_shift boolean DEFAULT false,
 p_mode_override text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.dlfr_aredl_level_stage%ROWTYPE; match_gd bigint; match_aredl bigint;
        k bigint; target integer; v jsonb; observed jsonb; vv text; vt text; vn text;
BEGIN
 IF NOT public.dlfr_can_moderate() THEN RAISE EXCEPTION 'Modérateur général requis'; END IF;
 PERFORM pg_advisory_xact_lock(41028,2);
 SELECT * INTO s FROM public.dlfr_aredl_level_stage WHERE aredl_id=p_aredl_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Niveau absent de la table d’attente'; END IF;
 IF s.review_state IN ('rejected','conflict') OR s.manually_locked THEN
   RAISE EXCEPTION 'Fiche bloquée : intervention manuelle requise';
 END IF;
 IF s.aredl_id IS NULL OR s.aredl_name IS NULL THEN RAISE EXCEPTION 'Identité AREDL incomplète'; END IF;
 match_gd:=NULL;
 -- GD-only matching is forbidden when multiple AREDL entries share this ID.
 IF NOT coalesce((s.source_payload->>'shared_gd_level')::boolean,false)
    AND NOT EXISTS (SELECT 1 FROM public.dlfr_aredl_level_stage t
                    WHERE t.gd_level_id=s.gd_level_id AND t.aredl_id<>s.aredl_id) THEN
   SELECT id INTO match_gd FROM public.demons
     WHERE trim(level_id)=s.gd_level_id AND aredl_id IS NULL ORDER BY id LIMIT 1;
 END IF;
 IF coalesce((s.source_payload->>'needs_variant_review')::boolean,false) THEN
   IF p_mode_override IS NULL OR p_mode_override NOT IN ('solo','two_player') THEN
     RAISE EXCEPTION 'Choisis la variante Solo ou 2P pour publier cette entrée';
   END IF;
   IF EXISTS (SELECT 1 FROM public.dlfr_aredl_level_stage t
              WHERE t.gd_level_id=s.gd_level_id AND t.aredl_id<>s.aredl_id
              AND t.completion_mode=p_mode_override)
       OR EXISTS (SELECT 1 FROM public.demons d WHERE trim(d.level_id)=s.gd_level_id
                  AND d.aredl_id<>s.aredl_id AND d.completion_mode=p_mode_override) THEN
     RAISE EXCEPTION 'Cette variante est déjà utilisée pour cet ID Geometry Dash';
   END IF;
   UPDATE public.dlfr_aredl_level_stage SET completion_mode=p_mode_override,
      source_payload=source_payload || '{"variant_confirmed_by_mod":true,"needs_variant_review":false}'::jsonb,
      updated_at=now() WHERE aredl_id=s.aredl_id;
   s.completion_mode:=p_mode_override;
 END IF;
 IF coalesce((s.source_payload->>'shared_gd_level')::boolean,false)
    AND EXISTS (SELECT 1 FROM public.demons d WHERE trim(d.level_id)=s.gd_level_id
               AND d.aredl_id IS NULL) THEN
   RAISE EXCEPTION 'Une fiche manuelle partage cet ID GD : identifier sa variante avant publication';
 END IF;
 SELECT id INTO match_aredl FROM public.demons WHERE aredl_id=s.aredl_id LIMIT 1;
 IF match_gd IS NOT NULL AND match_aredl IS NOT NULL AND match_gd<>match_aredl THEN
   RAISE EXCEPTION 'Conflit : ID GD et ID AREDL désignent des niveaux différents';
 END IF;
 IF match_aredl IS NULL AND NOT coalesce((s.source_payload->>'shared_gd_level')::boolean,false)
    AND EXISTS (SELECT 1 FROM public.demons d WHERE trim(d.level_id)=s.gd_level_id
                AND d.aredl_id IS NOT NULL AND d.aredl_id<>s.aredl_id) THEN
    RAISE EXCEPTION 'ID GD déjà lié à une autre entrée AREDL : vérifier la variante';
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
      first_frbe_achieved_at,data_source,completion_mode)
   VALUES(target,s.aredl_name,s.gd_level_id,s.aredl_id,s.aredl_rank,'AREDL',
      vn,nullif(vv,''),nullif(vv,''),nullif(vt,''),observed->'player'->>'name',
      nullif(observed->>'video_url',''),
      CASE WHEN observed->>'completed_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN (observed->>'completed_at')::timestamptz ELSE NULL END,
      'aredl',s.completion_mode) RETURNING id INTO k;
 ELSE
   -- A manual DLFR decision takes precedence; ONLY enrich blanks and AREDL metadata.
   UPDATE public.demons d SET
     level_id=coalesce(nullif(trim(d.level_id),''),s.gd_level_id),
     aredl_id=s.aredl_id, aredl_rank=s.aredl_rank,
     completion_mode=CASE WHEN d.completion_mode='standard' THEN s.completion_mode ELSE d.completion_mode END,
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
   WHERE aredl_id=s.aredl_id;
 INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
 VALUES(auth.uid(),'PUBLISH_AREDL',s.aredl_id,
        format('dlfr_id=%s, ar=%s, requested_rank=%s, actual_rank_preserved_if_existing',k,s.aredl_rank,p_position));
 RETURN k;
END $$;
REVOKE ALL ON FUNCTION public.dlfr_publish_staged_aredl_by_id(text,integer,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_publish_staged_aredl_by_id(text,integer,boolean,text) TO authenticated;

COMMIT;

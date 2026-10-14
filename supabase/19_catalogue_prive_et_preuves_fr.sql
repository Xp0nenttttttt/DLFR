-- DLFR V3.0.9 : séparation des fiches publiques et du catalogue AREDL.
-- Prérequis : SQL 01, 10, 11, 15, 16, 17, 18. Exécuter une fois en SQL Editor.
-- Ne supprime aucune fiche, victoire, ni modification manuelle.
BEGIN;

ALTER TABLE public.demons ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;
ALTER TABLE public.demons ADD COLUMN IF NOT EXISTS first_fr_player text;
ALTER TABLE public.demons ADD COLUMN IF NOT EXISTS first_fr_video_url text;
ALTER TABLE public.demons ADD COLUMN IF NOT EXISTS first_fr_thumbnail_url text;
ALTER TABLE public.demons ADD COLUMN IF NOT EXISTS first_fr_achieved_at timestamptz;
ALTER TABLE public.dlfr_aredl_level_stage ADD COLUMN IF NOT EXISTS verifiers_fr jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.dlfr_aredl_level_stage ADD COLUMN IF NOT EXISTS first_observed_fr jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Garde le même contrôle d'accès que les autres tables de modération.
CREATE TABLE IF NOT EXISTS public.dlfr_catalog_hide_log (
  demon_id bigint PRIMARY KEY REFERENCES public.demons(id) ON DELETE CASCADE,
  reason text NOT NULL,
  original_position integer,
  hidden_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dlfr_catalog_hide_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dlfr_catalog_hide_log FROM anon,authenticated;

-- PROTECTION : masquer seulement une fiche créée par le CATALOGUE AUTOMATIQUE,
-- sans victoire, sans preuve, sans édition visible et identique à son entrée AREDL.
-- Aucun niveau manualisé ou avec record n'est concerné.
WITH candidates AS (
 SELECT d.id
 FROM public.demons d
 JOIN public.dlfr_aredl_level_stage s ON s.aredl_id=d.aredl_id
 WHERE d.is_public=true
   AND d.data_source='aredl' AND d.publisher='AREDL'
   AND d.position=s.aredl_rank AND d.name=s.aredl_name
   AND coalesce(nullif(btrim(d.verifier),''),nullif(btrim(d.video_url),''),
     nullif(btrim(d.verifier_video_url),''),nullif(btrim(d.first_frbe_player),'')) IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.completions c WHERE c.demon_id=d.id)
), logged AS (
 INSERT INTO public.dlfr_catalog_hide_log(demon_id,reason,original_position)
 SELECT c.id,'Import catalogue AREDL sans preuve et sans record',d.position FROM candidates c JOIN public.demons d ON d.id=c.id
 ON CONFLICT (demon_id) DO NOTHING
 RETURNING demon_id
)
UPDATE public.demons SET is_public=false
WHERE id IN (SELECT id FROM candidates);

-- Les niveaux masqués ne sont plus consultables via l'API publique Supabase.
DROP POLICY IF EXISTS demons_read ON public.demons;
CREATE POLICY demons_read ON public.demons FOR SELECT TO anon, authenticated
 USING (is_public OR (SELECT public.is_demonlist_staff()));

-- L'import catalogue est limité au STAGING : jamais de nouvelle fiche publique.
-- Cette fonction est réexécutable, garde intactes les preuves détaillées existantes.
CREATE OR REPLACE FUNCTION public.dlfr_aredl_catalog_batch(p_rows jsonb,p_publish boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x jsonb; aid text; gid text; title text; r integer; md text;
        staged_count integer:=0; skipped_count integer:=0;
BEGIN
 IF p_publish THEN
   RAISE EXCEPTION 'V3.0.9 : la publication automatique du catalogue est désactivée. Utiliser stage puis valider en modération.';
 END IF;
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'Tableau de 1 à 100 entrées attendu';
 END IF;
 PERFORM pg_advisory_xact_lock(41028,2);
 FOR x IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
   aid:=btrim(coalesce(x->>'aredl_id','')); gid:=btrim(coalesce(x->>'gd_level_id',''));
   title:=btrim(coalesce(x->>'aredl_name','')); md:=coalesce(nullif(x->>'completion_mode',''),'standard');
   IF aid='' OR gid !~ '^[1-9][0-9]*$' OR title='' OR char_length(title)>120
      OR coalesce(x->>'aredl_rank','') !~ '^[1-9][0-9]*$'
      OR md NOT IN ('standard','solo','two_player','unspecified') THEN
       skipped_count:=skipped_count+1; CONTINUE;
   END IF;
   r:=(x->>'aredl_rank')::int;
   IF EXISTS(SELECT 1 FROM public.dlfr_aredl_level_stage z
             WHERE z.aredl_id=aid AND z.gd_level_id<>gid) THEN
     skipped_count:=skipped_count+1; CONTINUE;
   END IF;
   INSERT INTO public.dlfr_aredl_level_stage
     (aredl_id,gd_level_id,aredl_rank,aredl_name,completion_mode,source_action,source_payload)
   VALUES (aid,gid,r,title,md,'GLOBAL_CATALOG',jsonb_build_object('catalog_rank',r,
          'shared_gd_level',coalesce((x->>'shared_gd_level')::boolean,false),
          'needs_variant_review',coalesce((x->>'needs_variant_review')::boolean,false)))
   ON CONFLICT (aredl_id) DO UPDATE SET
     aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
     completion_mode=CASE WHEN public.dlfr_aredl_level_stage.source_payload->>'variant_confirmed_by_mod'='true'
                          THEN public.dlfr_aredl_level_stage.completion_mode ELSE EXCLUDED.completion_mode END,
     source_payload=public.dlfr_aredl_level_stage.source_payload || EXCLUDED.source_payload,
     updated_at=now()
   WHERE public.dlfr_aredl_level_stage.manually_locked=false
     AND public.dlfr_aredl_level_stage.review_state IN ('pending','approved');
   staged_count:=staged_count+1;
 END LOOP;
 RETURN jsonb_build_object('staged',staged_count,'skipped',skipped_count,
                            'created',0,'matched',0,'conflicts',0);
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_aredl_catalog_batch(jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dlfr_aredl_catalog_batch(jsonb,boolean) TO service_role;

-- Apporte uniquement les preuves FR et uniquement si le scan records est exhaustif.
-- Ne touche jamais aux fiches publiques ni aux validations manuelles.
CREATE OR REPLACE FUNCTION public.dlfr_stage_fr_evidence(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x jsonb; ids text; gid text; vr jsonb; first jsonb;
        updated_count integer:=0; skipped_count integer:=0;
BEGIN
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 25 THEN
   RAISE EXCEPTION 'Tableau de 1 à 25 preuves attendu';
 END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
   ids:=x->>'aredl_id'; gid:=x->>'gd_level_id';
   IF coalesce((x->>'records_complete')::boolean,false) IS NOT TRUE THEN
      skipped_count:=skipped_count+1; CONTINUE;
   END IF;
   vr:=coalesce(x->'verifiers_fr','[]'::jsonb);
   first:=coalesce(x->'first_fr','{}'::jsonb);
   IF jsonb_typeof(vr)<>'array' OR jsonb_typeof(first)<>'object' OR
      EXISTS (SELECT 1 FROM jsonb_array_elements(vr) v WHERE v->'player'->>'country'<>'FR'
              OR v->'player'->>'country' IS NULL) OR
      (first<>'{}'::jsonb AND (first->'player'->>'country'<>'FR'
                                 OR first->>'status'<>'first_dated_record')) THEN
      skipped_count:=skipped_count+1; CONTINUE;
   END IF;
   UPDATE public.dlfr_aredl_level_stage s SET
      verifiers_fr=vr, first_observed_fr=first, evidence_state='complete',
      source_payload=s.source_payload||jsonb_build_object('fr_scanned_at',now(), 'records_complete',true),
      updated_at=now()
   WHERE s.aredl_id=ids AND s.gd_level_id=gid
     AND s.manually_locked=false AND s.review_state IN ('pending','approved');
   IF FOUND THEN updated_count:=updated_count+1; ELSE skipped_count:=skipped_count+1; END IF;
 END LOOP;
 RETURN jsonb_build_object('updated',updated_count,'skipped',skipped_count);
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_stage_fr_evidence(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dlfr_stage_fr_evidence(jsonb) TO service_role;

-- Publication volontaire et contrôlée après scan FR : pour les fiches AREDL
-- déjà enregistrées lors du précédent import global. Ne déplace aucun rang.
CREATE OR REPLACE FUNCTION public.dlfr_approve_fr_aredl(p_aredl_id text,p_position integer DEFAULT NULL,p_shift boolean DEFAULT false)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.dlfr_aredl_level_stage%ROWTYPE; out_id bigint; vf jsonb; first jsonb; target_rank integer; old_rank integer; was_public boolean;
BEGIN
 IF NOT public.dlfr_can_moderate() THEN RAISE EXCEPTION 'Modérateur général requis'; END IF;
 PERFORM pg_advisory_xact_lock(41028,2);
 SELECT * INTO s FROM public.dlfr_aredl_level_stage WHERE aredl_id=p_aredl_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Entrée AREDL introuvable'; END IF;
 IF s.manually_locked OR s.review_state IN ('rejected','conflict') OR
    s.evidence_state<>'complete' OR
    coalesce((s.source_payload->>'records_complete')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Fiche verrouillée ou preuves françaises non vérifiées';
 END IF;
 vf:=coalesce(s.verifiers_fr,'[]'::jsonb); first:=coalesce(s.first_observed_fr,'{}'::jsonb);
 IF jsonb_array_length(vf)=0 AND first='{}'::jsonb THEN
    RAISE EXCEPTION 'Aucun vérificateur ou premier record français confirmé';
 END IF;
 SELECT d.id,d.position,d.is_public INTO out_id,old_rank,was_public FROM public.demons d WHERE d.aredl_id=s.aredl_id FOR UPDATE;
 IF out_id IS NULL THEN RAISE EXCEPTION 'Fiche publique absente : créer/placer le niveau via la modération avant approbation'; END IF;
 target_rank:=CASE WHEN was_public THEN old_rank ELSE coalesce(p_position,s.aredl_rank) END;
 IF target_rank < 1 OR target_rank > 99999999 THEN RAISE EXCEPTION 'Position invalide'; END IF;
 IF target_rank <> old_rank AND EXISTS(SELECT 1 FROM public.demons WHERE position=target_rank AND id<>out_id) THEN
   IF NOT p_shift THEN RAISE EXCEPTION 'Position occupée : choisir une position libre ou cocher Décaler'; END IF;
   PERFORM public.dlfr_make_room(target_rank);
 END IF;
 UPDATE public.demons d SET
   is_public=true,
   position=target_rank,
   verifier=coalesce(nullif(btrim(d.verifier),''), NULLIF(vf->0->'player'->>'name','')),
   verifier_video_url=coalesce(nullif(btrim(d.verifier_video_url),''), NULLIF(vf->0->>'video_url','')),
   video_url=coalesce(nullif(btrim(d.video_url),''), NULLIF(vf->0->>'video_url','')),
   thumbnail_url=coalesce(nullif(btrim(d.thumbnail_url),''), NULLIF(vf->0->>'thumbnail_url','')),
   first_fr_player=coalesce(d.first_fr_player,first->'player'->>'name'),
   first_fr_video_url=coalesce(d.first_fr_video_url,first->>'video_url'),
   first_fr_thumbnail_url=coalesce(d.first_fr_thumbnail_url,first->>'thumbnail_url'),
   first_fr_achieved_at=coalesce(d.first_fr_achieved_at,
     CASE WHEN first->>'completed_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN (first->>'completed_at')::timestamptz ELSE NULL END)
 WHERE d.id=out_id;
 UPDATE public.dlfr_aredl_level_stage SET review_state='approved', updated_at=now()
 WHERE aredl_id=p_aredl_id;
 RETURN out_id;
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_approve_fr_aredl(text,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_approve_fr_aredl(text,integer,boolean) TO authenticated;

COMMIT;

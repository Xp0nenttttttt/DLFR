-- À exécuter une fois après les migrations existantes (19, 25, 32, 43).
-- Installe un outil ; ne publie aucun niveau à l'installation.
BEGIN;
ALTER TABLE public.demons ADD COLUMN IF NOT EXISTS bulk_fr_evidence jsonb;

CREATE OR REPLACE FUNCTION public.dlfr_import_nlw_fr(
 p_rows jsonb, p_start_position integer DEFAULT 238,
 p_execute boolean DEFAULT false, p_preview_hash text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x jsonb; d public.demons%ROWTYPE; n integer; pos integer; aid text; gid text; title text;
 md text; why text; action text; plan jsonb:='[]'; e jsonb; vf jsonb; first_fr jsonb; witness jsonb;
 seen_ids text[]:='{}'; seen_names text[]:='{}'; seen_modes text[]:='{}';
 signature text; target_id bigint; published integer:=0; kept integer:=0; conflicts integer:=0;
BEGIN
 IF NOT coalesce(public.dlfr_can_moderate(),false) THEN RAISE EXCEPTION 'Supermodération requise'; END IF;
 IF p_start_position IS NULL OR p_start_position NOT BETWEEN 151 AND 99990000 THEN
   RAISE EXCEPTION 'La position de départ DLFR doit être entre 151 et 99990000'; END IF;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Tableau JSON requis'; END IF;
 IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'De 1 à 5000 niveaux attendus'; END IF;
 PERFORM pg_advisory_xact_lock(41028,2);
 pos:=p_start_position;
 FOR x IN SELECT value FROM jsonb_array_elements(p_rows) ORDER BY (value->>'aredl_rank')::integer LOOP
   aid:=btrim(coalesce(x->>'aredl_id','')); gid:=btrim(coalesce(x->>'gd_level_id',''));
   title:=btrim(coalesce(x->>'name','')); md:=coalesce(x->>'completion_mode','standard');
   vf:=coalesce(x->'verifiers_fr','[]'); first_fr:=coalesce(x->'first_fr','{}'); witness:=coalesce(x->'victor_fr','{}');
   IF aid !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
     OR gid !~ '^[1-9][0-9]*$' OR length(title) NOT BETWEEN 1 AND 120
     OR coalesce(x->>'aredl_rank','') !~ '^[1-9][0-9]*$'
     OR md NOT IN ('standard','solo','two_player') OR x->>'records_complete' IS DISTINCT FROM 'true'
     OR jsonb_typeof(vf) IS DISTINCT FROM 'array' OR jsonb_typeof(first_fr) IS DISTINCT FROM 'object'
     OR jsonb_typeof(witness) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Entrée invalide : %',title; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(vf) v WHERE v->'player'->>'country' IS DISTINCT FROM 'FR'
        OR coalesce(v->'player'->>'name','')='' OR coalesce(v->'player'->>'aredl_player_id','')='')
     OR (first_fr<>'{}' AND (first_fr->'player'->>'country' IS DISTINCT FROM 'FR'
        OR first_fr->>'status' IS DISTINCT FROM 'first_dated_record'))
     OR (witness<>'{}' AND (witness->'player'->>'country' IS DISTINCT FROM 'FR'
        OR coalesce(witness->'player'->>'name','')='' OR coalesce(witness->'player'->>'aredl_player_id','')=''))
     OR (jsonb_array_length(vf)=0 AND witness='{}') THEN RAISE EXCEPTION 'Preuve française manquante : %',title; END IF;
   IF first_fr<>'{}' THEN
     IF coalesce(first_fr->>'completed_at','')='' THEN RAISE EXCEPTION 'Date du premier record absente'; END IF;
     PERFORM (first_fr->>'completed_at')::timestamptz;
   END IF;
   -- Seules des URLs HTTPS sont publiées. Aucune donnée HTML du fichier n'est exécutée.
   FOR e IN SELECT value FROM jsonb_array_elements(vf || jsonb_build_array(first_fr,witness)) LOOP
     IF (coalesce(e->>'video_url','')<>'' AND e->>'video_url' !~ '^https://[^[:space:]]+$')
       OR (coalesce(e->>'thumbnail_url','')<>'' AND e->>'thumbnail_url' !~ '^https://[^[:space:]]+$') THEN
       RAISE EXCEPTION 'Lien HTTPS invalide : %',title;
     END IF;
   END LOOP;
   why:=NULL; action:='create'; d:=NULL;
   IF aid=ANY(seen_ids) OR lower(title)=ANY(seen_names) OR (gid||':'||md)=ANY(seen_modes) THEN
     why:='Doublon dans le fichier';
   END IF;
   seen_ids:=array_append(seen_ids,aid); seen_names:=array_append(seen_names,lower(title)); seen_modes:=array_append(seen_modes,gid||':'||md);
   SELECT count(*) INTO n FROM public.demons z WHERE z.aredl_id=aid
      OR (btrim(z.level_id)=gid AND coalesce(z.completion_mode,'standard')=md)
      OR lower(btrim(z.name))=lower(title);
   IF n>1 THEN why:='Plusieurs fiches correspondent : rapprochement manuel nécessaire';
   ELSIF n=1 THEN
     SELECT * INTO d FROM public.demons z WHERE z.aredl_id=aid
       OR (btrim(z.level_id)=gid AND coalesce(z.completion_mode,'standard')=md)
       OR lower(btrim(z.name))=lower(title);
     IF (nullif(d.aredl_id,'') IS NOT NULL AND d.aredl_id<>aid)
       OR btrim(coalesce(d.level_id,''))<>gid OR coalesce(d.completion_mode,'standard')<>md THEN
       why:='ID ou variante incompatible';
     ELSIF d.is_public THEN action:='keep';
     ELSIF d.data_source IS DISTINCT FROM 'aredl' OR d.legacy OR d.unrated
       OR EXISTS(SELECT 1 FROM public.dlfr_level_archive_log a WHERE a.demon_id=d.id AND a.restored_at IS NULL)
       OR EXISTS(SELECT 1 FROM public.completions c WHERE c.demon_id=d.id) THEN
       why:='Fiche masquée protégée (manuelle, archivée ou avec records)';
     ELSE action:='reuse'; END IF;
   END IF;
   IF EXISTS(SELECT 1 FROM public.dlfr_aredl_level_stage s WHERE s.aredl_id=aid
      AND (s.manually_locked OR s.review_state IN ('rejected','conflict'))) THEN
      why:='Import refusé ou verrouillé en modération';
   END IF;
   IF why IS NOT NULL THEN action:='conflict'; conflicts:=conflicts+1;
   ELSIF action='keep' THEN kept:=kept+1;
   ELSE
     -- Aucun déplacement des niveaux existants, même masqués. Occuper seulement un rang libre.
     WHILE EXISTS(SELECT 1 FROM public.demons z WHERE z.position=pos AND z.id IS DISTINCT FROM d.id) LOOP pos:=pos+1; END LOOP;
     IF pos>=99999999 THEN RAISE EXCEPTION 'Plus de positions NLW disponibles'; END IF;
     published:=published+1;
   END IF;
   plan:=plan||jsonb_build_array(jsonb_build_object('action',action,'reason',why,'id',d.id,
     'position',CASE WHEN action IN ('create','reuse') THEN pos ELSE d.position END,'row',x));
   IF action IN ('create','reuse') THEN pos:=pos+1; END IF;
 END LOOP;
 signature:=md5(plan::text);
 IF p_execute THEN
   IF p_preview_hash IS DISTINCT FROM signature THEN RAISE EXCEPTION 'Aperçu périmé : relance Examiner avant de publier'; END IF;
   FOR e IN SELECT value FROM jsonb_array_elements(plan) LOOP
     IF e->>'action' NOT IN ('create','reuse') THEN CONTINUE; END IF;
     x:=e->'row'; vf:=x->'verifiers_fr'; first_fr:=x->'first_fr';
     target_id:=(e->>'id')::bigint;
     IF e->>'action'='create' THEN
       INSERT INTO public.demons(position,name,level_id,aredl_id,aredl_rank,completion_mode,
          publisher,requirement,legacy,unrated,is_public,data_source)
       VALUES((e->>'position')::int,x->>'name',x->>'gd_level_id',x->>'aredl_id',(x->>'aredl_rank')::int,
          x->>'completion_mode',coalesce(x->>'publisher',''),100,false,false,true,'manual') RETURNING id INTO target_id;
     END IF;
     UPDATE public.demons SET position=(e->>'position')::int,is_public=true,data_source='manual',
       aredl_id=x->>'aredl_id',aredl_rank=(x->>'aredl_rank')::int,
       publisher=CASE WHEN btrim(publisher) IN ('','AREDL') THEN coalesce(x->>'publisher','') ELSE publisher END,
       verifier=coalesce(nullif(btrim(verifier),''),vf->0->'player'->>'name'),
       verifier_video_url=coalesce(nullif(verifier_video_url,''),vf->0->>'video_url'),
       video_url=coalesce(nullif(video_url,''),vf->0->>'video_url',first_fr->>'video_url',x->'victor_fr'->>'video_url'),
       thumbnail_url=coalesce(nullif(thumbnail_url,''),vf->0->>'thumbnail_url',first_fr->>'thumbnail_url',x->'victor_fr'->>'thumbnail_url'),
       first_fr_player=coalesce(nullif(first_fr_player,''),first_fr->'player'->>'name'),
       first_fr_video_url=coalesce(nullif(first_fr_video_url,''),first_fr->>'video_url'),
       first_fr_thumbnail_url=coalesce(nullif(first_fr_thumbnail_url,''),first_fr->>'thumbnail_url'),
       first_fr_achieved_at=coalesce(first_fr_achieved_at,(first_fr->>'completed_at')::timestamptz),
       bulk_fr_evidence=x
     WHERE id=target_id;
   END LOOP;
   INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
   VALUES(auth.uid(),'BULK_NLW_FR',signature,format('%s niveaux publiés depuis #%s ; %s conservés ; %s conflits',published,p_start_position,kept,conflicts));
 END IF;
 RETURN jsonb_build_object('executed',p_execute,'preview_hash',signature,'published',published,'kept',kept,'conflicts',conflicts,'entries',plan);
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_import_nlw_fr(jsonb,integer,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_import_nlw_fr(jsonb,integer,boolean,text) TO authenticated;
COMMIT;

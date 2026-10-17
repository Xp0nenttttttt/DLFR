-- DLFR 2.6 — suppression contrôlée des niveaux masqués.
-- Exécuter APRÈS les migrations de modération. Une sauvegarde est indispensable.
-- La fonctionnalité est réservée au propriétaire et n'efface JAMAIS des records.
BEGIN;

CREATE OR REPLACE FUNCTION public.dlfr_preview_hidden_demon_delete(p_demon_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_level public.demons%ROWTYPE;
  v_fk record;
  v_count bigint;
  v_refs jsonb := '[]'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_safe boolean;
  v_extra record;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staff_roles r
    WHERE r.auth_user_id=(SELECT auth.uid()) AND r.role='owner'
  ) THEN RAISE EXCEPTION 'Réservé au propriétaire'; END IF;

  SELECT * INTO v_level FROM public.demons WHERE id=p_demon_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Niveau introuvable'; END IF;
  IF v_level.is_public IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Seules les fiches masquées peuvent être supprimées';
  END IF;

  -- Compter toutes les références FK existantes pour ne pas dépendre
  -- de la version exacte des migrations installées.
  FOR v_fk IN
    SELECT c.conrelid::regclass AS relation,
           n.nspname AS schema_name, t.relname AS table_name,
           a.attname AS column_name,
           cardinality(c.conkey) AS key_columns
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
    LEFT JOIN pg_catalog.pg_attribute a
      ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
    WHERE c.contype='f' AND c.confrelid='public.demons'::regclass
  LOOP
    IF v_fk.key_columns <> 1 THEN
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'table',v_fk.schema_name||'.'||v_fk.table_name,'count','référence composée'));
      CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1',v_fk.relation,v_fk.column_name)
      INTO v_count USING p_demon_id;
    IF v_count = 0 THEN CONTINUE; END IF;

    -- Ces seules tables contiennent de l'indexation / traçabilité technique
    -- qui sera effacée par ON DELETE CASCADE ou détachée par SET NULL.
    v_safe := v_fk.schema_name='public' AND v_fk.table_name IN (
      'dlfr_level_archive_log','dlfr_manual_only_hide_log','dlfr_hidden_imports',
      'demon_position_history','dlfr_aredl_levels'
    );
    v_refs := v_refs || jsonb_build_array(jsonb_build_object(
      'table',v_fk.schema_name||'.'||v_fk.table_name,
      'count',v_count,'technique',v_safe));
    IF NOT v_safe THEN
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'table',v_fk.schema_name||'.'||v_fk.table_name,'count',v_count));
    END IF;
  END LOOP;

  -- Certaines migrations anciennes conservent des références demon_id SANS FK.
  -- Les compter aussi, afin de ne pas effacer une fiche encore mentionnée.
  FOR v_extra IN
    SELECT a.attname AS column_name, c.oid::regclass AS relation,
           n.nspname AS schema_name, c.relname AS table_name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
    WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','dlfr_legacy')
      AND a.attname IN ('demon_id','dlfr_demon_id')
      AND a.attnum>0 AND NOT a.attisdropped
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint fk
        WHERE fk.conrelid=c.oid AND fk.contype='f'
          AND fk.confrelid='public.demons'::regclass
          AND a.attnum=ANY(fk.conkey)
      )
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1',v_extra.relation,v_extra.column_name)
      INTO v_count USING p_demon_id;
    IF v_count=0 THEN CONTINUE; END IF;
    v_refs:=v_refs||jsonb_build_array(jsonb_build_object(
      'table',v_extra.schema_name||'.'||v_extra.table_name,
      'count',v_count,'technique',false));
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'table',v_extra.schema_name||'.'||v_extra.table_name,'count',v_count));
  END LOOP;

  RETURN jsonb_build_object(
    'id',v_level.id,'name',v_level.name,'position',v_level.position,
    'source',v_level.data_source,'references',v_refs,'blockers',v_blockers,
    'can_delete',jsonb_array_length(v_blockers)=0
  );
END $$;
REVOKE ALL ON FUNCTION public.dlfr_preview_hidden_demon_delete(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_preview_hidden_demon_delete(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.dlfr_delete_hidden_demon(
  p_demon_id bigint,p_confirm_name text,p_confirmation text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_before jsonb; v_name text;
BEGIN
  PERFORM pg_advisory_xact_lock(41028, 2);
  -- Bloquer les insertions concurrentes de records avant le second contrôle.
  PERFORM 1 FROM public.demons WHERE id=p_demon_id FOR UPDATE;
  -- Le contrôle du propriétaire et des dépendances a lieu également ici.
  v_before := public.dlfr_preview_hidden_demon_delete(p_demon_id);
  v_name := v_before->>'name';
  IF p_confirmation IS DISTINCT FROM 'SUPPRIMER' OR
     p_confirm_name IS DISTINCT FROM v_name THEN
    RAISE EXCEPTION 'Confirme le nom exact du niveau et SUPPRIMER';
  END IF;
  IF (v_before->>'can_delete')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Suppression refusée : données liées. Voir l’aperçu des dépendances.';
  END IF;
  -- Le verrou de transaction protège la suppression contre les changements de classement.
  DELETE FROM public.demons d WHERE d.id=p_demon_id AND d.is_public=false;
  IF NOT FOUND THEN RAISE EXCEPTION 'Niveau absent ou devenu public'; END IF;
  INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
  VALUES((SELECT auth.uid()),'DELETE_HIDDEN_DEMON',p_demon_id::text,
         'Suppression définitive, nom='||left(v_name,180)||', ancienne position='||(v_before->>'position'));
  RETURN v_before;
END $$;
REVOKE ALL ON FUNCTION public.dlfr_delete_hidden_demon(bigint,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_delete_hidden_demon(bigint,text,text) TO authenticated;
COMMIT;

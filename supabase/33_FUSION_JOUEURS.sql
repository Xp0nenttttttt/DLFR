-- DLFR : fusion contrôlée de fiches, sans suppression des identités Auth.
-- Requiert les migrations de production précédentes. Sauvegarder la base avant utilisation.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dlfr_player_merges (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 source_key text NOT NULL,
 target_key text NOT NULL,
 source_username text NOT NULL,
 target_username text NOT NULL,
 merged_by uuid NOT NULL,
 merged_at timestamptz NOT NULL DEFAULT now(),
 details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS dlfr_player_merges_source_once ON public.dlfr_player_merges(source_key);
CREATE TABLE IF NOT EXISTS public.dlfr_merge_duplicate_completions (
 merge_id bigint NOT NULL REFERENCES public.dlfr_player_merges(id),
 original_completion_id bigint NOT NULL,
 original_data jsonb NOT NULL,
 PRIMARY KEY (merge_id, original_completion_id)
);
REVOKE ALL ON public.dlfr_player_merges,public.dlfr_merge_duplicate_completions FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.dlfr_merge_players_preview(p_source_key text,p_target_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE src public.players%ROWTYPE; dst public.players%ROWTYPE; n_total int; n_duplicates int;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.staff_roles WHERE auth_user_id=auth.uid() AND role IN ('owner','editor','supermoderator')) THEN RAISE EXCEPTION 'Supermodérateur requis'; END IF;
 IF p_source_key IS NULL OR p_target_key IS NULL OR p_source_key=p_target_key THEN RAISE EXCEPTION 'Choisis deux joueurs distincts'; END IF;
 SELECT * INTO src FROM public.players WHERE player_key=p_source_key;
 SELECT * INTO dst FROM public.players WHERE player_key=p_target_key;
 IF src.player_key IS NULL OR dst.player_key IS NULL THEN RAISE EXCEPTION 'Profil introuvable'; END IF;
 IF EXISTS(SELECT 1 FROM public.player_profile_owners WHERE player_key=p_source_key)
    OR EXISTS(SELECT 1 FROM public.profile_claim_requests WHERE player_key=p_source_key AND status='pending')
    OR EXISTS(SELECT 1 FROM public.dlfr_player_merges WHERE source_key=p_source_key) THEN
   RAISE EXCEPTION 'Source liée, revendiquée ou déjà fusionnée : contrôle manuel nécessaire';
 END IF;
 SELECT count(*),count(*) FILTER (WHERE EXISTS(
    SELECT 1 FROM public.completions t WHERE lower(btrim(t.player))=lower(btrim(dst.username)) AND t.demon_id=c.demon_id))
 INTO n_total,n_duplicates FROM public.completions c WHERE lower(btrim(c.player))=lower(btrim(src.username));
 RETURN jsonb_build_object('source',src.username,'target',dst.username,'records_source',n_total,
 'records_transferrables',n_total-n_duplicates,'records_doublons',n_duplicates,
 'titres_source',(SELECT count(*) FROM public.player_profile_titles WHERE player_key=p_source_key),
 'badges_source',(SELECT count(*) FROM public.badge_awards WHERE player_key=p_source_key),
 'avertissement','Les autres relations (clans, demandes, historique AREDL, etc.) ne sont pas fusionnées automatiquement; la source sera archivée.');
END $$;

CREATE OR REPLACE FUNCTION public.dlfr_merge_players(p_source_key text,p_target_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE src public.players%ROWTYPE; dst public.players%ROWTYPE; info jsonb; merge_id bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(64423,1);
 info:=public.dlfr_merge_players_preview(p_source_key,p_target_key);
 SELECT * INTO src FROM public.players WHERE player_key=p_source_key FOR UPDATE;
 SELECT * INTO dst FROM public.players WHERE player_key=p_target_key FOR UPDATE;
 -- Empêcher le cas ambigu de plusieurs fiches portant le même pseudo.
 IF (SELECT count(*) FROM public.players WHERE lower(btrim(username))=lower(btrim(src.username)))<>1
    OR (SELECT count(*) FROM public.players WHERE lower(btrim(username))=lower(btrim(dst.username)))<>1 THEN
   RAISE EXCEPTION 'Pseudo partagé par plusieurs profils : fusion manuelle nécessaire';
 END IF;
 INSERT INTO public.dlfr_player_merges(source_key,target_key,source_username,target_username,merged_by,details)
 VALUES(src.player_key,dst.player_key,src.username,dst.username,auth.uid(),info) RETURNING id INTO merge_id;
 -- Conserver la trace complète de chaque complétion doublonnée AVANT de retirer le doublon.
 INSERT INTO public.dlfr_merge_duplicate_completions(merge_id,original_completion_id,original_data)
 SELECT merge_id,c.id,to_jsonb(c) FROM public.completions c
 WHERE lower(btrim(c.player))=lower(btrim(src.username))
 AND EXISTS(SELECT 1 FROM public.completions t WHERE lower(btrim(t.player))=lower(btrim(dst.username)) AND t.demon_id=c.demon_id);
 DELETE FROM public.completions c WHERE lower(btrim(c.player))=lower(btrim(src.username))
 AND EXISTS(SELECT 1 FROM public.completions t WHERE lower(btrim(t.player))=lower(btrim(dst.username)) AND t.demon_id=c.demon_id);
 UPDATE public.completions SET player=dst.username WHERE lower(btrim(player))=lower(btrim(src.username));
 INSERT INTO public.player_profile_titles(player_key,title_id)
 SELECT dst.player_key,title_id FROM public.player_profile_titles WHERE player_key=src.player_key ON CONFLICT DO NOTHING;
 INSERT INTO public.badge_awards(player_key,badge_id,obtained_at,origin,created_at)
 SELECT dst.player_key,badge_id,obtained_at,origin,created_at FROM public.badge_awards WHERE player_key=src.player_key ON CONFLICT DO NOTHING;
 UPDATE public.hall_of_fame SET player_key=dst.player_key WHERE player_key=src.player_key;
 UPDATE public.fr_achievements SET player_key=dst.player_key WHERE player_key=src.player_key;
 -- La source est gardée, cachée et traçable. Ne jamais transférer des comptes Auth implicitement.
 UPDATE public.players SET hidden_from_stats=true WHERE player_key=src.player_key;
 INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
 VALUES(auth.uid(),'MERGE_PLAYERS',dst.player_key,concat('Profil ',src.player_key,' absorbé. Merge #',merge_id));
 RETURN info || jsonb_build_object('merge_id',merge_id,'status','archived');
END $$;
REVOKE ALL ON FUNCTION public.dlfr_merge_players_preview(text,text),public.dlfr_merge_players(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_merge_players_preview(text,text),public.dlfr_merge_players(text,text) TO authenticated;
COMMIT;

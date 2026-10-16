-- DLFR : rapprochement manuel des vérificateurs. Installation après migration 33.
-- Aucune modification des données à l'installation.
BEGIN;
CREATE OR REPLACE FUNCTION public.dlfr_unlinked_verifiers()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.staff_roles WHERE auth_user_id=auth.uid() AND role IN ('owner','editor','supermoderator')) THEN RAISE EXCEPTION 'Supermodérateur requis'; END IF;
 SELECT coalesce(jsonb_agg(row_data ORDER BY (row_data->>'count')::int DESC, row_data->>'verifier_name'), '[]'::jsonb) INTO result
 FROM (
  SELECT jsonb_build_object('verifier_name',verifier,'count',count(*),'levels',jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY position)) row_data
  FROM public.demons WHERE verifier_user_id IS NULL AND nullif(btrim(verifier),'') IS NOT NULL AND btrim(verifier) <> 'À renseigner'
  GROUP BY verifier
 ) entries;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.dlfr_unlinked_verifiers() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_unlinked_verifiers() TO authenticated;

CREATE OR REPLACE FUNCTION public.dlfr_link_verifier(p_verifier_name text,p_player_key text DEFAULT NULL,p_new_player_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_player public.players%ROWTYPE; v_new text; v_key text; v_count integer; v_numeric_id bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.staff_roles WHERE auth_user_id=auth.uid() AND role IN ('owner','editor','supermoderator')) THEN RAISE EXCEPTION 'Supermodérateur requis'; END IF;
 IF nullif(btrim(p_verifier_name),'') IS NULL THEN RAISE EXCEPTION 'Vérificateur requis'; END IF;
 IF (nullif(btrim(p_player_key),'') IS NULL) = (nullif(btrim(p_new_player_name),'') IS NULL) THEN RAISE EXCEPTION 'Choisis soit une fiche, soit un nouveau pseudo'; END IF;
 PERFORM pg_advisory_xact_lock(64423,3);
 IF nullif(btrim(p_new_player_name),'') IS NOT NULL THEN
   v_new:=btrim(p_new_player_name);
   IF length(v_new)>80 THEN RAISE EXCEPTION 'Pseudo trop long'; END IF;
   IF EXISTS(SELECT 1 FROM public.players WHERE lower(btrim(username))=lower(v_new) OR lower(btrim(display_name))=lower(v_new)) THEN
     RAISE EXCEPTION 'Pseudo existant : sélectionne la fiche existante';
   END IF;
   v_key:=lower(regexp_replace(v_new,'[^[:alnum:]_]+','-','g'));
   IF v_key='' OR EXISTS(SELECT 1 FROM public.players WHERE player_key=v_key) THEN
     RAISE EXCEPTION 'Clé de profil invalide ou déjà utilisée. Choisis la fiche existante ou un pseudo différent';
   END IF;
   SELECT greatest(coalesce(max(legacy_id),0),1000000)+1 INTO v_numeric_id FROM public.players;
   INSERT INTO public.players(player_key,username,display_name,has_account,legacy_id) VALUES(v_key,v_new,v_new,false,v_numeric_id) RETURNING * INTO v_player;
 ELSE
   SELECT * INTO v_player FROM public.players WHERE player_key=p_player_key FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Joueur introuvable'; END IF;
 END IF;
 IF v_player.legacy_id IS NULL THEN
   SELECT greatest(coalesce(max(legacy_id),0),1000000)+1 INTO v_numeric_id FROM public.players;
   UPDATE public.players SET legacy_id=v_numeric_id WHERE player_key=v_player.player_key RETURNING * INTO v_player;
 END IF;
 UPDATE public.demons SET verifier_user_id=v_player.legacy_id
 WHERE verifier=p_verifier_name AND verifier_user_id IS NULL;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_player.legacy_id IS NULL THEN
   RAISE EXCEPTION 'La fiche joueur % ne possède pas de legacy_id : liaison impossible sans identifiant numérique',v_player.username;
 END IF;
 IF v_count=0 THEN RAISE EXCEPTION 'Aucun niveau non lié pour ce vérificateur'; END IF;
 INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
 VALUES(auth.uid(),'LINK_VERIFIER',v_player.player_key,format('crédit=%s; niveaux=%s',p_verifier_name,v_count));
 RETURN jsonb_build_object('updated',v_count,'player_key',v_player.player_key);
END $$;
REVOKE ALL ON FUNCTION public.dlfr_link_verifier(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_link_verifier(text,text,text) TO authenticated;
COMMIT;

-- Installer après les migrations 26, 34 et 44. Aucun changement de classement à l'installation.
BEGIN;
CREATE OR REPLACE FUNCTION public.dlfr_compact_nlw(p_execute boolean DEFAULT false,p_preview_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE plan jsonb; blockers jsonb; signature text; e jsonb; spare bigint; n integer;
BEGIN
 IF NOT coalesce(public.dlfr_can_moderate(),false) THEN RAISE EXCEPTION 'Supermodération requise'; END IF;
 PERFORM pg_advisory_xact_lock(41028,2);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'old_position',position,'new_position',target) ORDER BY position),'[]') INTO plan
 FROM (SELECT id,name,position,150+row_number() OVER(ORDER BY position,id) target FROM public.demons
       WHERE is_public AND legacy IS NOT TRUE AND unrated IS NOT TRUE AND position BETWEEN 151 AND 99999998) s;
 n:=jsonb_array_length(plan);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'old_position',position) ORDER BY position),'[]') INTO blockers
 FROM public.demons WHERE position BETWEEN 151 AND 150+n AND NOT(is_public AND legacy IS NOT TRUE AND unrated IS NOT TRUE);
 signature:=md5(plan::text||blockers::text);
 IF p_execute THEN
   IF p_preview_hash IS DISTINCT FROM signature THEN RAISE EXCEPTION 'Classement modifié : recharge l’aperçu'; END IF;
   -- Positions temporaires Rated, distinctes des UNRATED et sans collision d'index unique.
   SELECT greatest(coalesce(max(position),150),150+n)+1 INTO spare FROM public.demons WHERE position<100000000;
   IF spare+n+jsonb_array_length(blockers)>=99999999 THEN RAISE EXCEPTION 'Pas assez de positions temporaires'; END IF;
   FOR e IN SELECT value FROM jsonb_array_elements(blockers||plan) LOOP
     UPDATE public.demons SET position=spare WHERE id=(e->>'id')::bigint;
     IF e->>'new_position' IS NULL THEN
       INSERT INTO public.demon_position_history(demon_id,old_position,new_position,note)
       VALUES((e->>'id')::bigint,(e->>'old_position')::int,spare,'Rangement technique : compactage NLW');
     END IF;
     spare:=spare+1;
   END LOOP;
   FOR e IN SELECT value FROM jsonb_array_elements(plan) LOOP
     UPDATE public.demons SET position=(e->>'new_position')::int WHERE id=(e->>'id')::bigint;
     IF e->>'old_position'<>e->>'new_position' THEN
       INSERT INTO public.demon_position_history(demon_id,old_position,new_position,note)
       VALUES((e->>'id')::bigint,(e->>'old_position')::int,(e->>'new_position')::int,'Rangs NLW rapprochés');
     END IF;
   END LOOP;
   INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
   VALUES(auth.uid(),'COMPACT_NLW',signature,format('%s niveaux ; %s fiches techniques déplacées',n,jsonb_array_length(blockers)));
 END IF;
 RETURN jsonb_build_object('entries',plan,'blockers',blockers,'preview_hash',signature,'executed',p_execute);
END $$;
REVOKE ALL ON FUNCTION public.dlfr_compact_nlw(boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_compact_nlw(boolean,text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.dlfr_verification_claims(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 demon_id bigint NOT NULL REFERENCES public.demons(id),
 auth_user_id uuid NOT NULL REFERENCES auth.users(id),
 player_key text NOT NULL REFERENCES public.players(player_key),
 video_url text NOT NULL, message text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
 reviewed_by uuid REFERENCES auth.users(id), review_note text,
 previous_verifier jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS dlfr_one_pending_verifier_claim ON public.dlfr_verification_claims(demon_id,player_key) WHERE status='pending';
ALTER TABLE public.dlfr_verification_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dlfr_verification_claims FROM PUBLIC,anon,authenticated;
-- Lecture/écriture par RPC uniquement : identité et droits recalculés côté serveur.
CREATE OR REPLACE FUNCTION public.dlfr_claim_review_allowed(p_position int)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(public.dlfr_can_moderate(),false) OR coalesce(public.dlfr_record_review_allowed(p_position),false);
$$;
REVOKE ALL ON FUNCTION public.dlfr_claim_review_allowed(int) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.dlfr_submit_verification_claim(p_demon_id bigint,p_video_url text,p_message text DEFAULT '')
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k text; result_id bigint; d public.demons%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 SELECT player_key INTO k FROM public.player_profile_owners WHERE auth_user_id=auth.uid();
 IF k IS NULL THEN RAISE EXCEPTION 'Lie ou crée ta fiche joueur avant de revendiquer une vérification'; END IF;
 SELECT * INTO d FROM public.demons WHERE id=p_demon_id AND is_public;
 IF NOT FOUND THEN RAISE EXCEPTION 'Niveau public introuvable'; END IF;
 IF p_video_url IS NULL OR p_video_url !~ '^https://[^[:space:]]+$' OR length(p_video_url)>2048 THEN RAISE EXCEPTION 'Vidéo HTTPS requise'; END IF;
 IF length(coalesce(p_message,''))>2000 THEN RAISE EXCEPTION 'Message trop long'; END IF;
 IF EXISTS(SELECT 1 FROM public.players WHERE player_key=k AND legacy_id=d.verifier_user_id) THEN
   RAISE EXCEPTION 'Tu es déjà le vérificateur lié à ce niveau'; END IF;
 INSERT INTO public.dlfr_verification_claims(demon_id,auth_user_id,player_key,video_url,message)
 VALUES(p_demon_id,auth.uid(),k,p_video_url,coalesce(p_message,'')) RETURNING id INTO result_id;
 RETURN result_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Tu as déjà une demande en attente pour ce niveau';
END $$;
REVOKE ALL ON FUNCTION public.dlfr_submit_verification_claim(bigint,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_submit_verification_claim(bigint,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dlfr_verification_claim_list()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(item ORDER BY item->>'created_at' DESC),'[]') FROM (
 SELECT jsonb_build_object('id',c.id,'demon_id',d.id,'level_name',d.name,'position',d.position,
   'player_key',c.player_key,'player_name',p.username,'video_url',c.video_url,'message',c.message,
   'status',c.status,'created_at',c.created_at,'review_note',c.review_note,'current_verifier',d.verifier,
   'current_video',d.verifier_video_url,'can_review',public.dlfr_claim_review_allowed(d.position),
   'snapshot',md5(jsonb_build_array(d.verifier,d.verifier_user_id,d.verifier_video_url,d.video_url)::text)) item
 FROM public.dlfr_verification_claims c JOIN public.demons d ON d.id=c.demon_id
 JOIN public.players p ON p.player_key=c.player_key
 WHERE c.auth_user_id=auth.uid() OR (c.status='pending' AND public.dlfr_claim_review_allowed(d.position))
 ) s;
$$;
REVOKE ALL ON FUNCTION public.dlfr_verification_claim_list() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_verification_claim_list() TO authenticated;

CREATE OR REPLACE FUNCTION public.dlfr_review_verification_claim(
 p_claim_id bigint,p_accept boolean,p_snapshot text,p_note text DEFAULT '',p_previous_player_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.dlfr_verification_claims%ROWTYPE; d public.demons%ROWTYPE;
 winner public.players%ROWTYPE; previous public.players%ROWTYPE;
 old_name text; old_video text; matches int; numeric_id bigint; record_id bigint; saved jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_accept IS NULL THEN RAISE EXCEPTION 'Décision authentifiée requise'; END IF;
 IF length(coalesce(p_note,''))>2000 THEN RAISE EXCEPTION 'Motif trop long'; END IF;
 PERFORM pg_advisory_xact_lock(41028,2);
 PERFORM pg_advisory_xact_lock(64423,3);
 SELECT * INTO c FROM public.dlfr_verification_claims WHERE id=p_claim_id FOR UPDATE;
 IF NOT FOUND OR c.status<>'pending' THEN RAISE EXCEPTION 'Demande absente ou déjà traitée'; END IF;
 SELECT * INTO d FROM public.demons WHERE id=c.demon_id FOR UPDATE;
 IF NOT public.dlfr_claim_review_allowed(d.position) THEN RAISE EXCEPTION 'Modération non autorisée sur ce niveau'; END IF;
 IF NOT p_accept THEN
   IF nullif(btrim(p_note),'') IS NULL THEN RAISE EXCEPTION 'Motif du refus requis'; END IF;
   UPDATE public.dlfr_verification_claims SET status='rejected',review_note=p_note,reviewed_at=now(),reviewed_by=auth.uid() WHERE id=c.id;
 ELSE
   IF NOT d.is_public THEN RAISE EXCEPTION 'Ce niveau n’est plus public'; END IF;
   IF p_snapshot IS DISTINCT FROM md5(jsonb_build_array(d.verifier,d.verifier_user_id,d.verifier_video_url,d.video_url)::text) THEN
     RAISE EXCEPTION 'Le vérificateur a changé : actualise les demandes avant de décider'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.player_profile_owners WHERE player_key=c.player_key AND auth_user_id=c.auth_user_id) THEN
     RAISE EXCEPTION 'Le demandeur ne possède plus la fiche joueur'; END IF;
   SELECT * INTO winner FROM public.players WHERE player_key=c.player_key FOR UPDATE;
   old_name:=nullif(btrim(d.verifier),'');
   IF lower(old_name) IN ('à renseigner','a renseigner','inconnu','non renseigné','aredl','—','-') THEN old_name:=NULL; END IF;
   old_video:=coalesce(nullif(d.verifier_video_url,''),nullif(d.video_url,''));
   IF d.verifier_user_id IS NOT NULL THEN
     SELECT * INTO previous FROM public.players WHERE legacy_id=d.verifier_user_id;
   END IF;
   IF previous.player_key IS NULL AND old_name IS NOT NULL THEN
     IF nullif(p_previous_player_key,'') IS NOT NULL THEN
       SELECT * INTO previous FROM public.players WHERE player_key=p_previous_player_key;
       IF NOT FOUND THEN RAISE EXCEPTION 'Ancien joueur sélectionné introuvable'; END IF;
     ELSE
       SELECT count(*) INTO matches FROM public.players WHERE lower(btrim(username))=lower(old_name) OR lower(player_key)=lower(old_name);
       IF matches>1 THEN RAISE EXCEPTION 'Ancien vérificateur ambigu : sélectionne sa fiche'; END IF;
       SELECT * INTO previous FROM public.players WHERE lower(btrim(username))=lower(old_name) OR lower(player_key)=lower(old_name);
       IF previous.player_key IS NULL THEN
         -- Une simple fiche historique, jamais un compte Auth ni une revendication de profil.
         INSERT INTO public.players(player_key,username,display_name,has_account)
         VALUES('verifier_'||replace(gen_random_uuid()::text,'-',''),old_name,old_name,false) RETURNING * INTO previous;
       END IF;
     END IF;
   END IF;
   saved:=jsonb_build_object('name',d.verifier,'user_id',d.verifier_user_id,'video_url',old_video,'player_key',previous.player_key);
   IF previous.player_key IS NOT NULL AND previous.player_key<>winner.player_key THEN
     SELECT count(*),min(id) INTO matches,record_id FROM public.completions WHERE demon_id=d.id
       AND (lower(btrim(player))=lower(previous.player_key) OR lower(btrim(player))=lower(previous.username));
     IF matches>1 THEN RAISE EXCEPTION 'Plusieurs records pour l’ancien vérificateur : fusionne-les avant validation'; END IF;
     IF record_id IS NULL THEN
       INSERT INTO public.completions(demon_id,player,progress,video_url) VALUES(d.id,previous.player_key,100,old_video);
     ELSE
       saved:=saved||jsonb_build_object('previous_completion',(SELECT to_jsonb(r) FROM public.completions r WHERE r.id=record_id));
       UPDATE public.completions SET player=previous.player_key,progress=100,
         video_url=CASE WHEN progress<100 THEN old_video ELSE coalesce(nullif(video_url,''),old_video) END WHERE id=record_id;
     END IF;
   END IF;
   IF winner.legacy_id IS NULL THEN
     SELECT greatest(coalesce(max(legacy_id),0),1000000)+1 INTO numeric_id FROM public.players;
     UPDATE public.players SET legacy_id=numeric_id WHERE player_key=winner.player_key RETURNING * INTO winner;
   END IF;
   UPDATE public.demons SET verifier=winner.username,verifier_user_id=winner.legacy_id,
     verifier_video_url=c.video_url,
     video_url=CASE WHEN nullif(video_url,'') IS NULL OR video_url=d.verifier_video_url THEN c.video_url ELSE video_url END
     WHERE id=d.id;
   UPDATE public.dlfr_verification_claims SET status='accepted',review_note=p_note,reviewed_at=now(),reviewed_by=auth.uid(),previous_verifier=saved WHERE id=c.id;
 END IF;
 INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
 VALUES(auth.uid(),'VERIFICATION_CLAIM_REVIEW',c.id::text,jsonb_build_object('accepted',p_accept,'demon_id',d.id,'previous',saved,'note',p_note)::text);
 RETURN jsonb_build_object('accepted',p_accept,'previous_player_key',previous.player_key);
END $$;
REVOKE ALL ON FUNCTION public.dlfr_review_verification_claim(bigint,boolean,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_review_verification_claim(bigint,boolean,text,text,text) TO authenticated;
COMMIT;

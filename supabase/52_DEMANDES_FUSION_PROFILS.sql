-- DLFR 52 : demandes de fusion de FICHES joueurs depuis Mon profil.
-- Prerequis : migrations 33 (fusion de fiches) et 51 (sources archivees).
-- Les comptes Auth/Discord et leurs permissions ne sont jamais fusionnes.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dlfr_player_merge_requests (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 requester_auth_user_id uuid NOT NULL,
 source_key text NOT NULL REFERENCES public.players(player_key),
 target_key text NOT NULL REFERENCES public.players(player_key),
 message text NOT NULL DEFAULT '',
 proof_url text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 reviewed_by uuid,
 moderator_note text NOT NULL DEFAULT '',
 merge_id bigint REFERENCES public.dlfr_player_merges(id),
 CONSTRAINT dlfr_player_merge_request_distinct CHECK (source_key <> target_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS dlfr_player_merge_request_pending_source
 ON public.dlfr_player_merge_requests(source_key) WHERE status='pending';
CREATE INDEX IF NOT EXISTS dlfr_player_merge_requests_requester
 ON public.dlfr_player_merge_requests(requester_auth_user_id,created_at DESC);
ALTER TABLE public.dlfr_player_merge_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dlfr_player_merge_requests FROM PUBLIC,anon,authenticated;

-- Liste des sources encore libres. Donnees deja publiques (cles et pseudos uniquement).
CREATE OR REPLACE FUNCTION public.dlfr_player_merge_candidates()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('player_key',p.player_key,'username',p.username)
        ORDER BY lower(p.username),p.player_key),'[]'::jsonb) INTO v_result
 FROM public.players p
 WHERE NOT EXISTS (SELECT 1 FROM public.player_profile_owners o WHERE o.player_key=p.player_key)
   AND NOT EXISTS (SELECT 1 FROM public.dlfr_player_merges m WHERE m.source_key=p.player_key)
   AND NOT EXISTS (SELECT 1 FROM public.profile_claim_requests c WHERE c.player_key=p.player_key AND c.status='pending')
   AND NOT EXISTS (SELECT 1 FROM public.dlfr_player_merge_requests r WHERE r.source_key=p.player_key AND r.status='pending');
 RETURN v_result;
END $$;

-- Le profil a conserver est resolu exclusivement depuis le compte Auth courant.
CREATE OR REPLACE FUNCTION public.dlfr_request_player_merge(
 p_source_key text, p_message text DEFAULT '', p_proof_url text DEFAULT '')
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_auth uuid := auth.uid(); v_target text; v_source text := btrim(coalesce(p_source_key,''));
 v_message text := btrim(coalesce(p_message,'')); v_url text := btrim(coalesce(p_proof_url,'')); v_id bigint;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 SELECT o.player_key INTO v_target FROM public.player_profile_owners o
 WHERE o.auth_user_id=v_auth LIMIT 1;
 IF v_target IS NULL THEN RAISE EXCEPTION 'Associe d''abord une fiche joueur a ton compte'; END IF;
 IF v_source='' OR v_source=v_target THEN RAISE EXCEPTION 'Choisis une autre fiche joueur'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.players p WHERE p.player_key=v_source) THEN RAISE EXCEPTION 'Fiche source introuvable'; END IF;
 IF length(v_message)>600 OR length(v_url)>500 THEN RAISE EXCEPTION 'Message ou lien trop long'; END IF;
 IF length(v_message)<15 AND v_url='' THEN RAISE EXCEPTION 'Ajoute une justification ou un lien de preuve'; END IF;
 IF v_url<>'' AND (v_url !~* '^https://[^[:space:]]+$') THEN RAISE EXCEPTION 'Lien HTTPS requis'; END IF;
 IF EXISTS (SELECT 1 FROM public.player_profile_owners o WHERE o.player_key=v_source) THEN
   RAISE EXCEPTION 'Cette fiche est deja liee a un compte : contacte la moderation';
 END IF;
 IF EXISTS (SELECT 1 FROM public.dlfr_player_merges m WHERE m.source_key IN (v_source,v_target)) THEN
   RAISE EXCEPTION 'Une des fiches est deja archivee par une fusion';
 END IF;
 IF EXISTS (SELECT 1 FROM public.profile_claim_requests c WHERE c.player_key=v_source AND c.status='pending') THEN
   RAISE EXCEPTION 'Cette fiche fait deja l''objet d''une revendication';
 END IF;
 IF EXISTS (SELECT 1 FROM public.dlfr_player_merge_requests r WHERE r.source_key=v_source AND r.status='pending') THEN
   RAISE EXCEPTION 'Une demande est deja en attente pour cette fiche';
 END IF;
 IF (SELECT count(*) FROM public.dlfr_player_merge_requests r
     WHERE r.requester_auth_user_id=v_auth AND r.status='pending') >= 3 THEN
   RAISE EXCEPTION 'Trois demandes en attente maximum par compte';
 END IF;
 IF EXISTS (SELECT 1 FROM public.dlfr_player_merge_requests r
      WHERE r.requester_auth_user_id=v_auth AND r.created_at>now()-interval '5 minutes') THEN
   RAISE EXCEPTION 'Attends cinq minutes avant une nouvelle demande';
 END IF;
 INSERT INTO public.dlfr_player_merge_requests(requester_auth_user_id,source_key,target_key,message,proof_url)
 VALUES(v_auth,v_source,v_target,v_message,v_url) RETURNING id INTO v_id;
 RETURN v_id;
END $$;

-- Retourne uniquement ses demandes personnelles ou les demandes de l'equipe supermodo.
CREATE OR REPLACE FUNCTION public.dlfr_player_merge_request_list()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_auth uuid := auth.uid(); v_staff boolean; v_result jsonb;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.staff_roles s WHERE s.auth_user_id=v_auth
   AND s.role IN ('owner','editor','supermoderator')) INTO v_staff;
 SELECT COALESCE(jsonb_agg((to_jsonb(q) - 'pending_first') ORDER BY q.pending_first,q.created_at DESC),'[]'::jsonb)
 INTO v_result FROM (
   SELECT r.id,r.source_key,r.target_key,src.username AS source_username,dst.username AS target_username,
          r.message,r.proof_url,r.status,r.created_at,r.resolved_at,r.moderator_note,
          CASE WHEN r.status='pending' THEN 0 ELSE 1 END AS pending_first
   FROM public.dlfr_player_merge_requests r
   JOIN public.players src ON src.player_key=r.source_key
   JOIN public.players dst ON dst.player_key=r.target_key
   WHERE v_staff OR r.requester_auth_user_id=v_auth
   ORDER BY CASE WHEN r.status='pending' THEN 0 ELSE 1 END,r.created_at DESC
   LIMIT 100
 ) q;
 RETURN v_result;
END $$;

-- Acceptation : appelle la fusion EXISTANTE dans la meme transaction.
-- Si la fusion echoue, la demande reste pending (rollback atomique).
CREATE OR REPLACE FUNCTION public.dlfr_review_player_merge_request(
 p_request_id bigint,p_accept boolean,p_note text DEFAULT '',p_confirmation text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_auth uuid := auth.uid(); v_req public.dlfr_player_merge_requests%ROWTYPE;
 v_info jsonb; v_merge_id bigint; v_note text := btrim(coalesce(p_note,''));
BEGIN
 IF v_auth IS NULL OR NOT EXISTS (SELECT 1 FROM public.staff_roles s
   WHERE s.auth_user_id=v_auth AND s.role IN ('owner','editor','supermoderator')) THEN
   RAISE EXCEPTION 'Supermoderateur requis';
 END IF;
 IF length(v_note)>500 THEN RAISE EXCEPTION 'Note trop longue'; END IF;
 SELECT * INTO v_req FROM public.dlfr_player_merge_requests r
 WHERE r.id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
 IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Demande deja traitee'; END IF;
 IF p_accept THEN
   IF p_confirmation <> 'FUSIONNER' THEN RAISE EXCEPTION 'Confirmation FUSIONNER requise'; END IF;
   IF NOT EXISTS (SELECT 1 FROM public.player_profile_owners o
     WHERE o.auth_user_id=v_req.requester_auth_user_id AND o.player_key=v_req.target_key) THEN
     RAISE EXCEPTION 'Le demandeur ne possede plus le profil a conserver';
   END IF;
   -- Cette fonction refuse deja toute source liee, revendiquee ou deja fusionnee.
   v_info:=public.dlfr_merge_players(v_req.source_key,v_req.target_key);
   v_merge_id:=(v_info->>'merge_id')::bigint;
   UPDATE public.dlfr_player_merge_requests SET status='accepted',resolved_at=now(),
       reviewed_by=v_auth,moderator_note=v_note,merge_id=v_merge_id WHERE id=v_req.id;
   RETURN jsonb_build_object('status','accepted','merge_id',v_merge_id,'preview',v_info);
 ELSE
   UPDATE public.dlfr_player_merge_requests SET status='rejected',resolved_at=now(),
       reviewed_by=v_auth,moderator_note=v_note WHERE id=v_req.id;
   RETURN jsonb_build_object('status','rejected');
 END IF;
END $$;

REVOKE ALL ON FUNCTION public.dlfr_player_merge_candidates(),
 public.dlfr_request_player_merge(text,text,text),
 public.dlfr_player_merge_request_list(),
 public.dlfr_review_player_merge_request(bigint,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_player_merge_candidates(),
 public.dlfr_request_player_merge(text,text,text),
 public.dlfr_player_merge_request_list(),
 public.dlfr_review_player_merge_request(bigint,boolean,text,text) TO authenticated;
COMMIT;

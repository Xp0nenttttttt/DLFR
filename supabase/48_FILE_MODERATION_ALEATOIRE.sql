-- DLFR : reservations de soumissions, avec attribution aleatoire et anti-collision.
-- A appliquer APRES les migrations de modération et de soumissions (notamment 26 et 46).
-- Aucune soumission, complétion ni niveau existant n'est modifié par l'installation.
BEGIN;

CREATE TABLE IF NOT EXISTS public.dlfr_review_assignments (
 submission_id bigint PRIMARY KEY REFERENCES public.level_submissions(id) ON DELETE CASCADE,
 moderator_id uuid NOT NULL REFERENCES auth.users(id),
 claimed_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS dlfr_review_assignments_moderator ON public.dlfr_review_assignments(moderator_id, expires_at DESC);
ALTER TABLE public.dlfr_review_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dlfr_review_assignments FROM PUBLIC, anon, authenticated;

-- Seulement les soumissions d'un niveau publie et non ambigu, dans le champ
-- d'action du modo. Les cas ambigus restent dans la file des supermodos.
CREATE OR REPLACE FUNCTION public.dlfr_review_queue_status()
RETURNS TABLE(id bigint,level_name text,player text,progress integer,
 video_url text,raw_footage_url text,position integer,demon_id bigint,
 claim_status text,claim_expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s.id,s.level_name,s.player,s.progress,s.video_url,s.raw_footage_url,
        d.position,d.id,
        CASE WHEN a.expires_at>now() AND a.moderator_id=auth.uid() THEN 'mine'
             WHEN a.expires_at>now() THEN 'other' ELSE 'free' END,
        CASE WHEN a.expires_at>now() THEN a.expires_at ELSE NULL END
 FROM public.level_submissions s
 JOIN public.demons d ON d.id=public.dlfr_review_target(s.level_id,s.level_name)
 LEFT JOIN public.dlfr_review_assignments a ON a.submission_id=s.id
 WHERE s.status='pending' AND s.progress=100 AND public.dlfr_record_review_allowed(d.position)
 ORDER BY s.created_at ASC,s.id ASC LIMIT 250;
$$;
REVOKE ALL ON FUNCTION public.dlfr_review_queue_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_review_queue_status() TO authenticated;

-- Reservation atomique. p_submission_id=NULL : tirer une soumission au hasard.
-- La meme personne retrouve sa reservation actuelle au lieu d'en cumuler.
CREATE OR REPLACE FUNCTION public.dlfr_claim_review(p_submission_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid:=auth.uid(); v_id bigint; v_existing bigint; v_target bigint;
        v_position integer; v_expires timestamptz;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Connecte-toi pour prendre une soumission.'; END IF;
 -- Verrou court pour serialiser les attributions simultanees : aucun double tirage.
 PERFORM pg_advisory_xact_lock(41028, 23);
 SELECT a.submission_id INTO v_existing
 FROM public.dlfr_review_assignments a
 JOIN public.level_submissions s ON s.id=a.submission_id
 JOIN public.demons d ON d.id=public.dlfr_review_target(s.level_id,s.level_name)
 WHERE a.moderator_id=v_user AND a.expires_at>now()
   AND s.status='pending' AND public.dlfr_record_review_allowed(d.position)
 ORDER BY a.claimed_at ASC LIMIT 1;
 IF v_existing IS NOT NULL THEN
   SELECT a.expires_at INTO v_expires FROM public.dlfr_review_assignments a WHERE a.submission_id=v_existing;
   RETURN jsonb_build_object('submission_id',v_existing,'expires_at',v_expires,'already_claimed',true);
 END IF;
 IF p_submission_id IS NOT NULL THEN
   SELECT s.id,d.id,d.position INTO v_id,v_target,v_position
   FROM public.level_submissions s
   JOIN public.demons d ON d.id=public.dlfr_review_target(s.level_id,s.level_name)
   WHERE s.id=p_submission_id AND s.status='pending' AND s.progress=100
     AND public.dlfr_record_review_allowed(d.position)
   FOR UPDATE OF s NOWAIT;
   IF v_id IS NULL THEN RAISE EXCEPTION 'Cette demande est indisponible pour ton rôle.'; END IF;
   IF EXISTS(SELECT 1 FROM public.dlfr_review_assignments a
             WHERE a.submission_id=v_id AND a.expires_at>now()) THEN
      RAISE EXCEPTION 'Cette soumission est déjà prise en charge.';
   END IF;
 ELSE
   SELECT s.id,d.id,d.position INTO v_id,v_target,v_position
   FROM public.level_submissions s
   JOIN public.demons d ON d.id=public.dlfr_review_target(s.level_id,s.level_name)
   LEFT JOIN public.dlfr_review_assignments a ON a.submission_id=s.id
   WHERE s.status='pending' AND s.progress=100
     AND public.dlfr_record_review_allowed(d.position)
     AND (a.submission_id IS NULL OR a.expires_at<=now())
   ORDER BY random() LIMIT 1 FOR UPDATE OF s SKIP LOCKED;
   IF v_id IS NULL THEN RAISE EXCEPTION 'Aucune soumission libre pour le moment.'; END IF;
 END IF;
 INSERT INTO public.dlfr_review_assignments AS a
      (submission_id,moderator_id,claimed_at,expires_at)
 VALUES(v_id,v_user,now(),now()+interval '20 minutes')
 ON CONFLICT(submission_id) DO UPDATE SET moderator_id=EXCLUDED.moderator_id,
    claimed_at=EXCLUDED.claimed_at,expires_at=EXCLUDED.expires_at
 WHERE a.expires_at<=now();
 IF NOT FOUND THEN RAISE EXCEPTION 'Soumission prise par un autre modérateur.'; END IF;
 RETURN jsonb_build_object('submission_id',v_id,'expires_at',now()+interval '20 minutes','already_claimed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_claim_review(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_claim_review(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.dlfr_manage_review_claim(p_submission_id bigint,p_action text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid:=auth.uid(); v_row public.dlfr_review_assignments%ROWTYPE;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Connexion requise.'; END IF;
 IF p_action NOT IN ('release','renew') THEN RAISE EXCEPTION 'Action inconnue.'; END IF;
 PERFORM pg_advisory_xact_lock(41028,23);
 SELECT * INTO v_row FROM public.dlfr_review_assignments
 WHERE submission_id=p_submission_id FOR UPDATE;
 IF NOT FOUND OR v_row.moderator_id<>v_user THEN
   RAISE EXCEPTION 'Cette réservation ne t’appartient pas.';
 END IF;
 IF p_action='release' THEN
  DELETE FROM public.dlfr_review_assignments WHERE submission_id=p_submission_id;
  RETURN 'released';
 END IF;
 IF v_row.expires_at<=now() OR NOT EXISTS (
   SELECT 1 FROM public.level_submissions s
   JOIN public.demons d ON d.id=public.dlfr_review_target(s.level_id,s.level_name)
   WHERE s.id=p_submission_id AND s.status='pending' AND public.dlfr_record_review_allowed(d.position)
 ) THEN RAISE EXCEPTION 'Réservation expirée ou demande déjà traitée.'; END IF;
 UPDATE public.dlfr_review_assignments SET expires_at=now()+interval '20 minutes'
 WHERE submission_id=p_submission_id;
 RETURN 'renewed';
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_manage_review_claim(bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_manage_review_claim(bigint,text) TO authenticated;

-- Protection serveur : personne ne peut traiter la soumission reservee
-- par un autre modo. Les modos bornes (NLW et standard) doivent aussi
-- posseder leur propre reservation pour les 100% sur niveaux existants.
-- Supermodos : les demandes de nouveaux niveaux restent gerables directement,
-- car elles ne sont pas eligibles au tirage aleatoire avant publication.
CREATE OR REPLACE FUNCTION public.dlfr_check_review_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text;
BEGIN
 IF OLD.status='pending' AND NEW.status IN ('approved','rejected')
    AND OLD.progress=100 AND auth.role() IS DISTINCT FROM 'service_role' THEN
   IF EXISTS (SELECT 1 FROM public.dlfr_review_assignments a
     WHERE a.submission_id=OLD.id AND a.expires_at>now()
       AND a.moderator_id IS DISTINCT FROM auth.uid()) THEN
      RAISE EXCEPTION 'Cette soumission est prise en charge par un autre modérateur.';
   END IF;
   IF public.dlfr_review_target(OLD.level_id,OLD.level_name) IS NOT NULL THEN
     SELECT role INTO v_role FROM public.staff_roles WHERE auth_user_id=auth.uid();
     IF v_role IS NULL AND EXISTS(SELECT 1 FROM public.nlw_staff_roles WHERE auth_user_id=auth.uid()) THEN
       v_role:='nlw';
     END IF;
     IF v_role IN ('moderator','nlw') AND NOT EXISTS(
       SELECT 1 FROM public.dlfr_review_assignments a
       WHERE a.submission_id=OLD.id AND a.moderator_id=auth.uid() AND a.expires_at>now()
     ) THEN
       RAISE EXCEPTION 'Prends d’abord cette soumission en charge (ou renouvelle ta réservation).';
     END IF;
   END IF;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS dlfr_check_review_assignment_before_update ON public.level_submissions;
CREATE TRIGGER dlfr_check_review_assignment_before_update
 BEFORE UPDATE OF status ON public.level_submissions
 FOR EACH ROW EXECUTE FUNCTION public.dlfr_check_review_assignment();

CREATE OR REPLACE FUNCTION public.dlfr_finish_review_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.status='pending' AND NEW.status IN ('approved','rejected') THEN
  DELETE FROM public.dlfr_review_assignments WHERE submission_id=NEW.id;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS dlfr_finish_review_assignment_after_update ON public.level_submissions;
CREATE TRIGGER dlfr_finish_review_assignment_after_update
 AFTER UPDATE OF status ON public.level_submissions
 FOR EACH ROW EXECUTE FUNCTION public.dlfr_finish_review_assignment();
COMMIT;

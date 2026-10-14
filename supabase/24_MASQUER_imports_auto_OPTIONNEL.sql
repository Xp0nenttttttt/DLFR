-- FACULTATIF, à exécuter uniquement après avoir vérifié le résultat du fichier 23.
-- Masque (ne supprime pas) les fiches AREDL automatiques sans complétion,
-- soumission approuvée ni trace d'une publication manuelle connue.
-- Sauvegarder public.demons avant exécution !
BEGIN;
CREATE TABLE IF NOT EXISTS public.dlfr_manual_only_hide_log (
 demon_id bigint PRIMARY KEY REFERENCES public.demons(id) ON DELETE CASCADE,
 original_position integer NOT NULL,
 hidden_at timestamptz NOT NULL DEFAULT now(),
 reason text NOT NULL DEFAULT 'Import automatique AREDL sans validation humaine détectée'
);
ALTER TABLE public.dlfr_manual_only_hide_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dlfr_manual_only_hide_log FROM anon,authenticated;
WITH candidates AS (
 SELECT d.id,d.position FROM public.demons d
 WHERE d.is_public IS TRUE AND d.data_source='aredl' AND d.publisher='AREDL'
  AND NOT EXISTS (SELECT 1 FROM public.completions c WHERE c.demon_id=d.id)
  AND NOT EXISTS (SELECT 1 FROM public.level_submissions s WHERE s.demon_id=d.id AND s.status='approved')
  AND NOT EXISTS(SELECT 1 FROM public.dlfr_aredl_level_stage s WHERE s.aredl_id=d.aredl_id AND s.evidence_state='complete' AND s.review_state='approved')
  AND NOT EXISTS(SELECT 1 FROM public.community_audit_log a WHERE
    a.action_key IN ('PUBLISH_AREDL','PUBLISH_APPROVED_SUBMISSION','MANUAL_LEVEL_PUBLISH')
    AND (a.target=d.id::text OR a.details LIKE 'dlfr_id='||d.id::text||',%'))
), log AS (
 INSERT INTO public.dlfr_manual_only_hide_log(demon_id,original_position)
 SELECT id,position FROM candidates ON CONFLICT(demon_id) DO NOTHING
 RETURNING demon_id
), updated AS (
 UPDATE public.demons d SET is_public=false FROM candidates c
 WHERE d.id=c.id RETURNING d.id
)
SELECT count(*) AS niveaux_masques FROM updated;
COMMIT;
-- Aucune position n'est libérée automatiquement : elles peuvent être occupées
-- par des fiches masquées ; la création manuelle peut décaler les rangs Rated.

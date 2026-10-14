-- LECTURE SEULE : candidats issus de l'import AREDL global encore visibles.
-- Avant toute action, vérifier les noms, rangs, et si une fiche a déjà été revue manuellement.
SELECT d.id,d.position,d.name,d.level_id,d.data_source,d.is_public,
       (SELECT count(*) FROM public.completions c WHERE c.demon_id=d.id) AS records,
       EXISTS(SELECT 1 FROM public.level_submissions s WHERE s.demon_id=d.id AND s.status='approved') AS soumission_acceptee
FROM public.demons d
WHERE d.is_public IS TRUE AND d.data_source='aredl' AND d.publisher='AREDL'
  AND NOT EXISTS(SELECT 1 FROM public.completions c WHERE c.demon_id=d.id)
  AND NOT EXISTS(SELECT 1 FROM public.level_submissions s WHERE s.demon_id=d.id AND s.status='approved')
  AND NOT EXISTS(SELECT 1 FROM public.dlfr_aredl_level_stage s WHERE s.aredl_id=d.aredl_id AND s.evidence_state='complete' AND s.review_state='approved')
  AND NOT EXISTS(SELECT 1 FROM public.community_audit_log a WHERE
    (a.action_key IN ('PUBLISH_AREDL','PUBLISH_APPROVED_SUBMISSION','MANUAL_LEVEL_PUBLISH'))
    AND (a.target=d.id::text OR a.details LIKE 'dlfr_id='||d.id::text||',%'))
ORDER BY d.position,d.id;

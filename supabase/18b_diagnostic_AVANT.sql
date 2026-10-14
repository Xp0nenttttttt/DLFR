-- LECTURE SEULE. À lancer AVANT le SQL 19 pour mesurer le nettoyage.
SELECT COUNT(*) AS fiches_import_catalogue_non_enrichies
FROM public.demons d
JOIN public.dlfr_aredl_level_stage s ON s.aredl_id=d.aredl_id
WHERE d.data_source='aredl' AND d.publisher='AREDL'
  AND d.position=s.aredl_rank AND d.name=s.aredl_name
  AND coalesce(nullif(btrim(d.verifier),''),nullif(btrim(d.video_url),''),
               nullif(btrim(d.verifier_video_url),''),nullif(btrim(d.first_frbe_player),'')) IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.completions c WHERE c.demon_id=d.id);
SELECT d.id,d.position,d.name,d.aredl_id,d.data_source,
       (SELECT COUNT(*) FROM public.completions c WHERE c.demon_id=d.id) AS completions
FROM public.demons d ORDER BY d.position LIMIT 20;

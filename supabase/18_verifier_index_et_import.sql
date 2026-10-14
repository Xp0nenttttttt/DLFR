-- À lancer APRÈS le SQL 17 pour contrôler l'état ; lecture seule.
-- L'index dlfr_dem_gd_id_unique doit être ABSENT de ce résultat.
SELECT indexname, indexdef FROM pg_indexes
 WHERE schemaname='public' AND tablename='demons'
 AND indexname IN ('dlfr_dem_gd_id_unique', 'dlfr_dem_aredl_id_unique',
                   'dlfr_dem_manual_gd_unique', 'dlfr_dem_aredl_variant_unique')
 ORDER BY indexname;

-- Le nombre de niveaux déjà présents ne doit pas avoir baissé.
SELECT count(*) AS total_demons, count(aredl_id) AS avec_identifiant_aredl
 FROM public.demons;

-- Après la relance : les paires Solo / 2P partageront un GD ID,
-- mais seront différenciées par l'ID AREDL et le mode.
SELECT level_id, count(*) AS variantes,
       string_agg(coalesce(aredl_id, 'manuel') || ' / ' || completion_mode, ' ; '
                  ORDER BY aredl_rank NULLS LAST) AS details
 FROM public.demons WHERE nullif(btrim(level_id), '') IS NOT NULL
 GROUP BY level_id HAVING count(*) > 1 ORDER BY variantes DESC, level_id LIMIT 30;

-- Lecture seule : anciennes fiches hors Top 150, liens et records importés.
SELECT l.legacy_id,l.old_position,l.name AS nom_historique,l.level_id AS gd_historique,
 m.mapping_source,d.id AS demon_id,d.name AS nom_supabase,d.position AS position_supabase,
 d.is_public,d.data_source,
 (SELECT count(*) FROM public.completions c WHERE c.demon_id=d.id AND c.progress=100) AS completions_100
FROM dlfr_legacy.levels l
LEFT JOIN dlfr_legacy.level_links m ON m.legacy_id=l.legacy_id
LEFT JOIN public.demons d ON d.id=m.demon_id
WHERE l.old_position>150
ORDER BY l.old_position;

-- Crédits AREDL à corriger, avec valeurs historiques si déjà rapprochées :
SELECT d.id,d.position,d.name,d.creator,d.publisher,
 l.source->>'creator' AS ancien_createur,l.source->>'publisher' AS ancien_publieur
FROM public.demons d LEFT JOIN dlfr_legacy.level_links m ON m.demon_id=d.id
LEFT JOIN dlfr_legacy.levels l ON l.legacy_id=m.legacy_id
WHERE d.is_public IS TRUE AND d.position BETWEEN 1 AND 150
AND (lower(btrim(coalesce(d.publisher,'')))='aredl' OR lower(btrim(coalesce(d.creator,'')))='aredl')
ORDER BY d.position;

-- Aucune écriture. Exécuter après 01 et 02.
SELECT 'sauvegarde_niveaux' AS indicateur, count(*) AS valeur FROM dlfr_legacy.levels
UNION ALL SELECT 'sauvegarde_records',count(*) FROM dlfr_legacy.records
UNION ALL SELECT 'sauvegarde_utilisateurs',count(*) FROM dlfr_legacy.players
UNION ALL SELECT 'top75_avec_seuil_particulier',count(*) FROM dlfr_legacy.levels WHERE old_position <= 75 AND requirement <100
UNION ALL SELECT 'records_partiels',count(*) FROM dlfr_legacy.records WHERE progress<100;
-- Identifier les niveaux : vérifier les candidats et les collisions ID GD/nom.
SELECT l.legacy_id,l.old_position,l.name,l.level_id,l.requirement,
  (SELECT count(*) FROM public.demons d WHERE lower(trim(d.name))=lower(trim(l.name))) AS meme_nom,
  (SELECT count(*) FROM public.demons d WHERE l.level_id IS NOT NULL AND trim(d.level_id)=trim(l.level_id)) AS meme_id_gd,
  (SELECT string_agg(d.id::text || ':' || d.name || ' (GD=' || coalesce(d.level_id,'?') || ', pos=' || d.position || ')',' / ')
     FROM public.demons d WHERE lower(trim(d.name))=lower(trim(l.name)) OR
      (l.level_id IS NOT NULL AND trim(d.level_id)=trim(l.level_id))) AS candidats
FROM dlfr_legacy.levels l
WHERE (SELECT count(*) FROM public.demons d WHERE lower(trim(d.name))=lower(trim(l.name)) OR
      (l.level_id IS NOT NULL AND trim(d.level_id)=trim(l.level_id)))<>1
ORDER BY l.old_position;
-- Exigences du Top 75, telles qu'elles existent dans l'archive historique.
SELECT old_position, name, requirement FROM dlfr_legacy.levels
WHERE old_position <=75 ORDER BY old_position;

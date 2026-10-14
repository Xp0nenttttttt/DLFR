-- Rapport final : à lire AVANT d'afficher les niveaux historiques.
SELECT l.old_position AS position_historique,l.name,l.level_id,l.requirement,
 m.demon_id,d.position AS position_actuelle,d.is_public,
 CASE WHEN m.demon_id IS NULL THEN 'CONFLIT A RESOUDRE'
      WHEN d.is_public AND d.position=l.old_position THEN 'PUBLIC AU MEME RANG'
      WHEN d.is_public THEN 'PUBLIC AUTRE RANG (CONSERVER LA DECISION DLFR)'
      ELSE 'CACHE : A PUBLIER MANUELLEMENT' END AS etat
FROM dlfr_legacy.levels l
LEFT JOIN dlfr_legacy.level_links m ON m.legacy_id=l.legacy_id
LEFT JOIN public.demons d ON d.id=m.demon_id
ORDER BY l.old_position;
-- Liste des seuils Top 75 transférés ou en conflit.
SELECT l.old_position,l.name,l.requirement AS minimum_archive,
 d.requirement AS minimum_actuel
FROM dlfr_legacy.levels l JOIN dlfr_legacy.level_links m ON m.legacy_id=l.legacy_id
JOIN public.demons d ON d.id=m.demon_id
WHERE l.old_position<=75 ORDER BY l.old_position;
-- Records de progression, sans compter comme victoires.
SELECT d.name,c.player,c.progress,c.video_url,c.created_at
FROM dlfr_legacy.records r JOIN dlfr_legacy.level_links m ON m.legacy_id=r.old_demon_id
JOIN public.completions c ON c.demon_id=m.demon_id AND lower(trim(c.player))=lower(trim(r.player))
JOIN public.demons d ON d.id=c.demon_id
WHERE r.progress<100
ORDER BY d.position;
-- PAS de publication automatique : les anciennes positions peuvent être occupées
-- par tes niveaux manuels. Pour chaque fiche masquée à valider, utilise le panneau
-- "Modération > Niveaux" et choisis la position DLFR souhaitée.
-- Si tu souhaites publier tous les 150 rangs d'un coup, il faudra d'abord
-- comparer la liste ci-dessus avec le classement actuel pour décider des conflits.

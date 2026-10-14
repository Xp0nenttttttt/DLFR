-- Diagnostic : joueurs historiques avec completions a 100%, badges reels, records masques.
-- Aucun changement de donnees.
SELECT p.player_key,
 COUNT(DISTINCT c.id) FILTER (WHERE c.progress=100) AS records_100_importes,
 COUNT(DISTINCT c.demon_id) FILTER (WHERE c.progress=100 AND d.is_public IS TRUE
     AND d.position BETWEEN 1 AND 150 AND d.unrated IS NOT TRUE) AS top150_publics,
 COUNT(DISTINCT c.demon_id) FILTER (WHERE c.progress=100 AND d.is_public IS TRUE
     AND d.position BETWEEN 151 AND 99999999 AND d.unrated IS NOT TRUE
     AND d.legacy IS NOT TRUE) AS nlw_publics,
 COUNT(DISTINCT c.demon_id) FILTER (WHERE c.progress=100 AND d.is_public IS FALSE) AS niveaux_masques,
 COUNT(DISTINCT a.badge_id) AS badges_enregistres
FROM public.players p
LEFT JOIN public.completions c ON lower(btrim(c.player))=lower(btrim(p.player_key))
LEFT JOIN public.demons d ON d.id=c.demon_id
LEFT JOIN public.badge_awards a ON a.player_key=p.player_key
WHERE p.has_account IS FALSE
GROUP BY p.player_key
HAVING COUNT(DISTINCT c.id) FILTER (WHERE c.progress=100)>0
ORDER BY records_100_importes DESC,p.player_key LIMIT 100;

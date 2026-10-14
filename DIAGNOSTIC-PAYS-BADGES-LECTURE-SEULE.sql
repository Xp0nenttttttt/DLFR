-- DIAGNOSTIC EN LECTURE SEULE : ne modifie aucune donnee.
-- 1) Badges NLW deja attribues et nombre de vrais niveaux NLW publies valides.
WITH progress AS (
  SELECT p.player_key,
         count(DISTINCT d.id) FILTER (
           WHERE r.progress=100 AND d.is_public IS TRUE AND d.unrated IS FALSE
             AND d.legacy IS NOT TRUE AND d.position BETWEEN 151 AND 99999999
         ) AS nlw_publies
  FROM public.players p
  LEFT JOIN public.completions r ON lower(r.player)=lower(p.player_key)
  LEFT JOIN public.demons d ON d.id=r.demon_id
  GROUP BY p.player_key
)
SELECT a.player_key,a.badge_id,a.origin,a.obtained_at,
       p.nlw_publies,
       CASE a.badge_id
         WHEN 'bienvenue-nlw' THEN 1 WHEN 'dix-nlw' THEN 10
         WHEN 'cent' THEN 100 WHEN 'faucheur-nlw' THEN 250
         WHEN 'grand-faucheur-nlw' THEN 500 WHEN 'nlwgod' THEN 1000
       END AS seuil,
       (p.nlw_publies < CASE a.badge_id
         WHEN 'bienvenue-nlw' THEN 1 WHEN 'dix-nlw' THEN 10
         WHEN 'cent' THEN 100 WHEN 'faucheur-nlw' THEN 250
         WHEN 'grand-faucheur-nlw' THEN 500 WHEN 'nlwgod' THEN 1000
       END) AS attribution_a_verifier
FROM public.badge_awards a
JOIN progress p ON p.player_key=a.player_key
WHERE a.badge_id IN ('bienvenue-nlw','dix-nlw','cent','faucheur-nlw','grand-faucheur-nlw','nlwgod')
ORDER BY attribution_a_verifier DESC,a.player_key,a.badge_id;

-- 2) Total historique des joueurs par pays (liens Discord non requis).
SELECT COALESCE(NULLIF(btrim(country_code),''),'NON RENSEIGNÉ') AS pays,
       count(*) AS joueurs_total,
       count(*) FILTER(WHERE NOT has_account) AS joueurs_sans_compte,
       count(*) FILTER(WHERE hidden_from_stats IS TRUE) AS profils_masques
FROM public.players
GROUP BY 1
ORDER BY joueurs_total DESC,pays;

-- 3) Niveaux pouvant actuellement produire des badges NLW valides.
SELECT id,position,name,is_public,unrated,legacy
FROM public.demons
WHERE is_public IS TRUE AND unrated IS FALSE AND legacy IS NOT TRUE
  AND position BETWEEN 151 AND 99999999
ORDER BY position LIMIT 200;

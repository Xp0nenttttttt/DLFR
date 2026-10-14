-- DemonlistFrancophone - Badge historiques : calcul depuis les records SUPABASE existants.
-- Aucune importation depuis l'ancien MySQL et aucune attribution de badge manuel.
-- On ne compte que les records a 100% associes a des demons PUBLICS et eligibles.
-- La date historique n'est pas connue : obtained_at reste NULL.
-- Compatible avec 11_production + le correctif NLW publie.
WITH joueur_counts AS (
 SELECT p.player_key,
   count(DISTINCT d.id) FILTER (WHERE c.progress=100 AND d.is_public IS TRUE
       AND d.unrated IS NOT TRUE AND d.position BETWEEN 1 AND 150) AS top150_count,
   count(DISTINCT d.id) FILTER (WHERE c.progress=100 AND d.is_public IS TRUE
       AND d.unrated IS NOT TRUE AND d.position BETWEEN 1 AND 75) AS main_count,
   count(DISTINCT d.id) FILTER (WHERE c.progress=100 AND d.is_public IS TRUE
       AND d.unrated IS NOT TRUE AND d.legacy IS NOT TRUE
       AND d.position BETWEEN 151 AND 99999999) AS nlw_count,
   count(DISTINCT d.id) FILTER (WHERE c.progress=100 AND d.is_public IS TRUE
       AND d.unrated IS TRUE) AS unrated_count
 FROM public.players p
 LEFT JOIN public.completions c
   ON lower(btrim(c.player))=lower(btrim(p.player_key))
 LEFT JOIN public.demons d ON d.id=c.demon_id
 GROUP BY p.player_key
),
totaux AS (
 SELECT
  count(*) FILTER (WHERE d.position BETWEEN 1 AND 75) AS main_total,
  count(*) FILTER (WHERE d.position BETWEEN 1 AND 150) AS top150_total
 FROM public.demons d
 WHERE d.is_public IS TRUE AND d.unrated IS NOT TRUE
),
justifies AS (
 SELECT j.player_key, b.badge_id
 FROM joueur_counts j CROSS JOIN totaux t
 CROSS JOIN LATERAL (VALUES
   ('bienvenue-club',j.top150_count>=1),
   ('dix',j.top150_count>=10),
   ('faucheur-liste',j.top150_count>=35),
   ('grand-faucheur-liste',j.top150_count>=75),
   ('cour-grands',j.main_count>=1),
   ('demi-dieu',t.main_total=75 AND j.main_count>=75),
   ('god',t.top150_total=150 AND j.top150_count>=150),
   ('bienvenue-nlw',j.nlw_count>=1),
   ('dix-nlw',j.nlw_count>=10),
   ('cent',j.nlw_count>=100),
   ('faucheur-nlw',j.nlw_count>=250),
   ('grand-faucheur-nlw',j.nlw_count>=500),
   ('nlwgod',j.nlw_count>=1000),
   ('unrated-premier',j.unrated_count>=1),
   ('unrated-master',j.unrated_count>=10)
 ) AS b(badge_id,est_justifie)
 WHERE b.est_justifie
)
SELECT j.player_key, j.badge_id
FROM justifies j
WHERE NOT EXISTS (
 SELECT 1 FROM public.badge_awards a
 WHERE a.player_key=j.player_key AND a.badge_id=j.badge_id
)
ORDER BY j.player_key,j.badge_id;

-- DIAGNOSTIC RAIN DLFR V3.2 - LECTURE SEULE, ne modifie pas Supabase.
-- A executer dans Supabase > SQL Editor apres la migration historique V3.2.
-- Si le schema dlfr_legacy n'existe pas, ne pas lancer d'import pour ce seul diagnostic.

-- 1) Les 39 records historiques de Rain : correspondance, visibilite, presence du record.
WITH historiques AS (
 SELECT r.legacy_id AS ancien_id_record, l.old_position AS ancien_rang,
        l.name AS ancien_niveau, m.demon_id, d.name AS niveau_actuel,
        d.position AS rang_actuel, d.is_public, c.id AS record_actuel_id,
        c.progress AS progression_actuelle,
        CASE
          WHEN m.demon_id IS NULL THEN 'SANS CORRESPONDANCE'
          WHEN d.id IS NULL THEN 'FICHE ABSENTE'
          WHEN c.id IS NULL THEN 'RECORD NON IMPORTE'
          WHEN d.is_public IS DISTINCT FROM true THEN 'NIVEAU MASQUE'
          WHEN d.position > coalesce((SELECT extended_limit FROM public.site_settings WHERE id = 1),150)
               THEN 'HORS CLASSEMENT ACTUEL'
          WHEN c.progress < 100 THEN 'PROGRESSION PARTIELLE'
          ELSE 'COMPTE AU CLASSEMENT ACTUEL'
        END AS diagnostic
 FROM dlfr_legacy.records r
 JOIN dlfr_legacy.levels l ON l.legacy_id=r.old_demon_id
 LEFT JOIN dlfr_legacy.level_links m ON m.legacy_id=l.legacy_id
 LEFT JOIN public.demons d ON d.id=m.demon_id
 LEFT JOIN LATERAL (
   SELECT c1.id,c1.progress FROM public.completions c1
   WHERE c1.demon_id=d.id AND lower(trim(c1.player))=lower(trim(r.player))
   ORDER BY c1.progress DESC,c1.id LIMIT 1
 ) c ON true
 WHERE lower(trim(r.player))='rain' AND r.progress=100
)
SELECT * FROM historiques ORDER BY ancien_rang, ancien_niveau;

-- 2) Resume des records historiques de Rain par statut.
WITH statuts AS (
 SELECT r.legacy_id,
        CASE
          WHEN m.demon_id IS NULL THEN 'sans_correspondance'
          WHEN d.id IS NULL THEN 'fiche_absente'
          WHEN c.id IS NULL THEN 'record_non_importe'
          WHEN d.is_public IS DISTINCT FROM true THEN 'niveau_masque'
          WHEN d.position > coalesce((SELECT extended_limit FROM public.site_settings WHERE id=1),150)
               THEN 'hors_top150_actuel'
          WHEN c.progress < 100 THEN 'progression_partielle'
          ELSE 'compte_actuellement'
        END AS etat
 FROM dlfr_legacy.records r
 LEFT JOIN dlfr_legacy.level_links m ON m.legacy_id=r.old_demon_id
 LEFT JOIN public.demons d ON d.id=m.demon_id
 LEFT JOIN LATERAL (
   SELECT c1.id,c1.progress FROM public.completions c1
   WHERE c1.demon_id=d.id AND lower(trim(c1.player))=lower(trim(r.player))
   ORDER BY c1.progress DESC,c1.id LIMIT 1
 ) c ON true
 WHERE lower(trim(r.player))='rain' AND r.progress=100
)
SELECT etat,count(*) AS nombre FROM statuts GROUP BY etat ORDER BY etat;

-- 3) Verifications rattachees a Rain sur le catalogue actuel (masquees incluses).
SELECT d.id,d.name,d.position,d.is_public,d.verifier,d.verifier_user_id,
       c.id AS completion_id,c.progress AS progression,
       CASE WHEN d.is_public IS DISTINCT FROM true THEN 'NIVEAU MASQUE'
            WHEN d.position > coalesce((SELECT extended_limit FROM public.site_settings WHERE id=1),150)
            THEN 'HORS TOP 150'
            ELSE 'ELIGIBLE SI IDENTITE RECONNUE' END AS statut
FROM public.demons d
LEFT JOIN public.completions c ON c.demon_id=d.id AND lower(trim(c.player))='rain'
WHERE lower(trim(coalesce(d.verifier,'')))='rain'
   OR EXISTS (SELECT 1 FROM public.players p
              WHERE p.player_key='rain' AND p.legacy_id IS NOT NULL
                AND p.legacy_id=d.verifier_user_id)
ORDER BY d.position,d.name;

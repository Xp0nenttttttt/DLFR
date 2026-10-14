-- Seulement les correspondances vraiment certaines (même nom + ID GD compatible).
-- Les variantes Solo/2P qui partagent un ID GD ne seront jamais associées sur l'ID seul.
BEGIN;
WITH candidates AS (
 SELECT l.legacy_id,d.id AS demon_id,
 count(*) OVER (PARTITION BY l.legacy_id) AS nb
 FROM dlfr_legacy.levels l JOIN public.demons d
 ON lower(trim(l.name))=lower(trim(d.name))
 AND (nullif(trim(l.level_id),'') IS NULL OR nullif(trim(d.level_id),'') IS NULL
      OR trim(l.level_id)=trim(d.level_id))
), unique_matches AS (
 SELECT legacy_id,demon_id FROM candidates WHERE nb=1
)
INSERT INTO dlfr_legacy.level_links(legacy_id,demon_id,mapping_source)
SELECT u.legacy_id,u.demon_id,'exact_name_compatible_gd_id'
FROM unique_matches u
WHERE NOT EXISTS(SELECT 1 FROM dlfr_legacy.level_links l WHERE l.demon_id=u.demon_id)
ON CONFLICT DO NOTHING;
COMMIT;
SELECT l.old_position,l.name,l.level_id,
 coalesce(m.demon_id::text,'A VERIFIER') AS correspondance,
 coalesce(m.mapping_source,'aucune correspondance automatique') AS decision
FROM dlfr_legacy.levels l
LEFT JOIN dlfr_legacy.level_links m ON m.legacy_id=l.legacy_id
ORDER BY l.old_position;
-- Pour une association manuelle confirmée après lecture du rapport :
-- INSERT INTO dlfr_legacy.level_links(legacy_id,demon_id,mapping_source)
-- VALUES (<ancien_id>,<id_supabase_verifie>,'manual_review') ON CONFLICT DO NOTHING;
-- Vérifier soigneusement le nom, l'ID GD et le mode Solo/2P avant cette commande.

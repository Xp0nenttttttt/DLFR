-- Exécuter APRÈS avoir vérifié les associations de niveaux (04 + 05).
-- Transfère les exigences de pourcentage de l'ancien classement sans écraser
-- un seuil actuel personnalisé différent de 100%.
-- Les 73 minimums particuliers du Top 75 et le cas particulier hors Top 75
-- sont inclus; le rang est CELUI DE L'ANCIENNE DLFR, non le rang AREDL actuel.
BEGIN;
CREATE TABLE IF NOT EXISTS dlfr_legacy.requirement_history(
 legacy_id bigint PRIMARY KEY,
 demon_id bigint NOT NULL,
 previous_requirement integer NOT NULL,
 imported_requirement integer NOT NULL,
 applied_at timestamptz NOT NULL DEFAULT now()
);
WITH candidates AS (
 SELECT m.legacy_id,m.demon_id,l.requirement,d.requirement AS current_requirement
 FROM dlfr_legacy.level_links m
 JOIN dlfr_legacy.levels l ON l.legacy_id=m.legacy_id
 JOIN public.demons d ON d.id=m.demon_id
 WHERE l.requirement <> 100 AND d.requirement=100
), logged AS (
 INSERT INTO dlfr_legacy.requirement_history(legacy_id,demon_id,previous_requirement,imported_requirement)
 SELECT legacy_id,demon_id,current_requirement,requirement FROM candidates
 ON CONFLICT DO NOTHING RETURNING demon_id,imported_requirement
)
UPDATE public.demons d SET requirement=logged.imported_requirement
FROM logged WHERE d.id=logged.demon_id;
COMMIT;
-- Tout seuil conflictuel doit être décidé manuellement.
SELECT l.old_position,l.name,l.requirement AS valeur_historique,
 d.requirement AS valeur_actuelle,m.mapping_source
FROM dlfr_legacy.level_links m
JOIN dlfr_legacy.levels l ON l.legacy_id=m.legacy_id
JOIN public.demons d ON d.id=m.demon_id
WHERE l.requirement<>d.requirement
ORDER BY l.old_position;

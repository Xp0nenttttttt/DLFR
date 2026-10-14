-- OPTIONNEL : publie uniquement les fiches historiques au rang qui est LIBRE.
-- Ne déplace JAMAIS un niveau existant et ne dépublie JAMAIS une fiche.
-- À lancer seulement APRÈS lecture des rapports 07 et sauvegarde Supabase.
-- Top 150 uniquement; les autres niveaux historiques restent en attente NLW.
BEGIN;
SELECT pg_advisory_xact_lock(41028,2);
CREATE TABLE IF NOT EXISTS dlfr_legacy.published_log (
 legacy_id bigint PRIMARY KEY,
 demon_id bigint NOT NULL,
 published_position integer NOT NULL,
 published_at timestamptz NOT NULL DEFAULT now()
);
DO $$
DECLARE x record;
BEGIN
 FOR x IN SELECT l.legacy_id,l.old_position,m.demon_id
  FROM dlfr_legacy.levels l JOIN dlfr_legacy.level_links m ON m.legacy_id=l.legacy_id
  JOIN public.demons d ON d.id=m.demon_id
  WHERE l.old_position BETWEEN 1 AND 150 AND d.is_public IS FALSE
  ORDER BY l.old_position LOOP
  IF EXISTS(SELECT 1 FROM public.demons o WHERE o.position=x.old_position AND o.id<>x.demon_id)
  THEN CONTINUE; END IF; -- rang occupé, y compris par une fiche masquée
  UPDATE public.demons SET position=x.old_position,is_public=true
   WHERE id=x.demon_id AND is_public=false;
  INSERT INTO dlfr_legacy.published_log(legacy_id,demon_id,published_position)
  VALUES(x.legacy_id,x.demon_id,x.old_position)
  ON CONFLICT DO NOTHING;
 END LOOP;
END $$;
COMMIT;
SELECT count(*) AS niveaux_historiques_publies_par_ce_script
FROM dlfr_legacy.published_log;
-- Tous les niveaux encore cachés et les rangs occupés figurent dans le rapport 07.

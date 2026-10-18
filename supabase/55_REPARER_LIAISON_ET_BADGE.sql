-- DLFR V55 : réparer les profils revendiqués sans toucher aux propriétaires.
-- La création selfCreatePlayer en migrations 13/42 est DÉJÀ atomique (fiche + propriétaire).
-- Sécurité : ne crée AUCUN compte, ne change AUCUN propriétaire et ne modifie AUCUN record.
-- Une fiche passe à "revendiquée" uniquement si elle possède une liaison existante
-- et vérifiée dans public.player_profile_owners.
BEGIN;

-- Réparer les fiches avec une liaison réelle qui sont toujours affichées "non revendiquées".
UPDATE public.players AS p
SET has_account = true
WHERE p.has_account IS DISTINCT FROM true
  AND EXISTS (
    SELECT 1
    FROM public.player_profile_owners AS o
    WHERE o.player_key = p.player_key
  );

-- Éviter la réapparition du décalage lors des créations et liaisons futures.
CREATE OR REPLACE FUNCTION public.dlfr_sync_claimed_profile_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    -- Quand une liaison est supprimée ou déplacée, une fiche qui n'a plus
    -- de propriétaire ne doit pas continuer à être affichée comme revendiquée.
    UPDATE public.players p
       SET has_account = false
     WHERE p.player_key = OLD.player_key
       AND p.has_account IS DISTINCT FROM false
       AND NOT EXISTS (
         SELECT 1 FROM public.player_profile_owners o
         WHERE o.player_key = OLD.player_key
       );
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') THEN
    UPDATE public.players p
       SET has_account = true
     WHERE p.player_key = NEW.player_key
       AND p.has_account IS DISTINCT FROM true;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dlfr_sync_claimed_profile_flag() FROM PUBLIC;

DROP TRIGGER IF EXISTS dlfr_sync_claimed_profile_flag_trigger
ON public.player_profile_owners;

CREATE TRIGGER dlfr_sync_claimed_profile_flag_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.player_profile_owners
FOR EACH ROW
EXECUTE FUNCTION public.dlfr_sync_claimed_profile_flag();

-- Protéger aussi les modifications directes de players.has_account :
-- un import ultérieur ne doit pas pouvoir masquer une fiche effectivement liée.
CREATE OR REPLACE FUNCTION public.dlfr_guard_claimed_profile_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.has_account IS DISTINCT FROM true AND EXISTS (
    SELECT 1 FROM public.player_profile_owners o
    WHERE o.player_key = NEW.player_key
  ) THEN
    NEW.has_account := true;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dlfr_guard_claimed_profile_flag() FROM PUBLIC;

DROP TRIGGER IF EXISTS dlfr_guard_claimed_profile_flag_trigger
ON public.players;

CREATE TRIGGER dlfr_guard_claimed_profile_flag_trigger
BEFORE INSERT OR UPDATE OF has_account ON public.players
FOR EACH ROW
EXECUTE FUNCTION public.dlfr_guard_claimed_profile_flag();

COMMIT;

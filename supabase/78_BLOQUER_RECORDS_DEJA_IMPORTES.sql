-- DLFR V78 : empêcher de soumettre à nouveau un record déjà connu.
-- Préserve les améliorations de pourcentage; ne touche pas aux records existants.
-- À lancer dans Supabase SQL Editor en tant qu'administrateur.
CREATE OR REPLACE FUNCTION public.dlfr_guard_duplicate_level_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_key text;
  v_username text;
  v_display text;
  v_demon bigint;
  v_existing integer;
BEGIN
  -- Les corrections administratives ne sont pas des nouvelles soumissions.
  IF TG_OP <> 'INSERT' OR NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;
  -- On ne doit pas appliquer la règle à un autre compte qu'au propriétaire.
  IF auth.uid() IS NULL OR NEW.auth_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Session de soumission invalide';
  END IF;
  SELECT o.player_key, p.username, p.display_name
    INTO v_key, v_username, v_display
  FROM public.player_profile_owners o
  JOIN public.players p ON p.player_key = o.player_key
  WHERE o.auth_user_id = NEW.auth_user_id
  LIMIT 1;
  IF v_key IS NULL THEN RAISE EXCEPTION 'Fiche joueur non liée'; END IF;
  SELECT d.id INTO v_demon
  FROM public.demons d
  WHERE (NULLIF(btrim(NEW.level_id::text),'') IS NOT NULL
         AND btrim(d.level_id::text)=btrim(NEW.level_id::text))
     OR lower(btrim(d.name))=lower(btrim(NEW.level_name))
  ORDER BY CASE WHEN btrim(d.level_id::text)=btrim(NEW.level_id::text) THEN 0 ELSE 1 END
  LIMIT 1;
  IF v_demon IS NOT NULL THEN
    SELECT MAX(c.progress)::integer INTO v_existing
    FROM public.completions c
    WHERE c.demon_id=v_demon
      AND lower(btrim(c.player)) IN (
        lower(btrim(v_key)), lower(btrim(v_username)), lower(btrim(coalesce(v_display,'')))
      );
    IF v_existing >= NEW.progress THEN
      RAISE EXCEPTION 'Record déjà présent dans la DLFR (% sur ce niveau). Seules les améliorations sont autorisées.', v_existing;
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.level_submissions s
    WHERE s.auth_user_id=NEW.auth_user_id
      AND s.status IN ('pending','approved','accepted')
      AND (
        (NULLIF(btrim(NEW.level_id::text),'') IS NOT NULL AND btrim(s.level_id::text)=btrim(NEW.level_id::text))
        OR lower(btrim(s.level_name))=lower(btrim(NEW.level_name))
      )
      AND s.progress >= NEW.progress
  ) THEN
    RAISE EXCEPTION 'Une soumission de ce niveau avec une progression au moins égale existe déjà.';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS dlfr_guard_duplicate_level_submission ON public.level_submissions;
CREATE TRIGGER dlfr_guard_duplicate_level_submission
BEFORE INSERT ON public.level_submissions
FOR EACH ROW EXECUTE FUNCTION public.dlfr_guard_duplicate_level_submission();

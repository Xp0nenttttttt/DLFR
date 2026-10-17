-- Soumissions simplifiées : choix du niveau dans la liste, vidéo YouTube,
-- raw footage obligatoire pour le Top 150, pourcentage libre seulement dans le Top 75.
-- À exécuter UNE fois dans Supabase SQL Editor, AVANT de publier le nouveau js/app.js.
-- Aucune donnée existante n'est modifiée.
BEGIN;

ALTER TABLE public.level_submissions
  ADD COLUMN IF NOT EXISTS raw_footage_url text;

ALTER TABLE public.level_submissions
  DROP CONSTRAINT IF EXISTS dlfr_submission_raw_url_check;
ALTER TABLE public.level_submissions
  ADD CONSTRAINT dlfr_submission_raw_url_check
  CHECK (raw_footage_url IS NULL OR (raw_footage_url ~* '^https://' AND char_length(raw_footage_url) <= 1000));

-- Règles appliquées côté serveur (le formulaire les applique déjà côté navigateur).
CREATE OR REPLACE FUNCTION public.dlfr_submission_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  d public.demons%ROWTYPE;
  n integer;
  main_lim integer := 75;
  ext_lim integer := 150;
BEGIN
  BEGIN
    SELECT main_limit, extended_limit INTO main_lim, ext_lim FROM public.site_settings LIMIT 1;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    main_lim := 75; ext_lim := 150;
  END;

  IF NEW.video_url !~* '^https://(www\.|m\.)?(youtube\.com|youtu\.be)/' THEN
    RAISE EXCEPTION 'Un lien YouTube (https) est requis comme vidéo de preuve';
  END IF;

  IF nullif(btrim(NEW.level_id),'') IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.demons WHERE btrim(level_id)=btrim(NEW.level_id) AND lower(btrim(name))=lower(btrim(NEW.level_name));
    IF n=1 THEN SELECT * INTO d FROM public.demons WHERE btrim(level_id)=btrim(NEW.level_id) AND lower(btrim(name))=lower(btrim(NEW.level_name)); END IF;
  END IF;
  IF d.id IS NULL THEN
    SELECT count(*) INTO n FROM public.demons WHERE lower(btrim(name))=lower(btrim(NEW.level_name));
    IF n=1 THEN SELECT * INTO d FROM public.demons WHERE lower(btrim(name))=lower(btrim(NEW.level_name)); END IF;
  END IF;

  IF d.id IS NOT NULL AND NOT coalesce(d.unrated,false) THEN
    IF d.position <= ext_lim AND nullif(btrim(NEW.raw_footage_url),'') IS NULL THEN
      RAISE EXCEPTION 'Le raw footage est obligatoire pour un niveau du Top 150';
    END IF;
    IF d.position > main_lim AND NEW.progress <> 100 THEN
      RAISE EXCEPTION 'Seules les complétions à 100 %% sont acceptées hors du Top 75';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_submission_rules() FROM PUBLIC;

DROP TRIGGER IF EXISTS dlfr_submission_rules_before_insert ON public.level_submissions;
CREATE TRIGGER dlfr_submission_rules_before_insert
BEFORE INSERT ON public.level_submissions
FOR EACH ROW EXECUTE FUNCTION public.dlfr_submission_rules();

COMMIT;

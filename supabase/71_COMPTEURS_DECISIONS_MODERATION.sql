-- DLFR V92.1 : mémorise le compte qui accepte/refuse chaque soumission.
-- À exécuter une seule fois dans Supabase > SQL Editor.

ALTER TABLE public.level_submissions
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.level_submissions
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE OR REPLACE FUNCTION public.dlfr_stamp_submission_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND lower(coalesce(OLD.status, '')) IN ('pending', 'in_review')
     AND lower(coalesce(NEW.status, '')) IN ('approved', 'accepted', 'rejected', 'refused') THEN
    NEW.reviewed_by := coalesce(auth.uid(), NEW.reviewed_by);
    NEW.reviewed_at := coalesce(NEW.reviewed_at, now());
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS dlfr_stamp_submission_review ON public.level_submissions;
CREATE TRIGGER dlfr_stamp_submission_review
BEFORE UPDATE OF status ON public.level_submissions
FOR EACH ROW
EXECUTE FUNCTION public.dlfr_stamp_submission_review();

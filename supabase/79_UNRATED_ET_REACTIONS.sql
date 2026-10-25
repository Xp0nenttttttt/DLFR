-- V79 : exécuté UNIQUEMENT dans le SQL Editor du projet DLFR choisi.
-- Réactions : une par emoji, par compte, par publication ou record validé.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dlfr_reactions (
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_key text NOT NULL,
  emoji text NOT NULL CHECK (emoji IN ('❤️','🔥','👏','💜','🎉')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(auth_user_id,target_key,emoji),
  CHECK (length(target_key) BETWEEN 3 AND 110)
);
CREATE INDEX IF NOT EXISTS dlfr_reactions_target_idx ON public.dlfr_reactions(target_key);
ALTER TABLE public.dlfr_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.dlfr_reactions TO anon, authenticated;
GRANT INSERT, DELETE ON public.dlfr_reactions TO authenticated;
DROP POLICY IF EXISTS dlfr_v79_reactions_read ON public.dlfr_reactions;
CREATE POLICY dlfr_v79_reactions_read ON public.dlfr_reactions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS dlfr_v79_reactions_add ON public.dlfr_reactions;
CREATE POLICY dlfr_v79_reactions_add ON public.dlfr_reactions FOR INSERT TO authenticated
WITH CHECK (
 auth_user_id=(select auth.uid()) AND (
 (target_key ~ '^news:[0-9]+$' AND EXISTS (
   SELECT 1 FROM public.news_items n WHERE n.id = split_part(target_key,':',2)::bigint AND n.is_published=true
 )) OR
 (target_key ~ '^completion:[0-9]+$' AND EXISTS (
   SELECT 1 FROM public.completions c WHERE c.id = split_part(target_key,':',2)::bigint AND c.progress=100
 ))
 ));
DROP POLICY IF EXISTS dlfr_v79_reactions_remove ON public.dlfr_reactions;
CREATE POLICY dlfr_v79_reactions_remove ON public.dlfr_reactions FOR DELETE TO authenticated USING (auth_user_id=(select auth.uid()));
-- Fonction indépendante : ne déplace JAMAIS la position technique des imports UNRATED.
CREATE OR REPLACE FUNCTION public.dlfr_v79_update_unrated(
 p_demon_id bigint,p_unrated_rank integer,p_name text,p_level_id text,p_creator text,
 p_creator_more text,p_publisher text,p_verifier text,p_difficulty text,
 p_requirement integer,p_completion_mode text,p_video_url text,p_verifier_video_url text,
 p_thumbnail_url text,p_description text,p_is_public boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staff_roles s WHERE s.auth_user_id=auth.uid()
      AND s.role IN ('owner','editor','supermoderator')
 ) THEN RAISE EXCEPTION 'Supermodérateur requis'; END IF;
 IF p_unrated_rank NOT BETWEEN 1 AND 99999998 THEN RAISE EXCEPTION 'Rang UNRATED invalide'; END IF;
 IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 1 AND 120
    OR length(btrim(coalesce(p_publisher,''))) NOT BETWEEN 1 AND 200
    OR p_requirement NOT BETWEEN 1 AND 100
    OR p_completion_mode NOT IN ('standard','solo','two_player')
 THEN RAISE EXCEPTION 'Informations du niveau invalides'; END IF;
 IF p_level_id IS NOT NULL AND btrim(p_level_id)<>'' AND btrim(p_level_id) !~ '^[1-9][0-9]*$'
 THEN RAISE EXCEPTION 'ID Geometry Dash invalide'; END IF;
 IF EXISTS (SELECT 1 FROM public.demons d WHERE d.id=p_demon_id AND d.unrated IS TRUE) THEN
   UPDATE public.demons SET
     unrated_position=p_unrated_rank,name=btrim(p_name),level_id=nullif(btrim(p_level_id),''),
     creator=btrim(coalesce(p_creator,'')),creator_more=btrim(coalesce(p_creator_more,'')),
     publisher=btrim(p_publisher),verifier=btrim(coalesce(p_verifier,'')),difficulty=btrim(coalesce(p_difficulty,'')),
     requirement=p_requirement,completion_mode=p_completion_mode,video_url=nullif(btrim(coalesce(p_video_url,'')),''),
     verifier_video_url=nullif(btrim(coalesce(p_verifier_video_url,'')),''),
     thumbnail_url=nullif(btrim(coalesce(p_thumbnail_url,'')),''),description=coalesce(p_description,''),is_public=p_is_public
   WHERE id=p_demon_id AND unrated IS TRUE;
 ELSE RAISE EXCEPTION 'La fiche n’existe pas ou n’est pas UNRATED'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.dlfr_v79_update_unrated(bigint,integer,text,text,text,text,text,text,text,integer,text,text,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_v79_update_unrated(bigint,integer,text,text,text,text,text,text,text,integer,text,text,text,text,text,boolean) TO authenticated;
COMMIT;

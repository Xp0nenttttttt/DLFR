-- DLFR V62 : afficher le pseudo d'authentification dans l'annuaire prive.
-- Ne change ni les roles, ni les identites, ni les proprietaires de fiches.
-- Pas necessaire pour corriger le rate-limit ; executez-le pour la mention « Compte DLFR ».
BEGIN;
CREATE OR REPLACE FUNCTION public.dlfr_staff_candidates()
RETURNS TABLE(auth_user_id uuid,display_name text,"current_role" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT u.id,
         COALESCE(NULLIF(btrim(p.display_name),''),NULLIF(btrim(p.username),''),
           NULLIF(btrim(a.username_key),''),
           NULLIF(btrim(u.raw_user_meta_data->>'dlfr_username'),''),
           NULLIF(btrim(u.raw_user_meta_data->>'full_name'),''),
           NULLIF(btrim(u.raw_user_meta_data->>'name'),''),
           'Compte DLFR')::text,
         COALESCE(r.role,CASE WHEN n.auth_user_id IS NOT NULL THEN 'nlw' ELSE NULL END)::text
  FROM auth.users AS u
  LEFT JOIN public.player_profile_owners AS po ON po.auth_user_id=u.id
  LEFT JOIN public.players AS p ON p.player_key=po.player_key
  LEFT JOIN public.dlfr_username_accounts AS a ON a.auth_user_id=u.id
  LEFT JOIN public.staff_roles AS r ON r.auth_user_id=u.id
  LEFT JOIN public.nlw_staff_roles AS n ON n.auth_user_id=u.id
  WHERE EXISTS (SELECT 1 FROM public.staff_roles AS me
                WHERE me.auth_user_id=auth.uid() AND me.role='owner')
  ORDER BY CASE WHEN r.role='owner' THEN 0 WHEN r.role IS NOT NULL OR n.auth_user_id IS NOT NULL THEN 1 ELSE 2 END,
           2,1;
$fn$;
REVOKE ALL ON FUNCTION public.dlfr_staff_candidates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_staff_candidates() TO authenticated;
COMMIT;

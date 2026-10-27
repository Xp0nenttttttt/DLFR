-- DLFR V103 : copie de la fonction installée sur Supabase DLFR production.
-- Ne pas exécuter sur la production : la fonction existe déjà.
-- Pour reproduction future sur un autre environnement uniquement.
CREATE OR REPLACE FUNCTION public.dlfr_team_level_counts()
RETURNS TABLE (
 actor_user_id uuid,
 managed_levels bigint,
 created bigint,
 edited bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $fn$
 SELECT a.actor_user_id,
        count(DISTINCT a.target) FILTER (WHERE a.target IS NOT NULL)::bigint AS managed_levels,
        count(*) FILTER (WHERE upper(a.action_key)='SCOPED_LEVEL_CREATE')::bigint AS created,
        count(*) FILTER (WHERE upper(a.action_key)='SCOPED_LEVEL_EDIT')::bigint AS edited
 FROM public.community_audit_log a
 WHERE a.actor_user_id IS NOT NULL
   AND upper(a.action_key) IN ('SCOPED_LEVEL_CREATE','SCOPED_LEVEL_EDIT')
   AND EXISTS(
     SELECT 1 FROM public.staff_roles me
     WHERE me.auth_user_id=(SELECT auth.uid()) AND me.role='owner'
   )
 GROUP BY a.actor_user_id
$fn$;
REVOKE ALL ON FUNCTION public.dlfr_team_level_counts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_team_level_counts() TO authenticated;

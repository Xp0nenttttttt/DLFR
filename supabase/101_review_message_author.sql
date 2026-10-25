-- V101 — auteur public des messages de modération liés à MES soumissions.
-- Ne renvoie ni UUID, ni adresses e-mail, ni messages d'autres joueurs.
CREATE OR REPLACE FUNCTION public.dlfr_my_submission_review_authors()
RETURNS TABLE (
  submission_id bigint,
  moderator_name text,
  moderator_player_key text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $func$
  SELECT s.id::bigint AS submission_id,
         COALESCE(
           NULLIF(btrim(p.display_name),''),
           NULLIF(btrim(p.username),''),
           NULLIF(btrim(a.username_key),''),
           'Modération DLFR'
         )::text AS moderator_name,
         o.player_key::text AS moderator_player_key
  FROM public.level_submissions AS s
  LEFT JOIN public.player_profile_owners AS o ON o.auth_user_id = s.reviewed_by
  LEFT JOIN public.players AS p ON p.player_key = o.player_key
  LEFT JOIN public.dlfr_username_accounts AS a ON a.auth_user_id = s.reviewed_by
  WHERE s.auth_user_id = (SELECT auth.uid())
    AND s.reviewed_by IS NOT NULL
    AND lower(s.status) IN ('approved','accepted','rejected','refused')
    AND nullif(btrim(s.review_message),'') IS NOT NULL;
$func$;

REVOKE ALL ON FUNCTION public.dlfr_my_submission_review_authors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dlfr_my_submission_review_authors() TO authenticated;

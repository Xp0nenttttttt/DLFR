-- DLFR V100 : tableau des décisions de soumission par compte modérateur.
-- INSTALLÉ AUTOMATIQUEMENT SUR LE PROJET DLFR DE PRODUCTION (25/10/2026).
-- Copie de sauvegarde : ne pas réexécuter si la fonction existe déjà.
-- Les membres de la modération sont les seuls à pouvoir lire ces agrégats.
-- Les actions sans reviewed_by ne sont pas inventées.

CREATE OR REPLACE FUNCTION public.dlfr_moderation_leaderboard(p_days integer DEFAULT NULL)
RETURNS TABLE (
  player_key text,
  display_name text,
  country_code text,
  moderation_role text,
  accepted bigint,
  rejected bigint,
  total bigint,
  is_self boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $func$
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR NOT (
       EXISTS (
         SELECT 1 FROM public.staff_roles s
         WHERE s.auth_user_id = (SELECT auth.uid())
           AND s.role IN ('owner','editor','supermoderator','moderator')
       )
       OR EXISTS (
         SELECT 1 FROM public.nlw_staff_roles n
         WHERE n.auth_user_id = (SELECT auth.uid())
       )
     )
  THEN
    RAISE EXCEPTION 'Accès réservé à l’équipe de modération' USING ERRCODE='42501';
  END IF;
  IF p_days IS NOT NULL AND p_days NOT IN (7,30) THEN
    RAISE EXCEPTION 'Période non autorisée' USING ERRCODE='22023';
  END IF;

  RETURN QUERY
  WITH role_sources AS (
    SELECT s.auth_user_id,
           s.role::text AS role_name,
           CASE s.role WHEN 'owner' THEN 0 WHEN 'supermoderator' THEN 1
                       WHEN 'editor' THEN 2 ELSE 3 END AS priority
    FROM public.staff_roles s
    WHERE s.role IN ('owner','editor','supermoderator','moderator')
    UNION ALL
    SELECT n.auth_user_id, 'nlw'::text, 4 AS priority
    FROM public.nlw_staff_roles n
  ),
  members AS (
    SELECT DISTINCT ON (r.auth_user_id) r.auth_user_id, r.role_name
    FROM role_sources r
    ORDER BY r.auth_user_id,r.priority
  ),
  decisions AS (
    SELECT s.reviewed_by AS auth_id,
           COUNT(*) FILTER (WHERE lower(s.status) IN ('approved','accepted'))::bigint AS accepted,
           COUNT(*) FILTER (WHERE lower(s.status) IN ('rejected','refused'))::bigint AS rejected,
           COUNT(*)::bigint AS total
    FROM public.level_submissions s
    WHERE s.reviewed_by IS NOT NULL
      AND lower(s.status) IN ('approved','accepted','rejected','refused')
      AND (p_days IS NULL OR s.reviewed_at >= now() - make_interval(days => p_days))
    GROUP BY s.reviewed_by
  ),
  participants AS (
    SELECT m.auth_user_id AS auth_id FROM members m
    UNION
    SELECT d.auth_id FROM decisions d
  )
  SELECT o.player_key::text,
         COALESCE(
           NULLIF(btrim(p.display_name),''),
           NULLIF(btrim(p.username),''),
           NULLIF(btrim(a.username_key),''),
           CASE WHEN m.auth_user_id IS NOT NULL THEN 'Modérateur' ELSE 'Ancien modérateur' END
         )::text AS display_name,
         p.country_code::text,
         COALESCE(m.role_name,'former')::text AS moderation_role,
         COALESCE(d.accepted,0)::bigint,
         COALESCE(d.rejected,0)::bigint,
         COALESCE(d.total,0)::bigint,
         (u.auth_id=(SELECT auth.uid()))::boolean
  FROM participants u
  LEFT JOIN members m ON m.auth_user_id=u.auth_id
  LEFT JOIN decisions d ON d.auth_id=u.auth_id
  LEFT JOIN public.player_profile_owners o ON o.auth_user_id=u.auth_id
  LEFT JOIN public.players p ON p.player_key=o.player_key
  LEFT JOIN public.dlfr_username_accounts a ON a.auth_user_id=u.auth_id
  ORDER BY COALESCE(d.total,0) DESC,COALESCE(d.accepted,0) DESC,display_name ASC;
END
$func$;

REVOKE ALL ON FUNCTION public.dlfr_moderation_leaderboard(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_moderation_leaderboard(integer) TO authenticated;

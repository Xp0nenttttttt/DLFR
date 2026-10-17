-- DLFR 2.12 : invitations de clan visibles et candidats réellement liés.
-- Ne modifie aucun clan, joueur, record, badge ni invitation existante.
-- À exécuter après les migrations 11 et 12.
BEGIN;

-- Boîte de réception personnelle. Un compte ne reçoit que SES invitations.
CREATE OR REPLACE FUNCTION public.dlfr_clan_my_invitations()
RETURNS TABLE (
  invitation_id bigint,
  clan_id bigint,
  clan_name text,
  clan_tag text,
  inviter_key text,
  invited_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Connexion requise';
  END IF;
  SELECT o.player_key INTO v_actor
  FROM public.player_profile_owners AS o
  WHERE o.auth_user_id = auth.uid()
  LIMIT 1;
  IF v_actor IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT i.id, i.clan_id, c.name, c.tag, i.inviter_key, i.created_at
  FROM public.clan_invites AS i
  JOIN public.clans AS c ON c.id = i.clan_id
  WHERE i.invitee_key = v_actor AND i.status = 'pending'
  ORDER BY i.created_at ASC, i.id ASC;
END;
$$;

-- Seuls le chef et ses officiers peuvent consulter les joueurs invitables
-- (profils reliés à un compte, et qui ne sont membres d'aucun clan).
CREATE OR REPLACE FUNCTION public.dlfr_clan_invite_candidates(p_clan_id bigint)
RETURNS TABLE (
  candidate_key text,
  candidate_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Connexion requise';
  END IF;
  SELECT o.player_key INTO v_actor
  FROM public.player_profile_owners AS o
  WHERE o.auth_user_id = auth.uid()
  LIMIT 1;
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clan_members AS m
    WHERE m.player_key = v_actor
      AND m.clan_id = p_clan_id
      AND m.role IN ('leader', 'officer')
  ) THEN
    RAISE EXCEPTION 'Chef ou officier du clan requis';
  END IF;
  RETURN QUERY
  SELECT p.player_key, COALESCE(NULLIF(BTRIM(p.display_name), ''), NULLIF(BTRIM(p.username), ''), p.player_key)::text
  FROM public.players AS p
  WHERE p.player_key <> v_actor
    AND COALESCE(p.hidden_from_stats, false) = false
    AND EXISTS (
      SELECT 1 FROM public.player_profile_owners AS o
      WHERE o.player_key = p.player_key
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.clan_members AS m WHERE m.player_key = p.player_key
    )
  ORDER BY 2, 1;
END;
$$;

REVOKE ALL ON FUNCTION public.dlfr_clan_my_invitations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dlfr_clan_invite_candidates(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_clan_my_invitations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dlfr_clan_invite_candidates(bigint) TO authenticated;
COMMIT;

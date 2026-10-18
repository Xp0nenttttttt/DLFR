-- Lecture seule. Aucune donnée personnelle d'authentification affichée.
SELECT p.player_key,p.username,p.has_account AS badge_public,
  EXISTS(SELECT 1 FROM public.player_profile_owners o WHERE o.player_key=p.player_key) AS liaison_reelle,
  (SELECT count(*) FROM public.profile_claim_requests r WHERE r.player_key=p.player_key AND r.status='approved') AS revendications_approuvees,
  p.hidden_from_stats
FROM public.players p WHERE lower(p.player_key)='vinceleo' OR lower(p.username)='vinceleo';

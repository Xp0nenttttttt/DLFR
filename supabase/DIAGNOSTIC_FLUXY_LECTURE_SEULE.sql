-- DLFR - Diagnostic de visibilité du modérateur Fluxy.
-- Lecture seule : ne modifie aucune fiche, permission ou record.
-- Résultat vide : aucune fiche joueur correspondant à Fluxy dans public.players.
SELECT p.player_key,
       p.username,
       p.display_name,
       p.has_account,
       p.hidden_from_stats,
       (o.auth_user_id IS NOT NULL) AS fiche_liee_a_un_compte,
       COALESCE(s.role::text, 'aucun rôle relié à cette fiche') AS role_du_compte_lie
FROM public.players AS p
LEFT JOIN public.player_profile_owners AS o ON o.player_key = p.player_key
LEFT JOIN public.staff_roles AS s ON s.auth_user_id = o.auth_user_id
WHERE lower(coalesce(p.username, '')) LIKE '%fluxy%'
   OR lower(coalesce(p.display_name, '')) LIKE '%fluxy%'
   OR lower(coalesce(p.player_key, '')) LIKE '%fluxy%'
ORDER BY p.username, p.player_key;

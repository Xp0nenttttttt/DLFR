-- DLFR : diagnostic en lecture seule de l'identité "vinceleo".
-- Aucun UUID utilisateur, email ou jeton n'est renvoyé.
-- Remplacer la valeur si un autre joueur est concerné.
SELECT
    p.player_key,
    p.username,
    p.display_name,
    p.has_account AS indicateur_affiche_actuellement,
    EXISTS (
        SELECT 1
        FROM public.player_profile_owners o
        WHERE o.player_key = p.player_key
    ) AS fiche_reellement_liee_a_un_compte,
    p.hidden_from_stats
FROM public.players p
WHERE lower(btrim(p.player_key)) = lower(btrim('vinceleo'))
   OR lower(btrim(p.username)) = lower(btrim('vinceleo'))
   OR lower(btrim(coalesce(p.display_name,''))) = lower(btrim('vinceleo'))
ORDER BY p.player_key;

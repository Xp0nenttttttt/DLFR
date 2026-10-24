-- DLFR V69 : LECTURE SEULE. Ne modifie aucune demande ni aucun compte.
-- A executer dans Supabase SQL Editor par le proprietaire.
-- 1. Etat de toutes les demandes de fusion (compteurs par statut).
SELECT status, COUNT(*) AS nombre
FROM public.dlfr_player_merge_requests
GROUP BY status ORDER BY status;

-- 2. 25 dernieres demandes : permet de confirmer que la demande existe.
-- La fusion concerne des fiches JOUEURS, pas deux comptes de connexion.
SELECT r.id, src.username AS fiche_a_absorber,
       dst.username AS fiche_a_conserver,
       r.status, r.created_at, r.resolved_at
FROM public.dlfr_player_merge_requests r
JOIN public.players src ON src.player_key = r.source_key
JOIN public.players dst ON dst.player_key = r.target_key
ORDER BY r.created_at DESC LIMIT 25;

-- 3. Une revendication de fiche n'est PAS une demande de fusion.
-- Si une revendication a ete faite, elle sera dans cette table.
SELECT to_jsonb(r)->>'player_key' AS fiche,
       to_jsonb(r)->>'status' AS statut,
       to_jsonb(r)->>'created_at' AS date_demande
FROM public.profile_claim_requests r
ORDER BY to_jsonb(r)->>'created_at' DESC NULLS LAST LIMIT 25;

-- 4. Verification des permissions administrateur (pas de donnees personnelles).
SELECT role, COUNT(*) AS comptes
FROM public.staff_roles
GROUP BY role ORDER BY role;

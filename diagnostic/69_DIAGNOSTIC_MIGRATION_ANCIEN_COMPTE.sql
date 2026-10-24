-- DLFR V69 : LECTURE SEULE. NE JAMAIS envoyer ni afficher les hashs des mots de passe.
-- Remplace les deux pseudos ci-dessous par les vrais pseudos du joueur (pas son mot de passe).
WITH p AS (
 SELECT lower('ANCIEN_PSEUDO')::text AS ancien,
        lower('NOUVEAU_PSEUDO')::text AS nouveau
)
SELECT x.pseudo,
       (l.username_key IS NOT NULL) AS dans_export_ancien,
       (l.migrated_auth_user_id IS NOT NULL) AS deja_migre,
       (a.auth_user_id IS NOT NULL) AS pseudo_enregistre_nouveau_site,
       CASE
         WHEN a.auth_user_id IS NOT NULL THEN 'Compte actuel existant : ne pas creer de doublon'
         WHEN l.migrated_auth_user_id IS NOT NULL THEN 'Ancien compte deja migre'
         WHEN l.username_key IS NOT NULL THEN 'Ancien compte en attente de migration'
         ELSE 'Pseudo absent des deux tables : verifier l orthographe ou la date de l export'
       END AS etat
FROM p,
LATERAL (VALUES (p.ancien),(p.nouveau)) AS x(pseudo)
LEFT JOIN public.dlfr_legacy_credentials l ON l.username_key=x.pseudo
LEFT JOIN public.dlfr_username_accounts a ON a.username_key=x.pseudo;

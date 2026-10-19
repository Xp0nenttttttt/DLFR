-- Uniquement pour diagnostic en SQL Editor. Aucun hash de mot de passe retourne.
-- Un compte « ancien » reserve ne doit jamais etre remplace sans verifier sa possession.
SELECT v.pseudo,
       (l.username_key IS NOT NULL) AS present_dans_import_ancien,
       (l.migrated_auth_user_id IS NOT NULL) AS ancien_compte_deja_migre,
       (a.auth_user_id IS NOT NULL) AS pseudo_deja_utilise_nouvelle_dlfr,
       CASE
         WHEN l.migrated_auth_user_id IS NOT NULL THEN 'Ancien compte deja migre'
         WHEN a.auth_user_id IS NOT NULL THEN 'Pseudo occupe dans le nouveau systeme : ne pas fusionner automatiquement'
         WHEN l.username_key IS NOT NULL THEN 'Compte ancien pret pour connexion'
         ELSE 'Aucun compte ancien importe pour ce pseudo'
       END AS constat
FROM (VALUES('wardy')) v(pseudo)
LEFT JOIN public.dlfr_legacy_credentials l ON l.username_key=v.pseudo
LEFT JOIN public.dlfr_username_accounts a ON a.username_key=v.pseudo;

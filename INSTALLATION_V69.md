# DLFR V69 – affichage des demandes de fusion et diagnostic des anciens comptes

Base : V68. Correctif ciblé de l'interface. **Aucune migration SQL obligatoire**.

## Installation
1. Sauvegarder `js/app.js` et `index.html` actuels.
2. Remplacer ces **deux fichiers** par ceux du ZIP dans GitHub Pages.
3. Publier puis faire `Ctrl + F5` sur le site.
4. Avec un compte propriétaire ou supermodérateur, ouvrir **Modération → Demandes**. L'ouverture recharge maintenant la liste des demandes depuis Supabase. Un bouton « Actualiser les fusions » est disponible dans cette section.
5. Un compteur de fusions en attente apparaît dans la navigation et un rappel est affiché sur l'accueil de modération quand il en existe.

## Pourquoi des demandes pouvaient disparaître
Dans V68, les RPC `dlfr_player_merge_request_list()` et `dlfr_player_merge_candidates()` étaient exécutées simultanément, mais **l'échec de l'une effaçait aussi le résultat réussi de l'autre**. Ces résultats sont maintenant gérés séparément.

## Si la demande de ton ami n'apparaît toujours pas
Exécuter `diagnostic/69_DIAGNOSTIC_DEMANDES_LECTURE_SEULE.sql` dans le SQL Editor Supabase.
- Si la demande est dans `dlfr_player_merge_requests` et statut `pending`, mais invisible à l'écran, vérifier le rôle réel `owner`, `editor` ou `supermoderator` dans `staff_roles` et le mode aperçu de rôle.
- Si elle est seulement dans `profile_claim_requests`, il s'agit d'une **revendication de fiche**, pas d'une fusion de fiches.
- Si aucune demande n'est présente, il faut refaire la demande depuis le compte concerné et vérifier le message d'erreur à l'envoi.
- Si la source est liée à un autre compte, la fusion automatique est volontairement interdite. Vérifier manuellement la propriété des deux fiches.

## Ancien compte, nouveau compte et changement de pseudo
Exécuter `diagnostic/69_DIAGNOSTIC_MIGRATION_ANCIEN_COMPTE.sql` après avoir remplacé `ANCIEN_PSEUDO` et `NOUVEAU_PSEUDO` par les pseudos exacts.
- La V57/V62 cherche le **pseudo exact importé** comme identifiant de connexion. Un changement de pseudo peut empêcher une correspondance.
- Si un **nouveau compte a déjà été créé**, ne pas relancer une migration qui créerait un second compte Auth. Conserver le compte actuel et envisager une liaison/fusion **des fiches joueurs** après vérification des preuves.
- **Ne communiquer à personne** le mot de passe historique, le hash, un jeton Auth ou la clé `service_role`. Ne jamais les publier sur GitHub.
- Cette V69 ne transfère **aucune** connexion, identité ou permission : elle répare la visibilité des demandes et facilite le diagnostic.

## Limites
Syntaxe et tests locaux vérifiés. Pas de connexion en lecture à ton Supabase de production ; l'affichage de la demande réelle doit donc être confirmé après installation.
Aucun fichier `assets/flags/` fourni ou modifié.

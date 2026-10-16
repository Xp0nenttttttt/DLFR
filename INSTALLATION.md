# DLFR — Profils : Fusion / Vérificateurs

Patch à installer sur la version du projet contenant la migration 33 (fusion de joueurs).

1. Sauvegarder la base Supabase et `js/app.js`.
2. Exécuter `supabase/34_RAPPROCHER_VERIFICATEURS.sql` dans Supabase SQL Editor.
3. Remplacer `js/app.js` par ce fichier.
4. Recharger la page (`Ctrl+F5`).
5. Dans Modération > Profils > Identités des joueurs, cliquer « Vérificateurs », puis « Actualiser les vérificateurs ».
6. Choisir un crédit exact, visualiser les niveaux associés, choisir une fiche existante ou en créer une, puis saisir RATTACHER et confirmer.

La fonction conserve le texte `demons.verifier` comme crédit historique et écrit seulement `demons.verifier_user_id`. Le rapprochement est exact, sans suppression de niveau, de record ni fusion des comptes. Les nouveaux profils n'ont pas de compte de connexion. Opération réservée aux rôles owner/editor/supermoderator.

**Prérequis important :** `players.legacy_id` doit être un bigint modifiable et `demons.verifier_user_id` doit désigner ce même identifiant numérique. Vérifier ce point dans le schéma Supabase avant application. La migration n'a pas été exécutée sur votre base réelle.

Aucun fichier `assets/flags/` n'est inclus.

# DLFR — 2.15 : soumissions de nouveaux niveaux

## Ce qui change

Dans **Soumettre un record**, le joueur connecté peut désormais choisir :

- **Niveau déjà listé** : sélection d'une fiche existante, preuve YouTube, raw footage obligatoire pour le Top 150, pourcentage dans le Top 75 si applicable.
- **Proposer un nouveau niveau** : nom, ID Geometry Dash, preuve YouTube ; raw footage facultatif au dépôt. Le dossier part à la modération et n'est **pas publié automatiquement**.

L'identité du joueur est toujours tirée de sa fiche reliée au compte connecté. Le formulaire ne permet pas d'écrire le pseudo de quelqu'un d'autre.

## Installation

1. Sauvegarder les fichiers existants `js/app.js` et `js/production-tools.js`.
2. Remplacer ces **deux fichiers** par ceux de cette archive.
3. Publier sur GitHub Pages ; recharger avec Ctrl+F5.
4. Tester avec un compte lié à un joueur, d'abord un niveau existant, puis un **ID GD inexistant** et une vidéo YouTube de test.
5. Vérifier que la proposition apparaît dans **Modération > Demandes / cas particuliers** et qu'un supermodo doit lui choisir un rang lors de la validation.

## Prérequis

Le code suppose que les anciennes migrations de soumissions ont bien été exécutées, particulièrement `11_production.sql`, `31_PSEUDO_SOUMISSIONS_VERROUILLE.sql`, `46_POINTS_ET_IDENTITE_SOUMISSIONS.sql` et `47_SOUMISSIONS_SIMPLIFIEES_RAW_FOOTAGE.sql`.

Aucune migration SQL nouvelle n'est nécessaire : `level_submissions` prend déjà en charge `level_name`, `level_id`, `publisher`, `video_url` et `raw_footage_url`. Le RPC `dlfr_review_submission` existant permet à la modération de créer un niveau à partir d'une soumission, avec un rang choisi à la validation.

## Notes

- Les soumissions de nouveaux niveaux sont des **propositions** et n'affectent ni le Top 150 ni la NLW tant qu'un modérateur habilité ne les a pas acceptées.
- Une soumission correspondant à un ID GD déjà publié est refusée : choisir le niveau existant.
- Les dossiers ambigus ou non publiés restent réservés à la modération générale.
- Aucune image, aucun drapeau ni fichier `assets/flags/` n'est fourni dans ce patch.
- Les anciennes soumissions ne sont pas modifiées.
- Aucun test n'a été exécuté sur la base Supabase de production ; vérifier avec une soumission d'essai avant déploiement public.

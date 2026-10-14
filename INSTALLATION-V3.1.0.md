# DLFR V3.1.0 — Mode manuel uniquement

## Avant tout
- Ne supprime pas tes 1 635 niveaux importés ni tes complétions. Fais une sauvegarde Supabase (au minimum `demons`, `completions`, `level_submissions`).
- Tes drapeaux PNG `assets/flags` restent intacts : aucun fichier de drapeau dans le ZIP.

## Installation
1. Dans Supabase SQL Editor, exécute **`supabase/22_manual_level_creation.sql`** (ajoute la fonction sécurisée de création/publication manuelle).
2. Lance **`supabase/23_APERCU_imports_visibles.sql`** (lecture seule). Vérifie les lignes qui sont proposées au masquage.
3. Facultatif : après sauvegarde et vérification de cet aperçu, exécute **`supabase/24_MASQUER_imports_auto_OPTIONNEL.sql`**. Cette requête masque uniquement les fiches importées automatiquement selon les critères affichés ; elle n'efface pas de records, et ne réordonne pas automatiquement la liste.
4. Remplace `index.html`, `js/app.js`, `js/production-tools.js` sur GitHub Pages.
5. Remplace les trois fichiers sous `.github/workflows/`. Ils sont **désactivés** et ne lancent plus de synchronisation, y compris lors d'un clic manuel. Si tu as d'autres workflows AREDL dans `.github/workflows/`, supprime-les/désactive-les aussi. Ne désactive pas tes autres workflows sans les examiner.
6. Recharge le site avec Ctrl+F5.

## Fonctionnement manuel
- **Modération → Niveaux → Ajouter directement un niveau** : pseudo du niveau, ID GD, rang, créateur, éditeur, vérificateur, vidéo, miniature, Rated/UNRATED. Si un niveau est déjà dans l'ancien catalogue **masqué**, choisis-le dans le menu **Réutiliser une fiche importée** pour ne pas le dupliquer.
- **Mon espace → Soumettre un record**, puis **Modération → Soumissions** : valider/refuser une demande, indiquer le rang lorsque c'est un nouveau niveau.
- **Modération → Gestion des joueurs et des records réels** : créer un joueur provisoire et attribuer ses victoires.
- Les nouveaux niveaux Rated décalent les rangs suivants si nécessaire. Les niveaux masqués gardent leur rang interne (pas de perte de données).
- Les fiches ayant déjà une complétion approuvée ne sont pas incluses dans le masquage optionnel.

## Limites et vérification
- Aucune opération n'a été exécutée sur ton Supabase : teste d'abord un niveau masqué et une nouvelle soumission.
- L'ancien catalogue AREDL et ses métadonnées restent en base ; seule la synchronisation est suspendue. Les anciennes informations AREDL déjà visibles ne sont pas effacées automatiquement.
- Pour les variantes Solo/2P, la réutilisation d'une fiche masquée se fait via son **ID interne** : vérifie de choisir la bonne.
- Une éventuelle suppression définitive de données doit être décidée séparément, après export.
- Le SQL de publication manuelle nécessite `dlfr_can_moderate`, `dlfr_make_room`, `community_audit_log` et les colonnes V3.0.11 déjà installées.

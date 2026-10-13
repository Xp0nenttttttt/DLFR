# V2.3 — drapeaux et régions françaises

## Sur GitHub Pages

Décompresser le patch GitHub **à la racine** du dépôt, dans les mêmes dossiers. Nouveaux fichiers : `js/geo.js` et `assets/flags/countries/*.png`, `assets/flags/regions/fr/*.svg`. Fichiers remplacés : `index.html`, `js/app.js`, `css/style.css`.

**Ne remplace pas ton `js/config.js` existant** si tu as déjà connecté Supabase. Le patch ne le contient pas.

1. Commit + déploiement GitHub Pages.
2. Actualise avec Ctrl+F5 et ouvre `?page=stats&demo=1`.
3. Active la modération de démo, puis onglet **Profils**. Choisis un joueur, le pays France, puis une région. Enregistre. La région s'affiche sur sa fiche et peut être filtrée dans les statistiques.
4. Le navigateur conserve les changements fictifs dans localStorage. Pour repartir à zéro `?page=stats&demo=1&reset=1`.

## Régions

13 métropolitaines + Guadeloupe, Martinique, Guyane, La Réunion, Mayotte.
Les SVG livrés pour les régions sont des **illustrations provisoires, PAS des drapeaux officiels**. Tu peux glisser tes propres drapeaux dans `assets/flags/regions/fr/` en gardant les noms de fichiers (`bre.svg`, `idf.svg`, etc.).

## Supabase plus tard

La démo fonctionne sans SQL. Pour enregistrer réellement les régions, exécuter le fichier `supabase/06_regions_fr.sql` sur le **bon projet Supabase** lors de la migration, puis renseigner `enableRegionProfiles:true` dans `js/config.js`. Ne pas le faire dans l'immédiat.

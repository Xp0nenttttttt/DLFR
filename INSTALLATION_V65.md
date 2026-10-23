# DLFR V65 — Profils : Top 75 / Extended 76–150, sans liste héritée

**Base : V64 (optimisation de la modération), avec les fonctionnalités de V63.**

## Installer

1. Sauvegarder `js/app.js` et `index.html` actuellement en ligne.
2. Remplacer **uniquement** `js/app.js` et `index.html` avec les deux fichiers du ZIP.
3. Publier les modifications via GitHub Pages.
4. Recharger le site avec `Ctrl + F5`, puis ouvrir un profil joueur → **Records**.

**Aucune migration SQL et aucun changement de configuration Supabase**. Ne modifier ni `assets/flags/`, ni l'authentification, ni les fichiers CSS.

## Changements visibles

- Le bloc **« Top 150 complété »** est séparé en **« Top 75 complété »** (positions 1–75) et **« 76–150 complété »** (positions 76–150).
- Chaque groupe conserve ses liens cliquables, ordonnés selon la position du niveau.
- **« Liste héritée complétée »** et la section des vérifications dans les archives historiques disparaissent des profils publics.
- Le compteur **« Autres complétions : … Legacy »** est remplacé par **« Complétions NLW »**.
- Les records Legacy sont exclus du tableau de records du profil (et des dernières complétions), et la ligne Legacy est retirée du tableau comparatif des joueurs.

## Ce qui ne change pas

- **Aucune suppression dans Supabase**. Niveaux, records et historique Legacy sont conservés.
- Les records, points, positions, données d'archives, NLW, UNRATED, permissions, gestion de la modération et des comptes ne sont pas modifiés.
- Les statistiques principales des catégories Main et Extended sont conservées.

## Vérifications locales

- `node --check js/app.js` : réussi.
- `node tests/test_v65.js` : contrôles des blocs du profil, des positions 1/75/76/150, de l'exclusion Legacy et de la présence des fonctionnalités V63/V64.
- La page Supabase réelle n'a pas été testée et aucun test de bout en bout sur le site publié n'a été effectué.

## Retour arrière

Restaurer uniquement `js/app.js` et `index.html` de la V64 (ou de la sauvegarde immédiatement antérieure), puis recharger le navigateur.

# DLFR — Correctif du sélecteur de niveaux dans la modération

## Le problème
Dans « Modération → Niveaux → Éditer les fiches », l'ancienne liste native contenait parfois des milliers d'options. Le menu peut se refermer ou perdre le focus pendant la sélection dans certains navigateurs.

## Nouveau fonctionnement
- Champ « Rechercher un niveau » par nom, rang, ID GD ou ID interne.
- Liste de résultats cliquables (35 résultats maximum affichés par recherche), sans menu déroulant natif géant.
- Un clic sur un niveau charge immédiatement ses informations dans l'éditeur, sans rendre toute la page à nouveau.
- Entrée sélectionne le premier résultat ; flèche bas déplace le focus ; Échap ferme les résultats.
- Le niveau choisi reste affiché au-dessus du formulaire.

## Installation
1. Sauvegarde les fichiers actuels du site.
2. Remplace `js/app.js` et `css/style.css` par ceux de cette archive.
3. Publie la mise à jour sur GitHub Pages.
4. Rafraîchis le navigateur avec Ctrl + F5. Si tu as un ancien fichier JS en cache, change la version du script `js/app.js?v=...` dans `index.html` (par ex. `v=dlfr-select-1`).
5. Ouvre Modération → Niveaux → Éditer les fiches. Recherche un niveau par nom puis clique sur son résultat.

Aucune migration SQL. Aucune modification des données, des rangs, des records ou des drapeaux personnalisés `assets/flags/`.

**Compatibilité :** `js/app.js` est basé sur le dernier correctif disponible (DLFR 2.15.1, avec la soumission des nouveaux niveaux). `css/style.css` reprend les styles 2.12 complétés par ceux du nouveau sélecteur. Si tu as modifié ces fichiers après ces versions, adapte le correctif à ton code actuel plutôt que de les remplacer directement pour éviter de perdre des changements.

## Vérifications
- `node --check js/app.js` : OK.
- Essai Chromium local : la recherche filtre les résultats ; la sélection de Shardscapes remplit le nom et la position 155.
- Pas de test réel avec la base Supabase de production.

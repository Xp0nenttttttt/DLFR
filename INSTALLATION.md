# DLFR — Correctif ciblé : clics dans l’éditeur de niveaux

## Diagnostic
Le gestionnaire de clics utilisait `closest('[data-level-group]')`.
Or `arrangeLevelsPanel()` attribue `data-level-group="edit"` à **toute la carte** contenant le formulaire.
Un clic dans le champ de recherche, le formulaire, ou la liste trouvait donc la carte
comme s’il s’agissait d’un bouton de navigation. Il exécutait `render()`, reconstruisait
le DOM et fermait le menu, parfois avant même la sélection. Ce n’est pas lié à Discord.

## Installation
1. Sauvegarder `js/app.js` et `index.html` de la version en ligne.
2. Remplacer **ces deux fichiers seulement** par ceux du patch.
3. Publier sur GitHub Pages et recharger (Ctrl+F5).
4. Aller dans Modération → Niveaux → Éditer les fiches.
5. Cliquer sur la recherche, taper un nom, sélectionner le niveau, puis modifier un champ.
   La page ne doit plus se réinitialiser à chaque clic.
6. Vérifier que les onglets « Créer », « NLW et imports » et « Retirer » fonctionnent encore.

**Aucun SQL.** Aucune modification des profils, des permissions, des records ni des drapeaux dans `assets/flags/`.
L’URL du script est versionnée dans `index.html` pour contourner le cache navigateur.

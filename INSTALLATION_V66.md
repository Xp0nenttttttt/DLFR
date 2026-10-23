# DLFR V66 — Voir les niveaux NLW complétés sur les fiches joueurs

**Base : V65** (qui intègre V64, les outils des modérateurs V63 et les autres fonctionnalités existantes).

## Installation

1. Sauvegarder les fichiers actuellement publiés sur GitHub : `index.html` et `js/app.js`.
2. Remplacer seulement ces deux fichiers par ceux du ZIP, aux mêmes emplacements.
3. Publier les modifications sur GitHub Pages.
4. Recharger avec `Ctrl + F5`, ouvrir la fiche d'un joueur ayant des complétions NLW, puis l'onglet **Records**.

**Aucun SQL**, aucune Edge Function, aucun CSS et aucune modification des images de `assets/flags/`.

## Résultat

Dans les records du profil :

- `Top 75 complété` : inchangé.
- `76–150 complété` : inchangé.
- `NLW — X niveau(x) complété(s)` : affiche maintenant les noms des niveaux réellement complétés, sous la forme de liens `NLW #<rang> <nom>` ouvrant la fiche du niveau.

Le rang affiché est celui du classement NLW (`position globale - 150`), pas la position globale.
Les liens sont ordonnés selon leur rang NLW, sans doublons. Les niveaux Legacy, UNRATED ou masqués ne sont pas inclus.
Si aucun niveau NLW n'a été complété : « Aucun ».

Les données, positions, complétions, points et permissions sont inchangés. Aucun changement pour les sections Legacy masquées dans la V65.

## Tests réalisés

- `node --check js/app.js` : syntaxe OK.
- `node tests/test_v65.js` : cohérence des sections Top 75 / 76–150 et maintien des fonctions V63/V64.
- `node tests/test_v66.js` : trois NLW affichés dans l'ordre, liens cliquables, dédoublonnage, exclusion Legacy/UNRATED/masqués, liste vide.

Les tests utilisent des données simulées. Le rendu et les données de ton Supabase réel restent à vérifier après publication.

## Retour arrière

Restaurer uniquement `index.html` et `js/app.js` de la V65 ou de ta sauvegarde précédente.

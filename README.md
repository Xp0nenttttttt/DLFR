# DemonlistFrancophone — V2.0 (front-end de démonstration)

Reproduction HTML/CSS/JavaScript de la DemonlistFrancophone à partir du projet V1.2, destinée à GitHub Pages, avec mode démonstration **indépendant** de la base officielle.

Voir `V2.0-A-LIRE.md` pour les fonctionnalités, limitations, règles de points et recommandations avant migration Supabase.

## Test rapide

- Publier le projet complet sur GitHub Pages.
- Ouvrir `https://TON-PSEUDO.github.io/DLFR/?demo=1`.
- Choisir Clair / Sombre / Midnight / Automne, activer UNRATED, consulter Top 150, NLW, Stats, Actualités, Hall of Fame, Calculateur, Non battus, Achievements FR, Clans et Historique.
- Dans « Modération », activer le mode modérateur de démonstration.
- Importer les niveaux depuis un `.csv` exporté par Excel. Les fichiers `.xlsx` fonctionnent via une bibliothèque JavaScript chargée en ligne ; en mode hors-ligne, exporter en `.csv`.

## Architecture

- `index.html` : navigation et fichiers scripts.
- `css/style.css` : style Pointercrate + 4 thèmes + surlignages.
- `js/app.js` : navigation, formulaires, rendu des pages, chargement Supabase existant.
- `js/demo-data.js` et `js/v2-demo.js` : données illustratives, non officielles.
- `js/v2-core.js` : moteur pur des classements alternatifs NLW, badges, historique Legacy, parseur CSV.
- `js/config.js` : URL/clé publique de votre projet Supabase (garder sa version existante lors d'un patch).
- `supabase/04_v2_PREPARATION_NE_PAS_EXECUTER.sql` : esquisse de migration future, non validée pour production.
- `tests/v2-core.test.js` : tests unitaires exécutables avec Node.js.

## Limites

Les données réelles MySQL n'ont pas été transférées. Les fonctions V2 ajoutées n'écrivent pas dans Supabase tant que les tables/permissions nécessaires ne sont pas déployées. Le rôle NLW et les sanctions sont simulés en mode local, sans impact sur les comptes Supabase Auth. Le barème NLW est provisoire, à valider avec les administrateurs.

Conserver l'ancien site et les sauvegardes SQL jusqu'à la validation intégrale.


## Nouveauté V2.0.1 : Excel communautaire
La page **Non battus** lit `data/niveaux-non-battus.xlsx` automatiquement depuis GitHub Pages ; elle affiche uniquement les démons encore non vérifiés. Les changements sont détaillés dans `EXCEL-NON-VERIFIES.md`.

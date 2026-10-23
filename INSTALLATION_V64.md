# DLFR V64 — Optimisation de la modération

Version de départ : **V63 (création des niveaux UNRATED par les modos standards)**.

## Installation
1. Sauvegarder les fichiers actuellement publiés.
2. Remplacer `js/app.js` et `index.html` par ceux de cette archive, sans modifier les autres fichiers.
3. Déployer sur GitHub Pages et recharger la page avec `Ctrl + F5`.
4. Vérifier les onglets Modération : Accueil, Demandes, Niveaux, Level Packs, Profils, Actualités, Journal, Équipe (si propriétaire), ainsi que l'ajout UNRATED depuis un compte modo classique.

Aucune migration SQL ni Edge Function à redéployer. **Ne pas remplacer `assets/flags/` : vos drapeaux restent inchangés.** Ne pas remplacer `js/username-auth.js` : les correctifs d'authentification V62/V57 sont conservés.

## Optimisations

- L'éditeur des Level Packs (une case par niveau) est **construit seulement dans l'onglet Level Packs**. Auparavant, cette grille HTML était créée même lorsqu'elle était cachée sur d'autres onglets.
- Les tables de personnalisation, abonnements et Level Packs ne sont **plus chargées automatiquement** pour ouvrir simplement l'accueil de la modération. Les données nécessaires s'activent à l'ouverture de l'onglet correspondant.
- Les tables staff `dlfr_level_archive_log`, `community_audit_log` et `player_sanctions` ne sont désormais interrogées que pour leurs rubriques Niveaux, Journal et Sanctions, si le compte possède les permissions requises.
- Après une modification simple (actualités, achievements, titres, profils, visibilité, Hall of Fame), la page ne relit que les tables concernées, au lieu de recharger tous les niveaux, records et classements. Les opérations délicates (déplacement de niveau, validation et fusion) conservent volontairement le rafraîchissement complet.
- Enregistrer un Level Pack relit uniquement les trois tables des Level Packs. La limite de quatre lectures Supabase simultanées par onglet introduite en V61 est conservée.
- Les requêtes restent soumises aux politiques de sécurité (RLS) existantes ; aucune permission supplémentaire n'est accordée.

## Vérifier le gain

Comparer, à activité équivalente, les onglets **Réseau/Network** et **Performance** du navigateur avant et après installation. Ouvrir `?page=admin&perf=1` sur la DLFR pour activer les logs `[DLFR perf] Lecture ... ms` et `[DLFR perf] Rendu admin ... ms` dans la console.

Le script `diagnostic/64_PERF_LECTURE_SEULE.sql` est facultatif et sans écriture. Ne pas confondre nombre de comptes joueurs et connexions PostgreSQL : les connexions affichées dans ce diagnostic sont un instantané technique.

## Limites et retour arrière

La baisse réelle de RAM/CPU du projet Supabase dépend de la charge, des caches et de l'activité du site ; le correctif n'est pas une garantie de réduction de RAM. Les gros rafraîchissements restent pour les opérations modifiant les classements. Si une fonctionnalité manque, restaurer les deux fichiers V63 et recharger le site.

Tests locaux : syntaxe `node --check` et scénarios de chargement par onglet / rendu synthétique des Level Packs. **Pas de test effectué sur la base Supabase de production**.

# DLFR V61 — optimisation du chargement Supabase

## Base du correctif
V60 (« Modos : ajout/édition de niveaux »). Les changements de la V57 (anciens comptes), V58 (Discord, YouTube, actualités, directives), V59 (Mes soumissions) et V60 sont conservés dans le fichier `app.js` fourni.

## Installation
1. Faire une copie de sauvegarde de `js/app.js` et `index.html` actuellement publiés.
2. Remplacer **uniquement** ces deux fichiers depuis le ZIP à la racine de votre dépôt GitHub Pages.
3. Attendre la publication GitHub Pages puis forcer le rafraîchissement (Ctrl+F5).
4. Vérifier les pages Demonlist, Statistiques, Profil joueur, Level Packs, Mes soumissions et Modération.

**Pas de nouveau SQL, aucune migration, aucune nouvelle Edge Function.**
Ne pas remplacer le dossier `assets/flags/` ni d'autres fichiers.

Si des changements non inclus dans la V60 ont été faits dans votre `js/app.js` après le dernier patch, **fusionner les changements** au lieu d'écraser la version live.

## Optimisations introduites
- La Demonlist (page d'accueil) ne charge plus à l'ouverture les 8 tables optionnelles suivantes :
  `dlfr_profile_preferences`, `dlfr_profile_showcase`, `dlfr_profile_follows`,
  `dlfr_level_packs`, `dlfr_level_pack_levels`, `dlfr_level_pack_claims`,
  `player_stat_snapshots`, `demon_position_history`.
- Les pages qui en ont besoin chargent automatiquement les groupes concernés lors de leur ouverture. L'interface affiche « Chargement des données de cette page… » pendant ce chargement.
- Maximum **4 lectures de tables PostgREST en cours simultanément** dans cet onglet navigateur, y compris la pagination à 1000 lignes.
- Pour les joueurs connectés sans rôle staff, les soumissions sont filtrées explicitement sur leur `auth_user_id` en plus de la RLS (qui reste obligatoire).
- Après une opération de modération / une actualisation globale, les groupes optionnels sont invalidés : ils ne sont relus que si nécessaire.
- Les classements, records, comptes, droits modérateurs et validations restent inchangés.

## Contrôler les effets
Pour mesurer le temps des lectures et rendus dans la console du navigateur, ajouter `&perf` à une URL contenant déjà `?page=...` (exemple : `?page=list&perf`). Les logs `[DLFR perf]` décrivent chaque lecture.

Dans Supabase, comparer **sur des périodes similaires** les requêtes PostgREST, la RAM, les connexions et les temps de réponse, idéalement avec un trafic comparable. Le maximum de 4 lectures dans un onglet ne correspond pas à 4 connexions PostgreSQL dédiées, car la connexion passe par PostgREST / le pool.

## Limites
- Cette V61 est une optimisation prudente : les données essentielles (niveaux, records, joueurs, actualités, etc.) sont toujours chargées ensemble pour ne pas casser les fonctionnalités historiques.
- L'ouverture d'une page de profil ou des Level Packs peut provoquer un léger chargement initial supplémentaire. Une fois chargé, un groupe est conservé tant qu'aucune actualisation globale ne l'invalide.
- Les gains réels de RAM Supabase et le nombre de connexions dépendent de l'activité, du pool et des plans du projet : ils ne sont **pas** garantis par cette modification du navigateur.
- Pas de tests contre la base de production : valider le comportement sur le site réel avant diffusion.

## Tests effectués hors production
- `node --check` sur `js/app.js`
- 12 assertions locales : groupes requis par page, non-rechargement des groupes déjà chargés, invalidation des réponses obsolètes, concurrence maximale (pic simulé de 4), contrôle statique des changements.

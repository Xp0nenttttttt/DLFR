# DLFR — Correctif classement des pays + badges NLW

Compatible avec le **correctif Rain précédent** et avec les fichiers fournis dans `DLFR (4).zip`. Ce patch contient la dernière version corrigée de `js/app.js` (il conserve les corrections `localeCompare`, Discord/modération et points de vérification), ainsi que deux modules JS modifiés. Si ton dépôt GitHub a changé depuis, fusionner plutôt que remplacer aveuglément.

## 1) GitHub Pages

Copier les **trois** fichiers de `js/` dans le dossier `js/` du dépôt, puis commit :
- `js/app.js`
- `js/badge-system.js`
- `js/v2-core.js`

Actualiser le site avec Ctrl + F5 une fois le déploiement terminé.

Le classement des pays et le compteur des joueurs classés incluent désormais tous les profils publics, y compris `has_account=false`. Les joueurs dont le pays est inconnu sont regroupés en « Non renseigné », sans inventer de nationalité.

Les profils sans véritable record NLW affichent désormais « — » à la place d’un rang NLW, et les anciennes fiches Legacy ne sont plus comptées comme du NLW.

Le système de badges affiche un badge NLW comme obtenu **uniquement si les complétions à 100 % d'un joueur concernent suffisamment de niveaux NLW actuellement publiés et éligibles**, et non les niveaux masqués, Legacy, UNRATED ou les positions techniques >= 100000000. Les autres badges et leurs attributions sont inchangés. Le classement et les points NLW sont également protégés dans `v2-core.js`.

## 2) Supabase SQL Editor

Après sauvegarde, exécuter `CORRECTIF-SQL-BADGES-NLW.sql` pour corriger la fonction serveur `public.dlfr_award_progress`. L'appel du déclencheur existant continue de fonctionner. La fonction ne considère plus un niveau masqué ou technique comme NLW.

Exécuter `DIAGNOSTIC-PAYS-BADGES-LECTURE-SEULE.sql` pour contrôler les attributions NLW passées et les pays de l'ancien site. Les requêtes sont en lecture seule. **Aucune attribution passée n'est effacée automatiquement :** certains badges enregistrés antérieurement peuvent rester dans `public.badge_awards` et apparaître dans le diagnostic comme « à vérifier ». Le frontend n'affiche plus les attributions NLW dépourvues des complétions publiées requises.

Important : si une autre migration a remplacé `dlfr_award_progress` après la version `11_production.sql`, comparer sa fonction avant d'appliquer ce SQL. Ne pas relancer `11_production.sql` pour corriger ce problème.

## Ce qui reste hors du patch

- Aucune importation rétroactive du pays d'un joueur qui a `country_code` vide. Le diagnostic les recense.
- Aucun changement de rang, aucune publication de niveaux en attente, aucune correction automatique des records absents de Rain.
- Aucune modification de la connexion Discord, des rôles SQL ni des politiques RLS.

**Ne toucher ni à `js/config.js`, ni à `assets/flags/`, ni aux clés/secrets Supabase.**

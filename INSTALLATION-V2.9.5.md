# DLFR V2.9.5 — AREDL complet, catalogue + preuves FR/BE

Patch **uniquement**, fondé sur le code V2.9.4. Aucun fichier `assets/flags/`, aucune modification du frontend DLFR, aucune clé secrète, et aucune écriture Supabase automatique.

## Principe de données

- **L'AREDL fournit le catalogue de tous ses niveaux rated**, et leur **rang AREDL**.
- La **position Main / Extended / NLW DLFR est indépendante** du rang AREDL. Ce patch ne choisit jamais automatiquement une position DLFR.
- Un niveau **non présent sur l'AREDL**, ou UNRATED, peut être ajouté **manuellement à la DLFR**. Une synchronisation AREDL ne le supprime pas.
- Une fiche DLFR déjà validée manuellement est préservée. Le rapprochement repose sur l'**ID Geometry Dash**, puis l'**ID AREDL** ; une égalité de pseudo ou de nom de niveau n'est pas une preuve d'identité.
- Les vidéos des vérificateurs FR/BE et des **plus anciens records FR/BE datés observés** n'apparaissent qu'en mode détaillé. Cela ne constitue pas une certification historique de « première victoire ».
- Aucune fusion de compte AREDL/Discord par pseudo : il faudra une demande puis une preuve de propriété.

## Installer le patch sur GitHub

Décompresser à la racine du dépôt et remplacer :

- `tools/aredl_nlw_sync.py`
- `tools/aredl_nlw_stage_plan.py`
- `.github/workflows/aredl-nlw-review.yml` (même chemin que précédemment, pas de deuxième workflow)
- `tests/test_aredl_nlw_sync.py` et `tests/test_aredl_nlw_stage.py` pour les tests automatisés

Ajouter : `supabase/10_aredl_level_stage_OPTIONNEL.sql` et les fichiers `imports/` facultatifs.

**Ne pas remplacer le dossier `assets/flags/` ni `js/config.js`.**

## Deux modes dans GitHub Actions

**A. `catalog` (recommandé pour commencer)**

- `start_rank`: `1`
- `end_rank`: `99999` (sélectionne tous les rangs retournés par l'AREDL)
- `scan_mode`: `catalog`

Un seul appel `/levels` : récupère les noms, ID GD, ID AREDL et rangs de toute la liste. Les records et vidéos ont explicitement l'état `not_scanned` et **ne sont pas effacés** lors d'une mise à jour catalogue ultérieure.

**B. `detailed` (plus lent, petites tranches)**

- `scan_mode`: `detailed`
- `start_rank`: `1`, `end_rank`: `20` (ou `261` à `280` si tu reprends après l'export reçu)
- `max_record_pages`: `25`

Récupère fiches, profils et records paginés pour les vérificateurs FR/BE, premières victoires datées disponibles, vidéos et miniatures. **Ne pas lancer 2 000 niveaux en détaillé d'un seul coup** ; choisir des lots courts. Le cache aide lors des relances.

Si une lecture de records est incomplète, le script l'exclut des preuves complètes. Un échec n'autorise pas la publication.

Les fichiers produits gardent les noms historiques `aredl-nlw-review.*` et `aredl-nlw-stage.*` **pour rester compatibles** avec la prévisualisation V2.9.4, malgré leur périmètre désormais global.

## Pré-import contrôlé dans Supabase (facultatif)

Pour préparer une table d'attente privée :

1. Examiner puis exécuter *manuellement* `supabase/10_aredl_level_stage_OPTIONNEL.sql` dans le SQL Editor Supabase.
2. Tu peux ensuite examiner et exécuter *manuellement* `imports/aredl-220-260-stage-OPTIONNEL.sql` : c'est la conversion de **ton ZIP réel #220–260**, elle prépare 41 fiches en attente, aucune publication.
3. Pour toute nouvelle tranche, récupérer le fichier `aredl-nlw-stage.sql` généré par GitHub Actions ; vérifier son CSV et les conflits avant de l'exécuter dans le SQL Editor.
4. La table `dlfr_aredl_level_stage` est **privée (RLS, aucun accès anon/authenticated)**. Les données ne sont donc pas encore sur le site public. **L'import réel vers `demons`, `completions` et les profils attend une migration de publication à construire après vérification du schéma actuel Supabase et des règles de modération.**

Ne jamais exposer la clé `service_role` dans GitHub Pages, ni utiliser le client public pour des importations privilégiées.

Le SQL de staging est rejouable sous conditions : il ne modifie que les lignes `pending` non verrouillées, refuse d'apparier deux identifiants AREDL différents au même ID Geometry Dash et ne remplace pas des preuves détaillées par un catalogue sans preuves.

Si tu as déjà créé l'ancienne table `dlfr_aredl_nlw_stage` (V2.9.3), **ne la supprime pas** : c'est une table distincte. Réconcilier les anciennes données avant toute opération destructrice.

## Pour la suite : synchronisation réelle

La future synchronisation automatisée pourrait tourner toutes les six heures côté GitHub Actions **après** configuration sécurisée d'un importateur serveur et des contraintes de base :

- contrôle `/levels` pour les nouveaux ID, changements de noms et rangs ;
- synchronisation détaillée prioritaire des niveaux nouveaux ou modifiés, puis roulement des plus anciens ;
- rapprochement par ID GD et ID AREDL ; validation manuelle prioritaire ;
- mise à jour des médias approuvés sans écraser une correction modérateur ;
- aucune suppression automatique lorsqu'un niveau disparaît de l'AREDL ;
- comptes AREDL externes conservés tant qu'un utilisateur Discord n'a pas prouvé la propriété.

**Ce workflow ne fait actuellement qu'un aperçu**, pas une tâche de publication ou de synchronisation de base de données automatique.

## Validation locale

`python -m unittest discover -s tests -p 'test_aredl_nlw_*.py' -v`

Les tests couvrent notamment rang #1, mode catalogue sans appels de détail, antériorité des médias et garde-fous du staging. Le JSON AREDL de ton ZIP #220–260 a été converti en **41 fiches de staging valides** sans exclusion.

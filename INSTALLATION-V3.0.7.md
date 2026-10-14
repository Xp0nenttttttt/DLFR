# DLFR V3.0.7 — Corriger les variantes AREDL Solo et 2P

## Cause

Sur l'AREDL, une fiche **Solo** et une fiche **2P** peuvent posséder **le même identifiant Geometry Dash** et **deux identifiants AREDL distincts**. Le contrôle V3.0.6 refusait ces fiches par erreur.

Les vrais doublons d'ID AREDL, les ID GD absents et les noms invalides restent des anomalies.

## Installation (impérativement dans cet ordre)

1. **Faire une sauvegarde Supabase** des tables `public.dlfr_aredl_level_stage` et `public.demons` et de la base avant toute migration. Ne lancez pas `publish` pendant l'installation.
2. Dans **Supabase → SQL Editor**, exécuter **`supabase/16_aredl_variantes_solo_2p.sql`**. Prérequis : les SQL DLFR jusqu'au n°15. Cette migration change la **clé primaire de la table d'attente** : de `gd_level_id` vers `aredl_id`. Elle **ne supprime aucune fiche** et **ne change aucune position DLFR**.
3. Sur GitHub, remplacer `tools/aredl_catalog_sync.py`, `js/production-tools.js`, `index.html`, et `tests/test_aredl_catalog_sync.py` (les tests sont conseillés). Le fichier `tools/aredl_nlw_sync.py` est déjà utilisé par la version précédente : pas besoin de le remplacer si présent.
4. Attendre GitHub Pages / Actions et ouvrir **Actions → AREDL – synchronisation globale Supabase** avec **`mode=preview`**.
5. Examiner `aredl-global.csv` et `aredl-global.invalid.csv`. Les colonnes `completion_mode`, `shared_gd_level` et `needs_variant_review` facilitent le contrôle. **Le nombre initial de 18 problèmes peut changer ; ils ne sont pas tous nécessairement des variantes Solo/2P.**
6. Lancer **`mode=stage`**, puis vérifier les entrées dans la table d'attente. Cela ne les publie pas.
7. **Avant de lancer `publish`**, vérifier qu'une paire Solo/2P est bien identifiée, et que les rangs proposés n'écrasent pas les fiches manuelles. Pour les cas sans nom explicite, choisir **Solo** ou **2P** dans **Modération → Import AREDL** après vérification. Les rangs occupés restent à placer manuellement.

## Ce qui se passe dans Supabase

- `gd_level_id` peut désormais apparaître **plusieurs fois** dans la table d'attente.
- `aredl_id` identifie de manière **unique** une fiche AREDL et devient la clé de synchronisation et d'approbation.
- `completion_mode` stocke `solo`, `two_player`, `standard` ou `unspecified`.
- Les fiches Solo / 2P ont des records et des vérificateurs à traiter **par fiche AREDL**, pas par ID GD. L'import des records détaillés reste un flux distinct à adapter avant son automatisation publique.
- Quand la variante est incertaine, la fiche reste en attente ; seul un modérateur peut confirmer la variante.
- Les rangs **DLFR** (champ `demons.position`) ne sont jamais recalculés automatiquement lors du sync AREDL. Une collision de rang reste un conflit et ne déplace pas les niveaux déjà présents.
- Les niveaux déjà créés ou vérifiés manuellement sont protégés. Si une fiche manuelle est ambiguë entre Solo et 2P, l'import demande un rapprochement humain.
- Le catalogue ne contient pas les victoires, et ce patch ne synchronise donc pas encore leurs vidéos.

## Attention aux anciens scripts

Après cette migration, **ne plus exécuter** l'ancien SQL de pré-import qui utilise `ON CONFLICT (gd_level_id)`. Il ciblait l'ancienne clé primaire et n'est plus compatible avec les variantes Solo/2P. Utiliser le workflow GitHub Actions avec le nouveau `aredl_catalog_sync.py`.

## Tests et limites

- Tests Python : 16 tests unitaires réussis (variantes reconnues, variantes ambiguës, doublons réels, quarantaine, fichiers de rapport).
- Tests de rendu des formulaires : 2 tests Node réussis.
- Syntaxe JavaScript : vérifiée.
- **Migration PostgreSQL non exécutée sur ton vrai Supabase**. Contrôle le premier `stage`, puis publie une seule entrée de test avant de lancer une publication globale.
- Aucun secret, fichier `config.js` ou drapeau personnalisé (`assets/flags/`) n'est inclus.

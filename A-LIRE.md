# DLFR — Crédits des niveaux et points NLW historiques

À installer **après** le patch `DLFR_correctif_stats_NLW_simplifiee.zip` et la migration de rôles 26 corrigée. Les nouveaux RPC sont réservés aux **owner / supermoderator / ancien editor**. Les modos classiques et NLW ne peuvent pas modifier les métadonnées ou publier un niveau.

## Problèmes corrigés

- `AREDL` est généralement dans **« publié par » (`publisher`)**, tandis que le champ **« créé par » (`creator`)** peut être vide. Les deux sont désormais éditables dans **Modération → Niveaux**, avec sélection et préremplissage de la fiche existante.
- **Récupérer depuis la sauvegarde** permet de compléter les champs vides / AREDL si `dlfr_legacy.level_links` contient une correspondance déjà validée. Cela ne remplace pas les crédits manuels.
- Les anciens niveaux #151 et suivants sont aujourd'hui des **archives statiques**. Leur barème NLW est indiqué **à titre estimatif** sans leur donner automatiquement des points, des rangs ou des badges.
- Dans **Modération → Niveaux → Homologuer un ancien niveau NLW**, les supermodos peuvent publier les fiches historiques déjà rapprochées, avec un rang NLW (151 = NLW #1). Le RPC réutilise le `demon_id` relié à la sauvegarde : ses complétions importées suivront la fiche et pourront donner des points NLW. Il ne fabrique pas de records.

## Installation sûre

1. Sauvegarder Supabase, en particulier `demons`, `completions`, `dlfr_legacy.levels`, `dlfr_legacy.level_links`, `dlfr_level_archive_log`, et faire un commit GitHub.
2. Exécuter `supabase/28_DIAGNOSTIC_NLW_HISTORIQUE_LECTURE_SEULE.sql` dans Supabase SQL Editor, vérifier que les niveaux voulus sont liés et que leurs records sont présents.
3. Exécuter **une seule fois** `supabase/28_credits_et_homologation_nlw.sql` (définit trois RPC, ne publie rien immédiatement). Tester si possible dans un projet Supabase de test.
4. Remplacer uniquement `js/app.js` depuis ce patch, publier GitHub Pages et faire `Ctrl+F5`. Ne pas remplacer la version plus récente de `js/production-tools.js`.
5. Dans Modération → Niveaux : tester la modification des crédits d'un seul niveau. Puis homologuer **un seul ancien NLW**, choisir une position disponible, confirmer en saisissant `PUBLIER NLW`, et vérifier sa fiche et le rang/points NLW du joueur.

## Précautions

- L'ancien rang #151+ est un **rang historique**. Il sert de suggestion, pas de confirmation du rang NLW actuel. Si un rang est occupé, le RPC refuse sans décaler d'autres niveaux.
- Si l'ancienne fiche n'est pas liée en base, la publication est refusée ; utiliser la migration V3.2 et vérifier les cas Solo/2P plutôt que de créer une fiche en double.
- Si le joueur a encore 0 point après publication, examiner les records importés et les correspondances `demon_id`/`player`, sans inventer de victoires.
- Les résultats SQL n'ont pas été exécutés sur ta base réelle. Ce patch n'inclut ni `assets/flags/`, ni `js/config.js`, ni synchronisation AREDL. Les crédits édités ne sont pas réécrits par l'import catalogue actuel lorsqu'il met à jour les fiches existantes.

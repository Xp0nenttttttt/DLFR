# DLFR V3.1.1 — Retirer et restaurer des niveaux

## Pourquoi l'archivage plutôt que la suppression définitive ?
Un niveau est retiré de la Demonlist publique mais **reste en base** avec ses victoires, ses preuves vidéo et son historique. Il peut être restauré. Les comptes, statistiques historiques et badges permanents ne sont pas effacés.

## Installation (dans cet ordre)
1. **Sauvegarder les données Supabase** au minimum `demons`, `completions`, `demon_position_history`, `community_audit_log`.
2. Dans **Supabase → SQL Editor**, exécuter `supabase/25_archivage_niveaux.sql`. Pré-requis : les migrations V3.1.0, en particulier `dlfr_can_moderate`, `dlfr_make_room`, `demons.is_public` et `community_audit_log`.
3. Sur GitHub, remplacer `js/app.js` et `js/production-tools.js` par ceux du patch. Ne pas remplacer `js/config.js`.
4. Attendre le déploiement, faire **Ctrl+F5**, se connecter à Discord avec un rôle `owner` ou `editor`.
5. Ouvrir **Mon espace → Modération → Niveaux → Retirer ou restaurer un niveau**.

## Supprimer de la liste
Choisir le niveau, saisir son **nom exact** pour confirmer, ajouter un motif facultatif puis cliquer sur **Retirer ce niveau de la liste**. La base crée un journal d'archivage, déplace la fiche dans une zone de stockage invisible et referme la suite des **rangs Rated** pour qu'il n'y ait pas de trou dû au retrait. Pour **UNRATED**, la liste alternative est indépendante et les autres positions ne bougent pas.

## Restaurer
Dans la même section, choisir la fiche retirée et cliquer **Restaurer ce niveau**. Par défaut, son ancien rang est proposé automatiquement. Il est possible d'en indiquer un nouveau. Sur la liste Rated, les suivants seront décalés lorsque la place est occupée. Sur UNRATED, choisir un autre rang si l'ancienne position est déjà prise.

## Sécurité
- La fonction SQL refuse les utilisateurs qui ne sont pas modérateurs généraux ; les modérateurs NLW ne reçoivent pas ce droit par défaut.
- L'archivage demande le nom exact du niveau et écrit une entrée dans `community_audit_log`.
- Pas de commande `DELETE` sur `demons` ni sur `completions`.
- Pas de changement sur les drapeaux PNG ; le ZIP ne contient aucun `assets/flags`.
- Le retrait ne supprime pas les badges permanents ; le recalcul des classements dépend de la position des autres niveaux.

## Limites
Ce patch a fait l'objet de tests JavaScript et de contrôles statiques SQL. **Il n'a pas encore été exécuté sur ta vraie base Supabase**, teste d'abord un niveau sans impact important, puis restaure-le.
Si tu veux une suppression physique définitive, ce serait une fonction distincte réservée au propriétaire, avec sauvegarde préalable et stratégie explicite pour les records.

# DLFR V3.0.4 — Publication AREDL contrôlée, rangs et modération

Ce fichier accompagne **uniquement un patch**, à appliquer par-dessus la V3.0.2. Aucun fichier `assets/flags/` n'est inclus et `js/config.js` n'est pas modifié.

## 1. Sauvegarde et prérequis

1. Sauvegarder/exporter les tables Supabase existantes avant la migration (notamment `demons`, `completions`, `players`, `staff_roles`). Si possible, effectuer un backup du projet entier.
2. Vérifier que les migrations V3.0 `11_production.sql`, `12_clan_actions.sql` et V3.0.2 `13_self_signup_discord.sql` ont réussi.
3. **Obligatoire pour publier l'AREDL :** créer la table d'attente en exécutant `supabase/10_aredl_level_stage_OPTIONNEL.sql` (fichier déjà fourni dans le patch V3.0.3). Si elle existe déjà, ne pas la recréer ni effacer ses données.
4. Vérifier que ton compte Discord possède le rôle `owner` dans `public.staff_roles`.
5. Exécuter **une seule fois** `supabase/14_publication_roles_positions.sql` dans Supabase SQL Editor. L'exécution est additive/idempotente ; le SQL **ne publie aucun niveau immédiatement**.
6. Déployer les fichiers du patch GitHub et recharger avec Ctrl+F5.

## 2. Corriger le thème sombre

Le CSS `css/production.css` utilise désormais les variables `--card`, `--panel`, `--ink`, `--border` du thème choisi. Les blocs blancs de la modération, ainsi que leurs champs, prennent donc le fond sombre attendu. Le correctif s'applique aussi aux thèmes Midnight et Automne.

## 3. Ajouter des modérateurs généraux

Dans **Modération → Gestion des modérateurs** (visible uniquement pour le propriétaire) :

1. La personne doit **s'être connectée à la DLFR avec Discord** au moins une fois.
2. Dans Supabase → Authentication → Users, copier son **User UID** (pas le pseudo Discord, ni un mot de passe).
3. Coller l'UID et sélectionner **Modération générale**, puis **Ajouter / attribuer**.
4. Pour retirer le rôle, choisir **Retirer ce rôle**.

La modification est exécutée via `dlfr_set_moderator`, qui vérifie le rôle `owner` **dans PostgreSQL** et empêche de modifier un autre propriétaire ou de s'auto-rétrograder par erreur. Le groupe NLW peut être renseigné séparément, **mais ses permissions d'édition limitées ne sont pas encore actives en production** ; l'appartenance NLW ne confère aucun pouvoir de modération générale.

## 4. Publier les niveaux depuis l'AREDL

1. En utilisant le SQL de pré-import V3.0.3 (`imports/01_aredl_220_260_stage.sql`) ou des imports AREDL ultérieurs, renseigner la table d'attente `public.dlfr_aredl_level_stage`.
2. Dans **Modération → Import AREDL**, inspecter chaque niveau : nom, rang AREDL, ID GD, état des preuves.
3. Si le niveau est nouveau, son **rang AREDL est proposé comme rang DLFR initial**. Tu peux le changer.
4. Si une autre fiche occupe déjà la position, cocher **Décaler les niveaux suivants** uniquement si tu veux vraiment insérer ce niveau à ce rang. La transaction décale les rangs Rated ultérieurs ; les UNRATED restent séparés.
5. Si l'ID Geometry Dash correspond à un niveau existant, le serveur **met à jour la fiche existante sans changer sa position DLFR**. Les vidéos et vérificateurs saisis manuellement ne sont pas écrasés.
6. Commencer par **un seul niveau**, vérifier sa fiche publique, son nom, sa vidéo et les positions voisines, puis poursuivre.

Le traitement est atomique. En cas de nom identique avec un autre ID GD, ID AREDL contradictoire, ou position occupée sans autorisation de décalage, il échoue **sans publier une fiche partielle**.

**Important :** ce patch publie les **fiches des niveaux** et leurs métadonnées FR/BE. Il **n'importe pas encore automatiquement toutes les complétions** et ne crée pas de comptes Discord à partir des pseudos AREDL. Aucune prétendue première victoire historique n'est certifiée : l'interface mentionne « plus ancien record FR/BE daté disponible ».

## 5. Accepter un niveau vérifié manuellement et choisir son rang

Dans **Modération → Niveaux**, entre son nom, son ID Geometry Dash et la position souhaitée. Un niveau **Rated** nouveau est inséré à ce rang et décale les niveaux suivants. La validation d'une soumission de nouveau niveau Rated suit la même règle côté serveur.

Exemple : insertion au **#220** → l'ancien #220 passe #221, l'ancien #221 passe #222, etc. On ne crée pas deux niveaux au même rang. Les fiches et records restent rattachés aux mêmes IDs ; leurs points dérivés du rang peuvent être recalculés.

Les niveaux UNRATED utilisent un espace de positions distinct et ne déclenchent pas le décalage du classement Rated.

## 6. Que se passe-t-il à la prochaine mise à jour de l'AREDL ?

- Le catalogue/scan AREDL alimente **d'abord la table d'attente**. Le nouveau `tools/aredl_nlw_stage_plan.py` peut rafraîchir les fiches déjà approuvées sans écraser les fiches marquées `manually_locked` ou les conflits.
- Les champs `aredl_rank` peuvent évoluer selon l'AREDL, **mais `demons.position` n'est jamais déplacé automatiquement**. Cela évite de défaire un classement choisi manuellement par nos modérateurs.
- Pour appliquer de nouvelles preuves ou un nouveau rang AREDL aux métadonnées d'une fiche déjà publiée, le modérateur peut réutiliser « Rapprocher / compléter la fiche » (ne change pas la position DLFR).
- L'automatisation planifiée (GitHub Actions → ingestion SQL Supabase sans secrets exposés → publication conditionnelle) **n'est pas encore activée**. Le workflow actuel génère des fichiers à revoir ; il n'écrit pas directement en production.

## 7. Vérifier après l'installation

Dans Supabase SQL Editor, requête **lecture seule** :

```sql
SELECT position, name, level_id, aredl_rank, verifier, verifier_video_url,
       first_frbe_player, first_frbe_video_url, data_source
FROM public.demons ORDER BY position LIMIT 30;

SELECT review_state, count(*)
FROM public.dlfr_aredl_level_stage GROUP BY review_state;
```

Pour vérifier que la position Rated est unique :

```sql
SELECT position, count(*) FROM public.demons
WHERE position < 100000000 GROUP BY position HAVING count(*) > 1;
```

Résultat attendu de la dernière requête : aucune ligne.

**Tests réalisés localement :** syntaxe JavaScript, tests unitaires des nouveaux formulaires et anciens tests frontend. **Limite :** la migration PostgreSQL n'a pas pu être exécutée sur ta base réelle depuis cet environnement. Sauvegarde et teste une fiche avant d'importer 2 000 niveaux.

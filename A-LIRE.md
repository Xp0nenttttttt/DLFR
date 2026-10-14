# DLFR — correction « and more » et rôles modération (V3.2 pilote)

**Base de départ :** les correctifs antérieurs, en dernier `DLFR_patch_hardest_archives.zip`. Ce ZIP ne remplace que deux fichiers JS et ajoute un SQL de migration ainsi qu'un SQL de diagnostic. **Aucune image, aucun fichier `assets/flags/`, aucun `js/config.js` n'est inclus.**

## Sauvegarder ET tester avant la production

1. Faire un commit GitHub et exporter une sauvegarde Supabase, notamment `players`, `completions`, `demons`, `level_submissions`, `staff_roles`, `nlw_staff_roles`, `community_audit_log`. Tester idéalement sur une copie Supabase.
2. Vérifier que les migrations Supabase **11, 14, 19 et 21** sont installées. `21_soumissions_visibilite_equipe.sql` doit être présent. Sinon, ne pas exécuter le patch.
3. Exécuter `supabase/26_roles_moderation_scoped.sql` **une fois** dans Supabase SQL Editor. Ce SQL ne modifie pas le classement ni les enregistrements. Il ajoute de nouveaux rôles et deux fonctions RPC de validation.
4. Sur GitHub, copier `js/app.js` et `js/production-tools.js`. Attendre le déploiement GitHub Pages et faire `Ctrl + F5`.
5. Dans Modération → Gestion des modérateurs (propriétaire), choisir l'UID **Auth Supabase** d'un compte ayant déjà utilisé Discord, et attribuer un rôle. Retester avec ce compte après reconnexion.

## Rôles

| Rôle | Ce qu'il peut faire | Ce qu'il ne peut pas faire |
| --- | --- | --- |
| Modo NLW | Valider/refuser les soumissions **100 %** d'un niveau **NLW déjà public**, rang 151+ | Top 150, nouveau niveau, rang, actualité, profils |
| Modo | Valider/refuser les soumissions **100 %** du Top 150 et du NLW déjà publics | Ajouter/déplacer des niveaux, créer des actualités, attribuer des droits |
| Supermodo | Gérer les niveaux et soumissions, les actualités, profils et distinctions selon les contrôles existants | Nommer le staff |
| Owner | Tous les outils, et attribution/retrait des rôles | — |

**Important :** l'ancien rôle `editor` reste équivalent à `supermoderator` jusqu'à réattribution manuelle ; aucun compte n'est rétrogradé automatiquement. Les rôles NLW et Modo utilisent une nouvelle RPC *côté SQL* qui vérifie le rang et la publication du niveau. Les soumissions ambiguës (par ex. Solo/2P), les niveaux non publiés, les UNRATED et les records partiels sont réservés à la supermodération. Pas de validation NLW possible tant qu'aucun niveau NLW n'est officiellement public.

## Le souci des « ZmL and more »

Le site mélangeait les **crédits de créateurs**, notamment les mentions « X and more », et les **vrais profils joueurs**. `ranked()` fabriquait des personnes non présentes dans `public.players`, puis la modération proposait de les masquer : impossible, d'où le message « n'est pas un compte importé ».

- Les crédits « X and more » **non enregistrés comme joueurs** ne génèrent désormais plus de faux profils. Les crédits visibles sur les fiches de niveaux sont conservés.
- Les sélecteurs de gestion des joueurs ne proposent plus que de vraies entrées `public.players`.
- La visibilité des vrais joueurs se modifie par un `UPDATE` ciblé, sans écraser leur total historique de points.
- Pour les **vrais enregistrements** `public.players` qui seraient eux-mêmes parasites, utiliser `DIAGNOSTIC_PSEUDOS_LECTURE_SEULE.sql` pour les examiner. Masquer individuellement seulement après avoir vérifié les records et liens de compte. **Aucune suppression SQL automatique.**

## Vérifications

- Tester avec un compte NLW qu'une soumission Top 150 n'apparaît pas et qu'un appel direct à `dlfr_review_existing_record` sur du Top 150 échoue.
- Tester avec un compte Modo qu'une complétion Top 150 déjà publiée peut être acceptée, mais que l'édition d'actualités est refusée.
- Tester avec un compte Supermodo que les anciennes rubriques sont accessibles.
- Tester sans rôle que la RPC refuse toute validation.
- Vérifier « ZmL and more » dans les statistiques, dans la liste des joueurs et dans la gestion de visibilité ; aucune fiche officielle avec records ne doit disparaître.

Les scripts JS ont été vérifiés par `node --check` et des tests statiques ciblés. **La migration SQL n'a pas été exécutée sur ta base réelle** : faire d'abord un essai sur une copie.

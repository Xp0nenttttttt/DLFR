# DLFR — Correction SQL rôles (26) et badges historiques (27)

## Pourquoi la migration des rôles échouait

PostgreSQL n'acceptait pas `position` comme nom de colonne non échappé dans `RETURNS TABLE(...)`. Le script 26 corrigé écrit `"position" integer`, en **conservant** la clé de retour `position` attendue par le JavaScript. Le `BEGIN`/`COMMIT` de la migration fait qu'une erreur SQL annule normalement toute cette transaction.

**Installation** : dans Supabase SQL Editor, exécuter l'**intégralité** de `26_roles_moderation_scoped_CORRIGE.sql`, à la place du fichier 26 d'origine, sur une sauvegarde / instance de test. Ne pas exécuter une ligne isolée. Les prérequis sont les migrations 11, 14, 19 et 21. Vérifier ensuite le rôle depuis un compte test réel. Le SQL n'a pas été exécuté sur votre instance Supabase depuis cet environnement.

## Pourquoi les anciens joueurs n'avaient pas de badges

La migration 11 comprenait un rattrapage des badges, mais l'import des records dans la migration `05_import_sans_ecrasement.sql` était postérieur. Le rattrapage initial n'a donc pas forcément vu ces records. En mode production, le navigateur n'attribue pas lui-même les badges Supabase. Il faut une **attribution historique après import**.

1. Exécuter `27a_APERCU_badges_historiques_LEC_SEULE.sql` : il liste précisément les badges qui seraient ajoutés, sans aucune modification.
2. Examiner le résultat, notamment quelques joueurs connus. Si les listes manquent des records, **ne pas lancer 27b** : contrôler la correspondance des records et la publication des démons avec `27c_DIAGNOSTIC_records_historiques_LECTURE_SEULE.sql`.
3. Sauvegarder `public.badge_awards`, `public.players`, `public.completions`, `public.demons`.
4. Exécuter `27b_ATTRIBUER_badges_historiques.sql` : ajoute seulement les badges AUTOMATIQUES justifiés (progression list, Main, UNRATED et vrai NLW public), `origin='historical'`, `obtained_at=NULL`. `ON CONFLICT DO NOTHING` rend le script réexécutable sans doublons. Aucune modification de record, rang ou badge existant.
5. Recharger GitHub Pages avec Ctrl+F5 et vérifier plusieurs profils. **Aucune modification du JavaScript n'est nécessaire** pour ces deux problèmes.

**Les niveaux masqués, les positions techniques >= 100000000, les niveaux Legacy hors Top 150, les records <100%, et les NLW non publiés ne créent pas de badge NLW.** Aucun badge « Goat », « Clash of Clans » ni autre distinction manuelle ne sera inventé. Le rattrapage reflète les records et positions **actuellement publiés** et non les anciens rangs à une date historique ; pour les exploits disparus du catalogue actuel, un mécanisme d'archives vérifiées serait nécessaire.

**Important** : Ce correctif ne réconcilie pas encore les 6 records manquants de Rain ; ceux-ci doivent être vérifiés séparément. Il ne réattribue pas automatiquement les badges survenus uniquement sur des niveaux encore masqués.

Aucun fichier `js/config.js` ni `assets/flags/` fourni ou modifié.

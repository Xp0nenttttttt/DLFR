# Points après acceptation d'une soumission ou d'une vérification

1. Remplace les fichiers du patch dans ton dépôt et publie sur GitHub.
2. Exécute `supabase/46_POINTS_ET_IDENTITE_SOUMISSIONS.sql` dans Supabase SQL Editor (après les migrations existantes 21, 26 et 31).
3. Recharge le site avec Ctrl+F5 ; ton ami doit aussi actualiser sa page.

Ne renvoie pas les soumissions déjà acceptées.

Ce correctif :
- compte les vérifications comme des complétions à 100 % pour les scores et compteurs, y compris en NLW ;
- ne compte qu'une fois un niveau déjà battu et vérifié par le même joueur ;
- reconnaît un pseudo exact unique et donne priorité à l'identifiant joueur lié pour les vérifications ;
- affiche Points Top 150, Points NLW et Rang NLW séparément dans la carte des statistiques ;
- permet à un niveau NLW battu/vérifié d'apparaître comme hardest ;
- mémorise la fiche liée au moment de la soumission pour éviter d'attribuer ses records à un profil portant seulement le même pseudo ;
- répare les anciennes soumissions acceptées lorsque leur compte lié et leur pseudo permettent un rapprochement certain. Les cas ambigus ne sont pas devinés. Aucun profil n'est supprimé.

Les points NLW restent séparés des points Top 150 : un joueur avec seulement des NLW garde 0 en Points Top 150. Les niveaux masqués et Legacy ne donnent pas de points NLW.

Les fonctionnalités d'import AREDL, de regroupement et de revendication sont conservées. Aucun fichier de drapeau n'est fourni ou remplacé.

Vérifications : tests ciblés des scores, alias, dédoublonnage et exclusions ; migration exécutée dans une base PostgreSQL de test avec réparation d'une ancienne soumission, envoi avec identité contrôlée et nouvelle validation sans doublon. La base Supabase réelle n'a pas été modifiée depuis cette session.

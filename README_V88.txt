DLFR V88 — Correctif essais boutique et intégrité de l’historique

1. Sur V87, remplacer js/app.js et faire Ctrl+F5.
2. Sur Modération > Défis & tests, activer un essai. La boutique est désormais affichée sur cette même page et permet de cliquer immédiatement sur Équiper. Retirer ensuite le test au même endroit.
3. Graphiques : un relevé pris aujourd’hui qui affiche zéro point alors que le classement courant est positif, ou un rang différent, est masqué avec un avertissement. Les anciennes données ne sont pas modifiées automatiquement.
4. Remplacer aussi tools/snapshot_ranks.py et le workflow dans GitHub pour bloquer certains exports manifestement incohérents. ATTENTION : ce garde-fou ne remplace pas la synchronisation exacte avec le barème du frontend ; un job peut échouer plutôt que publier de faux points.
5. Exécuter 88_DIAGNOSTIC_SNAPSHOTS.sql dans Supabase SQL Editor pour comparer manuellement la valeur enregistrée. Ne supprimer aucune donnée sans vérification.
6. Aucun changement SQL nécessaire, aucune modification des points/rangs en production ni des assets/flags.

# DLFR 2.10 — File de modération avec tirage aléatoire

Ce correctif s'applique **sur la version contenant le correctif de performances** (`DLFR_correctif_performances_stats_moderation.zip`) et le reste des migrations SQL déjà installées, notamment 26, 46 et 47.

## Installation

1. Effectuer une **sauvegarde Supabase** (au minimum `level_submissions`, `completions`, `demons`, et les rôles de modération).
2. Dans le SQL Editor de Supabase, exécuter **`supabase/48_FILE_MODERATION_ALEATOIRE.sql`** avant de déployer les nouveaux fichiers.
3. Copier ces quatre fichiers dans le site GitHub Pages :
   - `index.html`
   - `js/app.js`
   - `js/production-tools.js`
   - `css/style.css`
4. Déployer, puis actualiser la page avec `Ctrl + F5`.
5. Se connecter avec deux comptes modérateurs différents et tester en parallèle le bouton **🎲 Tirer au hasard**.

Aucun autre fichier ni image n'est remplacé ; `assets/flags/` est volontairement absent du ZIP.

## Fonctionnement

- **Tirer au hasard :** choisit une soumission libre de complétion à 100 % d'un niveau **publié et Rated**, dans le périmètre du rôle, et la réserve atomiquement pour 20 min.
- **Prendre en charge :** réserve manuellement une soumission de la même file.
- **Ma soumission :** le modérateur peut accepter/refuser, prolonger sa réservation de 20 min ou libérer immédiatement.
- **En cours chez les autres :** affiché mais non validable depuis la file.
- Si le modérateur a déjà une soumission en cours, le tirage la rouvre plutôt que de réserver une seconde.
- Le tirage ne choisit **pas** de nouvelles fiches de niveaux, les cas ambigus, ni les dossiers UNRATED : ils restent dans l'espace de modération générale.
- Une validation ne peut pas écraser une soumission déjà validée. Un modo NLW/modo classique doit posséder la réservation active ; une demande réservée par quelqu'un d'autre ne peut être traitée par aucun autre rôle depuis le circuit normal.
- L'aperçu propriétaire des autres rôles demeure **en lecture seule**.

## Cas d'essai conseillés

1. Deux modos tirent simultanément : ils doivent obtenir des soumissions différentes.
2. Un modo prend une soumission précise : elle disparaît des demandes libres des autres après rafraîchissement.
3. Le modo clique « Libérer » : la soumission redevient disponible.
4. Le modo valide sa soumission : elle sort de la file.
5. Vérifier qu'un modo NLW ne voit que les niveaux à partir de la position 151 et qu'un modo général peut voir les niveaux du Top 150.
6. Vérifier qu'une réservation expirée ne permet plus la validation d'une complétion (il faut reprendre la demande).

**Note** : la liste se réactualise à chaque action et via « Actualiser », sans polling permanent pour éviter de recharger inutilement Supabase. Les clics simultanés restent sécurisés côté serveur. Les tests SQL en production ne peuvent pas être exécutés depuis cette archive : tester d'abord sur une copie si possible.

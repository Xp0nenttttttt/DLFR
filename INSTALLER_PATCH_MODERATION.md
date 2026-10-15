# DLFR — Modération propre et pseudo de compte

1. Fais une sauvegarde de la base Supabase et de ton site.
2. Remplace `js/app.js`, `js/production-tools.js`, `css/style.css` par ceux du patch.
3. Dans Supabase SQL Editor, exécute `supabase/31_PSEUDO_SOUMISSIONS_VERROUILLE.sql`.
4. Recharge avec Ctrl+F5.

Dans Modération → Niveaux, quatre groupes d’outils remplacent la longue liste affichée simultanément. L’éditeur complet déjà installé reste présent et conserve ses migrations SQL antérieures.

Dans Soumettre un record, seul le pseudo (`players.username`) de la fiche liée au compte Discord est affiché ; aucune saisie libre n'est possible. Une soumission sans fiche liée est refusée. Le trigger SQL impose le pseudo officiel même si quelqu’un contourne l’interface. Les soumissions historiques ne sont pas modifiées.

Aucun fichier dans `assets/flags/` n’est distribué ni écrasé.

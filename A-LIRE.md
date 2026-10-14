# DLFR — Archives historiques et hardest vérifié

**Patch par-dessus `DLFR_correctif_pays_badges_NLW.zip`.** Il conserve les corrections précédentes (Rain, annuaire/modération, pays, badges NLW).

## Installer

1. Sauvegarder le dépôt GitHub (ou faire un commit). Attendre que le précédent patch soit déjà installé.
2. Copier **uniquement** `index.html`, `js/app.js` et le nouveau `js/history-archive.js` à la racine / dans `js/` comme dans le ZIP.
3. Commit, attendre GitHub Pages, rafraîchir Ctrl + F5.
4. Sur le site, ouvrir Demonlist → **Archives · hors Top 150** ; ou dans Classements → Archives hors Top 150.
5. Vérifier Rain : dans la fiche joueur, **Andromeda #3 (rang historique · vérifié)** apparaît si aucune autre victoire/vérification publiée plus difficile n'est disponible.

## Principe

- Archives : copie de l'ancien classement au **14 octobre 2026**, extraite de `supabase/02_charger_dump.sql` (données publiques de niveaux et de records historiques uniquement). 11 niveaux aux anciens rangs 151–161 ; leurs fiches, vidéos et records archivés sont consultables. Les niveaux historiquement dans le Top 150 peuvent aussi être ouverts par leur lien d'archive, notamment Andromeda.
- Les archives n'accordent **aucun point, aucun badge, aucun rang officiel et aucun accès modérateur**. Elles sont clairement étiquetées **historiques** et ne deviennent pas du NLW.
- Le hardest utilise les complétions publiques ET les vérifications des niveaux publiés. Si une ancienne vérification plus difficile reste encore dans une fiche cachée, le rang et le nom **historiques** sont affichés, explicitement étiquetés comme tels (ex : Andromeda #3).
- La rubrique NLW ne liste toujours que les niveaux NLW approuvés et publics, et est vide si aucun n'existe.
- L'archive est un **instantané statique**, pas une synchronisation automatique. Pour ajouter de nouveaux niveaux historiques ou mettre à jour les rangs après cette date, régénérer le fichier à partir d'une source validée. Les niveaux AREDL masqués/non approuvés restent privés et ne sont pas publiés.

**Aucun SQL nécessaire.** Aucune modification de `js/config.js`, `assets/flags/`, de la base Supabase ou des permissions RLS. Aucun secret, mot de passe, e-mail ni donnée Auth incluse. Les points de Rain restent à rapprocher avec les records historiques manquants (ce patch ne les invente pas).

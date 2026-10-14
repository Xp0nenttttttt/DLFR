# DLFR — Statistiques joueurs et NLW réunifiée (patch V3.2)

À installer **après** `DLFR_correctif_profils_roles_moderation.zip` et ses correctifs SQL nécessaires. Patch frontal uniquement : `index.html` et `js/app.js`. Ne remplacez **pas** `js/production-tools.js` depuis une version plus ancienne.

## Corrections

1. **Statistiques :** les personnes présentes uniquement dans les crédits de création ou de publication, sans record, vérification ni points attestés dans les données chargées, ne figurent plus dans les classements joueurs/pays, le sélecteur de comparaison et la synthèse des badges. Les personnes qui sont **aussi** de vrais joueurs restent visibles, même sans compte Discord. Les noms des auteurs restent sur les fiches des niveaux. Aucun joueur ou record n'est supprimé de Supabase.
2. **NLW :** suppression du quatrième onglet « Archives · hors Top 150 » et du lien indépendant du menu « Classements ». Les anciens niveaux historiquement hors Top 150 restent consultables **dans l'onglet NLW**, au même endroit que les vrais NLW publiés, via leurs fiches historiques. Les archives déjà présentes dans la liste NLW officielle sont dédoublonnées par GD ID ou nom.
3. **Sécurité des scores :** les fiches historiques portent la mention « non homologuée NLW », et **ne donnent ni points, ni rang, ni badges NLW** tant qu'une validation officielle n'a pas eu lieu. Le compteur général utilise « NLW publiés » au lieu de compter des positions techniques masquées.
4. Les anciennes URLs `?page=list&tab=archive` ouvrent désormais le listing NLW. Les liens de détail historiques `?page=archive&id=...` restent valides.

## Installation

1. Sauvegarder / faire un commit GitHub.
2. Déposer `index.html` et `js/app.js` aux chemins correspondants, en conservant `js/history-archive.js` déjà installé.
3. Attendre GitHub Pages, puis forcer le rafraîchissement (`Ctrl+F5`). Vérifier : Statistiques → Joueurs / Pays, NLW, recherche, et le profil de Rain.

**Pas de migration SQL**, aucune modification de `js/config.js`, `js/history-archive.js`, `assets/flags/`, Supabase, rôles ou permissions.

## Limites

L'archive statique est une photographie de l'ancien site datée du 14/10/2026 ; elle ne constitue pas une NLW officielle. Les personnes dont l'unique performance se trouve sur une fiche importée encore masquée sans points ni record public peuvent nécessiter une vérification des migrations de records. Ce correctif n'invente aucune victoire.

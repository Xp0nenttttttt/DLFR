# DLFR V56 — Gestion manuelle des fiches et victoires

Basé sur la V55. Patch ciblé : `index.html`, `js/app.js`, `js/production-tools.js` et une migration SQL additive. Aucun fichier dans `assets/flags/` et aucun thème CSS n'est remplacé.

## Installation

1. Effectuer une sauvegarde du projet et de Supabase.
2. Supabase → SQL Editor : exécuter `supabase/56_CREATION_JOUEURS_ET_VICTOIRES_MODERATION.sql` **après** les migrations 11 et 26. Le SQL ajoute deux RPC réservées aux supermodérateurs/propriétaires. Il ne modifie pas les fiches ou records existants lors de son installation.
3. Sur GitHub, remplacer uniquement `index.html`, `js/app.js`, `js/production-tools.js`.
4. Attendre GitHub Pages et recharger avec `Ctrl + F5`.
5. Aller dans **Modération → Profils** : en haut, les sections « Créer une fiche joueur » et « Attribuer une victoire » apparaissent.

## Utilisation

- **Fiche joueur** : renseigner le pseudo et éventuellement le nom affiché et le pays. La nouvelle fiche n'est PAS liée à un compte : le joueur peut ensuite effectuer une demande de liaison depuis son profil. Si elle existe déjà, privilégier la liaison ou fusion.
- **Victoire** : sélectionner le joueur, filtrer le niveau par nom/rang/ID, ajouter une URL HTTPS et éventuellement une date, cocher la confirmation de vérification puis valider. La progression est passée à 100 %, et le record existant est mis à jour plutôt que dupliqué. Le SQL écrit une entrée de journal de modération.
- Par sécurité, les deux fonctions sont réservées aux rôles **owner / supermoderator / editor historique**, et non aux modérateurs NLW ou modérateurs ordinaires. Ceux-ci continuent à traiter les soumissions dans leur périmètre.

## Tests conseillés après installation

1. Créer une fiche **de test non existante**, puis vérifier qu'elle apparaît dans `players` avec `has_account=false` et aucun propriétaire dans `player_profile_owners`.
2. Attribuer une victoire sur un niveau public et vérifier le record à 100 % dans les stats.
3. Répéter cette attribution : elle doit mettre à jour le record, pas ajouter un doublon.
4. Vérifier que les joueurs non-modérateurs ne peuvent pas appeler les nouvelles RPC.

Si tu as fait d'autres changements après la V55, fusionner ces modifications dans ton code actuel au lieu d'écraser les fichiers. Ne pas exécuter les migrations anciennes une deuxième fois sans vérification.

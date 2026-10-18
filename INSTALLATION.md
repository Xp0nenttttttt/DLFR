# DLFR V55 — liaison des fiches et sauvegarde du profil

## Symptomes
- Un joueur cree une fiche ou demande une liaison approuvee, mais les stats disent « Profil non revendique ».
- Enregistrer mon profil echoue avec « Aucun joueur autorise pour ce profil. ».

## Origine
Le statut public `players.has_account` est distinct de l'association reelle `player_profile_owners`. La fonction existante `dlfr_review_claim` ajoute la liaison sans changer `has_account`. Le code de sauvegarde exigeait par erreur `has_account` en plus de la liaison.

## Installation
1. Sauvegarder les fichiers avant modification. Exécuter `supabase/55_REPARER_LIAISON_ET_BADGE.sql` dans Supabase SQL Editor. Ce script synchronise seulement les fiches AVEC propriétaire deja enregistré et maintient le statut ensuite via triggers. Il ne relie jamais automatiquement une fiche à un nouvel utilisateur.
2. Remplacer `js/app.js`, `js/production-tools.js` et `index.html` par les fichiers du patch si vous êtes sur la V52.3. `production-tools.js` est identique à celui de V52.2 : inclus pour les installations sans cette version.
3. Publier et faire `Ctrl+F5`.
4. Executer `supabase/55_DIAGNOSTIC_VINCELEO.sql` pour vérifier que `liaison_reelle=true` et `badge_public=true`.

## IMPORTANT
Si `liaison_reelle=false`, NE PAS modifier `has_account` en true : la fiche n'est pas associee a un compte ; une nouvelle approbation de liaison doit être vérifiée.

## Sauvegarde de profil
Les droits du formulaire sont désormais basés sur `state.ownKey` (liaison Auth vérifiée) ; les autorisations d'écriture restent contrôlées par les RLS Supabase. Les erreurs liées à d'autres champs (URL, RLS, etc.) doivent être diagnostiquées séparément.

## Sécurité / compatibilité
Ne change ni les UID propriétaires, ni leurs rôles, ni les records, ni les drapeaux. Ne jamais écraser le dossier `assets/flags/`.

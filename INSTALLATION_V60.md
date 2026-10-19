# DLFR V60 — Modos : créer et modifier des niveaux

Cette archive est un correctif **incrémental basé sur la V59**. Elle ne comprend pas toute la DLFR.

## Installation (dans cet ordre)

1. **Sauvegarder Supabase** (base de données) et conserver les fichiers actuels du dépôt GitHub avant tout changement.
2. Dans **Supabase → SQL Editor**, exécuter `supabase/60_PERMISSIONS_NIVEAUX_MODOS.sql`. Nécessite que les migrations précédentes des niveaux et rôles (notamment 14, 26 et 30) soient installées. Le SQL crée deux nouvelles fonctions de création/édition ; il ne modifie pas le contenu des niveaux lors de l'installation.
3. Copier dans le dépôt GitHub les fichiers :
   - `js/app.js` (remplacement)
   - `index.html` (remplacement, pour ajouter les styles et renouveler le cache)
   - `css/v60-moderation-niveaux.css` (**nouveau**, à ajouter)
4. Publier, puis faire **Ctrl + F5** dans le navigateur.
5. Sur un compte **modo** ou **modo NLW**, ouvrir **Modération → Niveaux**.

## Rôles et limites

| Rôle | Création | Modification |
|---|---|---|
| Modérateur classique (`moderator`) | Top 150 et NLW | Top 150 et NLW, sans transfert d'une catégorie à l'autre |
| Modérateur NLW (`nlw`) | NLW (positions 151+) | NLW uniquement |
| Propriétaire / supermodérateur | Ancien éditeur complet conservé | Ancien éditeur complet conservé |
| Joueur ordinaire | Non | Non |

L'éditeur simplifié ne permet pas aux modérateurs bornés de gérer les UNRATED, les Legacy, les fiches masquées ou la suppression. Les transferts entre le Top 150 et la NLW restent dans l'éditeur complet des supermodérateurs. Les anciennes interfaces de validation de soumissions restent présentes.

## Précautions techniques

- Les deux nouvelles fonctions `dlfr_scoped_level_create` et `dlfr_scoped_level_update` sont des RPC `SECURITY DEFINER` avec vérification **serveur** du rôle obtenu depuis `staff_roles` / `nlw_staff_roles` et de la position du niveau.
- En création, si le rang est déjà occupé, les rangs Rated suivants sont décalés sous verrou transactionnel ; les complétions existantes restent intactes.
- En modification, le site demande de confirmer tout changement de rang ; le serveur interdit aux modos NLW le Top 150 et bloque les transferts de catégorie dans cet outil.
- Toute action est inscrite dans `community_audit_log`.
- Ce correctif **n'exécute aucune suppression SQL** et ne remplace aucun fichier de `assets/flags/`.
- Les anciennes fiches importées et masquées ne sont pas réutilisables par ces modérateurs ; un supermodérateur doit effectuer leur publication afin de préserver les données.

## Vérifications conseillées

1. Se connecter avec un rôle NLW, puis tenter de créer un niveau en 151 (autorisé) et en 150 (refusé avant et après soumission).
2. Sélectionner un niveau public NLW, modifier son nom ou ses crédits et enregistrer.
3. Se connecter avec un modo normal, vérifier qu'il peut sélectionner des niveaux Top 150 et NLW.
4. Vérifier que l'onglet Soumissions reste accessible et que le classement et les points n'ont pas été perturbés.
5. En cas d'erreur « function not found », attendre le rechargement du schéma PostgREST ou réexécuter `NOTIFY pgrst, 'reload schema';` dans SQL Editor.

**Limite des tests :** syntaxe JS et contrôles statiques effectués localement. Le SQL n'a pas été exécuté sur la base Supabase de production ; tester sur une base de préproduction ou sur un niveau de test avant d'ouvrir les droits aux modérateurs.

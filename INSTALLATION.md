# DLFR — Demandes de fusion depuis Mon profil (patch 52)

## Installation dans cet ordre
1. **Sauvegarder la base** avant toute opération de fusion. La migration 52 crée uniquement une table et des fonctions ; elle ne fusionne ni ne supprime de fiche pendant l'installation.
2. Dans **Supabase > SQL Editor**, exécuter `supabase/52_DEMANDES_FUSION_PROFILS.sql`. **Prérequis** : migration `33_FUSION_JOUEURS.sql` déjà en place, et `51_FILTRER_PROFILS_FUSIONNES.sql` du correctif précédent. Ne pas réexécuter les migrations anciennes si elles sont déjà installées.
3. Sur GitHub, remplacer `js/app.js` et `index.html`, puis ajouter `css/merge-requests.css` aux fichiers du dépôt. Les modifications sont basées sur `DLFR_correctif_profils_deja_fusionnes.zip` (qui incluait le dernier ZIP `DLFRRR(2).zip` et la correction du clic sur les niveaux).
4. Publier puis recharger la page avec Ctrl+F5.

## Côté joueur
- Ouvrir **Mon profil**, avec un compte Discord ou pseudo **déjà lié à une fiche joueur**.
- Dans **Demander une fusion de fiches**, rechercher l'ancienne fiche, la sélectionner puis fournir une justification (ou un lien HTTPS de preuve).
- Cliquer sur **Envoyer ma demande**. La demande apparaît dans **Mes demandes**, avec le statut En attente, Acceptée ou Refusée et la note de modération éventuelle.
- Il s'agit des **fiches joueurs DLFR** : les comptes d'authentification Discord/pseudo et leurs permissions ne sont PAS fusionnés.

## Côté modération
- Pour les propriétaires et supermodérateurs seulement : **Modération > Demandes > Demandes de fusion de fiches**.
- Consulter les pièces, prévisualiser la fusion puis écrire `FUSIONNER` et accepter, ou refuser avec une note.
- L'acceptation invoque la fusion SQL **existante** dans une transaction atomique : si elle échoue, la demande reste En attente.
- Le SQL bloque les sources déjà associées à un compte, revendiquées, ou déjà fusionnées. Le serveur déduit le profil cible **du compte connecté**, jamais d'un identifiant fourni par le navigateur.

## Limites importantes
- Les homonymes exacts (deux fiches portant le même pseudo) sont **bloqués par la procédure de fusion actuelle** pour éviter de déplacer des complétions ambiguës ; une vérification/manipulation manuelle par un administrateur est nécessaire.
- Les badges, records, titres et quelques références sont gérés par la fusion existante. Certaines relations, notamment les clans, ne sont pas transférées automatiquement ; son aperçu SQL liste les limites.
- Aucune migration n'efface de lignes `players`, comptes Auth, ou drapeaux.
- La validation réelle en production Supabase n'a pas pu être exécutée ici : vérifier les nouvelles RPC après l'installation et faire un essai avec une fiche de test avant les comptes importants.

## Fichiers du correctif
- `supabase/52_DEMANDES_FUSION_PROFILS.sql`
- `js/app.js`
- `css/merge-requests.css`
- `index.html`

**Le ZIP ne contient aucun fichier de `assets/flags/` et ne modifie pas les drapeaux personnalisés.**

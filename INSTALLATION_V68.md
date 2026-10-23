# DLFR V68 — Vérification reconnue prioritaire sur le premier FR (NLW)

**Base : V67.** Ce correctif modifie **uniquement l'affichage** des vérificateurs NLW. Pas de migration SQL, pas de changement des permissions ni des fonctions de revendication.

## Installation GitHub Pages

1. Faire une copie de sauvegarde de vos fichiers actuels `js/app.js` et `index.html`.
2. Remplacer **uniquement** `js/app.js` et `index.html` par les deux fichiers du ZIP, en respectant leurs chemins.
3. Publier, puis recharger avec **Ctrl + F5**.
4. Sur une fiche NLW sans réclamation, vérifier que le premier FR connu apparaît. Après acceptation d'une revendication de vérificateur, vérifier que le vérificateur reconnu est affiché à la place.

**Ne pas copier ou modifier `assets/flags/`.**

## Priorités

- **NLW, vérificateur lié à une fiche** (`demons.verifier_user_id` renseigné) : affichage du crédit `demons.verifier` ; si ce crédit est vide, récupération du nom de la fiche joueur liée par `players.legacy_id`.
- **NLW, aucune liaison officielle** : affichage de `demons.first_fr_player` si renseigné.
- **NLW sans premier FR** : affichage du crédit texte existant, ou « À renseigner ».
- **Top 150, UNRATED, Legacy** : aucun changement.

La RPC existante `dlfr_review_verification_claim` **renseigne `demons.verifier_user_id` quand une réclamation est acceptée**. Les demandes en attente/refusées ne modifient pas cet identifiant. Un rattachement manuel d'un vérificateur peut aussi le renseigner et est donc considéré comme une vérification reconnue.

Aucune donnée n'est écrasée dans Supabase. La timeline « premier record français » et ses preuves demeurent accessibles.

## Vérifications locales

Depuis la racine du ZIP décompressé, avec Node.js :

```bash
node --check js/app.js
node tests/test_v65.js
node tests/test_v66.js
node tests/test_v67.js
node tests/test_v68.js
```

Tests simulés uniquement : le projet Supabase réel reste à vérifier après déploiement.

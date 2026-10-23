# DLFR V67 — Premier vainqueur français affiché comme vérificateur NLW

**Base : DLFR V66.** Correctif d'affichage uniquement, sans SQL ni Edge Function.

## Installer sur GitHub Pages

1. Sauvegarder `index.html` et `js/app.js` de la version actuellement publiée.
2. Remplacer uniquement `index.html` et `js/app.js` par les fichiers correspondants de l'archive (mêmes chemins).
3. Publier les changements sur GitHub Pages.
4. Recharger la Demonlist avec `Ctrl + F5`, puis ouvrir la liste NLW et la fiche d'un niveau possédant `first_fr_player`.

Ne pas remplacer les autres fichiers de ton site, notamment **`assets/flags/`**.

## Résultat

- **Niveau NLW** : si `demons.first_fr_player` contient une identité valide, cette personne s'affiche dans la mention « vérifié par » des **cartes NLW** et dans la case **Vérification** de la **fiche détaillée/cinématique**.
- Exemple : *Spectrum Cyclone* → « vérifié par GDonut » si sa donnée `first_fr_player` vaut bien `GDonut`.
- Si aucun premier vainqueur français n'est renseigné, on conserve `demons.verifier` ou « À renseigner ».
- Les **Main List, Extended, UNRATED et Legacy** ne sont pas modifiées.
- La timeline continue d'identifier « Premier record français daté retrouvé ». Les vidéos du premier record restent disponibles dans la section des preuves déjà existante.

**Important :** le premier vainqueur français n'est pas nécessairement le vérificateur du niveau au sens de Geometry Dash. Le changement demandé concerne donc uniquement **le libellé visible sur le site NLW** : il ne remplace **aucune valeur Supabase** et ne modifie pas les attributions officielles, les records, les points ou la modération.

## Vérifications locales

- `node --check js/app.js`
- `node tests/test_v65.js`
- `node tests/test_v66.js`
- `node tests/test_v67.js`

Ces tests utilisent des jeux de données simulés. La mise à jour n'a pas été déployée sur le site réel.

## Revenir en arrière

Restaurer `index.html` et `js/app.js` sauvegardés avant la mise à jour.

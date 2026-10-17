# DLFR 2.9.1 — Sortie du Top 150, NLW et Legacy

Ce correctif prolonge la DLFR 2.9 : pas de refonte, aucune image et aucun drapeau remplacé.

## Installation

1. **Sauvegarder Supabase** (export des tables `demons`, `completions`, rôles et historique) et les fichiers du site.
2. Dans **Supabase SQL Editor**, exécuter `supabase/43_CORRECTIF_RANGS_NLW_LEGACY.sql` **après** les migrations 32 et 38 déjà installées. Le script ne change aucun rang à son installation : il remplace/ajoute des fonctions.
3. Remplacer **`js/app.js`** et **`index.html`** par ceux de ce patch. `index.html` modifie seulement la version du chargement de `js/app.js` pour éviter le cache.
4. Publier sur GitHub Pages et recharger la page (`Ctrl+F5`).
5. Tester d'abord sur une **copie de la base**, puis avec un niveau dont les données sont sauvegardées.

## Dans Modération → Niveaux → Modifier une fiche

### Descendre un niveau du Top 150 vers la NLW

- Choisir le niveau, laisser **Legacy décoché** et **Fiche publiée coché**.
- Saisir une **position globale** à partir de **151** : 151 = NLW #1, 155 = NLW #5.
- Lire le récapitulatif, cocher la confirmation de déplacement et écrire **`TRANSFERER`**.
- Enregistrer. Les rangs intermédiaires se décalent ; aucun record n'est supprimé.

### Passer un niveau dans Legacy

- Choisir le niveau et cocher **Legacy**.
- Le formulaire propose automatiquement la fin de la liste NLW, pour ne pas créer de trou au milieu des niveaux NLW publics.
- Ajouter éventuellement une date Legacy, cocher la confirmation de déplacement si le rang a changé et écrire **`TRANSFERER`** lorsqu'on traverse la limite Top 150 / NLW.
- Enregistrer. La fiche est publique en Legacy, hors des points NLW et du barème Top 150.

### Remonter un niveau vers le Top 150

- Décocher **Legacy** s'il est coché ; choisir un rang 1–150.
- Confirmer avec **`TRANSFERER`**.

## Dans Modération → Niveaux → Ajouter directement un niveau

- La position est **globale** : `157` = NLW #7.
- Un nouveau niveau à position > 150 entre dans la **NLW**, sauf si **Legacy** est coché.
- Si Legacy est coché, une position après les niveaux NLW publics est proposée automatiquement.
- UNRATED reste une catégorie séparée et ne peut pas être simultanément Legacy.
- Le choix Legacy est désormais **enregistré en base**, alors qu'il était perdu dans la précédente version du formulaire.

## Sécurité et limites

- Les rangs sont modifiés dans une **transaction SQL** avec verrouillage et gestion des contraintes d'unicité.
- Aucun niveau, vidéo, compte ou record n'est supprimé. Les points sont recalculés à partir de la position lors du chargement du site.
- Les imports masqués et les niveaux UNRATED ne sont pas transférables via cet éditeur.
- Les crédits des vérificateurs, les rôles et les drapeaux `assets/flags/` ne sont pas modifiés.
- Si tu as un script de synchronisation externe qui réécrit les rangs, vérifie qu'il ne remplace pas les rangs modifiés manuellement.
- Le SQL n'a pas été exécuté sur ta base Supabase réelle. En cas de doute, teste le changement d'un rang sur un environnement de préproduction.

## Tests

`node tests/rang-nlw-legacy.test.cjs`

Le script vérifie les aperçus, les champs et les références SQL, **pas** l'exécution PostgreSQL réelle.

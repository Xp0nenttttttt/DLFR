# DLFR 2.9 — Modération guidée et textes visiteurs simplifiés

Ce patch est basé sur la DLFR 2.8 du projet. Il n'installe aucune migration SQL et ne contient aucun fichier de `assets/flags/`.

## Installation

1. Sauvegarder les fichiers actuels du site.
2. Copier **index.html**, **css/style.css**, **js/app.js** et **js/production-tools.js** à leurs emplacements habituels.
3. Ne pas recopier le ZIP entier : les fichiers non inclus (config.js, flags, images, autres scripts) doivent être conservés.
4. Vérifier que les migrations déjà requises par les versions antérieures sont installées (ce patch n'en ajoute pas).
5. Déployer, puis forcer le rafraîchissement de la page (`Ctrl + F5`). Les URLs des 3 ressources modifiées contiennent un nouveau suffixe de version pour contourner le cache.

## Ce qui change

- Accueil de modération avec raccourcis d'action.
- Onglet **Demandes** regroupant soumissions, revendications et outils de validation (auparavant tout en haut du panneau).
- Guidance adaptée à chaque onglet et à chaque opération sur les niveaux (choisir, contrôler, confirmer).
- Suppression du formulaire public d'administration « Attribuer une victoire » qui n'était plus souhaité. Les outils de validation des demandes restent disponibles.
- Textes d'erreur et notices destinés aux visiteurs sans noms de tables, scripts, migrations SQL ou fournisseur d'hébergement des données. Les informations techniques utiles restent disponibles dans la console du navigateur.
- En mode aperçu d'un rôle, aucune modification réelle ne devient autorisée.

## À tester avant mise en production

1. En tant que propriétaire : ouvrir Accueil, puis Demandes, Niveaux, Packs et Profils.
2. Modifier une fiche test sans changer son rang, puis tester l'aperçu de déplacement d'un rang sur une copie de la base.
3. Vérifier les boutons de raccourcis et les quatre sous-rubriques des niveaux.
4. Se connecter comme modo NLW et modo et vérifier la validation des complétions.
5. Vérifier les modes aperçu du propriétaire (lecture seule).
6. Tester le chargement public, un profil, un Level Pack et une soumission, y compris les messages si une fonctionnalité n'est pas disponible.

Les outils SQL existants ne sont pas modifiés. Les opérations importantes doivent être vérifiées sur une copie de la base avant leur utilisation réelle. Les messages publics d'erreur restent génériques ; en cas de panne, consulter la console ou les logs d'hébergement pour identifier la cause.

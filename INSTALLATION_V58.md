# DLFR V58 — Liens communautaires, actualités et directives

## Base
Ce correctif a été conçu sur les fichiers de **DLFR V57 — migration des anciens comptes**. Il conserve donc les modifications V56/V57 (formulaires de modération, connexion et migration des comptes) présentes dans cette base.

## Installation GitHub Pages
À la racine du dépôt de la DLFR :

1. Remplacer `index.html` par celui du ZIP.
2. Remplacer `js/app.js` par celui du ZIP.
3. Ajouter le nouveau fichier `css/v58-accueil.css` dans le dossier `css/`.
4. Publier sur GitHub Pages puis recharger avec `Ctrl+F5`.

**Aucun SQL ni redéploiement de fonction Supabase n'est nécessaire.**

**Ne pas effacer les autres fichiers du projet.** Le patch **n'inclut pas** `assets/flags/` : garder tous les PNG personnalisés des régions. Il n'inclut pas non plus de configuration ni de clé Supabase.

Si `js/app.js` ou `index.html` ont été modifiés depuis la V57, fusionner les différences au lieu de les écraser.

## Changements
- Deux liens en en-tête : serveur Discord `https://discord.gg/FUTTZTwJFr` et chaîne YouTube `https://www.youtube.com/@DemonlistFrancophone` (ouvrent un nouvel onglet).
- La navigation Demonlist ne propose plus l'onglet « Legacy List » ; un ancien URL `?page=list&tab=legacy` affiche par défaut la Main List. Aucune suppression de niveau, record, fiche ou donnée historique.
- Le panneau de droite « Actualités » affiche jusqu'à **quatre articles publiés** issus de `news_items`, épinglés en premier, avec catégorie, date, résumé et lien vers la page Actualités. Les brouillons ne sont jamais affichés.
- Un panneau « Directives de soumission » séparé contient **l'ensemble des 7 parties et l'astuce finale** envoyées, dans des volets accessibles afin de garder une colonne latérale lisible. Le texte ne change pas les règles d'acceptation de la base.
- Aucun changement de rôle, d'authentification, de permissions ou de calcul de points.

## Vérifications locales
- `node --check js/app.js` : OK.
- Vérifications automatisées : actualités publiées uniquement, respect des annonces épinglées, sortie HTML échappée, sept sections de directives, liens externes, absence de l'onglet Legacy : OK.
- Pas de test en production sur la base Supabase ni de rendu réel sur GitHub Pages.

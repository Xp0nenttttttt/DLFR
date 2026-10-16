# DLFR 2.1 — Vie communautaire (lot 2)

Ce patch s'installe **par-dessus DLFR 2.0 — Profils & Communauté**. Il conserve le design, les thèmes, la modération, les classements, les profils personnalisés et les drapeaux régionaux.

## Installation

1. Sauvegarder le site actuel (et, par précaution, Supabase).
2. Vérifier que la migration **35_PROFILS_COMMUNAUTE.sql** de la 2.0 a déjà été exécutée et que les abonnements fonctionnent.
3. Remplacer **index.html**, **css/style.css** et **js/app.js** par les fichiers du présent ZIP.
4. Ajouter le **nouveau fichier js/activity-feed.js**.
5. Recharger le site avec **Ctrl + F5**, puis ouvrir **Communauté → Vie communautaire**.

**Aucune migration Supabase n'est nécessaire pour cette version.** Aucun changement des points, records, positions, badges, modérations et informations joueurs dans la base.

## Fonctionnement

- **Mes abonnements** : records à 100 % et badges datés des joueurs suivis. Nécessite un compte lié. Un utilisateur connecté mais ne suivant personne voit un état vide explicite.
- **Toute la communauté** : les mêmes événements publics, toutes fiches confondues.
- **Profils à découvrir** : trois propositions renouvelées chaque semaine parmi les fiches publiques non masquées ; les profils déjà suivis et son propre profil sont exclus. Aucune distinction officielle implicite.
- **Profils publics** : bloc « Activité récente » lorsqu'il y a des événements datés.
- **Mon profil** : accès rapide au fil communautaire.
- Les vidéos des records renvoient à la preuve déjà enregistrée, sans lecteur lancé automatiquement.

## Limites délibérées et exactitude des informations

- Les événements sont **calculés à partir des données publiques déjà présentes** dans `completions`, `demons`, `badge_awards` et `dlfr_profile_follows`. Il n'y a pas de table d'événements supplémentaire, ni de notifications push.
- Les records doivent avoir `progress=100`, être rattachés à une fiche existante non masquée et concerner un niveau public. Les soumissions non validées ne sont jamais lues par le fil.
- Les badges doivent posséder une date d'obtention valide et être toujours visibles selon les règles de badges du site.
- Le filtre est limité aux événements datés de l'année écoulée, avec au maximum 40 événements affichés par vue. Un ancien import peut apparaître à sa **date d'enregistrement** : celle-ci n'est pas forcément celle de la réussite réelle.
- Les pseudos présents seulement dans les vérifications ou dans une ancienne archive ne sont **pas rapprochés automatiquement** avec un joueur : cela empêche des attributions erronées. Utiliser l'outil « Rapprocher les vérificateurs » avant de les relier.
- La connexion et les droits sur les abonnements reposent sur les policies Supabase mises en place par la migration 35.

## Tests

- `node --check js/app.js`
- `node --check js/activity-feed.js`
- `node tests/activity-feed.test.js`
- `node tests/activity-page.test.js`

Le correctif a passé ses tests ciblés et les autres tests JavaScript récents. Une ancienne assertion du test `v2-core.test.js` échoue **déjà sur la base DLFR 2.0**, sans relation avec ce patch. Pas de validation directement sur le Supabase de production.

Aucun fichier sous `assets/flags/` n'est fourni ou modifié.

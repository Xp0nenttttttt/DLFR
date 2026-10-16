# DLFR 2.2 — Carte des régions

Cette archive est un **patch**, à appliquer au site DLFR actuel du ZIP `DLFRRR (2)(1).zip`. Elle ne contient pas les images de `assets/flags/`.

## Sauvegarde et installation

1. Fais une sauvegarde du dépôt et de Supabase (en particulier de `player_profiles`).
2. Dans Supabase > SQL Editor, exécute `supabase/36_CARTE_REGIONS.sql`.
   - Migration additive et relançable. Elle ajoute `player_profiles.region_code` si nécessaire ; ne modifie pas les valeurs enregistrées.
   - Certaines bases ont déjà cette colonne depuis la migration 11 ou 06 : c'est normal.
3. Copie les fichiers du patch **aux mêmes chemins** dans le site :
   - `index.html`
   - `css/style.css`
   - `js/app.js`
   - `js/regions-map.js` (nouveau)
   - `js/geo.js` (répare les chemins `auv.jpg`, `gra.jpg` en conservant les PNG existants)
   - `js/config.js` (active `enableRegionProfiles:true`). **Si tes identifiants publics Supabase diffèrent, conserve ton propre `config.js` et change seulement `enableRegionProfiles` en `true`.**
4. Déploie les fichiers puis force l'actualisation (Ctrl + F5).
5. Ouvre `Communauté → Carte de France` ou `?page=regions`.

## Comment les statistiques sont calculées

- Sont inclus les joueurs français (`players.country_code='FR'`) dont `player_profiles.region_code` est valide et qui ne sont pas exclus des statistiques.
- Les points régionaux sont la somme des points principaux **calculés par la DLFR** sur les joueurs rattachés, indépendamment des points NLW (affichés séparément).
- « Avec activité » = joueur ayant au moins une complétion, une vérification ou des points publics. Cela **ne signifie pas connecté récemment**.
- « Hardest terminé » = meilleur rang de niveau complété (main, extended ou NLW) parmi les joueurs de la région, pas le plus difficile simplement vérifié.
- Si une région affiche zéro joueur, renseigne le pays `FR` et la région sur `Mon espace → Mon profil` (compte lié), ou dans la modération de profil.
- Les 5 territoires d'outre-mer sont sélectionnables depuis les boutons sous la carte. Ils apparaissent aussi dans le classement interrégional.

## Fond cartographique

- Le navigateur récupère les contours simplifiés des 13 régions métropolitaines depuis [france-geojson](https://github.com/gregoiredavid/france-geojson) (données IGN Admin Express / licence ouverte, contours de 2018).
- Source principale : `https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions-version-simplifiee.geojson`.
- Source de secours : jsDelivr. Si l'accès est impossible, une **carte schématique cliquable** est affichée à la place. Les classements restent disponibles.
- Aucune API cartographique payante et aucune clé cartographique nécessaire.

## Sécurité et compatibilité

- Aucun `DELETE`, ni modification des rangs/démons/records ; aucun nouveau droit d'écriture côté navigateur.
- Toutes les pages existantes, le panel de modération et les fonctionnalités des versions 2.0 et 2.1 restent présents.
- Les images `assets/flags/` sont volontairement absentes du patch et ne doivent pas être remplacées.

## Tests

Depuis la racine du site, avec Node.js :

```bash
node --check js/app.js
node --check js/regions-map.js
node tests/regions-map.test.js
node tests.cjs
```

**Limite de vérification** : les tests locaux de JS réussissent, mais l'affichage connecté à la base Supabase réelle et la disponibilité du GeoJSON sur le navigateur de production restent à vérifier après déploiement.

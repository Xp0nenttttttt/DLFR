# DLFR 2.3 — Fiches de niveaux cinématiques

Ce patch est conçu pour la DLFR 2.2 (carte de France interactive) remise précédemment.
Il ne modifie aucune table Supabase, aucune complétion, aucun classement et aucun fichier `assets/flags/`.

## Installation

1. Sauvegarder les fichiers actuels du site et, par prudence, la base Supabase.
2. Remplacer `index.html`, `css/style.css` et `js/app.js` par ceux de l'archive.
3. Ajouter le nouveau fichier `js/level-cinema.js` dans le dossier `js`.
4. Déployer les modifications et actualiser avec Ctrl+F5.
5. Ouvrir un niveau depuis la Main List, la NLW ou Legacy : le lien habituel `?page=demon&id=...` reste inchangé.

**Pas de SQL à lancer pour cette mise à jour.**

## Nouveautés

- Entête cinématique avec bannière floutée issue de `demons.thumbnail_url`, avec repli sur miniature YouTube si le fichier original manque. Les thèmes DLFR existants restent disponibles.
- Rang, points et statut affichés en conservant les formules existantes (Top 150, NLW, Legacy, UNRATED).
- Bloc créateur, éditeur, vérificateur, GD ID, progression minimum et total de records.
- Lecteur YouTube respectueux de la vie privée (`youtube-nocookie.com`) **chargé seulement au clic** ; vidéo HTML5 si le lien est un fichier MP4/WebM ; sinon lien externe.
- Cartes des joueurs français ayant un record enregistré à 100 %, classés **par points DLFR globaux**, pas par date de complétion.
- Chronologie utilisant les `demon_position_history`, dates de création de fiche, `first_fr_achieved_at` / `first_frbe_achieved_at` lorsque disponibles et les cinq premiers enregistrements de complétions à 100 %.
- Liste complète des records avec liens de preuve.
- Les sections de preuves vidéo déjà en place restent présentes.

## Limites et précautions

- `completions.created_at` est une **date d'enregistrement**, pas forcément une date de victoire. Le site l'indique explicitement et n'invente pas de premières victoires.
- Les joueurs sont reconnus comme français lorsque leur profil public indique `country_code = 'FR'`. Les complétions non associées à un tel profil restent dans la liste générale mais pas dans le podium français.
- La chronologie n'affiche pas de première complétion française si aucune date fiable n'est enregistrée.
- Une vidéo ou une miniature absente ne sera pas inventée : un visuel de secours est affiché.
- Aucune donnée ne change tant que les modérateurs ne mettent pas à jour la fiche dans le panneau habituel.

## Contrôles réalisés

`node --check js/app.js`
`node --check js/level-cinema.js`
`node tests/level-cinema.test.js`

Les tests JavaScript 2.3 passent. Quelques tests historiques en échec dans la version 2.2 restent en échec ; ils n'ont pas été corrigés par cette mise à jour. Non testé sur une base Supabase de production.

## Fichiers concernés

- `index.html`
- `css/style.css`
- `js/app.js`
- `js/level-cinema.js` (nouveau)
- `tests/level-cinema.test.js` (tests facultatifs)

N'écrasez pas `assets/flags/` : ce dossier n'est pas fourni par le patch.

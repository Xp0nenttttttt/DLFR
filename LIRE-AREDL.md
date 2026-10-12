# Ton Classeur2.xlsx est maintenant compatible avec la page « Non vérifiés »

Le fichier fourni contient **1 635 niveaux** dans une feuille `levels` (colonnes `Column1.name`, `Column1.position`, `Column1.points`, `Column1.level_id`, etc.).

Nous avons conservé toutes ces colonnes et ajouté deux colonnes facultatives : **Vérifié communauté** et **Commentaire**. Par défaut, la colonne de vérification est vide : cela signifie **inconnu**, pas « Non ».

- `Oui` : caché de la page.
- `Non` : présenté comme « Non vérifié ».
- Vide : présenté comme « Statut à confirmer ».

Si les données réelles Supabase comportent un vérificateur sur le même niveau (par ID ou nom), il est masqué même si la colonne est vide ou `Non`. En mode démonstration, les faux vérificateurs ne cachent jamais les niveaux AREDL.

## Installer

Copier **sans changer leurs chemins** les fichiers de ce patch sur ton dépôt GitHub :

- `js/community-unverified.js`
- `js/app.js`
- `css/style.css`
- `data/niveaux-non-battus.xlsx`

Attendre la publication de GitHub Pages, puis ouvrir `?demo=1&page=unbeaten`. Ce fichier ne nécessite pas de SQL.

> Le fichier d'origine est un **catalogue AREDL**, pas une liste indiquant déjà les niveaux non battus par la communauté française : aucun état communautaire n'était fourni. Il est donc essentiel de renseigner les vérifications avant de présenter l'ensemble comme certifié non battu.

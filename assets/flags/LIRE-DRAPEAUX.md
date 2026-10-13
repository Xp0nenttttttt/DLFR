# Drapeaux dans la DLFR

- `countries/xx.png` : véritables **fichiers images** des drapeaux de pays. Noms en codes ISO à deux lettres (ex. `fr.png`, `be.png`, `ch.png`). Vous pouvez remplacer chaque PNG par votre propre image en conservant le même nom.
- `regions/fr/xxx.svg` : **emplacements et visuels provisoires stylisés**, PAS des drapeaux officiels. Remplacez-les par les drapeaux régionaux de votre choix en conservant les noms (`bre.svg`, `occ.svg`, etc.). Selon la région, il existe plusieurs variantes historiques ou associatives.
- Après remplacement d'un SVG, conservez le format SVG et son nom. Les SVG affichés sont chargés dans des balises `<img>`, pas injectés dans la page.
- Les PNG de pays du paquet ont été préparés localement à partir de glyphes de drapeaux Noto Color Emoji (Google Noto Emoji), sous forme d'images indépendantes pour être compatibles avec les navigateurs Windows. Aucun fichier de police n'est inclus.
- Les codes des régions sont dans `js/geo.js`.
- Les listes déroulantes HTML natives ne peuvent pas embarquer d'images ; le drapeau apparaît **à côté du sélecteur**.

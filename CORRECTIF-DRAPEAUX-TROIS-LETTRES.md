# DLFR V2.4.2 — Drapeaux PNG avec trois lettres

## Ce que le patch modifie

- `js/geo.js` : charge les **fichiers PNG personnels** (et non les anciens SVG).
- `index.html` : actualise la version de `geo.js` pour éviter l'ancien cache.
- `verifier-drapeaux.html` : affiche les chemins testés et les images trouvées sur GitHub Pages.
- **Aucun fichier dans `assets/flags/` n'est livré**, y compris dans le ZIP complet. Garde ton dossier existant.

## Installation

1. Dans GitHub, remplace **uniquement** `js/geo.js` et `index.html`, puis ajoute `verifier-drapeaux.html`.
2. Ne supprime pas `assets/flags/` et ne remplace pas tes images.
3. Fais un commit. Actualise le site avec `Ctrl + F5`.
4. Ouvre `https://TON-COMPTE.github.io/DLFR/verifier-drapeaux.html` pour voir immédiatement les drapeaux absents.

## Noms de fichiers attendus

Dossier des régions : `assets/flags/regions/fr/`.

| Région | Fichier PNG attendu |
|---|---|
| Auvergne-Rhône-Alpes | `auv.png` |
| Bourgogne-Franche-Comté | `bou.png` |
| Bretagne | `bre.png` |
| Centre-Val de Loire | `cen.png` |
| Corse | `cor.png` |
| Grand Est | `gra.png` |
| Hauts-de-France | `hau.png` |
| Île-de-France | `ile.png` |
| Normandie | `nor.png` |
| Nouvelle-Aquitaine | `nou.png` |
| Occitanie | `occ.png` |
| Pays de la Loire | `pay.png` |
| Provence-Alpes-Côte d’Azur | `pro.png` |
| Guadeloupe | `gua.png` |
| Martinique | `mar.png` |
| Guyane | `guy.png` |
| La Réunion | `lar.png` |
| Mayotte | `may.png` |

Le script essaye aussi l'ancien nom basé sur le code administratif (ex. `idf.png`) si le nom à trois lettres est absent.
Pour **La Réunion**, `lar.png` est essayé en premier, puis `reu.png` et `re.png`.

Dossier des pays : `assets/flags/countries/` (ex. `fr.png`).

⚠️ Les noms sont sensibles à la casse sur GitHub Pages. `ile.png`, `ILE.png` et `Île.png` ne sont pas le même fichier.

Les données des régions dans les profils restent les codes administratifs habituels ; ce correctif modifie seulement les chemins d'images.

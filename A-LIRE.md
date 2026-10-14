# DLFR : correction des points de verification et diagnostic des records de Rain

Ce patch est base sur `DLFR (4).zip` et integre le correctif precedent des tris JavaScript et de l'acces Discord a la moderation. Il n'est pas base sur un eventuel commit plus recent non transmis.

## Ce qui est corrige

- Points de verification : le test `has_account` est retire du calcul des scores. Un joueur historique sans compte Discord lie garde ses points legitimes de verification si le niveau est publie et eligible. Le total ne compte pas deux fois une victoire sur le meme niveau (credit de la difference seulement).
- Corrections precedentes preservees : protection contre `localeCompare` sur `null`, affichage coherent de la connexion Discord et relecture des droits de moderation.

## Ce qui doit encore etre verifie

L'ancien site affichait 39 completions pour Rain (20 Main, 18 Extended, 1 hors classement) et 2522,18 points. La capture de la nouvelle DLFR affiche 32 victoires classees (16 + 16) et 1621,90 points. La migration V3.2 place les fiches historiques non rapprochees en mode masque, hors classement. **Ce patch ne publie aucun niveau masque, ne change aucun rang, et ne promet donc pas de restaurer a lui seul le total historique.** Le bareme et les positions actuelles peuvent aussi etre differents.

Executer `DIAGNOSTIC-RAIN-LECTURE-SEULE.sql` dans Supabase SQL Editor pour identifier quels records ne sont pas comptes et pourquoi. La requete n'effectue aucun INSERT, UPDATE, DELETE ou modification du schema.

## Installation GitHub Pages

1. Faire un commit de sauvegarde de la version en production.
2. Copier a la racine du depot les fichiers `js/app.js`, `index.html` et `js/unrated-stats.js` contenus dans le ZIP. **Si tu as modifie ces fichiers depuis l'archive DLFR (4).zip, ne les remplace pas sans fusionner tes changements.**
3. Ne pas copier le diagnostic SQL dans les fichiers web ; il est destine uniquement a Supabase SQL Editor.
4. Attendre le deploiement GitHub Pages, puis Ctrl+F5. Comparer le score de Rain avant/apres.
5. Ne publier d'anciens niveaux qu'apres controle des ID GD, variantes Solo/2P, rangs deja occupes et videos preuves.

Ne touche **pas** a `assets/flags/`, `js/config.js`, aux donnees Supabase, aux roles Discord ni aux secrets.

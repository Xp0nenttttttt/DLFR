# DLFR — Corriger les profils déjà fusionnés dans les menus

## Pourquoi ?
Une fusion ne supprime pas la fiche source : elle reste archivée dans `players` et son identifiant est ajouté à `dlfr_player_merges`. L'ancien formulaire présentait tous les joueurs sans consulter l'historique.

## Installation (dans cet ordre)
1. Supabase > SQL Editor : exécuter **supabase/51_FILTRER_PROFILS_FUSIONNES.sql** une seule fois. Pré-requis : la migration 33 (fusion des joueurs) est déjà installée.
2. Sur GitHub : remplacer **js/app.js** et **index.html** par ceux de ce ZIP, puis publier. Ils sont basés sur le dernier ZIP fourni (`DLFRRR(2).zip`) et intègrent le correctif du clic dans l'éditeur de niveaux.
3. Actualiser le site (`Ctrl + F5`), puis aller dans **Modération > Profils > Fusion**.

## Résultat
- Les fiches déjà absorbées ne sont proposées ni comme cible ni comme source d'une nouvelle fusion.
- Le compte principal conservé continue de figurer dans les menus.
- Les joueurs cachés des classements pour une raison autre qu'une fusion ne disparaissent pas.
- Les homonymes affichent leur `player_key` pour qu'on puisse les distinguer.
- Si la migration SQL manque, le formulaire indique une erreur et bloque les nouvelles fusions, sans bloquer le reste du site.

Cette mise à jour ne modifie aucun joueur ni record et ne touche pas aux drapeaux (`assets/flags/`).

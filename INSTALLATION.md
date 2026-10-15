# DLFR — Panneau simplifié et nettoyage des archives

## Installation
1. Faire une sauvegarde de Supabase et du dossier du site.
2. Si pas déjà fait, exécuter `supabase/29_CORRECTIF_NLW_RAPPROCHEMENT.sql`, puis `supabase/30_EDITEUR_COMPLET_NIVEAUX.sql`. Aucun nouveau SQL n'est nécessaire pour la présentation et les archives.
3. Remplacer `js/app.js`, `js/history-archive.js`, `css/style.css`.
4. Vider le cache du navigateur / actualiser avec Ctrl+F5.

## Ce qui change
- Onglet Niveaux réorganisé en 4 sections : Modifier une fiche, Ajouter, Archives et NLW, Retirer / restaurer. Les formulaires d'origine restent disponibles.
- Archive publique : suppression de **5 anciennes fiches** ayant un rang historique >= 157 dans le fichier statique `js/history-archive.js`.
- Les anciennes fiches #1 à #156 restent présentes dans ce fichier ; le classement NLW public et les données en table `demons` ne changent pas.
- Les records de l'ancien export sont conservés dans le snapshot par sécurité ; aucune suppression des complétions Supabase.
- Les niveaux déjà présents en base Supabase ne sont PAS supprimés : utiliser le panneau Retirer / restaurer pour les dépublier en conservant leurs records.
- Aucun asset de `assets/flags/` modifié ou fourni.

## Important
Si tu voulais aussi supprimer physiquement des enregistrements Supabase, c'est une opération différente et risquée : ne pas exécuter de DELETE en masse sur des complétions associées. Le présent patch nettoie les fiches historiques affichées, sans toucher à la base.

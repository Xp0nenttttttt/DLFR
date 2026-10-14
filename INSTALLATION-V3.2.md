# DLFR V3.2 — Migration historique MariaDB vers Supabase (patch SQL uniquement)

## Ce que contient l'archive

Analyse de la sauvegarde d'octobre 2026 : **161 niveaux** (dont les positions #1–150 toutes présentes), **290 records**, **67 comptes PHP historiques**, **6 records sous 100 %** et **73 exigences particulières sous 100 % dans le Top 75**. Il existe aussi un niveau hors Top 75 avec un seuil particulier.

**Les anciens mots de passe, e-mails, identifiants secrets et permissions d'administration sont exclus**. Les joueurs sont créés comme **profils publics non revendiqués** et peuvent ensuite être reliés à Discord via le processus de revendication existant. Les 18 badges actuels restent intacts ; les anciens titres/badges sont uniquement archivés pour consultation.

## Installation, dans l'ordre

1. **Sauvegarde complète de Supabase**. Ne surtout pas coller directement la sauvegarde MariaDB dans PostgreSQL.
2. Vérifier que les migrations DLFR V3.1.0 (et V3.1.1 si installé) sont déjà en place : `public.demons` inclut `is_public` et `data_source`, et les tables `players`, `completions`, `player_profiles` existent.
3. Exécuter `supabase/01_staging_prive.sql` depuis Supabase > SQL Editor.
4. Exécuter `supabase/02_charger_dump.sql` depuis SQL Editor. C'est une version **sans données d'authentification** du dump MariaDB. Elle ne modifie pas les tables publiques.
5. Exécuter `supabase/03_rapports_avant_import.sql`. Consulter les cas de doublons (noms/ID GD/modes Solo/2P).
6. Exécuter `supabase/04_correspondances_exactes.sql`. Ce script ne lie automatiquement que les fiches avec **nom identique et ID Geometry Dash compatible**. Les différences et variantes ambiguës restent à examiner.
7. Vérifier les associations; résoudre à la main les noms/ID en conflit. Il est important de ne **jamais rapprocher deux variantes Solo/2P sur le seul ID GD**.
8. Exécuter `supabase/05_import_sans_ecrasement.sql`. Il crée les nouveaux profils publics, importe les records historiques et ajoute les niveaux absents **masqués à des positions techniques**, sans déplacer ni écraser les rangs déjà fixés.
9. Exécuter `supabase/06_appliquer_minimums.sql` **après contrôle des correspondances**. Il restaure les minimums historiques sur les fiches dont la valeur actuelle est encore 100 %. Un seuil différent déjà renseigné dans Supabase reste inchangé.
10. Exécuter `supabase/07_bilan_et_publication.sql`. Il fournit la liste des fiches à publier, des rangs à décider et des minimums à vérifier.
11. Dans **Modération > Niveaux**, publier les fiches historiques masquées en conservant, si souhaité, leur position historique. Les rangs actuels déjà acceptés manuellement ne sont jamais réordonnés automatiquement.

## Ce qui est préservé

- Les comptes Discord et associations `player_profile_owners` ne sont jamais modifiés.
- Les rôles `staff_roles` ne sont jamais modifiés : **un ancien propriétaire PHP ne récupère pas de droits automatiquement**.
- Les records et preuves vidéo existants ne sont pas écrasés; les nouveaux sont ajoutés seulement quand la paire niveau/joueur n'existe pas déjà, sans compter une progression partielle comme une victoire.
- Les vidéos, descriptions, auteurs et vérificateurs sont complétés **uniquement s'ils sont vides** sur la fiche existante.
- Les anciens `legacy_id` sont conservés dans la zone `dlfr_legacy` pour permettre un rapprochement et des relances sans doublons.
- Aucun fichier d'images ni `assets/flags/` dans ce patch.

## Pourquoi la liste n'est-elle pas immédiatement entièrement publique ?

Ton Supabase contient déjà des niveaux importés de l'AREDL et des corrections manuelles. Les rangs historiques peuvent différer. Publier automatiquement les 161 niveaux, en imposant leur ancien rang, risquerait de déplacer les niveaux validés, de casser l'unicité des positions et de changer les points. La migration **archive les niveaux sans correspondance sûre**, puis propose leur publication manuelle après rapprochement.

## Signification des dates

La date `created_at` des anciens records représente la **date enregistrée dans l'ancienne base**, pas forcément le jour historique de la victoire. Aucune date d'obtention d'un badge n'est déduite de cette date.

## Réexécution

Les SQL de chargement et d'import sont conçus pour éviter les doublons : `ON CONFLICT DO NOTHING`, correspondances persistées, seuils importés seulement après vérification. Évite les modifications manuelles de `dlfr_legacy.level_links` sans diagnostic.

## Si une erreur apparaît

Copie le message exact, le numéro de requête et le script concerné. Comme les insertions utilisent des transactions, une erreur annule le script fautif et ne supprime pas les données antérieures.

### Publication initiale plus rapide (optionnelle)

`supabase/08_publier_rangs_libres_OPTIONNEL.sql` publie d'un coup les niveaux historiques du Top 150 **seulement lorsque leur position historique n'est occupée par aucune autre fiche**. Cela ne déplace ni niveau manuel ni niveau AREDL caché. Les rangs en conflit resteront dans le rapport du script 07 pour être décidés en modération.

À exécuter uniquement après les étapes 01–07 et la sauvegarde. Le script est réexécutable sans doubler les publications.

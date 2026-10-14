# DLFR V3.0.8 — Correctif HTTP 409 : variantes Solo / 2P

## Pourquoi le workflow s'arrêtait ?

Les 675 premiers niveaux AREDL ont été créés. Au lot 10, PostgreSQL renvoie `23505` avec l'index `dlfr_dem_gd_id_unique` sur `demons.level_id`. Cet index vient de la migration SQL 11 et empêche encore qu'un niveau Geometry Dash soit présent deux fois, même avec deux identifiants AREDL distincts. La migration SQL 16 avait modifié la table d'attente et la logique d'import, mais oublié l'index de la table publique.

## Installation

1. **N'efface rien** : sauvegarde d'abord la base Supabase (au minimum `demons` et `dlfr_aredl_level_stage`). Ne relance pas `publish` avant le correctif.
2. Ouvre **Supabase → SQL Editor → New query**. Colle `supabase/17_correctif_index_solo_2p.sql` et clique sur **Run**. Le script est transactionnel : soit toutes ses modifications passent, soit aucune n'est appliquée.
3. Exécute `supabase/18_verifier_index_et_import.sql` : **`dlfr_dem_gd_id_unique` doit avoir disparu**, les trois nouveaux index doivent exister (ainsi que `dlfr_dem_aredl_id_unique`). Le nombre de niveaux déjà présents doit être au moins celui que tu avais avant l'opération.
4. Retourne dans **GitHub → Actions → AREDL – synchronisation globale Supabase** et relance en mode **`publish`**, avec la version **V3.0.7** du script Python. Pas besoin de remplacer des fichiers GitHub Pages ni de réimporter manuellement les 675 premiers.
5. Vérifie le récapitulatif du workflow. Les 675 premiers niveaux seront **rapprochés** via leur `aredl_id`, et non recréés. Les entrées Solo / 2P pourront maintenant avoir le même `level_id` ; les autres conflits continueront d'être signalés pour la modération.

## Sécurité

- Ne supprime pas l'index unique `dlfr_dem_aredl_id_unique` : il protège la vraie identité d'une fiche AREDL.
- Un index unique sur les ID GD des fiches uniquement manuelles est conservé.
- Un autre index interdit d'enregistrer deux fois la même variante explicite Solo ou 2P pour un même ID GD.
- Les liens de records, les fiches manuelles et les positions DLFR ne sont pas modifiés par le SQL 17.
- Ne colle pas de clés Supabase secrètes dans GitHub Pages.

## Limites

Ce correctif est directement motivé par le message précis `duplicate key value violates unique constraint "dlfr_dem_gd_id_unique"`. Je l'ai recoupé avec les SQL 11 et 16 du projet, mais je ne peux pas exécuter la migration sur ta base distante. Si un autre index, un nom unique ou un rang occupé provoque une nouvelle erreur, partage le nouveau journal : nous corrigerons la cause correspondante sans effacer les données.

Aucun drapeau ou autre asset personnalisé n'est inclus.

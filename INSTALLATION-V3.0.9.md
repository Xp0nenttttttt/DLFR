# DLFR V3.0.9 — Catalogue AREDL privé + preuves FR

## Pourquoi `firstfrbe = null` ?

Le workflow global `aredl_catalog_sync.py` télécharge `/levels` seulement : nom, rang et identifiants. Il ne récupère PAS les fiches détaillées ni `/levels/{id}/records`. Le champ `first_frbe` est donc normalement vide après `publish`, et le résultat n'est **pas** un échec de Supabase. En V3.0.9, le public utilise des colonnes nouvelles **`first_fr_*`** (FR uniquement), sans réutiliser les anciennes valeurs franco-belges.

## À savoir avant de commencer

- **Sauvegarder la base** depuis Supabase avant toute migration. Rien n'est effacé, mais le site pourra afficher très peu de niveaux après masquage des imports sans preuve.
- Garder impérativement tous les fichiers de drapeaux PNG existants (`assets/flags/`) ; ce patch ne contient aucune image.
- Les pays sont déterminés par l'AREDL, pas à partir de la langue parlée ; seules les fiches `country = FR` sont retenues. Les Belges, même francophones, sont exclus selon le choix actuel.
- Le premier record français **daté et disponible** ne prouve pas nécessairement la première victoire historique.
- Une vidéo manquante reste vide. Jamais de miniature inventée.

## Ordre d'installation

1. **SQL Editor** → exécuter `supabase/18b_diagnostic_AVANT.sql` (lecture seule). Noter le nombre de fiches brutes.
2. **Sauvegarde Supabase** : `demons`, `completions`, `dlfr_aredl_level_stage` au minimum.
3. Exécuter `supabase/19_catalogue_prive_et_preuves_fr.sql`. Ce SQL :
   - Ajoute `is_public` ; masque seulement les fiches du catalogue AREDL sans records ni preuves, strictement identiques à leur source ; sauvegarde leur ancien rang dans `dlfr_catalog_hide_log`.
   - Réserve les niveaux non masqués et les ajouts manuels ; ne supprime aucun niveau.
   - Protège la lecture publique avec RLS ; les modérateurs continuent à voir les fiches en attente.
   - Interdit définitivement la publication de masse via `dlfr_aredl_catalog_batch(p_publish=true)`.
   - Crée `dlfr_stage_fr_evidence` (ingestion serveur) et `dlfr_approve_fr_aredl` (publication après approbation staff).
4. **Optionnel et recommandé si les rangs restent occupés** : exécuter `supabase/20_liberer_rangs_catalogue_OPTIONNEL.sql`. Il déplace uniquement les fiches *déjà masquées et journalisées* au-delà de l'actuelle liste pour libérer les premiers rangs. L'ancienne position est conservée dans `dlfr_catalog_hide_log.original_position`. Ce déplacement est un vrai changement de `position` : toujours le faire après sauvegarde et vérifier les conflits/rangs.
5. Copier les fichiers du patch dans le dépôt GitHub : `index.html`, `js/app.js`, `js/production-tools.js`, `tools/aredl_nlw_sync.py`, `tools/aredl_fr_evidence_sync.py`, `.github/workflows/aredl-catalog-supabase.yml` et `.github/workflows/aredl-fr-evidence.yml`. Ne remplacer ni `config.js`, ni tes drapeaux.
6. Faire un commit, attendre GitHub Pages, puis `Ctrl+F5`.

## Importer et vérifier les preuves françaises

1. **Actions → AREDL - synchronisation globale Supabase** : `preview` puis `stage` (désormais jamais `publish`). Ceci met à jour le catalogue **privé**.
2. **Actions → AREDL - preuves France uniquement** : première tranche `start_rank=1`, `end_rank=20`, `mode=preview`, `max_record_pages=25`. Attendre la fin et télécharger l'artefact pour lire `aredl-fr-review.csv/json`.
3. Si le rapport est cohérent, relancer **la même tranche en `mode=stage`**. Le workflow met à jour les preuves françaises dans la table d'attente ; une fiche dont la pagination est incomplète reste en attente, sans première victoire publiée.
4. Connecté avec ton compte propriétaire, ouvrir **Modération → Import AREDL** : les entrées ayant des preuves FR complètes remontent en haut. Contrôler les ID, vidéos, vérificateurs et position DLFR ; approuver au cas par cas. Les anciennes positions modifiées manuellement sont conservées.
5. Continuer par tranches `21–40`, `41–60`, etc. Les tranches contiennent au maximum 40 niveaux (20 conseillés pour respecter l'API). Aucun SQL à recoller à chaque tranche.

**Important** : si une fiche n'a ni vérificateur français confirmé, ni record français daté confirmé, elle peut rester dans le catalogue en attente. On peut toujours l'ajouter manuellement avec l'interface existante. Une victoire française qui n'a pas de date exploitable n'est pas affirmée comme historique.

## Vérifications après SQL 19

```sql
SELECT is_public, COUNT(*)
FROM public.demons GROUP BY is_public ORDER BY is_public;

SELECT COUNT(*) AS fiches_catalogue_masquees
FROM public.dlfr_catalog_hide_log;

SELECT aredl_rank, aredl_name, evidence_state, first_observed_fr
FROM public.dlfr_aredl_level_stage
ORDER BY aredl_rank LIMIT 20;
```

## Limitations

Le premier scan des ~1 635 entrées détaillées prendra du temps, par petites tranches. Les 1 635 fiches du catalogue peuvent rester en staging sans records. Cette V3.0.9 ne crée **pas** encore automatiquement les fiches joueurs ni toutes leurs victoires — ce sera le prochain pipeline à ajouter après contrôle des identités AREDL/Discord. Les migrations SQL et les appels GitHub Actions doivent être validés sur l'instance Supabase réelle : tests locaux seulement.

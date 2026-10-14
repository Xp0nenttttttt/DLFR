# DLFR V2.9 — Première synchronisation AREDL NLW (France + Belgique)

**Version : outil de prévisualisation uniquement. Aucun SQL exécuté, aucune modification des records/profils du site.**

## Périmètre exact

- Niveaux **classés au-delà du #219**, donc à partir du rang AREDL #220 (Cobwebs est la borne demandée).
- On récupère **tous les niveaux de cette tranche**, même si aucun vérificateur français ou belge n'est connu ; uniquement les **vérificateurs FR/BE confirmés** sont signalés.
- On cherche le premier record FR/BE et les premiers FR, BE séparément **si** les données de complétion et leurs vraies dates sont disponibles ; sans ces données, le résultat reste `unknown`.
- On ne touche pas aux niveaux #1–219, aux anciennes données MySQL, ni aux drapeaux PNG.

## Installation (patch seulement)

Copier les nouveaux fichiers aux mêmes emplacements dans le dépôt GitHub :

```text
.github/workflows/aredl-nlw-review.yml
tools/aredl_nlw_sync.py
tests/test_aredl_nlw_sync.py
supabase/08_nlw_aredl_PREPARATION_NE_PAS_EXECUTER.sql
INSTALLATION-V2.9-AREDL-NLW.md
```

**Aucun fichier existant n'est remplacé.** Le SQL est une préparation, **ne pas l'exécuter maintenant**.

## Premier import de 100 niveaux, sur GitHub

1. GitHub → dépôt DLFR → **Actions** → `AREDL NLW – aperçu FR BE` → **Run workflow**.
2. Entrer `start_rank = 220`, `end_rank = 319`.
3. Dans le run terminé, télécharger **Artifacts → aredl-nlw-preview-220-319**.
4. Ouvrir `aredl-nlw-review.csv` dans Excel ou `aredl-nlw-review.json` pour les détails.
5. Vérifier l'identité des niveaux, les vérificateurs, les conflits et les statuts inconnus.
6. Pour continuer : 320–419, 420–519, etc. (par petits lots pour ménager l'API).

Le workflow n'a aucun secret Supabase et ne peut pas modifier la base. S'il échoue ou si l'API change de forme, il faut examiner le message d'erreur et ajuster le parseur **avant** toute publication. Les réponses non reconnues ne sont jamais converties en données inventées.

## Exécuter localement

```bash
python tools/aredl_nlw_sync.py --start-rank 220 --end-rank 319
python -m unittest discover -s tests -p 'test_aredl_nlw_sync.py'
```

Pour comparer à un export manuel `demons.json` de la DLFR :

```bash
python tools/aredl_nlw_sync.py --start-rank 220 --end-rank 319 \
  --existing-json demons.json
```

`demons.json` peut être soit une liste d'objets `[{"name":"...", "level_id":"..."}]`, soit `{ "demons": [...] }`. **Attention :** sans cet export, on ne peut pas détecter les doublons avec les données stockées dans Supabase ; les résultats restent une liste de candidats.

Si AREDL expose un endpoint joueur consultable via `/players/{id}`, activer `--resolve-players` pour confirmer les pays manquants ; si une requête ne fonctionne pas, les identités resteront non déterminées. Si l'API fournit un endpoint des records pour chaque niveau, n'utiliser `--records-url-template` qu'**après** avoir vérifié son URL et son format. Exemple de syntaxe, **pas une URL AREDL confirmée** : `--records-url-template '/levels/{id}/records'`.

## Source de vérité et coexistence avec la modération

- **Clé unique d'un niveau** : identifiant numérique Geometry Dash (`gd_level_id` ou `level_id`), **pas le nom** ni le rang.
- **Fiche AREDL** : identifiant externe `aredl_id`. Garder les deux pour détecter les changements de classement.
- `NEW_CANDIDATE` : niveau absent du fichier manuel fourni ; création **proposée**, pas automatique.
- `MATCH_MANUAL_KEEP` : niveau déjà créé sur la DLFR. **Ne pas réinsérer, ne pas écraser les champs manuels.** Proposer de compléter les champs manquants, notamment le vérificateur FR/BE.
- `REVIEW_SAME_NAME_DIFFERENT_ID` : collision de nom, validation humaine obligatoire.
- `REVIEW_MISSING_GD_ID` / `CONFLICT_DUPLICATE_GD_ID` : ne pas créer tant que le conflit n'est pas résolu.
- **Un même record** futur : rapprocher `gd_level_id` + identifiant AREDL du joueur/record, puis enregistrer l'identifiant source. Un record manuel accepté reste acquis ; lorsque le record AREDL arrive, on le **rattache**, sans 2ᵉ validation ni doublon de points.
- Un niveau accepté chez nous avant AREDL conserve **notre validation**, même si l'AREDL l'accepte ensuite. Un changement de rang AREDL peut mettre à jour son **rang AREDL**, pas réinitialiser les décisions modérateur DLFR.
- La source officielle pour le classement NLW et les vérificateurs est AREDL ; les **dérogations manuelles DLFR sont marquées comme telles** et jamais écrasées silencieusement.

## Discord et les demandes de merge

Au premier import, les identités AREDL restent des **profils externes non revendiqués**, identifiés par **ID AREDL**. Même si un utilisateur Discord choisit le même nom, il n'est pas automatiquement reconnu comme propriétaire. Plus tard, un compte authentifié demandera une fusion, puis une preuve de propriété sera vérifiée et validée par les modérateurs. Un même identifiant AREDL ne sera lié qu'à un seul compte DLFR.

La future structure de tables de staging/identités/demandes/records est documentée dans `supabase/08_nlw_aredl_PREPARATION_NE_PAS_EXECUTER.sql`. Ce script suppose que l'ancien schéma Supabase a déjà été créé et que les comptes et les règles RLS sont en place.

## Limites actuelles

- Je n'ai pas pu récupérer de JSON **live** depuis l'environnement de création du patch ; je n'annonce donc aucun véritable vérificateur ou premier victor pour l'instant.
- L'API AREDL liste les niveaux, mais les détails (vérifications, vidéo, etc.) nécessitent une récupération supplémentaire. Les premiers victors ne seront renseignés que si les records et une vraie date de victoire sont disponibles.
- La position de Cobwebs peut changer : une alerte apparaît si Cobwebs n'est plus #219. Les tranches restent explicitement basées sur le **rang courant >= 220** ; ne publie pas les résultats si la borne a changé sans revalidation.
- **Première victoire historique** ≠ **plus ancien record AREDL daté disponible**. L'outil ne confond pas les deux.

Suite recommandée : valider les 100 premières fiches avec le CSV, inspecter les réponses AREDL pour les vérificateurs et victors, puis créer un import Supabase **idempotent et transactionnel** avec aperçu/approuval et gestion des écarts. Après seulement, automatiser les victors FR et BE.

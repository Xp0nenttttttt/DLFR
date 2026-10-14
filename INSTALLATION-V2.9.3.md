# DLFR V2.9.3 — AREDL NLW FR/BE / staging contrôlé

**Patch uniquement. Ne contient aucun fichier `assets/flags/`, aucun fichier HTML/CSS/JS, aucune clé Supabase.**

## Le problème corrigé

Sur l'artefact réel #220–319 fourni le 14 octobre 2026, l'AREDL renvoie 100 niveaux et les records de **Bloodlust (#257), Shardscapes (#260), kowareta (#295) et Arctic Lights (#314)** occupent 9, 5, 5 et 7 pages respectivement. L'ancien importateur s'arrêtait à 4 pages. Le nouveau lit jusqu'à **25 pages** de 100 records par niveau par défaut, maximum configurable 200. Une erreur tardive conserve les pages déjà lues, mais marque la fiche **incomplète** et la bloque pour le staging.

## Installer le patch

Copier à la racine de ton dépôt GitHub :

- `tools/aredl_nlw_sync.py` (remplacer)
- `.github/workflows/aredl-nlw-review.yml` (remplacer)
- `tools/aredl_nlw_stage_plan.py` (ajouter)
- `tests/test_aredl_nlw_stage.py` et `tests/test_aredl_nlw_sync.py` (ajouter/remplacer)
- `supabase/09_nlw_aredl_stage_OPTIONNEL.sql` (ajouter, **ne pas exécuter pour le premier essai**)

Dans GitHub > **Actions** > **AREDL NLW – aperçu FR BE**, lancer :

- `start_rank` : `220`
- `end_rank` : `319`
- `max_record_pages` : `25`
- `existing_export_path` : laisser vide si aucun export des démons déjà validés DLFR n'est disponible.

Télécharger l'artefact `aredl-nlw-preview-220-319` :

- `aredl-nlw-review.json` et `.csv` : résultat brut, statut, vérifications et premiers records FR/BE **datés observés**.
- `aredl-nlw-stage.json` et `.csv` : proposition de rapprochement et exclusions.
- `aredl-nlw-stage.sql` : **script SQL de staging pour revue**. GitHub Actions ne l'exécute jamais.

Le workflow échoue volontairement si une récupération est incomplète (même s'il produit un artefact de diagnostic).

## Rapprocher avec les démons DLFR déjà validés

Le script peut comparer un export JSON ne contenant **que** `name` et `level_id` des démons DLFR, par exemple :

```json
[
  {"name": "Un niveau déjà validé", "level_id": "12345678"}
]
```

Pour générer l'export à partir de Supabase (si les démons DLFR y sont présents), la requête **en lecture seule** est :

```sql
select coalesce(json_agg(json_build_object('name', name, 'level_id', level_id)), '[]'::json)
from public.demons;
```

Enregistrer la liste JSON dans un fichier du dépôt (ne pas ajouter d'informations privées), puis renseigner son chemin dans `existing_export_path`. Sans cet export, les nouvelles fiches sont marquées **`NO_DLFR_EXPORT_REVIEW`** ; on ne peut pas certifier l'absence de doublons.

Le rapprochement s'effectue uniquement par **ID Geometry Dash** : un même ID est un niveau existant, même si le nom diffère. Une collision de nom avec un ID différent est exclue et laissée à un humain.

## Première insertion contrôlée dans Supabase : optionnelle

**Ne pas appliquer cette partie tant que tu n'as pas examiné les JSON/CSV et choisi de commencer le stockage en base.** Le workflow ne contient **aucune clé Supabase**, aucune écriture et aucun déploiement.

1. Exécuter **manuellement et une seule fois**, après vérification, `supabase/09_nlw_aredl_stage_OPTIONNEL.sql` dans l'éditeur SQL Supabase. Il crée uniquement `public.dlfr_aredl_nlw_stage` avec RLS et **sans accès anon/authenticated**.
2. Examiner `out/aredl-nlw-stage.csv` et le SQL correspondant. Les conflits, niveaux sans ID GD et records incomplets en sont exclus.
3. Si tout est cohérent, exécuter **manuellement** le contenu de `aredl-nlw-stage.sql` depuis l'éditeur SQL Supabase. Les données sont alors stockées en **attente de revue**, invisibles sur le site public.
4. Une prochaine étape créera l'outil de validation/promotion vers la NLW publique, après vérification des doublons réels. **Aucun dédoublonnage automatique de `public.completions` ou de `public.players` n'a encore été activé.**

Le SQL de staging est rejouable : si une ligne est marquée `approved`, `rejected`, `conflict` ou `manually_locked=true`, ses données ne seront pas écrasées lors d'une nouvelle synchronisation. Les `aredl_id` sont uniques et les `gd_level_id` forment la clé primaire. Si un AREDL ID vient à correspondre à un autre ID GD, une contrainte bloque l'insert : **ne pas contourner cette anomalie**.

## Vérifications et limites

- Aucun compte AREDL n'est fusionné avec Discord sur une égalité de pseudo.
- Le pays d'un vérificateur n'est pas deviné : FR/BE uniquement s'il est confirmé.
- `first_observed_fr_be` = **plus ancien record FR/BE daté trouvé**, *pas* preuve historique de première victoire.
- Aucun record AREDL importé dans `completions` automatiquement. La coexistence avec les validations manuelles nécessite l'étape de revue et de liaison ultérieure.
- Le périmètre vérifie strictement que **Cobwebs est #219** et que l'on commence à **#220**. Si la frontière bouge sur AREDL, le staging est bloqué et demande une décision humaine.
- Test local : `python -m unittest discover -s tests -p 'test_aredl_nlw_*.py' -v`.
- Le patch a été testé sur les données de l'artefact fourni et avec des réponses simulées. **Un nouvel appel live à l'API depuis GitHub Actions est nécessaire** pour confirmer les pages supplémentaires.

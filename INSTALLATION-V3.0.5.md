# DLFR V3.0.5 — Tous les niveaux AREDL, sans CSV à importer

**Patch uniquement.** Prévu pour être installé **après V3.0.4**. Aucun fichier dans `assets/flags/` ni `js/config.js` n'est fourni, remplacé ou supprimé.

## Objectif

- Importer **le catalogue entier** de l'AREDL en une seule opération GitHub Actions, puis relancer le même processus à volonté.
- Les modes `preview`, `stage`, `publish` sont explicites. Le SQL de la table d'attente reste privé.
- Un niveau identifié par son **ID Geometry Dash** n'est jamais créé deux fois. Un niveau déjà validé à la main conserve son rang DLFR, son nom et ses preuves. Les positions AREDL sont conservées **séparément**.
- Une position occupée bloque seulement la publication **du niveau concerné**. Aucune réorganisation silencieuse de la DLFR.
- Le workflow planifié toutes les six heures **ne fait que préparer les données** (`stage`), jamais publier.
- Les records/victeurs ne sont **pas** importés par le catalogue rapide. Le workflow détaillé de V2.9.4/V2.9.5 reste nécessaire pour les vidéos et les premiers records FR/BE. Un média détaillé existant dans la table d'attente peut enrichir une fiche lorsque le catalogue est publié.
- Supprimer le mode démonstration de l'interface, renommer NLW « Non List Worthy » et uniformiser le repérage Main List #1–75 (bleu).

## Étape 0 — Sauvegarde de sécurité

Dans Supabase, sauvegarder au moins `public.demons`, `public.dlfr_aredl_level_stage`, `public.completions`, `public.players`. Ne pas lancer de publication sans avoir vérifié les versions SQL **01, 10, 11, 12, 13 et 14** installées.

## Étape 1 — Activer la fonction SQL (UNE SEULE FOIS)

Ouvrir Supabase → SQL Editor → New query. Copier **tout le contenu** de `supabase/15_aredl_global_sync.sql` et exécuter.

Ce SQL crée uniquement la fonction `public.dlfr_aredl_catalog_batch(jsonb, boolean)` pour la synchronisation serveur :
- seuls `service_role` (ou les nouvelles clés `sb_secret_*` correspondantes) peuvent l'appeler ;
- aucun client navigateur ni utilisateur authentifié ne peut l'exécuter ;
- aucune donnée n'est insérée par l'installation de cette fonction ;
- les niveaux UNRATED et uniquement DLFR ne sont jamais effacés.

Si le SQL affiche « relation `dlfr_aredl_level_stage` does not exist », il manque la migration `10_aredl_level_stage_OPTIONNEL.sql` déjà fournie par V3.0.3. Ne pas poursuivre tant qu'elle n'est pas créée.

## Étape 2 — Ajouter les fichiers GitHub

Dézipper le patch à **la racine** du dépôt DLFR. Remplacer `index.html`, `js/app.js`, `css/production.css`, et ajouter :

- `supabase/15_aredl_global_sync.sql`
- `tools/aredl_catalog_sync.py`
- `tools/aredl_nlw_sync.py` (le normaliseur commun au catalogue)
- `.github/workflows/aredl-catalog-supabase.yml`
- `tests/test_aredl_catalog_sync.py`

**Ne pas supprimer ton ancien workflow d'import détaillé** ; il sert encore à enrichir vérificateurs et vidéos.

Supprimer de ton navigateur les anciens favoris `?demo=1`. Le mode démo n'existe plus dans cette version : en cas de problème Supabase, une erreur doit être affichée plutôt que de fausses données.

## Étape 3 — Déclarer les secrets GitHub

Dans ton dépôt GitHub → **Settings → Secrets and variables → Actions → New repository secret** :

- `SUPABASE_URL` : l'URL de ton projet, `https://ton-projet.supabase.co`.
- `SUPABASE_SECRET_KEY` : idéalement une **clé secrète Supabase** (`sb_secret_...`), dans Supabase → Project Settings → API Keys. Si tu utilises l'ancienne clé `service_role` JWT, utilise plutôt le secret `SUPABASE_SERVICE_ROLE_KEY` : les deux formats sont pris en charge.

**Ne mets JAMAIS `sb_secret_*` ou `service_role` dans `js/config.js` ou un fichier commité, ni dans un message de chat.** La clé publique `sb_publishable_*` de GitHub Pages n'a pas les droits d'import.

Dans GitHub → Settings → Environments, crée si besoin l'environnement **`aredl-import`**. Tu peux lui ajouter une approbation obligatoire avant les publications. Le workflow utilise cet environnement.

## Étape 4 — Un seul workflow à relancer

GitHub → Actions → **AREDL - synchronisation globale Supabase** → Run workflow.

| Mode | Ce qu'il fait | Quand l'utiliser |
|---|---|---|
| `preview` | Lit **tout l'AREDL** et produit un CSV/JSON **sans connexion Supabase** | Premier essai |
| `stage` | Actualise la **table d'attente** Supabase par lots, sans publication | Après `preview`, puis pour les synchronisations régulières |
| `publish` | Met en attente et **publie toutes les fiches sans conflit**, sans bouger les niveaux placés manuellement | Quand le catalogue a été revu et la sauvegarde effectuée |

Les entrées `preview`, `stage`, `publish` sont des **choix explicites**, pas des paramètres de rang à recopier. Le workflow appelle une seule fois `/levels`, sans charger les milliers de pages des victoires ; le mode `publish` envoie les niveaux par lots de 75.

Le fichier CSV produit dans l'artefact GitHub Actions est un **rapport de contrôle**, **pas** un fichier à importer manuellement dans Supabase. Pour refaire une mise à jour, relancer le même workflow : pas besoin d'un nouveau SQL.

## Étape 5 — Vérifier les données

Dans Supabase → SQL Editor, ces requêtes sont **en lecture seule** :

```sql
SELECT count(*) AS niveaux_publies FROM public.demons;

SELECT review_state, count(*)
FROM public.dlfr_aredl_level_stage
GROUP BY review_state ORDER BY review_state;

SELECT aredl_rank, aredl_name, gd_level_id, manual_note
FROM public.dlfr_aredl_level_stage
WHERE review_state = 'conflict'
ORDER BY aredl_rank LIMIT 100;

SELECT position, name, level_id, aredl_rank, data_source
FROM public.demons
ORDER BY position LIMIT 50;
```

Le rapport JSON de GitHub Actions indique `created` (nouvelles fiches), `matched` (fiches rapprochées), `conflicts` (à traiter manuellement) et `skipped` (bloqués). Les entrées sans ID GD valable restent à examiner plutôt que d'être créées au hasard.

Pour un niveau en conflit de position, utilise **Modération → Import AREDL** pour décider son rang. Le classement DLFR et les rangs AREDL ne sont pas la même chose.

## Qu'arrivera-t-il dans six heures ?

GitHub Actions relancera la synchronisation en mode **`stage`** seulement. Cela ne changera aucun rang DLFR et ne rendra public aucun niveau non revu. Relancer `publish` quand tu voudras accepter les nouveautés sûres ; les niveaux déjà rapprochés ne seront pas dupliqués.

## Limites connues / sécurité

- Ne crée ni record/victoire ni identité Discord à partir de simples pseudos AREDL.
- L'import catalogue ne récupère pas instantanément les vidéos des vérificateurs. Utilise **l'ancien workflow détaillé** pour ces champs, et conserve la validation des preuves.
- Les dates des premières victoires restent celles des **plus anciens records FR/BE datés disponibles**, pas une certification historique.
- La fonction SQL et les appels réseau ont été vérifiés statiquement ; **ils n'ont pas été exécutés sur ton instance Supabase**. Commence par `preview`, sauvegarde, puis une publication contrôlée.
- Aucun drapeau personnalisé n'est inclus.

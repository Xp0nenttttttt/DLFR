# DLFR V3.0.6 — Corriger le blocage « identifiants invalides ou dupliqués »

## Pourquoi l'import s'arrêtait

Le script V3.0.5 rejette le mode `publish` lorsque des entrées AREDL n'ont pas d'ID de niveau Geometry Dash valide, ou lorsqu'un même ID est utilisé plusieurs fois. Le journal « 18 identifiants invalides ou dupliqués » ne dit PAS de quelle catégorie il s'agit. **Ne remplacez pas ces ID par des valeurs inventées.**

La V3.0.5 interrompait l'exécution *avant* d'écrire le rapport : l'artefact GitHub Actions n'indiquait pas les 18 noms concernés.

## Installation (sans SQL)

Dans GitHub, remplacer exactement :

- `tools/aredl_catalog_sync.py`
- `.github/workflows/aredl-catalog-supabase.yml`

Ajouter ou remplacer éventuellement `tests/test_aredl_catalog_sync.py` (tests automatiques).

Aucun autre fichier du site, aucune donnée Supabase, aucun fichier `assets/flags` ou clé n'est modifié.

## Première étape : voir les problèmes réels

1. Aller dans **GitHub → Actions → AREDL - synchronisation globale Supabase → Run workflow**.
2. Choisir `mode = preview`. Ne pas activer la publication partielle.
3. Une fois terminé, télécharger l'artefact `rapport-aredl-global-...` en bas du run.
4. Ouvrir `aredl-global.invalid.csv` dans Excel : chaque ligne contient **rang, nom, ID GD, ID AREDL, type et raison**.
5. `aredl-global.csv` contient les niveaux valides uniquement ; `aredl-global.json` contient le récapitulatif.

La nouvelle vérification met **toutes** les entrées partageant un ID en quarantaine. Le nombre d'anomalies peut donc différer des 18 signalées par l'ancienne version.

## Publier les niveaux valides sans les anomalies

1. Vérifier le rapport `preview` et contrôler que les niveaux exclus ne doivent pas être fusionnés.
2. Si la table d'attente n'a pas encore été alimentée, lancer `mode = stage` : les niveaux valides sont mis en attente, les anomalies restent dans le rapport.
3. Revenir sur **Run workflow** et choisir :
   - `mode = publish`
   - **cocher** `allow_partial_publish = true`
4. Le script enverra **seulement les niveaux dont les ID sont univoques et valides**. Il n'inventera jamais d'identifiant.
5. Télécharger le rapport et vérifier les champs `created`, `matched`, `conflicts`, `skipped`. Un conflit de rang DLFR reste en revue manuelle.

**Si `allow_partial_publish` reste décoché**, l'import `publish` reste bloqué lorsque des anomalies existent, mais produit enfin ses rapports CSV/JSON.

La synchronisation planifiée toutes les six heures reste en `stage` et ne publie rien toute seule.

## Débloquer les niveaux exclus

- **ID GD absent / invalide :** chercher et vérifier l'identifiant sur la fiche officielle de Geometry Dash / AREDL avant de créer une fiche manuelle en modération. Il n'est pas sûr de déduire l'ID du nom.
- **ID GD dupliqué :** vérifier si deux entrées AREDL désignent réellement le même niveau ou si l'une contient un identifiant erroné. Le script écarte les deux, pour éviter une fusion automatique incorrecte.
- **ID AREDL dupliqué :** vérifier les entrées sources et ne pas associer deux fiches à un même ID externe.

Si l'AREDL corrige les données ultérieurement, la prochaine synchronisation pourra récupérer le niveau de manière normale. Sinon, la modération DLFR peut créer/compléter manuellement une fiche vérifiée.

## Garanties / limites

- Pas de modification de schéma SQL.
- Les niveaux créés ou validés manuellement ne sont pas réécrits silencieusement.
- La RPC Supabase V3.0.5 gère toujours les conflits de position en revue plutôt qu'en réordonnant les niveaux.
- L'import catalogue ne récupère **pas** encore les records et vidéos détaillés ; c'est un flux séparé.
- Les tests locaux n'incluent pas de connexion réseau à AREDL/Supabase : le premier run réel reste à contrôler.

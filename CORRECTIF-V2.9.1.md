# DLFR V2.9.1 – Correction HTTP 404 de l'importateur NLW

L'ancienne constante pointait sur `https://api.aredl.net/v2/api`, qui ne possède pas la route `/levels` et renvoie HTTP 404.

La bonne base est `https://api.aredl.net/v2/api/aredl`. L'importateur effectue désormais `GET https://api.aredl.net/v2/api/aredl/levels` pour la liste et `GET https://api.aredl.net/v2/api/aredl/levels/{id}` pour chaque fiche. Un autre client AREDL open source et son code de configuration confirment cette base.

## Installation

1. Remplace **uniquement** `tools/aredl_nlw_sync.py` à la racine du dépôt GitHub par celui de ce patch.
2. Fais un commit.
3. Relance **Actions → AREDL NLW – aperçu FR BE → Run workflow** avec les rangs 220 à 319.
4. Télécharge `aredl-nlw-review.json` et `aredl-nlw-review.csv` depuis l'artefact du workflow si l'exécution aboutit.

Tu n'as pas besoin de modifier le YAML ni tes tables Supabase. Le script reste strictement en **aperçu / lecture seule** : il n'insère aucun niveau.

## Limites

Le point d'accès a été recoupé avec les sources ouvertes. Nous n'avons pas pu exécuter de requête live vers l'API depuis cet environnement ; d'autres différences de format ou d'API peuvent encore apparaître au premier vrai lancement GitHub Actions. En cas de nouveau problème, transmets le nouveau log.

Le patch ne contient **aucun drapeau ni ressource visuelle**. Les tests `tests/test_aredl_url.py` sont facultatifs ; ils valident la route sans réseau (`python -m unittest discover -s tests -p 'test_aredl_url.py'`).

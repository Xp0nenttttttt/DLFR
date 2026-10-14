# DLFR V3.0.10 — correctif export CSV des preuves françaises

## Cause

Le script `tools/aredl_fr_evidence_sync.py` mettait le champ `records_seen` dans chaque ligne à exporter, mais n'avait pas déclaré cette colonne dans `csv.DictWriter`. Python levait `ValueError: dict contains fields not in fieldnames: 'records_seen'` avant le fichier JSON et avant toute écriture Supabase en mode `stage`.

## Installation

1. Ouvrir le patch ZIP.
2. Remplacer **uniquement** `tools/aredl_fr_evidence_sync.py` dans le dépôt GitHub DLFR.
3. Faire `Commit changes` et attendre la fin du commit.
4. Dans **Actions → AREDL - preuves France uniquement**, relancer la même tranche en `preview`.
5. Télécharger l'artefact `rapport-preuves-fr-*` et vérifier `aredl-fr-review.csv` ainsi que `aredl-fr-review.json`.
6. Après vérification, relancer la même tranche en `stage` pour enrichir la table d'attente Supabase. `stage` n'effectue **aucune publication publique**.

Aucun SQL, aucune modification du workflow ni des drapeaux PNG nécessaires.

## Contenu du correctif

- Définition explicite des huit colonnes CSV, dont `records_seen`.
- Écriture d'un dictionnaire de colonnes sélectionnées (évite de casser à nouveau si de nouveaux champs sont ajoutés au JSON).
- Le rapport JSON conserve intégralement `verifiers_fr`, `first_fr`, vidéos et autres détails.
- Le mode `stage` reçoit toujours les objets complets, sans conversion en chaînes de caractères.
- Tests unitaires inclus pour `preview`, `stage`, et absence de première victoire française.

**Attention** : aucun appel à l'API AREDL ni à ton Supabase réel n'a été exécuté ici. Six tests simulés passent. Les autres avertissements éventuels de pagination restent indépendants de ce correctif.

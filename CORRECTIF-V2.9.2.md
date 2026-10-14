# DLFR V2.9.2 — Correctif AREDL v2 / aperçu FR-BE

**Ce ZIP est un patch, pas un site complet.** Aucune écriture Supabase, aucun changement HTML/CSS/JS, aucun fichier dans `assets/flags/`.

## Pourquoi l'ancien aperçu contenait zéro niveau

Le ZIP d'erreur (tranche 220–319) contenait 100 échecs HTTP 404 de type :

`/v2/api/aredl/players/{uuid}`

Le dépôt officiel AREDL v2 publie plutôt la route **`/v2/api/aredl/profile/{uuid}`**. Le script précédent faisait échouer une fiche entière lorsque la recherche d'un profil échouait.

## Nouvelles corrections

- Requêtes vers `GET /profile/{id}` pour les profils AREDL.
- Une erreur de profil n'efface plus le niveau : le pays reste **inconnu**, sans supposition sur la nationalité.
- Interprétation du pays AREDL **numérique** (ISO 3166-1) : France = `250`, Belgique = `56` (aussi compatible avec `FR`, `BE`).
- Lecture du joueur dans le champ `submitted_by` et de la date de victoire dans `achieved_at`.
- Les **verifications** figurent dans la fiche du niveau, tandis que les victoires ordinaires se trouvent sur `GET /levels/{id}/records` : les deux sources sont comparées pour proposer la première FR/BE **datée et observée**.
- Pagination automatique des victoires : 100 entrées/page, jusqu'à 4 pages/niveau par défaut. Si d'autres pages existent, `records_complete=false` et un avertissement s'affichent : ne pas présenter comme victoire historique certaine.
- Les résultats incluent désormais `records_complete`, `records_pages_fetched`, `records_total_pages` et `record_fetch_error` ; CSV avec un statut clair.
- Le rapprochement avec les validations manuelles reste basé sur l'ID Geometry Dash et reste **sans publication**.

## Installer

1. Décompresser ce ZIP à la racine du dépôt `DLFR` en conservant les dossiers.
2. Remplacer **`tools/aredl_nlw_sync.py`** et **`.github/workflows/aredl-nlw-review.yml`**. Le fichier `tests/test_aredl_nlw_sync.py` est facultatif mais recommandé.
3. Commit/push.
4. Dans **GitHub → Actions → AREDL NLW – aperçu FR BE → Run workflow**, commencer par une tranche réduite **220–229** pour tester l'API, puis relancer **220–319**.
5. Télécharger l'artifact produit et consulter le JSON (champs `failures`, `warnings`) et le CSV.

## Important pour la première victoire

L'AREDL renseigne `achieved_at`, une date de victoire pour les records enregistrés. Le script propose la **plus ancienne victoire FR/BE datée disponible** dans la tranche de records interrogés, **sans garantir** qu'il s'agit de la toute première victoire historique du pays. Une vérification humaine reste nécessaire. Une lecture incomplète ou un pays manquant doit rester une incertitude explicite.

Un niveau déjà validé manuellement n'est **pas écrasé**. Les comptes AREDL ne sont pas automatiquement associés aux profils Discord/DLFR sur simple égalité de pseudo.

## Tests / statut de validation

Le script et les tests fonctionnent avec les **réponses AREDL simulées** et les structures du backend AREDL v2. La vraie réponse des endpoints n'a pas pu être interrogée depuis cet environnement : le prochain lancement Actions validera l'intégration réseau réelle.

Pour reproduire les tests localement :

```bash
python -m unittest discover -s tests -v
```

Références backend :

- https://github.com/All-Rated-Extreme-Demon-List/aredl-backend-v2/blob/main/src/aredl/profile/routes.rs
- https://github.com/All-Rated-Extreme-Demon-List/aredl-backend-v2/blob/main/src/aredl/levels/records/routes.rs
- https://github.com/All-Rated-Extreme-Demon-List/aredl-backend-v2/blob/main/src/users/model.rs

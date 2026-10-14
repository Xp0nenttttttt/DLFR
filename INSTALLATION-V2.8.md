# DLFR V2.8 — 18 badges officiels

Installation : remplacer `index.html`, `js/app.js` et `js/badge-system.js` dans le dépôt. Aucune image, aucun drapeau, aucun SQL. Ne pas effacer les données locales avant mise à jour si tu veux conserver tes autres changements.

## Règles
- 18 badges : Ultra 3, Mythique 2, Légendaire 4, Epic 3, Impressive 4, Beginner 2.
- Manuels uniquement : Le Goat tout simplement (premier national), Le Goat de ta région (premier régional), Clash of Clans (clan premier).
- Automatiques : les 15 autres. Un niveau compte une fois par joueur, seulement avec record à 100 % ; Rated dans le Top 150 = Main List 1–75 + Extended 76–150 ; NLW = rang >150 Rated ; UNRATED = flag unrated, indépendamment de son rang.
- Les badges GOD et Demi Dieu portent sur les 150 et 75 niveaux Rated *actuels* et ne se déclenchent que si ces ensembles ont respectivement exactement 150 et 75 entrées distinctes.
- Attribution permanente : aucun retrait lors d'un recul au classement. Pour les conditions déjà satisfaites au premier lancement, date inconnue, puisqu'aucun historique exact n'a été fourni. Les déblocages futurs enregistrent le jour de leur détection dans le navigateur.
- Migration en mode démo : au premier lancement V2.8, les anciennes définitions, catégories et attributions sont remplacées par la liste officielle. Attention, cette opération retire les anciens badges locaux.
- Mode Supabase : ce patch n'implémente PAS l'attribution sécurisée côté serveur. Les badges locaux de la démo ne sont ni une preuve de complétion ni des données vérifiées. Il faudra installer une migration + des triggers/Edge Functions et RLS avant production.

## Tester
1. Ouvrir `?page=my-profile&demo=1` pour voir les badges verrouillés (conditions masquées).
2. Dans `?page=admin&demo=1`, rubrique Badges & Palmarès, attribuer un des 3 badges de classement fictifs.
3. Ajouter des complétions 100 % à un joueur fictif puis rouvrir Mon profil : les badges automatiques correspondants doivent apparaître.

Les fichiers `assets/flags/` et les PNG personnels ne sont ni inclus ni modifiés.

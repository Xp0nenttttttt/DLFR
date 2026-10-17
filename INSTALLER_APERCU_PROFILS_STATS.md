# DLFR — Aperçu des profils dans Statistiques (patch 2.5.1)

Ce correctif est construit sur **DLFR 2.5** (promotion NLW vers Top 150) et conserve les fiches de profils indépendantes de la 2.4.

## Installation
1. Sauvegarder les fichiers du site.
2. Remplacer `js/app.js` et `css/style.css` par ceux du patch.
3. Recharger avec Ctrl + F5.
4. Ouvrir **Classements → Statistiques des joueurs → Joueurs**.
5. Cliquer sur un joueur : son aperçu s'affiche à côté du classement. Cliquer sur **Voir le profil complet ↗** pour ouvrir sa page publique.

## Détails
- Aperçu : bannière, avatar, drapeau, nom, compte lié, titre mis en avant, rang DLFR, points, hardest, Main, Extended, NLW, courte biographie si disponible.
- La recherche et les filtres par pays/région restent disponibles ; la carte suit le joueur sélectionné et les résultats filtrés.
- Sur mobile, la carte apparaît sous le classement.
- Les autres onglets Statistiques (pays, NLW, UNRATED, comparaison) restent inchangés.
- Aucune migration SQL ni modification de Supabase.
- Aucun fichier `assets/flags/` n'est livré ou modifié.

## Validation
- `node --check js/app.js` : OK.
- Tests ciblés : aperçu dans les statistiques, navigation, profils, activité, pages cinématiques : OK sur la copie locale du projet.
- Pas de test sur Supabase en production.

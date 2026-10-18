# DLFR V52.2 — Autoriser les modérateurs à créer leur fiche personnelle

## Problème identifié
Dans `js/app.js`, les formulaires publics sont reconnus pour les joueurs non-modérateurs,
mais un second contrôle de rôle empêchait `selfCreatePlayer`, `prodClaim` et `submitRecord`
pour les comptes avec rôle `moderator` ou `nlw`. Un membre du staff pouvait donc
exister dans l’onglet Équipe sans fiche joueur et être empêché de créer sa propre fiche.

## Correction
- Les actions personnelles `selfCreatePlayer`, `prodClaim` et `submitRecord` sont
  accessibles aux comptes connectés ordinaires **et** à tous les rôles de modération.
- Les opérations d’administration restent restreintes : aucun nouveau droit
  de validation, de fusion ou de modération n’est accordé.
- Validation HTML du champ pseudo GD corrigée pour les versions récentes des navigateurs.
- Numéros de cache JavaScript actualisés dans `index.html`.

## Installation
1. Sauvegarder les fichiers actuels.
2. Remplacer `js/app.js`, `js/production-tools.js` et `index.html`.
3. Ne pas toucher à `assets/flags/`, aux autres CSS, aux fonctions d’authentification, ni aux données SQL.
4. Publier sur GitHub Pages, puis `Ctrl+F5`.

## Fluxy : comment apparaître dans l’Équipe ET dans les stats
Il se connecte à son compte habituel, puis ouvre **Mon espace → Mon profil**.
- Si aucune fiche joueur n’est liée à son compte, le bloc **Je n’ai pas encore de fiche** apparaît.
  Il peut entrer son pseudo GD et cliquer sur **Créer ma fiche DLFR**.
- **S’il possède déjà une fiche historique**, il ne doit pas en créer une nouvelle : utiliser
  **J’ai déjà une fiche joueur → Demander la liaison** (validation par la modération).
- La fiche apparaîtra ensuite dans **Profils des joueurs** et en principe dans
  **Statistiques → Joueurs**, à condition qu’elle ne soit pas masquée (`hidden_from_stats`).
  Sans record validé, ses points restent à 0 et il n’apparaît pas dans les statistiques qui
  comptent seulement les joueurs avec points.

## Vérifications locales
Syntaxe `node --check` sur les deux JavaScript ; contrôles statiques de la modification ;
les autorisations de la RPC Supabase doivent être vérifiées lors de l’essai sur le vrai site.
Aucun changement de mot de passe, de compte, de permissions ou de table SQL.

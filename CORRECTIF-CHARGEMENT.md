# DemonlistFrancophone V2.0.3 — correctif du chargement

## Pourquoi la page pouvait rester bloquée

La capture montre le bas de page « Aperçu local (Supabase non modifié) » : le mode démonstration avait commencé, mais une erreur JavaScript pouvait interrompre l’affichage avant le remplacement de « Chargement de la Demonlist… ». Causes possibles : scripts manquants ou déployés dans des versions différentes, ou anciennes données de démo enregistrées localement. La cause exacte sur le serveur GitHub n’a pas été confirmée.

## Installation rapide (GitHub Pages)

1. Depuis le ZIP **patch**, recopier `index.html`, `js/app.js` et `css/style.css` dans le dépôt, en conservant les dossiers.
2. Vérifier dans le dépôt la présence des fichiers `js/v2-core.js`, `js/v2-demo.js`, `js/community-unverified.js`, `js/demo-data.js`. Si l’un manque, reprendre **le ZIP complet** au lieu du patch.
3. Faire un commit et attendre le déploiement GitHub Pages. Puis actualiser le navigateur avec **Ctrl+F5**.
4. Pour tester sans Supabase, ajouter `?demo=1` à l’URL. Si la page a encore des problèmes liés aux anciennes données locales, utiliser `?demo=1&reset=1`.

## Changement de données

- **Aucune migration SQL**, aucune modification des tables.
- Le correctif ne change PAS `js/config.js` dans le patch, donc il garde ta configuration existante.
- Le bouton « Réinitialiser la démo locale » efface uniquement la sauvegarde de démonstration de ce navigateur ; cela n’efface rien dans Supabase ni GitHub. Pense à exporter tes créations en démo avant de réinitialiser.
- Un chargement Supabase qui n'aboutit pas après 20 secondes affiche un message au lieu d’attendre indéfiniment.
- La barre de navigation revient sur deux lignes si nécessaire au lieu de provoquer un défilement horizontal géant.

## En cas de nouvel échec

L’écran affichera le message de l’erreur. Envoie une capture du message et, si possible, la première erreur rouge de la console développeur (F12 → Console).

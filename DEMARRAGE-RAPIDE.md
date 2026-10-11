# Démarrer la nouvelle Demonlist (sans PHP)

**0.** On ne touche pas à l'ancien site x10Hosting : il reste public pendant toute la migration.

**1. Voir le prototype :** ouvrir `index.html`. Si nécessaire, utiliser VS Code → Live Server. Tant que `js/config.js` est vide, les pages utilisent des **données de démonstration**.

**2. Mettre sur GitHub :** créer un dépôt et envoyer le contenu de ce dossier (les fichiers doivent être à la racine du dépôt). Dans GitHub → Settings → Pages, activer `Deploy from a branch`, branche `main`, dossier `/(root)`.

**3. Supabase :** créer un **nouveau projet**, ouvrir SQL Editor, exécuter `supabase/01_schema.sql`. Copier l'URL du projet et la **publishable key** dans `js/config.js`. Cette clé publique peut se trouver dans un site web ; les secrets `service_role` / `sb_secret_...` ne doivent **jamais** s'y trouver.

**4. Les vraies données :** voir `README.md` → « Récupérer les données de la vraie Demonlist ». Exporter en CSV les tables `users`, `demons`, `completions` depuis phpMyAdmin. Utiliser le convertisseur Python puis importer dans Supabase. Ne jamais publier ces exports.

**5. Modération :** créer un compte dans Supabase Auth et attribuer son rôle via SQL Editor (procédure dans `README.md`). L'ancien mot de passe PHP ne se transfère pas automatiquement.

**6. Historique automatique :** si voulu, configurer dans GitHub → Settings → Secrets and variables → Actions les secrets `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`. Le workflow `.github/workflows/daily-snapshots.yml` enregistre ensuite un historique une fois par jour. La clé secrète reste **uniquement dans GitHub Actions**, jamais dans les pages HTML ni dans un dépôt public.

Important : ceci est une **V1 de migration**, pas encore une bascule de production. Tester les scores, la sécurité, les comptes et les cas historiques avant de remplacer le site existant.

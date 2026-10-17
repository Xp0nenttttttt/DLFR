# DLFR 2.14 — Connexion par pseudo et liaison Discord

Cette mise à jour s'applique **par-dessus la DLFR 2.13**, elle-même basée sur la 2.12. Elle conserve les profils, clans, badges, soumissions et droits existants.

## Ce qui change

- Suppression des formulaires **Connexion e-mail** dans Mon profil et Modération ; la connexion reste possible par **pseudo + mot de passe** ou **Discord**.
- Sur Mon profil, une section **Mes méthodes de connexion** affiche les moyens reliés au même compte Supabase Auth.
- Depuis un compte **pseudo + mot de passe**, bouton **Associer mon Discord**. Le joueur est envoyé vers Discord, et revient au même compte après validation.
- Depuis un compte **Discord sans pseudo DLFR**, choix d'un pseudo et d'un mot de passe, liés au **compte Discord existant**. Le compte doit avoir été reconnecté à Discord au cours des 20 dernières minutes.
- Un profil Geometry Dash **n'est jamais revendiqué automatiquement**, les rôles ne changent pas, et aucun double compte n'est fusionné de manière implicite.

## Installation, dans cet ordre

1. **Sauvegarde** Supabase et les fichiers du site. Vérifie surtout que le compte propriétaire peut actuellement se connecter avec Discord ou avec un pseudo, AVANT de cacher l'ancien formulaire e-mail. Sinon, tu pourrais perdre l'accès à la modération depuis l'interface.
2. Supabase Dashboard → **Authentication** : vérifie que le fournisseur **Discord** est activé, et active l'option **Allow manual linking** / **Enable manual linking** dans les paramètres d'authentification. L'URL de redirection de ton site (par ex. `https://xp0nenttttttt.github.io/DLFR/`) doit être autorisée dans **URL Configuration** (incluant, si nécessaire, le chemin et la variante avec `?page=my-profile`). L'OAuth Discord doit déjà fonctionner avant la liaison.
3. Si la migration `42_USERNAME_PASSWORD_ACCOUNTS.sql` a déjà réussi lors de la 2.13, **ne la relance pas**. Sinon, exécute le fichier inclus dans ce ZIP depuis le SQL Editor.
4. **Redéploie** la fonction `username-auth` fournie dans `supabase/functions/username-auth/index.ts`. Ouvre un terminal dans le dossier qui contient `supabase`, puis :

   ```bash
   npx supabase login
   npx supabase link --project-ref TON_PROJECT_REF
   npx supabase functions deploy username-auth --no-verify-jwt
   ```

   Le paramètre `--no-verify-jwt` est nécessaire pour les actions `register` et `login` sans session. Les actions sensibles `status` et `attach` **vérifient le JWT côté serveur**. Les variables `ALLOWED_ORIGINS`, `AUTH_RATE_PEPPER`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` doivent rester correctement configurées dans les **Secrets de la fonction**, jamais dans GitHub Pages.
5. Sur GitHub Pages, remplace seulement `js/app.js` et `js/username-auth.js` par ceux du ZIP. Ne touche pas aux autres scripts ni aux fichiers personnalisés.
6. Dans `js/config.js` existant, conserve toutes les clés/paramètres, et vérifie que `enableUsernameLogin: true` et `enableDiscordOAuth: true` sont activés.
7. Actualise avec **Ctrl + F5**, puis teste avec des comptes sans privilèges.

**Ne désactive pas le fournisseur e-mail/mot de passe dans Supabase Auth !** Supabase utilise toujours une adresse *technique interne* pour authentifier les comptes par pseudo. On supprime seulement les **champs e-mail publics** du site.

## Scénarios de test

### A. Joueur inscrit avec pseudo uniquement
1. Connecte-toi avec pseudo et mot de passe.
2. Va dans **Mon profil → Mes méthodes de connexion → Associer mon Discord**.
3. Autorise Discord et reviens sur la DLFR.
4. Vérifie que les deux méthodes sont affichées comme liées et que ton **auth_user_id** est inchangé.
5. Déconnecte-toi ; teste la connexion avec Discord puis avec le pseudo.

### B. Joueur inscrit avec Discord uniquement
1. Connecte-toi **à nouveau avec Discord** (session récente).
2. Dans **Mon profil → Mes méthodes de connexion**, saisis un pseudo libre, un mot de passe et sa confirmation.
3. Enregistre, déconnecte-toi, puis reconnecte-toi avec le pseudo.
4. Vérifie que ton profil, tes clans, badges et rôles sont identiques.

### C. Un joueur possède déjà DEUX comptes différents

L'association Discord via Supabase sera **refusée si cette identité Discord appartient déjà à un autre utilisateur Auth**. **Ne supprime pas un compte et ne déplace pas automatiquement `auth_user_id` dans SQL** : cela pourrait perdre la propriété des profils, les permissions ou les invitations. Une procédure de rapprochement vérifiée au cas par cas devra être développée séparément.

## Sécurité et limites

- La fonction Edge authentifie la session pour `status` et `attach`, limite les tentatives, exige une identité Discord présente et une connexion récente, et stocke le mot de passe **uniquement chez Supabase Auth**.
- Aucun `service_role` ne doit apparaître dans les fichiers publics du site.
- Les comptes pseudo seuls n'ont **pas de récupération automatique du mot de passe** : prévoir des codes de secours ou un processus d'assistance fiable avant lancement public.
- L'erreur d'un compte Discord déjà utilisé est normale : il ne faut pas faire de fusion silencieuse.
- L'ancienne possibilité de se connecter par e-mail n'apparaît plus dans l'interface, mais les comptes existants ne sont pas supprimés. Vérifie le mode de connexion des propriétaires avant installation.
- **Aucun changement aux drapeaux** dans `assets/flags/` ; aucun SQL supplémentaire après la migration 42.
- Tests JavaScript locaux effectués ; **authentification Supabase réelle non testée** dans cet environnement.

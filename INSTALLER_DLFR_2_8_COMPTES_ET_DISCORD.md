# DLFR 2.8 — Photo Discord et comptes pseudo / mot de passe

**Ce patch part de la DLFR 2.7.1**, conserve les autres sections et ne contient aucun fichier `assets/flags/`. Le patch 41 de correction des Level Packs reste valable : il ne faut pas le supprimer.

## Fonctionnement

1. Depuis **Mon profil**, un utilisateur ayant **Discord lié à sa session et un profil joueur DLFR lié** peut appuyer sur **Actualiser ma photo depuis Discord**. Une confirmation précède la nouvelle autorisation OAuth. Au retour, **le même UID Supabase** est vérifié avant tout changement, puis la photo est enregistrée dans `player_profiles.avatar_url`. Le bouton n'écrase pas spontanément une image personnalisée. Si Discord ne fournit pas de photo actualisée, aucune modification n'est effectuée.
2. Un utilisateur peut **créer un compte avec uniquement un pseudo (3–24 caractères) et un mot de passe (12 caractères minimum)**, puis se connecter avec ces deux champs. Les mots de passe sont conservés et vérifiés **exclusivement par Supabase Auth**, pas par une table SQL personnalisée et pas par le navigateur. Le serveur traduit le pseudo en compte Supabase Auth grâce à `dlfr_username_accounts`, table privée.
3. Après inscription, l'utilisateur peut créer **une nouvelle fiche GD** avec son pays ou demander à la modération la liaison d'une fiche déjà existante. Aucune complétion ni permission de modération n'est attribuée automatiquement.
4. La connexion Discord et l'ancien système e-mail restent disponibles. Les permissions Supabase/RLS existantes ne changent pas.

## Installation (important : le bouton d'inscription ne doit être activé qu'à la fin)

1. Sauvegarder le site et la base Supabase. Vérifier que les migrations jusqu'à 41 sont installées.
2. Dans **Supabase SQL Editor**, exécuter `supabase/42_USERNAME_PASSWORD_ACCOUNTS.sql` (ajout des tables privées, limitation des requêtes, et fonction sécurisée de création de fiche GD pour les comptes pseudo).
3. **Déployer l'Edge Function** dans le projet Supabase. Avec la CLI Supabase authentifiée et reliée au bon projet :

   ```bash
   supabase functions deploy username-auth --no-verify-jwt
   ```

   Il faut pour cela conserver la structure `supabase/functions/username-auth/index.ts` et exécuter la commande depuis le dossier du projet. L'option `--no-verify-jwt` permet l'inscription et la connexion **avant** l'obtention d'un jeton ; le serveur applique la liste des origines autorisées et les limites de tentative.
4. Configurer les secrets **uniquement dans Supabase, jamais dans `js/config.js`** :

   - `ALLOWED_ORIGINS` : les origines autorisées séparées par une virgule, par exemple `https://TON-COMPTE.github.io,http://localhost:5500`. **Ne pas inclure `/DLFR` dans l'origine**.
   - `AUTH_RATE_PEPPER` : chaîne aléatoire de **32 caractères ou plus**, générée localement, pour hacher les identifiants de limitation.
   - Supabase fournit normalement `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` aux Edge Functions. Vérifier leur présence.

   Exemple de configuration via le tableau de bord **Supabase → Edge Functions → Secrets**. Ne jamais exposer `SUPABASE_SERVICE_ROLE_KEY` sur GitHub Pages.
5. Installer les fichiers du patch : remplacer `index.html`, `js/app.js`, `js/production-tools.js`, `css/style.css` et **ajouter** `js/username-auth.js`.
6. Après avoir testé l'Edge Function dans un projet de préproduction, ajouter à **votre** `js/config.js` :

   ```js
   // Dans l'objet window.DEMONLIST_CONFIG existant :
   enableUsernameLogin: true,
   ```

   **Ne pas remplacer** vos URL Supabase, clé publique et options Discord. Le correctif n'inclut pas `js/config.js`.
7. Recharge avec Ctrl+F5. Vérifie un compte de test (inscription, connexion, création ou revendication de fiche), un compte Discord et le rafraîchissement de sa photo.

## Points de sécurité / limites

- **Aucune récupération automatique du mot de passe** n'est possible sans adresse e-mail. Ne lance pas publiquement cette option avant d'avoir prévu une procédure sûre de récupération ou de réinitialisation manuelle par un administrateur (vérification de l'identité obligatoire). Les utilisateurs doivent être avertis de cette limitation.
- L'Edge Function génère une **adresse Auth technique en `.invalid`**, sans utiliser l'adresse d'une personne. Supabase Auth peut imposer une validation différente selon sa version : **vérifier la création d'un compte en préproduction** avant l'ouverture aux joueurs. La fonction retourne une erreur explicite si Auth refuse cette adresse.
- Les contrôles de tentative côté SQL et la restriction d'origine sont une défense de base, **pas une protection anti-bot complète**. Ajouter une validation humaine (Captcha/Turnstile) et une surveillance de l'abus avant une ouverture publique importante. L'en-tête IP peut dépendre de la configuration du proxy.
- Les anciennes fiches GD ne sont jamais revendiquées simplement parce qu'un compte porte le même pseudo ; la modération doit approuver la preuve.
- Les utilisateurs Discord existants et les staff ne sont pas migrés : ils continuent de se connecter comme avant.
- Le lien d'invitation du serveur Discord dans `js/config.js`, s'il existe, reste inchangé.

## Vérifications locales

```bash
node --check js/app.js
node --check js/production-tools.js
node --check js/username-auth.js
node --test tests/username-auth.test.cjs
```

Le SQL, les Edge Functions et OAuth Discord nécessitent un **test sur Supabase** ; ces tests locaux ne démontrent pas que le déploiement fonctionne déjà sur ta base réelle.

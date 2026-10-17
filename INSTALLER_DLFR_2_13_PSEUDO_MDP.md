# DLFR 2.13 — Inscription et connexion avec pseudo + mot de passe

Ce paquet active une fonctionnalité **déjà prévue dans ton site DLFR 2.12**, mais masquée tant que le serveur n'est pas configuré. Aucun besoin de Discord ni d'adresse e-mail personnelle pour l'inscription. Le mot de passe est géré par **Supabase Auth**, jamais stocké dans une table publique. Les comptes Discord existants ne changent pas.

## À installer dans cet ordre

**0. Sauvegarde** la base Supabase et les fichiers du site.

**1. SQL** : dans Supabase → SQL Editor, exécute `supabase/42_USERNAME_PASSWORD_ACCOUNTS.sql` si la migration 42 n'a pas encore été installée. Si tu l'as déjà exécutée avec succès, inutile de la relancer. Elle crée la table de correspondance des pseudos (privée) et la fonction de limitation des tentatives.

**2. Fonction serveur** : déploie `supabase/functions/username-auth/index.ts` dans le projet Supabase utilisé par ton site, sous le nom exact `username-auth`. Avec Supabase CLI depuis un répertoire contenant le dossier `supabase` :

```bash
supabase login
supabase link --project-ref TON_PROJECT_REF
supabase functions deploy username-auth --no-verify-jwt
```

Le drapeau `--no-verify-jwt` est obligatoire : l'utilisateur n'a pas encore de session lorsqu'il se connecte ou s'inscrit. **Le code de la fonction vérifie l'origine et applique des limites de tentative côté serveur**. Ne jamais placer la clé secrète `service_role` dans un fichier GitHub Pages.

**3. Secrets serveur** (Supabase → Edge Functions → Secrets) :

- `ALLOWED_ORIGINS` = `https://xp0nenttttttt.github.io` (ajouter éventuellement l'origine de développement, séparée par une virgule). L'origine ne contient pas `/DLFR`.
- `AUTH_RATE_PEPPER` = une valeur aléatoire de **32 caractères minimum** que tu gardes privée.
- Vérifie la présence des secrets Supabase habituels `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` dans l'environnement d'exécution de la fonction. Ces clés serveur ne doivent pas être copiées dans le navigateur.

**4. Fichiers du site** : remplace uniquement `js/app.js`, et copie `js/username-auth.js` si absent ou pour utiliser les messages d'erreur améliorés. Ne remplace **pas** `js/config.js`. Ton `index.html` actuel doit déjà charger `js/username-auth.js` **avant** `js/app.js` (c'est le cas du ZIP reçu).

**5. Activation (en dernier)** : dans ton `js/config.js` existant, à l'intérieur de `window.DEMONLIST_CONFIG = { ... }`, ajoute `enableUsernameLogin: true,` sans effacer `supabaseUrl`, `supabasePublishableKey` ou les options Discord.

Exemple de configuration *illustrative* :

```js
window.DEMONLIST_CONFIG = {
  supabaseUrl: 'TON_URL_EXISTANTE',
  supabasePublishableKey: 'TA_CLE_PUBLIQUE_EXISTANTE',
  enableDiscordOAuth: true,
  enableUsernameLogin: true
};
```

Ne copie pas cet exemple tel quel : conserve tes vraies valeurs.

**6. Navigation** : une fois publié sur GitHub Pages, recharge avec `Ctrl + F5`, ouvre **Mon espace → Se connecter / Créer un compte** (ou directement `?page=my-profile`). Tu verras deux formulaires indépendants. Un pseudo fait de 3–24 caractères (lettres/chiffres/tirets/underscores) et un mot de passe de 12 caractères minimum suffisent.

## Tester avec un compte neuf

1. Inscrire `DLFRtest_2026` et un mot de passe de test unique de 12 caractères minimum.
2. Vérifier la redirection vers **Mon profil** avec la session ouverte.
3. Se déconnecter, recharger, se reconnecter avec le pseudo et le même mot de passe (aucun e-mail à saisir).
4. Vérifier qu'un compte neuf **ne devient pas modérateur** et qu'il ne revendique pas automatiquement la fiche GD d'un joueur portant le même pseudo. La revendication reste soumise à validation.
5. Vérifier que Discord fonctionne toujours et que les clans/invitations sont inchangés.

## Limites et sécurité

- **Pas de récupération automatique du mot de passe sans e-mail**. Prévois une procédure de récupération sécurisée (ou des codes de secours) avant ouverture publique. Préviens les utilisateurs de cette limite.
- Les adresses e-mail dans Auth sont **techniques et non utilisables** ; l'utilisateur n'a rien à fournir. L'acceptation des domaines techniques par Supabase doit être testée sur ton projet : en cas d'erreur à l'inscription, relève le message de la fonction côté serveur.
- La limitation des tentatives et la restriction d'origine ne suffisent pas contre tous les abus : ajoute un CAPTCHA validé côté serveur et surveille les inscriptions avant un lancement à grande échelle.
- Ce patch ne crée aucun compte réel pendant l'installation. Aucun mot de passe ni donnée existante n'est effacé.
- Les scripts et le SQL ont été vérifiés localement ; les authentifications doivent être testées sur ton propre Supabase après déploiement.
- **Aucun fichier de `assets/flags/` n'est inclus ou remplacé.**

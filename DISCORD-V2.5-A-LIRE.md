# DemonlistFrancophone V2.5 — Discord et profils

Cette livraison reprend **V2.4.3** et conserve **les drapeaux PNG personnalisés existants** : aucun fichier de `assets/flags/` ne figure dans les archives.

## Ce qui est utilisable immédiatement sans SQL

- Dans **Mon profil** (`?demo=1&page=my-profile`) : bouton **Simuler la connexion Discord**.
- Simuler une demande de liaison au profil GD sélectionné. Elle reste **en attente** jusqu'à l'approbation par un modérateur **de démonstration**.
- Pour approuver : ouvrir **Modération**, cliquer sur **Activer la simulation modérateur**, revenir dans **Mon profil** et utiliser **Approuver en simulation**.
- Après approbation, choisir dans le formulaire **Source de l'avatar → Avatar Discord**, puis **Enregistrer mon profil**. Le profil public affiche l'avatar fictif Discord ; choisir à nouveau **Avatar personnalisé** pour retrouver l'ancien avatar.
- Toutes les actions restent dans ce navigateur. **Aucun compte Discord réel n'est contacté en démo.** Aucun niveau, record ou droit de modération réel n'est modifié.

Le nom Discord et l'avatar proposés sont **fictifs**. L'image de démonstration est le pictogramme de compte Discord hébergé sur le CDN Discord ; il faut une connexion réseau pour l'afficher.

## Installation sur le dépôt GitHub

1. Fais une sauvegarde/commit de ta version actuelle.
2. Décompresse `DLFR-V2.5-patch-GitHub.zip` et copie ses fichiers en respectant leur chemin : `index.html`, `js/app.js`, **nouveau** `js/discord-auth.js`, `css/style.css`, et ce guide.
3. **Ne remplace pas** `js/config.js`, `data/niveaux-non-battus.xlsx` ni les dossiers de drapeaux.
4. Commit puis recharge la page (Ctrl+F5). Essaie `https://<pseudo>.github.io/DLFR/?demo=1&page=my-profile`.
5. Si tu souhaites réinitialiser toute la simulation, `?demo=1&page=my-profile&reset=1` efface ses données locales ; ne le fais pas si tu veux garder tes modifications de démo.

## Activer plus tard le vrai Discord OAuth dans Supabase

Cette partie **n'est PAS active par défaut** et nécessite un projet Supabase fonctionnel (tables de base + RLS + comptes).

1. Crée une application dans le **Discord Developer Portal**. Dans **OAuth2**, ajoute comme Redirect URI **le callback Supabase**, pas directement la page GitHub : `https://<project-ref>.supabase.co/auth/v1/callback`. Recopie exactement l'URL indiquée dans **Supabase → Authentication → Sign In / Providers → Discord**.
2. Dans Supabase, active le fournisseur Discord et renseigne son **Client ID** et **Client Secret** **uniquement dans le tableau de bord Supabase**. Ne les copie jamais dans un dépôt GitHub, dans `js/config.js` ou dans un ZIP public.
3. Sous **Authentication → URL Configuration**, ajoute la destination du site : `https://<pseudo>.github.io/DLFR/` et l'URL de retour `https://<pseudo>.github.io/DLFR/?page=my-profile` à la liste des redirections autorisées. Utilise ton vrai chemin GitHub Pages et HTTPS.
4. Mets la **clé publishable Supabase** (publique) et l'URL du projet dans `js/config.js` comme pour la migration habituelle, puis active explicitement le drapeau :

```js
window.DEMONLIST_CONFIG = {
  supabaseUrl: 'https://TON_PROJET.supabase.co',
  supabasePublishableKey: 'sb_publishable_...',
  enableRegionProfiles: true,
  enableDiscordOAuth: true,
  enableDiscordIdentityLinking: false
};
```

5. Une fois activé et connecté aux tables existantes, le bouton **Se connecter avec Discord** utilise `supabase.auth.signInWithOAuth({provider:'discord',options:{redirectTo: ...}})`. Supabase gère la session ; le site n'obtient et ne conserve aucun mot de passe Discord.
6. Si tu veux **ajouter Discord à un compte Supabase déjà connecté** (au lieu de créer un second compte), active **Manual Identity Linking** dans l'authentification Supabase (fonctionnalité disponible selon la configuration), puis `enableDiscordIdentityLinking: true`. Le site utilise `supabase.auth.linkIdentity({provider:'discord'})` depuis la session déjà authentifiée. Teste soigneusement ce parcours : le fournisseur et la session doivent appartenir à la bonne personne.

### Lier sans risque le compte Discord au joueur Geometry Dash

**À ne jamais faire :** assigner `player_key` depuis un simple champ de pseudo, un ID Discord saisi manuellement, ou des propriétés envoyées par le navigateur. Cela permettrait de voler un profil GD. Les anciens pseudos ne sont pas une preuve de propriété.

**Étape serveur indispensable lors de la migration :**

- Chaque demande de liaison GD doit être reliée à l'UID **Supabase Auth** du demandeur.
- Le demandeur fournit une **preuve de contrôle du compte GD**, examinée par un administrateur ou vérifiée côté serveur selon une méthode décidée avec l'équipe.
- Après validation seulement, une **Edge Function sécurisée**, une transaction d'administration ou une autre opération serveur autorisée crée la correspondance **unique** dans `player_profile_owners(auth_user_id, player_key)`.
- Sur le navigateur, `checkSelfOwner()` lit uniquement la correspondance approuvée. Les droits de modification du profil sont imposés par **RLS** sur `player_profiles` : l'utilisateur ne peut écrire que son propre profil. **Aucune policy d'INSERT/UPDATE publique sur `player_profile_owners`**.
- Les permissions de modération et les records restent totalement indépendants de Discord. Le pseudo, l'e-mail et l'avatar ne donnent jamais de droits.

La migration illustrative `supabase/07_profil_joueur_PREPARATION_NE_PAS_EXECUTER.sql` est conservée mais **ne doit pas être exécutée sur le site public sans revue et tests**. Cette V2.5 ne change pas SQL.

### Avatar Discord ou personnalisé

- **En démo** : après la liaison fictive, le mode avatar Discord est **dynamique**, tandis que le champ `avatar_url` personnalisé reste inchangé. Le choix peut être inversé immédiatement.
- **Avec Supabase** : une fois authentifié avec Discord **et** relié à un profil GD vérifié, un bouton copie l'URL de l'avatar Discord dans le champ avatar. Clique ensuite **Enregistrer mon profil** ; tu peux aussi conserver ton URL d'avatar personnelle. **La synchronisation automatique à chaque changement de l'avatar Discord nécessitera un stockage sécurisé du choix de source et une mise à jour ultérieure**. Elle n'est pas encore active en production.
- L'avatar Discord n'est utilisé que pour l'affichage. Il ne prouve aucune identité GD ni aucun rôle.

Les permissions OAuth doivent rester minimales pour cette fonction : `identify` suffit à obtenir le nom et l'avatar Discord. N'ajoute pas l'accès aux messages, aux salons ou aux serveurs.

## Tests et limites

- Tests unitaires Node : `node --test tests/*.test.js`.
- Syntaxe : `node --check js/app.js && node --check js/discord-auth.js`.
- Le navigateur d'intégration était bloqué par les règles du conteneur (`ERR_BLOCKED_BY_ADMINISTRATOR`), donc le rendu doit encore être validé sur GitHub Pages.
- Les tests ne remplacent pas un test d'authentification et de sécurité avec **un vrai Supabase et les politiques RLS** avant tout lancement public.

## Documentation

- [Supabase — Discord OAuth](https://supabase.com/docs/guides/auth/social-login/auth-discord)
- [Supabase — Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Supabase — URL de redirection](https://supabase.com/docs/guides/auth/redirect-urls)

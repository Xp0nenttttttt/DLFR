# DLFR V3.0.2 — Créer une fiche depuis Discord

## À quoi sert ce patch ?

Un membre authentifié via Discord, mais sans fiche DLFR, voit maintenant **deux options** dans **Mon espace → Mon profil & Discord** :

1. **Je n'ai pas encore de fiche** : créer une fiche personnelle vide (pseudo Geometry Dash, pays, région française facultative). L'association à son identité Discord est immédiate, mais elle ne fournit **aucun record, point, badge ni rôle**.
2. **J'ai déjà une fiche** : demander à la modération de lui en attribuer la propriété. Cette demande reste soumise à vérification. Si un pseudo est déjà enregistré, la création est refusée.

Une seule fiche est autorisée par identité Discord. L'ancien système de fiches modérateur et le processus de revendication sont conservés.

## Installer (dans cet ordre)

**Sauvegarder la base Supabase avant toute migration.**

1. Dans **Supabase Dashboard → SQL Editor**, exécute `supabase/13_self_signup_discord.sql` (en une seule requête). Les migrations V3.0 `11_production.sql` et `12_clan_actions.sql` doivent déjà avoir été exécutées, ainsi que le schéma initial.
2. Sur GitHub Pages, remplace **uniquement** :
   - `index.html`
   - `js/app.js`
   - `js/production-tools.js`
   - `css/production.css`
3. Commit, attends le déploiement, recharge `?page=my-profile` avec **Ctrl + F5**.
4. Connecte-toi avec Discord. Si tu n'as pas de fiche liée, tu verras les deux formulaires.
5. Choisis ton **pseudo GD exact**, ton pays et ta région (si France). Clique **Créer ma fiche DLFR**.
6. La page devrait afficher ton nouvel espace personnel, sans repasser par la modération. Teste ta fiche publique puis la modification de l'avatar/biographie.

**Ne copie jamais la clé Discord secrète ni une clé Supabase `service_role` dans les fichiers GitHub.** Le JavaScript utilise toujours ta clé publique actuelle : aucune modification de `js/config.js` n'est nécessaire.

## Erreurs prévues

- **Ce pseudo existe déjà** : sélectionne le profil dans « J'ai déjà une fiche » puis soumets une preuve pour que la modération l'approuve. Il n'est jamais attribué automatiquement.
- **Ce compte possède déjà une fiche** : recharge ton profil ; chaque compte Auth ne peut avoir qu'une fiche.
- **Demande de revendication en attente** : attends son traitement avant de créer une autre fiche.
- **Connecte ton compte Discord** : le compte doit posséder une véritable identité Discord reconnue par Supabase Auth.
- **Could not find the function dlfr_create_own_player** : SQL pas installé ou cache PostgREST non actualisé ; exécute la migration et, si nécessaire, `NOTIFY pgrst, 'reload schema';` via SQL Editor.
- **Permission denied** : vérifie que la migration SQL a été exécutée avec succès et que ta session Auth est active.

## Sécurité et limites

L'unique écriture autonome du navigateur passe par la fonction SQL `dlfr_create_own_player`, qui vérifie l'identité Discord dans `auth.identities`, les doublons et l'absence de propriétaire avant les inserts transactionnels. Les écritures directes `players` et `player_profile_owners` restent sous leurs politiques RLS existantes. Aucun record ni badge n'est donné.

Les pays sont déclarés par l'utilisateur. Un pseudo Discord n'est **pas** une preuve de propriété Geometry Dash ; seules les fiches nouvelles, non utilisées, sont créées immédiatement. Les fiches historiques sont revendiquées avec l'approbation du staff.

**Tests effectués :** validation syntaxique de `app.js` et `production-tools.js`, tests Node du formulaire et des appels RPC. La fonction PostgreSQL n'a pas été exécutée sur ton instance Supabase : il faudra vérifier les permissions réelles lors de la première utilisation.

**Drapeaux :** ce patch ne contient aucun fichier `assets/flags/` ; tes PNG restent intacts.

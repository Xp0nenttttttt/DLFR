# DLFR V3.0 — Mise en production progressive (patch uniquement)

Ce patch utilise **le projet `DLFR (2).zip` envoyé le 14 octobre 2026**. Il conserve la structure existante. Il **n'inclut aucun fichier `assets/flags/`**, aucune image personnalisée et aucune clé secrète.

## Ce qui fonctionne après configuration et tests sur votre instance

- Authentification réelle via **Discord OAuth / Supabase Auth** (le module OAuth V2.5 existant est réutilisé).
- Modérateur (`editor` ou `owner`) : création de fiches joueurs **sans Discord**, attribution d'un 100 % sur un niveau, création manuelle de niveaux, actualités, profiles et achievements FR.
- Demandes de liaison entre compte Discord et fiche joueur : preuve vérifiable + approbation / refus côté SQL. Ni l'identité Discord ni le même pseudo ne suffisent à récupérer un profil.
- Soumissions réelles de records par des comptes authentifiés, avec décision serveur Rated/UNRATED lorsqu'un niveau n'existe pas.
- Badges de progression persistants, sans perte après changement de rang. Attribution manuelle de seulement trois badges de classement.
- Clans : création, invitations, candidatures, approbation, chef/officier, rôles, départ, transfert et dissolution par RPC sécurisée.
- Pages de consultation existantes : classements, NLW, profils, statistiques, actualités, historique, palmarès, vidéos de niveau déjà approuvées.

**Limites à ne pas confondre avec la mise en production** : synchronisation AREDL → tables publiques non activée ; sanctions d'Auth, délégation des modérateurs NLW et workflow complet de certaines sous-fonctions V2 restent à finaliser ; dates historiques des anciens badges non déterminables automatiquement. Aucune base réelle ni OAuth de production n'a été testé depuis cet environnement. Avant d'ouvrir au public, suivre la recette ci-dessous.

## 1. Sauvegarder avant tout

- Effectuer une sauvegarde/backup Supabase et un export des tables existantes.
- Faire un commit Git avant de copier le patch, pour pouvoir revenir en arrière sur le frontend.
- Le ZIP contient **uniquement des fichiers à ajouter/remplacer**, aucune sauvegarde du site complète.
- Si vous ne disposez pas déjà de `public.players`, `public.demons`, `public.completions`, `public.staff_roles`, etc., votre projet est neuf : **lancer d'abord `supabase/01_schema.sql` du dépôt existant**, et `supabase/03_media_profiles_v11.sql` pour les médias. Ne relancez pas `01_schema.sql` sur une installation qui le possède déjà (certaines commandes CREATE TRIGGER de V1 ne sont pas idempotentes).
- N'exécutez **pas** les anciens fichiers `04_v2_PREPARATION...`, `07_profil_joueur_PREPARATION...`, ou d'autres SQL facultatifs à l'aveugle : la V3 prend en charge ces colonnes et tables. Les migrations `11` et `12` sont à utiliser dans cet ordre.

### Vérifier les identifiants GD en double avant d'appliquer 11

```sql
select level_id,count(*) as n,array_agg(id order by id) as demon_ids
from public.demons
where level_id is not null and trim(level_id) <> ''
group by level_id having count(*)>1;
```

Si cette requête retourne des lignes, les corriger manuellement avant la migration. L'index unique créé par le patch refusera les doublons.

Vérifier aussi les complétions en double malgré des différences de majuscules :

```sql
select demon_id,lower(trim(player)) as joueur,count(*),array_agg(id) as ids
from public.completions
group by demon_id,lower(trim(player)) having count(*)>1;
```

Résoudre les collisions avant l'exécution de `11_production.sql` : le nouvel index unique est insensible à la casse pour les pseudos et bloque volontairement les doublons.

## 2. Exécuter les SQL Supabase

Dans Supabase → SQL Editor :

1. Exécuter `supabase/11_production.sql` (tables, RLS, demandes de liaison, soumissions, badges, RPC de validation, contrôle des doublons).
2. Exécuter `supabase/12_clan_actions.sql` (opérations de clan réelles, avec permissions serveur).

Les scripts sont additifs : pas de `TRUNCATE` ni de suppression des joueurs, records, clans ou images. Ils peuvent modifier des policies précédentes en les remplaçant par des règles plus strictes. Ils créent aussi des index uniques : une donnée historique incohérente peut nécessiter une correction avant l'exécution.

## 3. Activer Discord OAuth (actions obligatoires)

- Dans [Discord Developer Portal](https://discord.com/developers/applications), créer une application OAuth2 ; configurer comme Redirect URI **`https://VOTRE-PROJET.supabase.co/auth/v1/callback`** (à remplacer par l'URL exacte du projet Supabase).
- Dans Supabase → Authentication → Providers → Discord, renseigner **Client ID** et **Client Secret** (le secret reste dans Supabase).
- Dans Supabase → Authentication → URL Configuration, renseigner le `Site URL` et l'URL de redirection autorisée de GitHub Pages (par exemple `https://xp0nentttttt.github.io/DLFR/`).
- Dans votre `js/config.js` **existant**, conserver la URL et la clé publique publishable du projet et ajouter les options :

```js
window.DEMONLIST_CONFIG = {
  supabaseUrl: 'https://VOTRE-PROJET.supabase.co',
  supabasePublishableKey: 'VOTRE_CLE_PUBLIQUE',
  enableDiscordOAuth: true,
  enableDiscordIdentityLinking: false,
  enableRegionProfiles: true
};
```

Ne copiez **jamais** `service_role`, `secret key` ou Discord Client Secret dans un fichier GitHub Pages. Si vous utilisez déjà `js/config.js`, **ne le remplacez pas par ce modèle sans y reporter vos paramètres réels**.

Une fois connecté à Discord, l'utilisateur a un UUID Auth dans Supabase, **mais aucune fiche GD liée automatiquement**.

## 4. Désigner le premier modérateur

Connecter d'abord votre compte avec Discord sur le site. Relever **son UUID Auth** dans Supabase → Authentication → Users. Puis dans SQL Editor (jamais dans `js/config.js`) :

```sql
insert into public.staff_roles(auth_user_id,role)
values ('UUID_AUTH_A_REMPLACER', 'owner')
on conflict(auth_user_id) do update set role=excluded.role;
```

Seules les personnes explicitement désignées `owner` ou `editor` peuvent modifier les données de production. Ne donnez pas ce rôle à un inconnu. `helper` ne bénéficie pas des droits d'écriture V3.

## 5. Installer le patch GitHub Pages

Copier au même emplacement que dans le ZIP :

- `index.html` (remplacer)
- `js/app.js` (remplacer)
- `js/production-tools.js` (ajouter)
- `css/production.css` (ajouter)

**Ne jamais supprimer, réimporter ou remplacer `assets/flags/` : les PNG régionaux personnalisés restent intacts.** Conserver aussi `js/config.js`, l'Excel et tous les autres fichiers existants.

Après le commit et le déploiement, faire `Ctrl+F5`. Pour les vraies données, utiliser une URL **sans `?demo=1`**. Si vous avez activé le mode démo précédemment, retirer explicitement `sessionStorage['dlfr-preview-mode']` dans la console de votre navigateur, ou ouvrir une nouvelle session privée : la démo mémorise son mode dans `sessionStorage`.

## 6. Utiliser le panneau de modération

1. **Mon espace → Mon profil & Discord** : se connecter avec Discord.
2. **Mon espace → Modération** : en tant que `owner`/`editor`, le panneau « Gestion des joueurs et des records réels » apparaît.
3. **Créer une fiche joueur** : saisir pseudo GD + pays. Il n'y a **aucun compte Discord créé**. La colonne legacy `has_account=true` signifie ici « profil communautaire visible », pas « identité vérifiée » ; la véritable preuve de liaison est exclusivement `player_profile_owners`.
4. **Ajouter un niveau** dans la section Niveaux si besoin (renseigner ID GD et rang libre), puis **Attribuer une victoire** : joueur, niveau, URL de preuve facultative et date réelle facultative. Le RPC n'écrase pas une vidéo de preuve déjà renseignée.
5. **Revendiquer une fiche** : le joueur se connecte, choisit son profil et donne un lien de preuve. Le modérateur examine puis approuve/refuse. Une fois approuvé, il peut modifier sa présentation publique ; les records restent sous contrôle des modérateurs.
6. **Soumissions** : tout compte connecté peut envoyer un lien vidéo. Un modérateur vérifie et sélectionne Rated ou UNRATED si le niveau est nouveau. En cas de conflit ID GD / nom / rang, la validation s'arrête et la fiche doit être revue.
7. **Clans** : seuls les joueurs dont la liaison a été approuvée peuvent agir. Les classements restent consultables sans connexion.

### Important : les niveaux UNRATED

Ils obtiennent une position **interne réservée** (`100000000 + rang estimé`) et un champ `unrated_position`. Ceci évite de déplacer la Main List tout en permettant le classement alternatif. Pour les niveaux Rated, il faut choisir un **rang libre** : ce correctif n'insère pas automatiquement un niveau au milieu de la liste en décalant tous les autres rangs.

### Important : dates d'obtention des badges

Les badges déjà gagnés avant la migration sont importés avec date **inconnue** (`NULL`). Pour une complétion datée antérieurement à l'import, l'attribution reste historique sans date fabriquée. Pour de nouveaux records, la date de premier déblocage détecté est conservée ; elle n'est pas nécessairement la date réelle d'une victoire réalisée plus tôt.

## 7. Recette indispensable AVANT la mise en ligne publique

Tester idéalement sur un **projet Supabase de staging distinct** :

- Visiteur anonyme : consulter classements, niveaux, profils, mais **ne peut ni modifier ni publier**.
- Joueur Discord non lié : peut envoyer une soumission et demander une liaison, mais **ne peut pas s'attribuer des records ni récupérer le profil d'un autre**.
- Modérateur : crée « JoueurTest », un niveau et une complétion. Vérifier les points, le badge et l'absence de doublon après une deuxième attribution identique.
- Modérateur : examine une preuve de propriété et approuve une revendication. Vérifier qu'une deuxième revendication du même profil ou du même compte échoue.
- Joueur approuvé : peut éditer sa biographie et son avatar, pas sa position dans la liste, ses points, ni les rôles staff.
- Deux comptes joueurs liés : tester création de clan, candidature, acceptation, invitation, départ et transfert.
- Tester un niveau manuel avec ID GD déjà présent : **aucun second niveau créé**.
- Vérifier qu'un navigateur non connecté ne reçoit pas les `profile_claim_requests`, ni les sanctions, ni des données Auth privées.

## 8. AREDL : synchronisation future

Vos fichiers `tools/aredl_nlw_sync.py` et `.github/workflows/aredl-nlw-review.yml` restent en place. `aredl_import_staging` accueille ultérieurement les données à contrôler. **Ce patch n'active pas encore un cron publiant automatiquement tous les niveaux / records AREDL** : il faudra valider séparément le rapprochement `level_id`, l'origine des données et les conflits contre les fiches créées manuellement. Ne jamais injecter les données de la table d'attente directement dans les comptes authentifiés.

## 9. Tests et limitations

- `node --check js/app.js` et `node --check js/production-tools.js`.
- `node --test tests/production-tools.test.cjs` (8 tests de module avec appels Supabase simulés).
- **Non testé sur une instance Supabase réelle** : les politiques PostgreSQL et les flux OAuth/RPC doivent être vérifiés sur un environnement de staging avant production.
- L'affichage dans Chromium local était bloqué par cet environnement ; aucun test navigateur complet réel ne peut être revendiqué.

Le patch est une **première fondation de production**, pas une certification de mise en ligne de toutes les fonctions développées en mode démo. Les sanctions du compte Auth, l'administration fine NLW et la synchronisation automatique AREDL avec validation/rollback nécessiteront une étape distincte.

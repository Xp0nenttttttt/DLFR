# DemonlistFrancophone — migration HTML/CSS/JS + Supabase (V1)

**Première étape de migration**, basée sur le code PHP de l'ancien site. Reproduction visuelle de type Pointercrate, sans framework ni compilation, compatible GitHub Pages.

## Tester la démo immédiatement

Ouvrir `index.html` (ou utiliser **Live Server** dans VS Code). Tant que `js/config.js` n'a pas d'identifiants, des **données d'exemple clairement identifiées** sont utilisées. Le mode « Modération » local ne touche pas au vrai site : les modifications sont enregistrées dans `localStorage`.

Le site propose :
- Main List (rangs 1–75), Extended (76–150), Hors Top 150 et Legacy (statut historique indépendant).
- Recherche des démons, fiches des niveaux et records.
- Statistiques joueurs, profils (bannières, titres, bio), contributions, répartition des records et graphique historique s'il y a des snapshots.
- Actualités, Hall of Fame et espace modérateur.
- Formule des points reprise de `includes/functions.php` : un rang supérieur à 150 vaut 0 point. Dans la V1 connectée, les scores affichés sont recalculés à partir des records, bonus et vérifications importés ; dans la démo, les scores d'exemple sont figés pour illustrer le classement.

## Passer en mode Supabase

1. Créer **un nouveau projet Supabase**. **Ne pas toucher à la base MySQL de production.**
2. Aller dans **SQL Editor**, créer une requête et exécuter `supabase/01_schema.sql` **une seule fois**, dans ce nouveau projet. Ce n'est **pas** du SQL pour phpMyAdmin.
3. Dans **Project Settings → API Keys**, copier **Project URL** et la **publishable key** (ou l'ancienne clé `anon` si nécessaire), jamais `service_role` / `secret`.
4. Ouvrir `js/config.js`, coller les deux valeurs et enregistrer.
5. Publier le dossier sur GitHub Pages : **Settings → Pages → Deploy from a branch → main → /(root)**. Le site est immédiatement visible, mais ses tables resteront vides tant que les données ne seront pas importées.

## Récupérer les données de la vraie Demonlist

Tu possèdes déjà une sauvegarde MySQL, **conserve-la privée**. Pour importer les données :

1. Depuis phpMyAdmin, exporter **chaque table en CSV** (pas une sauvegarde SQL globale). Activer **« noms des colonnes sur la première ligne »**. Exporter d'abord `users`, `demons`, `completions`. Pour retrouver les ajouts V1/V2, exporter ensuite facultativement `news_items`, `profile_titles`, `player_profile_titles`, `player_profiles`, `player_visibility`, `hall_of_fame`, `player_stat_snapshots`, `demon_position_history`.
2. Placer les CSV sur ton ordinateur dans un dossier privé, par exemple `exports_mysql/` **à l'extérieur du dépôt GitHub**. La table `users` brute contient des informations sensibles, comme les hachages des mots de passe : **ne jamais la publier**.
3. Dans un terminal, à la racine du projet :

```bash
python tools/convert_mysql_csv.py --input-dir ../exports_mysql --output-dir imports
```

Le convertisseur n'exporte que des champs publics de joueurs : pas d'email, de mot de passe, de Discord ID ni de données de connexion.

4. Dans **Supabase → Table Editor**, ouvrir les tables et importer les fichiers produits, **dans cet ordre** : `players.csv`, `demons.csv`, `completions.csv`, puis les éventuelles tables V1/V2. **Attention :** importer sur une base Supabase neuve pour éviter doublons et conflits.
5. Exécuter `supabase/02_after_import.sql` dans SQL Editor pour rétablir les identifiants automatiques des nouvelles lignes.
6. Ouvrir le site et vérifier le nombre de joueurs, niveaux, records et les scores avant de basculer le domaine.

### Attribuer un modérateur Supabase

Cette V1 **ne migre pas automatiquement les sessions et mots de passe PHP**. Créer les comptes de connexion indépendamment dans **Supabase Authentication → Users**. Puis, après avoir vérifié l'identité et l'autorisation de chaque modérateur, exécuter dans SQL Editor :

```sql
insert into public.staff_roles(auth_user_id, role)
values ('REMPLACER_PAR_UUID_UTILISATEUR_AUTH', 'editor')
on conflict (auth_user_id) do update set role=excluded.role;
```

Les rôles `helper`, `editor`, `owner` peuvent modifier les contenus dans cette **V1 de base** ; les permissions fines par fonctionnalité sont une étape ultérieure. L'ancien champ `users.role` de MySQL est importé à titre historique seulement : il ne donne **aucun droit**.

**Sécurité :** toutes les tables applicatives ont RLS activé. Les visiteurs lisent uniquement les champs publics, les modérateurs connectés peuvent écrire, mais aucune clé secrète n'est nécessaire ni autorisée dans le JavaScript public. <https://supabase.com/docs/guides/database/postgres/row-level-security>

## Limites honnêtes de la V1

- Le design est proche des captures et de Pointercrate, mais pas encore pixel-perfect sur toutes les pages ni tous les écrans.
- Les formulaires de soumission et la gestion complète des comptes/Discord/recaptcha/commentaires/roulette/time machine de l'ancien PHP restent à migrer.
- Le classement est recalculé côté navigateur depuis les records (il faudra un calcul serveur ou une vue Supabase validée lors de la mise en production, pour les gros volumes et une concordance stricte des résultats).
- Le graphique historique ne peut pas inventer les classements passés : il attend les `player_stat_snapshots` importés ou recueillis à l'avenir.
- Les images de niveaux sont à importer ou à configurer via `thumbnail_url` ; une miniature du prototype est fournie pour l'aperçu.
- La conservation automatique de l'ancien domaine, des anciennes URL et des anciens mots de passe n'est pas incluse.
- Il faut **tester la sécurité, les calculs et tous les cas de la vraie base**, pas déployer immédiatement à la place du site de production.

## Structure

```text
index.html
css/style.css
js/config.js          # URL + clé publique uniquement
js/demo-data.js       # uniquement des exemples fictifs
js/app.js             # routes / pages / lectures Supabase / modération
supabase/01_schema.sql
supabase/02_after_import.sql
tools/convert_mysql_csv.py
assets/nullscapes.webp
```

## Sauvegardes et retour arrière

L'ancienne version PHP + MySQL reste intacte pendant le développement. Ne supprime pas les fichiers hébergés chez x10Hosting. Avant la migration définitive : sauvegarde MySQL récente, vérification de migration des records et niveaux, test de connexion et accord des propriétaires.

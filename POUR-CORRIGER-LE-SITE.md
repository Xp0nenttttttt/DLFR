# DemonlistFR — Correctif « liste vide » (11 octobre 2026)

## Ce qui s'est passé

Le fichier `js/config.js` contient maintenant la configuration du nouveau projet Supabase. Le site quitte donc automatiquement le mode **démonstration** et affiche les **données réelles**. Mais exécuter `supabase/01_schema.sql` crée seulement les tables : il ne copie **aucun niveau, joueur ni record** depuis x10Hosting/MySQL.

Une page avec « Aucun niveau dans cette catégorie » ne prouve donc pas que le site est cassé. Il faut vérifier si la table `demons` est vide ou si ses données sont inaccessibles à cause des règles RLS.

## Réparation immédiate (sans toucher à Supabase)

1. Sur GitHub, remplace **uniquement** `js/app.js` et `css/style.css` par les deux fichiers de cette version (ou téléverse le projet complet si tu préfères).
2. Attends le déploiement GitHub Pages, puis recharge avec **Ctrl + F5**.
3. Si Supabase ne fournit aucun niveau, un bandeau d'explication apparaît. Clique **Voir le site avec des données d’exemple**.
4. Le site présente alors ses niveaux de démonstration. Pour retourner à la base réelle, clique **Revenir aux données réelles**.

**La démo ne modifie aucune table Supabase.** Le choix « démo » ne s'applique qu'à l'onglet du navigateur et disparaît à la fermeture de celui-ci.

## Vérifier les données Supabase

Dans **Supabase → SQL Editor** (et PAS dans phpMyAdmin de l'ancien site), exécute **une seule** requête en lecture seule :

```sql
SELECT 'demons' AS table_name, COUNT(*) AS lignes FROM public.demons
UNION ALL SELECT 'players', COUNT(*) FROM public.players
UNION ALL SELECT 'completions', COUNT(*) FROM public.completions;
```

- Si `demons = 0` : c'est normal que la liste soit vide. Il faut encore importer les données.
- Si `demons > 0` mais la page indique toujours zéro niveau : contrôler les règles RLS (`demons_read`) et les éventuelles erreurs de la console navigateur (F12).
- Si une erreur s'affiche : noter son texte exact, **ne pas supprimer les tables**.

## Importer les vraies données plus tard

1. Depuis phpMyAdmin sur x10Hosting, exporter **séparément** les tables `users`, `demons` et `completions` au format CSV avec en-têtes.
2. Conserver les exports sur l'ordinateur : ils peuvent contenir des données privées. **Ne JAMAIS les envoyer dans un dépôt GitHub, surtout public.**
3. Lancer localement :

   `python tools/convert_mysql_csv.py --input-dir ./exports_mysql --output-dir ./imports`

4. Dans Supabase → Table Editor, importer les CSV obtenus **dans cet ordre** : `players.csv`, `demons.csv`, `completions.csv`.
5. Suivre ensuite le `README.md` pour les migrations et contrôles de points. Vérifier sur un projet de test avant toute bascule de production.

Ne jamais copier les anciens mots de passe dans Supabase. `js/config.js` doit contenir uniquement une **clé publishable**, jamais un `service_role` ou `sb_secret`.

## Contenu du correctif

- `js/app.js` : indication du nombre de niveaux, message explicite en cas de table `demons` vide, bouton démo, retour au mode réel, bouton démo aussi en cas de panne de connexion.
- `css/style.css` : mise en forme du nouveau message, compatible avec thème sombre et mobile.
- Aucune requête SQL nouvelle et **aucune modification de base de données**.

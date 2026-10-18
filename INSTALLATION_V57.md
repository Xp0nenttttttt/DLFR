# DLFR V57 — Connexion avec les anciens identifiants

**Résumé** : 67 anciens comptes détectés dans l'export MariaDB fourni. Les hashes de mots de passe sont au format bcrypt `$2y$`. La migration s'effectue à la première connexion. Les fichiers ZIP de ce correctif **ne contiennent aucun hash ni aucune adresse e-mail de l'export**.

## Avant de commencer

- Faire une sauvegarde de la base Supabase actuelle et conserver l'export de l'ancien site **hors de GitHub et hors de toute ressource publique**.
- Vérifier que les migrations 13 (comptes), 33 (historique des fusions), 42 (connexion pseudo), et 52 (demandes de fusion) sont installées.
- Éviter les nouvelles inscriptions pendant les quelques minutes entre la création de la table et la fin de l'import.
- Ne jamais insérer la clé `service_role` dans `config.js`, GitHub Pages, le code frontend ou un ticket public.

## 1 — Installer le SQL

Dans **Supabase → SQL Editor**, exécuter **`supabase/57_IMPORT_ANCIENS_COMPTES.sql`**.
Cette migration ajoute une table RLS interdite aux navigateurs et trois RPC appelables uniquement avec `service_role`.
Elle ne modifie aucun compte ou record existant. Elle ne charge **aucun** ancien hash à elle seule.

## 2 — Import PRIVÉ depuis le PC (sans envoyer le dump dans GitHub)

Prérequis : Python 3.10+. Ouvrir PowerShell dans le dossier où se trouve `tools/import_legacy_users.py`.

Tester en simulation (remplacer le chemin du SQL par celui de son PC) :

```powershell
python tools/import_legacy_users.py "C:\chemin\vers\ancien-site.sql"
```

La commande doit annoncer **67 comptes compatibles** pour cet export ; elle ne transfère rien.

Pour importer, définir les paramètres **uniquement dans ce terminal** :

```powershell
$env:SUPABASE_URL = "https://mcoaeocsthivggyspykf.supabase.co"
$secret = Read-Host "Clé service_role Supabase (saisie masquée)" -AsSecureString
$env:SUPABASE_SERVICE_ROLE_KEY = [System.Net.NetworkCredential]::new("", $secret).Password
Remove-Variable secret
python tools/import_legacy_users.py "C:\chemin\vers\ancien-site.sql" --execute
```

Écrire `IMPORTER` pour confirmer. Le script utilise l'API Supabase HTTPS par lots, avec `resolution=ignore-duplicates` : relancer l'import ne réinitialise pas les comptes déjà migrés.

Après l'import, fermer le terminal ou effacer les deux variables d'environnement :

```powershell
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
Remove-Item Env:SUPABASE_URL
```

Dans Supabase SQL Editor, vérifier **sans afficher les hashes** :

```sql
SELECT count(*) AS comptes_importes,
       count(*) FILTER (WHERE migrated_auth_user_id IS NOT NULL) AS deja_migres
FROM public.dlfr_legacy_credentials;
```

## 3 — Déployer la Edge Function

Remplacer le fichier **`supabase/functions/username-auth/index.ts`** puis exécuter depuis la racine du projet :

```powershell
npx supabase functions deploy username-auth --project-ref mcoaeocsthivggyspykf --no-verify-jwt
```

Conserver `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_RATE_PEPPER` (32 caractères minimum), et `ALLOWED_ORIGINS=https://xp0nenttttttt.github.io` dans les secrets Edge. Ne pas modifier les clés si les connexions actuelles fonctionnent déjà.

## 4 — Mettre à jour le site GitHub Pages

- Remplacer `js/app.js` par celui du correctif.
- Remplacer `js/username-auth.js` par celui du correctif. Cette version conserve également le renouvellement de session sur un `401`.
- Remplacer `index.html` pour forcer le rechargement des scripts.
- Publier puis forcer le rafraîchissement avec Ctrl+F5.

**Ne remplace pas** `assets/flags/` : ces fichiers ne sont pas dans l'archive.

## 5 — Essais conseillés

1. Essayer un ancien compte qui n'existe pas dans la nouvelle table des pseudos. Se connecter avec l'ancien mot de passe.
2. Si l'ancien mot de passe est inférieur à 12 caractères, déplier **Ancien compte : changer un mot de passe court** et définir un nouveau mot de passe, sans partager l'ancien.
3. Vérifier **Mon profil**, le statut « revendiqué », la sauvegarde du profil et les permissions attendues.
4. Se déconnecter et se reconnecter : désormais la connexion passe par Supabase Auth et non par le hash historique.
5. Tester un compte Discord/username existant pour vérifier l'absence de régression.

## Règles de sécurité / limites

- Les migrations utilisent le **vrai ancien mot de passe vérifié par bcrypt**. Aucun hash n'est envoyé au navigateur. En cas de succès, le hash historique est supprimé de la table Supabase.
- Un pseudo déjà présent dans `dlfr_username_accounts` **n'est jamais repris, fusionné ou réinitialisé**. Les comptes déjà créés sur le nouveau site conservent leur authentification actuelle. Résolution manuelle si le propriétaire veut relier son ancien compte.
- Une fiche joueur est liée automatiquement **uniquement** si son `player_key` est exactement égal à l'ancien pseudo normalisé, si elle est non revendiquée, sans conflit ni demande en attente. Sinon la migration du compte peut réussir, mais la fiche nécessitera une validation manuelle.
- Aucun rôle d'administrateur/modérateur, badge, paramètre ou permission issu de l'ancien site n'est attribué automatiquement. Les permissions Supabase actuelles sont conservées.
- Les 0 comptes bannis dans **cet export** n'ont pas d'impact ; si un autre export contient des comptes bannis, ils sont importés comme interdits à la migration.
- Les personnes ayant oublié leur ancien mot de passe devront utiliser une récupération d'identité gérée par la modération, pas un transfert basé seulement sur le pseudo.
- Les noms de l'ancien et du nouveau site ne sont pas nécessairement identiques : dans ce cas, liaison manuelle.

## Retour arrière et tests

En cas de problème, remettre la version précédente de `username-auth` et les JS précédents, sans supprimer les utilisateurs migrés. Les sessions déjà créées restent valables. Avant d'importer la base ou d'activer le site, tester une seule connexion historique avec un compte de test autorisé ; **cette archive a été validée statiquement mais n'a pas été déployée ni testée sur le vrai Supabase**.

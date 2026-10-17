# DLFR — Correctif connexion Discord → pseudo + mot de passe

## Pourquoi « Failed to fetch » ?

La console du navigateur indique :

`Request header field authorization is not allowed by Access-Control-Allow-Headers in preflight response.`

La version **2.13** de l'Edge Function `username-auth` déclarait seulement `content-type,apikey`, alors que la version **2.14** permet déjà `authorization`. Ton serveur semble donc exécuter l'ancienne fonction (ou une variante dont les en-têtes CORS sont incomplets).

Ce patch corrige également un problème distinct : le champ HTML `pattern="[A-Za-z0-9_-]{3,24}"` n'est pas valide avec les expressions régulières `v` des navigateurs récents. Il est remplacé par `pattern="(?:[A-Za-z0-9_]|-){3,24}"`.

## 1. Redéployer la fonction serveur (indispensable)

1. Copie `supabase/functions/username-auth/index.ts` de cette archive vers **le dossier de ton projet local**, en remplaçant l'ancien fichier.
2. Ouvre PowerShell dans le dossier du projet (celui qui contient `supabase/`).
3. Assure-toi d'être connecté et lié au bon projet Supabase :

```powershell
npx supabase login
npx supabase link --project-ref TON_PROJECT_REF
npx supabase functions deploy username-auth --no-verify-jwt
```

`--no-verify-jwt` est prévu pour permettre aussi l'inscription et la connexion sans session ; les actions qui modifient un compte (`status`, `attach`) vérifient bien le JWT **dans la fonction**. Ne supprime pas cette vérification.

4. Dans Supabase → Edge Functions → Secrets, assure-toi que `ALLOWED_ORIGINS` contient **exactement** `https://xp0nenttttttt.github.io` (sans `/DLFR`, pas de slash final), et que `AUTH_RATE_PEPPER` est défini (au moins 32 caractères). Ne colle aucun secret dans les fichiers publics du site.

## 2. Corriger l'expression régulière du formulaire

Si ton `js/app.js` n'a pas été modifié depuis la **2.15**, tu peux remplacer celui-ci par le fichier `js/app.js` du patch.

**Si tu as d'autres modifications après la 2.15**, NE REMPLACE PAS le fichier entier. Recherche dans ton `js/app.js` toutes les occurrences suivantes :

```html
pattern="[A-Za-z0-9_-]{3,24}"
```

et remplace-les par :

```html
pattern="(?:[A-Za-z0-9_]|-){3,24}"
```

Ainsi, la correction n'écrasera pas tes autres ajouts. Aucun changement dans `js/username-auth.js` n'est nécessaire.

## 3. Vérifier

1. Va dans ton navigateur : F12 → Réseau → coche « Désactiver le cache » pendant le test.
2. Actualise la page du profil.
3. Clique sur la requête `username-auth` avec la méthode **OPTIONS**.
4. Sa réponse doit inclure :

```text
Access-Control-Allow-Origin: https://xp0nenttttttt.github.io
Access-Control-Allow-Headers: authorization, apikey, content-type, x-client-info, x-supabase-api-version
```

5. Reconnecte-toi avec Discord si nécessaire, puis essaie d'ajouter ton pseudo et mot de passe.

Si le navigateur affiche encore un refus CORS : vérifie que tu as redéployé la fonction dans le même projet Supabase que l'URL utilisée par le site. Si la requête OPTIONS fonctionne mais le POST renvoie 401/403/503, lis uniquement le **code HTTP et le message JSON** ; ne partage pas les tokens d'authentification, mots de passe ou clés secrètes.

## Contenu du patch

- `supabase/functions/username-auth/index.ts` : fonction de la **2.14** avec CORS explicite pour les requêtes authentifiées.
- `js/app.js` : base **2.15**, trois attributs `pattern` corrigés.
- Aucun SQL, aucune donnée utilisateur, aucun asset `assets/flags/`.

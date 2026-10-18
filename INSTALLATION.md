# DLFR — Réparation de session 401 (pseudo + Discord)

## Installation

1. Vérifier que la fonction Supabase `username-auth` est bien la version CORS corrigée (`authorization` autorisé).
2. Remplacer uniquement `js/username-auth.js` sur GitHub Pages. Ne pas modifier les autres scripts, les permissions ou la base.
3. Publier, puis forcer le rechargement avec Ctrl+F5.
4. Se déconnecter du site et se reconnecter avec Discord, puis aller dans Mon profil > Mes méthodes de connexion.

Le client renouvelle désormais une seule fois une session lorsque la fonction répond HTTP 401, puis retente la requête. Si la nouvelle session est elle aussi refusée, le problème se situe côté validation serveur ; il faut regarder les logs Supabase Edge Functions > username-auth. Ne partage jamais le jeton Authorization ni ton mot de passe.

## Test rapide

DevTools > Réseau > username-auth : vérifier le statut de la requête POST (pas celui de OPTIONS). Une réponse 200 pour `action=status` confirme que le compte est authentifié. Le bouton pour associer le pseudo utilise `action=attach`.

Si la réponse POST reste 401 après une nouvelle connexion Discord, ce correctif ne résout pas la validation JWT côté serveur : dans Supabase Edge Functions > username-auth > Logs, relever le nom/code de l'erreur d'authentification **sans aucun secret**.

Aucune migration SQL. Aucun fichier `assets/flags/` inclus.

# DLFR — Correctif affichage + connexion modérateur (14 octobre 2026)

Ce patch a été créé depuis l’archive `DLFR (4).zip` fournie.

## Installation

1. Conserve une sauvegarde/commit de la version actuellement déployée.
2. À la racine de ton dépôt GitHub Pages, remplace exactement ces trois fichiers par ceux de cette archive :
   - `index.html`
   - `js/app.js`
   - `js/unrated-stats.js`
3. Laisse GitHub Pages terminer son déploiement puis fais Ctrl+F5 (ou ouvre le site dans une fenêtre privée).
4. Ouvre d’abord `?page=stats`, puis `?page=admin` sur un compte Discord connecté.

## Corrections

- Classements, menus de modération et calcul UNRATED : les tris tolèrent les noms `display_name` manquants (fréquents après l’import historique), en repliant vers `username` puis `player_key`.
- La comparaison des dates d’historique a aussi une protection contre les valeurs absentes.
- Si une session Discord est active mais que le rôle modérateur manque, l’onglet Modération explique la situation au lieu d’afficher un formulaire email.
- Le bouton « Actualiser mes droits » refait une vérification côté Supabase, sans attribuer de rôle ni contourner RLS.
- Si aucune session n’est active, la connexion Discord est proposée avec l’email en méthode alternative.

## À vérifier pour ton ami

Dans Supabase > Authentication > Users, récupère l’UID de son compte Discord.
Dans `public.staff_roles`, la ligne correspondante doit avoir `auth_user_id` égal à cet UID et `role = 'editor'`.
Sur la DLFR, qu’il se connecte avec Discord puis clique sur « Actualiser mes droits ».
L’annuaire « Éditeurs de liste » vient de la fonction Supabase `dlfr_public_staff_directory` (migration 21), pas directement du navigateur. Si son nom manque encore, vérifie que cette migration est installée.

## Ce que le patch NE fait PAS

- Il ne modifie aucune table Supabase, aucun rôle ni aucun mot de passe.
- Il n’inclut **aucun** fichier `assets/flags/` et ne touche pas aux drapeaux régionaux personnalisés.
- Il n’inclut ni ne modifie `js/config.js` ni les clés Supabase.
- Il ne répare pas un rôle réellement absent : l’attribution doit être faite par le propriétaire depuis l’interface de gestion des modérateurs.

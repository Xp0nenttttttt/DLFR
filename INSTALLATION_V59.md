# DemonlistFrancophone — V59 : Mes soumissions

## Objectif

Permet à **chaque joueur connecté** de retrouver ses propres soumissions de niveaux/records, et leur état de validation : **En attente**, **Acceptée**, **Refusée**. Historique basé sur la table Supabase **level_submissions** (pas un fichier local, pas un système de modération parallèle).

## Installation

Ce patch est basé sur la **V58** (boutons Discord / YouTube, actualités, directives, Legacy masquée).

1. Conserver une copie des fichiers publiés (au minimum `js/app.js` et `index.html`).
2. Sur GitHub Pages, remplacer :
   - `js/app.js`
   - `index.html`
3. Ajouter `css/v59-soumissions.css`.
4. Publier et recharger avec `Ctrl + F5`.

**Aucun SQL supplémentaire** n'est nécessaire si les migrations des soumissions sont déjà installées (en particulier V11/V31/V46/V47). Les statuts proviennent des décisions existantes.

**Ne pas modifier `assets/flags/`** : aucun de ces fichiers n'est inclus.

## Où est le suivi ?

- Navigation : **Mon espace → Mes soumissions**.
- **Mon profil** : encart de suivi, également affiché lorsqu'un utilisateur a un compte connecté mais pas encore de fiche joueur associée.
- **Soumettre un record** : lien vers le suivi sous le formulaire.

Fonctionnalités : liste récente d'abord, compteurs, filtres Toutes/En attente/Acceptées/Refusées, recherche par niveau/ID, vidéo de preuve, dates d'envoi et de traitement, lien vers la fiche publique lorsqu'elle existe, bouton **Actualiser**.

L'historique suit le **compte Supabase (`auth_user_id`)**, pas le pseudo du joueur : changer de pseudo ou relier une nouvelle fiche ne doit pas attribuer les soumissions d'autrui. Supabase applique déjà des règles RLS, le front filtre aussi sur l'identifiant Auth. Les visiteurs non connectés ne voient aucun historique.

La table actuelle ne stocke pas de motif de refus, donc le panneau **n'invente pas de commentaire de modération**. Une soumission approuvée peut encore attendre la publication d'une fiche de niveau.

## Vérifications effectuées

- Syntaxe JavaScript (`node --check`).
- Tests unitaires locaux de filtrage par propriétaire, statuts, recherche, échappement des données et déconnexion.
- Aperçus Chromium desktop (1200 px) et mobile (375 px) sans débordement horizontal.

**À valider sur le vrai Supabase** : se connecter avec un compte ayant une soumission en attente, une acceptée et une refusée ; vérifier le bon état avant et après **Actualiser**. Le rendu et les tests locaux ne remplacent pas ce test réel.

## Attention aux versions

Si les fichiers GitHub ont été modifiés après la V58, fusionner les changements de V59 au lieu d'écraser d'éventuels ajouts récents.

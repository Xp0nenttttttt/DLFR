# DemonlistFrancophone V1.1 — utilisation

## Tester sans Supabase

Ouvrir `index.html` dans le navigateur. Cliquer sur **Modération** > **Activer la simulation modérateur**.

### Publier une actualité avec média

- Le formulaire permet d'ajouter une image via une URL ou de sélectionner un fichier JPG/PNG/WebP/GIF (en mode démo, 650 Ko max pour pouvoir l'enregistrer localement).
- Un lien YouTube `youtu.be`, `youtube.com/watch`, `shorts` ou un lien direct `.mp4` / `.webm` permet d'afficher la vidéo dans l'actualité. Un lien vidéo vers une autre plateforme reste accessible comme lien cliquable.
- On peut mettre **une image ET une vidéo** dans une même actualité.
- En vrai Supabase, le fichier image est téléversé dans le bucket public `demonlist-news` après validation du rôle modérateur, 5 Mo max. Les vidéos sont hébergées ailleurs et **ne sont pas envoyées à Supabase**.

### Profils

Dans **Modération** > **Personnaliser un profil** : choisir le joueur, renseigner avatar, bannière, bio, année de début, niveau favori, objectif, liens et accomplissements, puis enregistrer.

### Badges Legacy

Dans la catégorie **Hors Top 150** ou **Legacy List**, un niveau avec une position supérieure à 150 et `legacy=true` porte deux badges : **Hors Top 150 · 0 pt** et **Legacy**. Il n'est pas compté pour les points.

## Mettre à jour un GitHub Pages / Supabase V1 existant

1. **Sauvegarder** le dépôt et la base Supabase avant toute mise à jour.
2. Dans **Supabase > SQL Editor**, exécuter `supabase/03_media_profiles_v11.sql` sur ton **projet Supabase**, **jamais dans phpMyAdmin MySQL**. Ce script ajoute les colonnes et configure le bucket `demonlist-news`, puis sa policy d'upload pour les rôles staff.
3. Sur GitHub, remplacer `index.html`, le dossier `css` et le dossier `js`, **sans écraser `js/config.js` s'il contient déjà les paramètres du nouveau projet**.
4. Pour une installation Supabase neuve, exécuter `01_schema.sql` puis `03_media_profiles_v11.sql`, et suivre le `DEMARRAGE-RAPIDE.md` pour les données.
5. Vérifier avec un compte modérateur habilité par `staff_roles` : insertion d'une actualité simple, ajout d'une image, affichage de la vidéo et édition de profil.

Cette V1.1 ne remplace pas encore le site PHP et ne transfère pas les données MySQL existantes. Conserver l'ancien site actif le temps des tests.

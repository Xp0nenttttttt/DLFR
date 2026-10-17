# DLFR 2.7 — Cadres de profils, Level Packs et bouton Discord

Ce patch **complète la DLFR 2.6** ; il conserve les interfaces existantes, la NLW, les classements, les records et la modération. Il n'inclut **aucun fichier `assets/flags/`**.

## Installation (dans cet ordre)

1. Sauvegarder la base Supabase, ainsi que `index.html`, `css/style.css` et `js/app.js`.
2. Dans Supabase → SQL Editor, exécuter `supabase/40_CADRES_DISCORD_LEVEL_PACKS.sql` **après les migrations 35 et 39**. Le script crée trois tables et trois fonctions RPC ; il n'attribue aucune récompense au déploiement.
3. Remplacer `index.html`, `css/style.css`, `js/app.js` par ceux du ZIP et ajouter `js/level-packs.js`.
4. Configurer le bouton Discord dans **ton** fichier `js/config.js`, en ajoutant `discordInviteUrl` à `window.DEMONLIST_CONFIG` (ne pas remplacer les URL et clés Supabase déjà présentes). Par exemple :

```js
window.DEMONLIST_CONFIG = {
  // ... tes paramètres existants,
  discordInviteUrl: 'https://discord.gg/TON_INVITATION'
};
```

Utiliser uniquement l'URL **réelle** du serveur. Le bouton reste masqué tant que le lien n'est pas correctement configuré ; les domaines acceptés sont `discord.gg` et `discord.com/invite/`.
5. Rafraîchir la page (Ctrl+F5). Vérifier `?page=packs`, `?page=my-profile` et **Modération → Level Packs**.

## Fonctionnement

- **Cadres** : personnalisation dans *Mon profil → Cadre de profil* ; chaque badge acquis débloque un cadre de sa rareté. Les exploits `fr_achievements` et distinctions `hall_of_fame` débloquent aussi leurs cadres. Un pack avec récompense de type *Badge* donne un cadre supplémentaire après réclamation.
- **Packs** : 2 à 30 niveaux publics Rated, créés en modération, avec nom, description, bannière et récompense. Un modo NLW est limité aux packs contenant uniquement des niveaux NLW.
- **Récompenses** : une fois tous les niveaux terminés avec un record validé à 100 %, le joueur connecté clique **Réclamer ma récompense**. Cette action est vérifiée côté Supabase ; les packs de type *Tag / titre* attribuent un titre officiel, ceux de type *Badge* attribuent une distinction visible sur le profil et un cadre déblocable.
- Les records importés doivent correspondre au `player_key` du joueur ; si un joueur a plusieurs anciens pseudos, les rapprocher avant de réclamer sa récompense.
- Les packs déjà réclamés gardent leurs niveaux et type de récompense verrouillés ; leur titre, description, bannière et visibilité peuvent toujours évoluer.
- Les titres, badges et cadres existants restent inchangés.

## Vérifications

`node --check js/app.js`, `node --check js/level-packs.js`, puis `node --test tests/level-packs.test.cjs`.

Le JavaScript a été vérifié localement. **La migration et les règles RLS ne peuvent pas être testées sur ta vraie base Supabase depuis ici** : effectuer une première installation et un test de claim sur une copie de la base, si possible.

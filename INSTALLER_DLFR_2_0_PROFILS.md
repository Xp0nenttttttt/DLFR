# DLFR 2.0 — Profils communautaires (lot 1)

Ce patch se superpose au **dernier ZIP DLFRRR.zip fourni**, en conservant aussi les écrans **Fusion et Vérificateurs** du dernier patch `DLFR_fusion_et_verificateurs.zip` (fichier `js/app.js` de ce patch utilisé comme base).

## Installation, dans cet ordre

1. **Sauvegarde** les fichiers de ton site et la base Supabase.
2. Depuis Supabase > SQL Editor, exécute **`supabase/35_PROFILS_COMMUNAUTE.sql`** **une seule fois** (le script est idempotent pour la création des objets, mais inutile de le répéter). Les migrations précédentes du site doivent déjà être en place.
3. Mets sur ton hébergement les fichiers `index.html`, `css/style.css`, `js/app.js`, `js/badge-system.js` et le **nouveau** `js/profile-community.js`, en respectant leurs dossiers.
4. Recharge le site avec Ctrl+F5. Les paramètres des scripts ont été changés pour forcer l'actualisation du cache.
5. Connecte-toi avec un compte dont la fiche DLFR est **liée et approuvée**. Dans **Mon espace → Mon profil** : choisis une couleur, un titre attribué, jusqu'à trois badges possédés, jusqu'à trois niveaux avec légendes et vidéos HTTPS ; puis enregistre.
6. Ouvre ta fiche publique dans **Classements → Statistiques des joueurs**. Un autre compte lié peut utiliser **Suivre** ; le bouton permet ensuite de se désabonner.

## Fonctions incluses

- Présentation : avatars, bannières, bio et liens déjà existants, **conservés** ; ajout d'une **couleur d'accent individuelle**.
- **Titre mis en avant** : seulement parmi les titres déjà accordés via modération.
- **Badges favoris** : maximum trois, uniquement parmi les badges réellement attribués.
- **Vitrine** : trois emplacements, niveau public + légende 180 caractères + URL vidéo HTTPS facultative.
- **Abonnements** : suivre / ne plus suivre un joueur ; compte et fiche liés obligatoires ; compteurs publics.
- Droits côté PostgreSQL (RLS et RPC protégée). Aucune modification de points, complétions, NLW ou rang AREDL.

## Notes importantes

- Si le SQL n'est pas encore exécuté, le reste du site reste accessible ; les sections communautaires s'affichent seulement après installation.
- Ce lot ne comprend **pas encore** de fil d'actualité, de commentaires ou de notifications.
- Les URL des images et vidéos demeurent des liens externes, comme dans le profil actuel ; il n'y a pas d'upload intégré pour les bannières.
- Les données sont publiques : seuls les éléments choisis sont affichés sur la fiche publique.
- Les fusions de joueurs existantes conservent leur comportement : une fusion future n'importe **pas encore** automatiquement les vitrines et abonnements de la fiche source. À prendre en compte avant de fusionner un profil récemment personnalisé.
- Aucun élément de `assets/flags/` n'est inclus ou modifié.
- Pour revenir aux anciens fichiers, réinstalle l'ancienne copie `index.html`, `css/style.css`, `js/app.js` et `js/badge-system.js`. Les nouvelles tables Supabase restent en place, mais ne perturbent pas l'ancien site.

## Vérifications

Syntaxe `node --check` validée pour tous les JavaScript livrés ; test `tests/profile-community.test.js` validé.
Les autres tests historiques du ZIP original comportent encore des assertions anciennes (références à une version d'`app.js` V3.0.11, import AREDL désactivé dans le site actuel, etc.). Ils n'ont pas tous réussi ; ne pas les considérer comme des tests de régression de ce patch.
La migration PostgreSQL et les interactions Supabase n'ont pas pu être testées sur ta base en production. Préfère un test avec une sauvegarde/copie de la base.

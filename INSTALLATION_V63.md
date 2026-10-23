# DLFR V63 — Les modérateurs classiques peuvent créer des UNRATED

**Base du patch : V62** (V60 + V61 + correctifs d'authentification de la V62 conservés).

## Constat

Avant ce patch, V60 bloquait la création UNRATED pour les modos classiques. Seuls les propriétaires/supermodos disposaient de cette option dans leur éditeur complet.

## Installation

1. **Sauvegarde** le dépôt et la base Supabase avant de changer les permissions.
2. Supabase → SQL Editor : exécuter **`supabase/63_CREATION_UNRATED_MODOS.sql`** (après V60).
3. Sur GitHub Pages, remplacer uniquement **`js/app.js`** et **`index.html`**.
4. Publier, puis faire `Ctrl + F5`.
5. Avec un compte **modérateur classique**, ouvrir **Modération → Niveaux → Ajouter un niveau**, cocher **« Publier comme niveau UNRATED »** puis choisir un **rang UNRATED estimé libre**.

**Ne pas remplacer les autres fichiers** : `js/username-auth.js`, la fonction Edge `username-auth`, les styles existants, et surtout `assets/flags/`, restent inchangés.

## Permissions exactes

| Rôle | Créer UNRATED | Modifier UNRATED | Rated |
| --- | --- | --- | --- |
| Modérateur classique (`moderator`) | Oui (nouvelle fonction V63) | Non, toujours supermodo | Top 150 + NLW : V60 inchangée |
| Modérateur NLW (`nlw`) | Non | Non | NLW uniquement : V60 inchangée |
| Propriétaire / supermodo | Oui (ancien éditeur complet) | Oui (ancien éditeur complet) | Éditeur complet inchangé |
| Joueur ordinaire | Non | Non | Aucun droit |

Les UNRATED sont stockés séparément : `unrated=true`, `unrated_position=rang`, `position=100000000+rang`. **Ils ne décalent pas les classements Rated.** Un rang UNRATED occupé provoque un refus : le modérateur doit en choisir un autre. Une fiche déjà présente, même masquée, ne peut pas être recréée ; publication d'imports masqués et opérations de transfert restent aux supermodos.

## Tests conseillés (sur une fiche de test)

1. Modo classique : créer un UNRATED à un rang estimé libre, vérifier son apparition dans les statistiques UNRATED et dans le mode UNRATED.
2. Modo classique : créer ensuite un niveau Rated, vérifier que l'ancienne méthode marche toujours.
3. Modo NLW : vérifier que la case UNRATED n'apparaît pas et que la fonction SQL refuse son rôle, y compris si elle est appelée directement.
4. Vérifier le classement Rated avant/après création : ses positions et points ne doivent pas être modifiés.
5. Si une erreur « function not found » apparaît, exécuter `NOTIFY pgrst, 'reload schema';` dans SQL Editor.

Vérifications locales : syntaxe JavaScript, contrôle statique des rôles, des champs UNRATED et de la préservation des fichiers V62. **La fonction SQL n'a pas été exécutée sur la base de production.**

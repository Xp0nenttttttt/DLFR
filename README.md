# DemonlistFrancophone (DLFR)

Site statique (HTML / CSS / JavaScript, sans serveur) publié avec **GitHub Pages**, données dans **Supabase**.

## Déployer une modification

1. Modifier les fichiers.
2. Envoyer sur la branche `main` du dépôt GitHub (`git add -A && git commit -m "…" && git push`).
3. GitHub Pages republie le site en 1 à 2 minutes.

Quand un fichier JS ou CSS change, augmenter son numéro `?v=…` dans `index.html`, sinon les visiteurs gardent l'ancienne version en cache.

## Structure

| Dossier / fichier | Rôle |
|---|---|
| `index.html` | Page unique du site : charge tous les CSS et JS. |
| `js/config.js` | Adresse du projet Supabase + clé publique (anon). |
| `js/app.js` | Cœur du site : navigation, pages, classement, profils, modération. |
| `js/v118-cards-lab.js` | Jeu DLFR Cards (mode Aventure, boosters, chapitres, catalogue des cartes pour l'équipe). |
| `js/v127-cards.js` | Page « Collection » des cartes. |
| `js/v139-advent.js`, `js/v160-season.js` | Calendrier de l'Avent, boss communautaire et saison. |
| `js/v145-site-texts.js` | Édition des textes du site par les propriétaires. |
| `js/badge-system.js` | Badges des profils. |
| `css/` | Styles (un fichier par version de fonctionnalité). |
| `assets/` | Logo, drapeaux, images de thème. |
| `data/niveaux-non-battus.xlsx` | Fichier téléchargeable depuis la page « Non vérifiés ». |
| `supabase/functions/username-auth/` | Fonction Supabase (Edge Function) de connexion par pseudo. |
| `supabase/historique/` | Archives SQL des dernières évolutions de la base (déjà appliquées, pour référence). |
| `tools/snapshot_ranks.py` + `.github/workflows/daily-snapshots.yml` | Instantané quotidien du classement (tâche GitHub Actions, 4h23 UTC). |

## Supabase

- Projet : `mcoaeocsthivggyspykf`.
- La sécurité repose sur les règles RLS et les fonctions `security definer` de la base : la clé publique de `js/config.js` peut rester visible.
- La tâche quotidienne `daily-snapshots` a besoin de deux secrets GitHub Actions : `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` (Settings → Secrets and variables → Actions). Ne jamais mettre la clé `service_role` dans le site.
- Les rôles de l'équipe (propriétaire, modération, NLW) sont gérés dans la base, depuis l'onglet Modération du site.
- Plan gratuit : 5 Go de trafic sortant par mois. Les images envoyées depuis le site sont réduites automatiquement avant l'envoi (WebP).

## DLFR Cards

Onglet **⚙ Gestion** (propriétaires, supermodérateurs et rôle « Gestion Cards ») : donner le rôle (propriétaires seulement), revenir à une copie quotidienne de la partie d'un joueur (14 jours) ou la remettre à zéro, modifier les probabilités des boosters et des finitions, créer des événements (packs offerts). Tout est inscrit dans le journal.


Depuis la V178 : onglet **Combats** (100 étapes contre des équipes générées, défi du jour), **Prestige** du joueur (10 paliers puis Prestige MAX), **Prestige de carte** (une carte ★10 repart à ★0 et gagne un palier), finitions visibles dans la vitrine. L'export / import de sauvegarde a été retiré.

Jeu solo : pas de classement ni d'échanges. Les cartes et collections se gèrent depuis l'onglet « Catalogue » de DLFR Cards (réservé à l'équipe). Une collection « en préparation » est invisible pour les joueurs.

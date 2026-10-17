# DLFR 2.4 — Fiches joueurs séparées et pays modifiable

Cette livraison est **un patch incrémental** sur DLFR 2.3, pas une archive complète. Tes drapeaux personnalisés ne sont pas inclus : ne remplace jamais `assets/flags/`.

## À installer

1. Fais une sauvegarde de Supabase et de ton site.
2. Exécute `supabase/37_PROFILS_PAYS_MODIFIABLE.sql` dans le SQL Editor Supabase (après les migrations 11, 13 et 35).
3. Mets à jour `index.html`, `css/style.css`, `js/app.js`, `js/level-cinema.js` depuis cette archive.
4. Publie les fichiers puis recharge avec **Ctrl + F5**.

## Essai guidé

- Ouvre **Classements → Profils des joueurs** (`?page=players`) et recherche un pseudo.
- Ouvre `?page=player&player=<clé_du_joueur>` : la fiche a sa propre adresse et retrouve la vitrine/badges/records existants.
- Ouvre **Statistiques** : les classements restent, mais plus de grande fiche injectée à droite ; chaque joueur conduit à sa propre page.
- Ouvre **Mon espace → Personnaliser mon profil** : change le pays et enregistre. Pour la France, la région s'affiche et peut être modifiée ; hors France, la région est effacée.
- Teste depuis deux comptes différents : chaque propriétaire ne doit pouvoir modifier que son propre pays. La migration vérifie le `auth.uid()` connecté et la table `player_profile_owners` ; aucune écriture directe sur `players` n'est accordée au navigateur.

## Notes

- Les anciens liens `?page=stats&player=…` redirigent dans le navigateur vers le nouveau profil.
- Le pays influence les classements géographiques après actualisation ; aucun record ni point n'est déplacé.
- Les images de drapeaux sont réutilisées via `js/geo.js`, sans livrer ni écraser `assets/flags/`.
- Le SQL n'a pas pu être exécuté sur ta base Supabase réelle : effectue le test en environnement de sauvegarde avant publication.
- Les champs de présentation sont sauvegardés dans `player_profiles`, et le pays via un RPC dédié. En cas d'erreur réseau entre ces appels, certaines données de présentation peuvent avoir été sauvées malgré l'échec du pays ; revérifie après rechargement.

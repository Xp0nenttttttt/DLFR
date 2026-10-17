# Regrouper les rangs NLW et revendiquer une vérification

## Installation

1. Copie les fichiers de cette archive à la racine du site et publie-les sur GitHub. Ce patch conserve l'import groupé AREDL ajouté précédemment et contient ses fichiers pour compatibilité.
2. Dans Supabase → SQL Editor, exécute **supabase/45_RANGS_NLW_ET_REVENDICATIONS.sql**. Les migrations existantes de ton site, notamment 26 et 34, doivent être installées. Si tu n'avais pas installé l'import AREDL précédent, sa migration 44 et sa notice sont aussi incluses.
3. Recharge le site avec **Ctrl+F5**.

L'installation seule ne change aucun rang et ne valide aucune demande. Aucun fichier `assets/flags/` n'est inclus.

## Combler les trous

Dans **Modération → Niveaux → NLW et imports**, ouvre **Combler les trous de la NLW**.

- Clique sur **Voir les nouveaux rangs**.
- Vérifie le tableau, puis clique sur **Appliquer tous les rangs**.

L'ordre relatif des niveaux reste identique. Les rangs NLW deviennent 1, 2, 3… : si Kappa #90 suit le #13, Kappa devient #14. Les positions globales correspondantes sont 151, 152, 153…

Le Top 150 ne bouge pas. Les niveaux masqués, Legacy et UNRATED ne sont pas ajoutés à la NLW. Si une fiche masquée ou Legacy occupe une position nécessaire, elle est rangée dans une position technique libre, sans changer son statut. Les records restent liés aux mêmes niveaux. Les points NLW sont recalculés à partir des nouveaux rangs.

L'opération est réservée aux propriétaires et supermodérateurs (y compris le rôle historique editor). Le tableau et le journal conservent les anciens/nouveaux rangs. Un aperçu devenu périmé est refusé.

## Revendiquer une vérification

Le joueur ouvre la fiche du niveau → **Tu as vérifié ce niveau ? → Revendiquer la vérification**.

Il doit être connecté avec une fiche joueur liée à son compte. Il fournit sa vidéo et, s'il le souhaite, des explications. Le pseudo n'est pas librement modifiable : le serveur utilise sa fiche liée.

La demande et son état sont visibles sur cette même fiche : en attente, acceptée ou refusée, avec la réponse de la modération. Une seule demande en attente est permise par joueur et niveau. Une demande refusée peut être renvoyée avec de nouvelles preuves.

## Décision des modérateurs

- Propriétaire/supermodérateur : **Modération → Demandes → Demandes de vérification**.
- Modérateur classique : panneau des demandes de vérification dans son espace de modération.
- Modérateur NLW : uniquement les demandes de son périmètre NLW.

Le panneau présente le demandeur, sa preuve, ses explications et le vérificateur actuel. Un motif est obligatoire pour refuser.

En acceptant :

1. Le demandeur devient le vérificateur lié à sa fiche joueur ; sa vidéo devient la vidéo de vérification.
2. Si un autre vérificateur était indiqué, il reçoit/conserve une victoire à **100 %** sur ce niveau. Aucun record supplémentaire n'est créé s'il en existe déjà un.
3. Une progression partielle de l'ancien joueur est convertie à 100 % avec son ancienne vidéo de vérification ; la version précédente du record est conservée dans l'historique de la demande. Une victoire déjà à 100 % garde sa preuve existante.
4. Si l'ancien joueur n'a pas de fiche, une fiche historique sans compte est créée. Les crédits « À renseigner » ne deviennent jamais des joueurs.
5. Si le rapprochement est ambigu, le modo sélectionne l'ancienne fiche dans le menu avant de valider. Un identifiant joueur déjà lié reste prioritaire.

Refuser ne change ni le niveau ni ses records. Les décisions sont enregistrées dans le journal. Si le vérificateur a changé entre l'affichage et la décision, une actualisation est exigée. Le remplacement et la conservation de la victoire sont effectués dans la même transaction.

## Vérifications

La migration a été exécutée sur une base PostgreSQL embarquée de test : compactage #90 → #14, conservation du Top 150, collision avec fiche masquée, aperçu périmé, autorisations, confidentialité des demandes, acceptation/refus, conservation de la vidéo et de la victoire, absence de doublons, progression partielle et création de fiche historique. Les nouveaux écrans ont des tests d'échappement HTML et de filtrage des actions.

Aucune modification n'a été appliquée à ta base Supabase depuis cette session.

# DLFR 2.12 — Clans, classement NLW et badges manuels

Patch réalisé à partir de la DLFR 2.11, **sans toucher aux autres fichiers, niveaux ou drapeaux**.

## Installation

1. Sauvegarder les fichiers actuellement publiés et la base Supabase.
2. Exécuter `supabase/50_CLANS_INVITATIONS_FIABLES.sql` depuis Supabase → SQL Editor. Cette migration crée deux fonctions de consultation sécurisées ; elle ne modifie aucune ligne existante.
3. Remplacer **uniquement** `js/app.js` et `css/style.css` par ceux de l'archive.
4. Publier sur GitHub Pages, actualiser avec `Ctrl + F5`.

## Clans

- Les invitations reçues apparaissent sur le classement des clans **et** sur la fiche d'un clan.
- Un bouton **Actualiser** permet de récupérer les invitations arrivées après l'ouverture de la page.
- Les chefs/officiers invitent seulement les profils qui ont réellement relié leur compte DLFR et qui ne sont pas déjà membres.
- **Accepter / Refuser** continue de passer par la fonction existante `dlfr_clan_action`, qui contrôle les droits côté serveur.
- Le pseudo affiché ne suffit jamais à prouver l'identité d'un joueur.

## Classement NLW

L'onglet `Statistiques → Classement NLW` reprend l'ergonomie du classement principal : pays, région, recherche, liste sélectionnable et aperçu du profil. Les points NLW restent distincts des points Top 150.

## Badges manuels

`Modération → Badges & Palmarès` retrouve **Attribuer un badge manuel**, réservé aux supermodos/propriétaires, avec les trois distinctions autorisées : `goat-pays`, `goat-region` et `clash-clans`. Les badges de progression restent automatiques et aucune attribution existante n'est modifiée.

## Tests conseillés

1. Avec le compte d'un chef, inviter un autre compte lié. Vérifier que la liste d'invitables ne contient pas de comptes déjà membres.
2. Avec le destinataire, ouvrir `Communauté → Clans`, vérifier la boîte d'invitations, puis ouvrir une fiche de clan : l'invitation doit rester visible.
3. Accepter l'invitation et vérifier l'apparition du membre. Refaire le test en refusant une invitation distincte.
4. Depuis un compte propriétaire, attribuer un badge manuel à un joueur qui ne le possède pas déjà. Vérifier sa fiche publique.
5. Dans `Statistiques → Classement NLW`, chercher un joueur et vérifier que son aperçu s'affiche.

## Limites

- Les fonctions SQL n'ont pas été exécutées sur votre base réelle ; réalisez ces tests de bout en bout après la sauvegarde.
- Les invitations ne constituent **pas** des notifications push : il faut actualiser la page (ou cliquer « Actualiser »).
- Si l'ancienne fonction `dlfr_clan_action` n'est pas installée ou échoue, ce patch ne peut pas réparer ses erreurs automatiquement. Vérifier `supabase/12_clan_actions.sql` et transmettre le message exact en cas de problème.
- Ne pas appliquer si `js/app.js` a été modifié depuis la DLFR 2.11 sans fusionner les changements.
- Aucun fichier dans `assets/flags/` n'est inclus ni modifié.

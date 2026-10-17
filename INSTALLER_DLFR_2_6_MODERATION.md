# DLFR 2.6 — Nettoyage de la modération

Ce correctif se pose **sur la DLFR 2.5.1** (aperçu des profils dans Statistiques).
Il ne modifie pas les fichiers personnalisés du dossier `assets/flags/`.

## Installation

1. **Sauvegarder Supabase et les fichiers du site.** La suppression d'un niveau est définitive.
2. Exécuter **`supabase/39_MODERATION_NETTOYAGE_APERCUS.sql`** dans le SQL Editor Supabase, après les migrations déjà installées.
3. Remplacer **`js/app.js`**, **`js/production-tools.js`** et **`css/style.css`** par ceux du ZIP.
4. Déployer sur GitHub Pages et faire **Ctrl + F5**.

## Nouveautés

### 1. Retrait du formulaire « Attribuer une victoire »

Le formulaire de création directe des victoires n'apparaît plus dans la section de modération. La validation de soumissions et les records existants sont conservés. **Attention :** la migration ne révoque pas un éventuel ancien RPC `dlfr_assign_completion` ; elle supprime seulement son accès depuis ce panneau.

### 2. Suppression des niveaux masqués (propriétaire)

Aller dans **Modération → Niveaux → Retirer / restaurer**, puis « Supprimer définitivement une fiche masquée ».

- Choisir une fiche masquée, cliquer sur **Examiner les dépendances**.
- Toute complétion, soumission liée, vitrine et autre référence non technique bloque l'effacement. Les liens techniques d'archives/d'historique sont signalés.
- Si aucune référence bloquante n'existe, saisir exactement le nom du niveau et `SUPPRIMER`, puis confirmer la boîte de dialogue.
- La fonction Supabase **revérifie les dépendances dans la transaction** et consigne l'opération dans `community_audit_log`.
- Les positions des autres niveaux ne sont **jamais** renumérotées par cette suppression. La resynchronisation AREDL peut réimporter un niveau supprimé si la logique d'import n'exclut pas explicitement ce niveau : le patch ne modifie pas le synchroniseur AREDL.

### 3. Aperçu des rôles (propriétaire seulement)

Une barre de sélection apparaît en haut de **Modération** :
- **Propriétaire** : panneau réel et pleinement fonctionnel.
- **Modo NLW** : file de validation des niveaux publics NLW uniquement.
- **Modo** : file de validation des niveaux publics Top 150 et NLW.
- **Supermodo** : panneau complet, sans la section réservée au propriétaire.

**Mode aperçu = lecture seule** : aucun formulaire n'est activable et aucun changement de rôle n'est effectué dans Supabase. Les éléments de file sont présentés selon les contraintes de rang. Il s'agit d'une simulation d'interface depuis les données accessibles au propriétaire : ce n'est pas une connexion sous l'identité d'un modérateur.

## Limites et vérification

- Le SQL n'a pas pu être exécuté sur votre instance Supabase de production : faites un essai sur une copie de la base.
- Une fonction de synchronisation automatique AREDL pourrait recréer les imports supprimés ; une liste d'exclusion permanente dans le synchroniseur est un chantier distinct.
- Test recommandé : choisir un niveau masqué *sans record*, prévisualiser puis supprimer. Essayer un niveau avec des records pour vérifier le refus, sans valider une suppression.
- Tester chaque rôle avec son sélecteur, vérifier le libellé « APERÇU — LECTURE SEULE ».

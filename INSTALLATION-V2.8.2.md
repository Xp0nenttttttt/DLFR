# DLFR V2.8.2 — Barème NLW durable

## Installer

1. Remplacer `js/v2-core.js` par celui du patch.
2. Remplacer `index.html` par celui du patch (cache bust `?v=282`).
3. Ne pas toucher à `js/config.js` ou `assets/flags/`.
4. Mettre à jour GitHub Pages et forcer le rechargement (Ctrl+F5).

## Règle

Rang NLW `r = position globale - 150` :

`points = arrondi_2_decimales(100 / (1 + (r - 1) / 130)^1.5)`

100 % requis ; les records partiels rapportent 0 NLW. Un niveau UNRATED reste exclu du calcul NLW (classement UNRATED distinct).

Barème indicatif : #1 = 100, #100 = 42.77, #250 = 20.09, #500 = 9.40, #1000 = 3.91, #2000 = 1.51, #5000 = 0.40, #10000 = 0.15.

Cette formule ne dépend **jamais** du nombre de niveaux inscrits dans la NLW. Son exposant (1.5) garantit que la somme des points de tous les rangs reste bornée, même si la liste grandit sans limite.

## Recalculs et historique

* Les points NLW sont recalculés à partir des rangs actuels. Cette mise à jour **change les points NLW affichés** des joueurs par rapport au barème antérieur. Sauvegarder/exporter les scores actuels avant déploiement si leur historique est important.
* Un niveau déplacé dans le classement fait varier les points du record associé ; pour figer des saisons/récompenses, stocker ultérieurement des snapshots de classement datés et la `NLW_SCORING_VERSION` (`nlw-2026-01`).
* Les points principaux Main/Extended et les règles d'attribution des badges ne sont pas modifiés par ce patch.
* Pour garantir la même règle sur la version multiutilisateur, les points devront être recomputés/validés dans Supabase côté serveur plutôt que d'accepter un score fourni par le navigateur.

## Sécurité et performance

Le calcul est O(1) par niveau et fonctionne sans parcourir les 2 000+ rangs pour connaître les points d'un niveau. Le calcul des scores joueurs utilise le meilleur record par couple (joueur, niveau), afin de neutraliser les doublons et l'ordre des enregistrements.

## Limitations

Il s'agit d'un correctif du moteur frontend. Les systèmes externes (table SQL, exports historiques, caches de score éventuels) ne sont pas migrés. Démo à tester sur GitHub Pages. Cette modification ne fournit aucune image/drapeau.

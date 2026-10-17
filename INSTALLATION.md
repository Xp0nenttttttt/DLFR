# DLFR 2.9.3 — Ne plus afficher les doublons historiques

Ce patch est basé sur **DLFR 2.9.1** (et non sur la proposition 2.9.2 supprimant la catégorie Legacy).

## Installer
1. **Ne pas appliquer** la migration SQL 44 du patch « sans Legacy ».
2. Fais une copie de ton `js/app.js` actuel.
3. Remplace **uniquement** `js/app.js` par le fichier fourni ici.
4. Recharge ton navigateur avec `Ctrl + F5` puis ouvre la NLW.

**Aucun SQL**. Les drapeaux personnalisés dans `assets/flags/`, les records et les rangs restent inchangés.

## Résultat
- Si RUTHLESS (GD ID 85612571) est publié dans le Top 150, son ancienne fiche « Ancien #151 » n'apparaît plus à la fin de la NLW.
- Si RUTHLESS est de nouveau publié en NLW, sa fiche actuelle s'affiche à son véritable rang et pas comme archive supplémentaire.
- Les anciennes fiches sans correspondance officielle continuent d'être consultables dans la NLW.
- Les noms identiques avec deux ID GD **différents** ne sont pas automatiquement considérés comme un même niveau.

Cette mise à jour ne modifie pas l'historique brut : les anciennes URLs directes des fiches d'archives restent consultables.

**Attention :** si tu as déjà installé la version 2.9.2 ou modifié `js/app.js` depuis notre 2.9.1, ne remplace pas ton fichier aveuglément : le correctif doit être reporté sur ton fichier actuel pour éviter de perdre tes changements.

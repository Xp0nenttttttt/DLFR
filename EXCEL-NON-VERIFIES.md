# Liste communautaire des démons non vérifiés (V2.0.1)

Cette page **ne suit plus les niveaux non terminés par un joueur**. Elle affiche les démons de la communauté qui attendent encore leur première vérification.

## Mettre à jour la liste depuis GitHub

1. Ouvre `data/niveaux-non-battus.xlsx` dans Excel ou LibreOffice Calc.
2. Supprime les lignes `DÉMO` et remplace-les par tes vrais niveaux. Une ligne par niveau.
3. Conserve la ligne d'en-tête du tableau. La seule colonne obligatoire est **Nom**.
4. Pour un niveau vérifié, mets **Oui** dans la colonne `Verifie`. Le site le cachera automatiquement à la prochaine publication sur GitHub Pages. Tu peux garder la ligne pour tes archives.
5. Remplace le fichier dans le dossier `data` de ton dépôt, puis attends le déploiement de GitHub Pages et recharge la page.

**Colonnes du modèle :**

| Colonne | Obligatoire | Usage |
|---|---|---|
| Nom | oui | Nom exact du niveau, permettant aussi une recherche dans la Demonlist |
| Rang AREDL | non | Rang AREDL indicatif ; pas besoin de classement officiel |
| Difficulte | non | Difficulté libre |
| Video | non | URL de vidéo en `http(s)` |
| Verifie | recommandé | `Non` tant que le niveau attend une vérification ; `Oui` une fois vérifié |
| Commentaire | non | Détails à afficher sur la fiche |

Le site lit **automatiquement la première feuille** de l'Excel qui doit être stocké à `data/niveaux-non-battus.xlsx`. Les noms de colonnes avec accents sont reconnus. Les doublons de noms sont ignorés. Il n'y a **aucun fichier SQL à installer** pour cette page.

### Retrait automatique

Lorsqu'une entrée possède `Verifie = Oui`, elle ne figure plus dans la liste. Même si `Verifie = Non`, elle disparaît si **un niveau du même nom existe déjà dans les données Demonlist et possède un vérificateur renseigné**.

**Limite :** GitHub Pages ne peut pas modifier ton Excel lorsqu'un niveau est vérifié dans le jeu. Pour les niveaux qui ne figurent pas encore dans la Demonlist, tu dois modifier la colonne `Verifie` puis republier le fichier. Après la migration, on pourra ajouter un vrai outil modérateur Supabase pour signaler une vérification sans modifier l'Excel.

### Essayer sans avoir de données réelles

- Sur GitHub Pages : le site lit le fichier Excel inclus ; ses lignes sont **fictives** et doivent être remplacées.
- En double-cliquant sur `index.html` (`file://`) : le navigateur peut empêcher la lecture du classeur local. Dans ce cas, deux niveaux **fictifs** intégrés au code sont affichés.
- Pour vérifier en local **ton vrai Excel**, ouvre un terminal dans le dossier du site, lance `python -m http.server 8000`, puis ouvre `http://localhost:8000/?demo=1&page=unbeaten`.
- Le lecteur XLSX chargé depuis le CDN de SheetJS nécessite une connexion Internet.

La page est un tableau d'information public : elle n'envoie pas les données Excel vers un service distant et n'écrit rien dans Supabase.

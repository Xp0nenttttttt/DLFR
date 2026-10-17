# Import groupé des niveaux NLW battus par des Français

## Installer une fois

1. Copie le contenu du patch à la racine du dépôt DLFR, en remplaçant les fichiers proposés. Ajoute aussi le dossier caché `.github/workflows` : il contient la nouvelle action.
2. Dans Supabase → SQL Editor, exécute **supabase/44_IMPORT_GROUPE_NLW_FR.sql**. Cela installe la fonction d’import, sans publier de niveaux. Les migrations antérieures de ton site, notamment 19, 25 et 32, doivent déjà être installées.
3. Publie les fichiers sur GitHub et attends le déploiement habituel. Recharge le site avec Ctrl+F5.

## Importer tout le lot

1. Dans ton dépôt GitHub → **Actions → Préparer import groupé NLW français → Run workflow**.
2. Garde `start_aredl_rank = 1` et `end_aredl_rank = 0` pour examiner tout le catalogue. Si tu veux seulement les niveaux à partir du **rang AREDL 238**, saisis **238** dans le premier champ. La collecte peut prendre un moment : elle lit les pages de records et les pays. Aucune clé Supabase n’est nécessaire.
3. À la fin, ouvre l’exécution et télécharge l’artifact **aredl-fr-import**. Décompresse-le pour récupérer **aredl-fr-bulk.json**.
4. Sur le site, connecte-toi avec les droits de supermodération, puis ouvre **Modération → Niveaux → NLW et imports → Import groupé AREDL → NLW**.
5. Choisis le JSON. La première position **DLFR** est préréglée à **238** (NLW #88). Ce réglage est indépendant du rang AREDL examiné par la collecte.
6. Clique sur **Examiner l’import** : le tableau montre les nouvelles positions, les vérificateurs / victors, les niveaux déjà présents et les conflits.
7. Clique sur **Publier le lot examiné**. Tous les niveaux admissibles sont enregistrés en une transaction.

Les niveaux sont triés par rang AREDL. Les positions existantes ne bougent pas : si 238 est occupé, l’import utilise la prochaine position libre. Pour une suite continue, utilise le premier rang libre après la fin de ta NLW. Un nouvel import du même fichier conserve les niveaux déjà publics sans les dupliquer. Il ne complète pas automatiquement les crédits de ces fiches publiques.

## Preuves et limites

- Pays **France uniquement**, déterminé à partir des données de pays AREDL, jamais du pseudo. Les autres pays francophones ne sont pas inclus.
- Il faut un vérificateur français ou un record français à 100 %. Les records refusés et les progressions partielles sont exclus.
- Le premier record **daté disponible** est conservé avec son lien et sa date. Il n’est pas présenté comme une preuve absolue de la première victoire historique. En cas de dates égales ou absentes, un victor connu peut être affiché sans rang chronologique.
- Les vérificateurs français et leurs preuves sont conservés. L’éditeur est récupéré depuis AREDL ; un créateur absent reste à renseigner, sans crédit artificiel « AREDL ».
- Les noms et vidéos sont affichés sur les fiches. Cet import ne crée **ni compte joueur, ni complétion dans le classement des joueurs, ni points joueur**. Les niveaux publiés ont le classement et les points NLW habituels du site ; l’attribution de victoires aux profils reste une opération de modération.
- Les vidéos masquées par AREDL ne sont pas publiées.
- Les variantes Solo/2P ambiguës, les fiches archivées / verrouillées et les rapprochements contradictoires sont exclus et signalés.
- En cas d’échec de collecte, le JSON signale les niveaux non examinés. Un lot partiel peut être importé ; relance ensuite la collecte pour couvrir les manquants. Une limite de pagination atteinte exclut entièrement le niveau concerné.
- Le bouton Examiner ne modifie aucune fiche. Si les positions ont changé avant la publication, l’import demande un nouvel aperçu.
- Le patch ne contient aucun fichier `assets/flags/` et ne change pas les anciens workflows désactivés.

## Collecte locale facultative

Avec Python 3.10 ou plus, depuis la racine du site :

```bash
python tools/aredl_bulk_fr.py --start-rank 1 --end-rank 0
```

Le fichier est écrit dans `out/aredl-fr-bulk.json`. Les réponses sont mises en cache localement pour faciliter une relance. Pour forcer une nouvelle collecte, supprime seulement le dossier `.cache/aredl-bulk`.

## Vérifications effectuées

Tests Python : France / autres pays, dates manquantes ou ex aequo, vérificateurs, vidéos masquées, pagination incomplète. Tests JavaScript : fichier, aperçu partiel, échappement HTML et liens. Fonction SQL exécutée sur PostgreSQL embarqué : aperçu sans écriture, publication, relance sans doublons, fiche masquée réutilisable, archive protégée, aperçu périmé, preuves FR et droits d’accès. Les données de ta base Supabase n’ont pas été modifiées depuis cette session.

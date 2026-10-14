# Publication MANUELLE des médias AREDL

Le fichier `aredl-nlw-media.json` n'est PAS fourni ni généré publiquement dans ce patch.

Quand les niveaux existent déjà sur le site et que tu as vérifié les fiches :
1. Dans les artefacts Actions, ouvre `aredl-nlw-stage-media.json`.
2. Vérifie les noms, pays, vidéos, dates et identifiants GD.
3. Mets `approved: true` uniquement pour les fiches examinées.
4. Enregistre le fichier sous `data/aredl-nlw-media.json` dans le dépôt.
5. Le site affiche les preuves sur les pages des niveaux dont l'ID Geometry Dash correspond exactement.

Ne publie jamais automatiquement le fichier stage : les premières victoires restent des « premiers records datés retrouvés » et les validations manuelles gardent la priorité. Aucune connexion Supabase n'est effectuée par cette fonctionnalité.

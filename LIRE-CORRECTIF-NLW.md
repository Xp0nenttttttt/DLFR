# Correctif NLW (patch ciblé)

1. Sauvegarder Supabase et le site.
2. Exécuter **supabase/29_CORRECTIF_NLW_RAPPROCHEMENT.sql** après la migration 28.
3. Déployer les fichiers JS modifiés.
4. Tester une ancienne fiche cachée avec un ID GD unique dans l’outil « Homologuer ».
5. Si une fiche est déjà publique, ne pas la republier : elle doit être modifiée via les outils normaux de modération.

La migration ne publie ni ne déplace rien à l’installation. Elle permet à la fonction historique de rapprocher une seule fiche cachée par ID GD exact (ou par nom strict en l’absence d’ID historique). En cas d’ambiguïté, elle refuse l’opération. Les contraintes de rang restent inchangées.

L’affichage NLW utilise « À renseigner » pour les crédits absents ou l’éditeur AREDL et tente la miniature YouTube quand elle est connue. Il ne récupère pas automatiquement créateurs, vérificateurs ou vidéos inconnus.

**Pas de modifications des images sous `assets/flags/`.**

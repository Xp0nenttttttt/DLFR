# DLFR – fusion de joueurs (version prudente)

1. Sauvegarder Supabase avant toute intervention.
2. Exécuter `supabase/33_FUSION_JOUEURS.sql` dans SQL Editor.
3. Remplacer `js/app.js`, puis Ctrl+F5.
4. Modération > Profils > Fusionner deux fiches joueur.
5. Sélectionner la cible et la source, cliquer Prévisualiser, vérifier les conflits, puis saisir `FUSIONNER`.

**Important :** la fusion conserve la fiche source, la masque des stats, transfère les complétions non dupliquées, copie badges/titres et réaffecte palmarès/achievements. Les complétions doublonnées sont sauvegardées dans `dlfr_merge_duplicate_completions` avant retrait. Les liens Discord et comptes Auth ne sont jamais déplacés. Les autres relations (clans, AREDL, snapshots, etc.) restent sur la source et doivent être revues individuellement. Le pseudo source demeure une fiche d'archive. Fusionner uniquement de vrais doublons.

Le script SQL n'a pas été testé sur votre instance Supabase. Test conseillé sur une copie de base. Ne remplacez aucun élément dans `assets/flags/` (non inclus).

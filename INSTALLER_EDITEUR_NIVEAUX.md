# Éditeur complet de niveaux — patch DLFR

1. Fais une sauvegarde de Supabase avant toute modification.
2. Dans l'éditeur SQL Supabase, exécute `supabase/30_EDITEUR_COMPLET_NIVEAUX.sql` (une seule fois).
3. Remplace `js/app.js` et `css/style.css` par les fichiers du patch. Vide le cache du navigateur.
4. Ouvre **Modération → Niveaux → Éditeur complet de niveaux**.
5. Sélectionne la fiche, modifie ses champs puis enregistre. Pour déplacer un niveau, coche la confirmation.

Le SQL n'altère aucune donnée tant qu'un modérateur n'enregistre pas de modification. Les enregistrements passent par un RPC sécurisé, avec contrôle de droit côté base et journalisation. Les déplacements de rang utilisent une transaction et respectent l'unicité de `position`.

Notes : L'éditeur déplace les niveaux à l'intérieur de leur catégorie actuelle (Top 150 ou NLW) uniquement. Il ne gère pas la réorganisation de la liste UNRATED. Les champs non exposés (historique AREDL, badges, records, etc.) restent conservés. Une nouvelle modification éditoriale classe la fiche comme manuelle. Les miniatures YouTube peuvent être suggérées depuis la vidéo, mais une vidéo absente ne permet pas de générer une miniature réelle.

Ce patch inclut également les améliorations NLW antérieures dans `js/app.js`. Si ce patch SQL précédent n'a pas déjà été exécuté, exécute aussi `supabase/29_CORRECTIF_NLW_RAPPROCHEMENT.sql` avant le SQL 30 (fichier joint).

Aucun fichier `assets/flags/` n'est fourni ou modifié.

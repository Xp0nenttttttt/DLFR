# DLFR 2.11.1 — Correction SQL gestion de l’équipe

Le nom `current_role` est un mot-clé PostgreSQL. La déclaration `RETURNS TABLE` le met maintenant entre guillemets : `"current_role" text`. Le nom renvoyé reste identique pour le JavaScript.

1. Sauvegarder la base Supabase.
2. Ouvrir Supabase > SQL Editor.
3. Exécuter l’intégralité de `supabase/49_EQUIPE_COPROPRIETAIRE_CORRIGE.sql` (et non le premier fichier défectueux).
4. Vérifier que l’exécution réussit.
5. Actualiser le site puis ouvrir Modération > Équipe.

Cette migration crée ou met à jour deux fonctions, mais **n’ajoute aucun propriétaire automatiquement**. Elle ne modifie pas les niveaux, les points ni les complétions. Aucun nouveau JavaScript n’est nécessaire si la DLFR 2.11 est déjà installée.

Note : la syntaxe corrigée n’a pas été exécutée sur la base Supabase de production. Ne promouvoir un copropriétaire qu’après avoir confirmé la présence de votre sauvegarde et l’identité du compte cible.

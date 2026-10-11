-- À exécuter uniquement dans Supabase → SQL Editor.
-- Lecture seule : cette requête ne crée, ne supprime et ne modifie aucune donnée.
SELECT 'demons' AS table_name, COUNT(*) AS lignes FROM public.demons
UNION ALL SELECT 'players', COUNT(*) FROM public.players
UNION ALL SELECT 'completions', COUNT(*) FROM public.completions;

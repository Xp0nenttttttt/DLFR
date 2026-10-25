-- Exécuter dans Supabase SQL Editor pour vérifier l'historique (lecture seule).
SELECT 'player_stat_snapshots' AS table_name, count(*) AS total, min(snapshot_day)::text AS premier_jour, max(snapshot_day)::text AS dernier_jour FROM public.player_stat_snapshots;
SELECT snapshot_day, count(*) AS joueurs FROM public.player_stat_snapshots GROUP BY snapshot_day ORDER BY snapshot_day DESC LIMIT 10;
-- Vérifier aussi le statut Actions GitHub et les secrets sans jamais les partager.

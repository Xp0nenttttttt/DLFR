-- Lecture seule : inspecte les instantanés de la journée et les scores stockés
SELECT s.snapshot_day, s.player_key, s.points AS points_instantane, p.points AS points_table, s.rank_position AS rang_instantane,
  (SELECT count(*) FROM public.completions c WHERE lower(trim(c.player))=lower(trim(s.player_key)) AND c.progress=100) AS completions_100
FROM public.player_stat_snapshots s JOIN public.players p ON p.player_key=s.player_key
ORDER BY s.snapshot_day DESC, s.player_key LIMIT 100;
-- Le rang/score affiché par le site peut être calculé en JavaScript et différer de players.points.

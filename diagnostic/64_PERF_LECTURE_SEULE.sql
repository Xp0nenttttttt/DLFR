-- DLFR V64 : diagnostic purement informatif, ne change aucune donnée.
-- Connexions PostgreSQL actuellement ouvertes.
SELECT
  count(*) AS total_connections,
  count(*) FILTER (WHERE state='active') AS active_connections,
  count(*) FILTER (WHERE state='idle') AS idle_connections,
  count(*) FILTER (WHERE state='idle in transaction') AS idle_in_transaction,
  current_setting('max_connections')::integer AS postgres_connection_limit
FROM pg_stat_activity
WHERE datname=current_database();

-- Repérer les tables les plus volumineuses et l'activité des lectures.
-- Ce sont des compteurs cumulés, pas uniquement depuis la V64.
SELECT
  schemaname,
  relname AS table_name,
  n_live_tup AS estimated_live_rows,
  n_dead_tup AS estimated_dead_rows,
  seq_scan,
  idx_scan,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_storage
FROM pg_stat_user_tables
WHERE schemaname='public'
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 25;

-- Pour connaître les requêtes coûteuses, utiliser le rapport Query Performance
-- de Supabase (extension pg_stat_statements selon disponibilité).

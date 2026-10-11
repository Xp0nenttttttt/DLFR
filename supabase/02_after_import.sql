-- À exécuter dans Supabase SQL Editor APRÈS import des CSV (pas dans phpMyAdmin).
-- Remet les séquences auto-incrémentées après import explicite des ID historiques.
select setval(pg_get_serial_sequence('public.demons','id'), greatest(1,coalesce((select max(id) from public.demons),1)), (select count(*)>0 from public.demons));
select setval(pg_get_serial_sequence('public.completions','id'), greatest(1,coalesce((select max(id) from public.completions),1)), (select count(*)>0 from public.completions));
select setval(pg_get_serial_sequence('public.news_items','id'), greatest(1,coalesce((select max(id) from public.news_items),1)), (select count(*)>0 from public.news_items));
select setval(pg_get_serial_sequence('public.profile_titles','id'), greatest(1,coalesce((select max(id) from public.profile_titles),1)), (select count(*)>0 from public.profile_titles));
select setval(pg_get_serial_sequence('public.hall_of_fame','id'), greatest(1,coalesce((select max(id) from public.hall_of_fame),1)), (select count(*)>0 from public.hall_of_fame));
select setval(pg_get_serial_sequence('public.demon_position_history','id'), greatest(1,coalesce((select max(id) from public.demon_position_history),1)), (select count(*)>0 from public.demon_position_history));
-- Facultatif : nettoyage du journal produit par l'import initial, AVANT mise en service uniquement.
-- truncate table public.community_audit_log;

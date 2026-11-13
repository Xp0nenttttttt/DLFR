-- DLFR V164 — Trafic Supabase réduit + garde-fou anti-effacement (déjà appliqué en base).
-- 1) dlfr_adventure_sync (migration dlfr_164_sync_never_wipes) : refuse une synchronisation qui retirerait
--    plus de la moitié des exemplaires d'un joueur, et ne descend jamais une carte sous 1 exemplaire.
-- 2) Empreintes de version par table, pour le cache local du site :
create index if not exists community_audit_log_target_id_idx on public.community_audit_log(target, id desc);
create or replace function public.dlfr_data_stamps()
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_object_agg(t, coalesce((select max(l.id) from public.community_audit_log l where l.target = t), 0))
 from unnest(array['players','demons','completions','player_profiles','badge_awards','news_items','site_settings','profile_titles','player_profile_titles','hall_of_fame']) t $$;
grant execute on function public.dlfr_data_stamps() to anon, authenticated;

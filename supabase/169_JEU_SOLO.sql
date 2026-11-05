-- V169 — DLFR Cards devient un jeu solo (DÉJÀ APPLIQUÉ, migration dlfr_169_jeu_solo)
-- * Bans, soft bans et alertes levés ; plus aucune sanction automatique (strike / sanction = sans effet).
-- * Classements retirés : cartes (dlfr_cards_leaderboard = []), top du boss et de la saison (top = []).
-- * Échanges retirés : dlfr_trade_create / dlfr_trade_accept refusent ; offres ouvertes annulées.
-- * Conservé en silence : quotas serveur de dlfr_adventure_sync (bloque les cartes injectées par la console).

update public.dlfr_cards_bans set active = false where active;
update public.dlfr_cards_shadow set active = false where active;
update public.dlfr_cards_strikes set kind = kind || ':sanctionné' where kind not like '%:sanctionné';
update public.dlfr_trades set status = 'cancelled', done_at = now() where status = 'open';

create or replace function public.dlfr_cards_strike(p_auth uuid, p_kind text, p_detail text)
returns void language plpgsql security definer set search_path = '' as $$ begin return; end $$;
create or replace function public.dlfr_cards_soft_sanction(p_auth uuid, p_reason text, p_by uuid default null)
returns void language plpgsql security definer set search_path = '' as $$ begin return; end $$;
create or replace function public.dlfr_cards_report(p_kind text, p_detail text default null)
returns jsonb language sql security definer set search_path = '' as $$ select jsonb_build_object('ok', true) $$;
create or replace function public.dlfr_cards_my_status()
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('banned', null, 'strikes', 0, 'reset', null, 'shadow', null) $$;
create or replace function public.dlfr_cards_leaderboard()
returns jsonb language sql stable security definer set search_path = '' as $$ select '[]'::jsonb $$;
create or replace function public.dlfr_trade_create(p_to_player text, p_give jsonb, p_want jsonb, p_message text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
begin raise exception 'Les échanges ont été retirés : DLFR Cards est maintenant un jeu solo.'; end $$;
create or replace function public.dlfr_trade_accept(p_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin raise exception 'Les échanges ont été retirés : DLFR Cards est maintenant un jeu solo.'; end $$;
-- dlfr_boss_status() et dlfr_season_status() : champ 'top' remplacé par '[]'::jsonb.

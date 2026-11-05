-- V168 — Fermeture de la faille de synchronisation + soft ban (DÉJÀ APPLIQUÉ, migration dlfr_168_quotas_soft_ban)
--
-- 1. FAILLE : dlfr_adventure_sync acceptait jusqu'à 1 000 exemplaires de n'importe quelle carte par
--    appel, sans limite d'appels (une ligne dans la console = des Ultra). Désormais, quotas serveur :
--      * 600 cartes par synchronisation, 1 500 par jour (Paris) ;
--      * Épique 400 / jour, Légendaire 60 / jour, Mythique 8 / jour ;
--      * Ultra : 1 tous les 30 jours ; Secrète : 1 par an ;
--      * le surplus est refusé (la carte disparaît chez le joueur au prochain chargement) ;
--      * un gros dépassement (Ultra en trop, Légendaire+ au-delà de 1,5× le quota, ou 300 cartes de trop)
--        compte comme une alerte « quota » (une par jour).
--    La file d'attente n'est plus alimentée (les cartes déjà en attente sont toujours livrées).
-- 2. Les alertes simultanées (plusieurs requêtes à la même milliseconde) ne déclenchent plus plusieurs
--    sanctions d'un coup (verrou par joueur).
-- 3. SOFT BAN : le joueur peut jouer, mais n'apparaît plus dans le classement des cartes ni dans le
--    top du boss, et sa vitrine est masquée / désactivée. Automatique à la 2e sanction (récidive),
--    ou à la main par l'équipe (sanction_set 'shadow' / 'unshadow').

create table if not exists public.dlfr_cards_shadow(
 auth_user_id uuid primary key references auth.users(id) on delete cascade,
 reason text not null default '', by_user uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), active boolean not null default true);
alter table public.dlfr_cards_shadow enable row level security;
revoke all on public.dlfr_cards_shadow from anon, authenticated;

create table if not exists public.dlfr_card_sync_quota(
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 day date not null, total integer not null default 0, tiers integer[] not null default '{0,0,0,0,0,0,0}',
 primary key (auth_user_id, day));
alter table public.dlfr_card_sync_quota enable row level security;
revoke all on public.dlfr_card_sync_quota from anon, authenticated;

create table if not exists public.dlfr_card_rare_log(
 id bigint generated always as identity primary key,
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 card_id bigint not null, rarity text not null, created_at timestamptz not null default now());
create index if not exists dlfr_card_rare_log_user_idx on public.dlfr_card_rare_log(auth_user_id, rarity, created_at desc);
alter table public.dlfr_card_rare_log enable row level security;
revoke all on public.dlfr_card_rare_log from anon, authenticated;

create or replace function public.dlfr_cards_is_shadow(p_auth uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.dlfr_cards_shadow where auth_user_id = p_auth and active) $$;
revoke all on function public.dlfr_cards_is_shadow(uuid) from public, anon, authenticated;

create or replace function public.dlfr_cards_apply_shadow(p_auth uuid, p_reason text, p_by uuid default null)
returns void language sql security definer set search_path = '' as $$
 insert into public.dlfr_cards_shadow(auth_user_id, reason, by_user, created_at, active)
 values (p_auth, left(coalesce(p_reason,''),200), p_by, now(), true)
 on conflict (auth_user_id) do update set reason = excluded.reason, by_user = excluded.by_user, created_at = now(), active = true $$;
revoke all on function public.dlfr_cards_apply_shadow(uuid, text, uuid) from public, anon, authenticated;

-- Sanction douce + soft ban en cas de récidive (2e sanction en 30 jours, hors retrait lié au bug).
create or replace function public.dlfr_cards_soft_sanction(p_auth uuid, p_reason text, p_by uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
 update public.dlfr_card_inventory i set qty = 0, adv_qty = 0
  from public.dlfr_cards c where c.id = i.card_id and i.auth_user_id = p_auth and c.rarity in ('Ultra','Secrète') and (i.qty > 0 or i.adv_qty > 0);
 update public.dlfr_card_adv_queue q set qty = 0 from public.dlfr_cards c where c.id = q.card_id and q.auth_user_id = p_auth and c.rarity in ('Ultra','Secrète');
 update public.dlfr_cards_strikes set kind = kind || ':sanctionné' where auth_user_id = p_auth and kind not like '%:sanctionné';
 insert into public.dlfr_cards_resets(auth_user_id, reason, by_user) values (p_auth, 'Ultra et Secrètes retirées : ' || left(coalesce(p_reason,''),180), p_by);
 if (select count(*) from public.dlfr_cards_resets where auth_user_id = p_auth and created_at > now() - interval '30 days'
      and reason like 'Ultra et Secrètes retirées :%' and reason not like '%bug des raretés%') >= 2
    and not public.dlfr_cards_is_shadow(p_auth) then
  perform public.dlfr_cards_apply_shadow(p_auth, 'récidive : ' || left(coalesce(p_reason,''),180), p_by);
 end if;
end $$;
revoke all on function public.dlfr_cards_soft_sanction(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.dlfr_cards_strike(p_auth uuid, p_kind text, p_detail text)
returns void language plpgsql security definer set search_path = '' as $$
declare n int;
begin
 perform pg_advisory_xact_lock(hashtextextended('dlfr-strike:' || p_auth::text, 0));
 insert into public.dlfr_cards_strikes(auth_user_id, kind, detail) values (p_auth, left(p_kind,40), left(coalesce(p_detail,''),300));
 select count(*) into n from public.dlfr_cards_strikes where auth_user_id = p_auth and kind not like '%:sanctionné' and created_at > now() - interval '24 hours';
 if n >= 3 then
  perform public.dlfr_cards_soft_sanction(p_auth, case p_kind when 'rythme' then 'rythme de jeu impossible à la main'
    when 'synthetic' then 'clics générés par un programme' when 'regular' then 'autoclicker' when 'burst' then 'macro / rafales de clics'
    when 'quota' then 'cartes ajoutées au-delà du possible' else p_kind end);
 end if;
end $$;
revoke all on function public.dlfr_cards_strike(uuid, text, text) from public, anon, authenticated;

create or replace function public.dlfr_cards_report(p_kind text, p_detail text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid());
begin
 if v_auth is null or p_kind not in ('synthetic','regular','burst') then return jsonb_build_object('ok', false); end if;
 perform pg_advisory_xact_lock(hashtextextended('dlfr-strike:' || v_auth::text, 0));
 if exists(select 1 from public.dlfr_cards_strikes where auth_user_id = v_auth and created_at > now() - interval '2 minutes') then
  return jsonb_build_object('ok', true); end if;
 perform public.dlfr_cards_strike(v_auth, p_kind, p_detail);
 return jsonb_build_object('ok', true);
end $$;
revoke all on function public.dlfr_cards_report(text, text) from public, anon;
grant execute on function public.dlfr_cards_report(text, text) to authenticated;

create or replace function public.dlfr_cards_my_status()
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('banned', public.dlfr_cards_ban_message((select auth.uid())),
  'strikes', (select count(*) from public.dlfr_cards_strikes where auth_user_id = (select auth.uid()) and kind not like '%:sanctionné' and created_at > now() - interval '24 hours'),
  'reset', (select jsonb_build_object('reason', r.reason, 'at', r.created_at) from public.dlfr_cards_resets r
            where r.auth_user_id = (select auth.uid()) and r.created_at > now() - interval '7 days' order by r.created_at desc limit 1),
  'shadow', (select s.reason from public.dlfr_cards_shadow s where s.auth_user_id = (select auth.uid()) and s.active)) $$;
grant execute on function public.dlfr_cards_my_status() to authenticated;

-- Synchronisation des cartes avec quotas serveur.
create or replace function public.dlfr_adventure_sync(p_delta jsonb, p_import boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); s public.dlfr_card_state; v_today date := (now() at time zone 'Europe/Paris')::date;
 e record; q record; v_id bigint; v_d int; v_take int; v_added int := 0; v_dropped int := 0; v_capped int := 0;
 v_delivered int := 0; v_cur public.dlfr_card_inventory; v_neg_total int := 0; v_owned_total int; v_rem int;
 v_q public.dlfr_card_sync_quota; v_rar text; v_t int; v_room int; v_call int := 600; v_over_rare int := 0; v_over_ultra int := 0;
 v_caps int[] := array[1500, 1500, 400, 60, 8, 1, 1]; v_tiers int[]; v_total int;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if; perform public.dlfr_cards_assert_ok(v_auth);
 if p_delta is null or jsonb_typeof(p_delta) <> 'object' then raise exception 'Synchronisation invalide'; end if;
 select coalesce(sum(qty + adv_qty), 0) into v_owned_total from public.dlfr_card_inventory where auth_user_id = v_auth;
 select coalesce(sum(-(value::text::int)), 0) into v_neg_total from jsonb_each(p_delta) where jsonb_typeof(value) = 'number' and value::text::numeric < 0;
 if v_owned_total > 20 and v_neg_total > v_owned_total / 2 then
  raise exception 'Synchronisation refusée : elle aurait retiré trop de cartes. Recharge la page.';
 end if;
 insert into public.dlfr_card_state(auth_user_id) values (v_auth) on conflict do nothing;
 select * into s from public.dlfr_card_state where auth_user_id = v_auth for update;
 if p_import and s.adv_imported then p_import := false; end if;
 insert into public.dlfr_card_sync_quota(auth_user_id, day) values (v_auth, v_today) on conflict do nothing;
 select * into v_q from public.dlfr_card_sync_quota where auth_user_id = v_auth and day = v_today for update;
 v_tiers := v_q.tiers || array_fill(0, array[greatest(0, 7 - coalesce(cardinality(v_q.tiers),0))]); v_total := v_q.total;
 -- cartes déjà en file d'attente (ancien système) : livrées
 if not p_import then
  for q in select card_id, qty from public.dlfr_card_adv_queue where auth_user_id = v_auth and qty > 0 order by card_id for update loop
   insert into public.dlfr_card_inventory(auth_user_id, card_id, qty, adv_qty) values (v_auth, q.card_id, 0, q.qty)
    on conflict (auth_user_id, card_id) do update set adv_qty = public.dlfr_card_inventory.adv_qty + q.qty;
   update public.dlfr_card_adv_queue set qty = 0 where auth_user_id = v_auth and card_id = q.card_id;
   v_delivered := v_delivered + q.qty;
  end loop;
 end if;
 for e in select key, value from jsonb_each(p_delta) order by key loop
  if e.key !~ '^[0-9]{1,15}$' or jsonb_typeof(e.value) <> 'number' then continue; end if;
  v_id := e.key::bigint; v_d := greatest(-1000, least(1000, (e.value)::text::int));
  if v_d = 0 then continue; end if;
  v_rar := null;
  select k.rarity into v_rar from public.dlfr_cards k where k.id = v_id;
  if v_rar is null then continue; end if;
  if v_d > 0 then
   if v_rar = 'Festive' or exists(select 1 from public.dlfr_cards k join public.dlfr_card_collections col on col.id = k.collection_id where k.id = v_id and not col.is_published) then v_dropped := v_dropped + v_d; continue; end if;
   v_t := coalesce(array_position(array['Commun','Rare','Épique','Légendaire','Mythique','Ultra','Secrète'], v_rar), 1);
   v_room := least(v_call, v_caps[1] - v_total);
   if v_t between 3 and 5 then v_room := least(v_room, v_caps[v_t] - v_tiers[v_t]);
   elsif v_t = 6 then v_room := least(v_room, case when exists(select 1 from public.dlfr_card_rare_log where auth_user_id = v_auth and rarity = 'Ultra' and created_at > now() - interval '30 days') then 0 else 1 end);
   elsif v_t = 7 then v_room := least(v_room, case when exists(select 1 from public.dlfr_card_rare_log where auth_user_id = v_auth and rarity = 'Secrète' and created_at > now() - interval '365 days') then 0 else 1 end);
   end if;
   v_take := greatest(0, least(v_d, v_room));
   if v_take > 0 then
    insert into public.dlfr_card_inventory(auth_user_id, card_id, qty, adv_qty) values (v_auth, v_id, 0, v_take)
     on conflict (auth_user_id, card_id) do update set adv_qty = public.dlfr_card_inventory.adv_qty + v_take;
    v_total := v_total + v_take; v_tiers[v_t] := v_tiers[v_t] + v_take; v_call := v_call - v_take; v_added := v_added + v_take;
    if v_t >= 6 then insert into public.dlfr_card_rare_log(auth_user_id, card_id, rarity) values (v_auth, v_id, v_rar); end if;
   end if;
   if v_d > v_take then
    v_capped := v_capped + (v_d - v_take);
    if v_t >= 6 then v_over_ultra := v_over_ultra + (v_d - v_take);
    elsif v_t >= 4 then v_over_rare := v_over_rare + (v_d - v_take); end if;
   end if;
  else
   select * into v_cur from public.dlfr_card_inventory where auth_user_id = v_auth and card_id = v_id for update;
   if found then
    v_rem := least(-v_d, greatest(0, v_cur.qty + v_cur.adv_qty - 1));
    v_take := least(v_rem, v_cur.adv_qty);
    update public.dlfr_card_inventory set adv_qty = adv_qty - v_take, qty = greatest(0, qty - (v_rem - v_take)) where auth_user_id = v_auth and card_id = v_id;
   end if;
  end if;
 end loop;
 update public.dlfr_card_sync_quota set total = v_total, tiers = v_tiers where auth_user_id = v_auth and day = v_today;
 if (v_over_ultra > 0 or v_over_rare > 30 or v_capped > 300)
    and not exists(select 1 from public.dlfr_cards_strikes where auth_user_id = v_auth and kind like 'quota%' and created_at > now() - interval '20 hours') then
  perform public.dlfr_cards_strike(v_auth, 'quota', v_capped || ' carte(s) refusée(s) dont ' || v_over_ultra || ' Ultra/Secrète et ' || v_over_rare || ' Mythique/Légendaire');
 end if;
 if v_added > 0 and not p_import then perform public.dlfr_season_add_xp(v_auth, least(100, v_added * 2)); end if;
 update public.dlfr_card_state set adv_day = v_today,
   adv_added = case when s.adv_day is distinct from v_today then 0 else s.adv_added end + v_added + v_delivered,
   adv_imported = adv_imported or p_import
  where auth_user_id = v_auth;
 return jsonb_build_object('inventory', public.dlfr_cards_inventory_of(v_auth), 'added', v_added, 'dropped', v_dropped + v_capped,
  'capped', v_capped, 'queued', 0, 'delivered', v_delivered, 'queue_total', 0, 'imported', p_import, 'left_today', greatest(0, 1500 - v_total),
  'bonuses', public.dlfr_cards_check_collections(v_auth), 'balance', public.dlfr_wallet_balance(v_auth));
end $$;
revoke all on function public.dlfr_adventure_sync(jsonb, boolean) from public, anon;
grant execute on function public.dlfr_adventure_sync(jsonb, boolean) to authenticated;

-- Classement des cartes : sans les joueurs en soft ban.
create or replace function public.dlfr_cards_leaderboard()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(r order by (r->>'owned')::int desc, (r->>'mythic')::int desc, (r->>'legendary')::int desc), '[]'::jsonb) from (
  select jsonb_build_object('player_key', o.player_key,
    'name', coalesce(nullif(p.display_name,''), p.username, o.player_key),
    'owned', count(*) filter (where i.qty + i.adv_qty > 0),
    'mythic', count(*) filter (where i.qty + i.adv_qty > 0 and c.rarity = 'Mythique'),
    'legendary', count(*) filter (where i.qty + i.adv_qty > 0 and c.rarity = 'Légendaire')) r
   from public.dlfr_card_inventory i join public.dlfr_cards c on c.id = i.card_id
   join public.player_profile_owners o on o.auth_user_id = i.auth_user_id
   join public.players p on p.player_key = o.player_key
   where not exists(select 1 from public.dlfr_cards_shadow sh where sh.auth_user_id = i.auth_user_id and sh.active)
   group by o.player_key, p.display_name, p.username
   having count(*) filter (where i.qty + i.adv_qty > 0) > 0
   order by count(*) filter (where i.qty + i.adv_qty > 0) desc limit 20) t $$;
grant execute on function public.dlfr_cards_leaderboard() to anon, authenticated;

-- Fiche publique : vitrine masquée en soft ban.
create or replace function public.dlfr_cards_public(p_player_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
 with o as (select auth_user_id from public.player_profile_owners where player_key = p_player_key limit 1)
 select jsonb_build_object(
  'owned', (select count(*) from public.dlfr_card_inventory i join o on o.auth_user_id = i.auth_user_id where i.qty + i.adv_qty > 0),
  'total', (select count(*) from public.dlfr_cards),
  'mythic', (select count(*) from public.dlfr_card_inventory i join o on o.auth_user_id = i.auth_user_id join public.dlfr_cards c on c.id = i.card_id where i.qty + i.adv_qty > 0 and c.rarity = 'Mythique'),
  'collections', (select count(*) from public.dlfr_card_collection_rewards r join o on o.auth_user_id = r.auth_user_id),
  'hidden', exists(select 1 from public.dlfr_cards_shadow sh join o on o.auth_user_id = sh.auth_user_id where sh.active),
  'showcase', case when exists(select 1 from public.dlfr_cards_shadow sh join o on o.auth_user_id = sh.auth_user_id where sh.active) then '[]'::jsonb else
    coalesce((select to_jsonb(array(select x from unnest(s.card_ids) with ordinality u(x,n)
       where exists(select 1 from public.dlfr_card_inventory i where i.auth_user_id = s.auth_user_id and i.card_id = x and i.qty + i.adv_qty > 0) order by n))
     from public.dlfr_card_showcase s join o on o.auth_user_id = s.auth_user_id), '[]'::jsonb) end) $$;
grant execute on function public.dlfr_cards_public(text) to anon, authenticated;

create or replace function public.dlfr_cards_set_showcase(p_ids bigint[])
returns bigint[] language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_ids bigint[];
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 if public.dlfr_cards_is_shadow(v_auth) then raise exception 'Vitrine désactivée : ton compte est restreint pour triche.'; end if;
 select coalesce(array_agg(x order by o), '{}') into v_ids from (select distinct on (x) x, o from unnest(coalesce(p_ids,'{}')) with ordinality u(x,o) order by x, o) t;
 if cardinality(v_ids) > 5 then raise exception 'Ta vitrine peut contenir 5 cartes au maximum.'; end if;
 if exists(select 1 from unnest(v_ids) x where not exists(select 1 from public.dlfr_card_inventory i where i.auth_user_id = v_auth and i.card_id = x and i.qty + i.adv_qty > 0))
  then raise exception 'Tu ne peux exposer que des cartes de ta collection.'; end if;
 insert into public.dlfr_card_showcase(auth_user_id, card_ids, updated_at) values (v_auth, v_ids, now())
 on conflict (auth_user_id) do update set card_ids = excluded.card_ids, updated_at = now();
 return v_ids;
end $$;
revoke all on function public.dlfr_cards_set_showcase(bigint[]) from public, anon;
grant execute on function public.dlfr_cards_set_showcase(bigint[]) to authenticated;

-- Boss : les joueurs en soft ban n'apparaissent plus dans le top (sauf pour eux-mêmes).
create or replace function public.dlfr_boss_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); b public.dlfr_boss := public.dlfr_boss_current();
 v_today date := (now() at time zone 'Europe/Paris')::date; h public.dlfr_boss_hits;
begin
 if v_auth is not null then select * into h from public.dlfr_boss_hits where week_start = b.week_start and auth_user_id = v_auth; end if;
 return jsonb_build_object('week_start', b.week_start, 'ends', b.week_start + 7, 'demon', b.demon_name, 'position', b.demon_pos,
  'max_hp', b.max_hp, 'hp', b.hp, 'defeated', b.defeated_at is not null, 'defeated_at', b.defeated_at,
  'defeated_by', case when b.defeated_by is not null and not public.dlfr_cards_is_shadow(b.defeated_by) then public.dlfr_player_name(b.defeated_by) end,
  'signed_in', v_auth is not null, 'power', case when v_auth is not null then public.dlfr_cards_power(v_auth) end,
  'my_damage', coalesce(h.damage, 0), 'my_attacks', coalesce(h.attacks, 0),
  'attacks_left', case when v_auth is null then 0 else 3 - (case when h.day = v_today then h.day_attacks else 0 end) end,
  'reward_card_id', h.reward_card_id, 'reward_coins', h.reward_coins,
  'players', (select count(*) from public.dlfr_boss_hits where week_start = b.week_start),
  'top', coalesce((select jsonb_agg(jsonb_build_object('name', public.dlfr_player_name(x.auth_user_id), 'damage', x.damage, 'me', x.auth_user_id = v_auth) order by x.damage desc)
     from (select * from public.dlfr_boss_hits hh where hh.week_start = b.week_start
           and (hh.auth_user_id = v_auth or not public.dlfr_cards_is_shadow(hh.auth_user_id)) order by hh.damage desc limit 10) x), '[]'::jsonb));
end $$;
grant execute on function public.dlfr_boss_status() to anon, authenticated;

create or replace function public.dlfr_cards_sanction_set(p_player_key text, p_action text, p_days integer default null, p_reason text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_target uuid; v_reason text := coalesce(nullif(btrim(p_reason),''), 'décision de l’équipe');
begin
 if not coalesce(public.dlfr_cards_lab_access(), false) then raise exception 'Accès refusé' using errcode = '42501'; end if;
 select auth_user_id into v_target from public.player_profile_owners where lower(player_key) = lower(btrim(coalesce(p_player_key,''))) limit 1;
 if v_target is null then raise exception 'Joueur introuvable (pseudo de fiche relié à un compte).'; end if;
 if p_action = 'ban' then perform public.dlfr_cards_apply_ban(v_target, v_reason, v_auth, p_days, true);
 elsif p_action = 'unban' then
  update public.dlfr_cards_bans set active = false where auth_user_id = v_target;
  update public.dlfr_cards_strikes set kind = kind || ':sanctionné' where auth_user_id = v_target and kind not like '%:sanctionné';
 elsif p_action = 'soft' then perform public.dlfr_cards_soft_sanction(v_target, v_reason, v_auth);
 elsif p_action = 'reset' then perform public.dlfr_cards_do_reset(v_target, v_reason, v_auth);
 elsif p_action = 'shadow' then perform public.dlfr_cards_apply_shadow(v_target, v_reason, v_auth);
 elsif p_action = 'unshadow' then update public.dlfr_cards_shadow set active = false where auth_user_id = v_target;
 else raise exception 'Action inconnue'; end if;
 return true;
end $$;
revoke all on function public.dlfr_cards_sanction_set(text, text, integer, text) from public, anon;
grant execute on function public.dlfr_cards_sanction_set(text, text, integer, text) to authenticated;

create or replace function public.dlfr_cards_sanctions()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not coalesce(public.dlfr_cards_lab_access(), false) then raise exception 'Accès refusé' using errcode = '42501'; end if;
 return jsonb_build_object(
  'bans', coalesce((select jsonb_agg(jsonb_build_object('player_key', o.player_key, 'name', public.dlfr_player_name(b.auth_user_id), 'until', b.until, 'reason', b.reason, 'level', b.level, 'at', b.created_at) order by b.created_at desc)
    from public.dlfr_cards_bans b left join public.player_profile_owners o on o.auth_user_id = b.auth_user_id where b.active and (b.until is null or b.until > now())), '[]'::jsonb),
  'shadows', coalesce((select jsonb_agg(jsonb_build_object('player_key', o.player_key, 'name', public.dlfr_player_name(s.auth_user_id), 'reason', s.reason, 'at', s.created_at) order by s.created_at desc)
    from public.dlfr_cards_shadow s left join public.player_profile_owners o on o.auth_user_id = s.auth_user_id where s.active), '[]'::jsonb),
  'resets', coalesce((select jsonb_agg(x order by (x->>'at') desc) from (select jsonb_build_object('player_key', o.player_key, 'name', public.dlfr_player_name(r.auth_user_id), 'reason', r.reason, 'at', r.created_at) x
    from public.dlfr_cards_resets r left join public.player_profile_owners o on o.auth_user_id = r.auth_user_id order by r.created_at desc limit 30) z), '[]'::jsonb),
  'strikes', coalesce((select jsonb_agg(x order by (x->>'at') desc) from (select jsonb_build_object('player_key', o.player_key, 'name', public.dlfr_player_name(s.auth_user_id), 'kind', s.kind, 'detail', s.detail, 'at', s.created_at) x
    from public.dlfr_cards_strikes s left join public.player_profile_owners o on o.auth_user_id = s.auth_user_id where s.created_at > now() - interval '7 days' order by s.created_at desc limit 60) z), '[]'::jsonb),
  'top_rate', coalesce((select jsonb_agg(x order by (x->>'packs')::int desc) from (select jsonb_build_object('player_key', o.player_key, 'name', public.dlfr_player_name(a.auth_user_id), 'packs', max(a.packs), 'chapters', max(a.chapters)) x
    from public.dlfr_cards_activity a left join public.player_profile_owners o on o.auth_user_id = a.auth_user_id where a.hour > now() - interval '48 hours' group by a.auth_user_id, o.player_key order by max(a.packs) desc limit 10) z), '[]'::jsonb));
end $$;
revoke all on function public.dlfr_cards_sanctions() from public, anon;
grant execute on function public.dlfr_cards_sanctions() to authenticated;

-- V168b : journal des publications / mises en préparation de collections (community_audit_log,
--         actions CARDS_COLLECTION_PUBLISH / CARDS_COLLECTION_DRAFT) dans dlfr_cards_admin_publish_collection.
-- V168c : seuils chapitres de dlfr_adventure_save resserrés (énergie côté site) : > 20 / h = alerte, > 60 / h = sanction.
-- Opération du 05/11 : soft ban de ZuperXivi, TheWayshOK et lezoulu_ (triche continue après la V165).
-- V168d : une Ultra / Secrète n'est acceptée par dlfr_adventure_sync que si le joueur a ouvert au moins
--         20 boosters dans les 2 dernières heures (dlfr_cards_activity) ; sinon refus + alerte « quota ».
--         (Ligne ajoutée juste avant « v_take := greatest(0, least(v_d, v_room)); » :
--          if v_t >= 6 and (select coalesce(sum(packs), 0) from public.dlfr_cards_activity where auth_user_id = v_auth and hour > now() - interval '2 hours') < 20 then v_room := 0; end if;)

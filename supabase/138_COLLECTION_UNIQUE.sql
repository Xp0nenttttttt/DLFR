-- DLFR V138 — Une seule collection DLFR Cards : les cartes du mode Aventure rejoignent la collection serveur.
-- qty     = exemplaires « officiels » (booster du jour / boosters achetés) → seuls recyclables en Wayllings.
-- adv_qty = exemplaires gagnés en mode Aventure (calculé dans le navigateur) → comptent pour la collection,
--           la vitrine, les classements et les bonus, mais ne se recyclent pas en Wayllings.
-- Garde-fou : 120 exemplaires Aventure ajoutés par jour au maximum (+ import unique de 500 depuis l'ancienne sauvegarde).

alter table public.dlfr_card_inventory add column if not exists adv_qty integer not null default 0 check (adv_qty >= 0);
alter table public.dlfr_card_state add column if not exists adv_day date;
alter table public.dlfr_card_state add column if not exists adv_added integer not null default 0;
alter table public.dlfr_card_state add column if not exists adv_imported boolean not null default false;

-- Bonus de collection complète (une seule fois par collection), sur la collection unique.
create or replace function public.dlfr_cards_check_collections(p_auth uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c record; v_bonus jsonb := '[]'::jsonb;
begin
 for c in select col.id, col.name, count(k.id)::int n from public.dlfr_card_collections col join public.dlfr_cards k on k.collection_id = col.id
   where not exists(select 1 from public.dlfr_card_collection_rewards r where r.auth_user_id = p_auth and r.collection_id = col.id)
   group by col.id, col.name
   having count(k.id) > 0 and count(k.id) = count(*) filter (where exists(select 1 from public.dlfr_card_inventory i where i.auth_user_id = p_auth and i.card_id = k.id and i.qty + i.adv_qty > 0))
 loop
  insert into public.dlfr_card_collection_rewards(auth_user_id, collection_id, coins) values (p_auth, c.id, c.n * 40) on conflict do nothing;
  insert into public.dlfr_wallet_ledger(auth_user_id, amount, reason, ref, note) values (p_auth, c.n * 40, 'collection', c.id::text, 'Collection complète : '||c.name) on conflict do nothing;
  v_bonus := v_bonus || jsonb_build_array(jsonb_build_object('collection', c.name, 'coins', c.n * 40));
 end loop;
 return v_bonus;
end $$;
revoke all on function public.dlfr_cards_check_collections(uuid) from public, anon, authenticated;

create or replace function public.dlfr_cards_inventory_of(p_auth uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_object_agg(card_id::text, qty + adv_qty), '{}'::jsonb) from public.dlfr_card_inventory where auth_user_id = p_auth and qty + adv_qty > 0 $$;
revoke all on function public.dlfr_cards_inventory_of(uuid) from public, anon, authenticated;

-- Synchronisation du mode Aventure : p_delta = {"id_carte": +n | -n}. Renvoie la collection à jour.
create or replace function public.dlfr_adventure_sync(p_delta jsonb, p_import boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); s public.dlfr_card_state; v_today date := (now() at time zone 'Europe/Paris')::date;
 e record; v_id bigint; v_d int; v_left int; v_take int; v_added int := 0; v_dropped int := 0; v_cur public.dlfr_card_inventory;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 if p_delta is null or jsonb_typeof(p_delta) <> 'object' then raise exception 'Synchronisation invalide'; end if;
 insert into public.dlfr_card_state(auth_user_id) values (v_auth) on conflict do nothing;
 select * into s from public.dlfr_card_state where auth_user_id = v_auth for update;
 if p_import and s.adv_imported then p_import := false; end if;
 if s.adv_day is distinct from v_today then s.adv_added := 0; end if;
 v_left := case when p_import then 500 else greatest(0, 120 - s.adv_added) end;
 for e in select key, value from jsonb_each(p_delta) order by key loop
  if e.key !~ '^[0-9]{1,15}$' or jsonb_typeof(e.value) <> 'number' then continue; end if;
  v_id := e.key::bigint; v_d := greatest(-1000, least(1000, (e.value)::text::int));
  if v_d = 0 or not exists(select 1 from public.dlfr_cards where id = v_id) then continue; end if;
  if v_d > 0 then
   v_take := least(v_d, v_left); v_dropped := v_dropped + (v_d - v_take);
   if v_take > 0 then
    insert into public.dlfr_card_inventory(auth_user_id, card_id, qty, adv_qty) values (v_auth, v_id, 0, v_take)
     on conflict (auth_user_id, card_id) do update set adv_qty = public.dlfr_card_inventory.adv_qty + v_take;
    v_left := v_left - v_take; v_added := v_added + v_take;
   end if;
  else
   select * into v_cur from public.dlfr_card_inventory where auth_user_id = v_auth and card_id = v_id for update;
   if found then
    v_take := least(-v_d, v_cur.adv_qty);
    update public.dlfr_card_inventory set adv_qty = adv_qty - v_take, qty = greatest(0, qty - (-v_d - v_take)) where auth_user_id = v_auth and card_id = v_id;
   end if;
  end if;
 end loop;
 update public.dlfr_card_state set adv_day = v_today,
   adv_added = case when p_import then s.adv_added else s.adv_added + v_added end,
   adv_imported = adv_imported or p_import
  where auth_user_id = v_auth;
 return jsonb_build_object('inventory', public.dlfr_cards_inventory_of(v_auth), 'added', v_added, 'dropped', v_dropped,
  'imported', p_import, 'left_today', case when p_import then greatest(0, 120 - s.adv_added) else v_left end,
  'bonuses', public.dlfr_cards_check_collections(v_auth), 'balance', public.dlfr_wallet_balance(v_auth));
end $$;
revoke all on function public.dlfr_adventure_sync(jsonb, boolean) from public, anon;
grant execute on function public.dlfr_adventure_sync(jsonb, boolean) to authenticated;

-- Recyclage : seuls les exemplaires officiels en trop (on garde toujours un exemplaire de la carte).
create or replace function public.dlfr_cards_recycle(p_card_id bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_gain int; v_n int;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 perform 1 from auth.users where id = v_auth for update;
 select coalesce(sum(least(i.qty, i.qty + i.adv_qty - 1) * public.dlfr_card_value(c.rarity)),0), coalesce(sum(least(i.qty, i.qty + i.adv_qty - 1)),0) into v_gain, v_n
   from public.dlfr_card_inventory i join public.dlfr_cards c on c.id = i.card_id
  where i.auth_user_id = v_auth and least(i.qty, i.qty + i.adv_qty - 1) > 0 and (p_card_id is null or i.card_id = p_card_id);
 if v_n = 0 then raise exception 'Aucun doublon officiel à recycler (les exemplaires du mode Aventure ne se recyclent pas).'; end if;
 update public.dlfr_card_inventory set qty = qty - least(qty, qty + adv_qty - 1)
  where auth_user_id = v_auth and least(qty, qty + adv_qty - 1) > 0 and (p_card_id is null or card_id = p_card_id);
 insert into public.dlfr_wallet_ledger(auth_user_id, amount, reason, ref, note)
  values (v_auth, v_gain, 'recycle', gen_random_uuid()::text, v_n||' doublon(s) recyclé(s)');
 return jsonb_build_object('gained', v_gain, 'recycled', v_n, 'balance', public.dlfr_wallet_balance(v_auth));
end $$;

create or replace function public.dlfr_cards_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); s public.dlfr_card_state; v_today date := (now() at time zone 'Europe/Paris')::date; v_streak int;
begin
 if v_auth is null then return jsonb_build_object('signed_in', false, 'booster_price', 150); end if;
 select * into s from public.dlfr_card_state where auth_user_id = v_auth;
 v_streak := case when s.last_daily >= v_today - 1 then coalesce(s.streak, 0) else 0 end;
 return jsonb_build_object('signed_in', true, 'balance', public.dlfr_wallet_balance(v_auth), 'booster_price', 150,
  'daily_available', s.last_daily is null or s.last_daily < v_today,
  'next_daily', ((v_today + 1)::timestamp at time zone 'Europe/Paris'),
  'pity', coalesce(s.pity, 0), 'opened', coalesce(s.opened, 0), 'streak', v_streak,
  'inventory', public.dlfr_cards_inventory_of(v_auth),
  'recyclable', coalesce((select jsonb_object_agg(card_id::text, least(qty, qty + adv_qty - 1)) from public.dlfr_card_inventory where auth_user_id = v_auth and least(qty, qty + adv_qty - 1) > 0), '{}'::jsonb),
  'adv_imported', coalesce(s.adv_imported, false),
  'adv_left_today', case when s.adv_day = v_today then greatest(0, 120 - s.adv_added) else 120 end,
  'collections_done', coalesce((select jsonb_agg(collection_id) from public.dlfr_card_collection_rewards where auth_user_id = v_auth), '[]'::jsonb),
  'showcase', coalesce((select to_jsonb(card_ids) from public.dlfr_card_showcase where auth_user_id = v_auth), '[]'::jsonb),
  'duplicates_value', coalesce((select sum(least(i.qty, i.qty + i.adv_qty - 1) * public.dlfr_card_value(c.rarity)) from public.dlfr_card_inventory i join public.dlfr_cards c on c.id = i.card_id where i.auth_user_id = v_auth and least(i.qty, i.qty + i.adv_qty - 1) > 0), 0));
end $$;

create or replace function public.dlfr_cards_set_showcase(p_ids bigint[])
returns bigint[] language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_ids bigint[];
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 select coalesce(array_agg(x order by o), '{}') into v_ids from (select distinct on (x) x, o from unnest(coalesce(p_ids,'{}')) with ordinality u(x,o) order by x, o) t;
 if cardinality(v_ids) > 5 then raise exception 'Ta vitrine peut contenir 5 cartes au maximum.'; end if;
 if exists(select 1 from unnest(v_ids) x where not exists(select 1 from public.dlfr_card_inventory i where i.auth_user_id = v_auth and i.card_id = x and i.qty + i.adv_qty > 0))
  then raise exception 'Tu ne peux exposer que des cartes de ta collection.'; end if;
 insert into public.dlfr_card_showcase(auth_user_id, card_ids, updated_at) values (v_auth, v_ids, now())
 on conflict (auth_user_id) do update set card_ids = excluded.card_ids, updated_at = now();
 return v_ids;
end $$;

create or replace function public.dlfr_cards_public(p_player_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
 with o as (select auth_user_id from public.player_profile_owners where player_key = p_player_key limit 1)
 select jsonb_build_object(
  'owned', (select count(*) from public.dlfr_card_inventory i join o on o.auth_user_id = i.auth_user_id where i.qty + i.adv_qty > 0),
  'total', (select count(*) from public.dlfr_cards),
  'mythic', (select count(*) from public.dlfr_card_inventory i join o on o.auth_user_id = i.auth_user_id join public.dlfr_cards c on c.id = i.card_id where i.qty + i.adv_qty > 0 and c.rarity = 'Mythique'),
  'collections', (select count(*) from public.dlfr_card_collection_rewards r join o on o.auth_user_id = r.auth_user_id),
  'showcase', coalesce((select to_jsonb(array(select x from unnest(s.card_ids) with ordinality u(x,n)
       where exists(select 1 from public.dlfr_card_inventory i where i.auth_user_id = s.auth_user_id and i.card_id = x and i.qty + i.adv_qty > 0) order by n))
     from public.dlfr_card_showcase s join o on o.auth_user_id = s.auth_user_id), '[]'::jsonb)) $$;

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
   group by o.player_key, p.display_name, p.username
   having count(*) filter (where i.qty + i.adv_qty > 0) > 0
   order by count(*) filter (where i.qty + i.adv_qty > 0) desc limit 20) t $$;

create or replace function public.dlfr_cards_owner_counts()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_object_agg(card_id::text, n), '{}'::jsonb) from (
  select card_id, count(*) n from public.dlfr_card_inventory where qty + adv_qty > 0 group by card_id) t $$;


-- Ouverture de booster : « nouvelle carte » et bonus calculés sur la collection unique.
create or replace function public.dlfr_cards_open(p_source text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_auth uuid := (select auth.uid()); s public.dlfr_card_state; v_today date := (now() at time zone 'Europe/Paris')::date;
 v_open bigint; v_r float8; v_rar text; v_card public.dlfr_cards; v_ids bigint[] := '{}'; v_out jsonb := '[]'::jsonb; v_new boolean;
 v_order text[] := array['Commun','Rare','Épique','Légendaire','Mythique']; v_idx int; v_bonus jsonb := '[]'::jsonb; c record; i int;
 v_streak int := 0; v_big boolean := false; v_n int := 5;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 if p_source not in ('daily','shop') then raise exception 'Source invalide'; end if;
 if not exists(select 1 from public.dlfr_cards where in_packs) then raise exception 'Aucune carte disponible dans les boosters.'; end if;
 insert into public.dlfr_card_state(auth_user_id) values (v_auth) on conflict do nothing;
 select * into s from public.dlfr_card_state where auth_user_id = v_auth for update;
 if p_source = 'daily' then
  if s.last_daily is not null and s.last_daily >= v_today then raise exception 'Booster gratuit déjà ouvert aujourd’hui. Reviens demain !'; end if;
  v_streak := case when s.last_daily = v_today - 1 then coalesce(s.streak, 0) + 1 else 1 end;
  v_big := v_streak % 7 = 0; if v_big then v_n := 6; end if;
  update public.dlfr_card_state set last_daily = v_today, streak = v_streak where auth_user_id = v_auth;
 else
  perform 1 from auth.users where id = v_auth for update;
  if public.dlfr_wallet_balance(v_auth) < 150 then raise exception 'Wayllings dorés insuffisants (150 nécessaires).'; end if;
 end if;
 insert into public.dlfr_card_openings(auth_user_id, source, cards) values (v_auth, p_source, '{}') returning id into v_open;
 if p_source = 'shop' then
  insert into public.dlfr_wallet_ledger(auth_user_id, amount, reason, ref, note) values (v_auth, -150, 'booster', v_open::text, 'Booster DLFR Cards');
 end if;
 for i in 1..v_n loop
  v_r := random() * 100;
  v_rar := case when v_r < 1 then 'Mythique' when v_r < 5 then 'Légendaire' when v_r < 15 then 'Épique' when v_r < 42 then 'Rare' else 'Commun' end;
  if i = v_n and v_rar = 'Commun' then v_rar := 'Rare'; end if;
  if i = v_n and v_big and array_position(v_order, v_rar) < 3 then v_rar := 'Épique'; end if;
  if s.pity + i >= 40 and array_position(v_order, v_rar) < 4 then v_rar := 'Légendaire'; end if;
  v_idx := array_position(v_order, v_rar);
  loop
   select * into v_card from public.dlfr_cards where in_packs and rarity = v_order[v_idx] order by random() limit 1;
   exit when found or v_idx = 1; v_idx := v_idx - 1;
  end loop;
  if v_card.id is null then select * into v_card from public.dlfr_cards where in_packs order by random() limit 1; end if;
  if v_card.rarity in ('Légendaire','Mythique') then s.pity := -i; end if;
  select not exists(select 1 from public.dlfr_card_inventory where auth_user_id = v_auth and card_id = v_card.id and qty + adv_qty > 0) into v_new;
  insert into public.dlfr_card_inventory(auth_user_id, card_id, qty) values (v_auth, v_card.id, 1)
   on conflict (auth_user_id, card_id) do update set qty = public.dlfr_card_inventory.qty + 1;
  v_ids := v_ids || v_card.id;
  v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_card.id, 'rarity', v_card.rarity, 'is_new', v_new, 'value', public.dlfr_card_value(v_card.rarity)));
 end loop;
 update public.dlfr_card_state set pity = greatest(0, s.pity + v_n), opened = opened + 1 where auth_user_id = v_auth;
 update public.dlfr_card_openings set cards = v_ids where id = v_open;
 v_bonus := public.dlfr_cards_check_collections(v_auth);
 return jsonb_build_object('cards', v_out, 'bonuses', v_bonus, 'balance', public.dlfr_wallet_balance(v_auth), 'streak', v_streak, 'big', v_big);
end $$;
revoke all on function public.dlfr_cards_open(text) from public, anon;
grant execute on function public.dlfr_cards_open(text) to authenticated;

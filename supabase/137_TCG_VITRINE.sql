-- DLFR V137 — DLFR Cards : vitrine de cartes (profil), série de boosters quotidiens, classement des
-- collectionneurs, nombre de possesseurs par carte. Tout porte sur la COLLECTION OFFICIELLE.

create table if not exists public.dlfr_card_showcase(
 auth_user_id uuid primary key references auth.users(id) on delete cascade,
 card_ids bigint[] not null default '{}' check (cardinality(card_ids) <= 5),
 updated_at timestamptz not null default now());
alter table public.dlfr_card_showcase enable row level security;
revoke all on public.dlfr_card_showcase from anon, authenticated;

alter table public.dlfr_card_state add column if not exists streak integer not null default 0;

create or replace function public.dlfr_cards_set_showcase(p_ids bigint[])
returns bigint[] language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_ids bigint[];
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 select coalesce(array_agg(x order by o), '{}') into v_ids from (select distinct on (x) x, o from unnest(coalesce(p_ids,'{}')) with ordinality u(x,o) order by x, o) t;
 if cardinality(v_ids) > 5 then raise exception 'Ta vitrine peut contenir 5 cartes au maximum.'; end if;
 if exists(select 1 from unnest(v_ids) x where not exists(select 1 from public.dlfr_card_inventory i where i.auth_user_id = v_auth and i.card_id = x and i.qty > 0))
  then raise exception 'Tu ne peux exposer que des cartes de ta collection officielle.'; end if;
 insert into public.dlfr_card_showcase(auth_user_id, card_ids, updated_at) values (v_auth, v_ids, now())
 on conflict (auth_user_id) do update set card_ids = excluded.card_ids, updated_at = now();
 return v_ids;
end $$;

-- Fiche publique : collection + vitrine (cartes encore possédées uniquement)
create or replace function public.dlfr_cards_public(p_player_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
 with o as (select auth_user_id from public.player_profile_owners where player_key = p_player_key limit 1)
 select jsonb_build_object(
  'owned', (select count(*) from public.dlfr_card_inventory i join o on o.auth_user_id = i.auth_user_id where i.qty > 0),
  'total', (select count(*) from public.dlfr_cards),
  'mythic', (select count(*) from public.dlfr_card_inventory i join o on o.auth_user_id = i.auth_user_id join public.dlfr_cards c on c.id = i.card_id where i.qty > 0 and c.rarity = 'Mythique'),
  'collections', (select count(*) from public.dlfr_card_collection_rewards r join o on o.auth_user_id = r.auth_user_id),
  'showcase', coalesce((select to_jsonb(array(select x from unnest(s.card_ids) with ordinality u(x,n)
       where exists(select 1 from public.dlfr_card_inventory i where i.auth_user_id = s.auth_user_id and i.card_id = x and i.qty > 0) order by n))
     from public.dlfr_card_showcase s join o on o.auth_user_id = s.auth_user_id), '[]'::jsonb)) $$;
grant execute on function public.dlfr_cards_public(text) to anon, authenticated;

-- Classement des collectionneurs (cartes différentes possédées)
create or replace function public.dlfr_cards_leaderboard()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(r order by (r->>'owned')::int desc, (r->>'mythic')::int desc, (r->>'legendary')::int desc), '[]'::jsonb) from (
  select jsonb_build_object('player_key', o.player_key,
    'name', coalesce(nullif(p.display_name,''), p.username, o.player_key),
    'owned', count(*) filter (where i.qty > 0),
    'mythic', count(*) filter (where i.qty > 0 and c.rarity = 'Mythique'),
    'legendary', count(*) filter (where i.qty > 0 and c.rarity = 'Légendaire')) r
   from public.dlfr_card_inventory i join public.dlfr_cards c on c.id = i.card_id
   join public.player_profile_owners o on o.auth_user_id = i.auth_user_id
   join public.players p on p.player_key = o.player_key
   group by o.player_key, p.display_name, p.username
   having count(*) filter (where i.qty > 0) > 0
   order by count(*) filter (where i.qty > 0) desc limit 20) t $$;
grant execute on function public.dlfr_cards_leaderboard() to anon, authenticated;

-- Nombre de joueurs qui possèdent chaque carte (rareté réelle)
create or replace function public.dlfr_cards_owner_counts()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_object_agg(card_id::text, n), '{}'::jsonb) from (
  select card_id, count(*) n from public.dlfr_card_inventory where qty > 0 group by card_id) t $$;
grant execute on function public.dlfr_cards_owner_counts() to anon, authenticated;

-- Statut : + série et vitrine
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
  'inventory', coalesce((select jsonb_object_agg(card_id::text, qty) from public.dlfr_card_inventory where auth_user_id = v_auth and qty > 0), '{}'::jsonb),
  'collections_done', coalesce((select jsonb_agg(collection_id) from public.dlfr_card_collection_rewards where auth_user_id = v_auth), '[]'::jsonb),
  'showcase', coalesce((select to_jsonb(card_ids) from public.dlfr_card_showcase where auth_user_id = v_auth), '[]'::jsonb),
  'duplicates_value', coalesce((select sum((i.qty-1) * public.dlfr_card_value(c.rarity)) from public.dlfr_card_inventory i join public.dlfr_cards c on c.id = i.card_id where i.auth_user_id = v_auth and i.qty > 1), 0));
end $$;

-- Ouverture : série quotidienne ; tous les 7 jours d'affilée, booster bonus de 6 cartes dont une Épique ou mieux
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
  select not exists(select 1 from public.dlfr_card_inventory where auth_user_id = v_auth and card_id = v_card.id and qty > 0) into v_new;
  insert into public.dlfr_card_inventory(auth_user_id, card_id, qty) values (v_auth, v_card.id, 1)
   on conflict (auth_user_id, card_id) do update set qty = public.dlfr_card_inventory.qty + 1;
  v_ids := v_ids || v_card.id;
  v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_card.id, 'rarity', v_card.rarity, 'is_new', v_new, 'value', public.dlfr_card_value(v_card.rarity)));
 end loop;
 update public.dlfr_card_state set pity = greatest(0, s.pity + v_n), opened = opened + 1 where auth_user_id = v_auth;
 update public.dlfr_card_openings set cards = v_ids where id = v_open;
 for c in select col.id, col.name, count(k.id)::int n from public.dlfr_card_collections col join public.dlfr_cards k on k.collection_id = col.id
   where not exists(select 1 from public.dlfr_card_collection_rewards r where r.auth_user_id = v_auth and r.collection_id = col.id)
   group by col.id, col.name
   having count(k.id) > 0 and count(k.id) = count(*) filter (where exists(select 1 from public.dlfr_card_inventory i where i.auth_user_id = v_auth and i.card_id = k.id and i.qty > 0))
 loop
  insert into public.dlfr_card_collection_rewards(auth_user_id, collection_id, coins) values (v_auth, c.id, c.n * 40);
  insert into public.dlfr_wallet_ledger(auth_user_id, amount, reason, ref, note) values (v_auth, c.n * 40, 'collection', c.id::text, 'Collection complète : '||c.name) on conflict do nothing;
  v_bonus := v_bonus || jsonb_build_array(jsonb_build_object('collection', c.name, 'coins', c.n * 40));
 end loop;
 return jsonb_build_object('cards', v_out, 'bonuses', v_bonus, 'balance', public.dlfr_wallet_balance(v_auth), 'streak', v_streak, 'big', v_big);
end $$;

revoke all on function public.dlfr_cards_set_showcase(bigint[]) from public, anon;
grant execute on function public.dlfr_cards_set_showcase(bigint[]) to authenticated;
revoke all on function public.dlfr_cards_open(text) from public, anon;
grant execute on function public.dlfr_cards_open(text) to authenticated;
grant execute on function public.dlfr_cards_status() to anon, authenticated;

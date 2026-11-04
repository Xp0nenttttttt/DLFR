-- DLFR V139 — Calendrier de l'Avent DLFR Cards + nouvelle rareté « Festive ».
-- 25 cases (1er → 25 décembre). Chaque case : une carte (choisie par les propriétaires / supermodos)
-- et/ou des Wayllings dorés. Une case s'ouvre à partir de son jour (heure de Paris) ; les jours manqués
-- peuvent être rattrapés jusqu'au 31 décembre. Les cartes « Festive » ne sortent jamais des boosters.

alter table public.dlfr_cards drop constraint if exists dlfr_cards_rarity_check;
alter table public.dlfr_cards add constraint dlfr_cards_rarity_check check (rarity in ('Commun','Rare','Épique','Légendaire','Mythique','Festive'));

create or replace function public.dlfr_card_value(p_rarity text)
returns integer language sql immutable set search_path = '' as $$
 select case p_rarity when 'Commun' then 2 when 'Rare' then 5 when 'Épique' then 15 when 'Légendaire' then 40 when 'Mythique' then 120 when 'Festive' then 60 else 2 end $$;

create table if not exists public.dlfr_advent_days(
 year integer not null check (year between 2025 and 2100),
 day integer not null check (day between 1 and 25),
 card_id bigint references public.dlfr_cards(id) on delete set null,
 coins integer not null default 0 check (coins between 0 and 5000),
 title text check (title is null or char_length(title) <= 60),
 primary key (year, day));
create table if not exists public.dlfr_advent_claims(
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 year integer not null, day integer not null,
 card_id bigint, coins integer not null default 0,
 claimed_at timestamptz not null default now(),
 primary key (auth_user_id, year, day));
alter table public.dlfr_advent_days enable row level security;
alter table public.dlfr_advent_claims enable row level security;
revoke all on public.dlfr_advent_days from anon, authenticated;
revoke all on public.dlfr_advent_claims from anon, authenticated;

-- Récompenses par défaut (les cartes seront ajoutées ensuite) : Wayllings, plus gros les dimanches et à Noël.
insert into public.dlfr_advent_days(year, day, coins, title)
select 2026, d, case when d = 25 then 300 when d = 24 then 200 when d in (6,13,20) then 100 else 30 end,
       case when d = 25 then 'Joyeux Noël !' when d = 24 then 'Réveillon' end
  from generate_series(1,25) d
on conflict do nothing;

create or replace function public.dlfr_advent_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_today date := (now() at time zone 'Europe/Paris')::date;
 v_year int := extract(year from v_today)::int; v_editor boolean := coalesce(public.dlfr_cards_lab_access(), false);
begin
 return jsonb_build_object('year', v_year, 'today', v_today, 'editor', v_editor, 'signed_in', v_auth is not null,
  'open', extract(month from v_today) = 12, 'start', make_date(v_year, 12, 1),
  'days', coalesce((select jsonb_agg(jsonb_build_object(
     'day', d.day,
     'unlocked', v_today >= make_date(v_year, 12, d.day) and v_today <= make_date(v_year, 12, 31),
     'claimed', c.day is not null,
     'has_card', d.card_id is not null,
     'card_id', case when c.day is not null or v_editor then coalesce(c.card_id, d.card_id) end,
     'coins', case when c.day is not null then c.coins when v_editor then d.coins end,
     'title', case when c.day is not null or v_editor or v_today >= make_date(v_year, 12, d.day) then d.title end) order by d.day)
    from public.dlfr_advent_days d
    left join public.dlfr_advent_claims c on c.auth_user_id = v_auth and c.year = d.year and c.day = d.day
   where d.year = v_year), '[]'::jsonb));
end $$;
grant execute on function public.dlfr_advent_status() to anon, authenticated;

create or replace function public.dlfr_advent_open(p_day integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_today date := (now() at time zone 'Europe/Paris')::date;
 v_year int := extract(year from v_today)::int; d public.dlfr_advent_days; v_new boolean := false; v_rarity text;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 if p_day not between 1 and 25 then raise exception 'Case inconnue'; end if;
 if extract(month from v_today) <> 12 then raise exception 'Le calendrier s’ouvre le 1er décembre.'; end if;
 if v_today < make_date(v_year, 12, p_day) then raise exception 'Patience : cette case s’ouvre le % décembre.', p_day; end if;
 select * into d from public.dlfr_advent_days where year = v_year and day = p_day;
 if not found then raise exception 'Case non préparée'; end if;
 perform 1 from auth.users where id = v_auth for update;
 if exists(select 1 from public.dlfr_advent_claims where auth_user_id = v_auth and year = v_year and day = p_day) then raise exception 'Case déjà ouverte'; end if;
 insert into public.dlfr_advent_claims(auth_user_id, year, day, card_id, coins) values (v_auth, v_year, p_day, d.card_id, d.coins);
 if d.card_id is not null then
  select not exists(select 1 from public.dlfr_card_inventory where auth_user_id = v_auth and card_id = d.card_id and qty + adv_qty > 0) into v_new;
  insert into public.dlfr_card_inventory(auth_user_id, card_id, qty) values (v_auth, d.card_id, 1)
   on conflict (auth_user_id, card_id) do update set qty = public.dlfr_card_inventory.qty + 1;
  select rarity into v_rarity from public.dlfr_cards where id = d.card_id;
 end if;
 if d.coins > 0 then
  insert into public.dlfr_wallet_ledger(auth_user_id, amount, reason, ref, note)
  values (v_auth, d.coins, 'advent', v_year||'-'||p_day, 'Calendrier de l’Avent · jour '||p_day) on conflict do nothing;
 end if;
 return jsonb_build_object('day', p_day, 'card_id', d.card_id, 'rarity', v_rarity, 'is_new', v_new, 'coins', d.coins, 'title', d.title,
  'bonuses', public.dlfr_cards_check_collections(v_auth), 'balance', public.dlfr_wallet_balance(v_auth));
end $$;

create or replace function public.dlfr_advent_set_day(p_year integer, p_day integer, p_card_id bigint, p_coins integer, p_title text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if not coalesce(public.dlfr_cards_lab_access(), false) then raise exception 'Réservé aux propriétaires et supermodérateurs.'; end if;
 if p_day not between 1 and 25 or p_year not between 2025 and 2100 then raise exception 'Case invalide'; end if;
 if p_card_id is not null and not exists(select 1 from public.dlfr_cards where id = p_card_id) then raise exception 'Carte introuvable'; end if;
 insert into public.dlfr_advent_days(year, day, card_id, coins, title)
 values (p_year, p_day, p_card_id, greatest(0, least(5000, coalesce(p_coins, 0))), nullif(left(btrim(coalesce(p_title,'')),60),''))
 on conflict (year, day) do update set card_id = excluded.card_id, coins = excluded.coins, title = excluded.title;
 return true;
end $$;

revoke all on function public.dlfr_advent_open(integer) from public, anon;
grant execute on function public.dlfr_advent_open(integer) to authenticated;
revoke all on function public.dlfr_advent_set_day(integer, integer, bigint, integer, text) from public, anon;
grant execute on function public.dlfr_advent_set_day(integer, integer, bigint, integer, text) to authenticated;

-- Les cartes Festive ne peuvent pas être ajoutées par le mode Aventure (seulement par le calendrier).
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
   if exists(select 1 from public.dlfr_cards where id = v_id and rarity = 'Festive') then v_dropped := v_dropped + v_d; continue; end if;
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

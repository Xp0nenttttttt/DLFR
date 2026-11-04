-- DLFR V127 — Économie des Wayllings dorés : Level Packs, DLFR Cards réel, nouvelle grille de prix,
-- rotation hebdomadaire, éditions limitées, cadeaux et couleurs de pseudo.
-- Solde = défis hebdo (dlfr_weekly_rewards) + journal (dlfr_wallet_ledger) − achats (dlfr_reward_purchases).

-- ============ 1. Journal des Wayllings (gains et dépenses hors boutique classique)
create table if not exists public.dlfr_wallet_ledger(
 id bigserial primary key,
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 amount integer not null check (amount <> 0 and amount between -100000 and 100000),
 reason text not null check (reason ~ '^[a-z0-9_]{2,30}$'),
 ref text not null default '',
 note text,
 created_at timestamptz not null default now(),
 unique (auth_user_id, reason, ref));
create index if not exists dlfr_wallet_ledger_user on public.dlfr_wallet_ledger(auth_user_id, created_at desc);
alter table public.dlfr_wallet_ledger enable row level security;
drop policy if exists dlfr_wallet_ledger_own on public.dlfr_wallet_ledger;
create policy dlfr_wallet_ledger_own on public.dlfr_wallet_ledger for select to authenticated using (auth_user_id = (select auth.uid()));
revoke insert, update, delete on public.dlfr_wallet_ledger from anon, authenticated;

create or replace function public.dlfr_wallet_balance(p_auth uuid)
returns bigint language sql stable security definer set search_path = '' as $$
 select coalesce((select sum(coins) from public.dlfr_weekly_rewards where auth_user_id = p_auth),0)
      + coalesce((select sum(amount) from public.dlfr_wallet_ledger where auth_user_id = p_auth),0)
      - coalesce((select sum(price_paid) from public.dlfr_reward_purchases where auth_user_id = p_auth),0) $$;
revoke all on function public.dlfr_wallet_balance(uuid) from public, anon, authenticated;

-- ============ 2. Catalogue : raretés, éditions limitées, couleurs de pseudo, prix
alter table public.dlfr_reward_catalog add column if not exists rarity text not null default 'Commun';
alter table public.dlfr_reward_catalog add column if not exists available_from timestamptz;
alter table public.dlfr_reward_catalog add column if not exists available_until timestamptz;
alter table public.dlfr_reward_catalog add column if not exists sort_order integer not null default 0;
alter table public.dlfr_reward_catalog drop constraint if exists dlfr_reward_catalog_category_check;
alter table public.dlfr_reward_catalog add constraint dlfr_reward_catalog_category_check check (category in ('frame','badge','banner','theme','name'));
alter table public.dlfr_reward_equipped drop constraint if exists dlfr_reward_equipped_category_check;
alter table public.dlfr_reward_equipped add constraint dlfr_reward_equipped_category_check check (category in ('frame','badge','banner','theme','name'));
alter table public.dlfr_reward_purchases drop constraint if exists dlfr_reward_purchases_price_paid_check;
alter table public.dlfr_reward_purchases add constraint dlfr_reward_purchases_price_paid_check check (price_paid >= 0);
alter table public.dlfr_reward_purchases add column if not exists gift_from uuid references auth.users(id) on delete set null;

insert into public.dlfr_reward_catalog(item_key,label,description,emoji,category,price,active,rarity,available_from,available_until) values
 ('name_or','Pseudo doré','Ton pseudo en or brillant dans les classements et sur ton profil.','🟡','name',450,true,'Rare',null,null),
 ('name_ocean','Pseudo Océan','Dégradé turquoise vers bleu profond.','🌊','name',450,true,'Rare',null,null),
 ('name_sunset','Pseudo Crépuscule','Dégradé orange, rose et violet.','🌅','name',450,true,'Rare',null,null),
 ('name_aurora','Pseudo Aurore','Dégradé animé aux couleurs de l’aurore boréale.','🌌','name',900,true,'Épique',null,null),
 ('name_neon','Pseudo Néon','Pseudo lumineux rose et cyan, façon enseigne.','💡','name',900,true,'Épique',null,null),
 ('name_inferno','Pseudo Brasier','Flammes animées qui parcourent ton pseudo.','🔥','name',1600,true,'Légendaire',null,null),
 ('name_galaxy','Pseudo Galaxie','Nébuleuse animée et scintillements. Le plus rare.','🪐','name',2500,true,'Mythique',null,null),
 ('name_frost','Pseudo Givre de Noël','Édition limitée de Noël : pseudo givré et étincelant.','❄️','name',900,true,'Épique','2026-12-01 00:00+01','2027-01-07 00:00+01')
on conflict (item_key) do nothing;

-- Grille de prix par rareté : Commun 200 · Rare 450 · Épique 900 · Légendaire 1600 · Mythique 2500
update public.dlfr_reward_catalog c set rarity = g.rarity, price = case g.rarity when 'Commun' then 200 when 'Rare' then 450 when 'Épique' then 900 when 'Légendaire' then 1600 else 2500 end
from (values
 ('badge_spark','Commun'),('badge_flame','Rare'),
 ('frame_amethyst','Commun'),('frame_aurora','Commun'),('frame_amethyst_crown','Épique'),('frame_glitch','Légendaire'),('frame_celestial','Légendaire'),
 ('banner_night','Rare'),('banner_bloodmoon','Épique'),('banner_glitch','Légendaire'),('banner_voidwalker','Mythique'),
 ('theme_stereo','Commun'),('theme_glacier','Commun'),('theme_halloween','Rare'),('theme_sakura','Rare'),('theme_terminal','Rare'),('theme_abysse','Rare'),
 ('theme_noel','Épique'),('theme_neon','Épique'),('theme_inferno','Légendaire'),('theme_royal','Mythique')
) as g(item_key, rarity) where c.item_key = g.item_key;

-- Remboursement de la différence pour ceux qui ont payé plus cher que le nouveau prix
insert into public.dlfr_wallet_ledger(auth_user_id, amount, reason, ref, note)
select p.auth_user_id, p.price_paid - c.price, 'refund_prix', p.id::text, 'Nouvelle grille de prix : '||c.label
  from public.dlfr_reward_purchases p join public.dlfr_reward_catalog c on c.item_key = p.item_key
 where p.price_paid > c.price
on conflict do nothing;

-- Rotation : 3 objets mis en avant chaque semaine, −25 %
create or replace function public.dlfr_shop_rotation(p_week date default null)
returns text[] language sql stable security definer set search_path = '' as $$
 select coalesce(array_agg(item_key), '{}') from (
  select item_key from public.dlfr_reward_catalog
   where active and available_until is null and available_from is null
   order by md5(item_key || coalesce(p_week, date_trunc('week', now() at time zone 'Europe/Paris')::date)::text)
   limit 3) x $$;

create or replace function public.dlfr_shop_price(p_item_key text)
returns integer language sql stable security definer set search_path = '' as $$
 select case when c.item_key = any(public.dlfr_shop_rotation()) then (round(c.price * 0.75 / 10.0) * 10)::int else c.price end
   from public.dlfr_reward_catalog c where c.item_key = p_item_key $$;

create or replace function public.dlfr_shop_info()
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
  'rotation', to_jsonb(public.dlfr_shop_rotation()),
  'rotation_ends', (date_trunc('week', now() at time zone 'Europe/Paris') + interval '7 days') at time zone 'Europe/Paris',
  'discount', 25,
  'booster_price', 150,
  'items', coalesce((select jsonb_agg(jsonb_build_object('item_key',item_key,'rarity',rarity,'price',price,'price_now',public.dlfr_shop_price(item_key),
      'available_from',available_from,'available_until',available_until,
      'available', active and (available_from is null or available_from <= now()) and (available_until is null or available_until > now())) order by sort_order, price)
     from public.dlfr_reward_catalog where active), '[]'::jsonb)) $$;
grant execute on function public.dlfr_shop_info() to anon, authenticated;

-- ============ 3. Achat (prix de la semaine, édition limitée, nouveau solde)
create or replace function public.dlfr_reward_buy(p_item_key text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_item public.dlfr_reward_catalog%rowtype; v_price int;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 perform 1 from auth.users where id = v_auth for update;
 select * into v_item from public.dlfr_reward_catalog where item_key = p_item_key and active;
 if not found then raise exception 'Objet indisponible'; end if;
 if (v_item.available_from is not null and v_item.available_from > now()) or (v_item.available_until is not null and v_item.available_until <= now()) then
  raise exception 'Édition limitée : objet hors période de vente'; end if;
 if exists(select 1 from public.dlfr_reward_purchases where auth_user_id = v_auth and item_key = p_item_key) then raise exception 'Objet déjà acheté'; end if;
 v_price := public.dlfr_shop_price(p_item_key);
 if public.dlfr_wallet_balance(v_auth) < v_price then raise exception 'Wayllings dorés insuffisants'; end if;
 insert into public.dlfr_reward_purchases(auth_user_id, item_key, price_paid) values (v_auth, p_item_key, v_price);
 return p_item_key;
end $$;

-- ============ 4. Cadeaux
create table if not exists public.dlfr_reward_gifts(
 id bigserial primary key,
 from_auth uuid references auth.users(id) on delete set null,
 to_auth uuid not null references auth.users(id) on delete cascade,
 item_key text not null references public.dlfr_reward_catalog(item_key),
 price_paid integer not null,
 message text check (length(message) <= 200),
 created_at timestamptz not null default now(),
 seen_at timestamptz);
alter table public.dlfr_reward_gifts enable row level security;
revoke all on public.dlfr_reward_gifts from anon, authenticated;

create or replace function public.dlfr_reward_gift(p_item_key text, p_player_key text, p_message text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_to uuid; v_item public.dlfr_reward_catalog%rowtype; v_price int; v_gift bigint;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 perform 1 from auth.users where id = v_auth for update;
 select auth_user_id into v_to from public.player_profile_owners where player_key = p_player_key limit 1;
 if v_to is null then raise exception 'Ce joueur n’a pas de compte DLFR : impossible de lui offrir un objet.'; end if;
 if v_to = v_auth then raise exception 'Tu ne peux pas t’offrir un objet à toi-même : utilise « Acheter ».'; end if;
 select * into v_item from public.dlfr_reward_catalog where item_key = p_item_key and active;
 if not found then raise exception 'Objet indisponible'; end if;
 if (v_item.available_from is not null and v_item.available_from > now()) or (v_item.available_until is not null and v_item.available_until <= now()) then
  raise exception 'Édition limitée : objet hors période de vente'; end if;
 if exists(select 1 from public.dlfr_reward_purchases where auth_user_id = v_to and item_key = p_item_key) then raise exception 'Ce joueur possède déjà cet objet.'; end if;
 v_price := public.dlfr_shop_price(p_item_key);
 if public.dlfr_wallet_balance(v_auth) < v_price then raise exception 'Wayllings dorés insuffisants'; end if;
 insert into public.dlfr_reward_gifts(from_auth, to_auth, item_key, price_paid, message)
  values (v_auth, v_to, p_item_key, v_price, nullif(left(btrim(coalesce(p_message,'')),200),'')) returning id into v_gift;
 insert into public.dlfr_wallet_ledger(auth_user_id, amount, reason, ref, note) values (v_auth, -v_price, 'gift', v_gift::text, 'Cadeau : '||v_item.label);
 insert into public.dlfr_reward_purchases(auth_user_id, item_key, price_paid, gift_from) values (v_to, p_item_key, 0, v_auth);
 return p_item_key;
end $$;

create or replace function public.dlfr_reward_gifts_inbox(p_mark_seen boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v jsonb;
begin
 if v_auth is null then return '[]'::jsonb; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'item_key',g.item_key,'label',c.label,'emoji',c.emoji,'message',g.message,'created_at',g.created_at,'seen',g.seen_at is not null,
   'from', coalesce((select coalesce(nullif(p.display_name,''),p.username,o.player_key) from public.player_profile_owners o join public.players p on p.player_key=o.player_key where o.auth_user_id=g.from_auth limit 1),'Un joueur')) order by g.created_at desc),'[]'::jsonb)
  into v from public.dlfr_reward_gifts g join public.dlfr_reward_catalog c on c.item_key = g.item_key
  where g.to_auth = v_auth and g.created_at > now() - interval '60 days';
 if p_mark_seen then update public.dlfr_reward_gifts set seen_at = now() where to_auth = v_auth and seen_at is null; end if;
 return v;
end $$;

-- ============ 5. Équiper (catégorie « name » ajoutée)
create or replace function public.dlfr_reward_equip(p_item_key text, p_category text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_category text;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 if p_category not in ('frame','badge','banner','theme','name') then raise exception 'Catégorie invalide'; end if;
 if p_item_key is null or p_item_key = '' then
  delete from public.dlfr_reward_equipped where auth_user_id = v_auth and category = p_category; return 'retiré'; end if;
 select c.category into v_category from public.dlfr_reward_catalog c
  where c.item_key = p_item_key and c.active and (
   exists(select 1 from public.dlfr_reward_purchases p where p.auth_user_id = v_auth and p.item_key = c.item_key)
   or (exists(select 1 from public.staff_roles s where s.auth_user_id = v_auth and s.role = 'owner')
       and exists(select 1 from public.dlfr_owner_test_items t where t.auth_user_id = v_auth and t.item_key = c.item_key)));
 if v_category is distinct from p_category then raise exception 'Objet non possédé ou catégorie invalide'; end if;
 insert into public.dlfr_reward_equipped(auth_user_id, category, item_key) values (v_auth, p_category, p_item_key)
 on conflict (auth_user_id, category) do update set item_key = excluded.item_key, equipped_at = now();
 return p_item_key;
end $$;

-- ============ 6. Level Packs : Wayllings selon la difficulté
alter table public.dlfr_level_packs add column if not exists reward_coins integer check (reward_coins is null or reward_coins between 0 and 10000);
alter table public.dlfr_level_pack_claims add column if not exists coins integer;

create or replace function public.dlfr_level_pack_coins(p_pack_id bigint)
returns integer language sql stable security definer set search_path = '' as $$
 select coalesce((select reward_coins from public.dlfr_level_packs where id = p_pack_id),
  (select greatest(100, (round(sum(case when d.position<=10 then 220 when d.position<=25 then 160 when d.position<=50 then 115 when d.position<=75 then 85
      when d.position<=150 then 60 when d.position<=300 then 40 when d.position<=600 then 28 else 18 end)/10.0)*10)::int)
     from public.dlfr_level_pack_levels l join public.demons d on d.id = l.demon_id where l.pack_id = p_pack_id), 0) $$;

create or replace function public.dlfr_level_packs_coins()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_object_agg(id::text, jsonb_build_object('coins', public.dlfr_level_pack_coins(id), 'auto', reward_coins is null)), '{}'::jsonb)
   from public.dlfr_level_packs $$;
grant execute on function public.dlfr_level_packs_coins() to anon, authenticated;

create or replace function public.dlfr_set_level_pack_coins(p_pack_id bigint, p_coins integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
 select s.role into v_role from public.staff_roles s where s.auth_user_id = (select auth.uid());
 if v_role is null or v_role not in ('owner','editor','supermoderator','moderator') then raise exception 'Modération requise'; end if;
 if p_coins is not null and (p_coins < 0 or p_coins > 10000) then raise exception 'Montant entre 0 et 10 000'; end if;
 update public.dlfr_level_packs set reward_coins = p_coins, updated_at = now() where id = p_pack_id;
 if not found then raise exception 'Pack introuvable'; end if;
 return public.dlfr_level_pack_coins(p_pack_id);
end $$;

create or replace function public.dlfr_claim_level_pack(p_pack_id bigint)
returns text language plpgsql security definer set search_path = '' as $$
declare v_player text; v_pack public.dlfr_level_packs%rowtype; v_missing bigint; v_coins int;
begin
 if (select auth.uid()) is null then raise exception 'Connexion requise'; end if;
 select o.player_key into v_player from public.player_profile_owners o where o.auth_user_id = (select auth.uid()) limit 1;
 if v_player is null then raise exception 'Profil joueur non lié'; end if;
 select * into v_pack from public.dlfr_level_packs where id = p_pack_id and is_published = true for update;
 if not found then raise exception 'Pack non publié'; end if;
 if exists(select 1 from public.dlfr_level_pack_claims where pack_id = p_pack_id and player_key = v_player) then return 'already_claimed'; end if;
 select count(*) into v_missing from public.dlfr_level_pack_levels l join public.demons d on d.id = l.demon_id
  where l.pack_id = p_pack_id and (d.is_public is distinct from true or d.legacy is true or d.unrated is true or
   not exists(select 1 from public.completions c where c.demon_id = l.demon_id and c.progress = 100 and lower(btrim(c.player)) = lower(btrim(v_player))));
 if v_missing > 0 or not exists(select 1 from public.dlfr_level_pack_levels where pack_id = p_pack_id)
  then raise exception 'Tous les niveaux du pack doivent avoir une complétion validée à 100 %%'; end if;
 v_coins := public.dlfr_level_pack_coins(p_pack_id);
 insert into public.dlfr_level_pack_claims(pack_id, player_key, coins) values (p_pack_id, v_player, v_coins);
 if v_pack.reward_kind = 'title' and v_pack.reward_title_id is not null then
  insert into public.player_profile_titles(player_key, title_id) values (v_player, v_pack.reward_title_id) on conflict do nothing; end if;
 if v_coins > 0 then
  insert into public.dlfr_wallet_ledger(auth_user_id, amount, reason, ref, note)
  values ((select auth.uid()), v_coins, 'level_pack', p_pack_id::text, 'Level Pack : '||v_pack.title) on conflict do nothing; end if;
 return 'claimed';
end $$;

-- Rétroactif : les packs déjà récupérés rapportent aussi leurs Wayllings
update public.dlfr_level_pack_claims c set coins = public.dlfr_level_pack_coins(c.pack_id) where coins is null;
insert into public.dlfr_wallet_ledger(auth_user_id, amount, reason, ref, note)
select o.auth_user_id, c.coins, 'level_pack', c.pack_id::text, 'Level Pack (rétroactif) : '||p.title
  from public.dlfr_level_pack_claims c join public.dlfr_level_packs p on p.id = c.pack_id
  join public.player_profile_owners o on o.player_key = c.player_key
 where c.coins > 0
on conflict do nothing;

-- ============ 7. DLFR Cards réel
drop policy if exists dlfr_cards_public_read on public.dlfr_cards;
create policy dlfr_cards_public_read on public.dlfr_cards for select using (true);
drop policy if exists dlfr_card_collections_public_read on public.dlfr_card_collections;
create policy dlfr_card_collections_public_read on public.dlfr_card_collections for select using (true);

create table if not exists public.dlfr_card_inventory(
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 card_id bigint not null references public.dlfr_cards(id) on delete cascade,
 qty integer not null default 0 check (qty >= 0),
 first_at timestamptz not null default now(),
 primary key (auth_user_id, card_id));
create table if not exists public.dlfr_card_state(
 auth_user_id uuid primary key references auth.users(id) on delete cascade,
 last_daily date, pity integer not null default 0, opened integer not null default 0);
create table if not exists public.dlfr_card_openings(
 id bigserial primary key,
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 source text not null check (source in ('daily','shop')),
 cards bigint[] not null, created_at timestamptz not null default now());
create table if not exists public.dlfr_card_collection_rewards(
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 collection_id bigint not null references public.dlfr_card_collections(id) on delete cascade,
 coins integer not null, claimed_at timestamptz not null default now(),
 primary key (auth_user_id, collection_id));
do $$ declare t text; begin
 foreach t in array array['dlfr_card_inventory','dlfr_card_state','dlfr_card_openings','dlfr_card_collection_rewards'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists %I on public.%I', t||'_own', t);
  execute format('create policy %I on public.%I for select to authenticated using (auth_user_id = (select auth.uid()))', t||'_own', t);
  execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
 end loop; end $$;

create or replace function public.dlfr_card_value(p_rarity text)
returns integer language sql immutable set search_path = '' as $$
 select case p_rarity when 'Commun' then 2 when 'Rare' then 5 when 'Épique' then 15 when 'Légendaire' then 40 when 'Mythique' then 120 else 2 end $$;

create or replace function public.dlfr_cards_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); s public.dlfr_card_state; v_today date := (now() at time zone 'Europe/Paris')::date;
begin
 if v_auth is null then return jsonb_build_object('signed_in', false, 'booster_price', 150); end if;
 select * into s from public.dlfr_card_state where auth_user_id = v_auth;
 return jsonb_build_object('signed_in', true, 'balance', public.dlfr_wallet_balance(v_auth), 'booster_price', 150,
  'daily_available', s.last_daily is null or s.last_daily < v_today,
  'next_daily', ((v_today + 1)::timestamp at time zone 'Europe/Paris'),
  'pity', coalesce(s.pity, 0), 'opened', coalesce(s.opened, 0),
  'inventory', coalesce((select jsonb_object_agg(card_id::text, qty) from public.dlfr_card_inventory where auth_user_id = v_auth and qty > 0), '{}'::jsonb),
  'collections_done', coalesce((select jsonb_agg(collection_id) from public.dlfr_card_collection_rewards where auth_user_id = v_auth), '[]'::jsonb),
  'duplicates_value', coalesce((select sum((i.qty-1) * public.dlfr_card_value(c.rarity)) from public.dlfr_card_inventory i join public.dlfr_cards c on c.id = i.card_id where i.auth_user_id = v_auth and i.qty > 1), 0));
end $$;

create or replace function public.dlfr_cards_open(p_source text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_auth uuid := (select auth.uid()); s public.dlfr_card_state; v_today date := (now() at time zone 'Europe/Paris')::date;
 v_open bigint; v_r float8; v_rar text; v_card public.dlfr_cards; v_ids bigint[] := '{}'; v_out jsonb := '[]'::jsonb; v_new boolean;
 v_order text[] := array['Commun','Rare','Épique','Légendaire','Mythique']; v_idx int; v_bonus jsonb := '[]'::jsonb; c record; i int;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 if p_source not in ('daily','shop') then raise exception 'Source invalide'; end if;
 if not exists(select 1 from public.dlfr_cards where in_packs) then raise exception 'Aucune carte disponible dans les boosters.'; end if;
 insert into public.dlfr_card_state(auth_user_id) values (v_auth) on conflict do nothing;
 select * into s from public.dlfr_card_state where auth_user_id = v_auth for update;
 if p_source = 'daily' then
  if s.last_daily is not null and s.last_daily >= v_today then raise exception 'Booster gratuit déjà ouvert aujourd’hui. Reviens demain !'; end if;
  update public.dlfr_card_state set last_daily = v_today where auth_user_id = v_auth;
 else
  perform 1 from auth.users where id = v_auth for update;
  if public.dlfr_wallet_balance(v_auth) < 150 then raise exception 'Wayllings dorés insuffisants (150 nécessaires).'; end if;
 end if;
 insert into public.dlfr_card_openings(auth_user_id, source, cards) values (v_auth, p_source, '{}') returning id into v_open;
 if p_source = 'shop' then
  insert into public.dlfr_wallet_ledger(auth_user_id, amount, reason, ref, note) values (v_auth, -150, 'booster', v_open::text, 'Booster DLFR Cards');
 end if;
 for i in 1..5 loop
  v_r := random() * 100;
  v_rar := case when v_r < 1 then 'Mythique' when v_r < 5 then 'Légendaire' when v_r < 15 then 'Épique' when v_r < 42 then 'Rare' else 'Commun' end;
  if i = 5 and v_rar = 'Commun' then v_rar := 'Rare'; end if;                  -- dernière carte : Rare ou mieux
  if s.pity + i >= 40 and array_position(v_order, v_rar) < 4 then v_rar := 'Légendaire'; end if; -- garantie Légendaire
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
 update public.dlfr_card_state set pity = greatest(0, s.pity + 5), opened = opened + 1 where auth_user_id = v_auth;
 update public.dlfr_card_openings set cards = v_ids where id = v_open;
 -- Collections complètes : 40 Wayllings par carte de la collection, une seule fois
 for c in select col.id, col.name, count(k.id)::int n from public.dlfr_card_collections col join public.dlfr_cards k on k.collection_id = col.id
   where not exists(select 1 from public.dlfr_card_collection_rewards r where r.auth_user_id = v_auth and r.collection_id = col.id)
   group by col.id, col.name
   having count(k.id) > 0 and count(k.id) = count(*) filter (where exists(select 1 from public.dlfr_card_inventory i where i.auth_user_id = v_auth and i.card_id = k.id and i.qty > 0))
 loop
  insert into public.dlfr_card_collection_rewards(auth_user_id, collection_id, coins) values (v_auth, c.id, c.n * 40);
  insert into public.dlfr_wallet_ledger(auth_user_id, amount, reason, ref, note) values (v_auth, c.n * 40, 'collection', c.id::text, 'Collection complète : '||c.name) on conflict do nothing;
  v_bonus := v_bonus || jsonb_build_array(jsonb_build_object('collection', c.name, 'coins', c.n * 40));
 end loop;
 return jsonb_build_object('cards', v_out, 'bonuses', v_bonus, 'balance', public.dlfr_wallet_balance(v_auth));
end $$;

create or replace function public.dlfr_cards_recycle(p_card_id bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_gain int; v_n int;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 perform 1 from auth.users where id = v_auth for update;
 select coalesce(sum((i.qty-1) * public.dlfr_card_value(c.rarity)),0), coalesce(sum(i.qty-1),0) into v_gain, v_n
   from public.dlfr_card_inventory i join public.dlfr_cards c on c.id = i.card_id
  where i.auth_user_id = v_auth and i.qty > 1 and (p_card_id is null or i.card_id = p_card_id);
 if v_n = 0 then raise exception 'Aucun doublon à recycler.'; end if;
 update public.dlfr_card_inventory set qty = 1 where auth_user_id = v_auth and qty > 1 and (p_card_id is null or card_id = p_card_id);
 insert into public.dlfr_wallet_ledger(auth_user_id, amount, reason, ref, note)
  values (v_auth, v_gain, 'recycle', gen_random_uuid()::text, v_n||' doublon(s) recyclé(s)');
 return jsonb_build_object('gained', v_gain, 'recycled', v_n, 'balance', public.dlfr_wallet_balance(v_auth));
end $$;

-- Collection publique (fiche joueur) : nombre de cartes différentes possédées
create or replace function public.dlfr_cards_public(p_player_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('owned', (select count(*) from public.dlfr_card_inventory i join public.player_profile_owners o on o.auth_user_id = i.auth_user_id where o.player_key = p_player_key and i.qty > 0),
   'total', (select count(*) from public.dlfr_cards)) $$;
grant execute on function public.dlfr_cards_public(text) to anon, authenticated;

-- ============ 8. Statut boutique : nouveau solde + historique
create or replace function public.dlfr_rewards_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_inventory jsonb; v_equipped jsonb; v_streak int := 0; v_trials jsonb; v_cursor date; v_week date;
begin
 if v_auth is null then return jsonb_build_object('signed_in', false); end if;
 select coalesce(jsonb_agg(item_key),'[]'::jsonb) into v_inventory from public.dlfr_reward_purchases where auth_user_id = v_auth;
 select coalesce(jsonb_agg(item_key),'[]'::jsonb) into v_trials from public.dlfr_owner_test_items where auth_user_id = v_auth;
 v_inventory := v_inventory || v_trials;
 select coalesce(jsonb_object_agg(category, item_key),'{}'::jsonb) into v_equipped from public.dlfr_reward_equipped where auth_user_id = v_auth;
 v_week := date_trunc('week', now() at time zone 'UTC')::date;
 if not exists(select 1 from public.dlfr_weekly_rewards where auth_user_id = v_auth and week_start = v_week) then v_week := v_week - 7; end if;
 v_cursor := v_week;
 while exists(select 1 from public.dlfr_weekly_rewards where auth_user_id = v_auth and week_start = v_cursor) loop
  v_streak := v_streak + 1; v_cursor := v_cursor - 7; exit when v_streak >= 520; end loop;
 return jsonb_build_object('signed_in', true, 'balance', public.dlfr_wallet_balance(v_auth),
  'earned', coalesce((select sum(coins) from public.dlfr_weekly_rewards where auth_user_id = v_auth),0) + coalesce((select sum(amount) from public.dlfr_wallet_ledger where auth_user_id = v_auth and amount > 0),0),
  'spent', coalesce((select sum(price_paid) from public.dlfr_reward_purchases where auth_user_id = v_auth),0) - coalesce((select sum(amount) from public.dlfr_wallet_ledger where auth_user_id = v_auth and amount < 0),0),
  'inventory', v_inventory, 'test_inventory', v_trials, 'equipped', v_equipped, 'streak', v_streak,
  'history', coalesce((select jsonb_agg(h.x order by h.x->>'at' desc) from (select u.x from (
     select jsonb_build_object('amount', coins, 'note', 'Défi de la semaine', 'at', claimed_at) as x from public.dlfr_weekly_rewards where auth_user_id = v_auth
     union all select jsonb_build_object('amount', amount, 'note', coalesce(note, reason), 'at', created_at) from public.dlfr_wallet_ledger where auth_user_id = v_auth
     union all select jsonb_build_object('amount', -price_paid, 'note', 'Achat : '||c.label, 'at', p.purchased_at) from public.dlfr_reward_purchases p join public.dlfr_reward_catalog c on c.item_key = p.item_key where p.auth_user_id = v_auth and p.price_paid > 0
     ) u order by u.x->>'at' desc limit 40) h), '[]'::jsonb));
end $$;

-- ============ 9. Droits
do $$ declare f text; begin
 foreach f in array array['dlfr_shop_rotation(date)','dlfr_shop_price(text)','dlfr_level_pack_coins(bigint)','dlfr_card_value(text)'] loop
  execute format('revoke all on function public.%s from public, anon', f); execute format('grant execute on function public.%s to authenticated', f); end loop;
 foreach f in array array['dlfr_reward_buy(text)','dlfr_reward_gift(text,text,text)','dlfr_reward_gifts_inbox(boolean)','dlfr_reward_equip(text,text)','dlfr_set_level_pack_coins(bigint,integer)',
   'dlfr_claim_level_pack(bigint)','dlfr_cards_status()','dlfr_cards_open(text)','dlfr_cards_recycle(bigint)','dlfr_rewards_status()'] loop
  execute format('revoke all on function public.%s from public, anon', f); execute format('grant execute on function public.%s to authenticated', f); end loop;
end $$;
grant execute on function public.dlfr_cards_status() to anon;

-- DLFR V160 — Boss communautaire hebdomadaire + Saisons de 4 semaines (DLFR Cards).
-- Tout est calculé par le serveur (collection enregistrée sur Supabase) : impossible à tricher
-- depuis le navigateur.

-- ============================================================ Puissance serveur
-- Valeur de chaque carte possédée selon sa rareté, + 10 % par exemplaire supplémentaire (max 10).
create or replace function public.dlfr_cards_power(p_auth uuid)
returns integer language sql stable security definer set search_path = '' as $$
 select coalesce(round(sum(v * (1 + 0.1 * (least(i.qty + i.adv_qty, 10) - 1))))::int, 0)
 from public.dlfr_card_inventory i join public.dlfr_cards c on c.id = i.card_id
 cross join lateral (select case c.rarity when 'Commun' then 1 when 'Rare' then 2 when 'Épique' then 4 when 'Légendaire' then 8
   when 'Mythique' then 16 when 'Ultra' then 40 when 'Secrète' then 60 when 'Festive' then 8 else 1 end v) x
 where i.auth_user_id = p_auth and i.qty + i.adv_qty > 0 $$;
revoke all on function public.dlfr_cards_power(uuid) from public, anon, authenticated;

create or replace function public.dlfr_player_name(p_auth uuid)
returns text language sql stable security definer set search_path = '' as $$
 select coalesce(nullif(p.display_name,''), p.username, o.player_key, 'Joueur')
 from public.player_profile_owners o left join public.players p on p.player_key = o.player_key
 where o.auth_user_id = p_auth limit 1 $$;
revoke all on function public.dlfr_player_name(uuid) from public, anon, authenticated;

-- ============================================================ Saisons
create table if not exists public.dlfr_seasons(
 id bigint generated always as identity primary key,
 name text not null check (char_length(name) between 1 and 60),
 description text not null default '' check (char_length(description) <= 300),
 starts_on date not null, ends_on date not null check (ends_on > starts_on),
 reward_card_id bigint references public.dlfr_cards(id) on delete set null,
 created_at timestamptz not null default now());
create table if not exists public.dlfr_season_progress(
 season_id bigint not null references public.dlfr_seasons(id) on delete cascade,
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 xp integer not null default 0, day date, day_xp integer not null default 0,
 last_checkin date, claimed integer[] not null default '{}',
 primary key (season_id, auth_user_id));
alter table public.dlfr_seasons enable row level security;
alter table public.dlfr_season_progress enable row level security;
revoke all on public.dlfr_seasons from anon, authenticated;
revoke all on public.dlfr_season_progress from anon, authenticated;

-- 28 paliers de 1 000 XP ; au plus 1 200 XP de saison par jour (≈ 24 jours de jeu pour tout finir).
create or replace function public.dlfr_season_current()
returns public.dlfr_seasons language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'Europe/Paris')::date; s public.dlfr_seasons; n int;
begin
 select * into s from public.dlfr_seasons where v_today >= starts_on and v_today < ends_on order by starts_on desc limit 1;
 if found then return s; end if;
 select count(*) into n from public.dlfr_seasons;
 insert into public.dlfr_seasons(name, starts_on, ends_on)
 values ('Saison ' || (n + 1), v_today - ((extract(isodow from v_today)::int) - 1), v_today - ((extract(isodow from v_today)::int) - 1) + 28)
 returning * into s;
 return s;
end $$;
revoke all on function public.dlfr_season_current() from public, anon, authenticated;

create or replace function public.dlfr_season_add_xp(p_auth uuid, p_amount integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare s public.dlfr_seasons := public.dlfr_season_current(); v_today date := (now() at time zone 'Europe/Paris')::date;
 r public.dlfr_season_progress; v_add int;
begin
 if p_auth is null or coalesce(p_amount, 0) <= 0 then return 0; end if;
 insert into public.dlfr_season_progress(season_id, auth_user_id) values (s.id, p_auth) on conflict do nothing;
 select * into r from public.dlfr_season_progress where season_id = s.id and auth_user_id = p_auth for update;
 if r.day is distinct from v_today then r.day_xp := 0; end if;
 v_add := greatest(0, least(p_amount, 1200 - r.day_xp));
 update public.dlfr_season_progress set xp = least(28000, xp + v_add), day = v_today, day_xp = r.day_xp + v_add
  where season_id = s.id and auth_user_id = p_auth;
 return v_add;
end $$;
revoke all on function public.dlfr_season_add_xp(uuid, integer) from public, anon, authenticated;

-- Récompense d'un palier : Wayllings dorés, carte aléatoire (Rare+ / Épique+), carte exclusive aux paliers 14 et 28.
create or replace function public.dlfr_season_tier_reward(p_tier integer)
returns jsonb language sql immutable set search_path = '' as $$
 select case
  when p_tier in (14, 28) then jsonb_build_object('kind','exclusive','label','Carte exclusive de la saison')
  when p_tier % 7 = 0 then jsonb_build_object('kind','card','min',3,'label','Carte Légendaire ou mieux')
  when p_tier % 3 = 0 then jsonb_build_object('kind','card','min',2,'label','Carte Épique ou mieux')
  when p_tier % 2 = 0 then jsonb_build_object('kind','card','min',1,'label','Carte Rare ou mieux')
  else jsonb_build_object('kind','coins','coins',20 + p_tier * 2,'label',(20 + p_tier * 2)||' Wayllings dorés') end $$;

create or replace function public.dlfr_give_random_card(p_auth uuid, p_min_tier integer)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
 select k.id into v_id from public.dlfr_cards k join public.dlfr_card_collections col on col.id = k.collection_id
  where col.is_published and k.in_packs and k.rarity <> 'Secrète' and k.rarity <> 'Festive'
    and array_position(array['Commun','Rare','Épique','Légendaire','Mythique','Ultra'], k.rarity) - 1 >= p_min_tier
    and k.rarity <> 'Ultra'
  order by random() limit 1;
 if v_id is null then return null; end if;
 insert into public.dlfr_card_inventory(auth_user_id, card_id, qty) values (p_auth, v_id, 1)
  on conflict (auth_user_id, card_id) do update set qty = public.dlfr_card_inventory.qty + 1;
 return v_id;
end $$;
revoke all on function public.dlfr_give_random_card(uuid, integer) from public, anon, authenticated;

create or replace function public.dlfr_season_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); s public.dlfr_seasons := public.dlfr_season_current();
 v_today date := (now() at time zone 'Europe/Paris')::date; r public.dlfr_season_progress;
begin
 if v_auth is not null then select * into r from public.dlfr_season_progress where season_id = s.id and auth_user_id = v_auth; end if;
 return jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description, 'starts_on', s.starts_on, 'ends_on', s.ends_on,
  'reward_card_id', s.reward_card_id, 'signed_in', v_auth is not null, 'editor', coalesce(public.dlfr_cards_lab_access(), false),
  'xp', coalesce(r.xp, 0), 'day_xp', case when r.day = v_today then r.day_xp else 0 end, 'day_cap', 1200, 'tier_xp', 1000, 'tiers', 28,
  'checked_in', coalesce(r.last_checkin = v_today, false), 'claimed', to_jsonb(coalesce(r.claimed, '{}')),
  'rewards', (select jsonb_agg(public.dlfr_season_tier_reward(t) order by t) from generate_series(1, 28) t),
  'top', coalesce((select jsonb_agg(jsonb_build_object('name', public.dlfr_player_name(p.auth_user_id), 'xp', p.xp, 'me', p.auth_user_id = v_auth) order by p.xp desc)
     from (select * from public.dlfr_season_progress where season_id = s.id and xp > 0 order by xp desc limit 10) p), '[]'::jsonb));
end $$;
grant execute on function public.dlfr_season_status() to anon, authenticated;

create or replace function public.dlfr_season_checkin()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); s public.dlfr_seasons := public.dlfr_season_current();
 v_today date := (now() at time zone 'Europe/Paris')::date; v_add int;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 insert into public.dlfr_season_progress(season_id, auth_user_id) values (s.id, v_auth) on conflict do nothing;
 perform 1 from public.dlfr_season_progress where season_id = s.id and auth_user_id = v_auth and last_checkin = v_today;
 if found then raise exception 'Déjà récupéré aujourd’hui : reviens demain !'; end if;
 update public.dlfr_season_progress set last_checkin = v_today where season_id = s.id and auth_user_id = v_auth;
 v_add := public.dlfr_season_add_xp(v_auth, 300);
 return jsonb_build_object('xp', v_add);
end $$;
revoke all on function public.dlfr_season_checkin() from public, anon;
grant execute on function public.dlfr_season_checkin() to authenticated;

create or replace function public.dlfr_season_claim(p_tier integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); s public.dlfr_seasons := public.dlfr_season_current();
 r public.dlfr_season_progress; rw jsonb; v_card bigint; v_coins int := 0;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 if p_tier not between 1 and 28 then raise exception 'Palier inconnu'; end if;
 select * into r from public.dlfr_season_progress where season_id = s.id and auth_user_id = v_auth for update;
 if not found or r.xp < p_tier * 1000 then raise exception 'Palier pas encore atteint'; end if;
 if p_tier = any(r.claimed) then raise exception 'Récompense déjà récupérée'; end if;
 rw := public.dlfr_season_tier_reward(p_tier);
 if rw->>'kind' = 'coins' then
  v_coins := (rw->>'coins')::int;
  insert into public.dlfr_wallet_ledger(auth_user_id, amount, reason, ref, note) values (v_auth, v_coins, 'season', s.id||'-'||p_tier, s.name||' · palier '||p_tier) on conflict do nothing;
 elsif rw->>'kind' = 'exclusive' and s.reward_card_id is not null then
  v_card := s.reward_card_id;
  insert into public.dlfr_card_inventory(auth_user_id, card_id, qty) values (v_auth, v_card, 1)
   on conflict (auth_user_id, card_id) do update set qty = public.dlfr_card_inventory.qty + 1;
 else
  v_card := public.dlfr_give_random_card(v_auth, coalesce((rw->>'min')::int, 2));
 end if;
 update public.dlfr_season_progress set claimed = claimed || p_tier where season_id = s.id and auth_user_id = v_auth;
 return jsonb_build_object('tier', p_tier, 'card_id', v_card, 'coins', v_coins, 'balance', public.dlfr_wallet_balance(v_auth), 'bonuses', public.dlfr_cards_check_collections(v_auth));
end $$;
revoke all on function public.dlfr_season_claim(integer) from public, anon;
grant execute on function public.dlfr_season_claim(integer) to authenticated;

create or replace function public.dlfr_season_edit(p_name text, p_description text, p_reward_card_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare s public.dlfr_seasons := public.dlfr_season_current();
begin
 if not coalesce(public.dlfr_cards_lab_access(), false) then raise exception 'Réservé aux propriétaires et supermodérateurs.'; end if;
 if p_reward_card_id is not null and not exists(select 1 from public.dlfr_cards where id = p_reward_card_id) then raise exception 'Carte introuvable'; end if;
 update public.dlfr_seasons set name = coalesce(nullif(left(btrim(p_name), 60), ''), name), description = left(coalesce(p_description, ''), 300),
  reward_card_id = p_reward_card_id where id = s.id;
 return true;
end $$;
revoke all on function public.dlfr_season_edit(text, text, bigint) from public, anon;
grant execute on function public.dlfr_season_edit(text, text, bigint) to authenticated;

-- ============================================================ Boss communautaire
create table if not exists public.dlfr_boss(
 week_start date primary key, demon_name text not null, demon_pos integer,
 max_hp bigint not null, hp bigint not null, defeated_at timestamptz, defeated_by uuid);
create table if not exists public.dlfr_boss_hits(
 week_start date not null references public.dlfr_boss(week_start) on delete cascade,
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 damage bigint not null default 0, attacks integer not null default 0, day date, day_attacks integer not null default 0,
 reward_card_id bigint, reward_coins integer,
 primary key (week_start, auth_user_id));
alter table public.dlfr_boss enable row level security;
alter table public.dlfr_boss_hits enable row level security;
revoke all on public.dlfr_boss from anon, authenticated;
revoke all on public.dlfr_boss_hits from anon, authenticated;

create or replace function public.dlfr_boss_current()
returns public.dlfr_boss language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'Europe/Paris')::date; v_week date; b public.dlfr_boss; d record; v_total bigint; v_hp bigint;
begin
 v_week := v_today - ((extract(isodow from v_today)::int) - 1);
 select * into b from public.dlfr_boss where week_start = v_week;
 if found then return b; end if;
 -- Démon de la semaine : rotation dans le Top 50 de la liste.
 select name, position into d from public.demons
  where coalesce(is_public, true) and not coalesce(legacy, false) and not coalesce(unrated, false) and position between 1 and 50
  order by abs(position - (1 + ((extract(week from v_week)::int * 7) % 50))) limit 1;
 -- Points de vie : ~50 % des dégâts possibles si tous les joueurs actifs attaquent 3 fois par jour.
 select coalesce(sum(public.dlfr_cards_power(a.auth_user_id)), 0) into v_total from public.dlfr_cards_adventure a where a.updated_at > now() - interval '14 days';
 v_hp := greatest(20000, round(v_total * 21 * 0.5));
 insert into public.dlfr_boss(week_start, demon_name, demon_pos, max_hp, hp)
 values (v_week, coalesce(d.name, 'Démon mystère'), d.position, v_hp, v_hp) on conflict do nothing;
 select * into b from public.dlfr_boss where week_start = v_week;
 return b;
end $$;
revoke all on function public.dlfr_boss_current() from public, anon, authenticated;

create or replace function public.dlfr_boss_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); b public.dlfr_boss := public.dlfr_boss_current();
 v_today date := (now() at time zone 'Europe/Paris')::date; h public.dlfr_boss_hits;
begin
 if v_auth is not null then select * into h from public.dlfr_boss_hits where week_start = b.week_start and auth_user_id = v_auth; end if;
 return jsonb_build_object('week_start', b.week_start, 'ends', b.week_start + 7, 'demon', b.demon_name, 'position', b.demon_pos,
  'max_hp', b.max_hp, 'hp', b.hp, 'defeated', b.defeated_at is not null, 'defeated_at', b.defeated_at,
  'defeated_by', case when b.defeated_by is not null then public.dlfr_player_name(b.defeated_by) end,
  'signed_in', v_auth is not null, 'power', case when v_auth is not null then public.dlfr_cards_power(v_auth) end,
  'my_damage', coalesce(h.damage, 0), 'my_attacks', coalesce(h.attacks, 0),
  'attacks_left', case when v_auth is null then 0 else 3 - (case when h.day = v_today then h.day_attacks else 0 end) end,
  'reward_card_id', h.reward_card_id, 'reward_coins', h.reward_coins,
  'players', (select count(*) from public.dlfr_boss_hits where week_start = b.week_start),
  'top', coalesce((select jsonb_agg(jsonb_build_object('name', public.dlfr_player_name(x.auth_user_id), 'damage', x.damage, 'me', x.auth_user_id = v_auth) order by x.damage desc)
     from (select * from public.dlfr_boss_hits where week_start = b.week_start order by damage desc limit 10) x), '[]'::jsonb));
end $$;
grant execute on function public.dlfr_boss_status() to anon, authenticated;

-- Une attaque : dégâts = puissance de collection × (0,8 à 1,2). 3 attaques par jour (heure de Paris).
-- Quand le boss tombe : chaque participant gagne une carte Épique ou mieux + Wayllings dorés
-- (Top 1 : 150 ✦, Top 2-3 : 100 ✦, autres : 40 ✦).
create or replace function public.dlfr_boss_attack()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); b public.dlfr_boss := public.dlfr_boss_current();
 v_today date := (now() at time zone 'Europe/Paris')::date; h public.dlfr_boss_hits; v_power int; v_dmg bigint; v_left int;
 x record; v_rank int := 0; v_coins int; v_card bigint; v_season int;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 select * into b from public.dlfr_boss where week_start = b.week_start for update;
 if b.defeated_at is not null then raise exception 'Le boss de la semaine est déjà vaincu. Rendez-vous lundi !'; end if;
 v_power := public.dlfr_cards_power(v_auth);
 if v_power <= 0 then raise exception 'Il te faut au moins une carte dans ta collection pour attaquer.'; end if;
 insert into public.dlfr_boss_hits(week_start, auth_user_id) values (b.week_start, v_auth) on conflict do nothing;
 select * into h from public.dlfr_boss_hits where week_start = b.week_start and auth_user_id = v_auth for update;
 if h.day = v_today and h.day_attacks >= 3 then raise exception 'Plus d’attaque aujourd’hui : reviens demain !'; end if;
 v_dmg := greatest(1, round(v_power * (0.8 + random() * 0.4)));
 update public.dlfr_boss_hits set damage = damage + v_dmg, attacks = attacks + 1, day = v_today,
   day_attacks = case when day = v_today then day_attacks + 1 else 1 end
  where week_start = b.week_start and auth_user_id = v_auth;
 update public.dlfr_boss set hp = greatest(0, hp - v_dmg) where week_start = b.week_start returning * into b;
 v_season := public.dlfr_season_add_xp(v_auth, 150);
 if b.hp = 0 then
  update public.dlfr_boss set defeated_at = now(), defeated_by = v_auth where week_start = b.week_start;
  for x in select auth_user_id from public.dlfr_boss_hits where week_start = b.week_start order by damage desc loop
   v_rank := v_rank + 1; v_coins := case when v_rank = 1 then 150 when v_rank <= 3 then 100 else 40 end;
   v_card := public.dlfr_give_random_card(x.auth_user_id, 2);
   insert into public.dlfr_wallet_ledger(auth_user_id, amount, reason, ref, note)
    values (x.auth_user_id, v_coins, 'boss', b.week_start::text, 'Boss vaincu : '||b.demon_name) on conflict do nothing;
   update public.dlfr_boss_hits set reward_card_id = v_card, reward_coins = v_coins where week_start = b.week_start and auth_user_id = x.auth_user_id;
  end loop;
 end if;
 return jsonb_build_object('damage', v_dmg, 'hp', b.hp, 'max_hp', b.max_hp, 'defeated', b.hp = 0, 'season_xp', v_season);
end $$;
revoke all on function public.dlfr_boss_attack() from public, anon;
grant execute on function public.dlfr_boss_attack() to authenticated;

-- ============================================================ Sources d'XP de saison
-- Cartes ajoutées depuis le mode Aventure : +2 XP par carte (100 max par synchronisation).
create or replace function public.dlfr_adventure_sync(p_delta jsonb, p_import boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); s public.dlfr_card_state; v_today date := (now() at time zone 'Europe/Paris')::date;
 e record; q record; v_id bigint; v_d int; v_left int; v_take int; v_added int := 0; v_dropped int := 0; v_queued int := 0;
 v_delivered int := 0; v_qroom int; v_cur public.dlfr_card_inventory;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 if p_delta is null or jsonb_typeof(p_delta) <> 'object' then raise exception 'Synchronisation invalide'; end if;
 insert into public.dlfr_card_state(auth_user_id) values (v_auth) on conflict do nothing;
 select * into s from public.dlfr_card_state where auth_user_id = v_auth for update;
 if p_import and s.adv_imported then p_import := false; end if;
 if s.adv_day is distinct from v_today then s.adv_added := 0; end if;
 v_left := 1000000;

 -- 1) Livraison des cartes mises de côté les jours précédents.
 if not p_import then
  for q in select card_id, qty from public.dlfr_card_adv_queue where auth_user_id = v_auth order by card_id for update loop
   exit when v_left <= 0;
   v_take := least(q.qty, v_left);
   insert into public.dlfr_card_inventory(auth_user_id, card_id, qty, adv_qty) values (v_auth, q.card_id, 0, v_take)
    on conflict (auth_user_id, card_id) do update set adv_qty = public.dlfr_card_inventory.adv_qty + v_take;
   if v_take = q.qty then delete from public.dlfr_card_adv_queue where auth_user_id = v_auth and card_id = q.card_id;
   else update public.dlfr_card_adv_queue set qty = qty - v_take where auth_user_id = v_auth and card_id = q.card_id; end if;
   v_left := v_left - v_take; v_delivered := v_delivered + v_take;
  end loop;
 end if;
 select greatest(0, 2000 - coalesce(sum(qty), 0))::int into v_qroom from public.dlfr_card_adv_queue where auth_user_id = v_auth;

 -- 2) Nouvelles cartes : dans la limite du jour, le reste part en file d'attente (2 000 max).
 for e in select key, value from jsonb_each(p_delta) order by key loop
  if e.key !~ '^[0-9]{1,15}$' or jsonb_typeof(e.value) <> 'number' then continue; end if;
  v_id := e.key::bigint; v_d := greatest(-1000, least(1000, (e.value)::text::int));
  if v_d = 0 or not exists(select 1 from public.dlfr_cards where id = v_id) then continue; end if;
  if v_d > 0 then
   if exists(select 1 from public.dlfr_cards k join public.dlfr_card_collections col on col.id = k.collection_id where k.id = v_id and (k.rarity = 'Festive' or not col.is_published)) then v_dropped := v_dropped + v_d; continue; end if;
   v_take := least(v_d, v_left);
   if v_take > 0 then
    insert into public.dlfr_card_inventory(auth_user_id, card_id, qty, adv_qty) values (v_auth, v_id, 0, v_take)
     on conflict (auth_user_id, card_id) do update set adv_qty = public.dlfr_card_inventory.adv_qty + v_take;
    v_left := v_left - v_take; v_added := v_added + v_take;
   end if;
   v_d := v_d - v_take;
   if v_d > 0 and not p_import then
    v_take := least(v_d, v_qroom);
    if v_take > 0 then
     insert into public.dlfr_card_adv_queue(auth_user_id, card_id, qty) values (v_auth, v_id, v_take)
      on conflict (auth_user_id, card_id) do update set qty = public.dlfr_card_adv_queue.qty + v_take;
     v_qroom := v_qroom - v_take; v_queued := v_queued + v_take;
    end if;
    v_d := v_d - v_take;
   end if;
   v_dropped := v_dropped + greatest(0, v_d);
  else
   select * into v_cur from public.dlfr_card_inventory where auth_user_id = v_auth and card_id = v_id for update;
   if found then
    v_take := least(-v_d, v_cur.adv_qty);
    update public.dlfr_card_inventory set adv_qty = adv_qty - v_take, qty = greatest(0, qty - (-v_d - v_take)) where auth_user_id = v_auth and card_id = v_id;
   end if;
  end if;
 end loop;
 if v_added > 0 and not p_import then perform public.dlfr_season_add_xp(v_auth, least(100, v_added * 2)); end if; -- V160 : XP de saison
 update public.dlfr_card_state set adv_day = v_today,
   adv_added = case when p_import then s.adv_added else s.adv_added + v_added + v_delivered end,
   adv_imported = adv_imported or p_import
  where auth_user_id = v_auth;
 return jsonb_build_object('inventory', public.dlfr_cards_inventory_of(v_auth), 'added', v_added, 'dropped', v_dropped,
  'queued', v_queued, 'delivered', v_delivered,
  'queue_total', (select coalesce(sum(qty), 0) from public.dlfr_card_adv_queue where auth_user_id = v_auth),
  'imported', p_import, 'left_today', null,
  'bonuses', public.dlfr_cards_check_collections(v_auth), 'balance', public.dlfr_wallet_balance(v_auth));
end $$;
revoke all on function public.dlfr_adventure_sync(jsonb, boolean) from public, anon;
grant execute on function public.dlfr_adventure_sync(jsonb, boolean) to authenticated;

-- Case du calendrier de l'Avent : +200 XP.
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
 perform public.dlfr_season_add_xp(v_auth, 200); -- V160 : XP de saison
 return jsonb_build_object('day', p_day, 'card_id', d.card_id, 'rarity', v_rarity, 'is_new', v_new, 'coins', d.coins, 'title', d.title,
  'bonuses', public.dlfr_cards_check_collections(v_auth), 'balance', public.dlfr_wallet_balance(v_auth));
end $$;

revoke all on function public.dlfr_advent_open(integer) from public, anon;
grant execute on function public.dlfr_advent_open(integer) to authenticated;

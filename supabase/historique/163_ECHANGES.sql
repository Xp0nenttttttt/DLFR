-- DLFR V163 — Échanges de cartes entre joueurs (sans argent réel), exécutés par Supabase.
-- Règles : jusqu'à 5 cartes de chaque côté, seulement des DOUBLONS (on garde toujours 1 exemplaire),
-- cartes publiées uniquement (ni secrètes ni festives), 10 offres ouvertes max, 5 échanges conclus
-- par jour et par joueur. Les possessions sont revérifiées au moment de l'acceptation.

create table if not exists public.dlfr_trades(
 id bigint generated always as identity primary key,
 from_user uuid not null references auth.users(id) on delete cascade,
 to_user uuid references auth.users(id) on delete cascade,          -- null = offre publique
 give jsonb not null, want jsonb not null,
 message text check (message is null or char_length(message) <= 200),
 status text not null default 'open' check (status in ('open','accepted','cancelled','declined')),
 accepted_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), done_at timestamptz);
create index if not exists dlfr_trades_open_idx on public.dlfr_trades(status, to_user);
create table if not exists public.dlfr_wishlist(
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 card_id bigint not null references public.dlfr_cards(id) on delete cascade,
 created_at timestamptz not null default now(), primary key (auth_user_id, card_id));
alter table public.dlfr_trades enable row level security;
alter table public.dlfr_wishlist enable row level security;
revoke all on public.dlfr_trades from anon, authenticated;
revoke all on public.dlfr_wishlist from anon, authenticated;

-- Vérifie et normalise une liste {card_id: qty} (1 à 5 exemplaires au total).
create or replace function public.dlfr_trade_clean(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare e record; out jsonb := '{}'::jsonb; n int := 0; q int;
begin
 if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Liste de cartes invalide'; end if;
 for e in select key, value from jsonb_each(p) loop
  if e.key !~ '^[0-9]{1,15}$' or jsonb_typeof(e.value) <> 'number' then raise exception 'Liste de cartes invalide'; end if;
  q := (e.value)::text::int; if q < 1 then continue; end if;
  if not exists(select 1 from public.dlfr_cards k join public.dlfr_card_collections c on c.id = k.collection_id
     where k.id = e.key::bigint and c.is_published and k.rarity not in ('Secrète','Festive')) then raise exception 'Cette carte ne peut pas être échangée.'; end if;
  out := out || jsonb_build_object(e.key, q); n := n + q;
 end loop;
 if n < 1 or n > 5 then raise exception 'Entre 1 et 5 cartes de chaque côté.'; end if;
 return out;
end $$;
revoke all on function public.dlfr_trade_clean(jsonb) from public, anon, authenticated;

create or replace function public.dlfr_trade_has(p_auth uuid, p jsonb)
returns boolean language sql stable security definer set search_path = '' as $$
 select not exists(select 1 from jsonb_each_text(p) e
  left join public.dlfr_card_inventory i on i.auth_user_id = p_auth and i.card_id = e.key::bigint
  where coalesce(i.qty + i.adv_qty, 0) - e.value::int < 1) $$;
revoke all on function public.dlfr_trade_has(uuid, jsonb) from public, anon, authenticated;

create or replace function public.dlfr_trade_move(p_from uuid, p_to uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare e record; q int; cur public.dlfr_card_inventory; a int;
begin
 for e in select key, value from jsonb_each_text(p) loop
  q := e.value::int;
  select * into cur from public.dlfr_card_inventory where auth_user_id = p_from and card_id = e.key::bigint for update;
  a := least(q, cur.adv_qty);
  update public.dlfr_card_inventory set adv_qty = adv_qty - a, qty = qty - (q - a) where auth_user_id = p_from and card_id = e.key::bigint;
  insert into public.dlfr_card_inventory(auth_user_id, card_id, qty, adv_qty) values (p_to, e.key::bigint, q - a, a)
   on conflict (auth_user_id, card_id) do update set qty = public.dlfr_card_inventory.qty + (q - a), adv_qty = public.dlfr_card_inventory.adv_qty + a;
 end loop;
end $$;
revoke all on function public.dlfr_trade_move(uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function public.dlfr_trade_create(p_to_player text, p_give jsonb, p_want jsonb, p_message text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_to uuid; g jsonb; w jsonb; v_id bigint;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 g := public.dlfr_trade_clean(p_give); w := public.dlfr_trade_clean(p_want);
 if nullif(btrim(coalesce(p_to_player,'')),'') is not null then
  select auth_user_id into v_to from public.player_profile_owners where lower(player_key) = lower(btrim(p_to_player)) limit 1;
  if v_to is null then raise exception 'Ce joueur n’a pas de compte relié.'; end if;
  if v_to = v_auth then raise exception 'Tu ne peux pas échanger avec toi-même.'; end if;
 end if;
 if not public.dlfr_trade_has(v_auth, g) then raise exception 'Tu ne peux proposer que des doublons (tu gardes toujours 1 exemplaire).'; end if;
 if (select count(*) from public.dlfr_trades where from_user = v_auth and status = 'open') >= 10 then raise exception '10 offres ouvertes maximum : annule-en une.'; end if;
 insert into public.dlfr_trades(from_user, to_user, give, want, message) values (v_auth, v_to, g, w, nullif(left(btrim(coalesce(p_message,'')),200),'')) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.dlfr_trade_create(text, jsonb, jsonb, text) from public, anon;
grant execute on function public.dlfr_trade_create(text, jsonb, jsonb, text) to authenticated;

create or replace function public.dlfr_trade_accept(p_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); t public.dlfr_trades; v_today date := (now() at time zone 'Europe/Paris')::date;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 select * into t from public.dlfr_trades where id = p_id for update;
 if not found or t.status <> 'open' then raise exception 'Cette offre n’est plus disponible.'; end if;
 if t.from_user = v_auth then raise exception 'Tu ne peux pas accepter ta propre offre.'; end if;
 if t.to_user is not null and t.to_user <> v_auth then raise exception 'Cette offre est destinée à un autre joueur.'; end if;
 perform 1 from auth.users where id in (t.from_user, v_auth) order by id for update;
 if (select count(*) from public.dlfr_trades where status = 'accepted' and (done_at at time zone 'Europe/Paris')::date = v_today and (from_user = v_auth or accepted_by = v_auth)) >= 5
  then raise exception 'Limite de 5 échanges par jour atteinte : reviens demain.'; end if;
 if (select count(*) from public.dlfr_trades where status = 'accepted' and (done_at at time zone 'Europe/Paris')::date = v_today and (from_user = t.from_user or accepted_by = t.from_user)) >= 5
  then raise exception 'L’autre joueur a atteint sa limite d’échanges du jour.'; end if;
 if not public.dlfr_trade_has(t.from_user, t.give) then
  update public.dlfr_trades set status = 'cancelled', done_at = now() where id = p_id;
  raise exception 'L’auteur de l’offre n’a plus ces cartes en double : offre annulée.'; end if;
 if not public.dlfr_trade_has(v_auth, t.want) then raise exception 'Il te faut ces cartes en double (tu gardes toujours 1 exemplaire).'; end if;
 perform public.dlfr_trade_move(t.from_user, v_auth, t.give);
 perform public.dlfr_trade_move(v_auth, t.from_user, t.want);
 update public.dlfr_trades set status = 'accepted', accepted_by = v_auth, done_at = now() where id = p_id;
 return jsonb_build_object('ok', true, 'inventory', public.dlfr_cards_inventory_of(v_auth), 'bonuses', public.dlfr_cards_check_collections(v_auth));
end $$;
revoke all on function public.dlfr_trade_accept(bigint) from public, anon;
grant execute on function public.dlfr_trade_accept(bigint) to authenticated;

create or replace function public.dlfr_trade_close(p_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); t public.dlfr_trades;
begin
 select * into t from public.dlfr_trades where id = p_id for update;
 if not found or t.status <> 'open' then raise exception 'Cette offre n’est plus ouverte.'; end if;
 if t.from_user = v_auth then update public.dlfr_trades set status = 'cancelled', done_at = now() where id = p_id;
 elsif t.to_user = v_auth then update public.dlfr_trades set status = 'declined', done_at = now() where id = p_id;
 else raise exception 'Action impossible.'; end if;
 return true;
end $$;
revoke all on function public.dlfr_trade_close(bigint) from public, anon;
grant execute on function public.dlfr_trade_close(bigint) to authenticated;

create or replace function public.dlfr_wishlist_toggle(p_card_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid());
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 if exists(select 1 from public.dlfr_wishlist where auth_user_id = v_auth and card_id = p_card_id) then
  delete from public.dlfr_wishlist where auth_user_id = v_auth and card_id = p_card_id; return false; end if;
 if (select count(*) from public.dlfr_wishlist where auth_user_id = v_auth) >= 30 then raise exception '30 cartes maximum dans la liste de souhaits.'; end if;
 if not exists(select 1 from public.dlfr_cards k join public.dlfr_card_collections c on c.id = k.collection_id where k.id = p_card_id and c.is_published and k.rarity not in ('Secrète','Festive')) then raise exception 'Carte introuvable'; end if;
 insert into public.dlfr_wishlist(auth_user_id, card_id) values (v_auth, p_card_id); return true;
end $$;
revoke all on function public.dlfr_wishlist_toggle(bigint) from public, anon;
grant execute on function public.dlfr_wishlist_toggle(bigint) to authenticated;

create or replace function public.dlfr_trades_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_today date := (now() at time zone 'Europe/Paris')::date;
begin
 if v_auth is null then return jsonb_build_object('signed_in', false); end if;
 return jsonb_build_object('signed_in', true,
  'done_today', (select count(*) from public.dlfr_trades where status = 'accepted' and (done_at at time zone 'Europe/Paris')::date = v_today and (from_user = v_auth or accepted_by = v_auth)),
  'incoming', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'from', public.dlfr_player_name(from_user), 'give', give, 'want', want, 'message', message, 'at', created_at) order by created_at desc)
     from public.dlfr_trades where status = 'open' and to_user = v_auth), '[]'::jsonb),
  'outgoing', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'to', case when to_user is null then null else public.dlfr_player_name(to_user) end, 'give', give, 'want', want, 'message', message, 'at', created_at) order by created_at desc)
     from public.dlfr_trades where status = 'open' and from_user = v_auth), '[]'::jsonb),
  'public', coalesce((select jsonb_agg(x order by (x->>'at') desc) from (select jsonb_build_object('id', id, 'from', public.dlfr_player_name(from_user), 'give', give, 'want', want, 'message', message, 'at', created_at) x
     from public.dlfr_trades where status = 'open' and to_user is null and from_user <> v_auth order by created_at desc limit 40) z), '[]'::jsonb),
  'history', coalesce((select jsonb_agg(x order by (x->>'at') desc) from (select jsonb_build_object('id', id, 'status', status, 'mine', from_user = v_auth,
       'other', public.dlfr_player_name(case when from_user = v_auth then coalesce(accepted_by, to_user) else from_user end), 'give', give, 'want', want, 'at', coalesce(done_at, created_at)) x
     from public.dlfr_trades where status <> 'open' and (from_user = v_auth or accepted_by = v_auth or to_user = v_auth) order by coalesce(done_at, created_at) desc limit 20) z), '[]'::jsonb),
  'wishlist', coalesce((select jsonb_agg(card_id) from public.dlfr_wishlist where auth_user_id = v_auth), '[]'::jsonb),
  'wanted', coalesce((select jsonb_agg(jsonb_build_object('player', public.dlfr_player_name(w.auth_user_id), 'player_key', o.player_key, 'card_id', w.card_id))
     from public.dlfr_wishlist w join public.dlfr_card_inventory i on i.auth_user_id = v_auth and i.card_id = w.card_id and i.qty + i.adv_qty >= 2
     left join public.player_profile_owners o on o.auth_user_id = w.auth_user_id
     where w.auth_user_id <> v_auth limit 40), '[]'::jsonb),
  'inventory', public.dlfr_cards_inventory_of(v_auth));
end $$;
revoke all on function public.dlfr_trades_status() from public, anon;
grant execute on function public.dlfr_trades_status() to authenticated;

-- V176 — Onglet « Gestion » de DLFR Cards (DÉJÀ APPLIQUÉ, migration dlfr_176_gestion_cards)
-- * Rôle « Gestion Cards » (table dlfr_cards_managers) : accès au catalogue et aux outils de gestion,
--   en plus des propriétaires et supermodérateurs. Seuls les propriétaires donnent / retirent ce rôle.
-- * Historique des parties : 1 copie par jour et par joueur (14 jours glissants), prise automatiquement
--   avant la première sauvegarde de la journée, avec l'inventaire de cartes.
--   Retour à une date ou remise à zéro par l'équipe ; l'état d'avant est toujours copié dans
--   dlfr_cards_admin_backups (rien n'est perdu).
-- * Probabilités modifiables (table dlfr_cards_config, clé 'odds') : raretés par booster, finitions,
--   carte secrète, garanties Légendaire / Mythique. Le site les charge au démarrage.
-- * Événements : création / modification / fin des packs offerts (dlfr_cards_gifts).
-- * Toutes les actions sont inscrites dans community_audit_log (actions CARDS_*).

create table if not exists public.dlfr_cards_managers(
 auth_user_id uuid primary key references auth.users(id) on delete cascade,
 added_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), active boolean not null default true);
alter table public.dlfr_cards_managers enable row level security;
revoke all on public.dlfr_cards_managers from anon, authenticated;

create or replace function public.dlfr_cards_lab_access()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.staff_roles s where s.auth_user_id = (select auth.uid()) and s.role in ('owner','supermoderator'))
     or exists(select 1 from public.dlfr_cards_managers m where m.auth_user_id = (select auth.uid()) and m.active) $$;

create or replace function public.dlfr_cards_is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.staff_roles s where s.auth_user_id = (select auth.uid()) and s.role = 'owner') $$;
revoke all on function public.dlfr_cards_is_owner() from public, anon, authenticated;

create or replace function public.dlfr_cards_audit(p_action text, p_details text)
returns void language sql security definer set search_path = '' as $$
 insert into public.community_audit_log(actor_user_id, action_key, target, details) values ((select auth.uid()), p_action, 'dlfr_cards', left(coalesce(p_details,''), 900)) $$;
revoke all on function public.dlfr_cards_audit(text, text) from public, anon, authenticated;

create or replace function public.dlfr_cards_target(p_player_key text)
returns uuid language sql stable security definer set search_path = '' as $$
 select auth_user_id from public.player_profile_owners where lower(player_key) = lower(btrim(coalesce(p_player_key,''))) limit 1 $$;
revoke all on function public.dlfr_cards_target(text) from public, anon, authenticated;

-- ---------- Rôle ----------
create or replace function public.dlfr_cards_manage_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not coalesce(public.dlfr_cards_lab_access(), false) then raise exception 'Accès refusé' using errcode = '42501'; end if;
 return jsonb_build_object('owner', public.dlfr_cards_is_owner(),
  'managers', coalesce((select jsonb_agg(jsonb_build_object('player_key', o.player_key, 'name', public.dlfr_player_name(m.auth_user_id), 'since', m.created_at) order by m.created_at)
    from public.dlfr_cards_managers m left join public.player_profile_owners o on o.auth_user_id = m.auth_user_id where m.active), '[]'::jsonb),
  'staff', coalesce((select jsonb_agg(jsonb_build_object('name', public.dlfr_player_name(s.auth_user_id), 'role', s.role) order by s.role)
    from public.staff_roles s where s.role in ('owner','supermoderator')), '[]'::jsonb));
end $$;
revoke all on function public.dlfr_cards_manage_status() from public, anon;
grant execute on function public.dlfr_cards_manage_status() to authenticated;

create or replace function public.dlfr_cards_manager_set(p_player_key text, p_add boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_target uuid := public.dlfr_cards_target(p_player_key);
begin
 if not public.dlfr_cards_is_owner() then raise exception 'Seuls les propriétaires peuvent gérer ce rôle.' using errcode = '42501'; end if;
 if v_target is null then raise exception 'Joueur introuvable (pseudo de fiche relié à un compte).'; end if;
 if p_add then
  insert into public.dlfr_cards_managers(auth_user_id, added_by, created_at, active) values (v_target, (select auth.uid()), now(), true)
  on conflict (auth_user_id) do update set active = true, added_by = excluded.added_by, created_at = now();
 else
  update public.dlfr_cards_managers set active = false where auth_user_id = v_target;
 end if;
 perform public.dlfr_cards_audit(case when p_add then 'CARDS_MANAGER_ADD' else 'CARDS_MANAGER_REMOVE' end, 'joueur=' || p_player_key);
 return true;
end $$;
revoke all on function public.dlfr_cards_manager_set(text, boolean) from public, anon;
grant execute on function public.dlfr_cards_manager_set(text, boolean) to authenticated;

-- ---------- Historique des parties ----------
create table if not exists public.dlfr_cards_adventure_history(
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 slot smallint not null, day date not null, version integer, save jsonb not null, inventory jsonb,
 created_at timestamptz not null default now(), primary key (auth_user_id, slot));
alter table public.dlfr_cards_adventure_history enable row level security;
revoke all on public.dlfr_cards_adventure_history from anon, authenticated;

create table if not exists public.dlfr_cards_admin_backups(
 id bigint generated always as identity primary key,
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 action text not null, save jsonb, inventory jsonb, by_user uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now());
alter table public.dlfr_cards_admin_backups enable row level security;
revoke all on public.dlfr_cards_admin_backups from anon, authenticated;

create or replace function public.dlfr_cards_inventory_rows(p_auth uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_object_agg(card_id::text, jsonb_build_array(qty, adv_qty)), '{}'::jsonb)
 from public.dlfr_card_inventory where auth_user_id = p_auth and (qty > 0 or adv_qty > 0) $$;
revoke all on function public.dlfr_cards_inventory_rows(uuid) from public, anon, authenticated;

create or replace function public.dlfr_cards_history_capture()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_day date := (now() at time zone 'Europe/Paris')::date; v_slot smallint := ((v_day - date '2026-01-01') % 14)::smallint;
begin
 if old.save is not distinct from new.save then return new; end if;
 if exists(select 1 from public.dlfr_cards_adventure_history h where h.auth_user_id = old.auth_user_id and h.slot = v_slot and h.day = v_day) then return new; end if;
 insert into public.dlfr_cards_adventure_history(auth_user_id, slot, day, version, save, inventory, created_at)
 values (old.auth_user_id, v_slot, v_day, old.version, old.save, public.dlfr_cards_inventory_rows(old.auth_user_id), now())
 on conflict (auth_user_id, slot) do update set day = excluded.day, version = excluded.version, save = excluded.save, inventory = excluded.inventory, created_at = now();
 return new;
end $$;
revoke all on function public.dlfr_cards_history_capture() from public, anon, authenticated;
create or replace trigger dlfr_cards_history_capture before update on public.dlfr_cards_adventure
 for each row execute function public.dlfr_cards_history_capture();

create or replace function public.dlfr_cards_admin_player(p_player_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_target uuid := public.dlfr_cards_target(p_player_key); a public.dlfr_cards_adventure;
begin
 if not coalesce(public.dlfr_cards_lab_access(), false) then raise exception 'Accès refusé' using errcode = '42501'; end if;
 if v_target is null then raise exception 'Joueur introuvable (pseudo de fiche relié à un compte).'; end if;
 select * into a from public.dlfr_cards_adventure where auth_user_id = v_target;
 return jsonb_build_object('player_key', p_player_key, 'name', public.dlfr_player_name(v_target),
  'level', a.save->'progress'->'level', 'prestige', a.save->'progress'->'prestige', 'packs', a.save->'progress'->'stats'->'packs',
  'shards', a.save->'progress'->'shards', 'updated', a.updated_at, 'has_save', a.auth_user_id is not null,
  'cards', (select count(*) from public.dlfr_card_inventory i where i.auth_user_id = v_target and i.qty + i.adv_qty > 0),
  'copies', (select coalesce(sum(i.qty + i.adv_qty), 0) from public.dlfr_card_inventory i where i.auth_user_id = v_target),
  'history', coalesce((select jsonb_agg(jsonb_build_object('day', h.day, 'level', h.save->'progress'->'level', 'prestige', h.save->'progress'->'prestige',
     'packs', h.save->'progress'->'stats'->'packs', 'cards', case when h.inventory is null then null else (select count(*) from jsonb_object_keys(h.inventory)) end) order by h.day desc)
    from public.dlfr_cards_adventure_history h where h.auth_user_id = v_target), '[]'::jsonb));
end $$;
revoke all on function public.dlfr_cards_admin_player(text) from public, anon;
grant execute on function public.dlfr_cards_admin_player(text) to authenticated;

create or replace function public.dlfr_cards_admin_rollback(p_player_key text, p_day date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_target uuid := public.dlfr_cards_target(p_player_key); h public.dlfr_cards_adventure_history; e record;
begin
 if not coalesce(public.dlfr_cards_lab_access(), false) then raise exception 'Accès refusé' using errcode = '42501'; end if;
 if v_target is null then raise exception 'Joueur introuvable (pseudo de fiche relié à un compte).'; end if;
 select * into h from public.dlfr_cards_adventure_history where auth_user_id = v_target and day = p_day order by created_at desc limit 1;
 if h.auth_user_id is null then raise exception 'Aucune copie à cette date.'; end if;
 insert into public.dlfr_cards_admin_backups(auth_user_id, action, save, inventory, by_user)
 select v_target, 'avant retour au ' || p_day, a.save, public.dlfr_cards_inventory_rows(v_target), (select auth.uid()) from public.dlfr_cards_adventure a where a.auth_user_id = v_target;
 insert into public.dlfr_cards_adventure(auth_user_id, save, version) values (v_target, h.save, 1000)
 on conflict (auth_user_id) do update set save = h.save, version = public.dlfr_cards_adventure.version + 1000, updated_at = now();
 if h.inventory is not null then
  update public.dlfr_card_inventory i set qty = 0, adv_qty = 0 where i.auth_user_id = v_target and (i.qty > 0 or i.adv_qty > 0) and not (h.inventory ? i.card_id::text);
  for e in select key, value from jsonb_each(h.inventory) loop
   if exists(select 1 from public.dlfr_cards where id = e.key::bigint) then
    insert into public.dlfr_card_inventory(auth_user_id, card_id, qty, adv_qty) values (v_target, e.key::bigint, (e.value->>0)::int, (e.value->>1)::int)
    on conflict (auth_user_id, card_id) do update set qty = excluded.qty, adv_qty = excluded.adv_qty;
   end if;
  end loop;
  update public.dlfr_card_adv_queue set qty = 0 where auth_user_id = v_target;
 end if;
 perform public.dlfr_cards_audit('CARDS_ROLLBACK', 'joueur=' || p_player_key || ' ; retour au ' || p_day);
 return jsonb_build_object('ok', true, 'day', p_day, 'level', h.save->'progress'->'level');
end $$;
revoke all on function public.dlfr_cards_admin_rollback(text, date) from public, anon;
grant execute on function public.dlfr_cards_admin_rollback(text, date) to authenticated;

create or replace function public.dlfr_cards_admin_reset(p_player_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_target uuid := public.dlfr_cards_target(p_player_key);
begin
 if not coalesce(public.dlfr_cards_lab_access(), false) then raise exception 'Accès refusé' using errcode = '42501'; end if;
 if v_target is null then raise exception 'Joueur introuvable (pseudo de fiche relié à un compte).'; end if;
 insert into public.dlfr_cards_admin_backups(auth_user_id, action, save, inventory, by_user)
 select v_target, 'avant remise à zéro', a.save, public.dlfr_cards_inventory_rows(v_target), (select auth.uid()) from public.dlfr_cards_adventure a where a.auth_user_id = v_target;
 perform public.dlfr_cards_do_reset(v_target, 'décision de l’équipe', (select auth.uid()));
 perform public.dlfr_cards_audit('CARDS_RESET', 'joueur=' || p_player_key);
 return jsonb_build_object('ok', true);
end $$;
revoke all on function public.dlfr_cards_admin_reset(text) from public, anon;
grant execute on function public.dlfr_cards_admin_reset(text) to authenticated;

-- ---------- Probabilités ----------
create table if not exists public.dlfr_cards_config(
 key text primary key, value jsonb not null, updated_by uuid references auth.users(id) on delete set null, updated_at timestamptz not null default now());
alter table public.dlfr_cards_config enable row level security;
revoke all on public.dlfr_cards_config from anon, authenticated;

create or replace function public.dlfr_cards_config_get()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce((select value from public.dlfr_cards_config where key = 'odds'), 'null'::jsonb) $$;
grant execute on function public.dlfr_cards_config_get() to anon, authenticated;

create or replace function public.dlfr_cards_config_set(p_odds jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare e record; x jsonb; s numeric;
begin
 if not coalesce(public.dlfr_cards_lab_access(), false) then raise exception 'Accès refusé' using errcode = '42501'; end if;
 if p_odds is null or jsonb_typeof(p_odds) = 'null' then
  update public.dlfr_cards_config set value = 'null'::jsonb, updated_by = (select auth.uid()), updated_at = now() where key = 'odds';
  perform public.dlfr_cards_audit('CARDS_ODDS', 'probabilités remises par défaut');
  return true;
 end if;
 if jsonb_typeof(p_odds) <> 'object' or jsonb_typeof(p_odds->'packs') <> 'object' then raise exception 'Format invalide'; end if;
 for e in select key, value from jsonb_each(p_odds->'packs') loop
  if jsonb_typeof(e.value) <> 'array' or jsonb_array_length(e.value) <> 6 then raise exception 'Booster % : 6 valeurs attendues', e.key; end if;
  s := 0;
  for x in select value from jsonb_array_elements(e.value) loop
   if jsonb_typeof(x) <> 'number' or x::text::numeric < 0 or x::text::numeric > 100 then raise exception 'Booster % : valeurs entre 0 et 100', e.key; end if;
   s := s + x::text::numeric;
  end loop;
  if s <= 0 then raise exception 'Booster % : au moins une rareté doit avoir une chance', e.key; end if;
 end loop;
 if jsonb_typeof(p_odds->'finishes') <> 'array' or jsonb_array_length(p_odds->'finishes') <> 4
    or exists(select 1 from jsonb_array_elements(p_odds->'finishes') f(v) where jsonb_typeof(f.v) <> 'number' or f.v::text::numeric < 0 or f.v::text::numeric > 0.5) then
  raise exception 'Finitions : 4 valeurs entre 0 et 0,5'; end if;
 if jsonb_typeof(p_odds->'secret') <> 'number' or (p_odds->>'secret')::numeric < 0 or (p_odds->>'secret')::numeric > 0.01 then raise exception 'Carte secrète : chance entre 0 et 1 %%'; end if;
 if jsonb_typeof(p_odds->'myth_pity') <> 'number' or (p_odds->>'myth_pity')::numeric not between 10 and 100000 then raise exception 'Garantie Mythique : entre 10 et 100 000'; end if;
 if jsonb_typeof(p_odds->'leg_pity') <> 'number' or (p_odds->>'leg_pity')::numeric not between 5 and 10000 then raise exception 'Garantie Légendaire : entre 5 et 10 000'; end if;
 insert into public.dlfr_cards_config(key, value, updated_by, updated_at) values ('odds', p_odds, (select auth.uid()), now())
 on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
 perform public.dlfr_cards_audit('CARDS_ODDS', left(p_odds::text, 800));
 return true;
end $$;
revoke all on function public.dlfr_cards_config_set(jsonb) from public, anon;
grant execute on function public.dlfr_cards_config_set(jsonb) to authenticated;

-- ---------- Événements (packs offerts) ----------
create or replace function public.dlfr_cards_gifts_admin()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not coalesce(public.dlfr_cards_lab_access(), false) then raise exception 'Accès refusé' using errcode = '42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title, 'message', g.message, 'packs', g.packs, 'per_pack', g.per_pack,
   'weights', g.weights, 'starts', g.starts_at, 'expires', g.expires_at, 'badge_id', g.badge_id, 'active', now() between g.starts_at and g.expires_at,
   'claims', (select count(*) from public.dlfr_cards_gift_claims c where c.gift_id = g.id)) order by g.id desc) from public.dlfr_cards_gifts g), '[]'::jsonb);
end $$;
revoke all on function public.dlfr_cards_gifts_admin() from public, anon;
grant execute on function public.dlfr_cards_gifts_admin() to authenticated;

create or replace function public.dlfr_cards_gift_save(p_id bigint, p_title text, p_message text, p_packs integer, p_per_pack integer,
 p_weights numeric[], p_starts timestamptz, p_expires timestamptz, p_badge text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
 if not coalesce(public.dlfr_cards_lab_access(), false) then raise exception 'Accès refusé' using errcode = '42501'; end if;
 if coalesce(btrim(p_title),'') = '' then raise exception 'Donne un titre à l’événement.'; end if;
 if p_packs not between 1 and 50 or p_per_pack not between 1 and 10 then raise exception 'Entre 1 et 50 packs, de 1 à 10 cartes.'; end if;
 if cardinality(p_weights) <> 6 or exists(select 1 from unnest(p_weights) w where w is null or w < 0 or w > 100)
    or (select sum(w) from unnest(p_weights) w) <= 0 then raise exception 'Chances : 6 valeurs entre 0 et 100.'; end if;
 if p_expires is null or p_expires <= coalesce(p_starts, now()) then raise exception 'La date de fin doit être après le début.'; end if;
 if p_id is null then
  insert into public.dlfr_cards_gifts(title, message, packs, per_pack, weights, starts_at, expires_at, badge_id)
  values (left(btrim(p_title),80), left(coalesce(p_message,''),300), p_packs, p_per_pack, p_weights, coalesce(p_starts, now()), p_expires, nullif(btrim(coalesce(p_badge,'')),''))
  returning id into v_id;
 else
  update public.dlfr_cards_gifts set title = left(btrim(p_title),80), message = left(coalesce(p_message,''),300), packs = p_packs, per_pack = p_per_pack,
   weights = p_weights, starts_at = coalesce(p_starts, starts_at), expires_at = p_expires, badge_id = nullif(btrim(coalesce(p_badge,'')),'')
  where id = p_id returning id into v_id;
  if v_id is null then raise exception 'Événement introuvable.'; end if;
 end if;
 perform public.dlfr_cards_audit('CARDS_GIFT', 'événement ' || v_id || ' : ' || left(p_title, 80));
 return v_id;
end $$;
revoke all on function public.dlfr_cards_gift_save(bigint, text, text, integer, integer, numeric[], timestamptz, timestamptz, text) from public, anon;
grant execute on function public.dlfr_cards_gift_save(bigint, text, text, integer, integer, numeric[], timestamptz, timestamptz, text) to authenticated;

create or replace function public.dlfr_cards_gift_end(p_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if not coalesce(public.dlfr_cards_lab_access(), false) then raise exception 'Accès refusé' using errcode = '42501'; end if;
 update public.dlfr_cards_gifts set expires_at = now() where id = p_id and expires_at > now();
 perform public.dlfr_cards_audit('CARDS_GIFT_END', 'événement ' || p_id);
 return true;
end $$;
revoke all on function public.dlfr_cards_gift_end(bigint) from public, anon;
grant execute on function public.dlfr_cards_gift_end(bigint) to authenticated;

-- Copie de départ : l'état actuel de toutes les parties (pour pouvoir revenir à aujourd'hui),
-- et la copie de sécurité du 05/11 (sans inventaire détaillé).
insert into public.dlfr_cards_adventure_history(auth_user_id, slot, day, version, save, inventory)
select a.auth_user_id, (((now() at time zone 'Europe/Paris')::date - date '2026-01-01') % 14)::smallint, (now() at time zone 'Europe/Paris')::date,
 a.version, a.save, public.dlfr_cards_inventory_rows(a.auth_user_id)
from public.dlfr_cards_adventure a
on conflict (auth_user_id, slot) do nothing;
insert into public.dlfr_cards_adventure_history(auth_user_id, slot, day, version, save, inventory)
select b.auth_user_id, ((date '2026-11-05' - date '2026-01-01') % 14)::smallint, date '2026-11-05', b.version, b.save, null
from public.dlfr_backup_165_adventure b
on conflict (auth_user_id, slot) do nothing;

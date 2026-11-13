-- DLFR V165 — Anti-autoclicker / anti-macro pour DLFR Cards, avec sanctions automatiques.
-- Détection serveur : rythme d'ouverture de boosters impossible à la main (par heure) et sauts
-- anormaux entre deux sauvegardes. Détection navigateur : clics générés par script, clics
-- parfaitement réguliers (autoclicker), rafales de clics. 3 avertissements en 24 h = suspension :
-- 1re fois 24 h, 2e fois 7 jours, 3e fois 30 jours, ensuite définitive. Propriétaires et
-- supermodos peuvent suspendre, lever, ou remettre à zéro le mode Aventure d'un joueur.

create table if not exists public.dlfr_cards_bans(
 auth_user_id uuid primary key references auth.users(id) on delete cascade,
 until timestamptz,                       -- null = définitif
 reason text not null default '', level integer not null default 1,
 by_user uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), active boolean not null default true);
create table if not exists public.dlfr_cards_strikes(
 id bigint generated always as identity primary key,
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null, detail text, created_at timestamptz not null default now());
create index if not exists dlfr_cards_strikes_user_idx on public.dlfr_cards_strikes(auth_user_id, created_at desc);
create table if not exists public.dlfr_cards_activity(
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 hour timestamptz not null, packs integer not null default 0,
 primary key (auth_user_id, hour));
alter table public.dlfr_cards_bans enable row level security;
alter table public.dlfr_cards_strikes enable row level security;
alter table public.dlfr_cards_activity enable row level security;
revoke all on public.dlfr_cards_bans from anon, authenticated;
revoke all on public.dlfr_cards_strikes from anon, authenticated;
revoke all on public.dlfr_cards_activity from anon, authenticated;

create or replace function public.dlfr_cards_ban_message(p_auth uuid)
returns text language sql stable security definer set search_path = '' as $$
 select case when b.until is null then 'Compte suspendu définitivement du jeu de cartes (triche : '||b.reason||').'
   else 'Compte suspendu du jeu de cartes jusqu’au '||to_char(b.until at time zone 'Europe/Paris','DD/MM à HH24:MI')||' (triche : '||b.reason||').' end
 from public.dlfr_cards_bans b where b.auth_user_id = p_auth and b.active and (b.until is null or b.until > now()) $$;
revoke all on function public.dlfr_cards_ban_message(uuid) from public, anon, authenticated;

create or replace function public.dlfr_cards_assert_ok(p_auth uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
declare m text := public.dlfr_cards_ban_message(p_auth);
begin if m is not null then raise exception '%', m; end if; end $$;
revoke all on function public.dlfr_cards_assert_ok(uuid) from public, anon, authenticated;

create or replace function public.dlfr_cards_apply_ban(p_auth uuid, p_reason text, p_by uuid default null, p_days integer default null, p_manual boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_level int; v_until timestamptz;
begin
 select level into v_level from public.dlfr_cards_bans where auth_user_id = p_auth;
 v_level := coalesce(v_level, 0) + 1;
 v_until := case when p_manual then case when p_days is null then null else now() + make_interval(days => p_days) end
   when v_level = 1 then now() + interval '24 hours' when v_level = 2 then now() + interval '7 days'
   when v_level = 3 then now() + interval '30 days' else null end;
 insert into public.dlfr_cards_bans(auth_user_id, until, reason, level, by_user, created_at, active)
 values (p_auth, v_until, left(coalesce(p_reason,''),200), v_level, p_by, now(), true)
 on conflict (auth_user_id) do update set until = excluded.until, reason = excluded.reason, level = excluded.level,
   by_user = excluded.by_user, created_at = now(), active = true;
end $$;
revoke all on function public.dlfr_cards_apply_ban(uuid, text, uuid, integer, boolean) from public, anon, authenticated;

-- Avertissement ; au 3e en 24 h, suspension automatique.
create or replace function public.dlfr_cards_strike(p_auth uuid, p_kind text, p_detail text)
returns void language plpgsql security definer set search_path = '' as $$
declare n int;
begin
 insert into public.dlfr_cards_strikes(auth_user_id, kind, detail) values (p_auth, left(p_kind,40), left(coalesce(p_detail,''),300));
 select count(*) into n from public.dlfr_cards_strikes where auth_user_id = p_auth and created_at > now() - interval '24 hours';
 if n >= 3 and public.dlfr_cards_ban_message(p_auth) is null then
  perform public.dlfr_cards_apply_ban(p_auth, case p_kind when 'rythme' then 'rythme de jeu impossible à la main' when 'saut' then 'progression anormale'
    when 'synthetic' then 'clics générés par un programme' when 'regular' then 'autoclicker' when 'burst' then 'macro / rafales de clics' else p_kind end);
  delete from public.dlfr_cards_strikes where auth_user_id = p_auth and created_at > now() - interval '24 hours';
 end if;
end $$;
revoke all on function public.dlfr_cards_strike(uuid, text, text) from public, anon, authenticated;

-- Signalement envoyé par le navigateur (au plus 1 pris en compte par 2 minutes).
create or replace function public.dlfr_cards_report(p_kind text, p_detail text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid());
begin
 if v_auth is null or p_kind not in ('synthetic','regular','burst') then return jsonb_build_object('ok', false); end if;
 if exists(select 1 from public.dlfr_cards_strikes where auth_user_id = v_auth and created_at > now() - interval '2 minutes') then
  return jsonb_build_object('ok', true, 'banned', public.dlfr_cards_ban_message(v_auth)); end if;
 perform public.dlfr_cards_strike(v_auth, p_kind, p_detail);
 return jsonb_build_object('ok', true, 'banned', public.dlfr_cards_ban_message(v_auth),
  'strikes', (select count(*) from public.dlfr_cards_strikes where auth_user_id = v_auth and created_at > now() - interval '24 hours'));
end $$;
revoke all on function public.dlfr_cards_report(text, text) from public, anon;
grant execute on function public.dlfr_cards_report(text, text) to authenticated;

create or replace function public.dlfr_cards_my_status()
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('banned', public.dlfr_cards_ban_message((select auth.uid())),
  'strikes', (select count(*) from public.dlfr_cards_strikes where auth_user_id = (select auth.uid()) and created_at > now() - interval '24 hours')) $$;
grant execute on function public.dlfr_cards_my_status() to authenticated;

-- Sauvegarde Aventure : contrôle du rythme (boosters ouverts par heure) et des sauts.
create or replace function public.dlfr_adventure_save(p_save jsonb, p_version integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_cur integer; v_old jsonb; v_dp int; v_hour timestamptz := date_trunc('hour', now()); v_h int;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 perform public.dlfr_cards_assert_ok(v_auth);
 if p_save is null or jsonb_typeof(p_save) <> 'object' or p_save->>'format' <> 'dlfr-cards-session' then raise exception 'Sauvegarde invalide'; end if;
 if pg_column_size(p_save) > 400000 then raise exception 'Sauvegarde trop volumineuse'; end if;
 select version, save into v_cur, v_old from public.dlfr_cards_adventure where auth_user_id = v_auth for update;
 if v_cur is null then
  insert into public.dlfr_cards_adventure(auth_user_id, save, version) values (v_auth, p_save, 1); return 1; end if;
 if coalesce(p_version, 0) <> v_cur then raise exception 'conflict:%', v_cur; end if;
 v_dp := coalesce((p_save->'progress'->'stats'->>'packs')::int, 0) - coalesce((v_old->'progress'->'stats'->>'packs')::int, 0);
 if v_dp > 0 then
  insert into public.dlfr_cards_activity(auth_user_id, hour, packs) values (v_auth, v_hour, v_dp)
   on conflict (auth_user_id, hour) do update set packs = public.dlfr_cards_activity.packs + v_dp returning packs into v_h;
  if v_dp > 150 then perform public.dlfr_cards_strike(v_auth, 'saut', v_dp||' boosters entre deux sauvegardes'); end if;
  if v_h > 1500 then
   perform public.dlfr_cards_apply_ban(v_auth, 'rythme de jeu impossible à la main ('||v_h||' boosters en une heure)');
  elsif v_h > 900 and not exists(select 1 from public.dlfr_cards_strikes where auth_user_id = v_auth and kind = 'rythme' and created_at >= v_hour) then
   perform public.dlfr_cards_strike(v_auth, 'rythme', v_h||' boosters en une heure');
  end if;
 end if;
 update public.dlfr_cards_adventure set save = p_save, version = v_cur + 1, updated_at = now() where auth_user_id = v_auth;
 return v_cur + 1;
end $$;
revoke all on function public.dlfr_adventure_save(jsonb, integer) from public, anon;
grant execute on function public.dlfr_adventure_save(jsonb, integer) to authenticated;

-- Gestion par l'équipe (propriétaires / supermodos).
create or replace function public.dlfr_cards_sanctions()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not coalesce(public.dlfr_cards_lab_access(), false) then raise exception 'Accès refusé' using errcode = '42501'; end if;
 return jsonb_build_object(
  'bans', coalesce((select jsonb_agg(jsonb_build_object('player_key', o.player_key, 'name', public.dlfr_player_name(b.auth_user_id), 'until', b.until, 'reason', b.reason, 'level', b.level,
     'active', b.active and (b.until is null or b.until > now()), 'at', b.created_at) order by b.created_at desc)
    from public.dlfr_cards_bans b left join public.player_profile_owners o on o.auth_user_id = b.auth_user_id), '[]'::jsonb),
  'strikes', coalesce((select jsonb_agg(x order by (x->>'at') desc) from (select jsonb_build_object('player_key', o.player_key, 'name', public.dlfr_player_name(s.auth_user_id), 'kind', s.kind, 'detail', s.detail, 'at', s.created_at) x
    from public.dlfr_cards_strikes s left join public.player_profile_owners o on o.auth_user_id = s.auth_user_id where s.created_at > now() - interval '7 days' order by s.created_at desc limit 60) z), '[]'::jsonb),
  'top_rate', coalesce((select jsonb_agg(x order by (x->>'packs')::int desc) from (select jsonb_build_object('player_key', o.player_key, 'name', public.dlfr_player_name(a.auth_user_id), 'packs', max(a.packs), 'hour', max(a.hour)) x
    from public.dlfr_cards_activity a left join public.player_profile_owners o on o.auth_user_id = a.auth_user_id where a.hour > now() - interval '48 hours' group by a.auth_user_id, o.player_key order by max(a.packs) desc limit 10) z), '[]'::jsonb));
end $$;
revoke all on function public.dlfr_cards_sanctions() from public, anon;
grant execute on function public.dlfr_cards_sanctions() to authenticated;

create or replace function public.dlfr_cards_sanction_set(p_player_key text, p_action text, p_days integer default null, p_reason text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_target uuid;
begin
 if not coalesce(public.dlfr_cards_lab_access(), false) then raise exception 'Accès refusé' using errcode = '42501'; end if;
 select auth_user_id into v_target from public.player_profile_owners where lower(player_key) = lower(btrim(coalesce(p_player_key,''))) limit 1;
 if v_target is null then raise exception 'Joueur introuvable (pseudo de fiche relié à un compte).'; end if;
 if p_action = 'ban' then
  perform public.dlfr_cards_apply_ban(v_target, coalesce(nullif(btrim(p_reason),''), 'décision de l’équipe'), v_auth, p_days, true);
 elsif p_action = 'unban' then
  update public.dlfr_cards_bans set active = false where auth_user_id = v_target;
  delete from public.dlfr_cards_strikes where auth_user_id = v_target;
 elsif p_action = 'reset' then
  -- Remise à zéro du mode Aventure : sauvegarde effacée et cartes gagnées en Aventure retirées
  -- (les cartes officielles : calendrier, saison, boss, échanges… sont conservées).
  delete from public.dlfr_cards_adventure where auth_user_id = v_target;
  update public.dlfr_card_inventory set adv_qty = 0 where auth_user_id = v_target;
  delete from public.dlfr_card_adv_queue where auth_user_id = v_target;
 else raise exception 'Action inconnue'; end if;
 return true;
end $$;
revoke all on function public.dlfr_cards_sanction_set(text, text, integer, text) from public, anon;
grant execute on function public.dlfr_cards_sanction_set(text, text, integer, text) to authenticated;

-- Les joueurs suspendus ne peuvent plus synchroniser, attaquer le boss, échanger ni récupérer
-- de récompenses de saison : ajout du contrôle au début de ces fonctions.
do $$
declare f text; def text;
begin
 foreach f in array array['public.dlfr_adventure_sync(jsonb,boolean)','public.dlfr_boss_attack()','public.dlfr_trade_create(text,jsonb,jsonb,text)',
   'public.dlfr_trade_accept(bigint)','public.dlfr_season_claim(integer)','public.dlfr_season_checkin()','public.dlfr_advent_open(integer)'] loop
  def := pg_get_functiondef(f::regprocedure);
  if position('dlfr_cards_assert_ok' in def) = 0 then
   def := replace(def, 'if v_auth is null then raise exception ''Connexion requise''; end if;',
                       'if v_auth is null then raise exception ''Connexion requise''; end if; perform public.dlfr_cards_assert_ok(v_auth);');
   execute def;
  end if;
 end loop;
end $$;

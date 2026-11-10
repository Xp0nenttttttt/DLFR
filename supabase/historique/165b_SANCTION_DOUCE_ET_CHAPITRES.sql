-- V165b (appliqué en direct, migrations dlfr_165b_reset_table, dlfr_165b_save_rate, dlfr_165c_sanction_douce)
-- À appliquer APRÈS 165_ANTI_TRICHE.sql.
-- * Sanction automatique (3 alertes / 24 h) = retrait des cartes Ultra et Secrètes (plus de ban automatique).
-- * La sauvegarde surveille le rythme sur une heure : boosters (> 1 200 = alerte, > 3 000 = sanction)
--   ET chapitres terminés (> 40 = alerte, > 120 = sanction). Plus de strike « saut ».
-- * Équipe : dlfr_cards_sanction_set(pseudo, 'soft' | 'reset' | 'ban' | 'unban', jours, raison).
-- * Journal : dlfr_cards_resets (affiché au joueur via dlfr_cards_my_status).
-- Le contenu exact des fonctions est celui de la base (pg_get_functiondef) ; voir aussi la conversation V165.

create table if not exists public.dlfr_cards_resets(
 id bigint generated always as identity primary key,
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 reason text not null default '', by_user uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now());
create index if not exists dlfr_cards_resets_user_idx on public.dlfr_cards_resets(auth_user_id, created_at desc);
alter table public.dlfr_cards_resets enable row level security;
revoke all on public.dlfr_cards_resets from anon, authenticated;
alter table public.dlfr_cards_activity add column if not exists chapters integer not null default 0;

create or replace function public.dlfr_cards_soft_sanction(p_auth uuid, p_reason text, p_by uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
 update public.dlfr_card_inventory i set qty = 0, adv_qty = 0
  from public.dlfr_cards c where c.id = i.card_id and i.auth_user_id = p_auth and c.rarity in ('Ultra','Secrète') and (i.qty > 0 or i.adv_qty > 0);
 update public.dlfr_card_adv_queue q set qty = 0 from public.dlfr_cards c where c.id = q.card_id and q.auth_user_id = p_auth and c.rarity in ('Ultra','Secrète');
 update public.dlfr_cards_strikes set kind = kind || ':sanctionné' where auth_user_id = p_auth and kind not like '%:sanctionné';
 insert into public.dlfr_cards_resets(auth_user_id, reason, by_user) values (p_auth, 'Ultra et Secrètes retirées : ' || left(coalesce(p_reason,''),180), p_by);
end $$;
revoke all on function public.dlfr_cards_soft_sanction(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.dlfr_cards_do_reset(p_auth uuid, p_reason text, p_by uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_fresh jsonb := jsonb_build_object('format','dlfr-cards-session','version',2,'exportedAt',now(),'customCards','[]'::jsonb,'owned','[]'::jsonb,'overrides','[]'::jsonb,
  'progress', jsonb_build_object('level',1,'xp',0,'shards',0,'dust',0,'keys',0,'prestige',0,'questSeed',0,'skills','{}'::jsonb,'stats','{}'::jsonb,'quests','[]'::jsonb));
begin
 insert into public.dlfr_cards_adventure(auth_user_id, save, version) values (p_auth, v_fresh, 1000)
 on conflict (auth_user_id) do update set save = v_fresh, version = public.dlfr_cards_adventure.version + 1000, updated_at = now();
 update public.dlfr_card_inventory set adv_qty = 0 where auth_user_id = p_auth and adv_qty <> 0;
 update public.dlfr_card_adv_queue set qty = 0 where auth_user_id = p_auth;
 insert into public.dlfr_cards_resets(auth_user_id, reason, by_user) values (p_auth, 'Partie remise à zéro : ' || left(coalesce(p_reason,''),180), p_by);
end $$;
revoke all on function public.dlfr_cards_do_reset(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.dlfr_cards_strike(p_auth uuid, p_kind text, p_detail text)
returns void language plpgsql security definer set search_path = '' as $$
declare n int;
begin
 insert into public.dlfr_cards_strikes(auth_user_id, kind, detail) values (p_auth, left(p_kind,40), left(coalesce(p_detail,''),300));
 select count(*) into n from public.dlfr_cards_strikes where auth_user_id = p_auth and kind not like '%:sanctionné' and created_at > now() - interval '24 hours';
 if n >= 3 then
  perform public.dlfr_cards_soft_sanction(p_auth, case p_kind when 'rythme' then 'rythme de jeu impossible à la main'
    when 'synthetic' then 'clics générés par un programme' when 'regular' then 'autoclicker' when 'burst' then 'macro / rafales de clics' else p_kind end);
 end if;
end $$;
revoke all on function public.dlfr_cards_strike(uuid, text, text) from public, anon, authenticated;

create or replace function public.dlfr_cards_report(p_kind text, p_detail text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid());
begin
 if v_auth is null or p_kind not in ('synthetic','regular','burst') then return jsonb_build_object('ok', false); end if;
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
            where r.auth_user_id = (select auth.uid()) and r.created_at > now() - interval '7 days' order by r.created_at desc limit 1)) $$;
grant execute on function public.dlfr_cards_my_status() to authenticated;

create or replace function public.dlfr_adventure_save(p_save jsonb, p_version integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_cur integer; v_old jsonb; v_dp int; v_dc int; v_hour timestamptz := date_trunc('hour', now()); v_h int; v_hc int;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 perform public.dlfr_cards_assert_ok(v_auth);
 if p_save is null or jsonb_typeof(p_save) <> 'object' or p_save->>'format' <> 'dlfr-cards-session' then raise exception 'Sauvegarde invalide'; end if;
 if pg_column_size(p_save) > 400000 then raise exception 'Sauvegarde trop volumineuse'; end if;
 select version, save into v_cur, v_old from public.dlfr_cards_adventure where auth_user_id = v_auth for update;
 if v_cur is null then
  insert into public.dlfr_cards_adventure(auth_user_id, save, version) values (v_auth, p_save, 1); return 1; end if;
 if coalesce(p_version, 0) <> v_cur then raise exception 'conflict:%', v_cur; end if;
 v_dp := greatest(0, coalesce((p_save->'progress'->'stats'->>'packs')::int, 0) - coalesce((v_old->'progress'->'stats'->>'packs')::int, 0));
 v_dc := greatest(0,
   coalesce((select sum(case when value ~ '^[0-9]{1,9}$' then value::int else 0 end) from jsonb_each_text(case when jsonb_typeof(p_save->'progress'->'chapters'->'cleared') = 'object' then p_save->'progress'->'chapters'->'cleared' else '{}'::jsonb end)), 0)
 - coalesce((select sum(case when value ~ '^[0-9]{1,9}$' then value::int else 0 end) from jsonb_each_text(case when jsonb_typeof(v_old->'progress'->'chapters'->'cleared') = 'object' then v_old->'progress'->'chapters'->'cleared' else '{}'::jsonb end)), 0));
 if v_dp > 0 or v_dc > 0 then
  insert into public.dlfr_cards_activity(auth_user_id, hour, packs, chapters) values (v_auth, v_hour, v_dp, v_dc)
   on conflict (auth_user_id, hour) do update set packs = public.dlfr_cards_activity.packs + v_dp, chapters = public.dlfr_cards_activity.chapters + v_dc
   returning packs, chapters into v_h, v_hc;
  if (v_h > 1200 or v_hc > 40) and not exists(select 1 from public.dlfr_cards_strikes where auth_user_id = v_auth and kind like 'rythme%' and created_at >= v_hour) then
   perform public.dlfr_cards_strike(v_auth, 'rythme', case when v_hc > 40 then v_hc||' chapitres en une heure' else v_h||' boosters en une heure' end);
  end if;
  if (v_h > 3000 or v_hc > 120) and not exists(select 1 from public.dlfr_cards_resets where auth_user_id = v_auth and created_at >= v_hour) then
   perform public.dlfr_cards_soft_sanction(v_auth, case when v_hc > 120 then v_hc||' chapitres en une heure' else v_h||' boosters en une heure' end);
  end if;
 end if;
 update public.dlfr_cards_adventure set save = p_save, version = v_cur + 1, updated_at = now() where auth_user_id = v_auth;
 return v_cur + 1;
end $$;
revoke all on function public.dlfr_adventure_save(jsonb, integer) from public, anon;
grant execute on function public.dlfr_adventure_save(jsonb, integer) to authenticated;

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
  update public.dlfr_cards_strikes set kind = kind || ':sanctionné' where auth_user_id = v_target and kind not like '%:sanctionné';
 elsif p_action = 'soft' then
  perform public.dlfr_cards_soft_sanction(v_target, coalesce(nullif(btrim(p_reason),''), 'décision de l’équipe'), v_auth);
 elsif p_action = 'reset' then
  perform public.dlfr_cards_do_reset(v_target, coalesce(nullif(btrim(p_reason),''), 'décision de l’équipe'), v_auth);
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
  'resets', coalesce((select jsonb_agg(x order by (x->>'at') desc) from (select jsonb_build_object('player_key', o.player_key, 'name', public.dlfr_player_name(r.auth_user_id), 'reason', r.reason, 'at', r.created_at) x
    from public.dlfr_cards_resets r left join public.player_profile_owners o on o.auth_user_id = r.auth_user_id order by r.created_at desc limit 30) z), '[]'::jsonb),
  'strikes', coalesce((select jsonb_agg(x order by (x->>'at') desc) from (select jsonb_build_object('player_key', o.player_key, 'name', public.dlfr_player_name(s.auth_user_id), 'kind', s.kind, 'detail', s.detail, 'at', s.created_at) x
    from public.dlfr_cards_strikes s left join public.player_profile_owners o on o.auth_user_id = s.auth_user_id where s.created_at > now() - interval '7 days' order by s.created_at desc limit 60) z), '[]'::jsonb),
  'top_rate', coalesce((select jsonb_agg(x order by (x->>'packs')::int desc) from (select jsonb_build_object('player_key', o.player_key, 'name', public.dlfr_player_name(a.auth_user_id), 'packs', max(a.packs)) x
    from public.dlfr_cards_activity a left join public.player_profile_owners o on o.auth_user_id = a.auth_user_id where a.hour > now() - interval '48 hours' group by a.auth_user_id, o.player_key order by max(a.packs) desc limit 10) z), '[]'::jsonb));
end $$;
revoke all on function public.dlfr_cards_sanctions() from public, anon;
grant execute on function public.dlfr_cards_sanctions() to authenticated;

-- Opérations ponctuelles faites le 05/11 (déjà exécutées, ne pas rejouer) :
-- * copie de sécurité : dlfr_backup_165_adventure (63 parties), dlfr_backup_165_inventory (2 537 lignes)
-- * cartes Ultra et Secrètes retirées à ZuperXivi, Loxow, acnoxgd, Ovbydiavi, ai7l, Samm, Kowe, lele59238
-- * collections 6, 7 et 8 republiées (elles étaient repassées en préparation)

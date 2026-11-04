-- DLFR V125 — notifications Discord (webhooks) déclenchées directement par Supabase.
--  • Salon modération : nouvelle soumission.
--  • Salon joueurs     : soumission acceptée / refusée (+ mention du joueur si son compte est lié à Discord).
--  • Salon actualités  : actualité publiée sur le site.
--  • Salon badges      : badge décerné par la modération.
-- Les envois passent par pg_net (asynchrone) : une erreur Discord ne bloque JAMAIS le site.

create extension if not exists pg_net;

-- 1) Configuration privée (aucun accès depuis le site : RLS sans politique + droits retirés).
create table if not exists public.dlfr_discord_config(
 id boolean primary key default true check (id),
 enabled boolean not null default true,
 site_url text not null default 'https://xp0nenttttttt.github.io/DLFR/',
 webhook_moderation text, webhook_results text, webhook_news text, webhook_badges text,
 moderation_role_id text,            -- rôle Discord à mentionner pour les nouvelles soumissions (facultatif)
 mention_players boolean not null default true,   -- @mention du joueur si son compte DLFR est lié à Discord
 show_review_message boolean not null default false, -- afficher le message du modérateur dans le salon public
 updated_at timestamptz not null default now());
insert into public.dlfr_discord_config(id) values (true) on conflict do nothing;
alter table public.dlfr_discord_config enable row level security;
revoke all on public.dlfr_discord_config from public, anon, authenticated;

-- 2) Noms / icônes des badges (copie du catalogue du site, pour les messages).
create table if not exists public.dlfr_badge_catalog(
 id text primary key, label text not null, icon text, rarity text, description text);
alter table public.dlfr_badge_catalog enable row level security;
drop policy if exists dlfr_badge_catalog_read on public.dlfr_badge_catalog;
create policy dlfr_badge_catalog_read on public.dlfr_badge_catalog for select using (true);
revoke insert, update, delete on public.dlfr_badge_catalog from anon, authenticated;
insert into public.dlfr_badge_catalog(id,label,icon,rarity,description) values
('bienvenue-club','Bienvenue au club','🎟️','Impressive','Premier niveau du Top 150 battu à 100 %. Te voilà parmi les joueurs classés.'),
('dix','Dix','🔟','Impressive','10 niveaux différents du Top 150 battus.'),
('vingt-cinq','Quart de siècle','🧗','Epic','25 niveaux différents du Top 150 battus.'),
('faucheur-liste','Faucheur de liste','⚔️','Epic','35 niveaux du Top 150 battus : la liste commence à te craindre.'),
('cinquante','Demi-centurion','🛡️','Légendaire','50 niveaux différents du Top 150 battus.'),
('grand-faucheur-liste','Grand Faucheur de liste','💀','Légendaire','75 niveaux du Top 150 battus : la moitié de la liste.'),
('cour-grands','Bienvenue dans la cour des grands','👑','Epic','Premier niveau de la Main List (Top 75) battu.'),
('elite-top10','Élite','🔱','Légendaire','Un niveau du Top 10 battu. Très peu y arrivent.'),
('sommet','Numéro un','🥇','Mythique','Le niveau n°1 de la liste battu.'),
('demi-dieu','Demi Dieu','⚡','Mythique','Toute la Main List battue : les 75 niveaux.'),
('god','GOD','🌌','Ultra','Les 150 niveaux du Top 150 battus. Légende absolue.'),
('verif-1','Première vérification','✅','Impressive','Tu as vérifié un niveau publié (Top 150 ou NLW) : c’est toi qui l’as battu en premier.'),
('verif-5','Bâtisseur','🧱','Epic','5 niveaux vérifiés (Top 150 et NLW comptent).'),
('verif-10','Architecte','🏛️','Légendaire','10 niveaux vérifiés (Top 150 et NLW comptent).'),
('verif-20','Pilier de la DLFR','🗿','Mythique','20 niveaux vérifiés (Top 150 et NLW comptent). La liste ne serait pas la même sans toi.'),
('verif-top150','Vérificateur classé','🎯','Epic','Avoir vérifié un niveau du Top 150.'),
('verif-top75','Vérificateur Main List','🏆','Légendaire','Avoir vérifié un niveau de la Main List (Top 75).'),
('verif-top10','Pierre angulaire','💎','Mythique','Avoir vérifié un niveau du Top 10.'),
('verif-top1','Le Sommet','🗻','Ultra','Avoir vérifié le niveau n°1 de la liste.'),
('bienvenue-nlw','Bienvenue au club NLW','🌱','Beginner','Premier niveau NLW (rang 151 et plus) battu.'),
('dix-nlw','DixNLW','🍀','Beginner','10 niveaux NLW battus.'),
('nlw-50','Cinquante NLW','🌿','Impressive','50 niveaux NLW battus.'),
('cent','100!','💯','Impressive','100 niveaux NLW battus.'),
('faucheur-nlw','Faucheur NLW','🌾','Epic','250 niveaux NLW battus.'),
('grand-faucheur-nlw','Grand Faucheur NLW','🌳','Légendaire','500 niveaux NLW battus.'),
('nlwgod','NLWGOD','🌋','Ultra','1 000 niveaux NLW battus. Inarrêtable.'),
('unrated-premier','Unrated ?','❔','Impressive','Premier niveau UNRATED battu.'),
('unrated-master','Unrated Master','🧪','Légendaire','10 niveaux UNRATED battus.'),
('goat-pays','Le Goat tout simplement','🐐','Ultra','Désigné meilleur joueur du pays par la modération.'),
('goat-region','Le Goat de ta région','🦁','Mythique','Désigné meilleur joueur de sa région par la modération.'),
('clash-clans','Clash of Clans','🏰','Légendaire','Distinction de clan décernée par la modération.')
on conflict (id) do update set label=excluded.label, icon=excluded.icon, rarity=excluded.rarity, description=excluded.description;

-- 3) Outils internes
create or replace function public.dlfr_discord_post(p_kind text, p_payload jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare c public.dlfr_discord_config; v_url text;
begin
 select * into c from public.dlfr_discord_config where id;
 if not found or not c.enabled then return null; end if;
 v_url := case p_kind when 'moderation' then c.webhook_moderation when 'results' then c.webhook_results
          when 'news' then c.webhook_news when 'badges' then c.webhook_badges end;
 if v_url is null or v_url !~ '^https://(canary\.|ptb\.)?(discord|discordapp)\.com/api/webhooks/' then return null; end if;
 return net.http_post(url := v_url,
   body := jsonb_build_object('username','DLFR','avatar_url',c.site_url||'assets/icon.png') || p_payload,
   headers := '{"Content-Type":"application/json"}'::jsonb);
end $$;

create or replace function public.dlfr_discord_user_of(p_auth uuid, p_player_key text default null)
returns text language sql stable security definer set search_path = '' as $$
 select i.provider_id from auth.identities i
  where i.provider = 'discord' and i.user_id = coalesce(p_auth,
        (select o.auth_user_id from public.player_profile_owners o where o.player_key = p_player_key limit 1))
  limit 1 $$;

create or replace function public.dlfr_discord_yt_thumb(p_url text)
returns text language sql immutable set search_path = '' as $$
 select 'https://img.youtube.com/vi/'||m[1]||'/hqdefault.jpg'
   from regexp_match(coalesce(p_url,''), '(?:youtu\.be/|youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/|live/))([A-Za-z0-9_-]{11})') m $$;

create or replace function public.dlfr_discord_cut(p text, n int)
returns text language sql immutable set search_path = '' as $$
 select case when length(coalesce(p,''))>n then left(p,n-1)||'…' else coalesce(p,'') end $$;

-- 4) Soumissions : nouvelle demande (modération) + verdict (joueurs)
create or replace function public.dlfr_discord_submission_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.dlfr_discord_config; d public.demons; v_user text; v_ok boolean; v_place text; v_fields jsonb; v_who text; v_key text;
begin
 select * into c from public.dlfr_discord_config where id;
 if not found or not c.enabled then return new; end if;
 v_key := coalesce(nullif(new.submitted_player_key,''), lower(new.player));
 if new.demon_id is not null then select * into d from public.demons where id = new.demon_id; end if;
 v_place := case when d.id is null then null when d.unrated then 'UNRATED' when d.position > 150 then 'NLW #'||(d.position-150) else '#'||d.position end;

 if tg_op = 'INSERT' and coalesce(new.status,'pending') = 'pending' then
  v_fields := jsonb_build_array(
    jsonb_build_object('name','Joueur','value',public.dlfr_discord_cut(new.player,100),'inline',true),
    jsonb_build_object('name','Progression','value',coalesce(new.progress,100)||' %','inline',true),
    jsonb_build_object('name','Type','value',case when new.demon_id is not null then 'Niveau déjà classé'||coalesce(' ('||v_place||')','')
        when new.proposed_unrated then 'Nouveau niveau · UNRATED proposé' else 'Nouveau niveau'||coalesce(' · position suggérée #'||new.suggested_position,'') end,'inline',true));
  if coalesce(new.video_url,'')<>'' then v_fields := v_fields || jsonb_build_array(jsonb_build_object('name','Vidéo','value',public.dlfr_discord_cut(new.video_url,300))); end if;
  if coalesce(new.raw_footage_url,'')<>'' then v_fields := v_fields || jsonb_build_array(jsonb_build_object('name','Raw footage','value',public.dlfr_discord_cut(new.raw_footage_url,300))); end if;
  if coalesce(new.player_message,'')<>'' then v_fields := v_fields || jsonb_build_array(jsonb_build_object('name','Message du joueur','value',public.dlfr_discord_cut(new.player_message,900))); end if;
  perform public.dlfr_discord_post('moderation', jsonb_build_object(
    'content', case when coalesce(c.moderation_role_id,'') ~ '^[0-9]{5,25}$' then '<@&'||c.moderation_role_id||'> nouvelle soumission à traiter' else '📥 Nouvelle soumission à traiter' end,
    'allowed_mentions', jsonb_build_object('parse','[]'::jsonb,'roles', case when coalesce(c.moderation_role_id,'') ~ '^[0-9]{5,25}$' then jsonb_build_array(c.moderation_role_id) else '[]'::jsonb end),
    'embeds', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'title', public.dlfr_discord_cut('📥 '||coalesce(new.level_name,'Niveau')||coalesce(' ('||nullif(new.level_id,'')||')',''),250),
      'url', c.site_url||'?page=admin',
      'color', 15844367, 'fields', v_fields,
      'thumbnail', case when public.dlfr_discord_yt_thumb(new.video_url) is not null then jsonb_build_object('url',public.dlfr_discord_yt_thumb(new.video_url)) end,
      'footer', jsonb_build_object('text','Demande n°'||new.id||' · à traiter dans Modération → Demandes'),
      'timestamp', to_char(coalesce(new.created_at,now()) at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'))))));

 elsif tg_op = 'UPDATE' and new.status is distinct from old.status and coalesce(old.status,'pending') = 'pending' and new.status in ('approved','rejected') then
  v_ok := new.status = 'approved';
  v_user := case when c.mention_players then public.dlfr_discord_user_of(new.auth_user_id, v_key) end;
  v_who := case when v_user ~ '^[0-9]{5,25}$' then '<@'||v_user||'>' else '**'||replace(coalesce(new.player,'Joueur'),'*','')||'**' end;
  v_fields := jsonb_build_array(
    jsonb_build_object('name','Niveau','value',public.dlfr_discord_cut(coalesce(d.name,new.level_name,'—'),100)||coalesce(' · '||v_place,''),'inline',true),
    jsonb_build_object('name','Progression','value',coalesce(new.progress,100)||' %','inline',true));
  if c.show_review_message and coalesce(new.review_message,'')<>'' then
   v_fields := v_fields || jsonb_build_array(jsonb_build_object('name','Message de la modération','value',public.dlfr_discord_cut(new.review_message,900))); end if;
  perform public.dlfr_discord_post('results', jsonb_build_object(
    'content', v_who||case when v_ok then ' ta soumission a été **acceptée** ! 🎉' else ' ta soumission a été **refusée**.' end,
    'allowed_mentions', jsonb_build_object('parse','[]'::jsonb,'users', case when v_user ~ '^[0-9]{5,25}$' then jsonb_build_array(v_user) else '[]'::jsonb end),
    'embeds', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'title', public.dlfr_discord_cut(case when v_ok then '✅ Soumission acceptée' else '❌ Soumission refusée' end||' — '||coalesce(d.name,new.level_name,''),250),
      'url', case when v_ok then c.site_url||'?page=player&player='||v_key else c.site_url||'?page=my-profile' end,
      'color', case when v_ok then 3066993 else 15158332 end, 'fields', v_fields,
      'thumbnail', case when v_ok and public.dlfr_discord_yt_thumb(new.video_url) is not null then jsonb_build_object('url',public.dlfr_discord_yt_thumb(new.video_url)) end,
      'footer', jsonb_build_object('text', case when v_ok then 'Le classement est mis à jour sur le site.' else 'Le détail est visible dans ton espace sur le site.' end),
      'timestamp', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'))))));
 end if;
 return new;
exception when others then
 raise warning 'DLFR Discord (soumission %) : %', new.id, sqlerrm; return new;
end $$;

drop trigger if exists dlfr_discord_submissions on public.level_submissions;
create trigger dlfr_discord_submissions after insert or update of status on public.level_submissions
 for each row execute function public.dlfr_discord_submission_trigger();

-- 5) Actualités publiées
create or replace function public.dlfr_discord_news_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.dlfr_discord_config; v_img text;
begin
 if not coalesce(new.is_published,false) then return new; end if;
 if tg_op = 'UPDATE' and coalesce(old.is_published,false) then return new; end if;
 select * into c from public.dlfr_discord_config where id;
 if not found or not c.enabled then return new; end if;
 v_img := coalesce(case when new.image_url ~ '^https://' then new.image_url end, public.dlfr_discord_yt_thumb(new.video_url));
 perform public.dlfr_discord_post('news', jsonb_build_object(
   'content','📰 **Nouvelle actualité sur la DLFR**',
   'allowed_mentions', jsonb_build_object('parse','[]'::jsonb),
   'embeds', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
     'title', public.dlfr_discord_cut(coalesce(nullif(new.headline,''),'Actualité'),250),
     'url', c.site_url||'?page=news',
     'description', public.dlfr_discord_cut(new.body,1500)||case when coalesce(new.video_url,'')<>'' then E'\n\n▶️ '||new.video_url else '' end,
     'color', 2653114,
     'image', case when v_img is not null then jsonb_build_object('url',v_img) end,
     'footer', case when coalesce(new.player_name,'')<>'' then jsonb_build_object('text','Joueur concerné : '||new.player_name) end,
     'timestamp', to_char(coalesce(new.created_at,now()) at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'))))));
 return new;
exception when others then
 raise warning 'DLFR Discord (actualité %) : %', new.id, sqlerrm; return new;
end $$;

drop trigger if exists dlfr_discord_news on public.news_items;
create trigger dlfr_discord_news after insert or update of is_published on public.news_items
 for each row execute function public.dlfr_discord_news_trigger();

-- 6) Badges décernés par la modération
create or replace function public.dlfr_discord_badge_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.dlfr_discord_config; b public.dlfr_badge_catalog; p public.players; v_user text; v_who text;
begin
 if new.origin is distinct from 'moderator' then return new; end if;
 select * into c from public.dlfr_discord_config where id;
 if not found or not c.enabled then return new; end if;
 select * into b from public.dlfr_badge_catalog where id = new.badge_id;
 select * into p from public.players where player_key = new.player_key;
 v_user := case when c.mention_players then public.dlfr_discord_user_of(null, new.player_key) end;
 v_who := case when v_user ~ '^[0-9]{5,25}$' then '<@'||v_user||'>' else '**'||replace(coalesce(nullif(p.display_name,''),p.username,new.player_key),'*','')||'**' end;
 perform public.dlfr_discord_post('badges', jsonb_build_object(
   'content', '🏅 '||v_who||' reçoit un badge décerné par la modération !',
   'allowed_mentions', jsonb_build_object('parse','[]'::jsonb,'users', case when v_user ~ '^[0-9]{5,25}$' then jsonb_build_array(v_user) else '[]'::jsonb end),
   'embeds', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
     'title', public.dlfr_discord_cut(coalesce(b.icon||' ','🏅 ')||coalesce(b.label,new.badge_id),250),
     'url', c.site_url||'?page=player&player='||new.player_key,
     'description', nullif(b.description,''),
     'color', case lower(coalesce(b.rarity,'')) when 'beginner' then 9418697 when 'impressive' then 4181914 when 'epic' then 11107327
              when 'légendaire' then 15907914 when 'mythique' then 15756228 when 'ultra' then 8379647 else 2653114 end,
     'fields', jsonb_build_array(
        jsonb_build_object('name','Joueur','value',public.dlfr_discord_cut(coalesce(nullif(p.display_name,''),p.username,new.player_key),100),'inline',true),
        jsonb_build_object('name','Rareté','value',coalesce(b.rarity,'—'),'inline',true)),
     'timestamp', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'))))));
 return new;
exception when others then
 raise warning 'DLFR Discord (badge %/%) : %', new.player_key, new.badge_id, sqlerrm; return new;
end $$;

drop trigger if exists dlfr_discord_badges on public.badge_awards;
create trigger dlfr_discord_badges after insert on public.badge_awards
 for each row execute function public.dlfr_discord_badge_trigger();

-- 7) Message de test dans chaque salon configuré : select public.dlfr_discord_test();
create or replace function public.dlfr_discord_test()
returns text language plpgsql security definer set search_path = '' as $$
declare k text; n int := 0;
begin
 foreach k in array array['moderation','results','news','badges'] loop
  if public.dlfr_discord_post(k, jsonb_build_object('content','✅ Test DLFR : ce salon recevra les notifications « '||k||' ».')) is not null then n := n+1; end if;
 end loop;
 return n||' salon(s) testé(s) sur 4. Résultats : select status_code, content from net._http_response order by id desc limit 4;';
end $$;

revoke all on function public.dlfr_discord_post(text,jsonb) from public, anon, authenticated;
revoke all on function public.dlfr_discord_user_of(uuid,text) from public, anon, authenticated;
revoke all on function public.dlfr_discord_test() from public, anon, authenticated;
revoke all on function public.dlfr_discord_submission_trigger() from public, anon, authenticated;
revoke all on function public.dlfr_discord_news_trigger() from public, anon, authenticated;
revoke all on function public.dlfr_discord_badge_trigger() from public, anon, authenticated;

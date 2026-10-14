-- DLFR V3.0 : migration additive, non destructive, Supabase PostgreSQL.
-- À exécuter APRÈS supabase/01_schema.sql (et 03_media_profiles_v11.sql si applicable).
-- Ne contient aucune suppression de records, comptes, ni attribution automatique de rôles.
begin;

alter table public.demons add column if not exists unrated boolean not null default false;
alter table public.demons add column if not exists unrated_position integer;
alter table public.demons add column if not exists legacy_since date;
alter table public.demons add column if not exists aredl_id text;
alter table public.demons add column if not exists aredl_rank integer;
alter table public.demons add column if not exists first_frbe_player text;
alter table public.demons add column if not exists first_frbe_video_url text;
alter table public.demons add column if not exists first_frbe_achieved_at timestamptz;
alter table public.demons add column if not exists verifier_video_url text;
alter table public.demons add column if not exists data_source text not null default 'manual';
alter table public.player_profiles add column if not exists region_code text;
alter table public.players add column if not exists aredl_player_id text;
-- Un ID GD déjà présent ne peut pas être attribué à deux fiches différentes.
-- Si des doublons existent déjà, corriger avant de créer cet index.
create unique index if not exists dlfr_dem_gd_id_unique on public.demons(level_id) where level_id is not null and length(trim(level_id))>0;
create unique index if not exists dlfr_dem_aredl_id_unique on public.demons(aredl_id) where aredl_id is not null;
create unique index if not exists dlfr_record_unique_casefold on public.completions(demon_id,lower(trim(player)));


create table if not exists public.player_profile_owners (
 player_key text primary key references public.players(player_key) on delete cascade,
 auth_user_id uuid not null unique references auth.users(id) on delete cascade,
 linked_at timestamptz not null default now()
);
create table if not exists public.profile_claim_requests (
 id bigint generated always as identity primary key,
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 player_key text not null references public.players(player_key),
 proof_url text not null,
 note text not null default '',
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index if not exists dlfr_claim_pending_user on public.profile_claim_requests(auth_user_id) where status='pending';
create unique index if not exists dlfr_claim_pending_player on public.profile_claim_requests(player_key) where status='pending';
create table if not exists public.level_submissions (
 id bigint generated always as identity primary key,
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 player text not null,
 level_name text not null,
 level_id text,
 progress integer not null default 100 check(progress between 1 and 100),
 video_url text not null,
 publisher text not null default '',
 creator text,
 verifier text,
 suggested_position integer,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 demon_id bigint references public.demons(id),
 created_at timestamptz not null default now(),
 check(char_length(player) between 1 and 120 and char_length(level_name) between 1 and 120 and char_length(video_url) <= 1000)
);
create index if not exists dlfr_submissions_pending on public.level_submissions(status,created_at desc);

create table if not exists public.fr_achievements (
 id bigint generated always as identity primary key,
 title text not null,player_key text references public.players(player_key),level_name text not null,
 run_text text,description text,video_url text,created_at timestamptz default now()
);
create table if not exists public.clans (
 id bigint generated always as identity primary key, name text not null unique,tag text not null unique,
 description text,color text default '#287bba',banner_url text,logo_url text,
 recruiting boolean not null default false,updated_at timestamptz not null default now()
);
create table if not exists public.clan_members (
 player_key text primary key references public.players(player_key) on delete cascade,
 clan_id bigint not null references public.clans(id) on delete cascade,
 role text not null default 'member' check(role in ('leader','officer','member'))
);
-- Compatibilité avec une ancienne table V2 qui limitait les rôles à leader/member.
do $$ declare c record; begin
 for c in select conname,pg_get_constraintdef(oid) as definition from pg_constraint
   where conrelid='public.clan_members'::regclass and contype='c' loop
  if c.definition ilike '%role%' and c.definition not ilike '%officer%' then
    execute format('alter table public.clan_members drop constraint %I',c.conname);
  end if;
 end loop;
end $$;
-- Une contrainte supplémentaire idempotente protège tous les nouveaux rôles.
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.clan_members'::regclass and conname='dlfr_clan_role_check') then
   alter table public.clan_members add constraint dlfr_clan_role_check check(role in ('leader','officer','member'));
 end if;
end $$;
create unique index if not exists dlfr_clan_one_leader on public.clan_members(clan_id) where role='leader';
create table if not exists public.clan_invites (
 id bigint generated always as identity primary key,clan_id bigint not null references public.clans(id) on delete cascade,
 inviter_key text references public.players(player_key),invitee_key text not null references public.players(player_key),
 status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled')),
 created_at timestamptz not null default now()
);
create table if not exists public.clan_requests (
 id bigint generated always as identity primary key,clan_id bigint not null references public.clans(id) on delete cascade,
 player_key text not null references public.players(player_key),message text not null default '',
 status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawn')),
 created_at timestamptz not null default now()
);
create table if not exists public.aredl_levels(name text primary key,aredl_rank integer);
create table if not exists public.player_sanctions (
 id bigint generated always as identity primary key,player_key text not null references public.players(player_key),
 action_key text not null,reason text not null,expires_at timestamptz,actor uuid references auth.users(id),
 created_at timestamptz default now()
);
create table if not exists public.nlw_staff_roles(auth_user_id uuid primary key references auth.users(id) on delete cascade);
create table if not exists public.badge_awards (
 player_key text not null references public.players(player_key) on delete cascade,
 badge_id text not null,
 obtained_at date,
 origin text not null check(origin in ('automatic','moderator','historical')),
 created_at timestamptz not null default now(),
 primary key (player_key,badge_id)
);

-- Staging AREDL, jamais visible anonymement et jamais publié automatiquement.
create table if not exists public.aredl_import_staging (
 gd_level_id text primary key,aredl_id text,aredl_rank integer,payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','reviewed','applied','conflict')),
 fetched_at timestamptz not null default now()
);

-- Idempotence des politiques : elles peuvent être rejouées sans désactiver les anciennes.
do $$ declare t text; begin
 foreach t in array array['player_profile_owners','profile_claim_requests','level_submissions','fr_achievements','clans','clan_members','clan_invites','clan_requests','aredl_levels','player_sanctions','nlw_staff_roles','badge_awards','aredl_import_staging'] loop
   execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;

-- Droits minimaux. L'absence de policy empêche toute écriture non prévue.
create or replace function public.dlfr_can_moderate()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.staff_roles where auth_user_id=auth.uid() and role in ('editor','owner')); $$;
revoke all on function public.dlfr_can_moderate() from public;
grant execute on function public.dlfr_can_moderate() to authenticated;

-- Remplace les anciennes politiques d'écriture générales : les helpers restent lecture seule.
do $$ declare t text; p text; begin
 foreach t in array array['players','demons','completions','news_items','profile_titles','player_profile_titles','player_profiles','hall_of_fame','player_stat_snapshots','demon_position_history','site_settings'] loop
   p=case t when 'players' then 'players_staff_write' when 'demons' then 'demons_staff_write' when 'completions' then 'completions_staff_write' when 'news_items' then 'news_staff_write' when 'profile_titles' then 'titles_staff_write' when 'player_profile_titles' then 'player_titles_staff_write' when 'player_profiles' then 'profiles_staff_write' when 'hall_of_fame' then 'hall_staff_write' when 'player_stat_snapshots' then 'snapshots_staff_write' when 'demon_position_history' then 'position_staff_write' else 'settings_staff_write' end;
   execute format('drop policy if exists %I on public.%I',p,t);
   execute format('create policy %I on public.%I for all to authenticated using ((select public.dlfr_can_moderate())) with check ((select public.dlfr_can_moderate()))',p,t);
 end loop;
end $$;

drop policy if exists dlfr_owners_self on public.player_profile_owners;
create policy dlfr_owners_self on public.player_profile_owners for select to authenticated using(auth_user_id=auth.uid() or public.dlfr_can_moderate());
-- Pas de INSERT/UPDATE/DELETE directement depuis le navigateur sur owners.

drop policy if exists dlfr_claim_see on public.profile_claim_requests;
create policy dlfr_claim_see on public.profile_claim_requests for select to authenticated using(auth_user_id=auth.uid() or public.dlfr_can_moderate());
drop policy if exists dlfr_claim_request on public.profile_claim_requests;
create policy dlfr_claim_request on public.profile_claim_requests for insert to authenticated with check(
 auth_user_id=auth.uid() and status='pending' and reviewed_by is null and reviewed_at is null
 and length(trim(proof_url)) between 12 and 1000 and proof_url ~* '^https://'
 and not exists(select 1 from public.player_profile_owners o where o.auth_user_id=auth.uid())
 and not exists(select 1 from public.player_profile_owners o where o.player_key=profile_claim_requests.player_key)
);

drop policy if exists dlfr_submission_read on public.level_submissions;
create policy dlfr_submission_read on public.level_submissions for select to authenticated using(auth_user_id=auth.uid() or public.dlfr_can_moderate());
drop policy if exists dlfr_submission_add on public.level_submissions;
create policy dlfr_submission_add on public.level_submissions for insert to authenticated with check(
 auth_user_id=auth.uid() and status='pending' and reviewed_by is null and reviewed_at is null
 and video_url ~* '^https://' and length(video_url) <= 1000
);

-- Lecture publique des statistiques, pas des demandes privées/sanctions.
do $$ declare t text; begin
 foreach t in array array['fr_achievements','clans','clan_members','clan_invites','clan_requests','aredl_levels','badge_awards'] loop
  execute format('drop policy if exists dlfr_read on public.%I',t);
  if t in ('clan_invites','clan_requests') then
    execute format('create policy dlfr_read on public.%I for select to authenticated using ((select public.dlfr_can_moderate()) or exists(select 1 from public.player_profile_owners o where o.auth_user_id=auth.uid() and o.player_key = %I.%s))',t,t,case when t='clan_invites' then 'invitee_key' else 'player_key' end);
  else
    execute format('create policy dlfr_read on public.%I for select to anon,authenticated using(true)',t);
  end if;
 end loop;
end $$;
-- L'écriture des clans nécessite à terme les RPC dédiées; accès staff uniquement pour l'instant.
do $$ declare t text; begin
 foreach t in array array['fr_achievements','clans','clan_members','clan_invites','clan_requests','aredl_levels','aredl_import_staging','player_sanctions','nlw_staff_roles'] loop
  execute format('drop policy if exists dlfr_staff_write on public.%I',t);
  execute format('create policy dlfr_staff_write on public.%I for all to authenticated using ((select public.dlfr_can_moderate())) with check ((select public.dlfr_can_moderate()))',t);
 end loop;
end $$;
-- Les badges obtenus ne peuvent être ni supprimés ni dégradés par le navigateur.
-- Seules les trois distinctions de classement sont manuelles; les autres via le trigger.
drop policy if exists dlfr_staff_write on public.badge_awards;
drop policy if exists dlfr_badge_manual_insert on public.badge_awards;
create policy dlfr_badge_manual_insert on public.badge_awards for insert to authenticated with check(
 public.dlfr_can_moderate() and origin='moderator'
 and badge_id in ('goat-pays','goat-region','clash-clans')
);
drop policy if exists dlfr_staff_read_staging on public.aredl_import_staging;
create policy dlfr_staff_read_staging on public.aredl_import_staging for select to authenticated using(public.dlfr_can_moderate());
drop policy if exists dlfr_staff_read_sanctions on public.player_sanctions;
create policy dlfr_staff_read_sanctions on public.player_sanctions for select to authenticated using(public.dlfr_can_moderate());
drop policy if exists dlfr_staff_read_nlw on public.nlw_staff_roles;
create policy dlfr_staff_read_nlw on public.nlw_staff_roles for select to authenticated using(public.dlfr_can_moderate() or auth_user_id=auth.uid());

-- Pour que le joueur relié puisse personnaliser sa fiche, mais pas ses records ni son pays.
drop policy if exists dlfr_self_profile_insert on public.player_profiles;
create policy dlfr_self_profile_insert on public.player_profiles for insert to authenticated with check(
 exists(select 1 from public.player_profile_owners o where o.player_key=player_profiles.player_key and o.auth_user_id=auth.uid())
);
drop policy if exists dlfr_self_profile_update on public.player_profiles;
create policy dlfr_self_profile_update on public.player_profiles for update to authenticated
 using(exists(select 1 from public.player_profile_owners o where o.player_key=player_profiles.player_key and o.auth_user_id=auth.uid()))
 with check(exists(select 1 from public.player_profile_owners o where o.player_key=player_profiles.player_key and o.auth_user_id=auth.uid()));
-- L'éditeur joueur ne doit pas pouvoir manipuler des colonnes de contrôle ajoutées dans le futur.

-- Une liaison approuvée lie exactement un utilisateur Auth à un profil, par contrainte unique.
create or replace function public.dlfr_review_claim(p_request_id bigint,p_approve boolean)
returns text language plpgsql security definer set search_path='' as $$
declare r public.profile_claim_requests%rowtype;
begin
 if not public.dlfr_can_moderate() then raise exception 'Modérateur requis'; end if;
 select * into r from public.profile_claim_requests where id=p_request_id for update;
 if not found or r.status<>'pending' then raise exception 'Demande déjà traitée ou introuvable'; end if;
 if p_approve then
   if exists(select 1 from public.player_profile_owners where player_key=r.player_key or auth_user_id=r.auth_user_id) then raise exception 'Un des comptes est déjà lié'; end if;
   insert into public.player_profile_owners(player_key,auth_user_id) values(r.player_key,r.auth_user_id);
   update public.profile_claim_requests set status='approved',reviewed_by=auth.uid(),reviewed_at=now() where id=p_request_id;
 else
   update public.profile_claim_requests set status='rejected',reviewed_by=auth.uid(),reviewed_at=now() where id=p_request_id;
 end if;
 return case when p_approve then 'approved' else 'rejected' end;
end $$;
revoke all on function public.dlfr_review_claim(bigint,boolean) from public;
grant execute on function public.dlfr_review_claim(bigint,boolean) to authenticated;

-- Attribution modérateur atomique : jamais un double record pour le même niveau/joueur.
create or replace function public.dlfr_assign_completion(p_player_key text,p_demon_id bigint,p_video_url text default null,p_achieved_at timestamptz default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare rk text; result_id bigint;
begin
 if not public.dlfr_can_moderate() then raise exception 'Modérateur requis'; end if;
 rk=lower(trim(p_player_key));
 if not exists(select 1 from public.players where player_key=rk) then raise exception 'Joueur absent'; end if;
 if not exists(select 1 from public.demons where id=p_demon_id) then raise exception 'Niveau absent'; end if;
 if p_video_url is not null and p_video_url <> '' and p_video_url !~* '^https://' then raise exception 'URL vidéo HTTPS requise'; end if;
 select id into result_id from public.completions where demon_id=p_demon_id and lower(trim(player))=rk for update;
 if result_id is not null then
   update public.completions set progress=100,
    video_url=coalesce(nullif(video_url,''),nullif(p_video_url,'')) where id=result_id;
 else
   insert into public.completions(demon_id,player,progress,video_url,created_at)
   values(p_demon_id,rk,100,nullif(p_video_url,''),coalesce(p_achieved_at,now())) returning id into result_id;
 end if;
 return result_id;
end $$;
revoke all on function public.dlfr_assign_completion(text,bigint,text,timestamptz) from public;
grant execute on function public.dlfr_assign_completion(text,bigint,text,timestamptz) to authenticated;

-- Validation serveur d'une soumission, sans perdre l'approbation manuelle d'un niveau existant.
create or replace function public.dlfr_review_submission(p_request_id bigint,p_approve boolean,p_unrated boolean default false,p_position integer default null)
returns text language plpgsql security definer set search_path='' as $$
declare r public.level_submissions%rowtype; d_id bigint; p_key text; target_position integer;
begin
 if not public.dlfr_can_moderate() then raise exception 'Modérateur requis'; end if;
 select * into r from public.level_submissions where id=p_request_id for update;
 if not found or r.status<>'pending' then raise exception 'Soumission déjà traitée ou introuvable'; end if;
 if not p_approve then
   update public.level_submissions set status='rejected',reviewed_by=auth.uid(),reviewed_at=now() where id=r.id;
   return 'rejected';
 end if;
 p_key=lower(trim(r.player));
 select id into d_id from public.demons where nullif(trim(level_id),'')=nullif(trim(r.level_id),'') and nullif(trim(r.level_id),'') is not null limit 1;
 if d_id is null then
   if nullif(trim(r.level_id),'') is not null and exists(
     select 1 from public.demons where lower(name)=lower(trim(r.level_name))
       and nullif(trim(level_id),'') is not null and trim(level_id)<>trim(r.level_id)
   ) then raise exception 'Conflit entre nom et ID Geometry Dash : contrôle manuel requis'; end if;
   select id into d_id from public.demons
   where lower(name)=lower(trim(r.level_name))
     and (nullif(trim(r.level_id),'') is null or nullif(trim(level_id),'') is null)
   limit 1;
   if d_id is not null and nullif(trim(r.level_id),'') is not null then
     update public.demons set level_id=trim(r.level_id) where id=d_id and (level_id is null or trim(level_id)='');
   end if;
 end if;
 if d_id is null then
   if p_position is null or p_position<1 then raise exception 'Indique un rang pour le nouveau niveau'; end if;
   target_position=case when p_unrated then 100000000+p_position else p_position end;
   if exists(select 1 from public.demons where position=target_position) then raise exception 'Position occupée : choisir un rang libre'; end if;
   insert into public.demons(position,name,level_id,publisher,creator,verifier,unrated,unrated_position,video_url)
   values(target_position,trim(r.level_name),nullif(trim(r.level_id),''),coalesce(nullif(trim(r.publisher),''),'Inconnu'),r.creator,r.verifier,p_unrated,case when p_unrated then p_position else null end,r.video_url)
   returning id into d_id;
 end if;
 if not exists(select 1 from public.players where player_key=p_key) then
    insert into public.players(player_key,username,display_name,has_account,country_code)
    values(p_key,trim(r.player),trim(r.player),true,null);
 end if;
 update public.completions set progress=greatest(progress,r.progress),
    video_url=coalesce(nullif(video_url,''),r.video_url)
 where demon_id=d_id and lower(trim(player))=p_key;
 if not found then
   insert into public.completions(demon_id,player,progress,video_url)
   values(d_id,p_key,r.progress,r.video_url);
 end if;
 update public.level_submissions set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),demon_id=d_id where id=r.id;
 return 'approved';
end $$;
revoke all on function public.dlfr_review_submission(bigint,boolean,boolean,integer) from public;
grant execute on function public.dlfr_review_submission(bigint,boolean,boolean,integer) to authenticated;

-- Attribution automatique durable des badges de progression à 100 %.
create or replace function public.dlfr_award_progress(p_player_key text,p_historical boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare c_list integer;c_main integer;c_nlw integer;c_unrated integer;c_total integer;c_main_total integer;
begin
 select count(distinct d.id) filter(where not d.unrated and d.position between 1 and 150),
 count(distinct d.id) filter(where not d.unrated and d.position between 1 and 75),
 count(distinct d.id) filter(where not d.unrated and d.position>150),
 count(distinct d.id) filter(where d.unrated)
 into c_list,c_main,c_nlw,c_unrated from public.completions r join public.demons d on d.id=r.demon_id where lower(r.player)=lower(p_player_key) and r.progress=100;
 select count(*),count(*) filter(where position<=75) into c_total,c_main_total from public.demons where not unrated and position between 1 and 150;
 insert into public.badge_awards(player_key,badge_id,obtained_at,origin)
 select p_player_key,s.badge,case when p_historical then null else current_date end,case when p_historical then 'historical' else 'automatic' end
 from (values
  ('bienvenue-club',c_list>=1),('dix',c_list>=10),('faucheur-liste',c_list>=35),('grand-faucheur-liste',c_list>=75),
  ('bienvenue-nlw',c_nlw>=1),('dix-nlw',c_nlw>=10),('cent',c_nlw>=100),('faucheur-nlw',c_nlw>=250),('grand-faucheur-nlw',c_nlw>=500),('nlwgod',c_nlw>=1000),
  ('unrated-premier',c_unrated>=1),('unrated-master',c_unrated>=10),('cour-grands',c_main>=1),
  ('demi-dieu',c_main_total=75 and c_main>=75),('god',c_total=150 and c_list>=150)
 ) as s(badge,earned) where s.earned
 on conflict(player_key,badge_id) do nothing;
end $$;
revoke all on function public.dlfr_award_progress(text,boolean) from public;
-- Le déclencheur peut invoquer cette fonction sans accorder un RPC public.
create or replace function public.dlfr_completion_badges_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin if new.progress=100 then perform public.dlfr_award_progress(lower(new.player),new.created_at::date < current_date); end if;return new;end $$;
drop trigger if exists dlfr_completion_auto_badges on public.completions;
create trigger dlfr_completion_auto_badges after insert or update of progress on public.completions
for each row execute function public.dlfr_completion_badges_trigger();
-- Backfill de l'existant : ne pas inventer de date de victoire.
do $$ declare k text; begin
 for k in select player_key from public.players loop perform public.dlfr_award_progress(k,true); end loop;
end $$;

-- Audit des nouveaux objets ; pas de trigger avec des secrets dans les logs.
do $$ declare t text; begin
 foreach t in array array['badge_awards','profile_claim_requests','level_submissions'] loop
  execute format('drop trigger if exists %I on public.%I','dlfr_audit_'||t,t);
  -- audit_log présent si 01_schema a bien été appliqué
  execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_staff_change()','dlfr_audit_'||t,t);
 end loop;
end $$;

grant select on public.player_profile_owners,public.profile_claim_requests,public.level_submissions,public.fr_achievements,
 public.clans,public.clan_members,public.clan_invites,public.clan_requests,public.aredl_levels,
 public.badge_awards,public.player_sanctions,public.nlw_staff_roles,public.aredl_import_staging to authenticated;
grant select on public.fr_achievements,public.clans,public.clan_members,public.aredl_levels,public.badge_awards to anon;
grant insert on public.profile_claim_requests,public.level_submissions to authenticated;
grant insert,update,delete on public.fr_achievements,public.clans,public.clan_members,public.clan_invites,
 public.clan_requests,public.aredl_levels,public.player_sanctions,public.nlw_staff_roles,
 public.aredl_import_staging to authenticated;
grant insert on public.badge_awards to authenticated;
revoke update,delete on public.badge_awards from authenticated;
grant usage,select on all sequences in schema public to authenticated;
commit;

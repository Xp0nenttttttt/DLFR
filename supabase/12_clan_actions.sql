-- DLFR V3.0 : actions des clans pour comptes réellement liés par un modérateur.
-- Exécuter après 11_production.sql. Aucun droit de modification libre des tables n'est donné au joueur.
begin;
create unique index if not exists dlfr_clan_invite_unique_pending on public.clan_invites(clan_id,invitee_key) where status='pending';
create unique index if not exists dlfr_clan_request_unique_pending on public.clan_requests(clan_id,player_key) where status='pending';

-- Les officiers/chefs connectés doivent pouvoir consulter les candidatures/invitations pour les traiter.
drop policy if exists dlfr_read on public.clan_invites;
create policy dlfr_read on public.clan_invites for select to authenticated using (
 public.dlfr_can_moderate() or
 exists(select 1 from public.player_profile_owners o where o.auth_user_id=auth.uid() and o.player_key=invitee_key) or
 exists(select 1 from public.player_profile_owners o join public.clan_members m on m.player_key=o.player_key
 where o.auth_user_id=auth.uid() and m.clan_id=clan_invites.clan_id and m.role in ('leader','officer'))
);
drop policy if exists dlfr_read on public.clan_requests;
create policy dlfr_read on public.clan_requests for select to authenticated using (
 public.dlfr_can_moderate() or
 exists(select 1 from public.player_profile_owners o where o.auth_user_id=auth.uid() and o.player_key=player_key) or
 exists(select 1 from public.player_profile_owners o join public.clan_members m on m.player_key=o.player_key
 where o.auth_user_id=auth.uid() and m.clan_id=clan_requests.clan_id and m.role in ('leader','officer'))
);

create or replace function public.dlfr_clan_action(p_command jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare a text; kind text; target text; cid bigint; iid bigint; rid bigint; role_now text; member_role text;
 c public.clans%rowtype; req public.clan_requests%rowtype; inv public.clan_invites%rowtype;
 nm text; tag_value text; newcolor text;
begin
 select player_key into a from public.player_profile_owners where auth_user_id=auth.uid();
 if a is null then raise exception 'Relie ton compte Discord à un profil approuvé avant de rejoindre un clan'; end if;
 kind=p_command->>'type';target=lower(trim(coalesce(p_command->>'target','')));
 cid=nullif(p_command->>'clan_id','')::bigint;
 iid=nullif(p_command->>'invite_id','')::bigint;
 rid=nullif(p_command->>'request_id','')::bigint;
 if kind='create' then
   if exists(select 1 from public.clan_members where player_key=a) then raise exception 'Tu es déjà dans un clan'; end if;
   nm=trim(coalesce(p_command->>'name',''));tag_value=upper(trim(coalesce(p_command->>'tag','')));
   if length(nm) not between 3 and 45 or length(tag_value) not between 2 and 5 or tag_value !~ '^[A-Z0-9]+$' then raise exception 'Nom ou tag invalide'; end if;
   newcolor=coalesce(p_command->>'color','#287bba');if newcolor !~ '^#[0-9a-fA-F]{6}$' then newcolor='#287bba'; end if;
   insert into public.clans(name,tag,description,color)
   values(nm,tag_value,left(coalesce(p_command->>'description',''),300),newcolor) returning id into cid;
   insert into public.clan_members(clan_id,player_key,role) values(cid,a,'leader');
   return 'created';
 end if;
 if kind in ('accept','decline','cancel') then
   select * into inv from public.clan_invites where id=iid for update;
   if not found or inv.status<>'pending' then raise exception 'Invitation introuvable'; end if;
   cid=inv.clan_id;
 end if;
 if kind in ('approve','reject','withdraw') then
   select * into req from public.clan_requests where id=rid for update;
   if not found or req.status<>'pending' then raise exception 'Candidature introuvable'; end if;
   cid=req.clan_id;
 end if;
 select * into c from public.clans where id=cid for update;
 if not found then raise exception 'Clan introuvable'; end if;
 select role into role_now from public.clan_members where clan_id=cid and player_key=a;
 if kind='request' then
   if not c.recruiting then raise exception 'Recrutement fermé'; end if;
   if exists(select 1 from public.clan_members where player_key=a) then raise exception 'Déjà dans un clan'; end if;
   if (select count(*) from public.clan_members where clan_id=cid)>=25 then raise exception 'Clan complet'; end if;
   insert into public.clan_requests(clan_id,player_key,message) values(cid,a,left(coalesce(p_command->>'message',''),220));return 'requested';
 end if;
 if kind='withdraw' then
   if req.player_key<>a then raise exception 'Candidature appartenant à un autre joueur'; end if;
   update public.clan_requests set status='withdrawn' where id=rid;return 'withdrawn';
 end if;
 if kind='accept' then
   if inv.invitee_key<>a then raise exception 'Cette invitation ne t’est pas destinée'; end if;
   if exists(select 1 from public.clan_members where player_key=a) then raise exception 'Déjà dans un clan'; end if;
   if (select count(*) from public.clan_members where clan_id=cid)>=25 then raise exception 'Clan complet'; end if;
   insert into public.clan_members(clan_id,player_key,role) values(cid,a,'member');
   update public.clan_invites set status=case when id=iid then 'accepted' else 'declined' end where invitee_key=a and status='pending';
   update public.clan_requests set status='withdrawn' where player_key=a and status='pending';
   return 'accepted';
 end if;
 if kind='decline' then
   if inv.invitee_key<>a then raise exception 'Invitation appartenant à un autre joueur'; end if;
   update public.clan_invites set status='declined' where id=iid;return 'declined';
 end if;
 if kind='leave' then
   if role_now is null then raise exception 'Tu n’es pas membre'; end if;
   if role_now='leader' then raise exception 'Transfère la direction avant de partir'; end if;
   delete from public.clan_members where player_key=a;return 'left';
 end if;
 if kind not in ('invite','cancel','approve','reject','promote','demote','transfer','remove','update','disband') then raise exception 'Action invalide'; end if;
 if role_now not in ('leader','officer') then raise exception 'Chef ou officier requis'; end if;
 if kind='invite' then
   if not exists(select 1 from public.players where player_key=target) then raise exception 'Joueur inconnu'; end if;
   if exists(select 1 from public.clan_members where player_key=target) then raise exception 'Déjà dans un clan'; end if;
   if (select count(*) from public.clan_members where clan_id=cid)>=25 then raise exception 'Clan complet'; end if;
   insert into public.clan_invites(clan_id,inviter_key,invitee_key) values(cid,a,target);return 'invited';
 end if;
 if kind='cancel' then
   update public.clan_invites set status='cancelled' where id=iid;return 'cancelled';
 end if;
 if kind in ('approve','reject') then
   if kind='approve' then
     if exists(select 1 from public.clan_members where player_key=req.player_key) then raise exception 'Joueur déjà membre d’un clan'; end if;
     if (select count(*) from public.clan_members where clan_id=cid)>=25 then raise exception 'Clan complet'; end if;
     insert into public.clan_members(clan_id,player_key,role) values(cid,req.player_key,'member');
     update public.clan_requests set status=case when id=rid then 'approved' else 'withdrawn' end where player_key=req.player_key and status='pending';
     update public.clan_invites set status='declined' where invitee_key=req.player_key and status='pending';
   else
     update public.clan_requests set status='rejected' where id=rid;
   end if;
   return kind;
 end if;
 select role into member_role from public.clan_members where clan_id=cid and player_key=target;
 if kind='remove' then
   if member_role is null or member_role='leader' or target=a then raise exception 'Retrait interdit'; end if;
   if role_now='officer' and member_role<>'member' then raise exception 'Officier : retrait des membres uniquement'; end if;
   delete from public.clan_members where player_key=target;return 'removed';
 end if;
 if role_now<>'leader' then raise exception 'Action réservée au chef'; end if;
 if kind='transfer' then
   if member_role is null or target=a then raise exception 'Choisis un autre membre du clan'; end if;
   update public.clan_members set role='member' where player_key=a;
   update public.clan_members set role='leader' where player_key=target;return 'transferred';
 end if;
 if kind in ('promote','demote') then
   if member_role is null or member_role='leader' then raise exception 'Choisis un membre du clan'; end if;
   update public.clan_members set role=case when kind='promote' then 'officer' else 'member' end where player_key=target;return kind;
 end if;
 if kind='update' then
   nm=trim(coalesce(p_command->>'name',''));if length(nm) not between 3 and 45 then raise exception 'Nom invalide'; end if;
   newcolor=coalesce(p_command->>'color','#287bba');if newcolor !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Couleur invalide'; end if;
   if coalesce(p_command->>'banner_url','')<>'' and (p_command->>'banner_url') !~* '^https://' then raise exception 'Bannière HTTPS requise'; end if;
   if coalesce(p_command->>'logo_url','')<>'' and (p_command->>'logo_url') !~* '^https://' then raise exception 'Logo HTTPS requis'; end if;
   update public.clans set name=nm,description=left(coalesce(p_command->>'description',''),500),color=newcolor,
     banner_url=nullif(p_command->>'banner_url',''),logo_url=nullif(p_command->>'logo_url',''),
     recruiting=coalesce((p_command->>'recruiting')::boolean,false),updated_at=now() where id=cid;
   return 'updated';
 end if;
 if kind='disband' then delete from public.clans where id=cid;return 'disbanded'; end if;
 return kind;
end $$;
revoke all on function public.dlfr_clan_action(jsonb) from public;
grant execute on function public.dlfr_clan_action(jsonb) to authenticated;
commit;

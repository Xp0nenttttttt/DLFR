-- DLFR V3.0.2 — Création d'une fiche joueur PAR SON PROPRE COMPTE Discord.
-- Migration ADDITIVE après 01_schema.sql + 11_production.sql (et 12_clan_actions.sql).
-- À exécuter depuis Supabase SQL Editor (rôle propriétaire de la base).
-- Aucun INSERT autorisé directement au navigateur dans players/owners.
-- Pas de changement des données déjà présentes.
begin;

create or replace function public.dlfr_create_own_player(
  p_username text,
  p_country_code text default null,
  p_region_code text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_username text := btrim(coalesce(p_username,''));
  v_key text;
  v_country text := nullif(upper(btrim(coalesce(p_country_code,''))), '');
  v_region text := nullif(upper(btrim(coalesce(p_region_code,''))), '');
begin
  if v_user is null then
    raise exception 'Connexion obligatoire.' using errcode='P0001';
  end if;

  -- Vérifie le fournisseur sur le serveur, et non dans les données modifiables du navigateur.
  if not exists (
    select 1 from auth.identities i
    where i.user_id = v_user and i.provider = 'discord'
  ) then
    raise exception 'Connecte ton compte Discord avant de créer une fiche.' using errcode='P0001';
  end if;

  -- Garde la même forme que les clés utilisées par la modération actuelle.
  if v_username !~ '^[A-Za-z0-9_-]{2,32}$' then
    raise exception 'Pseudo invalide : 2 à 32 lettres, chiffres, tirets ou underscores.' using errcode='P0001';
  end if;
  v_key := lower(v_username);
  if v_key in ('admin','administrator','moderator','moderateur','staff','owner','demonlist','dlfr','aredl') then
    raise exception 'Ce pseudo est réservé.' using errcode='P0001';
  end if;
  if v_country is null or v_country !~ '^[A-Z]{2}$' then
    raise exception 'Choisis un pays valide.' using errcode='P0001';
  end if;
  if v_country <> 'FR' and v_region is not null then
    raise exception 'La région n’est disponible que pour la France.' using errcode='P0001';
  end if;
  if v_region is not null and v_region <> all(array[
    'ARA','BFC','BRE','CVL','COR','GES','HDF','IDF','NOR','NAQ','OCC','PDL','PAC',
    'GP','MQ','GF','RE','YT'
  ]) then
    raise exception 'Région française inconnue.' using errcode='P0001';
  end if;

  -- Une seule fiche par authentification, même si le formulaire est soumis deux fois.
  if exists(select 1 from public.player_profile_owners o where o.auth_user_id=v_user) then
    raise exception 'Ce compte possède déjà une fiche DLFR.' using errcode='P0001';
  end if;
  if exists(select 1 from public.profile_claim_requests c where c.auth_user_id=v_user and c.status='pending') then
    raise exception 'Tu as déjà une demande de revendication en attente.' using errcode='P0001';
  end if;

  -- Verrou par pseudo pour rendre les créations parallèles déterministes.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dlfr-own-player:'||v_key));
  -- Rechercher aussi les alias visibles, au cas où une fiche importée porte une autre clé.
  if exists (
    select 1 from public.players p
    where p.player_key=v_key
       or lower(btrim(p.username))=v_key
       or lower(btrim(coalesce(p.display_name,'')))=v_key
  ) then
    raise exception 'Ce pseudo existe déjà. Utilise « Demander la liaison » pour cette fiche.' using errcode='P0001';
  end if;

  insert into public.players(player_key,username,display_name,country_code,has_account)
  values(v_key,v_username,v_username,v_country,true);
  insert into public.player_profile_owners(player_key,auth_user_id)
  values(v_key,v_user);
  insert into public.player_profiles(player_key,region_code)
  values(v_key,v_region);

  -- La transaction PostgreSQL garantit zéro création partielle si une insertion échoue.
  insert into public.community_audit_log(actor_user_id,action_key,target,details)
  values(v_user,'PLAYER_SELF_CREATE',v_key,'Fiche personnelle créée via Discord Auth');
  return v_key;
end;
$$;

revoke all on function public.dlfr_create_own_player(text,text,text) from public;
revoke all on function public.dlfr_create_own_player(text,text,text) from anon;
grant execute on function public.dlfr_create_own_player(text,text,text) to authenticated;

commit;

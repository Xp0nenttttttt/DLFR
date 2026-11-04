-- DLFR V128 — personnalisation de la fiche (partie claire de l'aperçu et du profil).
-- Styles gratuits (préférence publique) + fonds animés achetables (catégorie « card » de la boutique).
alter table public.dlfr_profile_preferences add column if not exists card_style text not null default 'classic';
alter table public.dlfr_profile_preferences drop constraint if exists dlfr_profile_preferences_card_style_check;
alter table public.dlfr_profile_preferences add constraint dlfr_profile_preferences_card_style_check
 check (card_style in ('classic','tinted','gradient','dark','glass'));

create or replace function public.dlfr_set_card_style(p_style text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_player text;
begin
 if (select auth.uid()) is null then raise exception 'Connexion obligatoire.'; end if;
 select player_key into v_player from public.player_profile_owners where auth_user_id = (select auth.uid()) limit 1;
 if v_player is null then raise exception 'Aucun profil joueur lié à ce compte.'; end if;
 if coalesce(p_style,'') not in ('classic','tinted','gradient','dark','glass') then raise exception 'Style inconnu.'; end if;
 insert into public.dlfr_profile_preferences(player_key, card_style, updated_at) values (v_player, p_style, now())
 on conflict (player_key) do update set card_style = excluded.card_style, updated_at = now();
 return p_style;
end $$;
revoke all on function public.dlfr_set_card_style(text) from public, anon;
grant execute on function public.dlfr_set_card_style(text) to authenticated;

alter table public.dlfr_reward_catalog drop constraint if exists dlfr_reward_catalog_category_check;
alter table public.dlfr_reward_catalog add constraint dlfr_reward_catalog_category_check check (category in ('frame','badge','banner','theme','name','card'));
alter table public.dlfr_reward_equipped drop constraint if exists dlfr_reward_equipped_category_check;
alter table public.dlfr_reward_equipped add constraint dlfr_reward_equipped_category_check check (category in ('frame','badge','banner','theme','name','card'));

insert into public.dlfr_reward_catalog(item_key,label,description,emoji,category,price,active,rarity) values
 ('card_aurora','Fond Aurore boréale','Fiche sombre traversée par une aurore boréale animée.','🌌','card',900,true,'Épique'),
 ('card_magma','Fond Magma','Fiche volcanique : lave qui pulse sous les statistiques.','🌋','card',900,true,'Épique'),
 ('card_holo','Fond Holographique','Reflets irisés qui changent de couleur au survol.','💿','card',1600,true,'Légendaire'),
 ('card_galaxy','Fond Galaxie','Champ d’étoiles et nébuleuse en mouvement.','🪐','card',2500,true,'Mythique')
on conflict (item_key) do nothing;

create or replace function public.dlfr_reward_equip(p_item_key text, p_category text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_category text;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 if p_category not in ('frame','badge','banner','theme','name','card') then raise exception 'Catégorie invalide'; end if;
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

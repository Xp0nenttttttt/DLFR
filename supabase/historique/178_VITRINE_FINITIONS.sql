-- V178 (DÉJÀ APPLIQUÉ, migration dlfr_178_showcase_meta)
-- dlfr_cards_public renvoie en plus :
--   'prestige'      : Prestige du joueur (plafonné à 11 = Prestige MAX)
--   'showcase_meta' : {"<id de carte>": {"f": finition 0-4, "s": étoiles 0-10, "p": prestige de carte 0-11}}
-- pour que la vitrine du profil affiche les cartes Holo / Prismatique / Obsidienne / Shiny, leurs étoiles et leur prestige.
create or replace function public.dlfr_cards_public(p_player_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
 with o as (select auth_user_id from public.player_profile_owners where player_key = p_player_key limit 1)
 select jsonb_build_object(
  'owned', (select count(*) from public.dlfr_card_inventory i join o on o.auth_user_id = i.auth_user_id where i.qty + i.adv_qty > 0),
  'total', (select count(*) from public.dlfr_cards),
  'mythic', (select count(*) from public.dlfr_card_inventory i join o on o.auth_user_id = i.auth_user_id join public.dlfr_cards c on c.id = i.card_id where i.qty + i.adv_qty > 0 and c.rarity = 'Mythique'),
  'collections', (select count(*) from public.dlfr_card_collection_rewards r join o on o.auth_user_id = r.auth_user_id),
  'hidden', false,
  'prestige', coalesce((select least(11, case when (a.save->'progress'->>'prestige') ~ '^[0-9]{1,4}$' then (a.save->'progress'->>'prestige')::int else 0 end)
     from public.dlfr_cards_adventure a join o on o.auth_user_id = a.auth_user_id), 0),
  'showcase', coalesce((select to_jsonb(array(select x from unnest(s.card_ids) with ordinality u(x,n)
       where exists(select 1 from public.dlfr_card_inventory i where i.auth_user_id = s.auth_user_id and i.card_id = x and i.qty + i.adv_qty > 0) order by n))
     from public.dlfr_card_showcase s join o on o.auth_user_id = s.auth_user_id), '[]'::jsonb),
  'showcase_meta', coalesce((select jsonb_object_agg(e->>'id', jsonb_build_object('f', coalesce(e->'finish','0'::jsonb), 's', coalesce(e->'stars','0'::jsonb), 'p', coalesce(e->'prestige','0'::jsonb)))
     from public.dlfr_cards_adventure a join o on o.auth_user_id = a.auth_user_id
     join public.dlfr_card_showcase s on s.auth_user_id = a.auth_user_id
     cross join lateral jsonb_array_elements(case when jsonb_typeof(a.save->'owned') = 'array' then a.save->'owned' else '[]'::jsonb end) e
     where (e->>'id') ~ '^[0-9]{1,15}$' and (e->>'id')::bigint = any(s.card_ids)), '{}'::jsonb)) $$;
grant execute on function public.dlfr_cards_public(text) to anon, authenticated;

-- DLFR V155 — Rareté « Secrète » (1 chance sur 1 000 000 par carte tirée).
alter table public.dlfr_cards drop constraint if exists dlfr_cards_rarity_check;
alter table public.dlfr_cards add constraint dlfr_cards_rarity_check check (rarity in ('Commun','Rare','Épique','Légendaire','Mythique','Ultra','Secrète','Festive'));
create or replace function public.dlfr_card_value(p_rarity text)
returns integer language sql immutable set search_path = '' as $$
 select case p_rarity when 'Commun' then 2 when 'Rare' then 5 when 'Épique' then 15 when 'Légendaire' then 40 when 'Mythique' then 120 when 'Ultra' then 400 when 'Secrète' then 1000 when 'Festive' then 60 else 2 end $$;

-- V156 : les cartes secrètes ne comptent pas pour le bonus de collection complète.
create or replace function public.dlfr_cards_check_collections(p_auth uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare c record; v_bonus jsonb := '[]'::jsonb;
begin
 for c in select col.id, col.name, count(k.id)::int n from public.dlfr_card_collections col join public.dlfr_cards k on k.collection_id = col.id and k.rarity <> 'Secrète'
   where col.is_published and not exists(select 1 from public.dlfr_card_collection_rewards r where r.auth_user_id = p_auth and r.collection_id = col.id)
   group by col.id, col.name
   having count(k.id) > 0 and count(k.id) = count(*) filter (where exists(select 1 from public.dlfr_card_inventory i where i.auth_user_id = p_auth and i.card_id = k.id and i.qty + i.adv_qty > 0))
 loop
  insert into public.dlfr_card_collection_rewards(auth_user_id, collection_id, coins) values (p_auth, c.id, c.n * 40) on conflict do nothing;
  insert into public.dlfr_wallet_ledger(auth_user_id, amount, reason, ref, note) values (p_auth, c.n * 40, 'collection', c.id::text, 'Collection complète : '||c.name) on conflict do nothing;
  v_bonus := v_bonus || jsonb_build_array(jsonb_build_object('collection', c.name, 'coins', c.n * 40));
 end loop;
 return v_bonus;
end $function$;

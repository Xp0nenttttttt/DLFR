-- DLFR V155 — Rareté « Secrète » (1 chance sur 1 000 000 par carte tirée).
alter table public.dlfr_cards drop constraint if exists dlfr_cards_rarity_check;
alter table public.dlfr_cards add constraint dlfr_cards_rarity_check check (rarity in ('Commun','Rare','Épique','Légendaire','Mythique','Ultra','Secrète','Festive'));
create or replace function public.dlfr_card_value(p_rarity text)
returns integer language sql immutable set search_path = '' as $$
 select case p_rarity when 'Commun' then 2 when 'Rare' then 5 when 'Épique' then 15 when 'Légendaire' then 40 when 'Mythique' then 120 when 'Ultra' then 400 when 'Secrète' then 1000 when 'Festive' then 60 else 2 end $$;

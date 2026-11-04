-- DLFR V147 — Un booster par collection dans le mode Aventure (réglable par propriétaires / supermodos).
alter table public.dlfr_card_collections add column if not exists booster_enabled boolean not null default true;
alter table public.dlfr_card_collections add column if not exists booster_cost integer not null default 80 check (booster_cost between 1 and 100000);
alter table public.dlfr_card_collections add column if not exists booster_level integer not null default 1 check (booster_level between 1 and 200);
alter table public.dlfr_card_collections add column if not exists booster_count integer not null default 5 check (booster_count between 1 and 10);

create or replace function public.dlfr_cards_admin_set_collection_booster(p_id bigint, p_enabled boolean, p_cost integer, p_level integer, p_count integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if not coalesce(public.dlfr_cards_lab_access(), false) then raise exception 'Accès refusé' using errcode = '42501'; end if;
 update public.dlfr_card_collections set booster_enabled = coalesce(p_enabled, true),
   booster_cost = greatest(1, least(100000, coalesce(p_cost, 80))),
   booster_level = greatest(1, least(200, coalesce(p_level, 1))),
   booster_count = greatest(1, least(10, coalesce(p_count, 5))), updated_at = now()
  where id = p_id;
 if not found then raise exception 'Collection introuvable'; end if;
 return true;
end $$;
revoke all on function public.dlfr_cards_admin_set_collection_booster(bigint, boolean, integer, integer, integer) from public, anon;
grant execute on function public.dlfr_cards_admin_set_collection_booster(bigint, boolean, integer, integer, integer) to authenticated;

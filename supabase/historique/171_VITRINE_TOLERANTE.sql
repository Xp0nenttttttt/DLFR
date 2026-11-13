-- V171 (DÉJÀ APPLIQUÉ, migration dlfr_171_showcase_tolerant)
-- dlfr_cards_set_showcase : les cartes qui ne sont plus dans la collection (ex. Ultra retirées) sont
-- enlevées en silence au lieu de refuser toute la vitrine (« Tu ne peux exposer que des cartes de ta collection. »).
create or replace function public.dlfr_cards_set_showcase(p_ids bigint[])
returns bigint[] language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); v_ids bigint[];
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 select coalesce(array_agg(x order by o), '{}') into v_ids from (
  select distinct on (x) x, o from unnest(coalesce(p_ids,'{}')) with ordinality u(x,o)
  where exists(select 1 from public.dlfr_card_inventory i where i.auth_user_id = v_auth and i.card_id = x and i.qty + i.adv_qty > 0)
  order by x, o) t;
 if cardinality(v_ids) > 5 then raise exception 'Ta vitrine peut contenir 5 cartes au maximum.'; end if;
 insert into public.dlfr_card_showcase(auth_user_id, card_ids, updated_at) values (v_auth, v_ids, now())
 on conflict (auth_user_id) do update set card_ids = excluded.card_ids, updated_at = now();
 return v_ids;
end $$;

-- DLFR V141 — Mode Aventure : plus aucune carte perdue à cause de la limite de 120 cartes / jour.
-- Les cartes au-delà de la limite sont mises de côté (file d'attente serveur) et rejoignent la collection
-- automatiquement les jours suivants, toujours au rythme de 120 par jour (l'anti-triche reste le même).

create table if not exists public.dlfr_card_adv_queue(
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 card_id bigint not null references public.dlfr_cards(id) on delete cascade,
 qty integer not null check (qty > 0),
 primary key (auth_user_id, card_id));
alter table public.dlfr_card_adv_queue enable row level security;
revoke all on public.dlfr_card_adv_queue from anon, authenticated;

create or replace function public.dlfr_adventure_sync(p_delta jsonb, p_import boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); s public.dlfr_card_state; v_today date := (now() at time zone 'Europe/Paris')::date;
 e record; q record; v_id bigint; v_d int; v_left int; v_take int; v_added int := 0; v_dropped int := 0; v_queued int := 0;
 v_delivered int := 0; v_qroom int; v_cur public.dlfr_card_inventory;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 if p_delta is null or jsonb_typeof(p_delta) <> 'object' then raise exception 'Synchronisation invalide'; end if;
 insert into public.dlfr_card_state(auth_user_id) values (v_auth) on conflict do nothing;
 select * into s from public.dlfr_card_state where auth_user_id = v_auth for update;
 if p_import and s.adv_imported then p_import := false; end if;
 if s.adv_day is distinct from v_today then s.adv_added := 0; end if;
 v_left := case when p_import then 500 else greatest(0, 120 - s.adv_added) end;

 -- 1) Livraison des cartes mises de côté les jours précédents.
 if not p_import then
  for q in select card_id, qty from public.dlfr_card_adv_queue where auth_user_id = v_auth order by card_id for update loop
   exit when v_left <= 0;
   v_take := least(q.qty, v_left);
   insert into public.dlfr_card_inventory(auth_user_id, card_id, qty, adv_qty) values (v_auth, q.card_id, 0, v_take)
    on conflict (auth_user_id, card_id) do update set adv_qty = public.dlfr_card_inventory.adv_qty + v_take;
   if v_take = q.qty then delete from public.dlfr_card_adv_queue where auth_user_id = v_auth and card_id = q.card_id;
   else update public.dlfr_card_adv_queue set qty = qty - v_take where auth_user_id = v_auth and card_id = q.card_id; end if;
   v_left := v_left - v_take; v_delivered := v_delivered + v_take;
  end loop;
 end if;
 select greatest(0, 2000 - coalesce(sum(qty), 0))::int into v_qroom from public.dlfr_card_adv_queue where auth_user_id = v_auth;

 -- 2) Nouvelles cartes : dans la limite du jour, le reste part en file d'attente (2 000 max).
 for e in select key, value from jsonb_each(p_delta) order by key loop
  if e.key !~ '^[0-9]{1,15}$' or jsonb_typeof(e.value) <> 'number' then continue; end if;
  v_id := e.key::bigint; v_d := greatest(-1000, least(1000, (e.value)::text::int));
  if v_d = 0 or not exists(select 1 from public.dlfr_cards where id = v_id) then continue; end if;
  if v_d > 0 then
   if exists(select 1 from public.dlfr_cards where id = v_id and rarity = 'Festive') then v_dropped := v_dropped + v_d; continue; end if;
   v_take := least(v_d, v_left);
   if v_take > 0 then
    insert into public.dlfr_card_inventory(auth_user_id, card_id, qty, adv_qty) values (v_auth, v_id, 0, v_take)
     on conflict (auth_user_id, card_id) do update set adv_qty = public.dlfr_card_inventory.adv_qty + v_take;
    v_left := v_left - v_take; v_added := v_added + v_take;
   end if;
   v_d := v_d - v_take;
   if v_d > 0 and not p_import then
    v_take := least(v_d, v_qroom);
    if v_take > 0 then
     insert into public.dlfr_card_adv_queue(auth_user_id, card_id, qty) values (v_auth, v_id, v_take)
      on conflict (auth_user_id, card_id) do update set qty = public.dlfr_card_adv_queue.qty + v_take;
     v_qroom := v_qroom - v_take; v_queued := v_queued + v_take;
    end if;
    v_d := v_d - v_take;
   end if;
   v_dropped := v_dropped + greatest(0, v_d);
  else
   select * into v_cur from public.dlfr_card_inventory where auth_user_id = v_auth and card_id = v_id for update;
   if found then
    v_take := least(-v_d, v_cur.adv_qty);
    update public.dlfr_card_inventory set adv_qty = adv_qty - v_take, qty = greatest(0, qty - (-v_d - v_take)) where auth_user_id = v_auth and card_id = v_id;
   end if;
  end if;
 end loop;
 update public.dlfr_card_state set adv_day = v_today,
   adv_added = case when p_import then s.adv_added else s.adv_added + v_added + v_delivered end,
   adv_imported = adv_imported or p_import
  where auth_user_id = v_auth;
 return jsonb_build_object('inventory', public.dlfr_cards_inventory_of(v_auth), 'added', v_added, 'dropped', v_dropped,
  'queued', v_queued, 'delivered', v_delivered,
  'queue_total', (select coalesce(sum(qty), 0) from public.dlfr_card_adv_queue where auth_user_id = v_auth),
  'imported', p_import, 'left_today', case when p_import then greatest(0, 120 - s.adv_added) else v_left end,
  'bonuses', public.dlfr_cards_check_collections(v_auth), 'balance', public.dlfr_wallet_balance(v_auth));
end $$;
revoke all on function public.dlfr_adventure_sync(jsonb, boolean) from public, anon;
grant execute on function public.dlfr_adventure_sync(jsonb, boolean) to authenticated;

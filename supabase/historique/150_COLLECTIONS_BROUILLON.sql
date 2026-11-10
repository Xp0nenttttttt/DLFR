-- DLFR V150 — Collections en préparation (brouillon) : invisibles et introuvables pour les joueurs
-- tant qu'un propriétaire / supermodo ne les a pas publiées.
alter table public.dlfr_card_collections add column if not exists is_published boolean not null default false;
update public.dlfr_card_collections set is_published = true;  -- les collections existantes restent visibles

drop policy if exists dlfr_card_collections_public_read on public.dlfr_card_collections;
create policy dlfr_card_collections_public_read on public.dlfr_card_collections for select using (is_published);
drop policy if exists dlfr_cards_public_read on public.dlfr_cards;
create policy dlfr_cards_public_read on public.dlfr_cards for select using (
 exists(select 1 from public.dlfr_card_collections c where c.id = collection_id and c.is_published));

create or replace function public.dlfr_cards_admin_publish_collection(p_id bigint, p_published boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if not coalesce(public.dlfr_cards_lab_access(), false) then raise exception 'Accès refusé' using errcode = '42501'; end if;
 update public.dlfr_card_collections set is_published = coalesce(p_published, false), updated_at = now() where id = p_id;
 if not found then raise exception 'Collection introuvable'; end if;
 return true;
end $$;
revoke all on function public.dlfr_cards_admin_publish_collection(bigint, boolean) from public, anon;
grant execute on function public.dlfr_cards_admin_publish_collection(bigint, boolean) to authenticated;

-- Bonus de collection complète : seulement pour les collections publiées.
create or replace function public.dlfr_cards_check_collections(p_auth uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare c record; v_bonus jsonb := '[]'::jsonb;
begin
 for c in select col.id, col.name, count(k.id)::int n from public.dlfr_card_collections col join public.dlfr_cards k on k.collection_id = col.id
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

-- Le mode Aventure ne peut pas ajouter de cartes d'une collection en brouillon.
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
 v_left := 1000000;

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
   if exists(select 1 from public.dlfr_cards k join public.dlfr_card_collections col on col.id = k.collection_id where k.id = v_id and (k.rarity = 'Festive' or not col.is_published)) then v_dropped := v_dropped + v_d; continue; end if;
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
  'imported', p_import, 'left_today', null,
  'bonuses', public.dlfr_cards_check_collections(v_auth), 'balance', public.dlfr_wallet_balance(v_auth));
end $$;
revoke all on function public.dlfr_adventure_sync(jsonb, boolean) from public, anon;
grant execute on function public.dlfr_adventure_sync(jsonb, boolean) to authenticated;

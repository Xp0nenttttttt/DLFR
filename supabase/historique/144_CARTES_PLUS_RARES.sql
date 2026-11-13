-- DLFR V144 — Booster du jour retiré + raretés plus rares dans les boosters achetés.
-- Nouvelles chances par carte : Commun 68,2 % · Rare 24 % · Épique 6 % · Légendaire 1,5 % · Mythique 0,3 %.
-- Garantie Légendaire ou mieux : au plus tard toutes les 80 cartes (au lieu de 40).
create or replace function public.dlfr_cards_open(p_source text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
 v_auth uuid := (select auth.uid()); s public.dlfr_card_state;
 v_open bigint; v_r float8; v_rar text; v_card public.dlfr_cards; v_ids bigint[] := '{}'; v_out jsonb := '[]'::jsonb; v_new boolean;
 v_order text[] := array['Commun','Rare','Épique','Légendaire','Mythique']; v_idx int; v_bonus jsonb := '[]'::jsonb; i int;
 v_n int := 5;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 if p_source = 'daily' then raise exception 'Le booster du jour a été retiré : les boosters s’achètent avec des Wayllings dorés.'; end if;
 if p_source <> 'shop' then raise exception 'Source invalide'; end if;
 if not exists(select 1 from public.dlfr_cards where in_packs) then raise exception 'Aucune carte disponible dans les boosters.'; end if;
 insert into public.dlfr_card_state(auth_user_id) values (v_auth) on conflict do nothing;
 select * into s from public.dlfr_card_state where auth_user_id = v_auth for update;
 perform 1 from auth.users where id = v_auth for update;
 if public.dlfr_wallet_balance(v_auth) < 150 then raise exception 'Wayllings dorés insuffisants (150 nécessaires).'; end if;
 insert into public.dlfr_card_openings(auth_user_id, source, cards) values (v_auth, p_source, '{}') returning id into v_open;
 insert into public.dlfr_wallet_ledger(auth_user_id, amount, reason, ref, note) values (v_auth, -150, 'booster', v_open::text, 'Booster DLFR Cards');
 for i in 1..v_n loop
  v_r := random() * 100;
  v_rar := case when v_r < 0.3 then 'Mythique' when v_r < 1.8 then 'Légendaire' when v_r < 7.8 then 'Épique' when v_r < 31.8 then 'Rare' else 'Commun' end;
  if i = v_n and v_rar = 'Commun' then v_rar := 'Rare'; end if;
  if s.pity + i >= 80 and array_position(v_order, v_rar) < 4 then v_rar := 'Légendaire'; end if;
  v_idx := array_position(v_order, v_rar);
  loop
   select * into v_card from public.dlfr_cards where in_packs and rarity = v_order[v_idx] order by random() limit 1;
   exit when found or v_idx = 1; v_idx := v_idx - 1;
  end loop;
  if v_card.id is null then select * into v_card from public.dlfr_cards where in_packs and rarity <> 'Festive' order by random() limit 1; end if;
  if v_card.rarity in ('Légendaire','Mythique') then s.pity := -i; end if;
  select not exists(select 1 from public.dlfr_card_inventory where auth_user_id = v_auth and card_id = v_card.id and qty + adv_qty > 0) into v_new;
  insert into public.dlfr_card_inventory(auth_user_id, card_id, qty) values (v_auth, v_card.id, 1)
   on conflict (auth_user_id, card_id) do update set qty = public.dlfr_card_inventory.qty + 1;
  v_ids := v_ids || v_card.id;
  v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_card.id, 'rarity', v_card.rarity, 'is_new', v_new, 'value', public.dlfr_card_value(v_card.rarity)));
 end loop;
 update public.dlfr_card_state set pity = greatest(0, s.pity + v_n), opened = opened + 1 where auth_user_id = v_auth;
 update public.dlfr_card_openings set cards = v_ids where id = v_open;
 v_bonus := public.dlfr_cards_check_collections(v_auth);
 return jsonb_build_object('cards', v_out, 'bonuses', v_bonus, 'balance', public.dlfr_wallet_balance(v_auth), 'streak', 0, 'big', false);
end $function$;
revoke all on function public.dlfr_cards_open(text) from public, anon;
grant execute on function public.dlfr_cards_open(text) to authenticated;

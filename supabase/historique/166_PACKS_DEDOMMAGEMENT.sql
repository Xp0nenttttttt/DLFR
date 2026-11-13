-- V166 — Packs offerts (DÉJÀ APPLIQUÉ, migration dlfr_166_packs_dedommagement).
-- Un « cadeau » = N packs tirés par le serveur, une seule fois par compte, pendant une période.
-- Pour en refaire un plus tard (ex. Noël) :
--   insert into public.dlfr_cards_gifts(title, message, packs, per_pack, weights, expires_at)
--   values ('Packs de Noël', 'Joyeux Noël !', 5, 5, array[60,30,8.4,1.4,0.2,0.0133]::numeric[], now() + interval '7 days');
-- weights = Commun, Rare, Épique, Légendaire, Mythique, Ultra. La dernière carte de chaque pack est Rare ou mieux.

create table if not exists public.dlfr_cards_gifts(
 id bigint generated always as identity primary key,
 title text not null, message text not null default '',
 packs integer not null default 10 check (packs between 1 and 50),
 per_pack integer not null default 5 check (per_pack between 1 and 10),
 weights numeric[] not null,
 starts_at timestamptz not null default now(), expires_at timestamptz not null,
 created_at timestamptz not null default now());
create table if not exists public.dlfr_cards_gift_claims(
 gift_id bigint not null references public.dlfr_cards_gifts(id) on delete cascade,
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 claimed_at timestamptz not null default now(), result jsonb not null default '[]'::jsonb,
 primary key (gift_id, auth_user_id));
alter table public.dlfr_cards_gifts enable row level security;
alter table public.dlfr_cards_gift_claims enable row level security;
revoke all on public.dlfr_cards_gifts, public.dlfr_cards_gift_claims from anon, authenticated;

create or replace function public.dlfr_cards_gifts_open()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title, 'message', g.message, 'packs', g.packs, 'per_pack', g.per_pack, 'expires', g.expires_at) order by g.id), '[]'::jsonb)
 from public.dlfr_cards_gifts g
 where (select auth.uid()) is not null and now() between g.starts_at and g.expires_at
   and not exists(select 1 from public.dlfr_cards_gift_claims c where c.gift_id = g.id and c.auth_user_id = (select auth.uid())) $$;
revoke all on function public.dlfr_cards_gifts_open() from public, anon;
grant execute on function public.dlfr_cards_gifts_open() to authenticated;

create or replace function public.dlfr_cards_gift_claim(p_gift bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth uuid := (select auth.uid()); g public.dlfr_cards_gifts; v_rar text[] := array['Commun','Rare','Épique','Légendaire','Mythique','Ultra'];
 v_packs jsonb := '[]'::jsonb; v_pack jsonb; p int; i int; v_tier int; v_r numeric; v_sum numeric; v_acc numeric; t int; v_id bigint; v_name text; v_rarity text;
begin
 if v_auth is null then raise exception 'Connexion requise'; end if;
 perform public.dlfr_cards_assert_ok(v_auth);
 select * into g from public.dlfr_cards_gifts where id = p_gift and now() between starts_at and expires_at;
 if g.id is null then raise exception 'Ce cadeau n’est plus disponible.'; end if;
 insert into public.dlfr_cards_gift_claims(gift_id, auth_user_id) values (g.id, v_auth) on conflict do nothing;
 if not found then raise exception 'Cadeau déjà récupéré.'; end if;
 for p in 1..g.packs loop
  v_pack := '[]'::jsonb;
  for i in 1..g.per_pack loop
   v_sum := 0; for t in 1..6 loop v_sum := v_sum + case when i = g.per_pack and t = 1 then 0 else g.weights[t] end; end loop;
   v_r := random() * v_sum; v_acc := 0; v_tier := 1;
   for t in 1..6 loop
    v_acc := v_acc + case when i = g.per_pack and t = 1 then 0 else g.weights[t] end;
    if v_r < v_acc then v_tier := t; exit; end if;
   end loop;
   v_id := null;
   while v_id is null and v_tier >= 1 loop
    select k.id, k.name, k.rarity into v_id, v_name, v_rarity from public.dlfr_cards k join public.dlfr_card_collections col on col.id = k.collection_id
     where col.is_published and k.in_packs and k.rarity = v_rar[v_tier] order by random() limit 1;
    if v_id is null then v_tier := v_tier - 1; end if;
   end loop;
   if v_id is not null then
    insert into public.dlfr_card_inventory(auth_user_id, card_id, qty) values (v_auth, v_id, 1)
     on conflict (auth_user_id, card_id) do update set qty = public.dlfr_card_inventory.qty + 1;
    v_pack := v_pack || jsonb_build_array(jsonb_build_object('id', v_id, 'name', v_name, 'rarity', v_rarity));
   end if;
  end loop;
  v_packs := v_packs || jsonb_build_array(v_pack);
 end loop;
 update public.dlfr_cards_gift_claims set result = v_packs where gift_id = g.id and auth_user_id = v_auth;
 return jsonb_build_object('packs', v_packs, 'inventory', public.dlfr_cards_inventory_of(v_auth));
end $$;
revoke all on function public.dlfr_cards_gift_claim(bigint) from public, anon;
grant execute on function public.dlfr_cards_gift_claim(bigint) to authenticated;

-- Cadeau créé le 05/11 (14 jours) :
-- insert into public.dlfr_cards_gifts(title, message, packs, per_pack, weights, expires_at)
-- values ('Packs de dédommagement', 'Désolé pour les soucis de sauvegarde et de cartes de ces derniers jours. Voici 10 packs avec un peu plus de chance.',
--  10, 5, array[60, 30, 8.4, 1.4, 0.2, 0.0133]::numeric[], now() + interval '14 days');

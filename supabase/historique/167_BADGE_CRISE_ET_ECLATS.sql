-- V167 (DÉJÀ APPLIQUÉ, migration dlfr_167_badge_crise_tcg + opérations directes du 05/11)
-- * Badge d'événement « A traversé la grande crise du TCG » (id crise-tcg, catégorie Événements).
--   Donné à tous les joueurs ayant une partie Aventure ou des cartes (64), et automatiquement à
--   ceux qui ouvrent les packs de dédommagement (colonne dlfr_cards_gifts.badge_id).
-- * Éclats de toutes les parties Aventure mis à 10 000 (copie avant : dlfr_backup_167_shards).

alter table public.dlfr_cards_gifts add column if not exists badge_id text;
update public.dlfr_cards_gifts set badge_id = 'crise-tcg' where title = 'Packs de dédommagement' and badge_id is null;

create or replace function public.dlfr_cards_gift_badge(p_auth uuid, p_badge text)
returns void language sql security definer set search_path = '' as $$
 insert into public.badge_awards(player_key, badge_id, obtained_at, origin)
 select o.player_key, p_badge, current_date, 'moderator' from public.player_profile_owners o
 where o.auth_user_id = p_auth and p_badge is not null and exists(select 1 from public.players p where p.player_key = o.player_key)
 on conflict (player_key, badge_id) do nothing $$;
revoke all on function public.dlfr_cards_gift_badge(uuid, text) from public, anon, authenticated;

-- dlfr_cards_gift_claim : identique à 166, avec en fin de fonction
--   perform public.dlfr_cards_gift_badge(v_auth, g.badge_id);
--   return jsonb_build_object('packs', v_packs, 'inventory', public.dlfr_cards_inventory_of(v_auth), 'badge', g.badge_id);

-- Opérations ponctuelles (déjà faites, ne pas rejouer) :
-- insert into public.badge_awards(player_key, badge_id, obtained_at, origin)
-- select distinct o.player_key, 'crise-tcg', current_date, 'moderator' from public.player_profile_owners o
-- where exists(select 1 from public.players p where p.player_key = o.player_key)
--   and (exists(select 1 from public.dlfr_cards_adventure a where a.auth_user_id = o.auth_user_id)
--     or exists(select 1 from public.dlfr_card_inventory i where i.auth_user_id = o.auth_user_id and i.qty + i.adv_qty > 0))
-- on conflict (player_key, badge_id) do nothing;
-- update public.dlfr_cards_adventure set save = jsonb_set(save, '{progress,shards}', '10000'::jsonb, true), version = version + 1, updated_at = now();

-- DLFR V146 — Retrait des boosters achetés et du recyclage des doublons (page Cartes).
-- Les cartes s'obtiennent désormais par le mode Aventure et le calendrier de l'Avent.
create or replace function public.dlfr_cards_open(p_source text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 raise exception 'Les boosters DLFR Cards ont été retirés : les cartes s’obtiennent en mode Aventure.';
end $$;
revoke all on function public.dlfr_cards_open(text) from public, anon;
grant execute on function public.dlfr_cards_open(text) to authenticated;

create or replace function public.dlfr_cards_recycle(p_card_id bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 raise exception 'Le recyclage des doublons a été retiré.';
end $$;
revoke all on function public.dlfr_cards_recycle(bigint) from public, anon;
grant execute on function public.dlfr_cards_recycle(bigint) to authenticated;

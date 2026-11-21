-- V192 (appliqué) : réduction du trafic sortant (egress).
-- 1) dlfr_adventure_sync(p_delta, p_import, p_partial) : avec p_partial=true, la réponse ne contient que
--    les quantités des cartes envoyées (≈ 200 octets au lieu de ≈ 5 Ko). L'ancienne version à 2 paramètres
--    reste en place pour les onglets encore ouverts avec l'ancien site.
create or replace function public.dlfr_adventure_sync(p_delta jsonb, p_import boolean, p_partial boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb;
begin
 r := public.dlfr_adventure_sync(p_delta, p_import);
 if p_partial and not p_import and coalesce((r->>'delivered')::int, 0) = 0 and jsonb_typeof(p_delta) = 'object' then
  r := jsonb_set(r, '{inventory}', coalesce((select jsonb_object_agg(i.key, i.value) from jsonb_each(r->'inventory') i where p_delta ? i.key), '{}'::jsonb))
       || jsonb_build_object('partial', true);
 end if;
 return r;
end $$;
-- 2) Empreintes des tables du catalogue des cartes (dlfr_table_stamps, incrémentées par déclencheur)
--    ajoutées à dlfr_data_stamps : le site garde le catalogue en copie locale tant qu'il ne change pas.
create table if not exists public.dlfr_table_stamps(t text primary key, v bigint not null default 0);
alter table public.dlfr_table_stamps enable row level security;
-- triggers dlfr_stamp (after insert/update/delete/truncate, for each statement) sur dlfr_cards et dlfr_card_collections
-- dlfr_data_stamps() = empreintes du journal || jsonb_object_agg(dlfr_table_stamps)

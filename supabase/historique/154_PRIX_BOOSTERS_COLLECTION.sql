-- DLFR V154 — Prix par défaut des boosters de collection : 120 éclats (au lieu de 80).
alter table public.dlfr_card_collections alter column booster_cost set default 120;
update public.dlfr_card_collections set booster_cost = 120 where booster_cost = 80;

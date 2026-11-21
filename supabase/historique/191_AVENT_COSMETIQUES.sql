-- V191 (appliqué) : cosmétiques de la boutique dans le calendrier de l'Avent.
alter table public.dlfr_advent_days add column if not exists item_key text references public.dlfr_reward_catalog(item_key);
alter table public.dlfr_advent_claims add column if not exists item_key text;
-- dlfr_advent_set_day2(year, day, card_id, coins, title, item_key) : comme dlfr_advent_set_day + cosmétique.
-- dlfr_advent_open : enregistre item_key dans la case ouverte et ajoute le cosmétique aux objets du joueur
--   (dlfr_reward_purchases, prix 0, ignoré s'il le possède déjà) ; renvoie item_key.
-- dlfr_advent_status : renvoie has_item et item_key (case ouverte ou équipe).

-- V170 — Limites de cartes retirées (DÉJÀ APPLIQUÉ, migration dlfr_170_sans_limites).
-- dlfr_adventure_sync : plus de quota par envoi, par jour ni par rareté ; Ultra et Secrètes sans restriction.
-- (Seule limite technique restante : 1 000 exemplaires d'une même carte par envoi.)
do $$
declare def text := pg_get_functiondef('public.dlfr_adventure_sync(jsonb,boolean)'::regprocedure);
begin
 def := replace(def, 'v_caps int[] := array[1500, 1500, 400, 60, 8, 1, 1];', 'v_caps int[] := array[2000000000, 2000000000, 2000000000, 2000000000, 2000000000, 2000000000, 2000000000];');
 def := replace(def, 'v_call int := 600;', 'v_call int := 2000000000;');
 def := replace(def, 'if v_t >= 6 and (select coalesce(sum(packs), 0) from public.dlfr_cards_activity where auth_user_id = v_auth and hour > now() - interval ''2 hours'') < 20 then v_room := 0; end if;', '');
 def := regexp_replace(def, 'elsif v_t = 6 then v_room := least\(v_room, case when exists\(select 1 from public\.dlfr_card_rare_log[^\n]*\n\s*elsif v_t = 7 then v_room := least\(v_room, case when exists\(select 1 from public\.dlfr_card_rare_log[^\n]*\n', '');
 execute def;
end $$;

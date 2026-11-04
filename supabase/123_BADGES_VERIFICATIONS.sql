-- DLFR V123 — nouveaux badges automatiques (progression + vérifications).
-- Remplace dlfr_award_progress (mêmes badges qu'avant + nouveaux) et ajoute un déclencheur
-- sur les niveaux pour attribuer les badges de vérification quand un vérificateur est crédité.
-- Les badges restent permanents (on n'en retire jamais).

create or replace function public.dlfr_award_progress(p_player_key text, p_historical boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
 c_list integer; c_main integer; c_nlw integer; c_unrated integer; c_total integer; c_main_total integer;
 best_beaten integer; c_verif integer := 0; best_verif integer;
 v_player public.players%rowtype;
begin
 select count(distinct d.id) filter (where not d.unrated and d.position between 1 and 150),
        count(distinct d.id) filter (where not d.unrated and d.position between 1 and 75),
        count(distinct d.id) filter (where not d.unrated and d.position > 150),
        count(distinct d.id) filter (where d.unrated),
        min(d.position) filter (where not d.unrated and d.position between 1 and 150)
   into c_list, c_main, c_nlw, c_unrated, best_beaten
   from public.completions r join public.demons d on d.id = r.demon_id
  where lower(r.player) = lower(p_player_key) and r.progress = 100;
 select count(*), count(*) filter (where position <= 75) into c_total, c_main_total
   from public.demons where not unrated and position between 1 and 150;

 -- Vérifications : niveau publié, non UNRATED, crédité via la fiche joueur (verifier_user_id)
 -- ou, à défaut de fiche liée, via le nom exact du joueur. Le profil « Anonyme » n'en reçoit pas.
 select * into v_player from public.players where player_key = p_player_key;
 if found and p_player_key <> 'anonyme' then
  select count(distinct d.id), min(d.position) filter (where d.position between 1 and 150)
    into c_verif, best_verif
    from public.demons d
   where d.is_public is not false and not d.unrated and d.position between 1 and 99999999
     and ((d.verifier_user_id is not null and d.verifier_user_id = v_player.legacy_id)
       or (d.verifier_user_id is null and trim(coalesce(d.verifier,'')) <> '' and lower(trim(d.verifier)) in
           (lower(v_player.player_key), lower(nullif(v_player.username,'')), lower(nullif(v_player.display_name,'')))));
 end if;

 insert into public.badge_awards(player_key, badge_id, obtained_at, origin)
 select p_player_key, s.badge,
        case when p_historical then null else current_date end,
        case when p_historical then 'historical' else 'automatic' end
   from (values
    ('bienvenue-club', c_list >= 1), ('dix', c_list >= 10), ('vingt-cinq', c_list >= 25), ('faucheur-liste', c_list >= 35),
    ('cinquante', c_list >= 50), ('grand-faucheur-liste', c_list >= 75),
    ('cour-grands', c_main >= 1), ('elite-top10', best_beaten <= 10), ('sommet', best_beaten = 1),
    ('demi-dieu', c_main_total = 75 and c_main >= 75), ('god', c_total = 150 and c_list >= 150),
    ('bienvenue-nlw', c_nlw >= 1), ('dix-nlw', c_nlw >= 10), ('nlw-50', c_nlw >= 50), ('cent', c_nlw >= 100),
    ('faucheur-nlw', c_nlw >= 250), ('grand-faucheur-nlw', c_nlw >= 500), ('nlwgod', c_nlw >= 1000),
    ('unrated-premier', c_unrated >= 1), ('unrated-master', c_unrated >= 10),
    ('verif-1', c_verif >= 1), ('verif-5', c_verif >= 5), ('verif-10', c_verif >= 10), ('verif-20', c_verif >= 20),
    ('verif-top150', best_verif <= 150), ('verif-top75', best_verif <= 75), ('verif-top10', best_verif <= 10), ('verif-top1', best_verif = 1)
   ) as s(badge, earned)
  where coalesce(s.earned, false)
 on conflict (player_key, badge_id) do nothing;
end $$;

-- Quand un niveau est crédité à un vérificateur (ou change de position), on recalcule ses badges.
create or replace function public.dlfr_verifier_badges_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
 select p.player_key into v_key from public.players p
  where (new.verifier_user_id is not null and p.legacy_id = new.verifier_user_id)
     or (new.verifier_user_id is null and lower(p.player_key) = lower(trim(coalesce(new.verifier,''))))
  limit 1;
 if v_key is not null then perform public.dlfr_award_progress(v_key, false); end if;
 return new;
end $$;
revoke all on function public.dlfr_verifier_badges_trigger() from public, anon, authenticated;

drop trigger if exists dlfr_verifier_badges on public.demons;
create trigger dlfr_verifier_badges
 after insert or update of verifier, verifier_user_id, position, unrated, is_public on public.demons
 for each row execute function public.dlfr_verifier_badges_trigger();

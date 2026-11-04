-- DLFR V132 — un niveau vérifié compte comme un niveau battu pour les badges de progression,
-- et le déclencheur reconnaît le vérificateur par sa fiche, son pseudo ou son nom affiché.
create or replace function public.dlfr_award_progress(p_player_key text, p_historical boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
 c_list integer; c_main integer; c_nlw integer; c_unrated integer; c_total integer; c_main_total integer;
 best_beaten integer; c_verif integer := 0; best_verif integer;
 v_player public.players%rowtype; v_found boolean;
begin
 select * into v_player from public.players where player_key = p_player_key;
 v_found := found and p_player_key <> 'anonyme';

 with verified as (
   select d.id from public.demons d
    where v_found and d.is_public is not false
      and ((d.verifier_user_id is not null and d.verifier_user_id = v_player.legacy_id)
        or (d.verifier_user_id is null and trim(coalesce(d.verifier,'')) <> '' and lower(trim(d.verifier)) in
            (lower(v_player.player_key), lower(nullif(v_player.username,'')), lower(nullif(v_player.display_name,''))))) ),
 beaten as (
   select r.demon_id as id from public.completions r where lower(r.player) = lower(p_player_key) and r.progress = 100
   union select id from verified)
 select count(distinct d.id) filter (where not d.unrated and d.position between 1 and 150),
        count(distinct d.id) filter (where not d.unrated and d.position between 1 and 75),
        count(distinct d.id) filter (where not d.unrated and d.position > 150 and d.position < 100000000),
        count(distinct d.id) filter (where d.unrated),
        min(d.position) filter (where not d.unrated and d.position between 1 and 150)
   into c_list, c_main, c_nlw, c_unrated, best_beaten
   from beaten b join public.demons d on d.id = b.id;

 select count(*), count(*) filter (where position <= 75) into c_total, c_main_total
   from public.demons where not unrated and position between 1 and 150;

 if v_found then
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

create or replace function public.dlfr_verifier_badges_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
 for v_key in select p.player_key from public.players p
  where (new.verifier_user_id is not null and p.legacy_id = new.verifier_user_id)
     or (new.verifier_user_id is null and trim(coalesce(new.verifier,'')) <> '' and lower(trim(new.verifier)) in
         (lower(p.player_key), lower(nullif(p.username,'')), lower(nullif(p.display_name,''))))
 loop
  perform public.dlfr_award_progress(v_key, false);
 end loop;
 return new;
exception when others then
 raise warning 'DLFR badges vérificateur : %', sqlerrm; return new;
end $$;
revoke all on function public.dlfr_verifier_badges_trigger() from public, anon, authenticated;

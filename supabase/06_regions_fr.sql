-- Optionnel, pour la future activation des régions françaises sur Supabase.
-- Ne pas exécuter tant que les tables et les droits du site ne sont pas migrés.
alter table public.player_profiles
 add column if not exists region_code text;
alter table public.player_profiles
 drop constraint if exists player_profiles_region_fr_check;
alter table public.player_profiles
 add constraint player_profiles_region_fr_check
 check (region_code is null or region_code in ('ARA','BFC','BRE','CVL','COR','GES','HDF','IDF','NOR','NAQ','OCC','PDL','PAC','GP','MQ','GF','RE','YT'));
-- Lorsqu'elle sera installée, définir enableRegionProfiles: true dans js/config.js.
-- Autorisations RLS : la modification player_profiles est déjà réservée aux modérateurs du site.

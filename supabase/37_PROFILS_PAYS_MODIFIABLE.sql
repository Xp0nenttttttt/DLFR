-- DLFR 2.4 : changement de pays par le titulaire du profil uniquement.
-- Prérequis : 11_production.sql et 13_self_signup_discord.sql.
-- N'affecte ni les points ni les records ; pas de nouveau droit UPDATE sur players.
BEGIN;
CREATE OR REPLACE FUNCTION public.dlfr_change_own_country(
 p_country_code text,
 p_region_code text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_user uuid := (SELECT auth.uid());
 v_player text;
 v_country text := upper(btrim(coalesce(p_country_code,'')));
 v_region text := nullif(upper(btrim(coalesce(p_region_code,''))), '');
 v_old_country text;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Connexion obligatoire.'; END IF;
 SELECT o.player_key INTO v_player
 FROM public.player_profile_owners AS o
 WHERE o.auth_user_id=v_user LIMIT 1;
 IF v_player IS NULL THEN RAISE EXCEPTION 'Aucune fiche DLFR liée à ce compte.'; END IF;
 IF NOT (v_country = ANY(ARRAY['AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'XK', 'YE', 'YT', 'ZA', 'ZM', 'ZW']::text[])) THEN
   RAISE EXCEPTION 'Pays invalide.';
 END IF;
 IF v_country <> 'FR' AND v_region IS NOT NULL THEN
   RAISE EXCEPTION 'La région doit être vide hors de France.';
 END IF;
 IF v_region IS NOT NULL AND NOT (v_region = ANY(ARRAY[
   'ARA','BFC','BRE','CVL','COR','GES','HDF','IDF','NOR','NAQ','OCC','PDL','PAC',
   'GP','MQ','GF','RE','YT'
 ]::text[])) THEN
   RAISE EXCEPTION 'Région française invalide.';
 END IF;
 SELECT country_code INTO v_old_country
 FROM public.players WHERE player_key=v_player FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fiche joueur introuvable.'; END IF;
 UPDATE public.players SET country_code=v_country WHERE player_key=v_player;
 -- Pas de déplacement automatique d'une région vers un autre pays.
 -- Le choix de la région se fait dans le même formulaire et reste facultatif.
 INSERT INTO public.player_profiles (player_key,region_code)
 VALUES (v_player,CASE WHEN v_country='FR' THEN v_region ELSE NULL END)
 ON CONFLICT (player_key) DO UPDATE SET
  region_code=EXCLUDED.region_code;
 INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
 VALUES(v_user,'PLAYER_COUNTRY_CHANGE',v_player,
        'Pays : '||coalesce(v_old_country,'non renseigné')||' -> '||v_country);
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_change_own_country(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dlfr_change_own_country(text,text) TO authenticated;
COMMIT;

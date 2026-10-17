-- DLFR 2.8 — Comptes authentifiés par pseudo, sans mot de passe stocké dans les tables DLFR.
-- À exécuter après la migration 13_SELF_SIGNUP_DISCORD.sql.
-- Les mots de passe sont gérés par Supabase Auth (GoTrue) ; pas de RPC anonyme de création de compte.
BEGIN;

CREATE TABLE IF NOT EXISTS public.dlfr_username_accounts (
  username_key text PRIMARY KEY CHECK (username_key ~ '^[a-z0-9_-]{3,24}$'),
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dlfr_username_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dlfr_username_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.dlfr_username_accounts TO service_role;

-- Quotas côté serveur, avec verrou transactionnel (évite les essais simultanés).
CREATE TABLE IF NOT EXISTS public.dlfr_auth_rate_limits (
  rate_key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0
);
ALTER TABLE public.dlfr_auth_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dlfr_auth_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.dlfr_auth_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.dlfr_username_auth_rate_limit(
  p_rate_key text, p_limit integer, p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_row public.dlfr_auth_rate_limits%ROWTYPE;
BEGIN
  IF length(p_rate_key)>128 OR length(p_rate_key)<10 OR p_limit NOT BETWEEN 1 AND 100 OR p_window_seconds NOT BETWEEN 60 AND 86400 THEN
    RETURN false;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dlfr_auth:'||p_rate_key));
  SELECT * INTO v_row FROM public.dlfr_auth_rate_limits WHERE rate_key=p_rate_key FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.dlfr_auth_rate_limits(rate_key,window_start,attempt_count)
    VALUES(p_rate_key,now(),1);
    RETURN true;
  END IF;
  IF v_row.window_start < now()-(p_window_seconds||' seconds')::interval THEN
    UPDATE public.dlfr_auth_rate_limits SET window_start=now(),attempt_count=1 WHERE rate_key=p_rate_key;
    RETURN true;
  END IF;
  IF v_row.attempt_count>=p_limit THEN RETURN false; END IF;
  UPDATE public.dlfr_auth_rate_limits SET attempt_count=attempt_count+1 WHERE rate_key=p_rate_key;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.dlfr_username_auth_rate_limit(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dlfr_username_auth_rate_limit(text,integer,integer) TO service_role;

-- Création d'une fiche GD après inscription au compte pseudo+mot de passe.
-- Authentification exigeante : un simple user_metadata n'accorde aucun droit.
-- On ne modifie PAS la fonction Discord existante.
CREATE OR REPLACE FUNCTION public.dlfr_create_own_player_username(
  p_username text,
  p_country_code text DEFAULT null,
  p_region_code text DEFAULT null
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_username text := btrim(coalesce(p_username,''));
  v_key text;
  v_country text := nullif(upper(btrim(coalesce(p_country_code,''))), '');
  v_region text := nullif(upper(btrim(coalesce(p_region_code,''))), '');
BEGIN
  IF v_user IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.dlfr_username_accounts a WHERE a.auth_user_id=v_user
  ) THEN
    RAISE EXCEPTION 'Compte DLFR avec pseudo requis.' USING errcode='P0001';
  END IF;
  IF v_username !~ '^[A-Za-z0-9_-]{2,32}$' THEN
    RAISE EXCEPTION 'Pseudo GD invalide (2 à 32 caractères).' USING errcode='P0001';
  END IF;
  v_key:=lower(v_username);
  IF v_key IN ('admin','administrator','moderator','moderateur','staff','owner','demonlist','dlfr','aredl') THEN
    RAISE EXCEPTION 'Pseudo GD réservé.' USING errcode='P0001';
  END IF;
  IF v_country IS NULL OR v_country !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Choisis un pays.' USING errcode='P0001';
  END IF;
  IF v_country <> 'FR' AND v_region IS NOT NULL THEN
    RAISE EXCEPTION 'La région est réservée à la France.' USING errcode='P0001';
  END IF;
  IF v_region IS NOT NULL AND v_region <> ALL(ARRAY[
     'ARA','BFC','BRE','CVL','COR','GES','HDF','IDF','NOR','NAQ','OCC','PDL','PAC',
     'GP','MQ','GF','RE','YT'
  ]) THEN
    RAISE EXCEPTION 'Région inconnue.' USING errcode='P0001';
  END IF;
  IF EXISTS(SELECT 1 FROM public.player_profile_owners WHERE auth_user_id=v_user) THEN
    RAISE EXCEPTION 'Compte déjà lié à une fiche joueur.' USING errcode='P0001';
  END IF;
  IF EXISTS(SELECT 1 FROM public.profile_claim_requests WHERE auth_user_id=v_user AND status='pending') THEN
    RAISE EXCEPTION 'Une revendication est déjà en attente.' USING errcode='P0001';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dlfr-own-player:'||v_key));
  IF EXISTS(
    SELECT 1 FROM public.players p
    WHERE p.player_key=v_key OR lower(btrim(p.username))=v_key OR lower(btrim(coalesce(p.display_name,'')))=v_key
  ) THEN
    RAISE EXCEPTION 'Fiche déjà existante : demande sa liaison en modération.' USING errcode='P0001';
  END IF;
  INSERT INTO public.players(player_key,username,display_name,country_code,has_account)
  VALUES(v_key,v_username,v_username,v_country,true);
  INSERT INTO public.player_profile_owners(player_key,auth_user_id) VALUES(v_key,v_user);
  INSERT INTO public.player_profiles(player_key,region_code) VALUES(v_key,v_region);
  INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
  VALUES(v_user,'PLAYER_SELF_CREATE',v_key,'Création depuis un compte DLFR pseudo/mot de passe');
  RETURN v_key;
END $$;
REVOKE ALL ON FUNCTION public.dlfr_create_own_player_username(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_create_own_player_username(text,text,text) TO authenticated;
COMMIT;

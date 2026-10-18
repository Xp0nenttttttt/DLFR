-- DLFR V57 : IMPORT des identifiants historiques (AUCUN hash dans ce fichier).
-- Prérequis : 42_USERNAME_PASSWORD_ACCOUNTS.sql et 33_FUSION_JOUEURS.sql.
-- Importer les hashs uniquement via import_legacy_users.py en local avec la clé service_role.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dlfr_legacy_credentials (
  username_key text PRIMARY KEY CHECK (username_key ~ '^[a-z0-9_-]{3,24}$'),
  legacy_user_id integer NOT NULL UNIQUE,
  password_hash text CHECK (password_hash IS NULL OR password_hash ~ '^\$2[aby]\$[0-9]{2}\$.{53}$'),
  is_banned boolean NOT NULL DEFAULT false,
  migrated_auth_user_id uuid UNIQUE REFERENCES auth.users(id),
  migration_claim uuid,
  migration_started_at timestamptz,
  imported_at timestamptz NOT NULL DEFAULT now(),
  migrated_at timestamptz,
  CHECK ((migration_claim IS NULL) = (migration_started_at IS NULL)),
  CHECK (migrated_auth_user_id IS NULL OR password_hash IS NULL)
);
ALTER TABLE public.dlfr_legacy_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dlfr_legacy_credentials FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.dlfr_legacy_credentials TO service_role;

CREATE OR REPLACE FUNCTION public.dlfr_legacy_migration_begin(p_handle text,p_claim uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  IF p_claim IS NULL OR p_handle IS NULL THEN RETURN false; END IF;
  UPDATE public.dlfr_legacy_credentials
     SET migration_claim=p_claim,migration_started_at=now()
   WHERE username_key=p_handle
     AND is_banned=false AND migrated_auth_user_id IS NULL AND password_hash IS NOT NULL
     AND (migration_claim IS NULL OR migration_started_at<now()-interval '5 minutes');
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.dlfr_legacy_migration_begin(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dlfr_legacy_migration_begin(text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.dlfr_legacy_migration_abort(p_handle text,p_claim uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 UPDATE public.dlfr_legacy_credentials SET migration_claim=NULL,migration_started_at=NULL
 WHERE username_key=p_handle AND migration_claim=p_claim AND migrated_auth_user_id IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.dlfr_legacy_migration_abort(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dlfr_legacy_migration_abort(text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.dlfr_legacy_migration_finish(p_handle text,p_claim uuid,p_auth_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_player_key text; v_linked boolean := false;
BEGIN
 IF p_auth_user_id IS NULL OR p_claim IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.dlfr_legacy_credentials
   WHERE username_key=p_handle AND migration_claim=p_claim
     AND migration_started_at>now()-interval '5 minutes' AND migrated_auth_user_id IS NULL AND is_banned=false
 ) THEN
   RAISE EXCEPTION 'Migration non autorisée ou expirée';
 END IF;
 IF EXISTS(SELECT 1 FROM public.dlfr_username_accounts WHERE username_key=p_handle OR auth_user_id=p_auth_user_id) THEN
   RAISE EXCEPTION 'Identifiant déjà utilisé par un compte récent';
 END IF;
 -- Atomicité avec la liaison : aucun utilisateur ne peut revendiquer une autre fiche par simple pseudo.
 INSERT INTO public.dlfr_username_accounts(username_key,auth_user_id) VALUES(p_handle,p_auth_user_id);
 SELECT p.player_key INTO v_player_key
 FROM public.players p
 WHERE p.player_key=p_handle
   AND p.has_account IS NOT TRUE
   AND NOT EXISTS(SELECT 1 FROM public.dlfr_player_merges m WHERE m.source_key=p.player_key)
   AND NOT EXISTS(SELECT 1 FROM public.player_profile_owners o WHERE o.player_key=p.player_key)
   AND NOT EXISTS(SELECT 1 FROM public.player_profile_owners o WHERE o.auth_user_id=p_auth_user_id)
   AND NOT EXISTS(SELECT 1 FROM public.profile_claim_requests r WHERE r.player_key=p.player_key AND r.status='pending')
   AND NOT EXISTS(SELECT 1 FROM public.dlfr_player_merge_requests r WHERE (r.source_key=p.player_key OR r.target_key=p.player_key) AND r.status='pending')
 FOR UPDATE OF p;
 IF v_player_key IS NOT NULL THEN
   -- Si une revendication arrive en concurrence, la contrainte UNIQUE empêche le vol.
   INSERT INTO public.player_profile_owners(player_key,auth_user_id) VALUES(v_player_key,p_auth_user_id)
     ON CONFLICT DO NOTHING;
   IF EXISTS(SELECT 1 FROM public.player_profile_owners o
             WHERE o.player_key=v_player_key AND o.auth_user_id=p_auth_user_id) THEN
     UPDATE public.players SET has_account=true WHERE player_key=v_player_key;
     v_linked:=true;
   END IF;
 END IF;
 UPDATE public.dlfr_legacy_credentials
    SET password_hash=NULL,migrated_auth_user_id=p_auth_user_id,migrated_at=now(),migration_claim=NULL,migration_started_at=NULL
  WHERE username_key=p_handle AND migration_claim=p_claim;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conflit pendant la migration'; END IF;
 RETURN jsonb_build_object('migrated',true,'profile_linked',v_linked,'player_key',CASE WHEN v_linked THEN v_player_key ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.dlfr_legacy_migration_finish(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dlfr_legacy_migration_finish(text,uuid,uuid) TO service_role;
COMMIT;

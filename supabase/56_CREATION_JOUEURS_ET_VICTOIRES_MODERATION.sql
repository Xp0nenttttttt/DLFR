-- DLFR V56 : Creation manuelle de joueurs et attribution de victoires.
-- A executer APRES les migrations 11 (production) et 26 (roles scopes).
-- ADDITIF : ne supprime aucune fiche, victoire, compte, role ou archive.
-- Ces fonctions sont volontairement reservees aux proprietaires / supermoderateurs.
BEGIN;

CREATE OR REPLACE FUNCTION public.dlfr_mod_create_player(
  p_username text,
  p_display_name text DEFAULT NULL,
  p_country_code text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_name text := pg_catalog.btrim(coalesce(p_username,''));
  v_key text;
  v_display text;
  v_country text := nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(p_country_code,''))), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.dlfr_can_moderate() THEN
    RAISE EXCEPTION 'Supermoderateur requis pour creer une fiche.';
  END IF;
  IF v_name !~ '^[A-Za-z0-9_-]{2,70}$' THEN
    RAISE EXCEPTION 'Pseudo invalide (2 a 70 caracteres alphanumeriques, tirets ou underscores).';
  END IF;
  v_key := pg_catalog.lower(v_name);
  IF v_key = ANY(ARRAY['admin','administrator','moderator','moderateur','staff','owner','demonlist','dlfr','aredl']) THEN
    RAISE EXCEPTION 'Ce pseudo est reserve.';
  END IF;
  v_display := coalesce(nullif(pg_catalog.btrim(p_display_name),''), v_name);
  IF pg_catalog.char_length(v_display) > 80 THEN
    RAISE EXCEPTION 'Nom affiche trop long (80 caracteres maximum).';
  END IF;
  IF v_country IS NOT NULL AND v_country NOT IN ('FR','BE','CH','CA') THEN
    RAISE EXCEPTION 'Pays invalide.';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dlfr-mod-player:' || v_key));
  IF EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.player_key = v_key
      OR pg_catalog.lower(pg_catalog.btrim(p.username)) = v_key
      OR pg_catalog.lower(pg_catalog.btrim(coalesce(p.display_name,''))) = v_key
  ) THEN
    RAISE EXCEPTION 'Une fiche portant ce pseudo existe deja. Utilise la liaison ou la fusion.';
  END IF;
  INSERT INTO public.players(player_key,username,display_name,country_code,has_account)
    VALUES(v_key,v_name,v_display,v_country,FALSE);
  -- Aucun INSERT dans player_profile_owners : le joueur doit revendiquer la fiche.
  INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
    VALUES(auth.uid(),'PLAYER_MOD_CREATE',v_key,'Creation manuelle sans proprietaire Auth');
  RETURN v_key;
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_mod_create_player(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dlfr_mod_create_player(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dlfr_mod_assign_victory(
  p_player_key text,
  p_demon_id bigint,
  p_video_url text DEFAULT NULL,
  p_achieved_at date DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_key text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_player_key,'')));
  v_url text := nullif(pg_catalog.btrim(coalesce(p_video_url,'')), '');
  v_record_id bigint;
  v_demon public.demons%ROWTYPE;
  v_date timestamptz := NULL;
  v_was_existing boolean := FALSE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.dlfr_can_moderate() THEN
    RAISE EXCEPTION 'Supermoderateur requis pour attribuer une victoire.';
  END IF;
  IF v_key = '' OR NOT EXISTS (SELECT 1 FROM public.players p WHERE p.player_key=v_key) THEN
    RAISE EXCEPTION 'Fiche joueur introuvable.';
  END IF;
  -- Refuser les profils absorbes par une fusion, sans supprimer les archives.
  IF to_regclass('public.dlfr_player_merges') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.dlfr_player_merges m WHERE m.source_key = v_key) THEN
      RAISE EXCEPTION 'Ce profil a deja ete fusionne : selectionne la fiche conservee.';
    END IF;
  END IF;
  SELECT * INTO v_demon FROM public.demons d WHERE d.id=p_demon_id;
  IF NOT FOUND OR v_demon.is_public IS DISTINCT FROM TRUE
     OR v_demon.legacy IS TRUE OR v_demon.position < 1 THEN
    RAISE EXCEPTION 'Ce niveau n''est pas une fiche publique active.';
  END IF;
  IF v_url IS NOT NULL AND (v_url !~* '^https://[^[:space:]]+$' OR pg_catalog.char_length(v_url)>1000) THEN
    RAISE EXCEPTION 'La preuve doit etre une URL HTTPS valide (max 1000 caracteres).';
  END IF;
  IF p_achieved_at IS NOT NULL THEN
    IF p_achieved_at > current_date OR p_achieved_at < DATE '2013-08-13' THEN
      RAISE EXCEPTION 'Date de victoire invalide.';
    END IF;
    v_date := (p_achieved_at::timestamp + interval '12 hours') AT TIME ZONE 'UTC';
  END IF;
  -- Meme joueur, meme niveau : une seule completion, meme en cas de doubles clics.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('dlfr-victory:' || v_key || ':' || p_demon_id::text)
  );
  SELECT c.id INTO v_record_id FROM public.completions c
    WHERE c.demon_id=p_demon_id AND pg_catalog.lower(pg_catalog.btrim(c.player))=v_key
    ORDER BY c.id LIMIT 1 FOR UPDATE;
  IF v_record_id IS NULL THEN
    INSERT INTO public.completions(demon_id,player,progress,video_url,created_at)
      VALUES(p_demon_id,v_key,100,v_url,coalesce(v_date,now()))
      RETURNING id INTO v_record_id;
  ELSE
    v_was_existing:=TRUE;
    UPDATE public.completions c SET progress=100,
      video_url=coalesce(nullif(pg_catalog.btrim(c.video_url),''),v_url),
      created_at=coalesce(v_date,c.created_at)
    WHERE c.id=v_record_id;
  END IF;
  INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
    VALUES(auth.uid(),CASE WHEN v_was_existing THEN 'VICTORY_MOD_UPDATE' ELSE 'VICTORY_MOD_CREATE' END,
       v_record_id::text,
       'player=' || v_key || '; demon=' || p_demon_id::text || '; progress=100');
  RETURN v_record_id;
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_mod_assign_victory(text,bigint,text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dlfr_mod_assign_victory(text,bigint,text,date) TO authenticated;
COMMIT;

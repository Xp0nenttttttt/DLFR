-- V81: boutique cosmétique, vitrine et séries calculées depuis les récompenses V80.
-- Installer V80 avant V81. Aucun changement des points de classement.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dlfr_reward_catalog (
 item_key text PRIMARY KEY CHECK(item_key ~ '^[a-z0-9_]{3,40}$'),
 label text NOT NULL, description text NOT NULL DEFAULT '',
 emoji text NOT NULL DEFAULT '✨', category text NOT NULL CHECK(category IN ('frame','badge','banner')),
 price integer NOT NULL CHECK(price BETWEEN 1 AND 100000), active boolean NOT NULL DEFAULT true
);
INSERT INTO public.dlfr_reward_catalog(item_key,label,description,emoji,category,price) VALUES
 ('frame_amethyst','Cadre Améthyste','Un contour violet pour la vitrine de profil.','💜','frame',100),
 ('frame_aurora','Cadre Aurore','Un contour bleu clair pour la vitrine.','❄️','frame',150),
 ('badge_spark','Éclat hebdomadaire','Une distinction décorative à exposer.','✨','badge',75),
 ('badge_flame','Flamme éternelle','Une distinction décorative à exposer.','🔥','badge',125),
 ('banner_night','Nuit étoilée','Un décor nocturne pour la vitrine.','🌙','banner',200)
ON CONFLICT (item_key) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.dlfr_reward_purchases (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 item_key text NOT NULL REFERENCES public.dlfr_reward_catalog(item_key),
 price_paid integer NOT NULL CHECK(price_paid > 0),
 purchased_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(auth_user_id,item_key)
);
CREATE TABLE IF NOT EXISTS public.dlfr_reward_equipped (
 auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 category text NOT NULL CHECK(category IN ('frame','badge','banner')),
 item_key text NOT NULL REFERENCES public.dlfr_reward_catalog(item_key),
 equipped_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(auth_user_id,category)
);
ALTER TABLE public.dlfr_reward_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dlfr_reward_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dlfr_reward_equipped ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dlfr_reward_catalog,public.dlfr_reward_purchases,public.dlfr_reward_equipped FROM anon,authenticated;
GRANT SELECT ON public.dlfr_reward_catalog TO anon,authenticated;
DROP POLICY IF EXISTS reward_catalog_read ON public.dlfr_reward_catalog;
CREATE POLICY reward_catalog_read ON public.dlfr_reward_catalog FOR SELECT TO anon,authenticated USING (active);
-- Achat atomique : sérialisation par verrou sur auth.users afin d'empêcher deux achats simultanés de dépenser les mêmes pièces.
CREATE OR REPLACE FUNCTION public.dlfr_reward_buy(p_item_key text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_auth uuid:=auth.uid(); v_item public.dlfr_reward_catalog%ROWTYPE; v_balance bigint;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 PERFORM 1 FROM auth.users WHERE id=v_auth FOR UPDATE;
 SELECT * INTO v_item FROM public.dlfr_reward_catalog WHERE item_key=p_item_key AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Objet indisponible'; END IF;
 IF EXISTS(SELECT 1 FROM public.dlfr_reward_purchases WHERE auth_user_id=v_auth AND item_key=p_item_key) THEN RAISE EXCEPTION 'Objet déjà acheté'; END IF;
 SELECT COALESCE((SELECT SUM(coins) FROM public.dlfr_weekly_rewards WHERE auth_user_id=v_auth),0)
        - COALESCE((SELECT SUM(price_paid) FROM public.dlfr_reward_purchases WHERE auth_user_id=v_auth),0) INTO v_balance;
 IF v_balance < v_item.price THEN RAISE EXCEPTION 'Pièces insuffisantes'; END IF;
 INSERT INTO public.dlfr_reward_purchases(auth_user_id,item_key,price_paid) VALUES(v_auth,p_item_key,v_item.price);
 RETURN p_item_key;
END $$;
CREATE OR REPLACE FUNCTION public.dlfr_reward_equip(p_item_key text,p_category text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_auth uuid:=auth.uid();v_category text;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 IF p_category NOT IN ('frame','badge','banner') THEN RAISE EXCEPTION 'Catégorie invalide'; END IF;
 IF p_item_key IS NULL OR p_item_key='' THEN
  DELETE FROM public.dlfr_reward_equipped WHERE auth_user_id=v_auth AND category=p_category;
  RETURN 'retiré';
 END IF;
 SELECT c.category INTO v_category FROM public.dlfr_reward_purchases p
 JOIN public.dlfr_reward_catalog c ON c.item_key=p.item_key
 WHERE p.auth_user_id=v_auth AND p.item_key=p_item_key AND c.active;
 IF v_category IS DISTINCT FROM p_category THEN RAISE EXCEPTION 'Objet non possédé ou catégorie invalide'; END IF;
 INSERT INTO public.dlfr_reward_equipped(auth_user_id,category,item_key)
 VALUES(v_auth,p_category,p_item_key)
 ON CONFLICT(auth_user_id,category) DO UPDATE SET item_key=EXCLUDED.item_key,equipped_at=now();
 RETURN p_item_key;
END $$;
CREATE OR REPLACE FUNCTION public.dlfr_rewards_status() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_auth uuid:=auth.uid();v_earned bigint:=0;v_spent bigint:=0;v_inventory jsonb:='[]'::jsonb;v_equipped jsonb:='{}'::jsonb;v_streak integer:=0;v_cursor date;v_week date;
BEGIN
 IF v_auth IS NULL THEN RETURN jsonb_build_object('signed_in',false); END IF;
 SELECT COALESCE(sum(coins),0) INTO v_earned FROM public.dlfr_weekly_rewards WHERE auth_user_id=v_auth;
 SELECT COALESCE(sum(price_paid),0) INTO v_spent FROM public.dlfr_reward_purchases WHERE auth_user_id=v_auth;
 SELECT COALESCE(jsonb_agg(item_key),'[]'::jsonb) INTO v_inventory FROM public.dlfr_reward_purchases WHERE auth_user_id=v_auth;
 SELECT COALESCE(jsonb_object_agg(category,item_key),'{}'::jsonb) INTO v_equipped FROM public.dlfr_reward_equipped WHERE auth_user_id=v_auth;
 v_week:=date_trunc('week',now() AT TIME ZONE 'UTC')::date;
 -- Tolérer une semaine courante non terminée : compter depuis la semaine précédente si nécessaire.
 IF NOT EXISTS(SELECT 1 FROM public.dlfr_weekly_rewards WHERE auth_user_id=v_auth AND week_start=v_week) THEN v_week:=v_week-7; END IF;
 v_cursor:=v_week;
 WHILE EXISTS(SELECT 1 FROM public.dlfr_weekly_rewards WHERE auth_user_id=v_auth AND week_start=v_cursor) LOOP
  v_streak:=v_streak+1;v_cursor:=v_cursor-7;
  EXIT WHEN v_streak>=520;
 END LOOP;
 RETURN jsonb_build_object('signed_in',true,'balance',v_earned-v_spent,'earned',v_earned,'spent',v_spent,'inventory',v_inventory,'equipped',v_equipped,'streak',v_streak);
END $$;
-- Seuls les équipements choisis sont publics, et uniquement pour les profils effectivement liés.
CREATE OR REPLACE FUNCTION public.dlfr_rewards_public(p_player_key text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT COALESCE((SELECT jsonb_agg(jsonb_build_object('category',c.category,'label',c.label,'emoji',c.emoji,'item_key',c.item_key))
 FROM public.player_profile_owners o JOIN public.dlfr_reward_equipped e ON e.auth_user_id=o.auth_user_id
 JOIN public.dlfr_reward_catalog c ON c.item_key=e.item_key AND c.active
 WHERE o.player_key=p_player_key),'[]'::jsonb);
$$;
REVOKE ALL ON FUNCTION public.dlfr_reward_buy(text),public.dlfr_reward_equip(text,text),public.dlfr_rewards_status(),public.dlfr_rewards_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_reward_buy(text),public.dlfr_reward_equip(text,text),public.dlfr_rewards_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dlfr_rewards_public(text) TO anon,authenticated;
COMMIT;

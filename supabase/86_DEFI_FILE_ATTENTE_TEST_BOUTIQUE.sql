-- DLFR V86: file d'attente hebdomadaire + essais temporaires propriétaire.
-- PREREQUIS: V80, V81, V82, V85. Exécuter une fois, uniquement sur le bon projet Supabase.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dlfr_owner_test_items (
 auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 item_key text NOT NULL REFERENCES public.dlfr_reward_catalog(item_key),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(auth_user_id,item_key)
);
ALTER TABLE public.dlfr_owner_test_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dlfr_owner_test_items FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.dlfr_owner_weekly_save(p_week date,p_demon_id bigint,p_reward integer DEFAULT 50) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_user uuid:=auth.uid();
BEGIN
 IF v_user IS NULL OR NOT EXISTS(SELECT 1 FROM public.staff_roles WHERE auth_user_id=v_user AND role='owner') THEN RAISE EXCEPTION 'Propriétaire requis'; END IF;
 IF p_week IS NULL OR EXTRACT(ISODOW FROM p_week)<>1 THEN RAISE EXCEPTION 'Choisir un lundi (UTC)'; END IF;
 IF p_week < date_trunc('week',now() AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'Semaine déjà terminée'; END IF;
 IF p_reward IS NULL OR p_reward NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Récompense invalide'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.demons WHERE id=p_demon_id AND is_public=true) THEN RAISE EXCEPTION 'Niveau public introuvable'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('dlfr_weekly_' || p_week::text));
 IF EXISTS(SELECT 1 FROM public.dlfr_weekly_rewards WHERE week_start=p_week) THEN RAISE EXCEPTION 'Défi verrouillé : des récompenses sont déjà distribuées'; END IF;
 INSERT INTO public.dlfr_weekly_challenges(week_start,demon_id,reward) VALUES(p_week,p_demon_id,p_reward)
 ON CONFLICT(week_start) DO UPDATE SET demon_id=EXCLUDED.demon_id,reward=EXCLUDED.reward;
END $$;
CREATE OR REPLACE FUNCTION public.dlfr_owner_weekly_delete(p_week date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_user uuid:=auth.uid();
BEGIN
 IF v_user IS NULL OR NOT EXISTS(SELECT 1 FROM public.staff_roles WHERE auth_user_id=v_user AND role='owner') THEN RAISE EXCEPTION 'Propriétaire requis'; END IF;
 IF p_week < date_trunc('week',now() AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'Semaine déjà terminée'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('dlfr_weekly_' || p_week::text));
 IF EXISTS(SELECT 1 FROM public.dlfr_weekly_rewards WHERE week_start=p_week) THEN RAISE EXCEPTION 'Des récompenses sont déjà distribuées'; END IF;
 DELETE FROM public.dlfr_weekly_challenges WHERE week_start=p_week;
END $$;
CREATE OR REPLACE FUNCTION public.dlfr_owner_test_item(p_item_key text,p_enable boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_user uuid:=auth.uid();
BEGIN
 IF v_user IS NULL OR NOT EXISTS(SELECT 1 FROM public.staff_roles WHERE auth_user_id=v_user AND role='owner') THEN RAISE EXCEPTION 'Propriétaire requis'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dlfr_reward_catalog WHERE item_key=p_item_key AND active=true) THEN RAISE EXCEPTION 'Objet indisponible'; END IF;
 IF p_enable THEN
  INSERT INTO public.dlfr_owner_test_items(auth_user_id,item_key) VALUES(v_user,p_item_key) ON CONFLICT DO NOTHING;
 ELSE
  DELETE FROM public.dlfr_owner_test_items WHERE auth_user_id=v_user AND item_key=p_item_key;
  DELETE FROM public.dlfr_reward_equipped e WHERE e.auth_user_id=v_user AND e.item_key=p_item_key
   AND NOT EXISTS(SELECT 1 FROM public.dlfr_reward_purchases p WHERE p.auth_user_id=v_user AND p.item_key=p_item_key);
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.dlfr_owner_rewards_panel() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_user uuid:=auth.uid();v_weeks jsonb;v_items jsonb;
BEGIN
 IF v_user IS NULL OR NOT EXISTS(SELECT 1 FROM public.staff_roles WHERE auth_user_id=v_user AND role='owner') THEN RAISE EXCEPTION 'Propriétaire requis'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('week_start',w.week_start,'name',d.name,'reward',w.reward,
 'locked',EXISTS(SELECT 1 FROM public.dlfr_weekly_rewards r WHERE r.week_start=w.week_start)) ORDER BY w.week_start),'[]'::jsonb)
 INTO v_weeks FROM public.dlfr_weekly_challenges w JOIN public.demons d ON d.id=w.demon_id
 WHERE w.week_start >= date_trunc('week',now() AT TIME ZONE 'UTC')::date;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('item_key',c.item_key,'label',c.label,'emoji',c.emoji,
 'purchased',EXISTS(SELECT 1 FROM public.dlfr_reward_purchases p WHERE p.auth_user_id=v_user AND p.item_key=c.item_key),
 'testing',EXISTS(SELECT 1 FROM public.dlfr_owner_test_items t WHERE t.auth_user_id=v_user AND t.item_key=c.item_key)) ORDER BY c.price),'[]'::jsonb)
 INTO v_items FROM public.dlfr_reward_catalog c WHERE c.active;
 RETURN jsonb_build_object('weeks',v_weeks,'items',v_items);
END $$;
CREATE OR REPLACE FUNCTION public.dlfr_rewards_status() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_auth uuid:=auth.uid();v_earned bigint:=0;v_spent bigint:=0;v_inventory jsonb:='[]'::jsonb;v_equipped jsonb:='{}'::jsonb;v_streak integer:=0;v_trials jsonb:='[]'::jsonb;v_cursor date;v_week date;
BEGIN
 IF v_auth IS NULL THEN RETURN jsonb_build_object('signed_in',false); END IF;
 SELECT COALESCE(sum(coins),0) INTO v_earned FROM public.dlfr_weekly_rewards WHERE auth_user_id=v_auth;
 SELECT COALESCE(sum(price_paid),0) INTO v_spent FROM public.dlfr_reward_purchases WHERE auth_user_id=v_auth;
 SELECT COALESCE(jsonb_agg(item_key),'[]'::jsonb) INTO v_inventory FROM public.dlfr_reward_purchases WHERE auth_user_id=v_auth;
 SELECT COALESCE(jsonb_agg(item_key),'[]'::jsonb) INTO v_trials FROM public.dlfr_owner_test_items WHERE auth_user_id=v_auth;
 v_inventory:=v_inventory || v_trials;
 SELECT COALESCE(jsonb_object_agg(category,item_key),'{}'::jsonb) INTO v_equipped FROM public.dlfr_reward_equipped WHERE auth_user_id=v_auth;
 v_week:=date_trunc('week',now() AT TIME ZONE 'UTC')::date;
 -- Tolérer une semaine courante non terminée : compter depuis la semaine précédente si nécessaire.
 IF NOT EXISTS(SELECT 1 FROM public.dlfr_weekly_rewards WHERE auth_user_id=v_auth AND week_start=v_week) THEN v_week:=v_week-7; END IF;
 v_cursor:=v_week;
 WHILE EXISTS(SELECT 1 FROM public.dlfr_weekly_rewards WHERE auth_user_id=v_auth AND week_start=v_cursor) LOOP
  v_streak:=v_streak+1;v_cursor:=v_cursor-7;
  EXIT WHEN v_streak>=520;
 END LOOP;
 RETURN jsonb_build_object('signed_in',true,'balance',v_earned-v_spent,'earned',v_earned,'spent',v_spent,'inventory',v_inventory,'test_inventory',v_trials,'equipped',v_equipped,'streak',v_streak);
END $$;
CREATE OR REPLACE FUNCTION public.dlfr_reward_equip(p_item_key text,p_category text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_auth uuid:=auth.uid();v_category text;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 IF p_category NOT IN ('frame','badge','banner','theme') THEN RAISE EXCEPTION 'Catégorie invalide'; END IF;
 IF p_item_key IS NULL OR p_item_key='' THEN
  DELETE FROM public.dlfr_reward_equipped WHERE auth_user_id=v_auth AND category=p_category;
  RETURN 'retiré';
 END IF;
 SELECT c.category INTO v_category FROM public.dlfr_reward_catalog c
 WHERE c.item_key=p_item_key AND c.active AND (
 EXISTS(SELECT 1 FROM public.dlfr_reward_purchases p WHERE p.auth_user_id=v_auth AND p.item_key=c.item_key)
 OR (EXISTS(SELECT 1 FROM public.staff_roles s WHERE s.auth_user_id=v_auth AND s.role='owner')
     AND EXISTS(SELECT 1 FROM public.dlfr_owner_test_items t WHERE t.auth_user_id=v_auth AND t.item_key=c.item_key))
 );
 IF v_category IS DISTINCT FROM p_category THEN RAISE EXCEPTION 'Objet non possédé ou catégorie invalide'; END IF;
 INSERT INTO public.dlfr_reward_equipped(auth_user_id,category,item_key)
 VALUES(v_auth,p_category,p_item_key)
 ON CONFLICT(auth_user_id,category) DO UPDATE SET item_key=EXCLUDED.item_key,equipped_at=now();
 RETURN p_item_key;
END $$;
REVOKE ALL ON FUNCTION public.dlfr_owner_weekly_save(date,bigint,integer),public.dlfr_owner_weekly_delete(date),public.dlfr_owner_test_item(text,boolean),public.dlfr_owner_rewards_panel() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_owner_weekly_save(date,bigint,integer),public.dlfr_owner_weekly_delete(date),public.dlfr_owner_test_item(text,boolean),public.dlfr_owner_rewards_panel() TO authenticated;
COMMIT;

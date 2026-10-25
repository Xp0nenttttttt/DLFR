-- V82 - Acheter et équiper le thème Halloween, sans altérer les points DLFR.
-- Exécuter après la migration 81.
BEGIN;
ALTER TABLE public.dlfr_reward_catalog DROP CONSTRAINT IF EXISTS dlfr_reward_catalog_category_check;
ALTER TABLE public.dlfr_reward_catalog ADD CONSTRAINT dlfr_reward_catalog_category_check CHECK(category IN ('frame','badge','banner','theme'));
ALTER TABLE public.dlfr_reward_equipped DROP CONSTRAINT IF EXISTS dlfr_reward_equipped_category_check;
ALTER TABLE public.dlfr_reward_equipped ADD CONSTRAINT dlfr_reward_equipped_category_check CHECK(category IN ('frame','badge','banner','theme'));
INSERT INTO public.dlfr_reward_catalog(item_key,label,description,emoji,category,price,active)
VALUES ('theme_halloween','Halloween · Nocturne','Thème premium gothique : nuit violette, cuivre et orange spectral.','🎃','theme',350,true)
ON CONFLICT(item_key) DO UPDATE SET label=EXCLUDED.label,description=EXCLUDED.description,emoji=EXCLUDED.emoji,category=EXCLUDED.category,price=EXCLUDED.price,active=true;
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
 SELECT c.category INTO v_category FROM public.dlfr_reward_purchases p
 JOIN public.dlfr_reward_catalog c ON c.item_key=p.item_key
 WHERE p.auth_user_id=v_auth AND p.item_key=p_item_key AND c.active;
 IF v_category IS DISTINCT FROM p_category THEN RAISE EXCEPTION 'Objet non possédé ou catégorie invalide'; END IF;
 INSERT INTO public.dlfr_reward_equipped(auth_user_id,category,item_key)
 VALUES(v_auth,p_category,p_item_key)
 ON CONFLICT(auth_user_id,category) DO UPDATE SET item_key=EXCLUDED.item_key,equipped_at=now();
 RETURN p_item_key;
END $$;
COMMIT;

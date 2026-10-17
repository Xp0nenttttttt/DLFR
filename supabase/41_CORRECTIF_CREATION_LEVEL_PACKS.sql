-- DLFR 2.7.1 — Correction de l'enregistrement des Level Packs.
-- Corrige « column reference "id" is ambiguous » dans dlfr_save_level_pack.
-- À lancer APRÈS la migration 40. Ne touche ni aux packs existants,
-- ni aux niveaux, complétions, points ou récompenses déjà attribuées.
-- CREATE OR REPLACE conserve la signature de l'appel Supabase.
BEGIN;

CREATE OR REPLACE FUNCTION public.dlfr_save_level_pack(
 p_pack_id bigint,p_title text,p_description text,p_banner_url text,
 p_reward_kind text,p_reward_label text,p_level_ids bigint[],p_is_published boolean
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_role text; v_pack bigint; v_count integer; v_order integer; v_demon bigint;
 v_has_claims boolean; v_old public.dlfr_level_packs%ROWTYPE;
 v_title bigint; v_levels bigint[];
BEGIN
 SELECT s.role INTO v_role FROM public.staff_roles s WHERE s.auth_user_id=(SELECT auth.uid());
 IF (v_role IS NULL OR v_role NOT IN ('owner','editor','supermoderator','moderator','nlw')) AND EXISTS(SELECT 1 FROM public.nlw_staff_roles n WHERE n.auth_user_id=(SELECT auth.uid())) THEN v_role:='nlw'; END IF;
 IF v_role IS NULL OR v_role NOT IN ('owner','editor','supermoderator','moderator','nlw')
 THEN RAISE EXCEPTION 'Modération requise'; END IF;
 IF length(btrim(COALESCE(p_title,''))) NOT BETWEEN 3 AND 110
  OR length(COALESCE(p_description,''))>1500
  OR length(btrim(COALESCE(p_reward_label,''))) NOT BETWEEN 2 AND 80
  OR p_reward_kind NOT IN ('badge','title')
 THEN RAISE EXCEPTION 'Informations du pack invalides'; END IF;
 IF NULLIF(btrim(COALESCE(p_banner_url,'')),'') IS NOT NULL AND
    (length(p_banner_url)>500 OR p_banner_url !~* '^https://[^[:space:]]+$')
 THEN RAISE EXCEPTION 'Bannière : URL HTTPS requise'; END IF;
 v_count:=COALESCE(cardinality(p_level_ids),0);
 IF v_count NOT BETWEEN 2 AND 30 OR
    v_count <> (SELECT count(DISTINCT x) FROM unnest(p_level_ids) AS x)
 THEN RAISE EXCEPTION 'Choisis entre 2 et 30 niveaux distincts'; END IF;
 IF EXISTS (
   SELECT 1 FROM unnest(p_level_ids) AS selected_level(level_id)
   LEFT JOIN public.demons d ON d.id = selected_level.level_id
   WHERE d.id IS NULL OR d.is_public IS DISTINCT FROM true OR d.legacy IS TRUE OR d.unrated IS TRUE
     OR (v_role='nlw' AND (d.position<=150 OR d.position>=100000000))
 ) THEN RAISE EXCEPTION 'Niveau inaccessible ou non autorisé pour ce rôle'; END IF;
 IF p_pack_id IS NOT NULL THEN
  SELECT * INTO v_old FROM public.dlfr_level_packs WHERE id=p_pack_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pack introuvable'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.dlfr_level_pack_claims WHERE pack_id=p_pack_id) INTO v_has_claims;
  IF v_has_claims THEN
    SELECT array_agg(demon_id ORDER BY sort_order) INTO v_levels
      FROM public.dlfr_level_pack_levels WHERE pack_id=p_pack_id;
    IF v_old.reward_kind<>p_reward_kind OR v_old.reward_label<>btrim(p_reward_label)
       OR v_levels IS DISTINCT FROM p_level_ids THEN
       RAISE EXCEPTION 'Pack déjà récompensé : niveaux et récompense verrouillés';
    END IF;
  END IF;
  -- NLW doit rester limité à son périmètre même si un pack a été créé par un supermodo.
  IF v_role='nlw' AND EXISTS (
    SELECT 1 FROM public.dlfr_level_pack_levels l JOIN public.demons d ON d.id=l.demon_id
    WHERE l.pack_id=p_pack_id AND (d.position<=150 OR d.position>=100000000)
  ) THEN RAISE EXCEPTION 'Ce pack contient des niveaux hors NLW'; END IF;
  v_pack:=p_pack_id;
  v_title:=v_old.reward_title_id;
 ELSE
  v_title:=NULL;
  INSERT INTO public.dlfr_level_packs(title,description,reward_kind,reward_label,is_published,created_by)
  VALUES(btrim(p_title),COALESCE(p_description,''),p_reward_kind,btrim(p_reward_label),false,(SELECT auth.uid()))
  RETURNING id INTO v_pack;
 END IF;
 -- Le titre officiel ne peut pas être choisi/arbitrairement accordé par le joueur.
 IF p_reward_kind='title' THEN
   IF v_title IS NULL THEN
     INSERT INTO public.profile_titles(label,description,color,is_active)
     VALUES(btrim(p_reward_label),'Récompense Level Pack', '#6c62c6',true)
     RETURNING id INTO v_title;
   ELSE
     UPDATE public.profile_titles SET label=btrim(p_reward_label) WHERE id=v_title;
   END IF;
 END IF;
 UPDATE public.dlfr_level_packs SET
   title=btrim(p_title),description=COALESCE(p_description,''),
   banner_url=NULLIF(btrim(COALESCE(p_banner_url,'')),''),
   reward_kind=p_reward_kind,reward_label=btrim(p_reward_label),
   reward_title_id=CASE WHEN p_reward_kind='title' THEN v_title ELSE NULL END,
   is_published=COALESCE(p_is_published,false),updated_at=now()
 WHERE id=v_pack;
 DELETE FROM public.dlfr_level_pack_levels WHERE pack_id=v_pack;
 FOR v_order IN 1..v_count LOOP
  v_demon:=p_level_ids[v_order];
  INSERT INTO public.dlfr_level_pack_levels(pack_id,demon_id,sort_order)
  VALUES(v_pack,v_demon,v_order);
 END LOOP;
 RETURN v_pack;
END $$;
REVOKE ALL ON FUNCTION public.dlfr_save_level_pack(bigint,text,text,text,text,text,bigint[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_save_level_pack(bigint,text,text,text,text,text,bigint[],boolean) TO authenticated;

COMMIT;

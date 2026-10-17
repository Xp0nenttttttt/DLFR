-- DLFR 2.11 : annuaire prive des comptes et promotion d'un second proprietaire.
-- Executer uniquement apres avoir sauvegarde la base. Aucune promotion lors de l'installation.
BEGIN;

CREATE OR REPLACE FUNCTION public.dlfr_staff_candidates()
RETURNS TABLE(auth_user_id uuid,display_name text,"current_role" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT u.id,
         COALESCE(NULLIF(btrim(p.display_name),''),NULLIF(btrim(p.username),''),
           NULLIF(btrim(u.raw_user_meta_data->>'full_name'),''),
           NULLIF(btrim(u.raw_user_meta_data->>'name'),''),
           'Compte DLFR')::text,
         COALESCE(r.role,CASE WHEN n.auth_user_id IS NOT NULL THEN 'nlw' ELSE NULL END)::text
  FROM auth.users AS u
  LEFT JOIN public.player_profile_owners AS po ON po.auth_user_id=u.id
  LEFT JOIN public.players AS p ON p.player_key=po.player_key
  LEFT JOIN public.staff_roles AS r ON r.auth_user_id=u.id
  LEFT JOIN public.nlw_staff_roles AS n ON n.auth_user_id=u.id
  WHERE EXISTS (SELECT 1 FROM public.staff_roles AS me
                WHERE me.auth_user_id=auth.uid() AND me.role='owner')
  ORDER BY CASE WHEN r.role='owner' THEN 0 WHEN r.role IS NOT NULL OR n.auth_user_id IS NOT NULL THEN 1 ELSE 2 END,
           2,1;
$fn$;
REVOKE ALL ON FUNCTION public.dlfr_staff_candidates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_staff_candidates() TO authenticated;

CREATE OR REPLACE FUNCTION public.dlfr_add_coowner(
 p_auth_user_id uuid,
 p_confirmation text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_owners int;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (
     SELECT 1 FROM public.staff_roles WHERE auth_user_id=auth.uid() AND role='owner'
 ) THEN RAISE EXCEPTION 'Action reservee aux proprietaires'; END IF;
 IF p_confirmation IS DISTINCT FROM 'COPROPRIETAIRE' THEN
     RAISE EXCEPTION 'Confirmation incorrecte'; END IF;
 IF p_auth_user_id IS NULL OR p_auth_user_id=auth.uid() THEN
     RAISE EXCEPTION 'Choisis un autre compte'; END IF;
 IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_auth_user_id) THEN
     RAISE EXCEPTION 'Ce compte DLFR est introuvable'; END IF;
 -- Une seule promotion concurrente peut passer : maximum deux propriétaires.
 PERFORM pg_advisory_xact_lock(39149,2);
 SELECT count(*) INTO v_owners FROM public.staff_roles WHERE role='owner';
 IF v_owners<>1 THEN
     RAISE EXCEPTION 'La DLFR doit avoir exactement un proprietaire avant cette operation (actuel: %)', v_owners;
 END IF;
 IF EXISTS (SELECT 1 FROM public.staff_roles WHERE auth_user_id=p_auth_user_id AND role='owner') THEN
     RAISE EXCEPTION 'Ce compte est deja proprietaire'; END IF;
 DELETE FROM public.nlw_staff_roles WHERE auth_user_id=p_auth_user_id;
 INSERT INTO public.staff_roles(auth_user_id,role)
 VALUES (p_auth_user_id,'owner')
 ON CONFLICT(auth_user_id) DO UPDATE SET role='owner';
 INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
 VALUES (auth.uid(),'ADD_COOWNER',p_auth_user_id::text,'Deuxieme proprietaire ajoute via le panneau equipe');
 RETURN 'added';
END;
$fn$;
REVOKE ALL ON FUNCTION public.dlfr_add_coowner(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_add_coowner(uuid,text) TO authenticated;

COMMIT;

-- DLFR V3.1.1 — Archivage réversible des niveaux.
-- À appliquer APRÈS supabase/22_manual_level_creation.sql (V3.1.0).
-- Aucune suppression physique de niveaux ou de victoires.
BEGIN;

CREATE TABLE IF NOT EXISTS public.dlfr_level_archive_log (
 demon_id bigint PRIMARY KEY REFERENCES public.demons(id) ON DELETE CASCADE,
 original_position integer NOT NULL,
 original_unrated boolean NOT NULL DEFAULT false,
 archived_at timestamptz NOT NULL DEFAULT now(),
 archived_by uuid,
 reason text NOT NULL DEFAULT '',
 restored_at timestamptz,
 restored_by uuid,
 restored_position integer
);
ALTER TABLE public.dlfr_level_archive_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dlfr_level_archive_log FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.dlfr_level_archive_log TO authenticated;
DROP POLICY IF EXISTS dlfr_archives_mod_read ON public.dlfr_level_archive_log;
CREATE POLICY dlfr_archives_mod_read ON public.dlfr_level_archive_log
 FOR SELECT TO authenticated USING ((SELECT public.dlfr_can_moderate()));

-- Archivage sécurisé : masque la fiche, conserve ses records et libère son rang.
-- Les rangs Rated suivants sont décalés d'une place vers le haut (y compris les
-- fiches masquées qui occupent encore un rang Rated pour éviter un conflit UNIQUE).
CREATE OR REPLACE FUNCTION public.dlfr_archive_demon(
 p_demon_id bigint, p_confirm_name text, p_reason text DEFAULT ''
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d public.demons%ROWTYPE; x record; parking bigint;
BEGIN
 IF NOT public.dlfr_can_moderate() THEN RAISE EXCEPTION 'Modérateur général requis'; END IF;
 IF p_demon_id IS NULL THEN RAISE EXCEPTION 'Sélectionne un niveau'; END IF;
 PERFORM pg_advisory_xact_lock(41028,2);
 SELECT * INTO d FROM public.demons WHERE id=p_demon_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Niveau introuvable'; END IF;
 IF d.is_public IS NOT TRUE THEN RAISE EXCEPTION 'Ce niveau est déjà masqué'; END IF;
 IF btrim(coalesce(p_confirm_name,'')) IS DISTINCT FROM d.name THEN
  RAISE EXCEPTION 'Le nom de confirmation doit correspondre exactement à celui du niveau';
 END IF;
 IF length(coalesce(p_reason,''))>350 THEN RAISE EXCEPTION 'Motif trop long (350 caractères max)'; END IF;
 SELECT greatest(coalesce(max(position),0)::bigint+1,200000000) INTO parking FROM public.demons;
 IF parking >= 2147483647 THEN RAISE EXCEPTION 'Plus de position de stockage disponible'; END IF;
 INSERT INTO public.dlfr_level_archive_log
  (demon_id,original_position,original_unrated,archived_at,archived_by,reason,restored_at,restored_by,restored_position)
 VALUES (d.id,d.position,coalesce(d.unrated,false),now(),auth.uid(),coalesce(p_reason,''),NULL,NULL,NULL)
 ON CONFLICT(demon_id) DO UPDATE SET
   original_position=EXCLUDED.original_position,
   original_unrated=EXCLUDED.original_unrated,
   archived_at=EXCLUDED.archived_at,
   archived_by=EXCLUDED.archived_by,
   reason=EXCLUDED.reason,
   restored_at=NULL,
   restored_by=NULL,
   restored_position=NULL;
 UPDATE public.demons SET is_public=false, position=parking::integer WHERE id=d.id;
 IF NOT coalesce(d.unrated,false) AND d.position < 100000000 THEN
   FOR x IN SELECT id,position FROM public.demons
     WHERE position>d.position AND position<100000000 ORDER BY position ASC
   LOOP
     UPDATE public.demons SET position=x.position-1 WHERE id=x.id;
   END LOOP;
 END IF;
 INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
 VALUES(auth.uid(),'ARCHIVE_DEMON',d.id::text,
  format('nom=%s; ancien_rang=%s; unrated=%s; motif=%s',d.name,d.position,d.unrated,left(coalesce(p_reason,''),350)));
 RETURN d.id;
END $$;
REVOKE ALL ON FUNCTION public.dlfr_archive_demon(bigint,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_archive_demon(bigint,text,text) TO authenticated;

-- Restauration : rétablit la visibilité sans effacer l'historique.
-- Rated : insère au rang demandé en décalant les suivants si nécessaire.
-- UNRATED : si le rang estimé est pris, demander au modérateur un autre rang.
CREATE OR REPLACE FUNCTION public.dlfr_restore_demon(
 p_demon_id bigint, p_position integer DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d public.demons%ROWTYPE; a public.dlfr_level_archive_log%ROWTYPE;
        desired integer; target_rank integer;
BEGIN
 IF NOT public.dlfr_can_moderate() THEN RAISE EXCEPTION 'Modérateur général requis'; END IF;
 PERFORM pg_advisory_xact_lock(41028,2);
 SELECT * INTO a FROM public.dlfr_level_archive_log
   WHERE demon_id=p_demon_id AND restored_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aucun archivage restaurable pour ce niveau'; END IF;
 SELECT * INTO d FROM public.demons WHERE id=p_demon_id FOR UPDATE;
 IF NOT FOUND OR d.is_public THEN RAISE EXCEPTION 'Fiche supprimée ou déjà publique'; END IF;
 desired:=coalesce(p_position,CASE WHEN a.original_unrated
                  THEN a.original_position-100000000 ELSE a.original_position END);
 IF desired IS NULL OR desired<1 OR desired>=99999999 THEN RAISE EXCEPTION 'Rang invalide'; END IF;
 target_rank:=CASE WHEN a.original_unrated THEN 100000000+desired ELSE desired END;
 IF EXISTS(SELECT 1 FROM public.demons WHERE position=target_rank AND id<>d.id) THEN
   IF a.original_unrated THEN RAISE EXCEPTION 'Rang UNRATED occupé : choisis une autre position'; END IF;
   PERFORM public.dlfr_make_room(target_rank);
 END IF;
 UPDATE public.demons SET position=target_rank,is_public=true,
   unrated=a.original_unrated,
   unrated_position=CASE WHEN a.original_unrated THEN desired ELSE NULL END
 WHERE id=d.id;
 UPDATE public.dlfr_level_archive_log
 SET restored_at=now(),restored_by=auth.uid(),restored_position=target_rank
 WHERE demon_id=d.id;
 INSERT INTO public.community_audit_log(actor_user_id,action_key,target,details)
 VALUES(auth.uid(),'RESTORE_DEMON',d.id::text,
   format('nom=%s; rang_restaure=%s',d.name,target_rank));
 RETURN d.id;
END $$;
REVOKE ALL ON FUNCTION public.dlfr_restore_demon(bigint,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dlfr_restore_demon(bigint,integer) TO authenticated;
COMMIT;

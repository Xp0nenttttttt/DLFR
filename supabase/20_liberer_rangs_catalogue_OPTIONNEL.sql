-- OPTIONNEL (mais conseillé après sauvegarde) : libère les positions du catalogue
-- AREDL invisible afin de pouvoir constituer le classement DLFR manuellement.
-- Ne supprime ni niveaux ni records. Conserve l'ancien rang dans hide_log.
-- Exécuter uniquement après SQL 19 et lecture de son rapport.
BEGIN;
SELECT pg_advisory_xact_lock(41028,2);
DO $$
DECLARE v_max bigint; v_count integer;
BEGIN
 SELECT count(*) INTO v_count FROM public.demons d
 JOIN public.dlfr_catalog_hide_log l ON l.demon_id=d.id
 WHERE d.is_public=false;
 SELECT coalesce(max(position),0) INTO v_max FROM public.demons;
 IF v_max + v_count + 1 >= 2147483647 THEN
   RAISE EXCEPTION 'Impossible de déplacer les rangs : limite integer PostgreSQL';
 END IF;
END $$;
WITH selected AS (
 SELECT d.id,
   row_number() OVER(ORDER BY d.position,d.id) AS number
 FROM public.demons d
 JOIN public.dlfr_catalog_hide_log l ON l.demon_id=d.id
 WHERE d.is_public=false AND l.original_position IS NOT NULL
), maximum AS (
 SELECT max(position)::bigint AS max_pos FROM public.demons
), changed AS (
 UPDATE public.demons d
 SET position=(m.max_pos + s.number)::integer
 FROM selected s CROSS JOIN maximum m
 WHERE d.id=s.id
 RETURNING d.id
)
SELECT count(*) AS deplaces FROM changed;
COMMIT;

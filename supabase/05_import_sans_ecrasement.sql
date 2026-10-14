-- DLFR V3.2 - Migration contrôlée. IMPORTANT : sauvegarder la base avant.
-- Pré-requis : schéma réel V3.1, staging chargé, 04_correspondances_exactes exécuté.
-- Aucun DROP/TRUNCATE/DELETE, aucun déplacement de rang DLFR, aucun rôle importé.
BEGIN;
SELECT pg_advisory_xact_lock(41028,2);
-- Profils historiques publics non revendiqués, pas de connexion PHP transférée.
INSERT INTO public.players(player_key,username,display_name,country_code,has_account,legacy_role,points,bonus_points)
SELECT lower(trim(x.username)), x.username,
       nullif(x.source->>'display_name',''),nullif(x.country_code,''),false,'player',0,0
FROM dlfr_legacy.players x
WHERE length(trim(x.username))>0
ON CONFLICT DO NOTHING;
-- Les victoires de joueurs qui n'avaient aucun compte sur l'ancien site restent affichables.
INSERT INTO public.players(player_key,username,display_name,country_code,has_account,legacy_role,points,bonus_points)
SELECT lower(trim(r.player)),min(r.player),min(r.player),null,false,'player',0,0
FROM dlfr_legacy.records r
WHERE length(trim(r.player))>0
AND NOT EXISTS(SELECT 1 FROM public.players p WHERE p.player_key=lower(trim(r.player)))
GROUP BY lower(trim(r.player))
ON CONFLICT DO NOTHING;
-- Fiches publiques anciennes facultatives, sans écrasement des profils Discord actuels.
INSERT INTO public.player_profiles(player_key,bio,banner_url,social_url,highlight_1,highlight_2,highlight_3)
SELECT p.player_key, x.source->>'bio',x.source->>'banner_url',x.source->>'social_url',
 x.source->>'highlight_1',x.source->>'highlight_2',x.source->>'highlight_3'
FROM dlfr_legacy.player_profiles x JOIN public.players p ON p.player_key=x.player_key
ON CONFLICT DO NOTHING;
-- Archive des nouveaux niveaux jamais présents sur le site : INVISIBLES,
-- à une position de stockage qui ne concurrence pas Main/Extended/NLW.
-- Si un ancien niveau existe sous un autre nom ou ID, on ne crée PAS un doublon.
DO $$
DECLARE l record; new_id bigint; parked integer;
BEGIN
 FOR l IN SELECT x.* FROM dlfr_legacy.levels x
 LEFT JOIN dlfr_legacy.level_links m ON m.legacy_id=x.legacy_id
 WHERE m.legacy_id IS NULL ORDER BY x.legacy_id LOOP
   IF EXISTS(SELECT 1 FROM public.demons d WHERE lower(trim(d.name))=lower(trim(l.name))
       OR (l.level_id IS NOT NULL AND trim(d.level_id)=trim(l.level_id))) THEN
      CONTINUE; -- conflit à résoudre via le rapport après migration
   END IF;
   parked := 1900000000 + l.legacy_id::integer;
   IF EXISTS(SELECT 1 FROM public.demons d WHERE d.position=parked) THEN
      RAISE EXCEPTION 'Position de stockage déjà occupée : %',parked;
   END IF;
   INSERT INTO public.demons(position,name,level_id,requirement,difficulty,
     creator,creator_more,publisher,verifier,video_url,thumbnail_url,description,
     level_length,song,object_count,legacy,is_public,data_source,unrated)
   VALUES(parked,l.name,nullif(l.level_id,''),l.requirement,
     coalesce(nullif(l.source->>'difficulty',''),'Extreme Demon'),
     nullif(l.source->>'creator',''),nullif(l.source->>'creator_more',''),
     coalesce(l.source->>'publisher',''),nullif(l.source->>'verifier',''),
     nullif(l.source->>'video_url',''),nullif(l.source->>'thumbnail_url',''),
     nullif(l.source->>'description',''),nullif(l.source->>'level_length',''),
     nullif(l.source->>'song',''),
     nullif(l.source->>'object_count','')::integer,(l.source->>'legacy')::integer=1,
     false,'legacy_migration',false)
   RETURNING id INTO new_id;
   INSERT INTO dlfr_legacy.level_links(legacy_id,demon_id,mapping_source)
   VALUES(l.legacy_id,new_id,'created_hidden');
 END LOOP;
END $$;
-- Renseigner uniquement les champs encore vides des fiches rapprochées.
-- Les vidéos/verifications déjà définies manuellement sont prioritaires.
UPDATE public.demons d SET
 creator=coalesce(nullif(d.creator,''),nullif(l.source->>'creator','')),
 creator_more=coalesce(nullif(d.creator_more,''),nullif(l.source->>'creator_more','')),
 verifier=coalesce(nullif(d.verifier,''),nullif(l.source->>'verifier','')),
 publisher=coalesce(nullif(d.publisher,''),nullif(l.source->>'publisher',''),''),
 video_url=coalesce(nullif(d.video_url,''),nullif(l.source->>'video_url','')),
 thumbnail_url=coalesce(nullif(d.thumbnail_url,''),nullif(l.source->>'thumbnail_url','')),
 description=coalesce(nullif(d.description,''),nullif(l.source->>'description',''))
FROM dlfr_legacy.levels l JOIN dlfr_legacy.level_links m ON m.legacy_id=l.legacy_id
WHERE d.id=m.demon_id AND m.mapping_source<>'created_hidden';
-- Records historiques. Ne jamais changer un record existant, même si sa vidéo diffère.
-- Une progression <100% n'est PAS une victoire; la date MariaDB est une date de saisie.
WITH ranked AS (
 SELECT r.*, m.demon_id,
 row_number() OVER (PARTITION BY m.demon_id, lower(trim(r.player))
   ORDER BY r.progress DESC, r.legacy_id) AS rn
 FROM dlfr_legacy.records r JOIN dlfr_legacy.level_links m ON m.legacy_id=r.old_demon_id
)
INSERT INTO public.completions(demon_id,player,video_url,progress,placement,created_at)
SELECT r.demon_id,r.player,nullif(r.source->>'video_url',''),r.progress,
       nullif(r.source->>'placement','')::integer,
       (r.source->>'created_at')::timestamp AT TIME ZONE 'UTC'
FROM ranked r WHERE r.rn=1 AND r.progress BETWEEN 1 AND 100
AND NOT EXISTS(SELECT 1 FROM public.completions c WHERE c.demon_id=r.demon_id
 AND lower(trim(c.player))=lower(trim(r.player)))
ON CONFLICT DO NOTHING;
COMMIT;
-- Audit de couverture après import.
SELECT (SELECT count(*) FROM dlfr_legacy.levels) AS archive_niveaux,
 (SELECT count(*) FROM dlfr_legacy.level_links) AS niveaux_relies,
 (SELECT count(*) FROM dlfr_legacy.records) AS archive_records,
 (SELECT count(*) FROM dlfr_legacy.records r JOIN dlfr_legacy.level_links m ON m.legacy_id=r.old_demon_id
  JOIN public.completions c ON c.demon_id=m.demon_id AND lower(trim(c.player))=lower(trim(r.player))) AS records_retrouves;

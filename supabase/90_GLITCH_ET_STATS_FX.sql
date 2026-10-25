-- V90 — Objets Glitch + lecture groupée des récompenses équipées (onglet Statistiques).
-- Pré-requis : SQL V80, V81, V82, V85 déjà exécutés.
-- Aucun impact sur les points DLFR, les achats existants ni les pièces.
BEGIN;

INSERT INTO public.dlfr_reward_catalog(item_key,label,description,emoji,category,price,active) VALUES
 ('frame_glitch','Cadre Désynchronisé','Cadre corrompu évolutif : aberration chromatique et saccades, plus violent à chaque palier.','📺','frame',1600,true),
 ('banner_glitch','GLITCH.EXE','Vitrine corrompue : scanlines, écran qui bugue et décalage RVB. Évolue avec tes défis validés.','👾','banner',2800,true)
ON CONFLICT(item_key) DO NOTHING;

-- Retourne { "player_key": [ {item_key,category,emoji,label,tier}, ... ], ... }
-- pour tous les joueurs ayant au moins un objet équipé. Lecture seule, publique,
-- même niveau d'exposition que dlfr_rewards_public (V85) mais en un seul appel.
CREATE OR REPLACE FUNCTION public.dlfr_rewards_public_bulk() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT COALESCE(jsonb_object_agg(t.player_key,t.items),'{}'::jsonb)
 FROM (
  SELECT o.player_key,
   jsonb_agg(jsonb_build_object(
    'item_key',c.item_key,'category',c.category,'emoji',c.emoji,'label',c.label,
    'tier', CASE WHEN wc.total >= 8 THEN 3 WHEN wc.total >= 3 THEN 2 ELSE 1 END
   ) ORDER BY c.category,c.item_key) AS items
  FROM public.player_profile_owners o
  JOIN public.dlfr_reward_equipped e ON e.auth_user_id=o.auth_user_id
  JOIN public.dlfr_reward_catalog c ON c.item_key=e.item_key AND c.active
  CROSS JOIN LATERAL (SELECT count(*)::int AS total FROM public.dlfr_weekly_rewards w WHERE w.auth_user_id=o.auth_user_id) wc
  GROUP BY o.player_key
 ) t;
$$;
REVOKE ALL ON FUNCTION public.dlfr_rewards_public_bulk() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_rewards_public_bulk() TO anon,authenticated;

COMMIT;

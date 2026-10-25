-- V85 — Objets prestigieux et niveaux cosmétiques calculés sur les défis déjà validés.
-- Pré-requis : SQL V80, V81, V82. Aucun changement des points officiels ni des achats existants.
BEGIN;
INSERT INTO public.dlfr_reward_catalog(item_key,label,description,emoji,category,price,active) VALUES
 ('frame_amethyst_crown','Couronne d’Améthyste','Cadre de prestige évolutif après 3 puis 8 défis réclamés.','💎','frame',750,true),
 ('banner_bloodmoon','Éclipse Sanglante','Décoration gothique rouge et sombre pour la vitrine du profil.','🌘','banner',1500,true),
 ('frame_celestial','Ascension Céleste','Cadre céleste évolutif, trois stades à débloquer.','🪽','frame',2000,true),
 ('banner_voidwalker','Voidwalker','Vitrine cosmique abyssale de prestige.','🌌','banner',3500,true)
ON CONFLICT(item_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.dlfr_rewards_public(p_player_key text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT COALESCE((
  SELECT jsonb_agg(jsonb_build_object(
    'category',c.category,'label',c.label,'emoji',c.emoji,'item_key',c.item_key,
    'tier', CASE WHEN wc.total >= 8 THEN 3 WHEN wc.total >= 3 THEN 2 ELSE 1 END,
    'tier_label', CASE WHEN wc.total >= 8 THEN 'III · Légendaire' WHEN wc.total >= 3 THEN 'II · Éveillé' ELSE 'I · Originel' END
  ))
  FROM public.player_profile_owners o
  JOIN public.dlfr_reward_equipped e ON e.auth_user_id=o.auth_user_id
  JOIN public.dlfr_reward_catalog c ON c.item_key=e.item_key AND c.active
  CROSS JOIN LATERAL (SELECT count(*)::int AS total FROM public.dlfr_weekly_rewards w WHERE w.auth_user_id=o.auth_user_id) wc
  WHERE o.player_key=p_player_key
 ),'[]'::jsonb);
$$;
REVOKE ALL ON FUNCTION public.dlfr_rewards_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_rewards_public(text) TO anon,authenticated;
COMMIT;

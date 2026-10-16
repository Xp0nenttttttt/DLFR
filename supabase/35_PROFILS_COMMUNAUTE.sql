-- DLFR 2.0 : profil communautaire, vitrine (3 niveaux), badges/titres favoris, abonnements.
-- À exécuter APRES le schéma existant. Ne modifie pas les points, classements ou complétions.
BEGIN;

CREATE TABLE IF NOT EXISTS public.dlfr_profile_preferences (
  player_key text PRIMARY KEY REFERENCES public.players(player_key) ON DELETE CASCADE,
  accent_color text NOT NULL DEFAULT '#287bba'
    CHECK (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  featured_title_id bigint REFERENCES public.profile_titles(id) ON DELETE SET NULL,
  featured_badges text[] NOT NULL DEFAULT '{}'::text[]
    CHECK (cardinality(featured_badges) <= 3),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dlfr_profile_showcase (
  player_key text NOT NULL REFERENCES public.players(player_key) ON DELETE CASCADE,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 3),
  demon_id bigint NOT NULL REFERENCES public.demons(id) ON DELETE CASCADE,
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 180),
  video_url text CHECK (video_url IS NULL OR (char_length(video_url) <= 500 AND video_url ~* '^https://[^[:space:]]+$')),
  PRIMARY KEY (player_key, slot),
  UNIQUE (player_key, demon_id)
);

CREATE TABLE IF NOT EXISTS public.dlfr_profile_follows (
  follower_key text NOT NULL REFERENCES public.players(player_key) ON DELETE CASCADE,
  followed_key text NOT NULL REFERENCES public.players(player_key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_key, followed_key),
  CHECK (follower_key <> followed_key)
);
CREATE INDEX IF NOT EXISTS dlfr_follows_followed_idx ON public.dlfr_profile_follows(followed_key);

ALTER TABLE public.dlfr_profile_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dlfr_profile_showcase ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dlfr_profile_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dlfr_pref_public_read ON public.dlfr_profile_preferences;
CREATE POLICY dlfr_pref_public_read ON public.dlfr_profile_preferences
 FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS dlfr_showcase_public_read ON public.dlfr_profile_showcase;
CREATE POLICY dlfr_showcase_public_read ON public.dlfr_profile_showcase
 FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS dlfr_follow_public_read ON public.dlfr_profile_follows;
CREATE POLICY dlfr_follow_public_read ON public.dlfr_profile_follows
 FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS dlfr_follow_self_insert ON public.dlfr_profile_follows;
CREATE POLICY dlfr_follow_self_insert ON public.dlfr_profile_follows
 FOR INSERT TO authenticated WITH CHECK (
   follower_key <> followed_key AND
   EXISTS (SELECT 1 FROM public.player_profile_owners o
           WHERE o.player_key=follower_key AND o.auth_user_id=(SELECT auth.uid()))
 );
DROP POLICY IF EXISTS dlfr_follow_self_delete ON public.dlfr_profile_follows;
CREATE POLICY dlfr_follow_self_delete ON public.dlfr_profile_follows
 FOR DELETE TO authenticated USING (
   EXISTS (SELECT 1 FROM public.player_profile_owners o
           WHERE o.player_key=follower_key AND o.auth_user_id=(SELECT auth.uid()))
 );

-- Pas d'écriture directe des préférences et vitrines depuis le client.
REVOKE ALL ON public.dlfr_profile_preferences, public.dlfr_profile_showcase, public.dlfr_profile_follows FROM anon, authenticated;
GRANT SELECT ON public.dlfr_profile_preferences, public.dlfr_profile_showcase, public.dlfr_profile_follows TO anon, authenticated;
GRANT INSERT, DELETE ON public.dlfr_profile_follows TO authenticated;

CREATE OR REPLACE FUNCTION public.dlfr_save_profile_extras(
 p_accent_color text,
 p_featured_title_id bigint,
 p_featured_badges text[],
 p_showcase jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_user uuid := (SELECT auth.uid());
 v_player text;
 v_badges text[] := COALESCE(p_featured_badges, '{}'::text[]);
 v_item jsonb;
 v_slot integer;
 v_demon bigint;
 v_caption text;
 v_video text;
 v_seen_slots integer[] := '{}'::integer[];
 v_seen_demons bigint[] := '{}'::bigint[];
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Connexion obligatoire.'; END IF;
 SELECT player_key INTO v_player FROM public.player_profile_owners
 WHERE auth_user_id = v_user LIMIT 1;
 IF v_player IS NULL THEN RAISE EXCEPTION 'Aucun profil joueur lié à ce compte.'; END IF;
 IF p_accent_color IS NULL OR p_accent_color !~ '^#[0-9a-fA-F]{6}$' THEN
   RAISE EXCEPTION 'Couleur invalide.';
 END IF;
 IF cardinality(v_badges) > 3 OR cardinality(v_badges) <> (SELECT count(DISTINCT x.val) FROM unnest(v_badges) AS x(val)) THEN
   RAISE EXCEPTION 'Choisis au maximum trois badges différents.';
 END IF;
 IF EXISTS (SELECT 1 FROM unnest(v_badges) AS b
            WHERE NOT EXISTS (
              SELECT 1 FROM public.badge_awards a
              WHERE a.player_key = v_player AND a.badge_id::text = b
            )) THEN
   RAISE EXCEPTION 'Un badge sélectionné n’appartient pas à ce profil.';
 END IF;
 IF p_featured_title_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.player_profile_titles pt JOIN public.profile_titles t ON t.id=pt.title_id
   WHERE pt.player_key=v_player AND pt.title_id=p_featured_title_id AND t.is_active=true
 ) THEN
   RAISE EXCEPTION 'Ce titre n’est pas attribué à ton profil.';
 END IF;
 IF p_showcase IS NULL OR jsonb_typeof(p_showcase) <> 'array' OR jsonb_array_length(p_showcase) > 3 THEN
   RAISE EXCEPTION 'Vitrine invalide : trois niveaux maximum.';
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_showcase) LOOP
   IF jsonb_typeof(v_item) <> 'object' OR (v_item->>'slot') !~ '^[1-3]$'
     OR (v_item->>'demon_id') !~ '^[0-9]+$' THEN
     RAISE EXCEPTION 'Entrée de vitrine invalide.';
   END IF;
   v_slot := (v_item->>'slot')::integer;
   v_demon := (v_item->>'demon_id')::bigint;
   v_caption := btrim(COALESCE(v_item->>'caption',''));
   v_video := NULLIF(btrim(COALESCE(v_item->>'video_url','')), '');
   IF v_slot = ANY(v_seen_slots) OR v_demon = ANY(v_seen_demons) THEN
     RAISE EXCEPTION 'Une position ou un niveau est en double dans la vitrine.';
   END IF;
   IF length(v_caption) > 180 OR (v_video IS NOT NULL AND (length(v_video)>500 OR v_video !~* '^https://[^[:space:]]+$')) THEN
     RAISE EXCEPTION 'Texte ou lien vidéo invalide.';
   END IF;
   IF NOT EXISTS (SELECT 1 FROM public.demons d WHERE d.id=v_demon AND d.is_public IS DISTINCT FROM false) THEN
     RAISE EXCEPTION 'Ce niveau est introuvable ou non public.';
   END IF;
   v_seen_slots := array_append(v_seen_slots,v_slot);
   v_seen_demons := array_append(v_seen_demons,v_demon);
 END LOOP;

 INSERT INTO public.dlfr_profile_preferences(player_key,accent_color,featured_title_id,featured_badges,updated_at)
 VALUES(v_player,lower(p_accent_color),p_featured_title_id,v_badges,now())
 ON CONFLICT (player_key) DO UPDATE SET
 accent_color=EXCLUDED.accent_color, featured_title_id=EXCLUDED.featured_title_id,
 featured_badges=EXCLUDED.featured_badges, updated_at=now();

 DELETE FROM public.dlfr_profile_showcase WHERE player_key=v_player;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_showcase) LOOP
   INSERT INTO public.dlfr_profile_showcase(player_key,slot,demon_id,caption,video_url)
   VALUES (v_player,(v_item->>'slot')::smallint,(v_item->>'demon_id')::bigint,
           btrim(COALESCE(v_item->>'caption','')),
           NULLIF(btrim(COALESCE(v_item->>'video_url','')), ''));
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.dlfr_save_profile_extras(text,bigint,text[],jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dlfr_save_profile_extras(text,bigint,text[],jsonb) TO authenticated;
COMMIT;

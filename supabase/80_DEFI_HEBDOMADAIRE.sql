-- DLFR V80 : défi hebdomadaire + monnaie séparée des points de classement.
-- IMPORTANT : publier un niveau par semaine avec la commande exemple en bas du fichier.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dlfr_weekly_challenges (
  week_start date PRIMARY KEY,
  demon_id bigint NOT NULL REFERENCES public.demons(id),
  reward integer NOT NULL DEFAULT 50 CHECK (reward BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (EXTRACT(ISODOW FROM week_start)=1)
);
CREATE TABLE IF NOT EXISTS public.dlfr_weekly_rewards (
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL REFERENCES public.dlfr_weekly_challenges(week_start),
  coins integer NOT NULL CHECK (coins BETWEEN 1 AND 500),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (auth_user_id,week_start)
);
ALTER TABLE public.dlfr_weekly_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dlfr_weekly_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dlfr_weekly_challenges FROM anon,authenticated;
REVOKE ALL ON public.dlfr_weekly_rewards FROM anon,authenticated;
GRANT SELECT ON public.dlfr_weekly_challenges TO anon,authenticated;
DROP POLICY IF EXISTS dlfr_weekly_public ON public.dlfr_weekly_challenges;
CREATE POLICY dlfr_weekly_public ON public.dlfr_weekly_challenges FOR SELECT TO anon,authenticated USING (week_start <= (now() AT TIME ZONE 'UTC')::date);
DROP POLICY IF EXISTS dlfr_weekly_own_rewards ON public.dlfr_weekly_rewards;
CREATE POLICY dlfr_weekly_own_rewards ON public.dlfr_weekly_rewards FOR SELECT TO authenticated USING (auth_user_id=(select auth.uid()));
CREATE OR REPLACE FUNCTION public.dlfr_weekly_status() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_week date;v_c record;v_auth uuid:=auth.uid();v_eligible boolean:=false;v_claimed boolean:=false;v_wallet bigint:=0;
BEGIN
 v_week := ((now() AT TIME ZONE 'UTC')::date - (EXTRACT(ISODOW FROM now() AT TIME ZONE 'UTC')::integer-1));
 SELECT w.week_start,w.demon_id,w.reward,d.name INTO v_c FROM public.dlfr_weekly_challenges w JOIN public.demons d ON d.id=w.demon_id WHERE w.week_start=v_week AND d.is_public=true;
 IF NOT FOUND THEN RETURN jsonb_build_object('active',false); END IF;
 IF v_auth IS NOT NULL THEN
   SELECT EXISTS(SELECT 1 FROM public.dlfr_weekly_rewards r WHERE r.auth_user_id=v_auth AND r.week_start=v_week) INTO v_claimed;
   SELECT coalesce(sum(r.coins),0) INTO v_wallet FROM public.dlfr_weekly_rewards r WHERE r.auth_user_id=v_auth;
   SELECT EXISTS(SELECT 1 FROM public.player_profile_owners o JOIN public.players p ON p.player_key=o.player_key JOIN public.completions c ON lower(btrim(c.player))=lower(btrim(p.username)) WHERE o.auth_user_id=v_auth AND c.demon_id=v_c.demon_id AND c.progress=100 AND c.created_at>=v_week::timestamptz AND c.created_at<(v_week+7)::timestamptz) INTO v_eligible;
 END IF;
 RETURN jsonb_build_object('active',true,'challenge',jsonb_build_object('demon_id',v_c.demon_id,'name',v_c.name,'reward',v_c.reward),'eligible',v_eligible,'claimed',v_claimed,'wallet',v_wallet);
END $$;
CREATE OR REPLACE FUNCTION public.dlfr_weekly_claim() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_auth uuid:=auth.uid();v_week date;v_c record;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 v_week := ((now() AT TIME ZONE 'UTC')::date - (EXTRACT(ISODOW FROM now() AT TIME ZONE 'UTC')::integer-1));
 SELECT w.demon_id,w.reward INTO v_c FROM public.dlfr_weekly_challenges w JOIN public.demons d ON d.id=w.demon_id WHERE w.week_start=v_week AND d.is_public=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aucun défi actif'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.player_profile_owners o JOIN public.players p ON p.player_key=o.player_key JOIN public.completions c ON lower(btrim(c.player))=lower(btrim(p.username)) WHERE o.auth_user_id=v_auth AND c.demon_id=v_c.demon_id AND c.progress=100 AND c.created_at>=v_week::timestamptz AND c.created_at<(v_week+7)::timestamptz) THEN RAISE EXCEPTION 'Aucune complétion à 100 %% validée cette semaine'; END IF;
 INSERT INTO public.dlfr_weekly_rewards(auth_user_id,week_start,coins) VALUES(v_auth,v_week,v_c.reward) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RAISE EXCEPTION 'Récompense déjà récupérée'; END IF;
 RETURN v_c.reward;
END $$;
REVOKE ALL ON FUNCTION public.dlfr_weekly_claim() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_weekly_claim() TO authenticated;
REVOKE ALL ON FUNCTION public.dlfr_weekly_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dlfr_weekly_status() TO anon, authenticated;
COMMIT;
-- PUBLICATION HEBDOMADAIRE (à exécuter séparément par un administrateur, en remplaçant l'ID):
-- INSERT INTO public.dlfr_weekly_challenges(week_start,demon_id,reward)
-- SELECT date_trunc('week',now() AT TIME ZONE 'UTC')::date, id, 50 FROM public.demons WHERE id = 12345 AND is_public=true
-- ON CONFLICT (week_start) DO NOTHING;

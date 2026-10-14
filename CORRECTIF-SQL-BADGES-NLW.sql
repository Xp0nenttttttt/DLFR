-- DLFR / Correction NLW : Supabase SQL Editor, a lancer une seule fois.
-- Cible la fonction deja en place (migration 11_production.sql).
-- Ne modifie ni les rangs, ni les completions, ni les badges existants.
-- Les nouvelles recompenses NLW ne pourront venir que de niveaux publics,
-- non UNRATED, non Legacy, position 151 a 99 999 999, a 100%.
BEGIN;
CREATE OR REPLACE FUNCTION public.dlfr_award_progress(p_player_key text, p_historical boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c_list integer;
  c_main integer;
  c_nlw integer;
  c_unrated integer;
  c_total integer;
  c_main_total integer;
BEGIN
  SELECT
    count(DISTINCT d.id) FILTER (WHERE NOT d.unrated AND d.position BETWEEN 1 AND 150),
    count(DISTINCT d.id) FILTER (WHERE NOT d.unrated AND d.position BETWEEN 1 AND 75),
    count(DISTINCT d.id) FILTER (
      WHERE d.unrated IS FALSE AND d.legacy IS NOT TRUE
        AND d.position BETWEEN 151 AND 99999999
    ),
    count(DISTINCT d.id) FILTER (WHERE d.unrated)
  INTO c_list, c_main, c_nlw, c_unrated
  FROM public.completions r
  JOIN public.demons d ON d.id = r.demon_id
  WHERE lower(r.player) = lower(p_player_key)
    AND r.progress = 100
    AND d.is_public IS TRUE;

  SELECT count(*), count(*) FILTER (WHERE position BETWEEN 1 AND 75)
  INTO c_total, c_main_total
  FROM public.demons
  WHERE is_public IS TRUE AND NOT unrated AND position BETWEEN 1 AND 150;

  INSERT INTO public.badge_awards(player_key,badge_id,obtained_at,origin)
  SELECT p_player_key,s.badge,
         CASE WHEN p_historical THEN NULL ELSE current_date END,
         CASE WHEN p_historical THEN 'historical' ELSE 'automatic' END
  FROM (VALUES
    ('bienvenue-club',c_list>=1), ('dix',c_list>=10),
    ('faucheur-liste',c_list>=35), ('grand-faucheur-liste',c_list>=75),
    ('bienvenue-nlw',c_nlw>=1), ('dix-nlw',c_nlw>=10),
    ('cent',c_nlw>=100), ('faucheur-nlw',c_nlw>=250),
    ('grand-faucheur-nlw',c_nlw>=500), ('nlwgod',c_nlw>=1000),
    ('unrated-premier',c_unrated>=1), ('unrated-master',c_unrated>=10),
    ('cour-grands',c_main>=1), ('demi-dieu',c_main_total=75 AND c_main>=75),
    ('god',c_total=150 AND c_list>=150)
  ) AS s(badge,earned)
  WHERE s.earned
  ON CONFLICT(player_key,badge_id) DO NOTHING;
END $$;
COMMIT;

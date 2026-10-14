-- Lecture seule : lister les fiches enregistrees qui ressemblent a un
-- credit de megacollab. Ne supprimer AUCUN joueur automatiquement.
SELECT p.player_key,p.username,p.display_name,p.has_account,p.hidden_from_stats,
 (SELECT count(*) FROM public.completions c WHERE lower(btrim(c.player))=p.player_key) AS records,
 (SELECT count(*) FROM public.player_profile_owners o WHERE o.player_key=p.player_key) AS comptes_lies
FROM public.players p
WHERE coalesce(p.display_name,p.username,p.player_key) ~* 'and[[:space:]]+more'
   OR p.player_key ~* 'and[[:space:]]+more'
ORDER BY p.player_key;

-- Credits de createurs utilises par la liste (ces textes ne sont pas
-- necessairement de vrais joueurs, et ne doivent pas generer de comptes).
SELECT d.id,d.name,d.creator,d.creator_more
FROM public.demons d
WHERE coalesce(d.creator,'') ~* 'and[[:space:]]+more'
   OR coalesce(d.creator_more,'') ~* 'and[[:space:]]+more'
ORDER BY d.position LIMIT 100;

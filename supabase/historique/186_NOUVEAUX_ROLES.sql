-- V186 (appliqué) : nouveaux noms des rôles, validés par le staff.
-- Permissions inchangées :
--   nlw            -> Helper       (NLW seulement)
--   moderator      -> List helper  (Top 150 + NLW)
--   supermoderator -> List mod     (administration du site)
--   owner          -> Owner
-- Titres affichés, sans changer les permissions (staff_roles.title) :
--   'admin'      : List mod qui est aussi admin du serveur -> affiché « Admin »
--   'moderateur' : modération du serveur Discord, permissions List helper -> affiché « Modérateur »
alter table public.staff_roles add column if not exists title text;
alter table public.staff_roles add constraint staff_roles_title_check check (title is null or title in ('admin','moderateur'));
-- public.dlfr_staff_role_label(role, title) : renvoie 'admin' / 'moderateur' / le rôle.
-- public.dlfr_staff_titles() : liste des titres (owners seulement).
-- public.dlfr_set_staff_title(user, title) : owners seulement ; Admin exige List mod, Modérateur exige List helper.
-- dlfr_public_staff_directory et dlfr_moderation_leaderboard renvoient le libellé via dlfr_staff_role_label.
-- leseulsoni : titre « Modérateur ».

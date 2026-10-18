# DLFR V52.1 - Accessibilité des demandes de fusion + diagnostic Fluxy

## Diagnostic
La migration SQL 52 **ne requiert pas d'être modérateur pour envoyer une demande**.
La RPC `dlfr_request_player_merge` exige seulement une session authentifiée et une fiche joueur appartenant au compte demandeur. Les propriétaires/supermodérateurs sont les seuls à pouvoir **valider** via `dlfr_review_player_merge_request`.

Dans la V52, `Mon profil` n'affichait aucune mention de fusion aux comptes connectés sans fiche déjà reliée. Cela donnait l'impression que la fusion était une fonction d'administration.

## Installer
- Garder la migration SQL 52 précédemment installée (NE PAS la réexécuter).
- Remplacer **uniquement** `js/app.js` et `index.html` par ceux de ce ZIP.
- Ne pas retirer `css/merge-requests.css` déjà installé en V52.
- Publier GitHub Pages, puis `Ctrl+F5`.
- Aucun fichier `assets/flags/` n'est inclus/modifié.

## Résultat
- Tout compte **connecté sans fiche liée** voit désormais une section **Demander une fusion de fiches**, qui explique le lien préalable requis et indique comment associer une fiche.
- Tout compte **connecté avec fiche liée**, modérateur ou non, a le formulaire d'envoi de demande dans Mon profil.
- Seuls les supermodérateurs/propriétaires voient les commandes de validation.
- Aucun changement des permissions côté SQL.

## Fluxy absent des statistiques
Les rôles `staff_roles` et les fiches `players` sont indépendants. Un membre de modération n'est pas automatiquement ajouté aux stats : la fiche doit être enregistrée dans `players` et non masquée via `hidden_from_stats`.

Pour déterminer l'état de Fluxy, lancer facultativement `supabase/DIAGNOSTIC_FLUXY_LECTURE_SEULE.sql` depuis Supabase SQL Editor. Il ne modifie rien.
- Aucun résultat : fiche joueur « Fluxy » inexistante (ou autre pseudo).
- `hidden_from_stats=true` : démasquer sa fiche via **Modération > Profils > Visibilité** si c'est souhaité.
- `fiche_liee_a_un_compte=false` : lier sa fiche au bon compte pour associer identité et compte.
- `role_du_compte_lie` absent alors qu'il a des permissions : contrôler quelle identité Auth possède le rôle, sans partager d'identifiants/jetons.
- Si présent/visible mais toujours absent du classement, contrôler les filtres pays/région/recherche et la règle qui masque les créateurs ayant uniquement des crédits de création sans records/vérifications.

## Limites
La fusion nécessite encore une fiche **cible liée au demandeur**. Nous ne donnons pas au navigateur le droit de choisir arbitrairement la fiche cible : c'est une protection contre la prise de contrôle de fiches. La fusion elle-même reste à vérifier en production.

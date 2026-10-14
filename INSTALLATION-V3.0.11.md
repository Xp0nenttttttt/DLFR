# DLFR V3.0.11 — Validations manuelles visibles & équipe Supabase

Patch uniquement. **Aucun fichier de drapeau, aucun fichier `config.js`, aucune suppression de données.**

## Origine des deux problèmes

1. La fonction SQL `dlfr_review_submission` pouvait approuver une soumission et enregistrer sa complétion sur un niveau AREDL déjà présent, mais masqué (`demons.is_public = false`). Ce niveau restait alors invisible sur le site. Dans ce cas, l'ancienne fonction ignorait aussi la nouvelle position choisie pour une fiche déjà existante.
2. Le bloc « Éditeurs de liste » dans `js/app.js` contenait deux noms fixes, sans consulter les rôles Supabase.

**Autres cas à connaître :** les niveaux placés après le #150 apparaissent dans l'onglet **NLW**, pas dans le Top 150. Un niveau marqué UNRATED n'apparaît que dans la vue UNRATED. Ce patch ne change pas cette séparation.

## Installation — SQL AVANT GitHub

1. **Sauvegarder** les tables `demons`, `level_submissions`, `completions`, `staff_roles`, `nlw_staff_roles`. Vérifier que les migrations jusqu'à `19_catalogue_prive_et_preuves_fr.sql` sont déjà installées.
2. Dans **Supabase → SQL Editor**, exécuter **`supabase/21_soumissions_visibilite_equipe.sql`** en une fois. Ce SQL est destiné à ta propre instance Supabase ; il ne publie aucun niveau automatiquement.
3. Copier les fichiers du patch à la racine du dépôt GitHub :
   - `index.html`
   - `js/app.js`
   - `js/production-tools.js`
4. Effectuer un commit, attendre le déploiement GitHub Pages, puis forcer un rechargement (`Ctrl + F5`).
5. Dans **Demonlist → Éditeurs de liste**, vérifier les noms : propriétaires et éditeurs généraux proviennent de `staff_roles`, membres NLW de `nlw_staff_roles`. Le nom DLFR revendiqué est privilégié ; sinon le nom visible Discord est affiché. Les UUID et emails ne sont pas affichés dans l'annuaire public.

## Réparer un niveau DÉJÀ accepté mais invisible

1. Se connecter avec un compte **propriétaire ou modérateur général**.
2. Ouvrir **Mon espace → Modération**, section **« Validations acceptées mais non visibles »**.
3. Choisir la position DLFR souhaitée et, si nécessaire, cocher le décalage des niveaux Rated suivants.
4. Cliquer **« Rendre ce niveau visible »**, puis vérifier sa fiche publique.

**La correction ne publie jamais en masse les niveaux du catalogue AREDL masqués.** Seules les soumissions individuellement approuvées peuvent être rattrapées avec confirmation explicite de la position. Une fiche déjà publique n'est pas repositionnée par ce processus.

## Tester une nouvelle soumission

1. Envoyer une soumission avec l'ID Geometry Dash et le lien vidéo.
2. Dans la modération, examiner la preuve et choisir **Rated / UNRATED** et la position lorsqu'il s'agit d'un nouveau niveau ou d'une fiche AREDL masquée.
3. Accepter puis rafraîchir : la fiche doit être visible au rang choisi.
4. Si un même ID GD est partagé par plusieurs fiches Solo/2P et que le mode n'est pas identifié sans ambiguïté, la validation s'arrête avec un message explicite plutôt que de créer un mauvais lien.

## Diagnostic en lecture seule (si un niveau ne s'affiche toujours pas)

Dans **Supabase → SQL Editor** :

```sql
SELECT s.id AS submission_id, s.level_name, s.status,
       s.demon_id, d.name AS demon_name, d.position,
       d.is_public, d.unrated, d.aredl_id
FROM public.level_submissions s
LEFT JOIN public.demons d ON d.id = s.demon_id
ORDER BY s.id DESC LIMIT 25;
```

- `status = approved`, `is_public = false` : utiliser la section de rattrapage.
- `status = approved`, `is_public = true` : vérifier le classement NLW si `position > 150`, ou la vue UNRATED si `unrated = true`.
- `status = pending` : la validation n'a pas encore été enregistrée.
- `demon_id = NULL` : soumission non liée à une fiche ; ne pas créer manuellement un doublon avant diagnostic.

## Vérifications effectuées

Syntaxe des deux JS validée via Node ; tests locaux du rendu des formulaires, des appels RPC et des protections statiques SQL réussis. **La migration SQL n'a pas été exécutée sur ta vraie instance Supabase** : commence par une seule soumission de test.

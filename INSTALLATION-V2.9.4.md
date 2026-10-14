# DLFR V2.9.4 — vidéos de vérification et premières victoires FR/BE

**Patch uniquement, basé sur V2.9.3 + site V2.8.2. Aucun fichier de drapeau dans cette archive.**

## Ce qui est ajouté

- `tools/aredl_nlw_sync.py` : conserve désormais le lien de la vidéo du **premier record FR/BE daté retrouvé**, ainsi que ceux des vérificateurs. Les informations restent séparées ; le premier record n'est pas nécessairement la première victoire historique.
- Miniatures YouTube `https://i.ytimg.com/vi/<id>/hqdefault.jpg` calculées uniquement si l'URL YouTube contient un ID valide de 11 caractères. Pour les vidéos non YouTube, le lien est conservé mais aucune miniature n'est inventée.
- CSV enrichi : `verification_video_urls`, `verification_thumbnail_urls`, `first_record_video_url`, `first_record_thumbnail_url`.
- `tools/aredl_nlw_stage_plan.py` produit `aredl-nlw-stage-media.json` en plus des autres fichiers d'aperçu, avec toutes les entrées `approved: false`.
- `tools/aredl-nlw-media-preview.html` : un lecteur **local**, pratique pour consulter les vidéos et miniatures sans importer dans Supabase. Double-clique ce HTML, puis charge `aredl-nlw-review.json` ou `aredl-nlw-stage-media.json`.
- Site : `js/nlw-media.js`, `js/app.js`, `index.html`, `css/style.css` affichent deux cartes distinctes sous la fiche du niveau : **Vérification FR/BE** et **Premier record FR/BE daté retrouvé**. Les miniatures sont cliquables et conduisent à la vidéo.

## Installer

Extrais le patch à la racine du dépôt GitHub et conserve la structure des dossiers. Remplace seulement les fichiers inclus. **Ne change pas `js/config.js`, `assets/flags/`, le fichier Excel ou les autres données.**

## Tester sur les rangs 220 à 260

1. GitHub > Actions > **AREDL NLW – aperçu FR BE** > Run workflow.
2. Mets `start_rank=220`, `end_rank=260`, `max_record_pages=25`. Pour limiter la durée, lance les lots suivants séparément : `261–280`, `281–300`, etc. Il ne faut pas réduire `max_record_pages` artificiellement : cela rendrait certaines premières victoires incertaines. Le cache existant réutilise les réponses récentes lorsque GitHub le conserve.
3. Télécharge l'artefact ; tu y trouveras `aredl-nlw-review.json`, son CSV et **`aredl-nlw-stage-media.json`**.
4. Ouvre `tools/aredl-nlw-media-preview.html` puis charge `aredl-nlw-review.json`. Vérifie les vidéos, les dates et les éventuels liens absents.

## Publication sur les fiches du site : étape volontairement manuelle

Les fiches AREDL ne sont pas encore publiées dans `public.demons` de Supabase. Ce patch **ne crée pas de niveaux publics**. Le fichier d'aperçu ne doit pas non plus être publié automatiquement.

Après vérification humaine, copie `aredl-nlw-stage-media.json` sous le nom `data/aredl-nlw-media.json` et passe **uniquement les niveaux validés** à `"approved": true`. Le site charge ce fichier facultatif et l'associe aux pages publiques existantes par `demons.level_id == gd_level_id`. Un niveau sans fiche publique ou sans identifiant GD ne peut pas afficher la vidéo avant son import approuvé. Les profils AREDL et Discord ne sont pas fusionnés.

Le site ignore les lignes encore en attente (`approved: false`) et les fiches dont les records sont incomplets. Les validations DLFR restent distinctes.

## Notes de sécurité

- Liens HTTP(S) contrôlés ; pas de HTML distant ni de lecture des clés Supabase.
- Une « première victoire » AREDL affichée signifie **le plus ancien record FR/BE daté retrouvé**, et pas une preuve absolue d'antériorité historique.
- Si la plus ancienne preuve vidéo est absente, le site n'affiche pas une vidéo plus récente à sa place.
- Les miniatures peuvent manquer si une vidéo YouTube est privée ou supprimée.

## Vérifications locales

`python -m unittest discover -s tests -p 'test_aredl_nlw_*.py' -v`

`node tests/test_nlw_media.js`

**Aucune écriture Supabase, aucun SQL exécuté, aucun drapeau remplacé.**

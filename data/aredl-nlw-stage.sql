-- DLFR V2.9.3 : INSERTION EN STAGING UNIQUEMENT (APRES VALIDATION HUMAINE)
-- Lire supabase/09_nlw_aredl_stage_OPTIONNEL.sql et appliquer la migration d'abord.
-- Ne modifie JAMAIS public.demons, public.completions ou public.players.
-- Rejouable : un badge de modération/une modification manuelle n'est pas écrasé.
SET standard_conforming_strings = on;
BEGIN;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('85612571', '6e4aa435-2b39-44c4-9788-396a98487c4d', 220, 'RUTHLESS', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"4d10b473-d9e9-4045-b369-476106e68b91","player":{"aredl_player_id":"0cf6541f-cbf3-447d-a085-4facf8f46eb5","name":"nei","country":"FR"},"completed_at":"2023-04-24T19:34:17+00:00","video_url":"https://www.youtube.com/watch?v=1nH-LccRhug","thumbnail_url":"https://i.ytimg.com/vi/1nH-LccRhug/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":40,"unresolved_verifiers":[{"name":"vaen","aredl_player_id":"108b46be-a0b8-4c7e-8abd-f62706326387","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"4d10b473-d9e9-4045-b369-476106e68b91","player":{"aredl_player_id":"0cf6541f-cbf3-447d-a085-4facf8f46eb5","name":"nei","country":"FR"},"completed_at":"2023-04-24T19:34:17+00:00","video_url":"https://www.youtube.com/watch?v=1nH-LccRhug","thumbnail_url":"https://i.ytimg.com/vi/1nH-LccRhug/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"6e4aa435-2b39-44c4-9788-396a98487c4d","gd_level_id":"85612571","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('68654380', '19ffe591-18d5-4544-98ac-181c1dea8338', 221, 'Omega Interface', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"49678dec-a2c2-4a7a-833f-6f909866fa55","player":{"aredl_player_id":"0cf6541f-cbf3-447d-a085-4facf8f46eb5","name":"nei","country":"FR"},"completed_at":"2022-10-30T15:25:18+00:00","video_url":"https://www.youtube.com/watch?v=Xbknfe9flKI","thumbnail_url":"https://i.ytimg.com/vi/Xbknfe9flKI/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":232,"unresolved_verifiers":[{"name":"RG","aredl_player_id":"ee929703-1b7b-494b-b292-f12e7e88c130","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"49678dec-a2c2-4a7a-833f-6f909866fa55","player":{"aredl_player_id":"0cf6541f-cbf3-447d-a085-4facf8f46eb5","name":"nei","country":"FR"},"completed_at":"2022-10-30T15:25:18+00:00","video_url":"https://www.youtube.com/watch?v=Xbknfe9flKI","thumbnail_url":"https://i.ytimg.com/vi/Xbknfe9flKI/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"first_dated_record","record_id":"a3a38903-ec6d-4741-841e-114ac28f5ef4","player":{"aredl_player_id":"8d6c8c6b-d62d-46b4-ab08-fe01f9aa7ba0","name":"cavedjv","country":"BE"},"completed_at":"2025-09-01T21:15:51+00:00","video_url":"https://www.youtube.com/watch?v=Jf6m3cQUe2g","thumbnail_url":"https://i.ytimg.com/vi/Jf6m3cQUe2g/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"aredl_id":"19ffe591-18d5-4544-98ac-181c1dea8338","gd_level_id":"68654380","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('90891227', '43ea5df1-d4fc-46d8-9b2b-ca3603214637', 222, 'Coral Cave', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"4a9f4d14-1efa-42a0-94e7-fdb0a0eb93ba","player":{"aredl_player_id":"73e83aa7-3dd9-4376-8b58-c46ca8af3627","name":"coubitic 🍫","country":"FR"},"completed_at":"2024-03-23T15:57:08+00:00","video_url":"https://www.youtube.com/watch?v=HnLKPeqn-Qo","thumbnail_url":"https://i.ytimg.com/vi/HnLKPeqn-Qo/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":104,"unresolved_verifiers":[{"name":"Gnamolor","aredl_player_id":"decb742e-ae06-4867-bfde-e84ad2bb025f","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"4a9f4d14-1efa-42a0-94e7-fdb0a0eb93ba","player":{"aredl_player_id":"73e83aa7-3dd9-4376-8b58-c46ca8af3627","name":"coubitic 🍫","country":"FR"},"completed_at":"2024-03-23T15:57:08+00:00","video_url":"https://www.youtube.com/watch?v=HnLKPeqn-Qo","thumbnail_url":"https://i.ytimg.com/vi/HnLKPeqn-Qo/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"43ea5df1-d4fc-46d8-9b2b-ca3603214637","gd_level_id":"90891227","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('144845980', 'e8c10226-96df-4139-94cb-b09758444ce2', 223, 'DOUBLE DYNAMO (Solo)', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":4,"unresolved_verifiers":[{"name":"Whizkid05","aredl_player_id":"af57c25a-4877-4223-b8b6-b89b917e4359","reason":"pays non confirmé"}],"first_fr":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"e8c10226-96df-4139-94cb-b09758444ce2","gd_level_id":"144845980","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('85426437', '69e600b5-1889-44dc-922b-fe4f66fca797', 224, 'Launchpad Labyrinth', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"78c5ac96-295f-44a3-b2fe-bc266893bbe3","player":{"aredl_player_id":"73e83aa7-3dd9-4376-8b58-c46ca8af3627","name":"coubitic 🍫","country":"FR"},"completed_at":"2024-09-23T18:01:28+00:00","video_url":"https://www.youtube.com/watch?v=h4iy30nCy6g","thumbnail_url":"https://i.ytimg.com/vi/h4iy30nCy6g/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":42,"unresolved_verifiers":[{"name":"skzyl","aredl_player_id":"698b64fc-0c11-4d8c-8cdf-3e4f213fd29c","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"78c5ac96-295f-44a3-b2fe-bc266893bbe3","player":{"aredl_player_id":"73e83aa7-3dd9-4376-8b58-c46ca8af3627","name":"coubitic 🍫","country":"FR"},"completed_at":"2024-09-23T18:01:28+00:00","video_url":"https://www.youtube.com/watch?v=h4iy30nCy6g","thumbnail_url":"https://i.ytimg.com/vi/h4iy30nCy6g/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"69e600b5-1889-44dc-922b-fe4f66fca797","gd_level_id":"85426437","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('127336234', '93c30030-8c59-412f-8b3d-dcb280d2df55', 225, 'obsession', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":4,"unresolved_verifiers":[{"name":"Zeronium","aredl_player_id":"b3a8d110-d1c3-4bd1-b803-18fb8719231a","reason":"pays non confirmé"}],"first_fr":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"93c30030-8c59-412f-8b3d-dcb280d2df55","gd_level_id":"127336234","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('64100176', '7cc25551-d5d3-40d3-b4f6-420e4c9110d0', 226, 'Tenkai (Solo)', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":11,"unresolved_verifiers":[{"name":"Motor8","aredl_player_id":"a6da5717-62fe-4f15-91ab-f570dc52d08c","reason":"pays non confirmé"}],"first_fr":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"7cc25551-d5d3-40d3-b4f6-420e4c9110d0","gd_level_id":"64100176","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('57571983', '90ff0da8-1c4b-4ae0-8cb0-41b78cbc3327', 227, 'SUPERHATEMEWORLD', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"9192f83a-b755-4c1b-8ae9-91b6dfe0cd0c","player":{"aredl_player_id":"0cf6541f-cbf3-447d-a085-4facf8f46eb5","name":"nei","country":"FR"},"completed_at":"2024-03-23T10:33:42+00:00","video_url":"https://www.youtube.com/watch?v=x38UX7k3lHs","thumbnail_url":"https://i.ytimg.com/vi/x38UX7k3lHs/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":239,"unresolved_verifiers":[{"name":"Cursed","aredl_player_id":"93553653-af79-456e-ba66-abc82becd2e5","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"9192f83a-b755-4c1b-8ae9-91b6dfe0cd0c","player":{"aredl_player_id":"0cf6541f-cbf3-447d-a085-4facf8f46eb5","name":"nei","country":"FR"},"completed_at":"2024-03-23T10:33:42+00:00","video_url":"https://www.youtube.com/watch?v=x38UX7k3lHs","thumbnail_url":"https://i.ytimg.com/vi/x38UX7k3lHs/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"90ff0da8-1c4b-4ae0-8cb0-41b78cbc3327","gd_level_id":"57571983","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('58150142', '9cd69551-5af8-4ba2-bf38-36dab4a58ccc', 228, 'Akashic Records', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"39d29767-9441-419b-b79d-2a3e25eef961","player":{"aredl_player_id":"09896c69-dbd9-440b-9a6f-cdfa650c308c","name":"rose;","country":"FR"},"completed_at":"2023-02-13T22:09:07+00:00","video_url":"https://www.youtube.com/watch?v=_tb7erPMiho","thumbnail_url":"https://i.ytimg.com/vi/_tb7erPMiho/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":55,"unresolved_verifiers":[{"name":"VoTcHi","aredl_player_id":"8337f139-e06a-4588-82ee-f0f010a813db","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"39d29767-9441-419b-b79d-2a3e25eef961","player":{"aredl_player_id":"09896c69-dbd9-440b-9a6f-cdfa650c308c","name":"rose;","country":"FR"},"completed_at":"2023-02-13T22:09:07+00:00","video_url":"https://www.youtube.com/watch?v=_tb7erPMiho","thumbnail_url":"https://i.ytimg.com/vi/_tb7erPMiho/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"9cd69551-5af8-4ba2-bf38-36dab4a58ccc","gd_level_id":"58150142","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('91042484', 'dca1d324-90a4-431d-9bc8-07a934835a5d', 229, 'Sides Of My Mind (Solo)', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":17,"unresolved_verifiers":[{"name":"Rqd","aredl_player_id":"65a40c8b-01c8-4c7e-8e21-b178a2cf6258","reason":"pays non confirmé"}],"first_fr":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"dca1d324-90a4-431d-9bc8-07a934835a5d","gd_level_id":"91042484","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('85670310', '0bbbbb10-a47d-4cab-ae1d-94a50696651c', 230, 'Horros (Solo)', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":17,"unresolved_verifiers":[{"name":"Ryclix","aredl_player_id":"51aa75fc-f8c4-48ba-8409-3d598a65c8ab","reason":"pays non confirmé"}],"first_fr":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"0bbbbb10-a47d-4cab-ae1d-94a50696651c","gd_level_id":"85670310","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('104464785', '973cb151-6642-4a06-a0dd-4e26f8a1404d', 231, 'Ykds1479ymdppr', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"137bbc46-38a1-4f16-94f7-89eac095eeeb","player":{"aredl_player_id":"3bf1197c-17da-4a72-9bcf-9c9004e7a415","name":"Lonox","country":"FR"},"completed_at":"2026-09-29T06:55:53+00:00","video_url":"https://www.youtube.com/watch?v=LInbPh9DMw8","thumbnail_url":"https://i.ytimg.com/vi/LInbPh9DMw8/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":40,"unresolved_verifiers":[{"name":"BONN GD","aredl_player_id":"e74c39f4-0598-4fd1-a1d5-e193d849536f","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"137bbc46-38a1-4f16-94f7-89eac095eeeb","player":{"aredl_player_id":"3bf1197c-17da-4a72-9bcf-9c9004e7a415","name":"Lonox","country":"FR"},"completed_at":"2026-09-29T06:55:53+00:00","video_url":"https://www.youtube.com/watch?v=LInbPh9DMw8","thumbnail_url":"https://i.ytimg.com/vi/LInbPh9DMw8/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"973cb151-6642-4a06-a0dd-4e26f8a1404d","gd_level_id":"104464785","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('55624478', 'e9d6b403-32df-446a-be0c-a9f5af4a6937', 232, 'Ragnarok', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"56932b68-7f44-40fb-b31a-6b7079e41de5","player":{"aredl_player_id":"8f45a062-dd10-488c-b0ca-4a8078e0bb2f","name":"Twister21","country":"FR"},"completed_at":"2023-02-12T21:35:32+00:00","video_url":"https://www.youtube.com/watch?v=3Sqizxikdy4","thumbnail_url":"https://i.ytimg.com/vi/3Sqizxikdy4/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":164,"unresolved_verifiers":[{"name":"Technical","aredl_player_id":"989f4be5-d5b5-4f50-a341-fb50827c7905","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"56932b68-7f44-40fb-b31a-6b7079e41de5","player":{"aredl_player_id":"8f45a062-dd10-488c-b0ca-4a8078e0bb2f","name":"Twister21","country":"FR"},"completed_at":"2023-02-12T21:35:32+00:00","video_url":"https://www.youtube.com/watch?v=3Sqizxikdy4","thumbnail_url":"https://i.ytimg.com/vi/3Sqizxikdy4/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"first_dated_record","record_id":"a707a8b1-b4e7-4cc2-a0b2-99963644cc53","player":{"aredl_player_id":"dbddf154-6088-476a-a2b1-db571fa8784b","name":"Arveal","country":"BE"},"completed_at":"2023-03-01T17:50:31+00:00","video_url":"https://www.youtube.com/watch?v=EgHV2TVXk9U","thumbnail_url":"https://i.ytimg.com/vi/EgHV2TVXk9U/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"aredl_id":"e9d6b403-32df-446a-be0c-a9f5af4a6937","gd_level_id":"55624478","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('93281587', '1e6f8f99-ff7f-4eb6-aa44-c39247c905c9', 233, 'me when machine gang (Solo)', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":13,"unresolved_verifiers":[{"name":"Motor8","aredl_player_id":"a6da5717-62fe-4f15-91ab-f570dc52d08c","reason":"pays non confirmé"}],"first_fr":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"1e6f8f99-ff7f-4eb6-aa44-c39247c905c9","gd_level_id":"93281587","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('92583725', 'c5912ba1-5bd5-496b-b0ab-c5215a0360e5', 234, 'Pandemonium (Cersia)', 'NO_DLFR_EXPORT_REVIEW', '[{"player":{"aredl_player_id":"f3f97518-649b-473e-91f5-726c9b412fe3","name":"TGM05","country":"FR"},"video_url":"https://www.youtube.com/watch?v=OKEHsJPaeQY","thumbnail_url":"https://i.ytimg.com/vi/OKEHsJPaeQY/hqdefault.jpg","verification_id":"6df59b8f-772b-4099-a3c6-ec235c8b61d5","achieved_at":"2023-07-18T18:23:35+00:00"}]'::jsonb, '{"status":"first_dated_record","record_id":"6df59b8f-772b-4099-a3c6-ec235c8b61d5","player":{"aredl_player_id":"f3f97518-649b-473e-91f5-726c9b412fe3","name":"TGM05","country":"FR"},"completed_at":"2023-07-18T18:23:35+00:00","video_url":"https://www.youtube.com/watch?v=OKEHsJPaeQY","thumbnail_url":"https://i.ytimg.com/vi/OKEHsJPaeQY/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":14,"unresolved_verifiers":[],"first_fr":{"status":"first_dated_record","record_id":"6df59b8f-772b-4099-a3c6-ec235c8b61d5","player":{"aredl_player_id":"f3f97518-649b-473e-91f5-726c9b412fe3","name":"TGM05","country":"FR"},"completed_at":"2023-07-18T18:23:35+00:00","video_url":"https://www.youtube.com/watch?v=OKEHsJPaeQY","thumbnail_url":"https://i.ytimg.com/vi/OKEHsJPaeQY/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"c5912ba1-5bd5-496b-b0ab-c5215a0360e5","gd_level_id":"92583725","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('82606722', 'd1faed56-a544-4ada-bd14-b04cb14959f6', 235, 'The Art of the Blade', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"ef4fed44-1fde-46a7-90c1-a834c5aee766","player":{"aredl_player_id":"e2916d23-40ef-48b5-a692-4c0933bcc7d7","name":"GDonut","country":"FR"},"completed_at":"2025-08-26T16:43:52+00:00","video_url":"https://www.youtube.com/watch?v=jw8vdB__XXY","thumbnail_url":"https://i.ytimg.com/vi/jw8vdB__XXY/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":44,"unresolved_verifiers":[{"name":"kyoto","aredl_player_id":"7d6e3cd7-a061-4e97-b4a4-dc6375fdae34","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"ef4fed44-1fde-46a7-90c1-a834c5aee766","player":{"aredl_player_id":"e2916d23-40ef-48b5-a692-4c0933bcc7d7","name":"GDonut","country":"FR"},"completed_at":"2025-08-26T16:43:52+00:00","video_url":"https://www.youtube.com/watch?v=jw8vdB__XXY","thumbnail_url":"https://i.ytimg.com/vi/jw8vdB__XXY/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"d1faed56-a544-4ada-bd14-b04cb14959f6","gd_level_id":"82606722","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('77518059', '93e6b9e1-4bef-4cd3-876d-b15575cf48e1', 236, 'Descent Into Exile', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"1457c1e3-1318-4195-b21f-698c1994b0fe","player":{"aredl_player_id":"f3f97518-649b-473e-91f5-726c9b412fe3","name":"TGM05","country":"FR"},"completed_at":"2022-12-26T17:43:00+00:00","video_url":"https://www.youtube.com/watch?v=wqAPYwszE5Y","thumbnail_url":"https://i.ytimg.com/vi/wqAPYwszE5Y/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":62,"unresolved_verifiers":[{"name":"BGram","aredl_player_id":"92571fc5-0b49-4801-9d5e-98b22d0e05b9","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"1457c1e3-1318-4195-b21f-698c1994b0fe","player":{"aredl_player_id":"f3f97518-649b-473e-91f5-726c9b412fe3","name":"TGM05","country":"FR"},"completed_at":"2022-12-26T17:43:00+00:00","video_url":"https://www.youtube.com/watch?v=wqAPYwszE5Y","thumbnail_url":"https://i.ytimg.com/vi/wqAPYwszE5Y/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"93e6b9e1-4bef-4cd3-876d-b15575cf48e1","gd_level_id":"77518059","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('96383663', '1f42a361-5393-4a82-b172-2c34aeb945c1', 237, 'Deep Bass', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"7d92edd8-8ea9-492f-b6a2-f38e0868491e","player":{"aredl_player_id":"37da3702-72fb-4ebd-889d-2f8e3388c8ad","name":"bluud","country":"FR"},"completed_at":"2026-05-03T00:28:56+00:00","video_url":"https://www.youtube.com/watch?v=aZYNOKbUHqI","thumbnail_url":"https://i.ytimg.com/vi/aZYNOKbUHqI/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":38,"unresolved_verifiers":[{"name":"WatchPiggy","aredl_player_id":"bfd259f3-3879-4066-a682-4b2c0b27f3f8","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"7d92edd8-8ea9-492f-b6a2-f38e0868491e","player":{"aredl_player_id":"37da3702-72fb-4ebd-889d-2f8e3388c8ad","name":"bluud","country":"FR"},"completed_at":"2026-05-03T00:28:56+00:00","video_url":"https://www.youtube.com/watch?v=aZYNOKbUHqI","thumbnail_url":"https://i.ytimg.com/vi/aZYNOKbUHqI/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"1f42a361-5393-4a82-b172-2c34aeb945c1","gd_level_id":"96383663","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('95675702', 'ec3bae3b-5d2e-4d1f-8d46-8fed679800ff', 238, 'Amalgam', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"e87e06a3-247c-4601-8745-93f3633d7312","player":{"aredl_player_id":"e2916d23-40ef-48b5-a692-4c0933bcc7d7","name":"GDonut","country":"FR"},"completed_at":"2024-02-20T22:16:39+00:00","video_url":"https://www.youtube.com/watch?v=tf6E-TpIJxw","thumbnail_url":"https://i.ytimg.com/vi/tf6E-TpIJxw/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":113,"unresolved_verifiers":[{"name":"rWooshi","aredl_player_id":"521d1930-9b23-4040-9917-ddad4562510e","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"e87e06a3-247c-4601-8745-93f3633d7312","player":{"aredl_player_id":"e2916d23-40ef-48b5-a692-4c0933bcc7d7","name":"GDonut","country":"FR"},"completed_at":"2024-02-20T22:16:39+00:00","video_url":"https://www.youtube.com/watch?v=tf6E-TpIJxw","thumbnail_url":"https://i.ytimg.com/vi/tf6E-TpIJxw/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"ec3bae3b-5d2e-4d1f-8d46-8fed679800ff","gd_level_id":"95675702","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('57828784', '13d6c568-e6db-47b4-9449-e9ca8a6095c9', 239, 'The Rupture', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"76dab47a-46b7-4bdd-b42a-0b782ba147f1","player":{"aredl_player_id":"e2916d23-40ef-48b5-a692-4c0933bcc7d7","name":"GDonut","country":"FR"},"completed_at":"2021-05-25T09:49:38+00:00","video_url":"https://www.youtube.com/watch?v=KrcbPo5pmMc","thumbnail_url":"https://i.ytimg.com/vi/KrcbPo5pmMc/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":158,"unresolved_verifiers":[{"name":"-","aredl_player_id":"be18a588-6ac4-4368-aaef-2b98c6f046e8","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"76dab47a-46b7-4bdd-b42a-0b782ba147f1","player":{"aredl_player_id":"e2916d23-40ef-48b5-a692-4c0933bcc7d7","name":"GDonut","country":"FR"},"completed_at":"2021-05-25T09:49:38+00:00","video_url":"https://www.youtube.com/watch?v=KrcbPo5pmMc","thumbnail_url":"https://i.ytimg.com/vi/KrcbPo5pmMc/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"13d6c568-e6db-47b4-9449-e9ca8a6095c9","gd_level_id":"57828784","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('92466083', 'a6fda692-bfde-4122-b032-f35df420cb87', 240, 'Jupiter My Favourite', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"84228f71-8bac-4c5e-94ca-0dd434340151","player":{"aredl_player_id":"a98c8d52-918d-482c-b79e-6b9f58df9e5a","name":"Chat0mix","country":"BE"},"completed_at":"2025-04-29T19:54:26+00:00","video_url":"https://drive.google.com/file/d/1bS5Umzi4i9wKMPuFeVxf7Mclw5yANtq6","thumbnail_url":null,"note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":32,"unresolved_verifiers":[{"name":"-","aredl_player_id":"e10a7ec1-586e-4ec8-9956-4dd4aabc6d00","reason":"pays non confirmé"}],"first_fr":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"first_be":{"status":"first_dated_record","record_id":"84228f71-8bac-4c5e-94ca-0dd434340151","player":{"aredl_player_id":"a98c8d52-918d-482c-b79e-6b9f58df9e5a","name":"Chat0mix","country":"BE"},"completed_at":"2025-04-29T19:54:26+00:00","video_url":"https://drive.google.com/file/d/1bS5Umzi4i9wKMPuFeVxf7Mclw5yANtq6","thumbnail_url":null,"note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"aredl_id":"a6fda692-bfde-4122-b032-f35df420cb87","gd_level_id":"92466083","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('127092681', '9c15af43-c2a7-497f-9baa-ac4e7734484f', 241, 'Secret', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":4,"unresolved_verifiers":[{"name":"DNM121","aredl_player_id":"4d27e767-56bb-4741-b22f-2a7b2bc303f0","reason":"pays non confirmé"}],"first_fr":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"9c15af43-c2a7-497f-9baa-ac4e7734484f","gd_level_id":"127092681","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('128549587', 'f1f985f2-2e42-409e-a891-2607010bd6e4', 242, 'Magic', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":2,"unresolved_verifiers":[{"name":"nac","aredl_player_id":"6779abea-8878-4f9a-942e-fa174f837c3e","reason":"pays non confirmé"}],"first_fr":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"f1f985f2-2e42-409e-a891-2607010bd6e4","gd_level_id":"128549587","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('68600127', '9bfdc11a-7f8c-403e-9fd6-14ad190ae543', 243, 'Silent Club', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":90,"unresolved_verifiers":[{"name":"Luqualizer","aredl_player_id":"a22730f3-b867-4c59-9f9e-fe6042300757","reason":"pays non confirmé"}],"first_fr":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"9bfdc11a-7f8c-403e-9fd6-14ad190ae543","gd_level_id":"68600127","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('59800588', 'ed79ec06-0f20-41bb-b562-898e2cd4777f', 244, 'Kappa', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"3f0498bf-8469-46a2-9dad-2ec0f11f4b11","player":{"aredl_player_id":"f3f97518-649b-473e-91f5-726c9b412fe3","name":"TGM05","country":"FR"},"completed_at":"2022-01-18T15:37:39+00:00","video_url":"https://www.youtube.com/watch?v=nGHzLSoUfL0","thumbnail_url":"https://i.ytimg.com/vi/nGHzLSoUfL0/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":77,"unresolved_verifiers":[{"name":"nSwish","aredl_player_id":"c08944ce-3d77-4630-91de-73cfbfda5585","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"3f0498bf-8469-46a2-9dad-2ec0f11f4b11","player":{"aredl_player_id":"f3f97518-649b-473e-91f5-726c9b412fe3","name":"TGM05","country":"FR"},"completed_at":"2022-01-18T15:37:39+00:00","video_url":"https://www.youtube.com/watch?v=nGHzLSoUfL0","thumbnail_url":"https://i.ytimg.com/vi/nGHzLSoUfL0/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"ed79ec06-0f20-41bb-b562-898e2cd4777f","gd_level_id":"59800588","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('127975974', 'ccfefc6c-63e4-4f77-83d1-0e3b6a5103d7', 245, 'Porridge Factory', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"296a25ad-dbe9-4bed-beda-0c92994a768d","player":{"aredl_player_id":"77320b96-f510-480b-89ee-a7b891d69294","name":"SevenTrack","country":"FR"},"completed_at":"2026-05-31T15:17:21+00:00","video_url":"https://www.youtube.com/watch?v=Y2v4Tl6D1q8","thumbnail_url":"https://i.ytimg.com/vi/Y2v4Tl6D1q8/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":27,"unresolved_verifiers":[{"name":"GDFluxit","aredl_player_id":"a83ce3ac-ebd4-453b-b3f2-07a916b4dc09","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"296a25ad-dbe9-4bed-beda-0c92994a768d","player":{"aredl_player_id":"77320b96-f510-480b-89ee-a7b891d69294","name":"SevenTrack","country":"FR"},"completed_at":"2026-05-31T15:17:21+00:00","video_url":"https://www.youtube.com/watch?v=Y2v4Tl6D1q8","thumbnail_url":"https://i.ytimg.com/vi/Y2v4Tl6D1q8/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"ccfefc6c-63e4-4f77-83d1-0e3b6a5103d7","gd_level_id":"127975974","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('84507862', 'aa76f56a-e2c2-4aab-af9e-ea212a8efc14', 246, 'no jokes', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"2802fbe3-a03f-4b5d-885e-774eaea207bf","player":{"aredl_player_id":"0cf6541f-cbf3-447d-a085-4facf8f46eb5","name":"nei","country":"FR"},"completed_at":"2022-11-05T16:38:37+00:00","video_url":"https://www.youtube.com/watch?v=Utg4OSpl100","thumbnail_url":"https://i.ytimg.com/vi/Utg4OSpl100/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":107,"unresolved_verifiers":[{"name":"Zeronium","aredl_player_id":"b3a8d110-d1c3-4bd1-b803-18fb8719231a","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"2802fbe3-a03f-4b5d-885e-774eaea207bf","player":{"aredl_player_id":"0cf6541f-cbf3-447d-a085-4facf8f46eb5","name":"nei","country":"FR"},"completed_at":"2022-11-05T16:38:37+00:00","video_url":"https://www.youtube.com/watch?v=Utg4OSpl100","thumbnail_url":"https://i.ytimg.com/vi/Utg4OSpl100/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"aa76f56a-e2c2-4aab-af9e-ea212a8efc14","gd_level_id":"84507862","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('103373693', '6407dc1b-73a0-4a69-acb9-94d7af725253', 247, 'FARBIDI THEORY', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":25,"unresolved_verifiers":[{"name":"WatchPiggy","aredl_player_id":"bfd259f3-3879-4066-a682-4b2c0b27f3f8","reason":"pays non confirmé"}],"first_fr":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"6407dc1b-73a0-4a69-acb9-94d7af725253","gd_level_id":"103373693","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('124037637', '1134ab5e-1d06-46c5-9682-5738393eabe7', 248, 'Bloom', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":10,"unresolved_verifiers":[{"name":"zodycoder","aredl_player_id":"0ef5cd7f-91f2-4a2a-8aff-638c1118b72d","reason":"pays non confirmé"}],"first_fr":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"1134ab5e-1d06-46c5-9682-5738393eabe7","gd_level_id":"124037637","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('113750365', 'd961c3f9-9889-4f71-ba1a-38135210f988', 249, 'BIRD MACHINE LANDS', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":2,"unresolved_verifiers":[{"name":"bims","aredl_player_id":"ffba97e8-fb0b-4ee8-887a-d258141b0e89","reason":"pays non confirmé"}],"first_fr":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"d961c3f9-9889-4f71-ba1a-38135210f988","gd_level_id":"113750365","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('103947139', 'e790f26a-5eac-4fd4-972f-fd2501fa03ef', 250, 'LD50', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"3bbe0b7c-858e-45ac-94c5-8372fd3a9af3","player":{"aredl_player_id":"3f29f4ce-baea-457b-bd3c-75adefdf4538","name":"Nim","country":"FR"},"completed_at":"2026-05-28T21:31:01+00:00","video_url":"https://www.youtube.com/watch?v=58gYhsto11k","thumbnail_url":"https://i.ytimg.com/vi/58gYhsto11k/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":33,"unresolved_verifiers":[{"name":"Blitzer","aredl_player_id":"cb91e535-25de-44dc-8e77-fd417a660b14","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"3bbe0b7c-858e-45ac-94c5-8372fd3a9af3","player":{"aredl_player_id":"3f29f4ce-baea-457b-bd3c-75adefdf4538","name":"Nim","country":"FR"},"completed_at":"2026-05-28T21:31:01+00:00","video_url":"https://www.youtube.com/watch?v=58gYhsto11k","thumbnail_url":"https://i.ytimg.com/vi/58gYhsto11k/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"e790f26a-5eac-4fd4-972f-fd2501fa03ef","gd_level_id":"103947139","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('133286223', 'c317c350-1675-4581-906e-cd82a77c8812', 251, 'the ocean of fish', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":8,"unresolved_verifiers":[{"name":"shmigels","aredl_player_id":"fcb537aa-ed63-48eb-87cd-d8674971ccbf","reason":"pays non confirmé"}],"first_fr":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"c317c350-1675-4581-906e-cd82a77c8812","gd_level_id":"133286223","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('98284764', '71c6464a-3747-482e-91ce-51df59887415', 252, 'DsinK', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":14,"unresolved_verifiers":[{"name":"Laurendi","aredl_player_id":"20882c33-e426-461b-8d00-9606458b28c6","reason":"pays non confirmé"},{"name":"fusion425","aredl_player_id":"74fe2a05-eea2-4f45-b333-9e9b0443376b","reason":"pays non confirmé"}],"first_fr":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"71c6464a-3747-482e-91ce-51df59887415","gd_level_id":"98284764","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('110965084', '316a1e15-9e9c-4e07-9e92-aa413334f4ea', 253, 'Nabil Let Go', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":18,"unresolved_verifiers":[{"name":"-","aredl_player_id":"b81203d1-b710-445c-8e10-08762bcfc633","reason":"pays non confirmé"}],"first_fr":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"316a1e15-9e9c-4e07-9e92-aa413334f4ea","gd_level_id":"110965084","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('102712028', '1b1e51b9-df2f-4e74-ae29-056c0c4b6278', 254, 'BarbarosFinaleFinale', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"4d1ffa02-56a7-4bcd-b7ca-db0b0cb5ed5d","player":{"aredl_player_id":"f32df19e-3d88-4eef-96db-c9a054cc40b7","name":"Azin","country":"FR"},"completed_at":"2024-12-12T15:04:23+00:00","video_url":"https://www.youtube.com/watch?v=7EGLVe9oGhw","thumbnail_url":"https://i.ytimg.com/vi/7EGLVe9oGhw/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":23,"unresolved_verifiers":[{"name":"aeonair","aredl_player_id":"1728ba49-161f-44da-b95b-b5e1cf0cb720","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"4d1ffa02-56a7-4bcd-b7ca-db0b0cb5ed5d","player":{"aredl_player_id":"f32df19e-3d88-4eef-96db-c9a054cc40b7","name":"Azin","country":"FR"},"completed_at":"2024-12-12T15:04:23+00:00","video_url":"https://www.youtube.com/watch?v=7EGLVe9oGhw","thumbnail_url":"https://i.ytimg.com/vi/7EGLVe9oGhw/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"1b1e51b9-df2f-4e74-ae29-056c0c4b6278","gd_level_id":"102712028","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('112351854', 'e587fa0d-1b99-4947-942a-2585e7e52518', 255, 'Sank', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":10,"unresolved_verifiers":[{"name":"Water","aredl_player_id":"00c8ce48-bf7a-4511-be8f-09f9936a4b44","reason":"pays non confirmé"}],"first_fr":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"e587fa0d-1b99-4947-942a-2585e7e52518","gd_level_id":"112351854","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('60870688', 'd9c8b172-354a-4e72-8e7c-8df928ad05d8', 256, 'Asterios', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":21,"unresolved_verifiers":[{"name":"Atomic","aredl_player_id":"9402b3bc-b04e-4d2a-9bad-8ff0548e110f","reason":"pays non confirmé"}],"first_fr":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"d9c8b172-354a-4e72-8e7c-8df928ad05d8","gd_level_id":"60870688","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('42584142', 'ac32ce18-110e-4749-b806-1900b9e3bc7a', 257, 'Bloodlust', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"24c706cf-813f-4298-92fb-396bec08813f","player":{"aredl_player_id":"f3f97518-649b-473e-91f5-726c9b412fe3","name":"TGM05","country":"FR"},"completed_at":"2021-07-20T17:07:21+00:00","video_url":"https://www.youtube.com/watch?v=vQ0xOqJ_jgo","thumbnail_url":"https://i.ytimg.com/vi/vQ0xOqJ_jgo/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":846,"unresolved_verifiers":[{"name":"knobbelboy","aredl_player_id":"a8f6e413-08e5-4ce3-adab-b65cf95fb357","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"24c706cf-813f-4298-92fb-396bec08813f","player":{"aredl_player_id":"f3f97518-649b-473e-91f5-726c9b412fe3","name":"TGM05","country":"FR"},"completed_at":"2021-07-20T17:07:21+00:00","video_url":"https://www.youtube.com/watch?v=vQ0xOqJ_jgo","thumbnail_url":"https://i.ytimg.com/vi/vQ0xOqJ_jgo/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"first_dated_record","record_id":"d9d5cd3a-a77f-4d8a-8966-d36721be0858","player":{"aredl_player_id":"dbddf154-6088-476a-a2b1-db571fa8784b","name":"Arveal","country":"BE"},"completed_at":"2022-02-25T12:00:12+00:00","video_url":"https://www.youtube.com/watch?v=Ysg7vG3ny90","thumbnail_url":"https://i.ytimg.com/vi/Ysg7vG3ny90/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"aredl_id":"ac32ce18-110e-4749-b806-1900b9e3bc7a","gd_level_id":"42584142","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('90420966', 'a454218a-1fab-4485-a760-c0da1bfb80b4', 258, 'Escape Room', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"7feac3e5-b2ae-4f0f-b273-00d41397ae2f","player":{"aredl_player_id":"0cf6541f-cbf3-447d-a085-4facf8f46eb5","name":"nei","country":"FR"},"completed_at":"2023-08-14T21:25:09+00:00","video_url":"https://www.youtube.com/watch?v=Rp9NKn7rtQ4","thumbnail_url":"https://i.ytimg.com/vi/Rp9NKn7rtQ4/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":124,"unresolved_verifiers":[{"name":"MiniShoey","aredl_player_id":"87e5de86-b647-45df-b97f-5590ff15ad84","reason":"pays non confirmé"},{"name":"-","aredl_player_id":"50960223-8b75-43e6-a383-166e89fd156b","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"7feac3e5-b2ae-4f0f-b273-00d41397ae2f","player":{"aredl_player_id":"0cf6541f-cbf3-447d-a085-4facf8f46eb5","name":"nei","country":"FR"},"completed_at":"2023-08-14T21:25:09+00:00","video_url":"https://www.youtube.com/watch?v=Rp9NKn7rtQ4","thumbnail_url":"https://i.ytimg.com/vi/Rp9NKn7rtQ4/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"first_dated_record","record_id":"3ef679d4-62d9-4898-a088-6e95353d06e6","player":{"aredl_player_id":"ed9ce645-5cd5-436c-ad4b-573bf266e842","name":"Couropsnov♣","country":"BE"},"completed_at":"2025-01-28T09:52:55+00:00","video_url":"https://www.youtube.com/watch?v=koyEimCdxe4","thumbnail_url":"https://i.ytimg.com/vi/koyEimCdxe4/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"aredl_id":"a454218a-1fab-4485-a760-c0da1bfb80b4","gd_level_id":"90420966","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('99692910', '7875ce6f-ede9-400e-98d9-3bd55c56885c', 259, 'Moving Forward', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"26df834c-8370-4a88-80e6-aa4d072668b7","player":{"aredl_player_id":"73e83aa7-3dd9-4376-8b58-c46ca8af3627","name":"coubitic 🍫","country":"FR"},"completed_at":"2024-07-27T21:46:35+00:00","video_url":"https://www.youtube.com/watch?v=GYwUIhyFKCk","thumbnail_url":"https://i.ytimg.com/vi/GYwUIhyFKCk/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":31,"unresolved_verifiers":[{"name":"-","aredl_player_id":"8e1ef8df-7f69-4063-b768-eaf0bd3b5b77","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"26df834c-8370-4a88-80e6-aa4d072668b7","player":{"aredl_player_id":"73e83aa7-3dd9-4376-8b58-c46ca8af3627","name":"coubitic 🍫","country":"FR"},"completed_at":"2024-07-27T21:46:35+00:00","video_url":"https://www.youtube.com/watch?v=GYwUIhyFKCk","thumbnail_url":"https://i.ytimg.com/vi/GYwUIhyFKCk/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"7875ce6f-ede9-400e-98d9-3bd55c56885c","gd_level_id":"99692910","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
INSERT INTO public.dlfr_aredl_nlw_stage
(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)
VALUES ('79997992', '273cc0ae-4b73-4bac-9eb2-7d95f3e4fa08', 260, 'Shardscapes', 'NO_DLFR_EXPORT_REVIEW', '[]'::jsonb, '{"status":"first_dated_record","record_id":"bb598f54-8676-4b98-af42-09493dc8154a","player":{"aredl_player_id":"d3cabd7e-f53f-46b5-a094-542dce28d879","name":"[МОЛЛИ] Travl","country":"FR"},"completed_at":"2024-02-19T00:13:19+00:00","video_url":"https://www.youtube.com/watch?v=ZFPidntVXVI","thumbnail_url":"https://i.ytimg.com/vi/ZFPidntVXVI/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}'::jsonb, '{"source":"AREDL","records_complete":true,"records_inspected":419,"unresolved_verifiers":[{"name":"kiseta","aredl_player_id":"4aba7fb4-af7d-4987-b0ab-f921c7eef764","reason":"pays non confirmé"}],"first_fr":{"status":"first_dated_record","record_id":"bb598f54-8676-4b98-af42-09493dc8154a","player":{"aredl_player_id":"d3cabd7e-f53f-46b5-a094-542dce28d879","name":"[МОЛЛИ] Travl","country":"FR"},"completed_at":"2024-02-19T00:13:19+00:00","video_url":"https://www.youtube.com/watch?v=ZFPidntVXVI","thumbnail_url":"https://i.ytimg.com/vi/ZFPidntVXVI/hqdefault.jpg","note":"Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"},"first_be":{"status":"unknown","reason":"aucune victoire datée ET localisée dans les records disponibles"},"aredl_id":"273cc0ae-4b73-4bac-9eb2-7d95f3e4fa08","gd_level_id":"79997992","observed_first_not_historical_proof":true}'::jsonb)
ON CONFLICT (gd_level_id) DO UPDATE SET
  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,
  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,
  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,
  updated_at=now()
WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id
  AND public.dlfr_aredl_nlw_stage.review_state='pending'
  AND public.dlfr_aredl_nlw_stage.manually_locked=false;
COMMIT;
-- Fin : toutes les entrées sont en attente de revue, aucune publication.

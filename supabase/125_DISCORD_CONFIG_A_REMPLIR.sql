-- À exécuter dans Supabase → SQL Editor APRÈS avoir créé les webhooks Discord.
-- Remplace chaque URL par celle copiée dans Discord (laisse null pour un salon que tu ne veux pas).
update public.dlfr_discord_config set
  webhook_moderation = 'https://discord.com/api/webhooks/1567553388139388968/12IcCHtkWHS7uyqmKdF34RPrBkRV-zxBlAceX9EuIwTtgRCAKdmMrkYJ2dGpifQJeAgE',   -- salon modération : nouvelles soumissions
  webhook_results    = 'https://discord.com/api/webhooks/1567552966272090362/34kXnG5eba4sOVGNjWDo-weKP-wVWeNzA8mqSJ_P_nDqX3JbDEie6N3kg3_DT_E_6m-1',   -- salon joueurs : acceptée / refusée
  webhook_news       = 'https://discord.com/api/webhooks/1567553725688717413/-vxTwptrCU8X_-ASLYu89eyupqLHD83KAb-YygmtDMP-s-8hZn5CoOa_b5LiY2YRdeJ2',   -- salon actualités
  webhook_badges     = 'https://discord.com/api/webhooks/1567553982497292438/L2Va31NeQ0zBVxaAzmOkUYNcOUbzFslDYChLFYjKZI8AmVdSX54OUqBIpwmZx6PzrnVD',   -- salon badges décernés par la modération
  moderation_role_id = null,          -- ex. '123456789012345678' pour mentionner le rôle Modérateur (facultatif)
  mention_players    = true,          -- @mentionner le joueur si son compte DLFR est lié à Discord
  show_review_message = false,        -- true = afficher le message du modérateur dans le salon public
  site_url = 'https://xp0nenttttttt.github.io/DLFR/',  -- adresse du site (avec / à la fin)
  enabled = true, updated_at = now();

-- Envoie un message de test dans chaque salon configuré :
select public.dlfr_discord_test();
-- Quelques secondes après, vérifie les réponses de Discord (204 = OK) :
-- select status_code, content from net._http_response order by id desc limit 4;

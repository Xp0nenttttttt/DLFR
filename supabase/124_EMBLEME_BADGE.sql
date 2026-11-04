-- DLFR V124 — badge « emblème » affiché à côté du pseudo. Additif uniquement.
alter table public.dlfr_profile_preferences add column if not exists emblem_badge text;

create or replace function public.dlfr_set_profile_emblem(p_badge_id text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_player text; v_badge text := nullif(btrim(coalesce(p_badge_id,'')),'');
begin
 if v_user is null then raise exception 'Connexion obligatoire.'; end if;
 select player_key into v_player from public.player_profile_owners where auth_user_id = v_user limit 1;
 if v_player is null then raise exception 'Aucun profil joueur lié à ce compte.'; end if;
 if v_badge is not null and not exists (select 1 from public.badge_awards a where a.player_key = v_player and a.badge_id::text = v_badge) then
  raise exception 'Ce badge n’appartient pas à ton profil.';
 end if;
 insert into public.dlfr_profile_preferences(player_key, emblem_badge, updated_at) values (v_player, v_badge, now())
 on conflict (player_key) do update set emblem_badge = excluded.emblem_badge, updated_at = now();
 return coalesce(v_badge,'');
end $$;
revoke all on function public.dlfr_set_profile_emblem(text) from public, anon;
grant execute on function public.dlfr_set_profile_emblem(text) to authenticated;

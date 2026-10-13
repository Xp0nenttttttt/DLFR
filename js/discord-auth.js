/* DLFR V2.5 — Discord OAuth helpers.
 * IMPORTANT : this module never grants GD-profile ownership, moderator roles or points.
 * Real ownership is read from server-verified player_profile_owners + RLS only.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.DLFR_DISCORD = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const KEY = 'dlfr-discord-demo-v25';
  const DEMO_AVATAR = 'https://cdn.discordapp.com/embed/avatars/3.png';
  const NEW = () => ({ connected:false, username:'DiscordDemo', avatar_url:DEMO_AVATAR, requested_player_key:'', linked_player_key:'' });
  const cleanKey = v => String(v || '').trim().toLowerCase();
  const allowedDiscordImage = value => {
    try {
      const u = new URL(value);
      return u.protocol === 'https:' && ['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname.toLowerCase()) ? u.href : '';
    } catch { return ''; }
  };
  function sessionDiscordIdentity(session) {
    const user = session && session.user;
    if (!user) return null;
    const identity = (user.identities || []).find(i => i.provider === 'discord');
    const provider = user.app_metadata || {};
    const hasDiscord = !!identity || provider.provider === 'discord' || (provider.providers || []).includes('discord');
    if (!hasDiscord) return null;
    const meta = identity?.identity_data || user.user_metadata || {};
    const name = String(meta.global_name || meta.full_name || meta.name || meta.user_name || meta.username || 'Discord').slice(0,80);
    const avatar = allowedDiscordImage(meta.avatar_url) || allowedDiscordImage(user.user_metadata?.avatar_url);
    return { username:name, avatar_url:avatar, connected:true, provider:'discord' };
  }
  function getDemo(storage) {
    try {
      const obj = JSON.parse(storage.getItem(KEY) || 'null');
      return obj && typeof obj === 'object' ? {...NEW(),...obj} : NEW();
    } catch { return NEW(); }
  }
  function setDemo(storage, value) {
    const next = {...NEW(),...value};
    storage.setItem(KEY, JSON.stringify(next));
    return next;
  }
  function connectDemo(storage) {
    return setDemo(storage, { ...NEW(), connected:true });
  }
  function requestDemo(storage, playerKey) {
    const d=getDemo(storage), k=cleanKey(playerKey);
    if (!d.connected) throw Error('Connecte d’abord le compte Discord de démonstration.');
    if (!k) throw Error('Choisis un profil joueur.');
    if (d.linked_player_key && d.linked_player_key !== k) throw Error('Ce compte de démonstration est déjà lié à un autre joueur.');
    return setDemo(storage, {...d,requested_player_key:k});
  }
  function approveDemo(storage, isModerator) {
    if (!isModerator) throw Error('Active le mode modérateur de démonstration pour valider.');
    const d=getDemo(storage);
    if (!d.connected || !d.requested_player_key) throw Error('Aucune demande de liaison en attente.');
    return setDemo(storage, {...d,linked_player_key:d.requested_player_key,requested_player_key:''});
  }
  function disconnectDemo(storage) {
    storage.removeItem(KEY);
    return NEW();
  }
  async function signIn(client, redirectTo) {
    if (!client?.auth?.signInWithOAuth) throw Error('Supabase Auth indisponible.');
    const {error} = await client.auth.signInWithOAuth({provider:'discord',options:{redirectTo}});
    if (error) throw error;
  }
  async function linkIdentity(client, redirectTo) {
    if (!client?.auth?.linkIdentity) throw Error('Liaison OAuth indisponible.');
    const {error} = await client.auth.linkIdentity({provider:'discord',options:{redirectTo}});
    if (error) throw error;
  }
  return {getDemo,setDemo,connectDemo,requestDemo,approveDemo,disconnectDemo,sessionDiscordIdentity,allowedDiscordImage,signIn,linkIdentity,DEMO_AVATAR};
});

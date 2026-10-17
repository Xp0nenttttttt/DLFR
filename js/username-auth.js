/* DLFR 2.8 — Auth Supabase pseudo / mot de passe.
 * AUCUN secret service_role côté navigateur. Le secret est dans l'Edge Function.
 */
(function (root, factory) {
  const api=factory();
  if (typeof module==='object'&&module.exports) module.exports=api;
  if (root) root.DLFR_USERNAME_AUTH=api;
})(typeof window==='object'?window:null,function(){
  'use strict';
  const validUsername=v=>/^[A-Za-z0-9_-]{3,24}$/.test(String(v||''));
  async function request(config, action, username, password){
    if(!config?.supabaseUrl||!config?.supabasePublishableKey)throw Error('Configuration Supabase manquante.');
    if(!validUsername(username))throw Error('Pseudo : 3 à 24 caractères (lettres, chiffres, _ ou -).');
    if(!password||password.length<12)throw Error('Le mot de passe doit contenir au moins 12 caractères.');
    const url=config.supabaseUrl.replace(/\/$/,'')+'/functions/v1/username-auth';
    let response;
    try{response=await fetch(url,{
      method:'POST',headers:{'content-type':'application/json','apikey':config.supabasePublishableKey},
      body:JSON.stringify({action,username,password})
    });}catch{throw Error('Service d’inscription indisponible. Vérifie la fonction Edge Supabase.');}
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(payload.error||'Authentification impossible.');
    if(!payload.session?.access_token||!payload.session?.refresh_token)throw Error('Réponse de connexion incomplète.');
    return payload.session;
  }
  async function signIn(db,config,action,username,password){
    if(!['register','login'].includes(action))throw Error('Action non autorisée.');
    const session=await request(config,action,username,password);
    const {data,error}=await db.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});
    if(error||!data?.session)throw Error(error?.message||'Session impossible à enregistrer.');
    return data.session;
  }
  return {validUsername,signIn};
});

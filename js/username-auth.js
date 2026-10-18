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
  async function request(config, action, username, password, extras={}){
    if(!config?.supabaseUrl||!config?.supabasePublishableKey)throw Error('La connexion n’est pas encore disponible. Réessaie plus tard.');
    if(!validUsername(username))throw Error('Pseudo : 3 à 24 caractères (lettres, chiffres, _ ou -).');
    if(typeof password!=='string'||!password.length||password.length>128||(action==='register'&&password.length<12))throw Error(action==='register'?'Le mot de passe doit contenir au moins 12 caractères.':'Mot de passe manquant ou trop long.');
    const url=config.supabaseUrl.replace(/\/$/,'')+'/functions/v1/username-auth';
    let response;
    try{response=await fetch(url,{
      method:'POST',headers:{'content-type':'application/json','apikey':config.supabasePublishableKey},
      body:JSON.stringify({action,username,password,...(action==='login'&&extras.newPassword?{new_password:extras.newPassword}:{})})
    });}catch{throw Error('Le service de connexion est momentanément indisponible. Réessaie plus tard.');}
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(payload.error||'Authentification impossible.');
    if(!payload.session?.access_token||!payload.session?.refresh_token)throw Error('Réponse de connexion incomplète.');
    return payload.session;
  }
  async function signIn(db,config,action,username,password,extras={}){
    if(!['register','login'].includes(action))throw Error('Action non autorisée.');
    const session=await request(config,action,username,password,extras);
    const {data,error}=await db.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});
    if(error||!data?.session)throw Error(error?.message||'Session impossible à enregistrer.');
    return data.session;
  }
  async function authenticatedRequest(db,config,action,fields={}){
    if(!config?.supabaseUrl||!config?.supabasePublishableKey)throw Error('Connexion momentanément indisponible.');
    const api=config.supabaseUrl.replace(/\/$/,'')+'/functions/v1/username-auth';
    const sessionOrFail=async()=>{
      const {data,error}=await db.auth.getSession();
      if(error||!data?.session?.access_token)throw Error('Ta session a expiré. Reconnecte-toi avec Discord.');
      return data.session;
    };
    const send=async token=>fetch(api,{
      method:'POST',headers:{'content-type':'application/json','apikey':config.supabasePublishableKey,
        'authorization':'Bearer '+token},
      body:JSON.stringify({action,...fields})
    });
    let session=await sessionOrFail();
    let response;
    try{response=await send(session.access_token);}catch{
      throw Error('Connexion au service impossible. Vérifie ton réseau et réessaie.');
    }
    // Un JWT conservé par un ancien onglet peut avoir expiré : renouvellement unique.
    // La validation reste entièrement côté Supabase : aucune permission n'est contournée.
    if(response.status===401){
      const {data:refreshed,error:refreshError}=await db.auth.refreshSession();
      if(refreshError||!refreshed?.session?.access_token){
        throw Error('Ta session a expiré. Déconnecte-toi puis reconnecte-toi avec Discord.');
      }
      try{response=await send(refreshed.session.access_token);}catch{
        throw Error('Connexion au service impossible après renouvellement. Réessaie.');
      }
    }
    const payload=await response.json().catch(()=>({}));
    if(response.status===401){
      throw Error('Supabase refuse encore la session après renouvellement. Reconnecte-toi à Discord ; si cela persiste, vérifie les journaux de username-auth.');
    }
    if(!response.ok)throw Error(payload.error||'Impossible de mettre à jour le compte.');
    return payload;
  }
  async function status(db,config){return authenticatedRequest(db,config,'status');}
  async function attach(db,config,username,password){
    if(!validUsername(username))throw Error('Pseudo : 3 à 24 caractères (lettres, chiffres, _ ou -).');
    if(typeof password!=='string'||password.length<12||password.length>128)throw Error('Mot de passe : 12 à 128 caractères.');
    return authenticatedRequest(db,config,'attach',{username,password});
  }
  return {validUsername,signIn,status,attach};
});

// Supabase Edge Function DLFR — pseudo/mot de passe, mot de passe uniquement chez Supabase Auth.
// Deploy with --no-verify-jwt (registration/login unauthed), combined with origin + rate limiting.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import bcrypt from 'npm:bcryptjs@2.4.3';

const projectUrl=Deno.env.get('SUPABASE_URL')||'';
const serviceSecret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const publicKey=Deno.env.get('SUPABASE_ANON_KEY')||'';
const pepper=Deno.env.get('AUTH_RATE_PEPPER')||'';
const allowlist=(Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);
const admin=createClient(projectUrl,serviceSecret,{auth:{persistSession:false,autoRefreshToken:false}});
const publicClient=()=>createClient(projectUrl,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
const allowedUsername=/^[A-Za-z0-9_-]{3,24}$/;
const denylist=new Set(['admin','administrator','moderator','moderateur','staff','owner','demonlist','dlfr','aredl','system','support']);

function response(status:number, data:Record<string,unknown>, origin:string){
 return new Response(JSON.stringify(data),{status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'access-control-allow-origin':origin,'vary':'Origin',
  'access-control-allow-headers':'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
  'access-control-max-age':'600',
  'access-control-allow-methods':'POST,OPTIONS',
 }});
}
async function hashed(value:string){
 const data=new TextEncoder().encode(pepper+':'+value);
 const digest=await crypto.subtle.digest('SHA-256',data);
 return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
async function rate(key:string, limit:number, window:number){
 const {data,error}=await admin.rpc('dlfr_username_auth_rate_limit',{
  p_rate_key:await hashed(key),p_limit:limit,p_window_seconds:window
 });
 if(error)throw Error('rate_limit_unavailable');
 return data===true;
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 if(!allowlist.includes(origin))return response(403,{error:'Origine non autorisée.'},'null');
 if(req.method==='OPTIONS')return response(200,{ok:true},origin);
 if(req.method!=='POST')return response(405,{error:'Méthode refusée.'},origin);
 if(!projectUrl||!serviceSecret||!publicKey||pepper.length<32)return response(503,{error:'Service non configuré.'},origin);
 if(Number(req.headers.get('content-length')||'0')>4096)return response(413,{error:'Requête trop volumineuse.'},origin);
 try{
  const body=await req.json();
  const action=body?.action;
  if(!['login','register','status','attach'].includes(action)){
    return response(400,{error:'Action non reconnue.'},origin);
  }
  const authorization=req.headers.get('authorization')||'';
  // Pour lire ou ajouter un pseudo à un compte Discord, on vérifie le JWT côté serveur.
  // L'identifiant utilisateur est obtenu de Supabase Auth, jamais du corps de la requête.
  if(action==='status'||action==='attach'){
    const token=/^Bearer\s+(.+)$/i.exec(authorization)?.[1]||'';
    if(!token)return response(401,{error:'Connecte-toi pour continuer.'},origin);
    const {data:verified,error:verifyError}=await admin.auth.getUser(token);
    if(verifyError||!verified?.user)return response(401,{error:'Session expirée. Reconnecte-toi.'},origin);
    const user=verified.user;
    if(action==='status'){
      const {data:existing,error:existingErr}=await admin.from('dlfr_username_accounts')
        .select('username_key').eq('auth_user_id',user.id).maybeSingle();
      if(existingErr)throw existingErr;
      return response(200,{username:existing?.username_key||null},origin);
    }
    const username=String(body?.username||'').trim();
    const password=body?.password;
    if(!allowedUsername.test(username)||typeof password!=='string'||password.length<12||password.length>128){
      return response(400,{error:'Pseudo invalide ou mot de passe trop court (12 caractères minimum).'},origin);
    }
    const handle=username.toLowerCase();
    if(denylist.has(handle))return response(400,{error:'Pseudo réservé.'},origin);
    // Pas de conversion d'une session inconnue en compte propriétaire : il faut prouver
    // la possession d'une vraie identité Discord vérifiée par Supabase Auth.
    const hasDiscord=Array.isArray(user.identities)&&user.identities.some(i=>i.provider==='discord') ||
      user.app_metadata?.provider==='discord'||(user.app_metadata?.providers||[]).includes('discord');
    if(!hasDiscord)return response(403,{error:'Connecte-toi avec Discord avant de créer ce mode de connexion.'},origin);
    if(!user.email)return response(400,{error:'Discord doit fournir une adresse de connexion interne valide. Contacte l’équipe.'},origin);
    // Evite d’ajouter un mot de passe sensible via une session ancienne ou abandonnée.
    const latestLogin=Date.parse(user.last_sign_in_at||'');
    if(!Number.isFinite(latestLogin)||Date.now()-latestLogin>20*60*1000){
      return response(403,{error:'Pour sécuriser cette modification, reconnecte-toi avec Discord puis réessaie dans les 20 minutes.'},origin);
    }
    if(!await rate('attach:'+user.id,5,3600))return response(429,{error:'Trop de tentatives. Réessaie plus tard.'},origin);
    const {data:already,error:alreadyErr}=await admin.from('dlfr_username_accounts')
      .select('username_key').eq('auth_user_id',user.id).maybeSingle();
    if(alreadyErr)throw alreadyErr;
    if(already)return response(409,{error:'Un pseudo est déjà lié à ton compte.'},origin);
    const {error:insertErr}=await admin.from('dlfr_username_accounts')
      .insert({username_key:handle,auth_user_id:user.id});
    if(insertErr)return response(insertErr.code==='23505'?409:500,{error:insertErr.code==='23505'?'Pseudo déjà pris ou déjà lié.':'Impossible d’activer le pseudo.'},origin);
    // Le mot de passe est géré exclusivement par Supabase Auth, jamais stocké en table.
    const {error:passwordErr}=await admin.auth.admin.updateUserById(user.id,{password});
    if(passwordErr){
      await admin.from('dlfr_username_accounts').delete().eq('auth_user_id',user.id).eq('username_key',handle);
      console.error('DLFR username attach:',passwordErr.message);
      return response(503,{error:'Le mot de passe n’a pas pu être enregistré. Réessaie plus tard.'},origin);
    }
    return response(200,{username:handle},origin);
  }
  const username=String(body?.username||'').trim();
  const password=body?.password;
  if(!allowedUsername.test(username)||typeof password!=='string'||!password.length||password.length>128||
     (action==='register'&&password.length<12)){
    return response(400,{error:action==='register'?'Mot de passe : 12 caractères minimum.':'Pseudo ou mot de passe invalide.'},origin);
  }
  const handle=username.toLowerCase();
  if(denylist.has(handle))return response(400,{error:'Pseudo réservé.'},origin);
  // Adresses IP utilisées UNIQUEMENT dans un hash poivré, pas stockées en clair.
  const forwarded=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'';
  const remote=req.headers.get('cf-connecting-ip')||req.headers.get('x-real-ip')||forwarded||'unknown';
  if(!await rate('ip:'+remote,action==='register'?5:40,3600))return response(429,{error:'Trop de tentatives. Réessaie plus tard.'},origin);
  if(!await rate('handle:'+handle,action==='register'?4:12,900))return response(429,{error:'Trop de tentatives pour ce pseudo.'},origin);
  if(action==='register'){
    const {data:existing,error:lookErr}=await admin.from('dlfr_username_accounts')
       .select('username_key').eq('username_key',handle).maybeSingle();
    if(lookErr)throw lookErr;
    if(existing)return response(409,{error:'Ce pseudo est déjà utilisé.'},origin);
    const {data:reserved,error:reserveErr}=await admin.from('dlfr_legacy_credentials').select('username_key').eq('username_key',handle).maybeSingle();
    if(reserveErr)throw reserveErr;
    if(reserved)return response(409,{error:'Ce pseudo appartient à un ancien compte. Utilise la connexion avec tes anciens identifiants.'},origin);
    // Adresse technique non utilisable pour une récupération : aucune e-mail personnel demandé.
    const internalEmail=`dlfr-${crypto.randomUUID()}@users.invalid`;
    const {data:created,error:createErr}=await admin.auth.admin.createUser({
      email:internalEmail,password,email_confirm:true,
      user_metadata:{dlfr_auth_method:'username',dlfr_username:username}
    });
    if(createErr||!created?.user)return response(400,{error:'Création impossible : vérifie la configuration Supabase Auth.'},origin);
    const userId=created.user.id;
    const {error:insertErr}=await admin.from('dlfr_username_accounts').insert({username_key:handle,auth_user_id:userId});
    if(insertErr){
      await admin.auth.admin.deleteUser(userId); // No orphan account on collision.
      return response(insertErr.code==='23505'?409:500,{error:insertErr.code==='23505'?'Ce pseudo est déjà utilisé.':'Inscription impossible.'},origin);
    }
    const {data:auth,error:authErr}=await publicClient().auth.signInWithPassword({email:internalEmail,password});
    if(authErr||!auth?.session)return response(503,{error:'Compte créé, mais connexion automatique indisponible. Essaie de te connecter avec ton pseudo.'},origin);
    return response(200,{session:auth.session},origin);
  }
  const {data:entry,error:lookupErr}=await admin.from('dlfr_username_accounts')
    .select('auth_user_id').eq('username_key',handle).maybeSingle();
  if(lookupErr)throw lookupErr;
  if(!entry){
    // Migration paresseuse : seuls les anciens utilisateurs prouvant leur mot de passe
    // peuvent activer leur compte. Ne jamais livrer ni journaliser les hashs.
    const generic={error:'Pseudo ou mot de passe incorrect.'};
    const {data:legacy,error:legacyErr}=await admin.from('dlfr_legacy_credentials')
      .select('password_hash,is_banned,migrated_auth_user_id').eq('username_key',handle).maybeSingle();
    if(legacyErr)throw legacyErr;
    if(!legacy?.password_hash||legacy.is_banned||legacy.migrated_auth_user_id)return response(401,generic,origin);
    let matched=false;
    try{matched=await bcrypt.compare(password,legacy.password_hash.replace(/^\$2y\$/,'$2a$'));}
    catch{console.error('DLFR legacy bcrypt verification failed');return response(503,{error:'Service temporairement indisponible.'},origin);}
    if(!matched)return response(401,generic,origin);
    // Un ancien mot de passe court ne peut pas rester le nouveau secret Supabase.
    const upgraded=body?.new_password;
    const finalPassword=password.length>=12?password:upgraded;
    if(typeof finalPassword!=='string'||finalPassword.length<12||finalPassword.length>128){
      return response(409,{error:'Ancien mot de passe reconnu. Déplie « Ancien compte : changer le mot de passe » et choisis-en un nouveau (12 caractères minimum).'},origin);
    }
    const claim=crypto.randomUUID();
    const {data:locked,error:lockErr}=await admin.rpc('dlfr_legacy_migration_begin',{p_handle:handle,p_claim:claim});
    if(lockErr)throw lockErr;
    if(!locked)return response(409,{error:'Migration déjà en cours pour ce compte. Réessaie dans quelques minutes ou contacte l’équipe.'},origin);
    let createdId:string|null=null;
    try{
      // Aucune réutilisation des e-mails historiques ; rôles historiques NON migrés.
      const internalEmail=`dlfr-legacy-${crypto.randomUUID()}@users.invalid`;
      const {data:created,error:createErr}=await admin.auth.admin.createUser({
        email:internalEmail,password:finalPassword,email_confirm:true,
        user_metadata:{dlfr_auth_method:'username',dlfr_migrated_legacy:true,dlfr_username:username}
      });
      if(createErr||!created?.user)throw Error('Unable to create Auth user');
      createdId=created.user.id;
      const {error:finishErr}=await admin.rpc('dlfr_legacy_migration_finish',{
        p_handle:handle,p_claim:claim,p_auth_user_id:createdId
      });
      if(finishErr)throw finishErr;
      // En cas d’échec temporaire de connexion, le compte reste migré et utilisable au prochain essai.
      const {data:logged,error:signErr}=await publicClient().auth.signInWithPassword({email:internalEmail,password:finalPassword});
      if(signErr||!logged?.session)return response(503,{error:'Compte migré, mais connexion automatique indisponible. Reconnecte-toi avec le mot de passe actuel.'},origin);
      return response(200,{session:logged.session,migrated:true},origin);
    }catch(err){
      // Si la finition a réussi, ne jamais supprimer le compte déjà migré.
      const {data:completed}=await admin.from('dlfr_legacy_credentials')
        .select('migrated_auth_user_id').eq('username_key',handle).maybeSingle();
      if(!completed?.migrated_auth_user_id){
        if(createdId)await admin.auth.admin.deleteUser(createdId);
        await admin.rpc('dlfr_legacy_migration_abort',{p_handle:handle,p_claim:claim});
      }
      console.error('DLFR legacy migration error:',err instanceof Error?err.message:'unknown');
      return response(503,{error:'Migration temporairement indisponible. Réessaie ou contacte la modération.'},origin);
    }
  }
  const {data:linked,error:linkedErr}=await admin.auth.admin.getUserById(entry.auth_user_id);
  if(linkedErr||!linked?.user?.email)return response(401,{error:'Pseudo ou mot de passe incorrect.'},origin);
  const {data:login,error:loginErr}=await publicClient().auth.signInWithPassword({email:linked.user.email,password});
  if(loginErr||!login?.session)return response(401,{error:'Pseudo ou mot de passe incorrect.'},origin);
  return response(200,{session:login.session},origin);
 }catch(error){
  console.error('DLFR username auth error:',error instanceof Error?error.message:'error');
  return response(503,{error:'Service temporairement indisponible.'},origin);
 }
});

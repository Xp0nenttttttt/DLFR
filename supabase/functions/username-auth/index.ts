// Supabase Edge Function DLFR — pseudo/mot de passe, mot de passe uniquement chez Supabase Auth.
// Deploy with --no-verify-jwt (registration/login unauthed), combined with origin + rate limiting.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

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
  'access-control-allow-headers':'content-type,apikey',
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
  const username=String(body?.username||'').trim();
  const password=body?.password;
  if(!['login','register'].includes(action)||!allowedUsername.test(username)||typeof password!=='string'||password.length<12||password.length>128){
   return response(400,{error:'Pseudo ou mot de passe invalide (12 caractères minimum).'},origin);
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
  if(!entry)return response(401,{error:'Pseudo ou mot de passe incorrect.'},origin);
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

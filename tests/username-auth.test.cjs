const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const auth=require('../js/username-auth.js');

test('pseudo: accepte minuscules, majuscules, chiffres et séparateurs',()=>{
 assert.equal(auth.validUsername('Spleen_w'),true);
 assert.equal(auth.validUsername('AB'),false);
 assert.equal(auth.validUsername('admin@dlfr'),false);
 assert.equal(auth.validUsername('hello world'),false);
});
test('inscription: le navigateur transmet à la fonction Edge sans stocker les mots de passe',async()=>{
 const calls=[];
 const previousFetch=global.fetch;
 global.fetch=async(url,options)=>{
   calls.push({url,options});
   return {ok:true,json:async()=>({session:{access_token:'tokenA',refresh_token:'tokenR'}})};
 };
 const db={auth:{setSession:async(token)=>({data:{session:{...token,user:{id:'u'}}},error:null})}};
 try{
  const result=await auth.signIn(db,{supabaseUrl:'https://project.supabase.co',supabasePublishableKey:'sb_publishable_abc'},'register','Spleen_w','long_password_here');
  assert.equal(result.access_token,'tokenA');
  assert.equal(calls[0].url,'https://project.supabase.co/functions/v1/username-auth');
  assert.equal(JSON.parse(calls[0].options.body).username,'Spleen_w');
  assert.equal(calls[0].options.headers.apikey,'sb_publishable_abc');
  assert.equal(JSON.stringify(calls[0]).includes('service_role'),false);
 }finally{global.fetch=previousFetch;}
});
test('l’interface garde la connexion Discord et le contrôle de propriété des avatars',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
 assert.match(app,/dlfr_avatar_refresh_uid/);
 assert.match(app,/currentUser\.id!==expected/);
 assert.match(app,/C\.enableUsernameLogin===true/);
 assert.match(app,/await processDiscordAvatarReturn\(\)/);
 assert.match(app,/discordIdentity\(\)/);
});
test('la création de fiche mot de passe vérifie une table SQL protégée',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/42_USERNAME_PASSWORD_ACCOUNTS.sql'),'utf8');
 assert.match(sql,/auth_user_id=v_user/);
 assert.match(sql,/REVOKE ALL ON public\.dlfr_username_accounts FROM PUBLIC, anon, authenticated/);
 assert.match(sql,/dlfr_create_own_player_username/);
});

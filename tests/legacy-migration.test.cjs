const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const auth=require('../js/username-auth.js');
const file=(name)=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('Connexion legacy peut transmettre un nouveau mot de passe uniquement vers Edge',async()=>{
 const prev=global.fetch;let options;
 global.fetch=async (url,opt)=>{options=opt;return {ok:true,json:async()=>({session:{access_token:'a',refresh_token:'r'}})};};
 try{
  const db={auth:{setSession:async payload=>({data:{session:payload},error:null})}};
  await auth.signIn(db,{supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'public'},'login','OldPlayer','old',{newPassword:'this_is_a_new_password'});
  assert.deepEqual(JSON.parse(options.body),{action:'login',username:'OldPlayer',password:'old',new_password:'this_is_a_new_password'});
  assert.equal(options.headers.apikey,'public');
  assert.ok(!options.headers.Authorization);
 } finally{global.fetch=prev;}
});
test('Inscription reste protégée contre mots de passe courts',async()=>{
 await assert.rejects(()=>auth.signIn({}, {supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'public'},'register','PlayerOne','old'),/12 caractères/);
});
test('Migration Edge : rate-limit, bcrypt, absence de rôle et effacement hash',()=>{
 const edge=file('supabase/functions/username-auth/index.ts'),sql=file('supabase/57_IMPORT_ANCIENS_COMPTES.sql');
 assert.match(edge,/bcrypt\.compare\(/);
 assert.match(edge,/dlfr_legacy_migration_begin/);
 assert.match(edge,/dlfr_legacy_migration_finish/);
 assert.match(edge,/if\(!entry\)/); // migrate only if there is NO existing account
 assert.match(sql,/SET password_hash=NULL/);
 assert.match(sql,/REVOKE ALL ON public\.dlfr_legacy_credentials FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/AND p\.has_account IS NOT TRUE/);
 assert.doesNotMatch(sql,/INSERT INTO auth\.users/);
});

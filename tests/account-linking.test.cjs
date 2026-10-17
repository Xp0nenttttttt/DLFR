const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const edge=fs.readFileSync(path.join(__dirname,'../supabase/functions/username-auth/index.ts'),'utf8');
const api=require('../js/username-auth.js');

test('UI removes email sign-in and retains username + discord',()=>{
 assert.doesNotMatch(app,/Se connecter avec e-mail|Connexion e-mail \(comptes existants\)|Se connecter par e-mail|data-form="selfLogin"|data-form="login"/);
 assert.match(app,/data-form="usernameLogin"/);
 assert.match(app,/data-form="usernameRegister"/);
 assert.match(app,/data-action="discordOAuthLogin"/);
 assert.match(app,/data-action="discordIdentityLink"/);
});
test('UI supports attaching username to existing Discord account',()=>{
 assert.match(app,/data-form="attachUsername"/);
 assert.match(app,/USERNAME_AUTH\.attach\(db,C,f\.username,f\.password\)/);
 assert.match(app,/linkedAccountsPanel\(\)/);
 assert.match(app,/await refreshUsernameAccount\(\)/);
});
test('Edge checks signed-in JWT and actual Discord identity before password update',()=>{
 assert.match(edge,/admin\.auth\.getUser\(token\)/);
 assert.match(edge,/i\.provider==='discord'/);
 assert.match(edge,/admin\.auth\.admin\.updateUserById\(user\.id,\{password\}\)/);
 assert.match(edge,/user\.last_sign_in_at/);
 assert.match(edge,/authorization/);
 assert.doesNotMatch(edge,/admin\.auth\.admin\.updateUserById\(body\./);
});
test('linked account status is read without exposing service secret', async()=>{
 const original=global.fetch;let captured;
 global.fetch=async(url,opts)=>{captured={url,opts};return {ok:true,json:async()=>({username:'test_handle'})};};
 const db={auth:{getSession:async()=>({data:{session:{access_token:'jwt_123'}}})}};
 try{
  const result=await api.status(db,{supabaseUrl:'https://project.supabase.co',supabasePublishableKey:'key_pub'});
  assert.equal(result.username,'test_handle');
  assert.equal(JSON.parse(captured.opts.body).action,'status');
  assert.equal(captured.opts.headers.authorization,'Bearer jwt_123');
  assert.equal(JSON.stringify(captured).includes('service_role'),false);
 }finally{global.fetch=original;}
});
test('attach submits username and password only to authenticated Edge endpoint',async()=>{
 const original=global.fetch;let captured;
 global.fetch=async(url,opts)=>{captured={url,opts};return {ok:true,json:async()=>({username:'newname'})};};
 const db={auth:{getSession:async()=>({data:{session:{access_token:'jwt_321'}}})}};
 try{
  const result=await api.attach(db,{supabaseUrl:'https://project.supabase.co',supabasePublishableKey:'key_pub'},'newname','strongpassword12345');
  assert.equal(result.username,'newname');
  assert.equal(JSON.parse(captured.opts.body).action,'attach');
  assert.equal(captured.opts.headers.authorization,'Bearer jwt_321');
 }finally{global.fetch=original;}
});

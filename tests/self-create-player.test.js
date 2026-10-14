'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const prod=require('../js/production-tools.js');
function stub(){
 let calls=[];
 return {calls,rpc:async(name,args)=>{calls.push({name,args});return {data:'spleen',error:null}}};
}
const session={user:{id:'test-auth',identities:[{provider:'discord'}]}};
const emptyData={players:[],player_profile_owners:[],profile_claim_requests:[]};
assert.equal(prod.handles('selfCreatePlayer'),true,'formulaire pris en charge');
const html=prod.claimSection({session,data:emptyData});
assert.match(html,/selfCreatePlayer/);
assert.match(html,/Créer ma fiche DLFR/);
assert.match(html,/prodClaim/);
assert.match(html,/region_code/);
assert.doesNotMatch(prod.claimSection({session:null,data:emptyData}),/selfCreatePlayer/);
const pending=prod.claimSection({session,data:{...emptyData,profile_claim_requests:[{auth_user_id:'test-auth',status:'pending'}]}});
assert.doesNotMatch(pending,/data-form="selfCreatePlayer"/,'pas de création en attendant revendication');
const notDiscord=prod.claimSection({session:{user:{id:'test-auth',identities:[],app_metadata:{}}},data:emptyData});
assert.doesNotMatch(notDiscord,/data-form="selfCreatePlayer"/);
(async()=>{
 const db=stub();
 await prod.send(db,'selfCreatePlayer',{username:'Spleen',country_code:'FR',region_code:'BRE'});
 assert.deepEqual(db.calls,[{name:'dlfr_create_own_player',args:{p_username:'Spleen',p_country_code:'FR',p_region_code:'BRE'}}]);
 const db2=stub();await prod.send(db2,'selfCreatePlayer',{username:'Test_Be',country_code:'BE',region_code:'BRE'});
 assert.equal(db2.calls[0].args.p_region_code,null,'region ignoree hors France');
 await assert.rejects(prod.send(stub(),'selfCreatePlayer',{username:'<script>',country_code:'FR'}),/Pseudo/);
 await assert.rejects(prod.send(stub(),'selfCreatePlayer',{username:'Valid',country_code:'bad'}),/pays/);
 const sql=fs.readFileSync(require('node:path').join(__dirname,'../supabase/13_self_signup_discord.sql'),'utf8');
 for(const check of ["i.provider = 'discord'",'public.player_profile_owners','public.players','public.player_profiles','pg_advisory_xact_lock','security definer','to authenticated']) assert.ok(sql.includes(check),check);
 assert.ok(!/drop table/i.test(sql));
 console.log('OK: self signup Discord, revendication, contraintes frontend et contrôles SQL statiques');
})().catch(e=>{console.error(e);process.exitCode=1});

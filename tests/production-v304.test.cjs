const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const mod=require('../js/production-tools.js');
const mockData={players:[],demons:[],level_submissions:[],profile_claim_requests:[],
 staff_roles:[{auth_user_id:'00000000-0000-4000-a000-000000000001',role:'editor'}],
 nlw_staff_roles:[{auth_user_id:'00000000-0000-4000-a000-000000000002'}],
 dlfr_aredl_level_stage:[{gd_level_id:'123456',aredl_id:'aredl-a',aredl_name:'Example & <X>',aredl_rank:220,evidence_state:'complete',review_state:'pending'}]};
function state(role){return {staff:true,staffRole:role,data:mockData};}
test('dark-mode CSS uses themed card instead of paper fallback',()=>{
 const css=fs.readFileSync(path.join(root,'css/production.css'),'utf8');
 assert.match(css,/\.prod-panel\{background:var\(--card/);
 assert.match(css,/html\.dark \.prod-panel/);
 assert.match(css,/:not\(\[type="hidden"\]\)/);
});
test('only owner sees staff management',()=>{
 const admin=mod.moderation(state('owner'));
 assert.match(admin,/Gestion des modérateurs/);
 assert.match(admin,/Modération générale/);
 assert.match(admin,/Import AREDL/);
 assert.match(admin,/Example &amp; &lt;X&gt;/);
 assert.doesNotMatch(mod.moderation(state('editor')),/Gestion des modérateurs/);
 assert.match(mod.moderation(state('editor')),/Import AREDL/);
});
test('moderator assignment calls secure owner-only RPC', async()=>{
 let call;const db={rpc:async(method,args)=>{call={method,args};return {data:'added',error:null}}};
 await mod.send(db,'prodManageStaff',{auth_user_id:'c90e6a37-531d-41d5-abcd-9c380baaabc1',role:'editor',enabled:'yes'});
 assert.equal(call.method,'dlfr_set_moderator');assert.equal(call.args.p_role,'editor');assert.equal(call.args.p_enabled,true);
});
test('publishing stage requires explicit shift',async()=>{
 let call;const db={rpc:async(method,args)=>{call={method,args};return {data:42,error:null}}};
 await mod.send(db,'prodPublishAREDL',{gd_level_id:'123456',position:'220',shift:'yes'});
 assert.equal(call.method,'dlfr_publish_staged_aredl');
 assert.deepEqual(call.args,{p_gd_level_id:'123456',p_position:220,p_shift:true});
 await mod.send(db,'prodPublishAREDL',{gd_level_id:'123456',position:'',shift:''});
 assert.equal(call.args.p_position,null);assert.equal(call.args.p_shift,false);
});
test('private SQL uses unique GD-ID reconciliation, rank-shift locks, verified country filters',()=>{
 const sql=fs.readFileSync(path.join(root,'supabase/14_publication_roles_positions.sql'),'utf8');
 for(const term of ['dlfr_is_owner','dlfr_set_moderator','dlfr_publish_staged_aredl','dlfr_make_room','pg_advisory_xact_lock','dlfr_review_submission','match_gd','match_aredl','verifiers_fr_be','first_observed_fr_be','FR','BE',"p_shift"]){assert.ok(sql.includes(term),term)}
 assert.match(sql,/IF existing_role='owner' THEN RAISE EXCEPTION/);
 assert.match(sql,/IF k IS NULL AND EXISTS/);
 assert.match(sql,/WHERE position>=p_rank AND position<100000000 ORDER BY position DESC/);
 assert.match(sql,/GRANT SELECT ON public\.dlfr_aredl_level_stage TO authenticated/);
 assert.match(sql,/CREATE POLICY dlfr_staging_full_mods_read/);
 assert.ok(sql.includes("review_state='approved'"));
});
test('future staging reimports refresh approved rows but not locked/manual conflicts',()=>{
 const src=fs.readFileSync(path.join(root,'tools/aredl_nlw_stage_plan.py'),'utf8');
 assert.match(src,/review_state IN \('pending','approved'\)/);
 assert.match(src,/manually_locked=false/);
});
test('patch contains no custom flags',()=>{
 function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):[path.join(dir,x.name)]);}
 assert.ok(walk(root).every(p=>!p.includes('/assets/flags/')));
});

const test=require('node:test'),assert=require('node:assert/strict');
const mod=require('../js/production-tools.js');
const data={players:[{player_key:'spleen',username:'Spleen'}],demons:[{id:3,position:220,name:'Niveau NLW'}],player_profile_owners:[],level_submissions:[],profile_claim_requests:[]};
test('forms and moderator tools render with escaped user content',()=>{
 const html=mod.moderation({data:{...data,profile_claim_requests:[{id:1,status:'pending',player_key:'spleen',auth_user_id:'uuid',note:'<img src=x onerror=alert(1)>',proof_url:'javascript:alert(1)'}]},staff:true});
 assert.match(html,/data-form="prodPlayer"/);assert.match(html,/data-form="prodCompletion"/);
 assert.doesNotMatch(html,/<img src=x onerror/);assert.doesNotMatch(html,/href="javascript:/);
});
test('unlinked user can see a claim form',()=>{
 const html=mod.claimSection({session:{user:{id:'u'}},data});assert.match(html,/data-form="prodClaim"/);
});
test('module handles only approved forms',()=>{
 assert.equal(mod.handles('prodCompletion'),true);assert.equal(mod.handles('prodClaimReview'),true);
 assert.equal(mod.handles('dropDatabase'),false);
});
test('record assignment calls SQL RPC (not direct completions insert)',async()=>{
 let method,params;const db={rpc:async(m,p)=>{method=m;params=p;return {data:5,error:null}}};
 await mod.send(db,'prodCompletion',{player_key:'spleen',demon_id:'3',video_url:'https://youtu.be/a',achieved_at:'2026-10-10'});
 assert.equal(method,'dlfr_assign_completion');assert.equal(params.p_demon_id,3);
});
test('moderator review respects actual clicked decision',async()=>{
 let params;const db={rpc:async(m,p)=>{params=p;return {data:'rejected',error:null}}};
 await mod.send(db,'prodReviewSubmission',{request_id:'7'}, {value:'no'});
 assert.equal(params.p_approve,false);
});
test('rejects non-HTTPS submission proof',async()=>{
 await assert.rejects(mod.send({},'submitRecord',{video_url:'javascript:alert(1)'}),/HTTPS/);
});
test('manual badge date cannot be in the future',async()=>{
 await assert.rejects(mod.send({},'prodBadgeManual',{obtained_at:'2099-01-01'}),/Date/);
});
test('keeps a stable normalized key for GD pseudonyms',()=>{
 assert.equal(mod.slug('Étoile_GD'), 'etoile_gd');
});

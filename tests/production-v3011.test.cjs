const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PROD = require('../js/production-tools.js');

const hidden = {id:12,name:'Niveau AREDL masqué',position:1700,is_public:false};
const s={staff:true,staffRole:'owner',session:{user:{id:'123'}},
  unpublishedAredlDemons:[hidden],
  data:{players:[{player_key:'alice',username:'Alice'}],demons:[],
    level_submissions:[
      {id:9,status:'approved',demon_id:12,player:'Alice',level_name:hidden.name,suggested_position:105},
      {id:10,status:'pending',demon_id:null,level_id:'123',player:'Bob',progress:100,level_name:'Un nouveau niveau',video_url:'https://youtu.be/example'}
    ],profile_claim_requests:[],staff_roles:[],nlw_staff_roles:[],dlfr_aredl_level_stage:[]}};
const html=PROD.moderation(s);
assert.match(html,/Validations acceptées mais non visibles \(1\)/);
assert.match(html,/data-form="prodPublishAccepted"/);
assert.match(html,/value="105"/);
assert.match(html,/Niveau AREDL masqué/);
assert.match(html,/Soumissions à modérer \(1\)/);
assert.ok(PROD.handles('prodPublishAccepted'));

(async()=>{
  const calls=[];
  const db={rpc(name,args){calls.push({name,args}); return Promise.resolve({data:123,error:null});}};
  await PROD.send(db,'prodPublishAccepted',{request_id:'9',position:'105',shift:'yes'},null);
  assert.deepEqual(calls[0],{name:'dlfr_publish_accepted_submission',args:{p_request_id:9,p_position:105,p_shift:true}});
  calls.length=0;
  await PROD.send(db,'prodReviewSubmission',{request_id:'10',rating:'rated',position:'220'}, {value:'yes'});
  assert.equal(calls[0].name,'dlfr_review_submission');
  assert.equal(calls[0].args.p_position,220);

  const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/21_soumissions_visibilite_equipe.sql'),'utf8');
  const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.doesNotMatch(app,/YOMAYOCB|SOFFAX/);
  assert.match(app,/dlfr_public_staff_directory/);
  assert.match(app,/staffNamesHTML\("general"\)/);
  assert.match(app,/staffNamesHTML\("nlw"\)/);
  assert.match(sql,/dlfr_public_staff_directory\(\)/);
  assert.match(sql,/dlfr_publish_accepted_submission\(/);
  assert.match(sql,/is_public=true/);
  assert.match(sql,/Solo \/ 2P ambigu/);
  assert.match(sql,/status='approved'/);
  assert.match(index,/app\.js\?v=3011-fixed/);
  assert.match(index,/production-tools\.js\?v=3011-fixed/);
  console.log('V3.0.11 : tests frontend, RPC et protections SQL statiques réussis.');
})().catch(err=>{console.error(err);process.exitCode=1;});

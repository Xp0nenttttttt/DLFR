const assert=require('node:assert/strict');
const S=require('../js/submission-core');
function data(){return {demons:[{id:1,name:'Rated one',position:1,unrated:false},{id:2,name:'Rank 150',position:150,unrated:false},{id:3,name:'Rank 151',position:151,unrated:false}],completions:[],level_submissions:[{id:1,status:'pending',level_name:'New challenge',level_id:'123',player:'Alice',publisher:'Bob',progress:100},{id:2,status:'pending',level_name:'Rated one',player:'Alice',progress:100},{id:3,status:'pending',level_name:'New UNRATED',level_id:'444',publisher:'Fran',player:'Alice',progress:100}]};}
let r=S.approve(data(),1,{rating:'rated',position:150},'owner');assert.equal(r.created,true);assert.equal(r.demon.position,150);assert.equal(r.data.demons.find(d=>d.id===2).position,151);assert.equal(r.data.demons.find(d=>d.id===2).legacy,true);assert.equal(r.data.completions[0].demon_id,r.demon.id);
r=S.approve(data(),3,{rating:'unrated',position:28});assert.equal(r.demon.unrated,true);assert.equal(r.demon.unrated_position,28);assert.equal(r.data.demons.find(d=>d.id===2).position,150);assert.equal(r.data.completions.length,1);
r=S.approve(data(),2,{},'editor');assert.equal(r.created,false);assert.equal(r.demon.id,1);assert.equal(r.data.demons.length,3);
assert.throws(()=>S.approve(data(),1,{rating:'rated',position:50},'nlw_editor'),/NLW/);
r=S.approve(data(),1,{rating:'rated',position:180},'nlw_editor');assert.equal(r.demon.position,180);
assert.throws(()=>S.approve(data(),1,{rating:'unrated',position:28},'nlw_editor'),/NLW/);
assert.throws(()=>S.approve(data(),1,{position:28}),/Rated/);
assert.equal(S.reject(data(),1).level_submissions[0].status,'rejected');
console.log('OK: nouveaux niveaux Rated/UNRATED, record existant, rangs, Legacy, permissions NLW, refus.');

'use strict';
const assert=require('node:assert/strict');
const PROD=require('../js/production-tools.js');
async function test(){
  assert.equal(PROD.handles('prodArchiveLevel'),true);
  assert.equal(PROD.handles('prodRestoreLevel'),true);
  let calls=[];
  const db={rpc:async(method,args)=>{calls.push({method,args});return {error:null,data:42}}};
  await PROD.send(db,'prodArchiveLevel',{demon_id:'42',confirm_name:'Nullscapes',reason:'Doublon'});
  assert.deepEqual(calls.pop(),{method:'dlfr_archive_demon',args:{p_demon_id:42,p_confirm_name:'Nullscapes',p_reason:'Doublon'}});
  await PROD.send(db,'prodRestoreLevel',{demon_id:'42',position:''});
  assert.deepEqual(calls.pop(),{method:'dlfr_restore_demon',args:{p_demon_id:42,p_position:null}});
  await PROD.send(db,'prodRestoreLevel',{demon_id:'42',position:'9'});
  assert.deepEqual(calls.pop(),{method:'dlfr_restore_demon',args:{p_demon_id:42,p_position:9}});
  await assert.rejects(()=>PROD.send(db,'prodArchiveLevel',{demon_id:'42',confirm_name:''}),/nom exact/);
  await assert.rejects(()=>PROD.send(db,'prodRestoreLevel',{demon_id:'42',position:'0'}),/Rang/);
  console.log('OK: formulaires archivage / restauration et appels RPC.');
}
test().catch(e=>{console.error(e);process.exitCode=1});

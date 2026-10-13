const assert=require('node:assert/strict');
const V2=require('../js/v2-core.js');
const U=require('../js/unrated-stats.js');
const demons=[{id:1,name:'Officiel',position:1,requirement:100,verifier:'a'},
{id:2,name:'Unrated',position:0,unrated:true,unrated_position:30,requirement:100,verifier:'a'}];
const players=[{player_key:'a',username:'A',display_name:'A'},{player_key:'b',username:'B',display_name:'B'}];
const data=U.calculate(V2,demons,[{demon_id:2,player:'A',progress:100},{demon_id:2,player:'B',progress:65},{demon_id:1,player:'B',progress:100}],players);
assert.equal(data.demons.length,1);
assert.equal(data.totalCompletions,1);
assert.equal(data.players.find(p=>p.player_key==='a').verifications,1);
assert.equal(data.players.find(p=>p.player_key==='a').completions,1);
assert.equal(data.players.find(p=>p.player_key==='a').points,Math.round(V2.actualPoints(data.demons[0],100)*100)/100); // no double-credit verifier
assert.equal(data.players.find(p=>p.player_key==='b').points,0);
assert.equal(V2.decorate(demons,false).length,1); // official list unchanged
console.log('UNRATED stats tests PASS');

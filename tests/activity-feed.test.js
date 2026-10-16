const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ctx={window:{}};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/activity-feed.js'),'utf8'),ctx);
const feed=ctx.window.DLFR_ACTIVITY;
const now=Date.parse('2026-10-16T18:00:00Z');
const data={
 players:[{player_key:'alice'},{player_key:'bob'},{player_key:'hidden',hidden_from_stats:true}],
 demons:[{id:1,name:'A',is_public:true},{id:2,name:'B',is_public:false}],
 completions:[
 {id:1,player:'Alice',demon_id:1,progress:100,created_at:'2026-10-15T18:00:00Z'},
 {id:2,player:'bob',demon_id:1,progress:60,created_at:'2026-10-15T18:00:00Z'},
 {id:3,player:'alice',demon_id:2,progress:100,created_at:'2026-10-15T18:00:00Z'},
 {id:4,player:'hidden',demon_id:1,progress:100,created_at:'2026-10-15T18:00:00Z'},
 {id:5,player:'alice',demon_id:1,progress:100,created_at:'2024-10-15T18:00:00Z'}],
 badge_awards:[{player_key:'bob',badge_id:'win',obtained_at:'2026-10-16T11:00:00Z'},
 {player_key:'bob',badge_id:'old',obtained_at:null}]
};
const badges={definitions:[{id:'win',label:'Victoire',symbol:'✦'},{id:'old',label:'Vieux'}],visibleAwards:()=>[{badge_id:'win'}]};
const all=feed.events(data,{now,days:60,badges});
assert.equal(all.length,2);
assert.equal(all[0].type,'badge');
assert.equal(all[1].playerKey,'alice');
assert.equal(feed.events(data,{now,days:60,badges,onlyKeys:['alice']}).length,1);
assert.equal(feed.events(data,{now,days:60,badges,onlyKeys:[]}).length,0);
assert.equal(feed.events(data,{now,days:1,badges}).length,2);
const choices=feed.discover(data.players,{now,exclude:['BOB','hidden'],limit:4});
assert.equal(choices.length,1);assert.equal(choices[0].player_key,'alice');
assert.deepEqual(JSON.parse(JSON.stringify(feed.discover(data.players,{now,limit:2}))),JSON.parse(JSON.stringify(feed.discover(data.players,{now,limit:2}))));
console.log('DLFR 2.1 activité : OK');

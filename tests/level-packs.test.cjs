const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');
const path=require('node:path');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/level-packs.js'),'utf8'),context);
const api=context.window.DLFR_LEVEL_PACKS;
const badgeDefinitions=[{id:'faucheur-liste',label:'Faucheur de liste',rarity:'Epic'}];
const mockBadges={definitions:badgeDefinitions,visibleAwards:(d,key)=>d.badge_awards.filter(a=>a.player_key===key)};
const data={
 badge_awards:[{player_key:'alex',badge_id:'faucheur-liste'}],
 dlfr_profile_preferences:[{player_key:'alex',frame_key:'badge:faucheur-liste'},{player_key:'other',frame_key:'badge:faucheur-liste'}],
 dlfr_level_packs:[{id:7,reward_kind:'badge',reward_label:'Stellaire'},{id:8,reward_kind:'title',reward_label:'Explorateur'}],
 dlfr_level_pack_claims:[{pack_id:7,player_key:'alex'},{pack_id:8,player_key:'alex'}],
 dlfr_level_pack_levels:[{pack_id:7,demon_id:10,sort_order:1},{pack_id:7,demon_id:11,sort_order:2}],
 fr_achievements:[{player_key:'alex'}],hall_of_fame:[{player_key:'alex',is_published:true}],
 completions:[{player:'alex',progress:100,demon_id:10},{player:'alex',progress:63,demon_id:11},{player:'other',progress:100,demon_id:11}]
};
test('cadres débloqués seulement par des récompenses obtenues',()=>{
 const choices=api.frames(data,'alex',mockBadges);
 assert(choices.some(f=>f.id==='badge:faucheur-liste'));
 assert(choices.some(f=>f.id==='pack:7'));
 assert(!choices.some(f=>f.id==='pack:8'));
 assert(choices.some(f=>f.id==='achievement:fr'));
 assert(choices.some(f=>f.id==='achievement:hall'));
 assert.equal(api.frame(data,'other',mockBadges).id,'none');
});
test('progression de pack seulement sur records 100% du même joueur',()=>{
 let p=api.progress(data,data.dlfr_level_packs[0],'alex');
 assert.equal(p.earned,1);assert.equal(p.total,2);assert.equal(p.done,false);assert.equal(p.claimed,true);
 data.completions.push({player:'alex',progress:100,demon_id:11});
 p=api.progress(data,data.dlfr_level_packs[0],'alex');
 assert.equal(p.done,true);
});
test('structure interface et migration présentes',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/40_CADRES_DISCORD_LEVEL_PACKS.sql'),'utf8');
 assert(app.includes('data-form="levelPackEditor"'));
 assert(app.includes('data-form="chooseFrame"'));
 assert(app.includes("page==='packs'?packPage()"));
 assert(sql.includes("CREATE OR REPLACE FUNCTION public.dlfr_claim_level_pack"));
 assert(sql.includes("c.progress=100"));
 assert(sql.includes("SELECT auth.uid()"));
});

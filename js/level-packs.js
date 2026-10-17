/* DLFR 2.7 — helpers purs pour les cadres et Level Packs. */
(function(global){'use strict';
const norm=v=>String(v??'').trim().toLocaleLowerCase('fr');
const rarityClass={'Beginner':'beginner','Impressive':'impressive','Epic':'epic','Légendaire':'legendary','Mythique':'mythic','Ultra':'ultra'};
function frames(data,playerKey,badges){
 const claimed=(data.dlfr_level_pack_claims||[]).filter(c=>norm(c.player_key)===norm(playerKey));
 const allPacks=new Map((data.dlfr_level_packs||[]).map(p=>[Number(p.id),p]));
 const result=[{id:'none',label:'Sans cadre',css:'none'}];
 for(const a of (badges?.visibleAwards?.(data,playerKey)||[])){
  const def=(badges.definitions||[]).find(b=>String(b.id)===String(a.badge_id));
  if(def)result.push({id:'badge:'+String(def.id),label:def.label+' · '+def.rarity,css:rarityClass[def.rarity]||'beginner'});
 }
 if((data.fr_achievements||[]).some(x=>norm(x.player_key)===norm(playerKey)))result.push({id:'achievement:fr',label:'Exploit français · Cristal',css:'achievement'});
 if((data.hall_of_fame||[]).some(x=>norm(x.player_key)===norm(playerKey)&&x.is_published))result.push({id:'achievement:hall',label:'Distinction · Royal',css:'hall'});
 for(const c of claimed){const pack=allPacks.get(Number(c.pack_id));if(pack?.reward_kind==='badge')result.push({id:'pack:'+Number(pack.id),label:pack.reward_label,css:'pack'});}
 return result;
}
function frame(data,playerKey,badges){
 const preference=(data.dlfr_profile_preferences||[]).find(x=>norm(x.player_key)===norm(playerKey));
 const chosen=String(preference?.frame_key||'none');
 return frames(data,playerKey,badges).find(f=>f.id===chosen)||frames(data,playerKey,badges)[0];
}
function progress(data,pack,playerKey){
 const entries=(data.dlfr_level_pack_levels||[]).filter(x=>Number(x.pack_id)===Number(pack.id)).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order));
 const completed=new Set((data.completions||[]).filter(c=>norm(c.player)===norm(playerKey)&&Number(c.progress)===100).map(c=>Number(c.demon_id)));
 const earned=entries.filter(x=>completed.has(Number(x.demon_id))).length;
 const claimed=(data.dlfr_level_pack_claims||[]).some(x=>Number(x.pack_id)===Number(pack.id)&&norm(x.player_key)===norm(playerKey));
 return {total:entries.length,earned,claimed,done:entries.length>=2&&earned===entries.length,entries};
}
global.DLFR_LEVEL_PACKS={frames,frame,progress};
})(typeof window!=='undefined'?window:globalThis);

/* DLFR 2.0 — présentation communautaire. Aucun accès Supabase dans ce module. */
(function(){'use strict';
 const hex=value=>/^#[a-f0-9]{6}$/i.test(String(value||''))?String(value).toLowerCase():'#287bba';
 const ownedBadges=(data,playerKey,badges)=>{
   const defs=new Map((badges.definitions||[]).map(x=>[String(x.id),x]));
   return badges.visibleAwards(data,playerKey).map(a=>({id:String(a.badge_id),award:a,def:defs.get(String(a.badge_id))})).filter(x=>x.def);
 };
 const ownedTitles=(data,playerKey)=>{
   const ids=new Set((data.player_profile_titles||[]).filter(t=>t.player_key===playerKey).map(t=>String(t.title_id)));
   return (data.profile_titles||[]).filter(t=>t.is_active!==false&&ids.has(String(t.id)));
 };
 const showcase=(data,playerKey)=> (data.dlfr_profile_showcase||[]).filter(s=>s.player_key===playerKey).sort((a,b)=>Number(a.slot)-Number(b.slot));
 const following=(data,key)=> (data.dlfr_profile_follows||[]).filter(x=>x.follower_key===key);
 const followers=(data,key)=> (data.dlfr_profile_follows||[]).filter(x=>x.followed_key===key);
 window.DLFR_COMMUNITY={hex,ownedBadges,ownedTitles,showcase,following,followers};
})();

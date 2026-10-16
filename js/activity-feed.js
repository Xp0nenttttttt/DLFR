/* DLFR 2.1 — Fil communautaire (lecture seule des complétions approuvées et badges attribués). */
(function(){
 'use strict';
 const norm=value=>String(value??'').trim().toLocaleLowerCase('fr');
 const millis=value=>{if(!value)return NaN;const t=new Date(value).getTime();return Number.isFinite(t)?t:NaN;};
 // Le champ created_at indique la date d'enregistrement, et pas forcément celle du clear.
 function events(data,options={}){
   const only=options.onlyKeys ? new Set([...options.onlyKeys].map(norm)) : null;
   const limit=Math.max(0,Math.min(100,Number(options.limit)||40));
   const now=Number.isFinite(options.now)?options.now:Date.now();
   const days=Number.isFinite(options.days)?Math.max(1,options.days):365;
   const earliest=now-days*86400000;
   const players=new Map((data.players||[]).filter(p=>!p.hidden_from_stats).map(p=>[norm(p.player_key),p]));
   const levels=new Map((data.demons||[]).filter(d=>d.is_public!==false).map(d=>[String(d.id),d]));
   const result=[];
   for(const row of data.completions||[]){
     if(Number(row.progress)!==100)continue;
     const playerKey=norm(row.player),t=millis(row.created_at),level=levels.get(String(row.demon_id));
     if(!players.has(playerKey)||!level||!Number.isFinite(t)||t<earliest||t>now+86400000||(only&&!only.has(playerKey)))continue;
     result.push({type:'completion',id:'completion:'+row.id,playerKey,at:t,levelId:level.id,levelName:level.name,levelPosition:level.position,videoUrl:row.video_url||''});
   }
   const definitions=new Map((options.badges?.definitions||[]).map(b=>[String(b.id),b]));
   const byPlayer=new Map();
   for(const row of data.badge_awards||[]){
     const playerKey=norm(row.player_key),t=millis(row.obtained_at),badge=definitions.get(String(row.badge_id));
     if(!players.has(playerKey)||!badge||!Number.isFinite(t)||t<earliest||t>now+86400000||(only&&!only.has(playerKey)))continue;
     if(!byPlayer.has(playerKey))byPlayer.set(playerKey,[]);
     byPlayer.get(playerKey).push({row,t,badge});
   }
   for(const [playerKey,rows] of byPlayer){
     // Réutilise les règles métier NLW : un badge révoqué n'est pas annoncé.
     const valid=new Set((options.badges?.visibleAwards?.(data,playerKey)||[]).map(a=>String(a.badge_id)));
     for(const {row,t,badge} of rows){
       if(valid.has(String(row.badge_id)))result.push({type:'badge',id:'badge:'+playerKey+':'+row.badge_id,playerKey,at:t,badgeId:badge.id,badgeName:badge.label,badgeSymbol:badge.symbol||'✦'});
     }
   }
   result.sort((a,b)=>b.at-a.at || a.id.localeCompare(b.id));
   return result.slice(0,limit);
 }
 // Rotation éditorialement neutre : ce sont des suggestions, pas des distinctions.
 function discover(players,options={}){
   const exclude=new Set((options.exclude||[]).map(norm));
   const start=Number.isFinite(options.now)?options.now:Date.now();
   const week=Math.floor(start/(7*86400000));
   const pool=(players||[]).filter(p=>p&&p.player_key&&!p.hidden_from_stats&&!exclude.has(norm(p.player_key)));
   function score(value){let h=(0x811c9dc5^week)>>>0;for(const char of String(value)){h=Math.imul(h^char.charCodeAt(0),0x01000193)>>>0;}return h;}
   return pool.sort((a,b)=>score(a.player_key)-score(b.player_key)||String(a.player_key).localeCompare(String(b.player_key))).slice(0,Math.max(0,Math.min(6,options.limit??3)));
 }
 window.DLFR_ACTIVITY={events,discover};
})();

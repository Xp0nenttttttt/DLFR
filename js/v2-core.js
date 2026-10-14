/* V2 engine: pure, testable rules shared by every view. No network or DOM access. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DLFR_V2=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const clean=s=>String(s??'').trim().toLocaleLowerCase('fr');
 const LIMIT=150;
 const tierNames=['I','II','III','IV','V','VI','VII','VIII','IX','ULTIME'];
 const reaperSteps=[1,5,10,20,35,50,75,100,125,150];
 const challengeSteps=[150,100,75,50,30,10,1];
 function decorate(demons,unrated=false){
  const rated=demons.filter(d=>!d.unrated).map(d=>({...d,original_position:Number(d.position),position:Number(d.position)}));
  if(!unrated)return rated.sort((a,b)=>a.position-b.position);
  const extra=demons.filter(d=>d.unrated).map(d=>({...d,original_position:null,requested_position:Math.max(1,Number(d.unrated_position)||151)})).sort((a,b)=>a.requested_position-b.requested_position||String(a.name).localeCompare(String(b.name)));
  const positions=extra.map(d=>d.requested_position);
  for(const d of rated)d.position=d.original_position+positions.filter(p=>p<=d.original_position).length;
  for(let i=0;i<extra.length;i++)extra[i].position=extra[i].requested_position+i;
  return [...rated,...extra].sort((a,b)=>a.position-b.position||Number(!!b.unrated)-Number(!!a.unrated));
 }
 function nlwRank(d){const p=Number(d?.position);return d?.is_public===false||d?.legacy===true||d?.unrated||!Number.isSafeInteger(p)||p<=LIMIT||p>=100000000?0:p-LIMIT;}
 // Independent provisional NLW scale, never mixed into official primary score.
 // NLW v2.8.2: stable power-law curve independent of the total list size.
 // Exponent > 1 means that even an endlessly growing NLW has a bounded
 // theoretical maximum for the sum of all awarded points.
 const NLW_SCORING_VERSION='nlw-2026-01';
 function nlwPoints(d,progress=100){
  const p=nlwRank(d);
  if(!Number.isSafeInteger(p)||p<1||Number(progress)<100||d?.unrated)return 0;
  const amount=100/Math.pow(1+(p-1)/130,1.5);
  return Math.round(amount*100)/100;
 }
 function primaryPoints(d,progress=100,baseScore,top1=350){return Number(d.position)>0&&Number(d.position)<=LIMIT?baseScore(d,progress,top1):0;}
 function mainCompleted(r,d){return Number(r.progress)>=100&&!!d&&Number(d.position)>0&&Number(d.position)<=LIMIT;}
 function historicalLegacy(r,d){if(!d?.legacy||Number(r.progress)<100)return false;
  if(r.completed_in_top150===true)return true;
  if(r.completed_in_top150===false)return false;
  if(!d.legacy_since&&Number(d.position)<=LIMIT)return true;
  // No date or former rank proof: don't award a Legacy completion without evidence.
  return Boolean(d.legacy_since&&r.created_at&&String(r.created_at).slice(0,10)<String(d.legacy_since).slice(0,10));
 }
 function badgeFor(prefix,n,steps,kind){let i=-1;steps.forEach((threshold,index)=>{if(kind!=='hardest'&&n>=threshold)i=index;});
  if(kind==='hardest'){i=-1;for(let j=0;j<steps.length;j++)if(n>0&&n<=steps[j])i=j;}
  return i<0?null:{id:prefix,level:i+1,name:prefix+' '+(kind==='hardest'?['I','II','III','IV','V','VI','ULTIME'][i]:tierNames[i]),goal:steps[i]};
 }
 function badges(player,demons,completions){const catalog=new Map(demons.map(d=>[Number(d.id),d]));let active=0,hardest=Infinity;
  const seen=new Set();for(const r of completions){if(clean(r.player)!==clean(player.player_key)&&clean(r.player)!==clean(player.username))continue;
   const d=catalog.get(Number(r.demon_id));if(!d||Number(r.progress)<100||seen.has(d.id))continue;seen.add(d.id);
   if(Number(d.position)<=LIMIT&&Number(d.position)>0){active++;hardest=Math.min(hardest,Number(d.position));}
  }
  const verified=demons.filter(d=>clean(d.verifier)===clean(player.player_key)||clean(d.verifier)===clean(player.username)).length;
  return [badgeFor('Faucheur de liste',active,reaperSteps),badgeFor('Vérificateur',verified,reaperSteps),badgeFor('Amateur de difficulté',hardest,challengeSteps,'hardest')].filter(Boolean);
 }
 function primaryBase(p){return p>=56?1.039035131*((185.7*Math.exp(-.02715*p))+14.84):p>=36?1.0371139743*((212.61*Math.pow(1.036,1-p))+25.071):p>=21?((250-83.389)*Math.pow(1.0099685,2-p)-31.152)*1.0371139743:p>=4?((326.1*Math.exp(-.0871*p))+51.09)*1.037117142:p>=1?(-18.2899079915*p)+368.2899079915:0;}
 function actualPoints(d,progress=100,top1=350){const pos=Number(d.position),min=Math.max(1,Math.min(100,Number(d.requirement)||100));if(pos<1||pos>LIMIT||Number(progress)<min)return 0;
  const base=primaryBase(pos)*Number(top1)/primaryBase(1);return Number(progress)===100?base:base*Math.pow(5,(Number(progress)-min)/Math.max(1,100-min))/10;}
 function project(players,demons,completions,unrated=false){const catalog=decorate(demons,unrated),map=new Map(catalog.map(d=>[Number(d.id),d]));const rows=new Map(players.map(p=>[clean(p.player_key),{...p,main_score:0,nlw_score:0,main_count:0,nlw_count:0}]));
  // Always retain the best valid progress per player and level; the order
  // of imported records must never affect the computed standings.
  const best=new Map();for(const r of completions){
   const d=map.get(Number(r.demon_id)),player=rows.get(clean(r.player));if(!player||!d)continue;
   const progress=Number(r.progress);if(!Number.isFinite(progress)||progress<0||progress>100)continue;
   const unique=clean(player.player_key)+'|'+Number(d.id);
   const prev=best.get(unique);if(!prev||progress>prev.progress)best.set(unique,{player,d,progress});
  }
  for(const {player,d,progress} of best.values()){
   if(d.unrated||d.is_public===false)continue; // Niveaux caches ou UNRATED : pas de points NLW.
   const position=Number(d.position);
   if(position>=1&&position<=LIMIT)player.main_score+=actualPoints(d,progress);
   else if(nlwRank(d)>0)player.nlw_score+=nlwPoints(d,progress);
   if(progress===100){if(position>=1&&position<=LIMIT)player.main_count++;else if(nlwRank(d)>0)player.nlw_count++;}
  }
  const output=[...rows.values()];output.forEach(p=>{p.main_score=Math.round(p.main_score*100)/100;p.nlw_score=Math.round(p.nlw_score*100)/100;});
  for(const col of ['main','nlw']){const sorted=[...output].sort((a,b)=>b[col+'_score']-a[col+'_score']);sorted.forEach((p,i)=>{p[col+'_rank']=col==='nlw'&&p.nlw_score<=0?null:i+1;});}
  return output;
 }
 function csvParse(text){const rows=[],line=[];let buf='',quoted=false;const src=String(text).replace(/^\uFEFF/,'');for(let i=0;i<src.length;i++){let ch=src[i];if(ch==='"'){if(quoted&&src[i+1]==='"'){buf+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&(ch===','||ch===';'||ch==='\n')){line.push(buf);buf='';if(ch==='\n'){rows.push([...line]);line.length=0;}}
  else if(ch!=='\r'||quoted)buf+=ch;
 }line.push(buf);if(line.some(s=>s.trim()))rows.push(line);return rows;}
 function parseAredl(text){const rows=csvParse(text);if(!rows.length)return[];const header=rows[0].map(clean),ix=header.findIndex(x=>['name','level','level name','niveau','level_name'].includes(x));const start=ix>=0?1:0;return rows.slice(start).map((r,i)=>({name:(r[ix>=0?ix:0]||'').trim(),aredl_rank: ix>=0?(r[header.findIndex(x=>['rank','position'].includes(x))]||''):''})).filter(x=>x.name).slice(0,20000);}
 return {LIMIT,NLW_SCORING_VERSION,decorate,nlwRank,nlwPoints,primaryPoints,mainCompleted,historicalLegacy,badges,actualPoints,project,csvParse,parseAredl,reaperSteps,challengeSteps};
});

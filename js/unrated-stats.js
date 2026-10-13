/* DLFR V2.4 — statistiques UNRATED indépendantes, sans réseau. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DLFR_UNRATED_STATS=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const norm=x=>String(x||'').trim().toLocaleLowerCase('fr');
 function calculate(v2,demons,records,players,top1Points=350){
  const unrated=v2.decorate(demons,true).filter(d=>d.unrated),byId=new Map(unrated.map(d=>[Number(d.id),d]));
  const output=new Map(players.map(p=>[norm(p.player_key),{player_key:p.player_key,name:p.display_name||p.username||p.player_key,points:0,completions:0,verifications:0,hardest:null}]));
  const ensure=x=>output.get(norm(x));
  const already=new Map(),completed=new Set();
  for(const record of records){const d=byId.get(Number(record.demon_id)),p=ensure(record.player);if(!p||!d)continue;
   const id=p.player_key+'|'+d.id,prev=already.get(id)||0;
   const earned=v2.actualPoints(d,Number(record.progress),top1Points);
   if(earned>prev){p.points+=earned-prev;already.set(id,earned);}
   if(Number(record.progress)>=100&&!completed.has(id)){
    completed.add(id);p.completions++;
    if(!p.hardest||Number(d.position)<Number(p.hardest.position))p.hardest=d;
   }
  }
  for(const d of unrated){const verifier=ensure(d.verifier);if(!verifier)continue;
   verifier.verifications++;
   // Comme les démons classés : ne pas compter deux fois une vérification déjà complétée.
   const id=verifier.player_key+'|'+d.id,full=v2.actualPoints(d,100,top1Points);
   verifier.points+=Math.max(0,full-(already.get(id)||0));
  }
  return {demons:unrated,players:[...output.values()].map(p=>({...p,points:Math.round(p.points*100)/100})).sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name)),totalCompletions:completed.size,totalVerifications:unrated.filter(d=>String(d.verifier||'').trim()).length};
 }
 return {calculate};
});

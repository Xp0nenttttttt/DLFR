/* DLFR - validation des records et création éventuelle de niveaux (démo uniquement).
   La version de production doit faire cette opération dans une transaction côté serveur/RPC. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DLFR_SUBMISSIONS=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const norm=v=>String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 function findLevel(demons,sub){const id=String(sub.level_id||'').trim();return demons.find(d=>(id&&String(d.level_id||'').trim()===id)||norm(d.name)===norm(sub.level_name));}
 function approve(data,id,choice={},role='owner',today='2026-10-13'){
  if(!['owner','editor','nlw_editor'].includes(role))throw Error('Rôle non autorisé.');
  const entries=data.level_submissions||[];
  const index=entries.findIndex(x=>String(x.id)===String(id));
  if(index===-1||entries[index].status!=='pending')throw Error('Soumission introuvable ou déjà traitée.');
  const submission=entries[index],existing=findLevel(data.demons,submission);
  const demons=data.demons.map(x=>({...x}));
  const completions=data.completions.map(x=>({...x}));
  let demon=existing?demons.find(x=>x.id===existing.id):null;
  let created=false;
  if(!demon){
   if(!['rated','unrated'].includes(choice.rating))throw Error('Choisis Rated ou UNRATED pour ce nouveau niveau.');
   const position=Number(choice.position);
   if(!Number.isInteger(position)||position<1||position>99999)throw Error('Entre une position valide (entier positif).');
   if(role==='nlw_editor'&&position<=150)throw Error('Les modérateurs NLW ne peuvent insérer que des niveaux au-delà du rang 150.');
   const nextId=Math.max(0,...demons.map(d=>Number(d.id)||0))+1;
   if(choice.rating==='rated'){
    for(const d of demons){if(!d.unrated&&Number(d.position)>=position){
     const former=Number(d.position);d.position=former+1;
     if(former<=150&&d.position>150){d.legacy=true;d.legacy_since=d.legacy_since||today;}
    }}
    demon={id:nextId,position,unrated:false,unrated_position:null};
   }else{
    const afterRated=Math.max(150,...demons.filter(d=>!d.unrated).map(d=>Number(d.position)||0));
    const afterUnrated=Math.max(0,...demons.filter(d=>d.unrated).map(d=>Number(d.position)||0));
    demon={id:nextId,position:Math.max(afterRated,afterUnrated)+1,unrated:true,unrated_position:position};
   }
   Object.assign(demon,{name:String(submission.level_name).trim(),level_id:String(submission.level_id||'').trim(),publisher:String(submission.publisher||submission.creator||'').trim(),creator:String(submission.creator||'').trim(),verifier:String(submission.verifier||'').trim(),video_url:String(submission.video_url||'').trim(),difficulty:'Extreme Demon',requirement:Number(choice.requirement||100),legacy:false,created_at:new Date(today+'T12:00:00Z').toISOString()});
   if(!demon.name)throw Error('Le niveau doit avoir un nom.');
   if(!demon.publisher)throw Error('Il faut indiquer le publieur du niveau.');
   if(!Number.isInteger(demon.requirement)||demon.requirement<1||demon.requirement>100)throw Error('Progression minimum invalide.');
   demons.push(demon);created=true;
  } else if(role==='nlw_editor'&&!demon.unrated&&Number(demon.position)<=150){
   throw Error('Un modérateur NLW ne peut pas valider de records dans le Top 150.');
  } else if(role==='nlw_editor'&&demon.unrated&&Number(demon.unrated_position)<=150){
   throw Error('Un modérateur NLW ne peut pas gérer un UNRATED du Top 150 alternatif.');
  }
  const player=String(submission.player||'').trim();const progress=Number(submission.progress);
  if(!player||!Number.isInteger(progress)||progress<1||progress>100)throw Error('Nom du joueur ou progression invalide.');
  const previous=completions.find(c=>Number(c.demon_id)===Number(demon.id)&&norm(c.player)===norm(player));
  if(previous&&Number(previous.progress)>=progress)throw Error('Ce joueur possède déjà un record au moins aussi élevé sur ce niveau.');
  const record={id:previous?previous.id:Math.max(0,...completions.map(c=>Number(c.id)||0))+1,demon_id:demon.id,player,progress,video_url:String(submission.video_url||''),created_at:submission.submitted_at||new Date(today+'T12:00:00Z').toISOString()};
  if(previous)Object.assign(previous,record);else completions.push(record);
  const submissions=entries.map((s,i)=>i===index?{...s,status:'accepted',reviewed_at:today,rating_result:demon.unrated?'unrated':'rated',demon_id:demon.id}:s);
  return {data:{...data,demons,completions,level_submissions:submissions},created,demon,record};
 }
 function reject(data,id){const index=(data.level_submissions||[]).findIndex(s=>String(s.id)===String(id)&&s.status==='pending');if(index===-1)throw Error('Soumission introuvable ou déjà traitée.');return {...data,level_submissions:data.level_submissions.map((s,i)=>i===index?{...s,status:'rejected'}:s)};}
 return {norm,findLevel,approve,reject};
});

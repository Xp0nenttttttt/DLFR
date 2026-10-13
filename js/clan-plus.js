/* DLFR V2.2 — Calculs AREDL-inspirés + candidatures & gestion (mode démo seulement).
   Ne représente pas une authentification : appliquer les mêmes règles côté SQL en production. */
(function(root,factory){const out=factory();if(typeof module==='object'&&module.exports)module.exports=out;else root.DLFR_CLAN_PLUS=out;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const key=s=>String(s??'').trim().toLocaleLowerCase('fr');
const hex=s=>/^#[0-9a-f]{6}$/i.test(String(s||''))?s:'#287bba';
const members=(data,id)=>data.clan_members.filter(m=>Number(m.clan_id)===Number(id));
const clan=(data,id)=>data.clans.find(x=>Number(x.id)===Number(id));
const membership=(data,person)=>data.clan_members.find(m=>key(m.player_key)===key(person));
const canManage=(data,id,actor)=>{const m=membership(data,actor);return m&&Number(m.clan_id)===Number(id)&&['leader','officer'].includes(m.role);};
const isLeader=(data,id,actor)=>{const m=membership(data,actor);return m&&Number(m.clan_id)===Number(id)&&m.role==='leader';};
const account=(data,player)=>data.players.some(p=>key(p.player_key)===key(player)&&p.has_account&&!p.hidden_from_stats);
const nextId=a=>Math.max(0,...a.map(x=>Number(x.id)||0))+1;
function stats(data, ranked, demons, pointsFor){
 const records=data.completions||[], roster=data.clan_members||[], cl=data.clans||[];
 const demonById=new Map(demons.map(d=>[Number(d.id),d]));const playerByKey=new Map(ranked.map(p=>[key(p.player_key),p]));
 const result=cl.map(c=>{
   const mm=roster.filter(m=>Number(m.clan_id)===Number(c.id));const keys=new Set(mm.map(m=>key(m.player_key)));
   const people=mm.map(m=>playerByKey.get(key(m.player_key))).filter(Boolean);
   const unique=new Map();const completions=[];
   for(const record of records){const who=key(record.player);if(!keys.has(who)||Number(record.progress)<100)continue;const d=demonById.get(Number(record.demon_id));if(!d)continue;
     completions.push({...record,demon:d});const id=Number(d.id);
     if(!unique.has(id))unique.set(id,{demon:d,players:new Set(),first:record.created_at||''});
     const obj=unique.get(id);obj.players.add(who);
     if(record.created_at&&(!obj.first||String(record.created_at)<String(obj.first)))obj.first=record.created_at;
   }
   const entries=[...unique.values()].sort((a,b)=>Number(a.demon.position||Infinity)-Number(b.demon.position||Infinity));
   const top=entries.filter(x=>Number(x.demon.position)>0&&Number(x.demon.position)<=150);
   const nlw=entries.filter(x=>Number(x.demon.position)>150);
   const created=demons.filter(d=>keys.has(key(d.creator))||keys.has(key(d.publisher)));
   const totalPoints=people.reduce((acc,p)=>acc+Number(p.score||0),0);
   const nlwPoints=people.reduce((acc,p)=>acc+Number(p.nlwScore||0),0);
   const levelPoints=top.reduce((acc,item)=>acc+(pointsFor?Number(pointsFor(item.demon,100)||0):0),0);
   const hardest=top[0]?.demon||null;
   return {clan:c,members:mm,people,totalPoints,nlwPoints,levelPoints,completions,entries,top,nlw,created,hardest,hardestPosition:hardest?.position||Infinity,uniqueCount:entries.length,topCount:top.length,mainCount:top.filter(x=>Number(x.demon.position)<=75).length,extendedCount:top.filter(x=>Number(x.demon.position)>75).length};
 });
 function rankedBy(field, desc){const sorted=[...result].sort((a,b)=>desc?(b[field]-a[field]||a.clan.id-b.clan.id):(a[field]-b[field]||a.clan.id-b.clan.id));sorted.forEach((x,i)=>x[`${field}Rank`]=i+1);}
 rankedBy('totalPoints',true);rankedBy('topCount',true);rankedBy('hardestPosition',false);rankedBy('nlwPoints',true);
 return result.sort((a,b)=>b.totalPoints-a.totalPoints||a.clan.id-b.clan.id);
}
function apply(source,cmd){
 const data={...source,clans:(source.clans||[]).map(x=>({...x})),clan_members:(source.clan_members||[]).map(x=>({...x})),clan_invites:(source.clan_invites||[]).map(x=>({...x})),clan_requests:(source.clan_requests||[]).map(x=>({...x}))};
 const actor=key(cmd.actor),target=key(cmd.target),id=Number(cmd.clan_id),kind=cmd.type;
 if(!account(data,actor))throw Error('Compte joueur valide nécessaire.');
 const c=clan(data,id),now=new Date().toISOString();
 if(kind==='update'){
  if(!c||!isLeader(data,id,actor))throw Error('Seul le chef peut modifier la fiche du clan.');
  const name=String(cmd.name||'').trim(),desc=String(cmd.description||'').trim(),banner=String(cmd.banner_url||'').trim(),logo=String(cmd.logo_url||'').trim();
  if(name.length<3||name.length>45||desc.length>500)throw Error('Nom ou description invalide.');
  if(data.clans.some(x=>x.id!==id&&key(x.name)===key(name)))throw Error('Ce nom est déjà utilisé.');
  for(const value of [banner,logo])if(value){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol))throw Error();}catch{throw Error('Les images doivent utiliser une URL HTTP(S).');}}
  Object.assign(c,{name,description:desc,color:hex(cmd.color),banner_url:banner,logo_url:logo,recruiting:!!cmd.recruiting,updated_at:now});return data;
 }
 if(kind==='promote'||kind==='demote'){
  if(!c||!isLeader(data,id,actor)||target===actor)throw Error('Seul le chef peut nommer un officier.');
  const m=membership(data,target);if(!m||Number(m.clan_id)!==id||m.role==='leader')throw Error('Choisis un membre du clan.');
  m.role=kind==='promote'?'officer':'member';return data;
 }
 if(kind==='request'){
  if(!c||!c.recruiting)throw Error('Ce clan n’accepte pas de candidatures.');
  if(membership(data,actor))throw Error('Tu appartiens déjà à un clan.');
  if(members(data,id).length>=25)throw Error('Clan complet.');
  if(data.clan_requests.some(r=>Number(r.clan_id)===id&&key(r.player_key)===actor&&r.status==='pending'))throw Error('Candidature déjà envoyée.');
  data.clan_requests.push({id:nextId(data.clan_requests),clan_id:id,player_key:actor,message:String(cmd.message||'').trim().slice(0,220),status:'pending',created_at:now});return data;
 }
 const request=data.clan_requests.find(r=>Number(r.id)===Number(cmd.request_id));
 if(kind==='withdraw'){
  if(!request||request.status!=='pending'||key(request.player_key)!==actor)throw Error('Candidature introuvable.');
  request.status='withdrawn';return data;
 }
 if(kind==='approve'||kind==='reject'){
  if(!request||request.status!=='pending'||!canManage(data,request.clan_id,actor))throw Error('Action réservée au chef ou à un officier.');
  if(kind==='approve'){
   if(membership(data,request.player_key))throw Error('Le joueur est déjà dans un clan.');
   if(members(data,request.clan_id).length>=25)throw Error('Clan complet.');
   data.clan_members.push({clan_id:request.clan_id,player_key:request.player_key,role:'member'});
   for(const x of data.clan_requests)if(key(x.player_key)===key(request.player_key)&&x.status==='pending')x.status=Number(x.id)===Number(request.id)?'approved':'withdrawn';
   for(const x of data.clan_invites)if(key(x.invitee_key)===key(request.player_key)&&x.status==='pending')x.status='declined';
  }else request.status='rejected';return data;
 }
 throw Error('Action avancée inconnue.');
}
return {key,hex,members,clan,membership,canManage,isLeader,stats,apply};
});

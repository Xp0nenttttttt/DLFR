/* DLFR clans — deterministic rule engine for the local demonstrator.
   This is NOT authorization. In production, enforce all actions with Supabase Auth + Postgres RLS/RPC. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DLFR_CLANS=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const key=x=>String(x??'').trim().toLocaleLowerCase('fr');
const member=(data,who)=>data.clan_members.find(m=>key(m.player_key)===key(who))||null;
const clan=(data,id)=>data.clans.find(c=>Number(c.id)===Number(id))||null;
const leader=(data,id,who)=>{const m=member(data,who);return !!m&&Number(m.clan_id)===Number(id)&&m.role==='leader';};
const account=(data,who)=>data.players.find(p=>key(p.player_key)===key(who)&&p.has_account&&!p.hidden_from_stats)||null;
const pending=(data,who)=>data.clan_invites.filter(i=>i.status==='pending'&&key(i.invitee_key)===key(who));
function apply(source,command){
 const data={...source,clans:[...(source.clans||[])].map(x=>({...x})),clan_members:[...(source.clan_members||[])].map(x=>({...x})),clan_invites:[...(source.clan_invites||[])].map(x=>({...x}))};
 const actor=key(command.actor),target=key(command.target),id=Number(command.clan_id),now=new Date().toISOString();
 if(!account(data,actor))throw Error('Choisis un compte joueur valide.');
 const invitation=data.clan_invites.find(i=>Number(i.id)===Number(command.invite_id));
 switch(command.type){
 case 'create':{
  if(member(data,actor))throw Error('Quitte ton clan actuel avant d’en créer un autre.');
  const name=String(command.name??'').trim(),tag=String(command.tag??'').trim().toUpperCase(),description=String(command.description??'').trim();
  if(name.length<3||name.length>45)throw Error('Le nom doit contenir entre 3 et 45 caractères.');
  if(!/^[A-Z0-9]{2,5}$/.test(tag))throw Error('Le tag doit faire 2 à 5 lettres ou chiffres.');
  if(description.length>300)throw Error('Description trop longue (300 caractères max).');
  if(data.clans.some(c=>key(c.name)===key(name)||key(c.tag)===key(tag)))throw Error('Ce nom ou ce tag est déjà utilisé.');
  const nextId=Math.max(0,...data.clans.map(c=>Number(c.id)||0))+1;
  data.clans.push({id:nextId,name,tag,description,color:/^#[0-9a-f]{6}$/i.test(command.color)?command.color:'#287bba',created_by:actor});
  data.clan_members.push({clan_id:nextId,player_key:actor,role:'leader'});
  return data;
 }
 case 'invite':{
  if(!clan(data,id)||!leader(data,id,actor))throw Error('Seul le chef peut envoyer des invitations.');
  if(!account(data,target))throw Error('Le joueur doit posséder un compte et être visible.');
  if(member(data,target))throw Error('Ce joueur appartient déjà à un clan.');
  if(data.clan_members.filter(m=>Number(m.clan_id)===id).length>=25)throw Error('Limite de 25 membres atteinte.');
  if(data.clan_invites.some(i=>i.status==='pending'&&Number(i.clan_id)===id&&key(i.invitee_key)===target))throw Error('Invitation déjà en attente.');
  const nextId=Math.max(0,...data.clan_invites.map(x=>Number(x.id)||0))+1;
  data.clan_invites.push({id:nextId,clan_id:id,inviter_key:actor,invitee_key:target,status:'pending',created_at:now});return data;
 }
 case 'accept':case 'decline':{
  if(!invitation||invitation.status!=='pending'||key(invitation.invitee_key)!==actor)throw Error('Invitation indisponible pour ce joueur.');
  if(command.type==='accept'){
   if(member(data,actor))throw Error('Tu dois quitter ton clan avant d’accepter une invitation.');
   if(!clan(data,invitation.clan_id))throw Error('Ce clan n’existe plus.');
   if(data.clan_members.filter(m=>Number(m.clan_id)===Number(invitation.clan_id)).length>=25)throw Error('Clan complet.');
   data.clan_members.push({clan_id:invitation.clan_id,player_key:actor,role:'member'});
   // Other invitations cannot be accepted after a player joins a clan.
   for(const x of data.clan_invites)if(x.status==='pending'&&key(x.invitee_key)===actor)x.status=Number(x.id)===Number(invitation.id)?'accepted':'declined';
  }else invitation.status='declined';
  invitation.updated_at=now;return data;
 }
 case 'cancel':{
  if(!invitation||invitation.status!=='pending'||!leader(data,invitation.clan_id,actor))throw Error('Annulation réservée au chef du clan.');
  invitation.status='cancelled';invitation.updated_at=now;return data;
 }
 case 'remove':{
  if(!leader(data,id,actor)||target===actor)throw Error('Seul le chef peut retirer un autre membre.');
  if(!member(data,target)||Number(member(data,target).clan_id)!==id)throw Error('Ce joueur n’appartient pas au clan.');
  data.clan_members=data.clan_members.filter(m=>key(m.player_key)!==target);return data;
 }
 case 'transfer':{
  if(!leader(data,id,actor)||target===actor)throw Error('Seul le chef peut transmettre la direction.');
  const next=member(data,target);if(!next||Number(next.clan_id)!==id)throw Error('Choisis un membre de ton clan.');
  member(data,actor).role='member';next.role='leader';return data;
 }
 case 'leave':{
  const own=member(data,actor);if(!own)throw Error('Tu n’es membre d’aucun clan.');
  if(own.role==='leader')throw Error('Transmets la direction ou dissous le clan avant de partir.');
  data.clan_members=data.clan_members.filter(m=>key(m.player_key)!==actor);return data;
 }
 case 'disband':{
  if(!leader(data,id,actor))throw Error('Seul le chef peut dissoudre le clan.');
  data.clans=data.clans.filter(c=>Number(c.id)!==id);
  data.clan_members=data.clan_members.filter(m=>Number(m.clan_id)!==id);
  data.clan_invites=data.clan_invites.filter(i=>Number(i.clan_id)!==id);
  return data;
 }
 default:throw Error('Action de clan inconnue.');
 }
}
return {key,member,leader,account,pending,apply};
});

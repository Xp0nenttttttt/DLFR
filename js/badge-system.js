/* DLFR V2.8: catalogue officiel de 18 badges; simulation locale (pas de sécurité serveur). */
(function(){'use strict';
const rarities=['Beginner','Impressive','Epic','Légendaire','Mythique','Ultra'];
const categories=[{id:1,name:'Progression Demonlist'},{id:2,name:'Progression NLW'},{id:3,name:'Exploits UNRATED'},{id:4,name:'Distinctions & classements'}];
// kind: list | nlw | unrated | top75 | all150 | manual. Les seuils sont des niveaux distincts à 100 %.
const specs=[
 ['goat-pays','Le Goat tout simplement','Ultra',4,'✧','manual'],
 ['nlwgod','NLWGOD','Ultra',2,'✧','nlw',1000],
 ['god','GOD','Ultra',1,'✧','all150'],
 ['goat-region','Le Goat de ta région','Mythique',4,'✦','manual'],
 ['demi-dieu','Demi Dieu','Mythique',1,'✦','top75'],
 ['clash-clans','Clash of Clans','Légendaire',4,'♛','manual'],
 ['unrated-master','Unrated Master','Légendaire',3,'♛','unrated',10],
 ['grand-faucheur-liste','Grand Faucheur de liste','Légendaire',1,'♛','list',75],
 ['grand-faucheur-nlw','Grand Faucheur NLW','Légendaire',2,'♛','nlw',500],
 ['faucheur-nlw','Faucheur NLW','Epic',2,'◆','nlw',250],
 ['faucheur-liste','Faucheur de liste','Epic',1,'◆','list',35],
 ['cour-grands','Bienvenue dans la cour des grand','Epic',1,'◆','main',1],
 ['cent','100!','Impressive',2,'★','nlw',100],
 ['unrated-premier','Unrated ?','Impressive',3,'★','unrated',1],
 ['bienvenue-club','Bienvenue au club','Impressive',1,'★','list',1],
 ['dix','Dix','Impressive',1,'★','list',10],
 ['bienvenue-nlw','Bienvenue au club NLW','Beginner',2,'✦','nlw',1],
 ['dix-nlw','DixNLW','Beginner',2,'✦','nlw',10]
];
const defs=specs.map(([id,label,rarity,category_id,symbol,rule,threshold])=>({id,label,rarity,category_id,symbol,rule,threshold:threshold||null,automatic:rule!=='manual',manual:rule==='manual',description:''}));
const norm=s=>String(s||'').trim().toLocaleLowerCase('fr');
const slug=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-');
const validDay=s=>/^\d{4}-\d\d-\d\d$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
function init(d){
 if(!Array.isArray(d.badge_awards))d.badge_awards=[];
 // Une seule migration en démo : l'ancien catalogue ET ses anciennes attributions sont remplacés.
 if(d.badge_catalog_version!==28){d.badge_categories=categories.map(c=>({...c}));d.badge_definitions=defs.map(b=>({...b}));d.badge_awards=[];d.badge_deleted_ids=[];d.badge_catalog_version=28;d.badge_baseline_scanned=false;}
 else{d.badge_categories=categories.map(c=>({...c}));d.badge_definitions=defs.map(b=>({...b}));}
 return d;
}
function counts(d,playerKey){
 const byId=new Map((d.demons||[]).map(x=>[String(x.id),x]));
 const groups={list:new Set(),nlw:new Set(),unrated:new Set(),main:new Set()};
 for(const rec of d.completions||[]){
  if(norm(rec.player)!==norm(playerKey)||Number(rec.progress)<100)continue;
  const demon=byId.get(String(rec.demon_id));if(!demon||demon.is_public===false)continue;
  const id=String(demon.id),pos=Number(demon.position);if(demon.unrated===true||demon.unrated===1||demon.unrated==='true'){groups.unrated.add(id);continue;}
  if(pos>=1&&pos<=150){groups.list.add(id);if(pos<=75)groups.main.add(id);}
  // Les positions techniques (>= 100 000 000), les archives Legacy et les
  // niveaux masques ne sont pas des niveaux NLW publies.
  else if(Number.isSafeInteger(pos)&&pos>150&&pos<100000000&&demon.legacy!==true)groups.nlw.add(id);
 }
 const ranked=(d.demons||[]).filter(x=>!(x.unrated===true||x.unrated===1||x.unrated==='true')&&Number(x.position)>=1&&Number(x.position)<=150);
 return {list:groups.list.size,nlw:groups.nlw.size,unrated:groups.unrated.size,main:groups.main.size,all150:ranked.length===150&&ranked.every(x=>groups.list.has(String(x.id))),top75:ranked.filter(x=>Number(x.position)<=75).length===75&&ranked.filter(x=>Number(x.position)<=75).every(x=>groups.main.has(String(x.id)))};
}
function captureAutomatic(d,players,day,first=false){
 init(d);if(!validDay(day))throw Error('Date système invalide.');let changed=false;
 // Utilise les vrais enregistrements de complétion, jamais un record partiel ni les badges historiques.
 for(const p of players||[]){const k=norm(p.player_key);if(!k)continue;const c=counts(d,k);
  for(const b of defs.filter(x=>x.automatic)){
   const earned=b.rule==='all150'?c.all150:b.rule==='top75'?c.top75:b.rule==='main'?c.main>=b.threshold:c[b.rule]>=b.threshold;
   if(earned&&!d.badge_awards.some(a=>norm(a.player_key)===k&&String(a.badge_id)===b.id)){
    d.badge_awards.push({player_key:k,badge_id:b.id,obtained_at:first?null:day,origin:first?'first-import':'automatic'});changed=true;
   }
  }
 }return changed;
}
function grant(d,playerKey,badgeId,day){
 init(d);const badge=defs.find(x=>x.id===String(badgeId));if(!badge)throw Error('Badge introuvable.');
 if(!badge.manual)throw Error('Ce badge est attribué automatiquement à partir des records : attribution manuelle interdite.');
 const k=norm(playerKey);if(!(d.players||[]).some(x=>norm(x.player_key)===k))throw Error('Joueur introuvable.');
 if(!validDay(day)||day>new Date().toISOString().slice(0,10))throw Error('Date invalide ou future.');
 if(d.badge_awards.some(a=>norm(a.player_key)===k&&String(a.badge_id)===badge.id))throw Error('Badge déjà obtenu : il est permanent.');
 d.badge_awards.push({player_key:k,badge_id:badge.id,obtained_at:day,origin:'moderator'});
}
function uneditable(){throw Error('Le catalogue V2.8 est défini par la liste officielle : modification désactivée.');}
function visibleAwards(d,playerKey){
 // Attributions historiques conservees dans Supabase; n'afficher les badges
 // NLW que si leur seuil correspond aujourd'hui a des 100% publies et eligibles.
 const earned=counts(d,playerKey);
 return (d.badge_awards||[]).filter(a=>{
  if(norm(a.player_key)!==norm(playerKey))return false;
  const badge=defs.find(b=>b.id===String(a.badge_id));
  return badge?.rule!=='nlw'||earned.nlw>=Number(badge.threshold||1);
 });
}
function catalog(d,playerKey,esc,date){init(d);const owned=new Map(visibleAwards(d,playerKey).map(a=>[String(a.badge_id),a]));return categories.map(cat=>`<section class="badge-catalog-category"><h4>${esc(cat.name)}</h4><div class="badge-collection">${defs.filter(b=>b.category_id===cat.id).sort((a,b)=>rarities.indexOf(b.rarity)-rarities.indexOf(a.rarity)).reverse().map(b=>{const a=owned.get(b.id);return `<div class="dlfr-badge ${a?'':'badge-locked'}" data-rarity="${slug(b.rarity)}" title="${a?'Obtenu':'Non obtenu'}"><span class="dlfr-badge-icon" aria-hidden="true">${a?esc(b.symbol):'?'}</span><span class="dlfr-badge-copy"><span class="dlfr-badge-name">${esc(b.label)}</span><span class="dlfr-badge-meta">${esc(b.rarity)} · ${a?'Obtenu'+(a.obtained_at?' le '+esc(date(a.obtained_at)):' · date inconnue'):'À découvrir'}</span></span></div>`;}).join('')}</div></section>`).join('');}
function gallery(d,playerKey,esc,date){init(d);const owned=visibleAwards(d,playerKey).map(a=>({a,b:defs.find(b=>b.id===String(a.badge_id))})).filter(x=>x.b).sort((x,y)=>rarities.indexOf(y.b.rarity)-rarities.indexOf(x.b.rarity));return owned.length?`<div class="badge-collection">${owned.map(({a,b})=>`<div class="dlfr-badge" data-rarity="${slug(b.rarity)}" title="${esc(b.label)} · ${a.obtained_at?esc(date(a.obtained_at)):'Date antérieure inconnue'}"><span class="dlfr-badge-icon">${esc(b.symbol)}</span><span class="dlfr-badge-copy"><span class="dlfr-badge-name">${esc(b.label)}</span><span class="dlfr-badge-meta">${esc(b.rarity)} · ${a.obtained_at?esc(date(a.obtained_at)):'Date antérieure inconnue'}</span></span></div>`).join('')}</div>`:'';}
window.DLFR_BADGES={definitions:defs,rarities,init,counts,visibleAwards,captureAutomatic,grant,catalog,gallery,addCategory:uneditable,create:uneditable,deleteBadge:uneditable,deleteCategory:uneditable};
})();

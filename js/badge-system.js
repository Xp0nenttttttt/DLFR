/* DLFR V2.8 → V123 : catalogue officiel de 33 badges, avec icône, description et indice.
 * Attribution réelle côté Supabase (dlfr_award_progress, déclenchée par les records ET les vérifications).
 * Ici : affichage + simulation locale (démo). */
(function(){'use strict';
const rarities=['Beginner','Impressive','Epic','Légendaire','Mythique','Ultra'];
const categories=[{id:1,name:'Progression Demonlist'},{id:5,name:'Vérifications'},{id:2,name:'Progression NLW'},{id:3,name:'Exploits UNRATED'},{id:4,name:'Distinctions & classements'},{id:6,name:'Événements'}];
// [id, nom, rareté, catégorie, icône, règle, seuil, description, indice (badge non obtenu)]
// Règles : list | main | nlw | unrated | top75 | all150 | beat_pos | verif | verif_pos | manual
const specs=[
 ['bienvenue-club','Bienvenue au club','Impressive',1,'🎟️','list',1,'Premier niveau du Top 150 battu à 100 %.','Bats un niveau du Top 150.'],
 ['dix','Dix','Impressive',1,'🔟','list',10,'10 niveaux différents du Top 150 battus.','Bats 10 niveaux du Top 150.'],
 ['vingt-cinq','Quart de siècle','Epic',1,'🧗','list',25,'25 niveaux différents du Top 150 battus.','Bats 25 niveaux du Top 150.'],
 ['faucheur-liste','Faucheur de liste','Epic',1,'⚔️','list',35,'35 niveaux différents du Top 150 battus.','Bats 35 niveaux du Top 150.'],
 ['cinquante','Demi-centurion','Légendaire',1,'🛡️','list',50,'50 niveaux différents du Top 150 battus.','Bats 50 niveaux du Top 150.'],
 ['grand-faucheur-liste','Grand Faucheur de liste','Légendaire',1,'💀','list',75,'75 niveaux différents du Top 150 battus.','Bats 75 niveaux du Top 150.'],
 ['cour-grands','Bienvenue dans la cour des grands','Epic',1,'👑','main',1,'Premier niveau de la Main List (Top 75) battu.','Bats un niveau de la Main List.'],
 ['elite-top10','Élite','Légendaire',1,'🔱','beat_pos',10,'Un niveau du Top 10 battu.','Bats un niveau du Top 10.'],
 ['sommet','Numéro un','Mythique',1,'🥇','beat_pos',1,'Le niveau n°1 de la liste battu.','Bats le n°1 de la liste.'],
 ['demi-dieu','Demi Dieu','Mythique',1,'⚡','top75',null,'Toute la Main List battue : les 75 niveaux.','Bats toute la Main List.'],
 ['god','GOD','Ultra',1,'🌌','all150',null,'Les 150 niveaux du Top 150 battus.','Bats tout le Top 150.'],
 ['verif-1','Première vérification','Impressive',5,'✅','verif',1,'Un niveau publié vérifié (Top 150 ou NLW).','Vérifie un niveau.'],
 ['verif-5','Bâtisseur','Epic',5,'🧱','verif',5,'5 niveaux vérifiés (Top 150 et NLW comptent).','Vérifie 5 niveaux.'],
 ['verif-10','Architecte','Légendaire',5,'🏛️','verif',10,'10 niveaux vérifiés (Top 150 et NLW comptent).','Vérifie 10 niveaux.'],
 ['verif-20','Pilier de la DLFR','Mythique',5,'🗿','verif',20,'20 niveaux vérifiés (Top 150 et NLW comptent).','Vérifie 20 niveaux.'],
 ['verif-top150','Vérificateur classé','Epic',5,'🎯','verif_pos',150,'Avoir vérifié un niveau du Top 150.','Vérifie un niveau classé.'],
 ['verif-top75','Vérificateur Main List','Légendaire',5,'🏆','verif_pos',75,'Avoir vérifié un niveau de la Main List (Top 75).','Vérifie un niveau de la Main List.'],
 ['verif-top10','Pierre angulaire','Mythique',5,'💎','verif_pos',10,'Avoir vérifié un niveau du Top 10.','Vérifie un niveau du Top 10.'],
 ['verif-top1','Le Sommet','Ultra',5,'🗻','verif_pos',1,'Avoir vérifié le niveau n°1 de la liste.','Vérifie le n°1 de la liste.'],
 ['bienvenue-nlw','Bienvenue au club NLW','Beginner',2,'🌱','nlw',1,'Premier niveau NLW (rang 151 et plus) battu.','Bats un niveau NLW.'],
 ['dix-nlw','DixNLW','Beginner',2,'🍀','nlw',10,'10 niveaux NLW battus.','Bats 10 niveaux NLW.'],
 ['nlw-50','Cinquante NLW','Impressive',2,'🌿','nlw',50,'50 niveaux NLW battus.','Bats 50 niveaux NLW.'],
 ['cent','100!','Impressive',2,'💯','nlw',100,'100 niveaux NLW battus.','Bats 100 niveaux NLW.'],
 ['faucheur-nlw','Faucheur NLW','Epic',2,'🌾','nlw',250,'250 niveaux NLW battus.','Bats 250 niveaux NLW.'],
 ['grand-faucheur-nlw','Grand Faucheur NLW','Légendaire',2,'🌳','nlw',500,'500 niveaux NLW battus.','Bats 500 niveaux NLW.'],
 ['nlwgod','NLWGOD','Ultra',2,'🌋','nlw',1000,'1 000 niveaux NLW battus.','Bats 1 000 niveaux NLW.'],
 ['unrated-premier','Unrated ?','Impressive',3,'❔','unrated',1,'Premier niveau UNRATED battu.','Bats un niveau UNRATED.'],
 ['unrated-master','Unrated Master','Légendaire',3,'🧪','unrated',10,'10 niveaux UNRATED battus.','Bats 10 niveaux UNRATED.'],
 ['goat-pays','Le Goat tout simplement','Ultra',4,'🐐','manual',null,'Désigné meilleur joueur du pays par la modération.','Une distinction décernée par la modération.'],
 ['goat-region','Le Goat de ta région','Mythique',4,'🦁','manual',null,'Désigné meilleur joueur de sa région par la modération.','Une distinction décernée par la modération.'],
 ['clash-clans','Clash of Clans','Légendaire',4,'🏰','manual',null,'Distinction de clan décernée par la modération.','Une distinction décernée par la modération.'],
 ['crise-tcg','A traversé la grande crise du TCG','Légendaire',6,'🃏','manual',null,'Était là pendant la grande crise des DLFR Cards de novembre 2026 (sauvegardes perdues, cartes disparues, chasse aux autoclickers).','Un badge d’événement, réservé à ceux qui étaient là.']
];
const defs=specs.map(([id,label,rarity,category_id,symbol,rule,threshold,description,hint])=>({id,label,rarity,category_id,symbol,rule,threshold:threshold||null,automatic:rule!=='manual',manual:rule==='manual',description:description||'',hint:hint||''}));
const norm=s=>String(s||'').trim().toLocaleLowerCase('fr');
const slug=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-');
const validDay=s=>/^\d{4}-\d\d-\d\d$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
function init(d){
 if(!Array.isArray(d.badge_awards))d.badge_awards=[];
 // Une seule migration en démo : l'ancien catalogue ET ses anciennes attributions sont remplacés.
 if(d.badge_catalog_version!==28&&d.badge_catalog_version!==123){d.badge_categories=categories.map(c=>({...c}));d.badge_definitions=defs.map(b=>({...b}));d.badge_awards=[];d.badge_deleted_ids=[];d.badge_catalog_version=28;d.badge_baseline_scanned=false;}
 else{d.badge_categories=categories.map(c=>({...c}));d.badge_definitions=defs.map(b=>({...b}));}
 return d;
}
function counts(d,playerKey){
 const byId=new Map((d.demons||[]).map(x=>[String(x.id),x]));
 const groups={list:new Set(),nlw:new Set(),unrated:new Set(),main:new Set()};
 // V132 : un niveau vérifié par le joueur compte comme battu (même règle que Supabase).
 const pl=(d.players||[]).find(x=>norm(x.player_key)===norm(playerKey));
 const isVerifier=x=>norm(playerKey)!=='anonyme'&&pl&&(x.verifier_user_id?Number(x.verifier_user_id)===Number(pl.legacy_id):String(x.verifier||'').trim()&&[pl.player_key,pl.username,pl.display_name].filter(Boolean).map(norm).includes(norm(x.verifier)));
 const beatenRecs=(d.completions||[]).filter(rec=>norm(rec.player)===norm(playerKey)&&Number(rec.progress)>=100).concat((d.demons||[]).filter(isVerifier).map(x=>({demon_id:x.id,progress:100,player:playerKey})));
 for(const rec of beatenRecs){
  const demon=byId.get(String(rec.demon_id));if(!demon||demon.is_public===false)continue;
  const id=String(demon.id),pos=Number(demon.position);if(demon.unrated===true||demon.unrated===1||demon.unrated==='true'){groups.unrated.add(id);continue;}
  if(pos>=1&&pos<=150){groups.list.add(id);if(pos<=75)groups.main.add(id);}
  // Les positions techniques (>= 100 000 000), les archives Legacy et les
  // niveaux masques ne sont pas des niveaux NLW publies.
  else if(Number.isSafeInteger(pos)&&pos>150&&pos<100000000&&demon.legacy!==true)groups.nlw.add(id);
 }
 const ranked=(d.demons||[]).filter(x=>!(x.unrated===true||x.unrated===1||x.unrated==='true')&&Number(x.position)>=1&&Number(x.position)<=150);
 let best=Infinity;for(const id of groups.list){const p=Number(byId.get(id)?.position);if(p<best)best=p;}
 const player=(d.players||[]).find(x=>norm(x.player_key)===norm(playerKey));
 const verified=(d.demons||[]).filter(x=>x.is_public!==false&&!(x.unrated===true||x.unrated===1||x.unrated==='true')&&Number(x.position)>=1&&Number(x.position)<100000000&&norm(playerKey)!=='anonyme'&&(x.verifier_user_id?player&&Number(x.verifier_user_id)===Number(player.legacy_id):String(x.verifier||'').trim()&&[player?.player_key,player?.username,player?.display_name].filter(Boolean).map(norm).includes(norm(x.verifier))));
 const verifBest=Math.min(Infinity,...verified.filter(x=>Number(x.position)<=150).map(x=>Number(x.position)));
 return {best,verif:verified.length,verifBest,list:groups.list.size,nlw:groups.nlw.size,unrated:groups.unrated.size,main:groups.main.size,all150:ranked.length===150&&ranked.every(x=>groups.list.has(String(x.id))),top75:ranked.filter(x=>Number(x.position)<=75).length===75&&ranked.filter(x=>Number(x.position)<=75).every(x=>groups.main.has(String(x.id)))};
}
function captureAutomatic(d,players,day,first=false){
 init(d);if(!validDay(day))throw Error('Date système invalide.');let changed=false;
 // Utilise les vrais enregistrements de complétion, jamais un record partiel ni les badges historiques.
 for(const p of players||[]){const k=norm(p.player_key);if(!k)continue;const c=counts(d,k);
  for(const b of defs.filter(x=>x.automatic)){
   const earned=b.rule==='all150'?c.all150:b.rule==='top75'?c.top75:b.rule==='main'?c.main>=b.threshold:b.rule==='beat_pos'?c.best<=b.threshold:b.rule==='verif_pos'?c.verifBest<=b.threshold:c[b.rule]>=b.threshold;
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
function badgeHTML(b,a,esc,date,locked){
 const when=a?(a.obtained_at?'Obtenu le '+esc(date(a.obtained_at)):'Obtenu · date inconnue'):'À découvrir';
 return `<div class="dlfr-badge ${locked?'badge-locked':''}" data-rarity="${slug(b.rarity)}" data-badge="${esc(b.id)}" tabindex="0" title="${esc(b.label)} — ${esc(locked?b.hint:b.description)}"><span class="dlfr-badge-medal" aria-hidden="true"><span class="dlfr-badge-icon">${locked?'?':esc(b.symbol)}</span></span><span class="dlfr-badge-copy"><span class="dlfr-badge-name">${esc(b.label)}</span><span class="dlfr-badge-desc">${esc(locked?b.hint:b.description)}</span><span class="dlfr-badge-meta"><b>${esc(b.rarity)}</b> · ${when}</span></span></div>`;
}
function catalog(d,playerKey,esc,date){init(d);const owned=new Map(visibleAwards(d,playerKey).map(a=>[String(a.badge_id),a]));return categories.map(cat=>{const list=defs.filter(b=>b.category_id===cat.id).sort((a,b)=>rarities.indexOf(a.rarity)-rarities.indexOf(b.rarity));const got=list.filter(b=>owned.has(b.id)).length;return `<section class="badge-catalog-category"><h4>${esc(cat.name)} <span class="badge-catalog-count">${got} / ${list.length}</span></h4><div class="badge-collection">${list.map(b=>badgeHTML(b,owned.get(b.id),esc,date,!owned.has(b.id))).join('')}</div></section>`;}).join('');}
function gallery(d,playerKey,esc,date){init(d);const owned=visibleAwards(d,playerKey).map(a=>({a,b:defs.find(b=>b.id===String(a.badge_id))})).filter(x=>x.b).sort((x,y)=>rarities.indexOf(y.b.rarity)-rarities.indexOf(x.b.rarity));return owned.length?`<div class="badge-collection">${owned.map(({a,b})=>badgeHTML(b,a,esc,date,false)).join('')}</div>`:'';}
window.DLFR_BADGES={definitions:defs,rarities,init,counts,visibleAwards,captureAutomatic,grant,catalog,gallery,addCategory:uneditable,create:uneditable,deleteBadge:uneditable,deleteCategory:uneditable};
})();

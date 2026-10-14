/* DLFR V2.7 — Badges permanents, simulation locale uniquement. */
(function(){'use strict';
const rarities=['Beginner','Impressive','Epic','Légendaire','Mythique','Ultra'];
const slug=s=>String(s??'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const norm=s=>String(s??'').trim().toLocaleLowerCase('fr');
const next=a=>Math.max(0,...a.map(x=>Number(x.id)||0))+1;
function init(d){
 if(!Array.isArray(d.badge_categories))d.badge_categories=[{id:1,name:'Exploits Geometry Dash'},{id:2,name:'Distinctions communautaires'},{id:3,name:'Historique des classements'}];
 if(!Array.isArray(d.badge_definitions))d.badge_definitions=[];
 if(!Array.isArray(d.badge_awards))d.badge_awards=[];
 // Les titres existants sont des récompenses historiques : pas de date inventée.
 for(const old of d.profile_titles||[]){const id='old-title-'+old.id;if(!d.badge_definitions.some(x=>String(x.id)===id))d.badge_definitions.push({id,label:old.label,description:old.description||'',category_id:3,rarity:'Epic',symbol:'✦',legacy_title:true});}
 for(const old of d.player_profile_titles||[]){const id='old-title-'+old.title_id;if(!d.badge_awards.some(x=>norm(x.player_key)===norm(old.player_key)&&String(x.badge_id)===id))d.badge_awards.push({player_key:norm(old.player_key),badge_id:id,obtained_at:null,origin:'legacy'});}
 return d;
}
function captureAutomatic(d,players,day,first=false){ // Captures immuables ; ne retire jamais une récompense.
 init(d);let changed=false;
 for(const p of players){for(const b of p.autoBadges||[]){const id='automatic-'+slug(b.id||'autre')+'-'+slug(b.name||b.goal||'palier');if(!d.badge_definitions.some(x=>x.id===id)){d.badge_definitions.push({id,label:b.name,description:'Palier '+(b.goal||'')+' · Attribution automatique',category_id:1,rarity:rarityByGoal(b.goal),symbol:'✦',automatic:true});changed=true;}
 if(!d.badge_awards.some(x=>norm(x.player_key)===norm(p.player_key)&&x.badge_id===id)){d.badge_awards.push({badge_id:id,player_key:norm(p.player_key),obtained_at:first?null:day,origin:first?'first-import':'automatic'});changed=true;}
 }}return changed;
}
function rarityByGoal(n){n=Number(n)||0;return n>=150?'Ultra':n>=50?'Mythique':n>=20?'Légendaire':n>=10?'Epic':n>=5?'Impressive':'Beginner';}
function addCategory(d,name){init(d);name=String(name||'').trim();if(name.length<2||name.length>60)throw Error('Nom de catégorie invalide.');if(d.badge_categories.some(x=>norm(x.name)===norm(name)))throw Error('Cette catégorie existe déjà.');d.badge_categories.push({id:next(d.badge_categories),name});}
function create(d,f){init(d);const label=String(f.label||'').trim(),rarity=String(f.rarity||''),categoryId=Number(f.category_id);if(label.length<2||label.length>90)throw Error('Nom du badge invalide.');if(!rarities.includes(rarity))throw Error('Rareté inconnue.');if(!d.badge_categories.some(c=>Number(c.id)===categoryId))throw Error('Catégorie inconnue.');const symbol=Array.from(String(f.symbol||'✦')).slice(0,3).join('');d.badge_definitions.push({id:next(d.badge_definitions),label,description:String(f.description||'').slice(0,250),rarity,category_id:categoryId,symbol});}
function grant(d,playerKey,badgeId,day){init(d);const b=d.badge_definitions.find(x=>String(x.id)===String(badgeId));if(!b)throw Error('Badge introuvable.');if(!d.players.some(x=>norm(x.player_key)===norm(playerKey)))throw Error('Joueur introuvable.');if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(day+'T12:00:00Z').toISOString().slice(0,10)!==day)throw Error('Date invalide.');if(day>new Date().toISOString().slice(0,10))throw Error('Une date future n’est pas permise.');if(d.badge_awards.some(x=>norm(x.player_key)===norm(playerKey)&&String(x.badge_id)===String(badgeId)))throw Error('Ce badge est déjà attribué : il est permanent.');d.badge_awards.push({player_key:norm(playerKey),badge_id:b.id,obtained_at:day,origin:'moderator'});}
function gallery(d,playerKey,esc,date){init(d);const awards=d.badge_awards.filter(x=>norm(x.player_key)===norm(playerKey));const rank=x=>rarities.indexOf(x.rarity);const sorted=awards.map(a=>({a,b:d.badge_definitions.find(x=>String(x.id)===String(a.badge_id))})).filter(x=>x.b).sort((x,y)=>rank(y.b)-rank(x.b));if(!sorted.length)return '';
 return '<div class="badge-collection">'+sorted.map(({a,b})=>{const r=rarities.includes(b.rarity)?b.rarity:'Beginner',safe=slug(r);const category=d.badge_categories.find(c=>String(c.id)===String(b.category_id))?.name||'Distinction';const when=a.obtained_at?date(a.obtained_at):'Date antérieure inconnue';return `<div class="dlfr-badge" data-rarity="${safe}" title="${esc(b.description||b.label)} · ${esc(category)} · ${esc(when)}"><span class="dlfr-badge-icon" aria-hidden="true">${esc(b.symbol||'✦')}</span><span class="dlfr-badge-copy"><span class="dlfr-badge-name">${esc(b.label)}</span><span class="dlfr-badge-meta">${esc(r)} · ${esc(category)}</span><span class="dlfr-badge-meta">${esc(when)}</span></span></div>`;}).join('')+'</div>';
}
window.DLFR_BADGES={rarities,init,captureAutomatic,addCategory,create,grant,gallery};
})();

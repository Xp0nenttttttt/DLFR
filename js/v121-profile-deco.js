/* DLFR V121 — décorations de profil redessinées (bannières, cadres, badges de la boutique).
 * Remplace l'affichage des effets V85/V89/V90 : nouvelles classes « pd-* », donc les anciens
 * styles ne s'appliquent plus. Les données viennent toujours de dlfr_rewards_public(_bulk).
 */
(()=>{'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PRESTIGE=new Set(['frame_amethyst_crown','frame_celestial','banner_bloodmoon','banner_voidwalker','frame_glitch','banner_glitch']);
// Fiches descriptives (affichées dans l'encart « Récompenses exposées » et la boutique).
const INFO={
 banner_night:{name:'Nuit étoilée',text:'Aurore boréale, croissant de lune et étoiles filantes.'},
 banner_bloodmoon:{name:'Éclipse Sanglante',text:'Lune de sang qui s’éclipse, brume écarlate et cendres.'},
 banner_glitch:{name:'GLITCH.EXE',text:'Écran corrompu : tranches décalées, pixels et séparation RVB.'},
 banner_voidwalker:{name:'Voidwalker',text:'Trou noir et disque d’accrétion qui avale les étoiles.'},
 frame_amethyst:{name:'Cadre Améthyste',text:'Bordure de gemme taillée violette avec reflet.'},
 frame_aurora:{name:'Cadre Aurore',text:'Bordure aux couleurs de l’aurore qui tourne lentement.'},
 frame_amethyst_crown:{name:'Couronne d’Améthyste',text:'Cadre de gemme surmonté d’une couronne d’or.'},
 frame_celestial:{name:'Ascension Céleste',text:'Auréole dorée, ailes de lumière et rayons divins.'},
 frame_glitch:{name:'Cadre Désynchronisé',text:'Contour qui saute entre cyan et magenta.'},
 badge_spark:{name:'Éclat hebdomadaire',text:'Médaille étincelante à côté du pseudo.'},
 badge_flame:{name:'Flamme éternelle',text:'Médaille enflammée à côté du pseudo.'}
};
const TIER_TEXT=['','I · Originel','II · Éveillé','III · Légendaire'];
const safe=items=>(Array.isArray(items)?items:[]).filter(x=>/^[a-z0-9_]+$/.test(String(x?.item_key||'')));
const tierOf=x=>[1,2,3].includes(Number(x?.tier))?Number(x.tier):1;
function maxTier(list){const t=list.filter(x=>PRESTIGE.has(x.item_key)).map(tierOf);return t.length?Math.max(...t):1;}
function find(list,cat){return list.find(x=>x.category===cat||x.item_key.startsWith(cat+'_'));}
// Classes à poser sur l'élément qui contient la bannière et/ou l'avatar.
function cls(items){
 const list=safe(items);if(!list.length)return '';
 const c=['pd','pd-t'+maxTier(list)];
 const b=find(list,'banner'),f=find(list,'frame');
 if(b)c.push('pd-banner',`pd-${b.item_key}`);
 if(f)c.push('pd-frame',`pd-${f.item_key}`);
 for(const x of list)if(x.item_key.startsWith('badge_'))c.push(`pd-${x.item_key}`);
 return c.join(' ');
}
// Calque décoratif de la bannière : éléments génériques que le CSS met en scène.
function layer(items,count=18){
 const list=safe(items);if(!find(list,'banner'))return '';
 let p='';for(let i=0;i<count;i++)p+=`<i class="pd-p" style="--x:${(i*53+7)%96}%;--y:${(i*29+13)%88}%;--s:${2+(i*7)%4}px;--d:${(3+((i*13)%40)/10).toFixed(1)}s;--l:${(-((i*7)%50)/10).toFixed(1)}s;--r:${(i*47)%360}deg"></i>`;
 return `<div class="pd-layer" aria-hidden="true"><b class="pd-a"></b><b class="pd-b"></b><b class="pd-c"></b><b class="pd-d"></b>${p}</div>`;
}
function medals(items){
 const list=safe(items).filter(x=>x.item_key.startsWith('badge_'));
 return list.length?`<span class="pd-medals">${list.map(x=>`<span class="pd-medal pd-medal-${esc(x.item_key)}" title="${esc(INFO[x.item_key]?.name||x.label||'')}" aria-label="${esc(INFO[x.item_key]?.name||x.label||'')}"><span aria-hidden="true">${esc(x.emoji||'✦')}</span></span>`).join('')}</span>`:'';
}
// Applique tout sur une fiche (page profil). card = .stats-profile ou .dlfr20-community.
function apply(card,items){
 if(!card)return;
 [...card.classList].filter(c=>c==='pd'||c.startsWith('pd-')).forEach(c=>card.classList.remove(c));
 card.querySelectorAll('.pd-layer,.pd-medals').forEach(n=>n.remove());
 const list=safe(items);if(!list.length)return;
 card.classList.add(...cls(list).split(' '));
 const hero=card.querySelector('.profile-hero');if(!hero)return;
 hero.classList.add('pd-hero');
 hero.insertAdjacentHTML('afterbegin',layer(list,22));
 const nm=hero.querySelector('.profile-hero-copy strong');if(nm){nm.classList.add('pd-name');nm.insertAdjacentHTML('beforeend',medals(list));}
}
// Miniature (boutique, encart) : un mini-profil qui porte l'objet.
function preview(itemKey,tier=3,emoji='✦'){
 const k=String(itemKey||'');if(!/^[a-z0-9_]+$/.test(k))return '';
 const item={item_key:k,category:k.split('_')[0],tier,emoji};
 const isBanner=k.startsWith('banner_'),isFrame=k.startsWith('frame_'),isBadge=k.startsWith('badge_');
 return `<span class="pd-mini ${cls([item])}" aria-hidden="true"><span class="pd-hero pd-mini-hero ${isBanner?'':'pd-neutral'}">${isBanner?layer([item],12):''}<span class="pd-mini-id"><span class="dlfr27-frame pd-mini-frame"><span class="pd-mini-av">${isBadge?'':'Z'}</span></span><span class="pd-mini-name">${isFrame||isBanner?'Joueur':''}${isBadge?medals([item]):''}</span></span></span></span>`;
}
// Encart « Récompenses exposées » de la page profil.
function panel(items){
 const list=safe(items);if(!list.length)return '';
 return `<div class="pd-panel"><div class="pd-panel-head"><b>✦ Décorations exposées</b><span>${list.length} équipée${list.length>1?'s':''}</span></div><div class="pd-panel-grid">${list.map(x=>{
  const prestige=PRESTIGE.has(x.item_key),t=tierOf(x),info=INFO[x.item_key]||{};
  return `<article class="pd-card ${prestige?'is-prestige':''}"><div class="pd-card-art">${preview(x.item_key,t,x.emoji)}</div><div class="pd-card-copy"><small>${esc({banner:'Bannière',frame:'Cadre',badge:'Badge'}[x.category]||'Décoration')}${prestige?' · Prestige':''}</small><strong>${esc(x.emoji||'')} ${esc(x.label||info.name||x.item_key)}</strong><p>${esc(info.text||'Décoration cosmétique équipée.')}</p>${prestige?`<div class="pd-tier"><span class="pd-pips" data-t="${t}"><i></i><i></i><i></i></span><em>Palier ${esc(TIER_TEXT[t])}</em></div><small class="pd-next">${t>=3?'Palier maximal atteint':t===2?'Palier III à 8 défis réclamés':'Palier II à 3 défis réclamés'}</small>`:''}</div></article>`;}).join('')}</div></div>`;
}
window.DLFR_DECO={PRESTIGE,INFO,safe,cls,layer,medals,apply,preview,panel};
// Reflet qui suit la souris sur les bannières.
let raf=0;
document.addEventListener('pointermove',ev=>{
 const hero=ev.target.closest?.('.pd-hero');if(!hero||raf)return;
 raf=requestAnimationFrame(()=>{raf=0;const r=hero.getBoundingClientRect();if(!r.width)return;
  hero.style.setProperty('--mx',((ev.clientX-r.left)/r.width*100).toFixed(1)+'%');hero.style.setProperty('--my',((ev.clientY-r.top)/r.height*100).toFixed(1)+'%');});
},{passive:true});
})();

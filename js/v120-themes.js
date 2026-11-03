/* DLFR V120 — thèmes premium de la boutique.
 * Liste des thèmes, aperçu temporaire (« Essayer ») et miniatures pour la boutique.
 * La possession est toujours vérifiée côté serveur (dlfr_rewards_status) par app.js :
 * l'aperçu ne fait que changer l'affichage pendant 20 secondes, sans rien enregistrer.
 */
(()=>{'use strict';
const list=[
 {id:'halloween',item:'theme_halloween',label:'Halloween ✦',emoji:'🎃',cls:['halloween'],desc:'Nuit violette, cuivre et orange spectral.'},
 {id:'noel',item:'theme_noel',label:'Noël enneigé 🎄',emoji:'🎄',cls:['dark','th-premium','th-noel'],desc:'Nuit de sapin, guirlande lumineuse, neige qui tombe et motifs de Noël.'},
 {id:'neon',item:'theme_neon',label:'Néon Synthwave 🌆',emoji:'🌆',cls:['dark','th-premium','th-neon'],desc:'Rose et cyan électriques, grille rétro qui défile à l’horizon.'},
 {id:'glacier',item:'theme_glacier',label:'Glacier ❄️',emoji:'🧊',cls:['th-premium','th-light','th-glacier'],desc:'Thème clair : verre givré, bleu polaire et éclats de cristal.'},
 {id:'abysse',item:'theme_abysse',label:'Abysse 🌊',emoji:'🌊',cls:['dark','th-premium','th-abysse'],desc:'Grands fonds marins, lueurs bioluminescentes et bulles qui remontent.'},
 {id:'inferno',item:'theme_inferno',label:'Inferno 🔥',emoji:'🔥',cls:['dark','th-premium','th-inferno'],desc:'Noir volcanique, braises qui s’élèvent et lueur de lave.'},
 {id:'sakura',item:'theme_sakura',label:'Sakura 🌸',emoji:'🌸',cls:['th-premium','th-light','th-sakura'],desc:'Thème clair : rose poudré et pétales de cerisier qui tombent.'},
 {id:'terminal',item:'theme_terminal',label:'Terminal 💻',emoji:'💻',cls:['dark','th-premium','th-terminal'],desc:'Écran cathodique vert, police machine et lignes de balayage.'},
 {id:'stereo',item:'theme_stereo',label:'Stereo Madness 🟨',emoji:'🟨',cls:['dark','th-premium','th-stereo'],desc:'Hommage au premier niveau : bleu Geometry Dash, damier et jaune vif.'},
 {id:'royal',item:'theme_royal',label:'Couronne Royale 👑',emoji:'👑',cls:['dark','th-premium','th-royal'],desc:'Thème de prestige noir et or, motif losange et reflets dorés.'}
];
const byId=new Map(list.map(t=>[t.id,t])),byItem=new Map(list.map(t=>[t.item,t]));
const ALL_CLASSES=[...new Set(list.flatMap(t=>t.cls))];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Miniature : un petit « site » aux couleurs du thème (en-tête, panneau, bouton).
function swatch(item){const t=byItem.get(item);if(!t)return '';return `<span class="dlfr120-swatch th-vars-${t.id}" aria-hidden="true"><i class="s-head"><b></b><b></b><b></b></i><i class="s-panel"><b></b><b></b></i><i class="s-btn"></i><i class="s-fx"></i></span>`;}
// ---------- Aperçu temporaire
const PREVIEW_MS=20000;let preview=null;
function root(){return document.documentElement;}
function startPreview(id){
 const t=byId.get(id);if(!t)return;
 stopPreview(true);
 const html=root(),saved=['dark','midnight','autumn',...ALL_CLASSES].filter(c=>html.classList.contains(c));
 html.classList.remove('dark','midnight','autumn',...ALL_CLASSES);html.classList.add(...t.cls,'th-previewing');
 const bar=document.createElement('div');bar.className='dlfr120-preview';bar.setAttribute('role','status');
 bar.innerHTML=`<span>${esc(t.emoji)} Aperçu : <b>${esc(t.label.replace(/\s*\S+$/u,'')||t.label)}</b></span><span class="dlfr120-preview-time"><i></i></span><button type="button" data-theme-stop>Arrêter</button>`;
 document.body.append(bar);
 preview={id,saved,bar,timer:setTimeout(()=>stopPreview(false),PREVIEW_MS)};
}
// keep=true : un vrai changement de thème a lieu, on ne restaure pas l'ancien.
function stopPreview(keep){
 if(!preview)return;clearTimeout(preview.timer);preview.bar.remove();
 const html=root();html.classList.remove('th-previewing');
 if(!keep){html.classList.remove('dark','midnight','autumn',...ALL_CLASSES);if(preview.saved.length)html.classList.add(...preview.saved);}
 preview=null;
}
document.addEventListener('click',e=>{
 const go=e.target.closest?.('[data-theme-try]');if(go){e.preventDefault();startPreview(go.dataset.themeTry);return;}
 if(e.target.closest?.('[data-theme-stop]')){e.preventDefault();stopPreview(false);}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&preview)stopPreview(false);});
window.DLFR_THEMES={list,byId,byItem,ALL_CLASSES,swatch,startPreview,stopPreview,get previewing(){return preview?.id||null;}};
})();

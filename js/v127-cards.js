/* DLFR V127 — DLFR Cards pour tous les joueurs (collection réelle, enregistrée sur Supabase).
 * Les tirages, le solde et les doublons sont calculés côté serveur (dlfr_cards_open / dlfr_cards_recycle).
 * La mise en scène de l'ouverture réutilise celle du laboratoire (DLFR_CARDS_LAB.playReal).
 */
(()=>{'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const RAR=['Commun','Rare','Épique','Légendaire','Mythique','Ultra'];
const VALUE={Commun:2,Rare:5,'Épique':15,'Légendaire':40,Mythique:120,Ultra:400,'Secrète':1000,Festive:60};
const slug=r=>String(r||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const S={ctx:null,cards:[],collections:[],status:null,board:[],owners:{},loading:false,loaded:false,error:'',busy:false,filter:'all',timer:0};
const LAB=()=>window.DLFR_CARDS_LAB;
const toCard=r=>LAB()?.mkCard?LAB().mkCard(r):{id:Number(r.id),name:r.name,rarity:r.rarity,type:r.card_type||'dlfr',image:r.image_url||'',collectionId:Number(r.collection_id)};
function fig(card,owned){const L=LAB();if(L?.figure)return L.figure(card,S.ctx?.data||{},true,{official:true,owned:!!owned});
 return `<div class="dlfr127-fallback-card ${owned?'':'is-missing'}" data-rarity="${slug(card.rarity)}"><b>${esc(card.name)}</b><small>${esc(card.rarity)}</small></div>`;}

async function load(force=false){
 const db=S.ctx?.db;if(!db||S.loading||(S.loaded&&!force))return;
 S.loading=true;
 try{
  const [c,k,st,lb,oc]=await Promise.all([
   db.from('dlfr_card_collections').select('*').order('sort_order'),
   db.from('dlfr_cards').select('*').order('sort_order'),
   db.rpc('dlfr_cards_status'),Promise.resolve({data:[]}),db.rpc('dlfr_cards_owner_counts')]); // V169 : jeu solo, plus de classement
  if(c.error)throw c.error;if(k.error)throw k.error;if(st.error)throw st.error;
  S.board=lb.error?[]:(lb.data||[]);S.owners=oc.error?{}:(oc.data||{});
  S.collections=(c.data||[]).filter(x=>x.is_published!==false);{const live=new Set(S.collections.map(x=>Number(x.id)));S.cards=(k.data||[]).filter(r=>live.has(Number(r.collection_id))).map(r=>({row:r,card:toCard(r)}));}S.status=st.data||{};S.loaded=true;S.error='';
 }catch(e){S.error=e.message||'Chargement impossible.';}
 finally{S.loading=false;paint();}
}
async function refreshStatus(){const {data,error}=await S.ctx.db.rpc('dlfr_cards_status');if(!error)S.status=data||{};}

function countdown(to){const ms=new Date(to)-Date.now();if(!(ms>0))return 'maintenant';const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000);return h?`${h} h ${String(m).padStart(2,'0')}`:`${m} min`;}
function boosterArt(name,emblem,theme){return `<div class="dlfr127-booster-wrap" aria-hidden="true"><div class="dlfr117-booster b-${theme} dlfr127-booster" aria-hidden="true"><div class="b-crimp"></div><div class="b-body"><div class="b-pattern"></div><div class="b-glow"></div><div class="b-logo">DLFR <b>CARDS</b></div><div class="b-emblem">${emblem}</div><div class="b-name">${esc(name)}</div><div class="b-meta">5 CARTES</div><div class="b-foil"></div></div><div class="b-crimp b-bottom"></div></div></div>`;}

const rcOf=id=>Number((S.status?.recyclable||{})[id])||0;
function streakHTML(st){
 const n=Number(st.streak)||0,pos=n%7,next=7-pos;
 return `<div class="dlfr137-streak" title="Ouvre le booster du jour plusieurs jours d’affilée : le 7e jour, booster bonus de 6 cartes dont une Épique ou mieux."><div class="dlfr137-streak-dots">${Array.from({length:7},(_,i)=>`<i class="${i<pos||(pos===0&&n>0)?'on':''} ${i===6?'gift':''}">${i===6?'🎁':''}</i>`).join('')}</div><small>🔥 Série : <b>${n}</b> jour${n>1?'s':''} · ${pos===0&&n>0?'bonus obtenu !':`bonus dans ${next} jour${next>1?'s':''}`}</small></div>`;
}
function showcaseHTML(st){
 const ids=(st.showcase||[]).map(Number),inv=st.inventory||{},byId=new Map(S.cards.map(x=>[Number(x.card.id),x.card]));
 const cards=ids.map(id=>byId.get(id)).filter(c=>c&&Number(inv[c.id])>0);
 return `<section class="dlfr137-showcase"><div class="dlfr137-showcase-head"><div><h3>★ Ma vitrine</h3><p>Jusqu’à 5 cartes de ta collection officielle, affichées sur ton profil public. Clique sur une carte pour l’ajouter.</p></div><b>${cards.length} / 5</b></div>
  <div class="dlfr137-showcase-row">${cards.map(c=>`<div class="dlfr137-show-slot" data-card-zoom="${c.id}" role="button" tabindex="0">${fig(c,true)}<button type="button" class="dlfr137-unshow" data-showcase-toggle="${c.id}" title="Retirer de la vitrine" aria-label="Retirer ${esc(c.name)} de la vitrine">✕</button></div>`).join('')}${Array.from({length:5-cards.length},()=>'<div class="dlfr137-show-empty" aria-hidden="true">★</div>').join('')}</div></section>`;
}
function boardHTML(){
 return ''; // V169 : jeu solo
 if(!S.board.length)return '';
 const total=S.cards.filter(x=>x.card.rarity!=='Secrète').length,me=S.ctx?.ownKey;
 return `<section class="dlfr137-board"><h3>🏆 Meilleurs collectionneurs</h3><p class="muted small">Cartes différentes de la collection officielle.</p><ol>${S.board.slice(0,10).map((r,i)=>`<li class="${r.player_key===me?'is-me':''}"><span class="dlfr137-rank">${i<3?['🥇','🥈','🥉'][i]:'#'+(i+1)}</span><a href="?page=player&player=${encodeURIComponent(r.player_key)}" data-nav>${esc(r.name)}</a><span class="dlfr137-bar"><i style="width:${total?Math.min(100,r.owned/total*100):0}%"></i></span><b>${r.owned} / ${total}</b><small>${r.mythic?`✺ ${r.mythic}`:''}${r.legendary?` ★ ${r.legendary}`:''}</small></li>`).join('')}</ol></section>`;
}
function zoom(id){
 const x=S.cards.find(c=>Number(c.card.id)===Number(id));if(!x)return;
 const st=S.status||{},q=Number((st.inventory||{})[id])||0,a=!q&&(Number(LAB()?.advCount?.(id))||0)>0,inShow=(st.showcase||[]).map(Number).includes(Number(id));
 const col=S.collections.find(c=>Number(c.id)===Number(x.row.collection_id)),owners=Number(S.owners[id])||0,t=RAR.indexOf(x.card.rarity);
 const L=LAB(),big=L?.figure?L.figure(x.card,S.ctx?.data||{},false,{official:true,owned:q>0||a}):fig(x.card,q>0);
 document.getElementById('dlfr137Zoom')?.remove();
 const d=document.createElement('dialog');d.id='dlfr137Zoom';d.className='dlfr137-zoom';
 d.innerHTML=`<div class="dlfr137-zoom-card">${big}</div><div class="dlfr137-zoom-info"><small>${esc(col?.name||'Collection')}</small><h2>${esc(x.card.name)}</h2>
  <p class="dlfr137-zoom-rar r${t<0?'f':t}">${esc(x.card.rarity)} · ${t<0?'rareté spéciale (calendrier de l’Avent)':`rareté ${t+1}/5`}</p>${x.row.description?`<p>${esc(x.row.description)}</p>`:''}
  <ul><li><span>Dans ta collection</span><b>${q?`×${q}`:a?'Mode Aventure seulement':'Pas encore'}</b></li><li><span>Joueurs qui la possèdent</span><b>${owners}</b></li><li><span>Dans les boosters</span><b>${x.row.in_packs===false?'Non':'Oui'}</b></li></ul>
  <div class="dlfr137-zoom-actions">${q?`<button type="button" class="btn ${inShow?'subtle':''}" data-showcase-toggle="${id}">${inShow?'Retirer de la vitrine':'★ Mettre en vitrine'}</button>`:''}<button type="button" class="btn subtle" data-zoom-close>Fermer</button></div></div>`;
 document.body.append(d);d.showModal();d.addEventListener('close',()=>d.remove());
 d.addEventListener('click',e=>{if(e.target===d||e.target.closest('[data-zoom-close]'))d.close();
  const tg=e.target.closest('[data-showcase-toggle]');if(tg){d.close();toggleShowcase(Number(tg.dataset.showcaseToggle));}
  const rc=e.target.closest('[data-cards-recycle]');if(rc){d.close();recycle(Number(rc.dataset.cardsRecycle));}});
}
async function toggleShowcase(id){
 const inv0=S.status?.inventory||{},cur=(S.status?.showcase||[]).map(Number).filter(x=>Number(inv0[x])>0),next=cur.includes(id)?cur.filter(x=>x!==id):cur.concat(id);
 if(next.length>5){S.ctx.toast?.('Ta vitrine contient déjà 5 cartes : retires-en une d’abord.');return;}
 try{const {data,error}=await S.ctx.db.rpc('dlfr_cards_set_showcase',{p_ids:next});if(error)throw error;
  const saved=(data||next).map(Number);S.status={...S.status,showcase:saved};
  S.ctx.toast?.(cur.includes(id)?'Carte retirée de ta vitrine.':saved.includes(Number(id))?'Carte ajoutée à ta vitrine ★':'Cette carte n’est pas encore enregistrée dans ta collection : réessaie dans quelques secondes.');paint();}
 catch(e){S.ctx.toast?.(e.message||'Vitrine indisponible.');}
}
function view(){
 const st=S.status||{},signed=!!st.signed_in,inv=st.inventory||{},VIS=S.cards.filter(x=>x.card.rarity!=='Secrète'||Number(inv[x.card.id])>0||Number(LAB()?.advCount?.(x.card.id))>0),done=new Set((st.collections_done||[]).map(Number));
 const owned=VIS.filter(x=>Number(inv[x.card.id])>0).length,total=VIS.length;
 const dups=Object.values(st.recyclable||{}).reduce((n,v)=>n+(Number(v)||0),0),dupValue=Number(st.duplicates_value)||0;
 const price=Number(st.booster_price)||150,bal=Number(st.balance)||0;
 if(S.error)return `<div class="notice warning">DLFR Cards indisponible : ${esc(S.error)}</div>`;
 if(!S.loaded)return '<div class="dlfr127-loading">Chargement de ta collection…</div>';
 const pityLeft=Math.max(1,80-(Number(st.pity)||0));
 const actions=signed?'':`<div class="dlfr127-guest"><b>Connecte-toi pour voir ta collection</b><a class="btn" data-nav href="?page=my-profile">Se connecter</a></div>`;
 const collections=S.collections.map(col=>{
   const list=VIS.filter(x=>Number(x.row.collection_id)===Number(col.id));if(!list.length)return '';
   const have=list.filter(x=>Number(inv[x.card.id])>0).length,bonus=list.length*40,complete=done.has(Number(col.id));
   const adv=id=>Number(LAB()?.advCount?.(id))||0,advOnly=list.filter(x=>!(Number(inv[x.card.id])>0)&&adv(x.card.id)>0).length;
   const shown=list.filter(x=>S.filter==='all'||(S.filter==='owned')===(Number(inv[x.card.id])>0||adv(x.card.id)>0));
   return `<section class="dlfr127-col" style="--col:${esc(col.color||'#8b5cf6')}"><header><div><h3>${esc(col.name)}</h3>${col.description?`<p>${esc(col.description)}</p>`:''}</div>
    <div class="dlfr127-col-meta"><b>${have} / ${list.length}</b><div class="dlfr127-bar"><i style="width:${list.length?have/list.length*100:0}%"></i></div><small>${complete?'✓ Bonus de collection obtenu':`Collection complète : +${bonus} ✦`}</small>${advOnly?`<small class="dlfr136-adv-note">+ ${advOnly} carte${advOnly>1?'s':''} obtenue${advOnly>1?'s':''} en Aventure</small>`:''}</div></header>
    <div class="dlfr127-grid">${shown.map(x=>{const q=Number(inv[x.card.id])||0,a=!q&&adv(x.card.id)>0;return `<div class="dlfr127-slot ${q?'is-owned':a?'is-adventure':'is-missing'}" data-card-zoom="${x.card.id}" role="button" tabindex="0" title="${esc(x.card.name)} · ${esc(x.card.rarity)}${a?' · obtenue en mode Aventure (ne compte pas pour les Wayllings)':''}">${fig(x.card,q>0||a)}${a?'<span class="dlfr136-adv-tag">🗺️ Aventure</span>':''}${q>1?`<span class="dlfr127-qty">×${q}</span>`:''}</div>`;}).join('')||'<p class="muted small">Aucune carte dans ce filtre.</p>'}</div></section>`;
 }).join('');
 const embedded=!!document.querySelector('#dlfr127Cards.is-embedded');
 return (embedded?`<div class="dlfr127-hero-stats is-compact"><div><span>Cartes</span><b>${signed?owned:'—'} <small>/ ${total}</small></b></div><div><span>Wayllings dorés</span><b>✦ ${signed?bal:'—'}</b></div></div>`:`<header class="dlfr127-hero"><div><span class="kicker">Collection</span><h1>DLFR Cards</h1><p>Des cartes de niveaux, de joueurs et de moments de la DLFR. Les collections complètes rapportent des <b>Wayllings dorés</b>.</p></div>
  <a class="dlfr129-adventure-cta" href="?page=cards-lab" data-nav><span aria-hidden="true">🗺️</span><span><b>Mode Aventure</b><small>Expéditions, talents, Forge, quêtes…</small></span><em>Jouer →</em></a>
  <div class="dlfr127-hero-stats"><div><span>Cartes</span><b>${signed?owned:'—'} <small>/ ${total}</small></b></div><div><span>Wayllings dorés</span><b>✦ ${signed?bal:'—'}</b></div></div></header>`)+`
  ${actions}
  <details class="dlfr127-odds"><summary>Règles</summary><ul><li>Une seule collection : les cartes gagnées en Aventure et au calendrier de l’Avent s’y ajoutent.</li><li>Collection complète : 40 ✦ par carte de la collection, une seule fois.</li></ul></details>
  ${signed?showcaseHTML(st):''}
  ${LAB()?.ladder?LAB().ladder([58,27,10,4,1]):''}
  <div class="dlfr127-filters" role="group" aria-label="Filtrer les cartes">${[['all','Toutes'],['owned','Possédées'],['missing','Manquantes']].map(([k,l])=>`<button type="button" data-cards-filter="${k}" class="${S.filter===k?'active':''}" aria-pressed="${S.filter===k}">${l}</button>`).join('')}</div>
  ${collections||'<p class="muted">Aucune carte dans le catalogue pour le moment.</p>'}
  ${boardHTML()}`;
}
function paint(){
 const root=document.getElementById('dlfr127Cards');if(!root)return;
 const y=window.scrollY;root.innerHTML=view();window.scrollTo(0,y);
 clearInterval(S.timer);
 if(root.querySelector('[data-next]'))S.timer=setInterval(()=>{const w=document.querySelector('#dlfr127Cards [data-next]');if(!w){clearInterval(S.timer);return;}
  if(new Date(w.dataset.next)<=new Date()){clearInterval(S.timer);refreshStatus().then(paint);return;}w.querySelector('b').textContent=countdown(w.dataset.next);},30000);
}
async function open(source){
 if(S.busy)return;S.busy=true;paint();
 try{
  const {data,error}=await S.ctx.db.rpc('dlfr_cards_open',{p_source:source});if(error)throw error;
  const byId=new Map(S.cards.map(x=>[Number(x.card.id),x.card]));
  const draws=(data.cards||[]).map(d=>({card:byId.get(Number(d.id))||toCard({id:d.id,name:'Carte #'+d.id,rarity:d.rarity}),isNew:d.is_new,value:d.value}));
  await refreshStatus();S.busy=false;LAB()?.applyServerInventory?.(S.status?.inventory||{});
  const price=Number(S.status?.booster_price)||150,canAgain=Number(S.status?.balance)>=price;
  const after=()=>{paint();S.ctx.onWallet?.();};
  if(LAB()?.playReal)LAB().playReal({name:'Booster DLFR',theme:'blue',emblem:'◆'},draws,
   {data:S.ctx.data,balance:data.balance,bonuses:data.bonuses||[],onClose:after,againLabel:canAgain?`Rouvrir un booster · ${price} ✦`:'',onAgain:()=>{after();open('shop');}});
  else{after();S.ctx.toast?.(`${draws.length} cartes obtenues !`);}
  if(data.big)S.ctx.toast?.(`🔥 ${data.streak} jours d’affilée : booster bonus de 6 cartes !`);
  (data.bonuses||[]).forEach(b=>S.ctx.toast?.(`Collection « ${b.collection} » complète : +${b.coins} Wayllings dorés !`));
 }catch(e){S.busy=false;paint();S.ctx.toast?.(e.message||'Ouverture impossible.');}
}
async function recycle(cardId){
 if(S.busy)return;S.busy=true;paint();
 try{const {data,error}=await S.ctx.db.rpc('dlfr_cards_recycle',{p_card_id:cardId||null});if(error)throw error;
  await refreshStatus();S.ctx.toast?.(`${data.recycled} doublon(s) recyclé(s) : +${data.gained} Wayllings dorés ✦`);S.ctx.onWallet?.();}
 catch(e){S.ctx.toast?.(e.message||'Recyclage impossible.');}
 finally{S.busy=false;paint();}
}
document.addEventListener('click',ev=>{
 if(!ev.target.closest?.('#dlfr127Cards'))return;
 const o=ev.target.closest('[data-cards-open]');if(o){ev.preventDefault();open(o.dataset.cardsOpen);return;}
 const r=ev.target.closest('[data-cards-recycle]');if(r){ev.preventDefault();recycle(Number(r.dataset.cardsRecycle)||null);return;}
 const f=ev.target.closest('[data-cards-filter]');if(f){S.filter=f.dataset.cardsFilter;paint();return;}
 const t=ev.target.closest('[data-showcase-toggle]');if(t){ev.preventDefault();ev.stopPropagation();toggleShowcase(Number(t.dataset.showcaseToggle));return;}
 const z=ev.target.closest('[data-card-zoom]');if(z&&!ev.target.closest('button')){ev.preventDefault();zoom(Number(z.dataset.cardZoom));}
});
document.addEventListener('keydown',ev=>{if((ev.key==='Enter'||ev.key===' ')&&ev.target.matches?.('#dlfr127Cards [data-card-zoom]')){ev.preventDefault();zoom(Number(ev.target.dataset.cardZoom));}});
window.DLFR_CARDS={
 page(){return '<section class="dlfr127-cards" id="dlfr127Cards" aria-live="polite"><div class="dlfr127-loading">Chargement de ta collection…</div></section>';},
 // V177 : plus de requête à chaque sauvegarde du jeu (l'inventaire est transmis directement) ; sinon rechargement seulement si la page est affichée.
 invalidate(inv){if(!S.ctx||!S.loaded)return;const shown=!!document.getElementById('dlfr127Cards');if(inv&&typeof inv==='object'){S.status={...S.status,inventory:inv};if(shown)paint();return;}if(!shown){S.stale=true;return;}refreshStatus().then(()=>{if(document.getElementById('dlfr127Cards'))paint();});},
 refresh(){if(!S.ctx)return;if(S.loaded)paint();else load();},
 mount(ctx){const sessionChanged=S.ctx&&S.ctx.session!==ctx.session;S.ctx=ctx;if(sessionChanged)S.loaded=false;if(S.loaded&&S.stale){S.stale=false;refreshStatus().then(paint);}else if(S.loaded)paint();else load();},
 reset(){S.loaded=false;S.status=null;}
};
})();

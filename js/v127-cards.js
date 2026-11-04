/* DLFR V127 — DLFR Cards pour tous les joueurs (collection réelle, enregistrée sur Supabase).
 * Les tirages, le solde et les doublons sont calculés côté serveur (dlfr_cards_open / dlfr_cards_recycle).
 * La mise en scène de l'ouverture réutilise celle du laboratoire (DLFR_CARDS_LAB.playReal).
 */
(()=>{'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const RAR=['Commun','Rare','Épique','Légendaire','Mythique'];
const VALUE={Commun:2,Rare:5,'Épique':15,'Légendaire':40,Mythique:120};
const slug=r=>String(r||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const S={ctx:null,cards:[],collections:[],status:null,loading:false,loaded:false,error:'',busy:false,filter:'all',timer:0};
const LAB=()=>window.DLFR_CARDS_LAB;
const toCard=r=>LAB()?.mkCard?LAB().mkCard(r):{id:Number(r.id),name:r.name,rarity:r.rarity,type:r.card_type||'dlfr',image:r.image_url||'',collectionId:Number(r.collection_id)};
function fig(card,owned){const L=LAB();if(L?.figure)return L.figure(card,S.ctx?.data||{},true,owned?{finish:0}:{});
 return `<div class="dlfr127-fallback-card ${owned?'':'is-missing'}" data-rarity="${slug(card.rarity)}"><b>${esc(card.name)}</b><small>${esc(card.rarity)}</small></div>`;}

async function load(force=false){
 const db=S.ctx?.db;if(!db||S.loading||(S.loaded&&!force))return;
 S.loading=true;
 try{
  const [c,k,st]=await Promise.all([
   db.from('dlfr_card_collections').select('*').order('sort_order'),
   db.from('dlfr_cards').select('*').order('sort_order'),
   db.rpc('dlfr_cards_status')]);
  if(c.error)throw c.error;if(k.error)throw k.error;if(st.error)throw st.error;
  S.collections=c.data||[];S.cards=(k.data||[]).map(r=>({row:r,card:toCard(r)}));S.status=st.data||{};S.loaded=true;S.error='';
 }catch(e){S.error=e.message||'Chargement impossible.';}
 finally{S.loading=false;paint();}
}
async function refreshStatus(){const {data,error}=await S.ctx.db.rpc('dlfr_cards_status');if(!error)S.status=data||{};}

function countdown(to){const ms=new Date(to)-Date.now();if(!(ms>0))return 'maintenant';const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000);return h?`${h} h ${String(m).padStart(2,'0')}`:`${m} min`;}
function boosterArt(name,emblem,theme){return `<div class="dlfr127-booster-wrap" aria-hidden="true"><div class="dlfr117-booster b-${theme} dlfr127-booster" aria-hidden="true"><div class="b-crimp"></div><div class="b-body"><div class="b-pattern"></div><div class="b-glow"></div><div class="b-logo">DLFR <b>CARDS</b></div><div class="b-emblem">${emblem}</div><div class="b-name">${esc(name)}</div><div class="b-meta">5 CARTES</div><div class="b-foil"></div></div><div class="b-crimp b-bottom"></div></div></div>`;}

function view(){
 const st=S.status||{},signed=!!st.signed_in,inv=st.inventory||{},done=new Set((st.collections_done||[]).map(Number));
 const owned=S.cards.filter(x=>Number(inv[x.card.id])>0).length,total=S.cards.length;
 const dups=S.cards.reduce((n,x)=>n+Math.max(0,(Number(inv[x.card.id])||0)-1),0),dupValue=Number(st.duplicates_value)||0;
 const price=Number(st.booster_price)||150,bal=Number(st.balance)||0;
 if(S.error)return `<div class="notice warning">DLFR Cards indisponible : ${esc(S.error)}</div>`;
 if(!S.loaded)return '<div class="dlfr127-loading">Chargement de ta collection…</div>';
 const pityLeft=Math.max(1,40-(Number(st.pity)||0));
 const actions=signed?`<div class="dlfr127-actions">
   <article class="dlfr127-action is-daily ${st.daily_available?'is-ready':''}">${boosterArt('Booster du jour','✦','violet')}<div><small>GRATUIT · CHAQUE JOUR</small><h3>Booster du jour</h3><p>5 cartes offertes, la dernière est Rare ou mieux.</p>
     ${st.daily_available?`<button type="button" class="btn" data-cards-open="daily" ${S.busy?'disabled':''}>Ouvrir gratuitement</button>`:`<span class="dlfr127-wait" data-next="${esc(st.next_daily)}">Prochain booster dans <b>${countdown(st.next_daily)}</b></span>`}</div></article>
   <article class="dlfr127-action">${boosterArt('Booster DLFR','◆','blue')}<div><small>BOUTIQUE</small><h3>Booster DLFR</h3><p>5 cartes pour ${price} Wayllings dorés.</p>
     <button type="button" class="btn" data-cards-open="shop" ${S.busy||bal<price?'disabled':''} ${bal<price?'title="Solde insuffisant"':''}>Acheter et ouvrir · ${price} ✦</button></div></article>
   <article class="dlfr127-action is-recycle"><div class="dlfr127-recycle-ico" aria-hidden="true">♻</div><div><small>DOUBLONS</small><h3>${dups} doublon${dups>1?'s':''}</h3><p>Recycle-les en Wayllings dorés (tu gardes toujours un exemplaire).</p>
     <button type="button" class="btn subtle" data-cards-recycle ${S.busy||!dups?'disabled':''}>Tout recycler · +${dupValue} ✦</button></div></article>
  </div>`:`<div class="dlfr127-guest"><b>Connecte-toi pour commencer ta collection</b><p>Un booster gratuit t’attend chaque jour.</p><a class="btn" data-nav href="?page=my-profile">Se connecter</a></div>`;
 const collections=S.collections.map(col=>{
   const list=S.cards.filter(x=>Number(x.row.collection_id)===Number(col.id));if(!list.length)return '';
   const have=list.filter(x=>Number(inv[x.card.id])>0).length,bonus=list.length*40,complete=done.has(Number(col.id));
   const shown=list.filter(x=>S.filter==='all'||(S.filter==='owned')===(Number(inv[x.card.id])>0));
   return `<section class="dlfr127-col" style="--col:${esc(col.color||'#8b5cf6')}"><header><div><h3>${esc(col.name)}</h3>${col.description?`<p>${esc(col.description)}</p>`:''}</div>
    <div class="dlfr127-col-meta"><b>${have} / ${list.length}</b><div class="dlfr127-bar"><i style="width:${list.length?have/list.length*100:0}%"></i></div><small>${complete?'✓ Bonus de collection obtenu':`Collection complète : +${bonus} ✦`}</small></div></header>
    <div class="dlfr127-grid">${shown.map(x=>{const q=Number(inv[x.card.id])||0;return `<div class="dlfr127-slot ${q?'is-owned':'is-missing'}" title="${esc(x.card.name)} · ${esc(x.card.rarity)}">${fig(x.card,q>0)}${q>1?`<span class="dlfr127-qty">×${q}</span><button type="button" class="dlfr127-recycle-one" data-cards-recycle="${x.card.id}" title="Recycler ${q-1} doublon(s)">♻ +${(q-1)*(VALUE[x.card.rarity]||2)}</button>`:''}</div>`;}).join('')||'<p class="muted small">Aucune carte dans ce filtre.</p>'}</div></section>`;
 }).join('');
 const embedded=!!document.querySelector('#dlfr127Cards.is-embedded');
 return (embedded?`<div class="dlfr127-hero-stats is-compact"><div><span>Cartes</span><b>${signed?owned:'—'} <small>/ ${total}</small></b></div><div><span>Wayllings dorés</span><b>✦ ${signed?bal:'—'}</b></div>${signed?`<div><span>Légendaire garantie</span><b>${pityLeft} <small>carte${pityLeft>1?'s':''}</small></b></div>`:''}</div>`:`<header class="dlfr127-hero"><div><span class="kicker">Collection</span><h1>DLFR Cards</h1><p>Collectionne les niveaux, les joueurs et les moments de la DLFR. Les doublons et les collections complètes rapportent des <b>Wayllings dorés</b>.</p></div>
  <a class="dlfr129-adventure-cta" href="?page=cards-lab" data-nav><span aria-hidden="true">🗺️</span><span><b>Mode Aventure</b><small>Expéditions, talents, Forge, quêtes…</small></span><em>Jouer →</em></a>
  <div class="dlfr127-hero-stats"><div><span>Cartes</span><b>${signed?owned:'—'} <small>/ ${total}</small></b></div><div><span>Wayllings dorés</span><b>✦ ${signed?bal:'—'}</b></div>${signed?`<div><span>Légendaire garantie</span><b>${pityLeft} <small>carte${pityLeft>1?'s':''}</small></b></div>`:''}</div></header>`)+`
  ${actions}
  <details class="dlfr127-odds"><summary>Probabilités et règles</summary><ul><li>Chaque carte : Commun 58 % · Rare 27 % · Épique 10 % · Légendaire 4 % · Mythique 1 %.</li><li>La 5e carte de chaque booster est Rare ou mieux.</li><li>Une carte Légendaire ou mieux est garantie au plus tard toutes les 40 cartes.</li><li>Recyclage d’un doublon : Commun 2 ✦ · Rare 5 ✦ · Épique 15 ✦ · Légendaire 40 ✦ · Mythique 120 ✦.</li><li>Collection complète : 40 ✦ par carte de la collection, une seule fois.</li></ul></details>
  ${LAB()?.ladder?LAB().ladder([58,27,10,4,1]):''}
  <div class="dlfr127-filters" role="group" aria-label="Filtrer les cartes">${[['all','Toutes'],['owned','Possédées'],['missing','Manquantes']].map(([k,l])=>`<button type="button" data-cards-filter="${k}" class="${S.filter===k?'active':''}" aria-pressed="${S.filter===k}">${l}</button>`).join('')}</div>
  ${collections||'<p class="muted">Aucune carte dans le catalogue pour le moment.</p>'}`;
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
  await refreshStatus();S.busy=false;
  const price=Number(S.status?.booster_price)||150,canAgain=Number(S.status?.balance)>=price;
  const after=()=>{paint();S.ctx.onWallet?.();};
  if(LAB()?.playReal)LAB().playReal({name:source==='daily'?'Booster du jour':'Booster DLFR',theme:source==='daily'?'violet':'blue',emblem:source==='daily'?'✦':'◆'},draws,
   {data:S.ctx.data,balance:data.balance,bonuses:data.bonuses||[],onClose:after,againLabel:canAgain?`Rouvrir un booster · ${price} ✦`:'',onAgain:()=>{after();open('shop');}});
  else{after();S.ctx.toast?.(`${draws.length} cartes obtenues !`);}
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
 const f=ev.target.closest('[data-cards-filter]');if(f){S.filter=f.dataset.cardsFilter;paint();}
});
window.DLFR_CARDS={
 page(){return '<section class="dlfr127-cards" id="dlfr127Cards" aria-live="polite"><div class="dlfr127-loading">Chargement de ta collection…</div></section>';},
 refresh(){if(!S.ctx)return;if(S.loaded)paint();else load();},
 mount(ctx){const sessionChanged=S.ctx&&S.ctx.session!==ctx.session;S.ctx=ctx;if(sessionChanged)S.loaded=false;if(S.loaded)paint();else load();},
 reset(){S.loaded=false;S.status=null;}
};
})();

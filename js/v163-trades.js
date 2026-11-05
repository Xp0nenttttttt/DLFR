/* DLFR V163 — Échanges de cartes entre joueurs (onglet « 🔄 Échanges » de la page Cartes).
 * Les échanges sont vérifiés et exécutés par Supabase (dlfr_trade_*). Doublons uniquement, 5 cartes max
 * de chaque côté, 5 échanges conclus par jour.
 */
(()=>{'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const S={ctx:null,st:null,cards:[],loaded:false,loading:false,busy:false,error:'',give:{},want:{},to:'',msg:'',q:'',wq:'',tab:'market'};
const LAB=()=>window.DLFR_CARDS_LAB;
const card=id=>S.cards.find(c=>Number(c.id)===Number(id));
const inv=()=>S.st?.inventory||{};
const count=id=>Number(inv()[id])||0;
const total=o=>Object.values(o).reduce((a,b)=>a+(Number(b)||0),0);
const RAR=['Commun','Rare','Épique','Légendaire','Mythique','Ultra'];
const tradeable=c=>c&&c.rarity!=='Secrète'&&c.rarity!=='Festive';
function chip(id,q){const c=card(id);return `<span class="dlfr163-chip r${Math.max(0,RAR.indexOf(c?.rarity))}">${q>1?`<b>${q}×</b> `:''}${esc(c?.name||('#'+id))}<small>${esc(c?.rarity||'')}</small></span>`;}
const list=o=>Object.entries(o||{}).map(([id,q])=>chip(id,Number(q))).join('');

async function load(force){
 const db=S.ctx?.db;if(!db||S.loading||(S.loaded&&!force))return;S.loading=true;
 try{const [st,k]=await Promise.all([db.rpc('dlfr_trades_status'),S.cards.length&&!force?{data:S.cards}:db.from('dlfr_cards').select('id,name,rarity,card_type,collection_id').order('sort_order')]);
  if(st.error)throw st.error;S.st=st.data||{};if(!k.error)S.cards=(k.data||[]).filter(tradeable);S.loaded=true;S.error='';}
 catch(e){S.error=e.message||'Échanges indisponibles pour le moment.';}
 finally{S.loading=false;paint();}
}
function offerHTML(o,kind){
 return `<article class="dlfr163-offer"><header><b>${kind==='in'?`De ${esc(o.from)}`:kind==='pub'?`${esc(o.from)}`:o.to?`Pour ${esc(o.to)}`:'Offre publique'}</b><small>${new Date(o.at).toLocaleDateString('fr-FR')}</small></header>
  <div class="dlfr163-sides"><div><span>${kind==='out'?'Tu donnes':'Tu reçois'}</span>${list(o.give)}</div><i>⇄</i><div><span>${kind==='out'?'Tu demandes':'Tu donnes'}</span>${list(o.want)}</div></div>
  ${o.message?`<p class="dlfr163-msg">« ${esc(o.message)} »</p>`:''}
  <div class="dlfr163-actions">${kind==='out'?`<button class="btn small subtle" type="button" data-tr-close="${o.id}">Annuler l’offre</button>`:`<button class="btn small" type="button" data-tr-accept="${o.id}" ${S.busy?'disabled':''}>Accepter l’échange</button>${kind==='in'?`<button class="btn small subtle" type="button" data-tr-close="${o.id}">Refuser</button>`:''}`}</div></article>`;
}
function builderHTML(){
 const dups=S.cards.filter(c=>count(c.id)>=2).sort((a,b)=>RAR.indexOf(b.rarity)-RAR.indexOf(a.rarity));
 const q=norm(S.q),wants=S.cards.filter(c=>!q||norm(c.name).includes(q)).slice(0,60);
 const players=(S.ctx?.data?.players||[]).filter(p=>p.player_key).slice(0,800);
 return `<section class="dlfr163-build"><h3>Proposer un échange</h3>
  <label class="dlfr163-to">Avec qui ? <input list="dlfr163Players" data-tr="to" value="${esc(S.to)}" placeholder="Pseudo du joueur (vide = offre publique)"><datalist id="dlfr163Players">${players.map(p=>`<option value="${esc(p.player_key)}">${esc(p.display_name||p.username||p.player_key)}</option>`).join('')}</datalist></label>
  <div class="dlfr163-cols">
   <div><h4>Tu donnes <small>(${total(S.give)}/5 · doublons seulement)</small></h4><div class="dlfr163-pick">${dups.map(c=>{const n=S.give[c.id]||0;return `<div class="dlfr163-row ${n?'is-on':''}">${chip(c.id,1)}<small>×${count(c.id)}</small><span class="dlfr163-qty"><button type="button" data-tr-give="${c.id}" data-d="-1" ${n?'':'disabled'}>−</button><b>${n}</b><button type="button" data-tr-give="${c.id}" data-d="1" ${n>=count(c.id)-1||total(S.give)>=5?'disabled':''}>+</button></span></div>`;}).join('')||'<p class="muted small">Tu n’as aucun doublon pour l’instant.</p>'}</div></div>
   <div><h4>Tu demandes <small>(${total(S.want)}/5)</small></h4><input type="search" data-tr="q" value="${esc(S.q)}" placeholder="Chercher une carte…"><div class="dlfr163-pick">${wants.map(c=>{const n=S.want[c.id]||0;return `<div class="dlfr163-row ${n?'is-on':''}">${chip(c.id,1)}${count(c.id)?`<small>tu en as ${count(c.id)}</small>`:'<small class="is-miss">manquante</small>'}<span class="dlfr163-qty"><button type="button" data-tr-want="${c.id}" data-d="-1" ${n?'':'disabled'}>−</button><b>${n}</b><button type="button" data-tr-want="${c.id}" data-d="1" ${total(S.want)>=5?'disabled':''}>+</button></span></div>`;}).join('')}</div></div>
  </div>
  <label class="dlfr163-to">Message (facultatif) <input data-tr="msg" maxlength="200" value="${esc(S.msg)}" placeholder="Ex. : il me manque juste celle-là !"></label>
  <button class="btn" type="button" data-tr-create ${S.busy||!total(S.give)||!total(S.want)?'disabled':''}>Envoyer l’offre</button></section>`;
}
function wishHTML(){
 const st=S.st||{},mine=new Set((st.wishlist||[]).map(Number)),q=norm(S.wq);
 const pool=S.cards.filter(c=>!q||norm(c.name).includes(q)).slice(0,80);
 return `<section class="dlfr163-wish"><h3>Ma liste de souhaits <small>(${mine.size}/30)</small></h3><p class="muted small">Les autres joueurs voient que tu cherches ces cartes et peuvent te proposer un échange.</p>
  <div class="dlfr163-wl">${[...mine].map(id=>`<button type="button" class="dlfr163-tag" data-tr-wish="${id}">${esc(card(id)?.name||'#'+id)} ✕</button>`).join('')||'<span class="muted small">Vide pour l’instant.</span>'}</div>
  <input type="search" data-tr="wq" value="${esc(S.wq)}" placeholder="Ajouter une carte…"><div class="dlfr163-wl">${pool.filter(c=>!mine.has(Number(c.id))).map(c=>`<button type="button" class="dlfr163-tag is-add ${count(c.id)?'':'is-miss'}" data-tr-wish="${c.id}">+ ${esc(c.name)}</button>`).join('')}</div>
  ${(st.wanted||[]).length?`<h3>Ils cherchent tes doublons</h3><div class="dlfr163-wanted">${st.wanted.map(w=>`<div>${chip(w.card_id,1)}<span>${esc(w.player)} la cherche</span>${w.player_key?`<button type="button" class="btn small subtle" data-tr-propose="${esc(w.player_key)}" data-card="${w.card_id}">Lui proposer</button>`:''}</div>`).join('')}</div>`:''}
 </section>`;
}
function view(){
 if(S.error)return `<div class="notice warning">${esc(S.error)}</div>`;
 if(!S.loaded)return '<div class="dlfr127-loading">Chargement des échanges…</div>';
 const st=S.st||{};if(!st.signed_in)return '<p class="dlfr160-guest">Connecte-toi pour échanger des cartes.</p>';
 const tabs=[['market',`Offres${(st.incoming||[]).length?` (${st.incoming.length} reçue${st.incoming.length>1?'s':''})`:''}`],['new','Proposer'],['wish','Souhaits'],['history','Historique']];
 let body='';
 if(S.tab==='market')body=`${(st.incoming||[]).length?`<h3>Offres reçues</h3><div class="dlfr163-grid">${st.incoming.map(o=>offerHTML(o,'in')).join('')}</div>`:''}
  <h3>Offres publiques</h3><div class="dlfr163-grid">${(st.public||[]).map(o=>offerHTML(o,'pub')).join('')||'<p class="muted small">Aucune offre publique pour le moment.</p>'}</div>
  ${(st.outgoing||[]).length?`<h3>Mes offres en cours</h3><div class="dlfr163-grid">${st.outgoing.map(o=>offerHTML(o,'out')).join('')}</div>`:''}`;
 if(S.tab==='new')body=builderHTML();
 if(S.tab==='wish')body=wishHTML();
 if(S.tab==='history')body=`<div class="dlfr163-hist">${(st.history||[]).map(h=>`<div class="is-${h.status}"><b>${h.status==='accepted'?'✓ Échange conclu':h.status==='declined'?'Refusé':'Annulé'}</b><span>${h.other?`avec ${esc(h.other)}`:'offre publique'}</span><div>${h.mine?'Donné':'Reçu'} : ${list(h.give)} · ${h.mine?'Reçu':'Donné'} : ${list(h.want)}</div><small>${new Date(h.at).toLocaleString('fr-FR')}</small></div>`).join('')||'<p class="muted small">Aucun échange pour l’instant.</p>'}</div>`;
 return `<section class="dlfr163"><header><div><span class="dlfr160-kicker">🔄 ÉCHANGES</span><h2>Échanges entre collectionneurs</h2><p>Échange tes doublons avec les autres joueurs. Tu gardes toujours au moins 1 exemplaire de chaque carte. 5 cartes maximum de chaque côté, 5 échanges conclus par jour, sans argent réel.</p></div><div class="dlfr160-timer"><span>Aujourd’hui</span><b>${Number(st.done_today)||0} / 5</b></div></header>
  <div class="dlfr163-tabs">${tabs.map(([k,l])=>`<button type="button" class="${S.tab===k?'active':''}" data-tr-tab="${k}">${l}</button>`).join('')}</div>${body}</section>`;
}
function paint(){const root=document.getElementById('dlfr163Trades');if(!root)return;const y=window.scrollY,f=document.activeElement?.dataset?.tr;root.innerHTML=view();window.scrollTo(0,y);if(f){const i=root.querySelector(`[data-tr="${f}"]`);if(i){i.focus();try{i.setSelectionRange(i.value.length,i.value.length);}catch{}}}}
async function call(fn,args,okMsg){if(S.busy)return null;S.busy=true;paint();
 try{const {data,error}=await S.ctx.db.rpc(fn,args);if(error)throw error;if(okMsg)S.ctx.toast?.(okMsg);return data||true;}
 catch(e){S.ctx.toast?.(e.message||'Action impossible.');return null;}finally{S.busy=false;}}
async function afterInventory(){const st=await S.ctx.db.rpc('dlfr_cards_status');if(!st.error)LAB()?.applyServerInventory?.(st.data?.inventory||{});window.DLFR_CARDS?.invalidate?.();}
document.addEventListener('click',async ev=>{
 const root=ev.target.closest?.('#dlfr163Trades');if(!root)return;const t=ev.target;
 const tab=t.closest('[data-tr-tab]');if(tab){S.tab=tab.dataset.trTab;paint();return;}
 const g=t.closest('[data-tr-give]');if(g){const id=g.dataset.trGive;S.give[id]=Math.max(0,(S.give[id]||0)+Number(g.dataset.d));if(!S.give[id])delete S.give[id];paint();return;}
 const w=t.closest('[data-tr-want]');if(w){const id=w.dataset.trWant;S.want[id]=Math.max(0,(S.want[id]||0)+Number(w.dataset.d));if(!S.want[id])delete S.want[id];paint();return;}
 if(t.closest('[data-tr-create]')){const r=await call('dlfr_trade_create',{p_to_player:S.to||null,p_give:S.give,p_want:S.want,p_message:S.msg||null},'Offre envoyée.');if(r){S.give={};S.want={};S.msg='';S.tab='market';}await load(true);return;}
 const a=t.closest('[data-tr-accept]');if(a){if(!confirm('Accepter cet échange ? Les cartes sont échangées immédiatement.'))return;const r=await call('dlfr_trade_accept',{p_id:Number(a.dataset.trAccept)},'🔄 Échange conclu !');if(r)await afterInventory();await load(true);return;}
 const c=t.closest('[data-tr-close]');if(c){await call('dlfr_trade_close',{p_id:Number(c.dataset.trClose)},'Offre fermée.');await load(true);return;}
 const wi=t.closest('[data-tr-wish]');if(wi){await call('dlfr_wishlist_toggle',{p_card_id:Number(wi.dataset.trWish)});await load(true);return;}
 const pr=t.closest('[data-tr-propose]');if(pr){S.to=pr.dataset.trPropose;S.give={[pr.dataset.card]:1};S.tab='new';paint();}
});
document.addEventListener('input',ev=>{const e=ev.target;if(!e.closest?.('#dlfr163Trades')||!e.dataset.tr)return;const k=e.dataset.tr;S[k]=e.value;if(k==='q'||k==='wq'){clearTimeout(S.t);S.t=setTimeout(paint,200);}});
window.DLFR_TRADES={
 mount(ctx){const changed=S.ctx&&S.ctx.session!==ctx.session;S.ctx=ctx;if(changed)S.loaded=false;if(S.loaded)paint();else load();},
 refresh(){if(!S.ctx)return;if(S.loaded)paint();else load();}
};
})();

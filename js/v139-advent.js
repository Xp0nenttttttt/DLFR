/* DLFR V139 — Calendrier de l'Avent DLFR Cards (onglet « 🎄 Avent » de la page Cartes).
 * Les ouvertures et récompenses sont validées par Supabase (dlfr_advent_open). Les propriétaires et
 * supermodérateurs préparent les 25 cases (carte + Wayllings + titre) via dlfr_advent_set_day.
 */
(()=>{'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Ordre « mélangé » des cases, comme un vrai calendrier (toujours le même).
const ORDER=[7,18,3,24,12,1,20,9,15,5,22,11,25,2,16,8,19,13,4,21,10,23,6,17,14];
const S={ctx:null,status:null,cards:[],loaded:false,loading:false,busy:false,error:'',editOpen:false};
const LAB=()=>window.DLFR_CARDS_LAB;
const card=id=>S.cards.find(c=>Number(c.id)===Number(id));
const mk=r=>LAB()?.mkCard?LAB().mkCard(r):{id:Number(r.id),name:r.name,rarity:r.rarity,type:r.card_type,image:r.image_url};
function fig(r){const L=LAB();return L?.figure?L.figure(mk(r),S.ctx?.data||{},true,{official:true,owned:true}):`<b>${esc(r.name)}</b>`;}

async function load(force){
 const db=S.ctx?.db;if(!db||S.loading||(S.loaded&&!force))return;S.loading=true;
 try{const [st,k]=await Promise.all([db.rpc('dlfr_advent_status'),db.from('dlfr_cards').select('*').order('sort_order')]);
  if(st.error)throw st.error;if(k.error)throw k.error;S.status=st.data||{};S.cards=k.data||[];S.loaded=true;S.error='';}
 catch(e){S.error=e.message||'Calendrier indisponible.';}
 finally{S.loading=false;paint();}
}
function countdown(){
 const st=S.status||{};const start=new Date(`${st.start}T00:00:00+01:00`);const ms=start-Date.now();
 if(!(ms>0))return '';const d=Math.floor(ms/864e5),h=Math.floor(ms%864e5/36e5),m=Math.floor(ms%36e5/6e4);
 return `<div class="dlfr139-count"><span>Ouverture le 1er décembre dans</span><b>${d}<small>j</small> ${h}<small>h</small> ${String(m).padStart(2,'0')}<small>min</small></b></div>`;
}
function doorHTML(d){
 const st=S.status||{},today=new Date(`${st.today}T12:00:00`),isToday=st.open&&today.getDate()===d.day;
 const past=st.open&&d.day<today.getDate();
 if(d.claimed){
  const c=d.card_id?card(d.card_id):null;
  return `<div class="dlfr139-door is-open d${d.day}" data-day="${d.day}"><span class="dlfr139-num">${d.day}</span>
   <div class="dlfr139-gift">${c?`<div class="dlfr139-gift-card">${fig(c)}</div>`:'<span class="dlfr139-coin">✦</span>'}${d.coins?`<b class="dlfr139-coins">+${esc(d.coins)} ✦</b>`:''}${d.title?`<small>${esc(d.title)}</small>`:''}</div></div>`;
 }
 if(d.unlocked)return `<button type="button" class="dlfr139-door is-ready ${isToday?'is-today':''} d${d.day}" data-advent-open="${d.day}" ${S.busy||!st.signed_in?'disabled':''} aria-label="Ouvrir la case du ${d.day} décembre"><span class="dlfr139-num">${d.day}</span><span class="dlfr139-ribbon" aria-hidden="true"></span><span class="dlfr139-cta">${isToday?'Ouvrir !':past?'À rattraper':'Ouvrir'}</span>${d.has_card?'<span class="dlfr139-hint" title="Une carte se cache derrière">🃏</span>':''}</button>`;
 return `<div class="dlfr139-door is-locked d${d.day}" aria-label="Case du ${d.day} décembre, pas encore ouverte"><span class="dlfr139-num">${d.day}</span><span class="dlfr139-lock" aria-hidden="true">❄</span></div>`;
}
function editorHTML(){
 const st=S.status||{};if(!st.editor)return '';
 const fest=S.cards.filter(c=>c.rarity==='Festive'),other=S.cards.filter(c=>c.rarity!=='Festive');
 const opts=sel=>`<option value="">— Aucune carte —</option>${fest.length?`<optgroup label="❄ Cartes Festive">${fest.map(c=>`<option value="${c.id}" ${Number(sel)===Number(c.id)?'selected':''}>#${c.id} · ${esc(c.name)}</option>`).join('')}</optgroup>`:''}<optgroup label="Autres cartes">${other.map(c=>`<option value="${c.id}" ${Number(sel)===Number(c.id)?'selected':''}>#${c.id} · ${esc(c.name)} (${esc(c.rarity)})</option>`).join('')}</optgroup>`;
 return `<details class="dlfr139-editor" ${S.editOpen?'open':''}><summary>✎ Préparer le calendrier ${esc(st.year)} <span>(propriétaires et supermodérateurs)</span></summary>
  <p class="muted small">Pour chaque jour : une carte (crée d’abord tes cartes de rareté <b>Festive</b> dans l’onglet ✎ Catalogue, idéalement avec « dans les boosters » décoché), des Wayllings dorés et un titre facultatif. Les joueurs ne voient la récompense qu’en ouvrant la case.${fest.length?'':' <b>Aucune carte Festive pour l’instant.</b>'}</p>
  <div class="dlfr139-edit-grid">${(st.days||[]).map(d=>`<form class="dlfr139-edit-row" data-advent-edit="${d.day}"><b>${d.day} déc.</b><select name="card">${opts(d.card_id)}</select><label>✦<input type="number" name="coins" min="0" max="5000" step="10" value="${esc(d.coins??0)}"></label><input name="title" maxlength="60" placeholder="Titre (facultatif)" value="${esc(d.title||'')}"><button class="btn small" type="submit">Enregistrer</button></form>`).join('')}</div></details>`;
}
function view(){
 if(S.error)return `<div class="notice warning">${esc(S.error)}</div>`;
 if(!S.loaded)return '<div class="dlfr127-loading">Chargement du calendrier…</div>';
 const st=S.status||{},days=st.days||[],byDay=new Map(days.map(d=>[d.day,d]));
 const opened=days.filter(d=>d.claimed).length,festOwned=days.filter(d=>d.claimed&&d.card_id).length,ready=days.filter(d=>d.unlocked&&!d.claimed).length;
 return `<section class="dlfr139-cal">
  <header class="dlfr139-head"><div><span class="dlfr139-kicker">❄ DLFR CARDS · ${esc(st.year)}</span><h2>Calendrier de l’Avent</h2><p>25 cases, du 1er décembre à Noël. Des cartes <b>Festive</b> (rareté spéciale introuvable dans les boosters) et des Wayllings dorés.</p></div>
   ${countdown()||`<div class="dlfr139-stats"><div><span>Cases ouvertes</span><b>${opened} / 25</b></div><div><span>Cartes Festive</span><b>${festOwned}</b></div>${ready?`<div class="is-hot"><span>À ouvrir</span><b>${ready}</b></div>`:''}</div>`}</header>
  ${!st.signed_in?'<p class="dlfr139-guest">Connecte-toi pour ouvrir les cases du calendrier.</p>':''}
  <div class="dlfr139-grid">${ORDER.map(n=>byDay.get(n)).filter(Boolean).map(doorHTML).join('')}</div>
  <p class="muted small dlfr139-foot">Une case s’ouvre à partir de son jour (heure de Paris). Les cases ratées peuvent être rattrapées jusqu’au 31 décembre.</p>
  ${editorHTML()}
 </section>`;
}
function paint(){const root=document.getElementById('dlfr139Advent');if(!root)return;const y=window.scrollY;root.innerHTML=view();window.scrollTo(0,y);}
async function openDay(day){
 if(S.busy)return;S.busy=true;paint();
 try{
  const {data,error}=await S.ctx.db.rpc('dlfr_advent_open',{p_day:day});if(error)throw error;
  const st=await S.ctx.db.rpc('dlfr_cards_status');if(!st.error)LAB()?.applyServerInventory?.(st.data?.inventory||{});
  window.DLFR_CARDS?.invalidate?.();
  await load(true);S.busy=false;
  const c=data.card_id?card(data.card_id):null;
  if(c&&LAB()?.playReal){LAB().playReal({name:`Calendrier · ${day} décembre`,theme:'crimson',emblem:'🎄'},[{card:mk(c),isNew:data.is_new,value:60}],{data:S.ctx.data,balance:data.balance,bonuses:data.bonuses||[],onClose:()=>paint()});}
  else paint();
  S.ctx.toast?.(`Case du ${day} décembre ouverte !${data.coins?` +${data.coins} Wayllings dorés ✦`:''}`);
 }catch(e){S.busy=false;paint();S.ctx.toast?.(e.message||'Ouverture impossible.');}
}
async function saveDay(form){
 const day=Number(form.dataset.adventEdit),st=S.status||{},btn=form.querySelector('button');btn.disabled=true;
 try{const {error}=await S.ctx.db.rpc('dlfr_advent_set_day',{p_year:Number(st.year),p_day:day,p_card_id:form.card.value?Number(form.card.value):null,p_coins:Number(form.coins.value)||0,p_title:form.title.value||null});
  if(error)throw error;S.editOpen=true;S.ctx.toast?.(`Jour ${day} enregistré.`);await load(true);}
 catch(e){S.ctx.toast?.(e.message||'Enregistrement impossible.');btn.disabled=false;}
}
document.addEventListener('click',ev=>{
 if(!ev.target.closest?.('#dlfr139Advent'))return;
 const o=ev.target.closest('[data-advent-open]');if(o){ev.preventDefault();openDay(Number(o.dataset.adventOpen));return;}
 const sum=ev.target.closest('.dlfr139-editor>summary');if(sum)setTimeout(()=>{S.editOpen=!!document.querySelector('.dlfr139-editor')?.open;},0);
});
document.addEventListener('submit',ev=>{const f=ev.target.closest?.('#dlfr139Advent [data-advent-edit]');if(f){ev.preventDefault();ev.stopPropagation();saveDay(f);}},true);
setInterval(()=>{if(document.querySelector('#dlfr139Advent .dlfr139-count'))paint();},60000);
window.DLFR_ADVENT={
 mount(ctx){const changed=S.ctx&&S.ctx.session!==ctx.session;S.ctx=ctx;if(changed)S.loaded=false;if(S.loaded)paint();else load();},
 refresh(){if(!S.ctx)return;if(S.loaded)paint();else load();}
};
})();

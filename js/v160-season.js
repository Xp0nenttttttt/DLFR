/* DLFR V160 — Boss communautaire hebdomadaire et Saisons (onglets « ⚔ Boss » et « 🏆 Saison » de la page Cartes).
 * Toute la logique (dégâts, XP de saison, récompenses) est calculée par Supabase.
 */
(()=>{'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Math.round(Number(n)||0).toLocaleString('fr-FR');
const day=d=>{try{return new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR',{day:'numeric',month:'long'});}catch{return d;}};
const S={ctx:null,boss:null,season:null,cards:[],loaded:false,loading:false,busy:false,error:'',last:null};
const LAB=()=>window.DLFR_CARDS_LAB;
const card=id=>S.cards.find(c=>Number(c.id)===Number(id));
const fig=r=>{const L=LAB();return L?.figure&&L.mkCard?L.figure(L.mkCard(r),S.ctx?.data||{},true,{official:true,owned:true}):`<b>${esc(r.name)}</b>`;};
function left(dateStr){const ms=new Date(`${dateStr}T00:00:00+01:00`)-Date.now();if(!(ms>0))return 'bientôt';const d=Math.floor(ms/864e5),h=Math.floor(ms%864e5/36e5);return d?`${d} j ${h} h`:`${h} h ${Math.floor(ms%36e5/6e4)} min`;}

async function load(force){
 const db=S.ctx?.db;if(!db||S.loading||(S.loaded&&!force))return;S.loading=true;
 try{const [b,s,k]=await Promise.all([db.rpc('dlfr_boss_status'),db.rpc('dlfr_season_status'),S.cards.length&&!force?{data:S.cards}:db.from('dlfr_cards').select('id,name,rarity,card_type,image_url,collection_id').order('sort_order')]);
  if(b.error)throw b.error;if(s.error)throw s.error;S.boss=b.data||{};S.season=s.data||{};if(!k.error)S.cards=k.data||[];S.loaded=true;S.error='';}
 catch(e){S.error=e.message||'Indisponible pour le moment.';}
 finally{S.loading=false;paint();}
}

// ------------------------------------------------------------ Boss
function bossView(){
 const b=S.boss||{},pct=b.max_hp?Math.max(0,b.hp)/b.max_hp*100:0,top=b.top||[];
 const rc=b.reward_card_id?card(b.reward_card_id):null;
 return `<section class="dlfr160-boss ${b.defeated?'is-dead':''}">
  <header><div><span class="dlfr160-kicker">⚔ BOSS DE LA SEMAINE</span><h2>${b.position?`#${esc(b.position)} · `:''}${esc(b.demon)}</h2>
   <p>Toute la communauté l’attaque ensemble. Chaque joueur a <b>3 attaques par jour</b> ; les dégâts dépendent de ta collection (rareté des cartes et doublons). S’il tombe avant lundi, tous les participants gagnent une carte Épique ou mieux et des Wayllings dorés.</p></div>
   <div class="dlfr160-timer"><span>${b.defeated?'Vaincu':'Fin dans'}</span><b>${b.defeated?'✓':left(b.ends)}</b></div></header>
  <div class="dlfr160-hp"><div class="dlfr160-hp-bar"><i style="width:${pct}%"></i></div><div class="dlfr160-hp-txt"><b>${fmt(b.hp)}</b> / ${fmt(b.max_hp)} PV · ${fmt(b.players)} participant${b.players>1?'s':''}</div></div>
  ${b.defeated?`<div class="dlfr160-win">🏆 Vaincu${b.defeated_by?` · coup final de <b>${esc(b.defeated_by)}</b>`:''} ! ${b.my_attacks?`Ta récompense : ${b.reward_coins?`<b>+${fmt(b.reward_coins)} ✦</b>`:''}${rc?` et la carte <b>${esc(rc.name)}</b>`:''}.`:'Tu n’as pas participé cette semaine.'} Nouveau boss lundi.</div>${rc?`<div class="dlfr160-reward">${fig(rc)}</div>`:''}`:
  !b.signed_in?'<p class="dlfr160-guest">Connecte-toi pour attaquer le boss.</p>':
  `<div class="dlfr160-act"><div class="dlfr160-me"><span>Ta puissance</span><b>⚡ ${fmt(b.power)}</b></div><div class="dlfr160-me"><span>Tes dégâts</span><b>${fmt(b.my_damage)}</b></div>
   <button type="button" class="btn dlfr160-attack" data-boss-attack ${S.busy||!(b.attacks_left>0)?'disabled':''}>${b.attacks_left>0?`⚔ Attaquer (${b.attacks_left}/3 aujourd’hui)`:'Reviens demain'}</button>
   ${S.last?`<p class="dlfr160-hit" aria-live="polite">−${fmt(S.last.damage)} PV !${S.last.season_xp?` · +${fmt(S.last.season_xp)} XP de saison`:''}</p>`:''}</div>`}
  ${top.length?`<div class="dlfr160-top"><h3>Meilleurs attaquants</h3><ol>${top.map((x,i)=>`<li class="${x.me?'is-me':''}"><span>${i+1}</span><b>${esc(x.name)}</b><em>${fmt(x.damage)}</em></li>`).join('')}</ol><p class="muted small">Récompenses : Top 1 · 150 ✦ · Top 2-3 · 100 ✦ · autres participants · 40 ✦, + une carte Épique ou mieux pour chacun.</p></div>`:''}
 </section>`;
}
async function attack(){
 if(S.busy)return;S.busy=true;paint();
 try{const {data,error}=await S.ctx.db.rpc('dlfr_boss_attack');if(error)throw error;S.last=data;
  if(data.defeated){S.ctx.toast?.('🏆 Le boss est vaincu ! Récompenses distribuées.');window.DLFR_CARDS?.invalidate?.();}
  await load(true);}
 catch(e){S.ctx.toast?.(e.message||'Attaque impossible.');}
 finally{S.busy=false;paint();}
}

// ------------------------------------------------------------ Saison
function seasonView(){
 const s=S.season||{},tierXp=s.tier_xp||1000,tiers=s.tiers||28,xp=s.xp||0,cur=Math.min(tiers,Math.floor(xp/tierXp)),claimed=new Set((s.claimed||[]).map(Number));
 const ex=s.reward_card_id?card(s.reward_card_id):null,top=s.top||[];
 const tierHTML=t=>{const rw=(s.rewards||[])[t-1]||{},ok=xp>=t*tierXp,got=claimed.has(t);
  return `<div class="dlfr160-tier ${ok?'is-ok':''} ${got?'is-got':''} ${rw.kind==='exclusive'?'is-ex':''}"><span>${t}</span><small>${esc(rw.label||'')}</small>${got?'<em>✓</em>':ok&&s.signed_in?`<button type="button" class="btn small" data-season-claim="${t}" ${S.busy?'disabled':''}>Récupérer</button>`:''}</div>`;};
 const ready=[...Array(tiers)].map((_,i)=>i+1).filter(t=>xp>=t*tierXp&&!claimed.has(t)).length;
 return `<section class="dlfr160-season">
  <header><div><span class="dlfr160-kicker">🏆 SAISON · DU ${esc(day(s.starts_on))} AU ${esc(day(s.ends_on))}</span><h2>${esc(s.name)}</h2>${s.description?`<p>${esc(s.description)}</p>`:''}
   <p>28 paliers. L’XP de saison se gagne chaque jour : <b>présence quotidienne</b> (+300), <b>attaque du boss</b> (+150 chacune), <b>case du calendrier</b> (+200) et <b>cartes gagnées en Aventure</b> (+2 par carte). Au plus <b>${fmt(s.day_cap)} XP par jour</b> : jouer un peu chaque jour suffit pour tout finir.</p></div>
   <div class="dlfr160-timer"><span>Fin dans</span><b>${left(s.ends_on)}</b></div></header>
  <div class="dlfr160-xp"><div><b>Palier ${cur} / ${tiers}</b><span>${fmt(xp)} XP · aujourd’hui ${fmt(s.day_xp)} / ${fmt(s.day_cap)}</span></div><div class="dlfr160-xp-bar"><i style="width:${Math.min(100,xp/(tiers*tierXp)*100)}%"></i></div>
   ${s.signed_in?`<button type="button" class="btn" data-season-checkin ${S.busy||s.checked_in?'disabled':''}>${s.checked_in?'✓ Présence du jour récupérée':'☀ Présence du jour · +300 XP'}</button>`:'<p class="dlfr160-guest">Connecte-toi pour participer à la saison.</p>'}
   ${ready?`<p class="dlfr160-ready">${ready} récompense${ready>1?'s':''} à récupérer ↓</p>`:''}</div>
  ${ex?`<div class="dlfr160-ex"><div>${fig(ex)}</div><p><b>Carte exclusive de la saison</b><br>À gagner aux paliers 14 et 28 : <b>${esc(ex.name)}</b>.</p></div>`:''}
  <div class="dlfr160-tiers">${[...Array(tiers)].map((_,i)=>tierHTML(i+1)).join('')}</div>
  ${top.length?`<div class="dlfr160-top"><h3>Classement de la saison</h3><ol>${top.map((x,i)=>`<li class="${x.me?'is-me':''}"><span>${i+1}</span><b>${esc(x.name)}</b><em>${fmt(x.xp)} XP</em></li>`).join('')}</ol></div>`:''}
  ${s.editor?editorHTML(s):''}
 </section>`;
}
function editorHTML(s){
 return `<details class="dlfr160-editor"><summary>✎ Régler la saison (propriétaires et supermodérateurs)</summary>
  <form data-season-edit><label>Nom<input name="name" maxlength="60" value="${esc(s.name)}"></label>
  <label>Description (facultatif)<input name="description" maxlength="300" value="${esc(s.description||'')}" placeholder="Ex. : The Abyss, les niveaux les plus sombres"></label>
  <label>Carte exclusive (paliers 14 et 28)<select name="card"><option value="">— Aucune (carte Légendaire+ aléatoire) —</option>${S.cards.map(c=>`<option value="${c.id}" ${Number(s.reward_card_id)===Number(c.id)?'selected':''}>#${c.id} · ${esc(c.name)} (${esc(c.rarity)})</option>`).join('')}</select></label>
  <button class="btn small" type="submit">Enregistrer</button><p class="muted small">Astuce : crée la carte exclusive dans une collection, décoche « dans les boosters » pour qu’elle ne sorte que de la saison. Une nouvelle saison démarre automatiquement tous les 28 jours.</p></form></details>`;
}
async function checkin(){if(S.busy)return;S.busy=true;paint();
 try{const {data,error}=await S.ctx.db.rpc('dlfr_season_checkin');if(error)throw error;S.ctx.toast?.(`☀ +${fmt(data.xp)} XP de saison`);await load(true);}
 catch(e){S.ctx.toast?.(e.message||'Impossible pour le moment.');}finally{S.busy=false;paint();}}
async function claim(t){if(S.busy)return;S.busy=true;paint();
 try{const {data,error}=await S.ctx.db.rpc('dlfr_season_claim',{p_tier:t});if(error)throw error;
  const c=data.card_id?card(data.card_id):null;window.DLFR_CARDS?.invalidate?.();
  const st=await S.ctx.db.rpc('dlfr_cards_status');if(!st.error)LAB()?.applyServerInventory?.(st.data?.inventory||{});
  if(c&&LAB()?.playReal)LAB().playReal({name:`Saison · palier ${t}`,theme:'gold',emblem:'🏆'},[{card:LAB().mkCard(c),isNew:false,value:0}],{data:S.ctx.data,balance:data.balance,bonuses:data.bonuses||[],onClose:()=>paint()});
  S.ctx.toast?.(`Palier ${t} récupéré${data.coins?` : +${fmt(data.coins)} Wayllings dorés ✦`:c?` : ${c.name}`:''}`);await load(true);}
 catch(e){S.ctx.toast?.(e.message||'Récupération impossible.');}finally{S.busy=false;paint();}}
async function saveEdit(f){try{const {error}=await S.ctx.db.rpc('dlfr_season_edit',{p_name:f.name.value,p_description:f.description.value,p_reward_card_id:f.card.value?Number(f.card.value):null});if(error)throw error;S.ctx.toast?.('Saison enregistrée.');await load(true);}catch(e){S.ctx.toast?.(e.message||'Enregistrement impossible.');}}

function paint(){
 for(const [id,fn] of [['dlfr160Boss',bossView],['dlfr160Season',seasonView]]){const root=document.getElementById(id);if(!root)continue;
  root.innerHTML=S.error?`<div class="notice warning">${esc(S.error)}</div>`:!S.loaded?'<div class="dlfr127-loading">Chargement…</div>':fn();}
}
document.addEventListener('click',ev=>{
 if(!ev.target.closest?.('#dlfr160Boss,#dlfr160Season'))return;
 if(ev.target.closest('[data-boss-attack]')){ev.preventDefault();attack();return;}
 if(ev.target.closest('[data-season-checkin]')){ev.preventDefault();checkin();return;}
 const c=ev.target.closest('[data-season-claim]');if(c){ev.preventDefault();claim(Number(c.dataset.seasonClaim));}
});
document.addEventListener('submit',ev=>{const f=ev.target.closest?.('#dlfr160Season [data-season-edit]');if(f){ev.preventDefault();ev.stopPropagation();saveEdit(f);}},true);
window.DLFR_SEASON={
 mount(ctx){const changed=S.ctx&&S.ctx.session!==ctx.session;S.ctx=ctx;if(changed){S.loaded=false;S.last=null;}if(S.loaded)paint();else load();},
 refresh(){if(!S.ctx)return;if(S.loaded)paint();else load();}
};
})();

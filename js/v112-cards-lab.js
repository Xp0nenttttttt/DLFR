/* DLFR V112 — laboratoire de collection, exclusivement en mémoire vive.
 * AUCUN INSERT/UPDATE/DELETE, aucun localStorage/sessionStorage, aucune transaction réelle.
 * L'accès est accordé dans app.js après contrôle de la RPC Supabase dlfr_cards_lab_access().
 */
(()=>{'use strict';
const SOURCE=[
 ['Cataclysm','Commun','level'],['Bloodbath','Mythique','level'],['The Ultimate Phase','Commun','level'],
 ['Sonic Wave','Épique','level'],['Yatagarasu','Épique','level'],['Erebus','Rare','level'],
 ['Artificial Ascent','Rare','level'],['Digital Descent','Rare','level'],['Bloodlust','Rare','level'],
 ['Crimson Planet','Rare','level'],['Zodiac','Épique','level'],['Tartarus','Épique','level'],
 ['The Golden','Commun','level'],['Kenos','Commun','level'],['Sakupen Hell','Commun','level'],
 ['Cold Sweat','Rare','level'],['Firework','Commun','level'],['Slaughterhouse','Légendaire','level'],
 ['Acheron','Légendaire','level'],['LIMBO','Rare','level'],
 ['Avernus','Épique','level'],['Tidal Wave','Mythique','level'],['Kyouki','Rare','level'],
 ['KOCMOC','Épique','level'],['Silent clubstep','Légendaire','level'],['Shardscapes','Commun','level'],
 ['Cognition','Commun','level'],['Amethyst','Légendaire','level'],['GRIEF','Épique','level'],
 ['Thinking Space II','Épique','level'],['Nullscapes','Rare','level'],['Flamewall','Rare','level'],
 ['Artemis 13','Rare','level'],['ORBIT','Rare','level'],['Society','Commun','level'],
 ['Zoink','Mythique','player'],['wPopoff','Légendaire','player'],['Trick','Épique','player'],
 ['Doggie','Légendaire','player'],['Riot','Légendaire','player'],['Technical','Épique','player'],
 ['Spleen','Rare','player'],['vinceleo','Rare','player'],['yomayoCB','Commun','player'],
 ['niwox_','Commun','player'],
 ['First French Victor','Commun','dlfr'],['Weekly Challenger','Commun','dlfr'],
 ['Beyond the List','Commun','dlfr'],['United Clans','Commun','dlfr'],['DLFR Origins','Rare','dlfr']
];
const CARDS=SOURCE.map(([name,rarity,type],i)=>({id:i+1,name,rarity,type,series:i<20?'Legends':i<35?'Modern':i<45?'Players':'DLFR'}));
const rarities=['Commun','Rare','Épique','Légendaire','Mythique'];
let gate=false, view='album', filter='all', query='', selected=2, flipped=false;
// Mémoire volatile : le rechargement de la page efface entièrement cette collection.
const owned=new Map(),overrides=new Map(),journal=[];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const idString=i=>String(i).padStart(3,'0');
const normalize=s=>String(s||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const rarity=c=>overrides.get(c.id)||c.rarity;
const validUrl=x=>{try{const u=new URL(String(x));return u.protocol==='https:'&&u.username===''&&u.password===''?u.href:'';}catch{return ''}};
const youtubeThumbnail=x=>{try{const u=new URL(x),h=u.hostname.toLowerCase().replace(/^www\./,'');let id='';if(h==='youtu.be')id=u.pathname.split('/')[1]||'';else if(['youtube.com','m.youtube.com'].includes(h))id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.split('/')[2];return /^[\w-]{11}$/.test(id)?`https://i.ytimg.com/vi/${id}/hqdefault.jpg`:'';}catch{return '';}};
function imageFor(card,data){
 if(card.type==='dlfr')return '';
 if(card.type==='level'){
  const match=(data?.demons||[]).find(x=>normalize(x.name)===normalize(card.name)&&x.is_public!==false);
  return match?validUrl(match.thumbnail_url)||youtubeThumbnail(match.verifier_video_url||match.video_url):'';
 }
 const player=(data?.players||[]).find(x=>normalize(x.username||x.display_name)===normalize(card.name));
 const profile=(data?.player_profiles||[]).find(x=>String(x.player_key)===String(player?.player_key));
 return validUrl(profile?.avatar_url)||'';
}
function figure(card,data,compact=false){
 const n=owned.get(card.id)?.count||0;
 const holo=owned.get(card.id)?.holo||false;
 const picture=imageFor(card,data);
 const sym=card.type==='level'?'◆':card.type==='player'?'★':'✦';
 return `<div class="dlfr112-card dlfr112-${normalize(rarity(card)).replace(/[^a-z]/g,'')} ${holo?'dlfr112-holo':''} ${n?'dlfr112-has':'dlfr112-missing'} ${compact?'dlfr112-small':''}">
   <div class="dlfr112-card-top"><span>${card.type==='level'?'LEVEL':card.type==='player'?'PLAYER':'DLFR'} CARD</span><b>#${idString(card.id)}</b></div>
   <div class="dlfr112-art">${picture?`<img loading="lazy" src="${esc(picture)}" alt="Visuel ${esc(card.name)}" onerror="this.remove()">`:`<span aria-hidden="true">${sym}</span>`}</div>
   <div class="dlfr112-card-bottom"><strong title="${esc(card.name)}">${esc(card.name)}</strong><span>${esc(rarity(card))}${holo?' · ✧ HOLO':''}</span></div>
   ${n?`<span class="dlfr112-count">×${n}</span>`:''}
  </div>`;
}
function inventoryUnique(){return [...owned.values()].filter(v=>v.count>0).length;}
function status(){return `${inventoryUnique()} / ${CARDS.length} cartes différentes · ${[...owned.values()].reduce((a,b)=>a+b.count,0)} exemplaires de test`;}
function cardItem(c,data){const yes=(owned.get(c.id)?.count||0)>0;return `<button type="button" class="dlfr112-pick ${selected===c.id?'is-current':''}" data-v112-act="select" data-id="${c.id}" aria-label="Voir ${esc(c.name)}">${figure(c,data,true)}<span class="dlfr112-pick-label">${yes?'Possédée · ':'Manquante · '}${esc(c.series)}</span></button>`;}
function optionCard(c){return `<option value="${c.id}">${idString(c.id)} · ${esc(c.name)}</option>`;}
function viewPage(data){
 if(!gate)return '<section class="paper"><h2>Laboratoire privé</h2><p>Accès refusé.</p></section>';
 const current=CARDS.find(c=>c.id===selected)||CARDS[0];
 const currentCount=owned.get(current.id)?.count||0;
 const found=CARDS.filter(c=>(view!=='collection'||(owned.get(c.id)?.count||0)>0)&&(filter==='all'||filter==='owned'&&(owned.get(c.id)?.count||0)>0||filter==='missing'&&!(owned.get(c.id)?.count)||filter===c.type||filter===c.series)&&normalize(c.name+' '+c.series+' '+rarity(c)).includes(normalize(query)));
 return `<section class="dlfr112" id="dlfr112Lab">
  <div class="dlfr112-header"><div><div class="dlfr112-eyebrow">DLFR CARDS · ORIGINS 001</div><h1>Laboratoire privé</h1><p>50 cartes à tester, zéro modification de ta vraie collection.</p></div><span class="dlfr112-demo-label">MODE TEST · NON SAUVEGARDÉ</span></div>
  <div class="dlfr112-warning"><b>Essais temporaires.</b> Toutes les cartes, modifications, échanges et statistiques de cette page disparaissent dès que tu actualises ou quittes le site. Aucun Waylling n'est débité, aucun achat ni échange réel n'est effectué.</div>
  <div class="dlfr112-toolbar"><div class="dlfr112-summary"><b>${status()}</b><span>Progression de test : ${Math.round(inventoryUnique()/50*100)} %</span><div class="dlfr112-meter"><span style="width:${inventoryUnique()/50*100}%"></span></div></div><div class="dlfr112-modes" role="tablist" aria-label="Espace de test">${[['album','Album'],['collection','Ma collection'],['exchanges','Échanges fictifs'],['control','Pouvoirs admin']].map(([id,title])=>`<button type="button" role="tab" aria-selected="${view===id}" class="${view===id?'active':''}" data-v112-act="mode" data-mode="${id}">${title}</button>`).join('')}</div></div>
  ${view==='album'||view==='collection'?`<div class="dlfr112-album-layout"><div class="dlfr112-gallery-pane"><div class="dlfr112-filters"><label>Affichage<select data-v112-field="filter"><option value="all" ${filter==='all'?'selected':''}>Toutes les cartes</option><option value="owned" ${filter==='owned'?'selected':''}>Possédées</option><option value="missing" ${filter==='missing'?'selected':''}>Manquantes</option><option value="level" ${filter==='level'?'selected':''}>Niveaux</option><option value="player" ${filter==='player'?'selected':''}>Joueurs</option><option value="dlfr" ${filter==='dlfr'?'selected':''}>DLFR</option><option value="Legends" ${filter==='Legends'?'selected':''}>GD Legends</option><option value="Modern" ${filter==='Modern'?'selected':''}>Modern Extremes</option></select></label><label>Rechercher<input type="search" data-v112-field="search" placeholder="Nom ou rareté…" value="${esc(query)}"></label></div><div class="dlfr112-grid">${found.map(c=>cardItem(c,data)).join('')||'<p class="muted">Aucune carte pour ce filtre.</p>'}</div></div><aside class="dlfr112-detail"><div class="dlfr112-detail-inner">${figure(current,data)}<h3>${esc(current.name)}</h3><p>ORIGINS #${idString(current.id)}/050 · ${esc(current.series)}</p><div class="dlfr112-detail-actions"><button type="button" class="btn" data-v112-act="give" data-id="${current.id}">+ Recevoir 1 carte</button><button type="button" class="btn subtle" data-v112-act="take" data-id="${current.id}" ${currentCount?'':'disabled'}>− Retirer 1</button><button type="button" class="btn subtle" data-v112-act="holo" data-id="${current.id}" ${currentCount?'':'disabled'}>✧ ${owned.get(current.id)?.holo?'Désactiver':'Activer'} holo</button></div><small>Ces actions sont réservées au labo ; aucune récompense n'est transférée à ton compte.</small></div></aside></div>`:''}
  ${view==='exchanges'?`<section class="dlfr112-panel"><div class="dlfr112-section-head"><h2>Échanges fictifs</h2><p>Simulation locale avec un partenaire imaginaire. Impossible d'impliquer ou de modifier le compte d'un autre joueur.</p></div><div class="dlfr112-trade"><label>Tu donnes<select id="dlfr112TradeGive">${CARDS.filter(c=>(owned.get(c.id)?.count||0)>0).map(optionCard).join('')||'<option value="">Aucune carte possédée</option>'}</select></label><div class="dlfr112-arrows">⇄</div><label>Tu reçois<select id="dlfr112TradeGet">${CARDS.map(optionCard).join('')}</select></label></div><button class="btn" type="button" data-v112-act="trade" ${inventoryUnique()===0?'disabled':''}>Simuler l'échange</button><p class="muted small">Aucun échange n'est enregistré. Le partenaire est fictif, sans compte Supabase.</p></section>`:''}
  ${view==='control'?`<section class="dlfr112-panel"><div class="dlfr112-section-head"><h2>Console de test · Pouvoirs admin</h2><p>Tu peux tout essayer ici sans influencer le jeu ni tes futurs résultats de collection.</p></div><div class="dlfr112-admin-actions"><button class="btn" type="button" data-v112-act="all">✦ Recevoir les 50 cartes</button><button class="btn subtle" type="button" data-v112-act="holo-all">✧ Tout passer en holographique</button><button class="btn danger" type="button" data-v112-act="reset">Réinitialiser les essais</button></div><div class="dlfr112-admin-edit"><label>Carte à modifier<select id="dlfr112CardPick">${CARDS.map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${idString(c.id)} · ${esc(c.name)}</option>`).join('')}</select></label><label>Rareté fictive<select id="dlfr112Rarity">${rarities.map(r=>`<option value="${esc(r)}" ${r===rarity(current)?'selected':''}>${esc(r)}</option>`).join('')}</select></label><button class="btn subtle" type="button" data-v112-act="rarity">Tester la rareté</button></div></section>`:''}
  ${journal.length?`<section class="dlfr112-panel dlfr112-log"><div class="dlfr112-section-head"><h2>Historique de cette session</h2><span class="muted small">Effacé au rechargement</span></div>${journal.slice(-5).reverse().map(x=>`<p>• ${esc(x)}</p>`).join('')}</section>`:''}
 </section>`;
}
function log(message){journal.push(message);if(journal.length>30)journal.shift();}
function get(id){return CARDS.find(c=>c.id===Number(id));}
function give(id,count=1){const c=get(id);if(!c)return;const x=owned.get(c.id)||{count:0,holo:false};x.count+=count;owned.set(c.id,x);}
function take(id){const x=owned.get(Number(id));if(!x||x.count<=0)return false;x.count--;if(x.count<=0)owned.delete(Number(id));return true;}
function reset(){owned.clear();overrides.clear();journal.length=0;selected=2;query='';filter='all';}
function handleClick(event){
 const b=event.target.closest?.('[data-v112-act]');if(!b||!gate)return;
 if(!document.getElementById('dlfr112Lab'))return;
 event.preventDefault();
 const act=b.dataset.v112Act;
 if(act==='mode'){view=b.dataset.mode;filter='all';query='';}
 else if(act==='select'){selected=Number(b.dataset.id);}
 else if(act==='give'){give(b.dataset.id);log(`+1 ${get(b.dataset.id)?.name}`);}
 else if(act==='take'){if(take(b.dataset.id))log(`−1 ${get(b.dataset.id)?.name}`);}
 else if(act==='holo') {const card=owned.get(Number(b.dataset.id));if(card){card.holo=!card.holo;log(`Holographie modifiée : ${get(b.dataset.id)?.name}`);}}
 else if(act==='all'){for(const c of CARDS)if(!(owned.get(c.id)?.count>0))give(c.id);log('Collection ORIGINS complète ajoutée pour ce test.');}
 else if(act==='holo-all'){for(const v of owned.values())v.holo=true;log('Toutes les cartes possédées passent en holographique.');}
 else if(act==='reset'){if(!confirm('Effacer toute cette collection fictive et tes essais ?'))return;reset();}
 else if(act==='rarity'){const cid=Number(document.getElementById('dlfr112CardPick')?.value),r=document.getElementById('dlfr112Rarity')?.value;if(get(cid)&&rarities.includes(r)){selected=cid;overrides.set(cid,r);log('Rareté fictive modifiée : '+get(cid).name+' → '+r);}}
 else if(act==='trade'){
  const offer=Number(document.getElementById('dlfr112TradeGive')?.value);
  const want=Number(document.getElementById('dlfr112TradeGet')?.value);
  if(!get(offer)||!get(want)||offer===want){alert('Choisis deux cartes différentes.');return;}
  if(!take(offer)){alert('Tu ne possèdes pas cette carte dans le test.');return;}
  give(want);log(`Échange fictif : ${get(offer).name} ⇄ ${get(want).name}`);
 }
 else return;
 // Rendu local indépendant : le moteur DLFR ne sauvegarde jamais cet inventaire.
 const parent=document.getElementById('dlfr112Lab');
 if(parent)parent.outerHTML=viewPage(window.DLFR_CARDS_LAB.__sourceData||{});
}
function handleChange(event){
 if(!gate||!document.getElementById('dlfr112Lab'))return;
 const e=event.target;
 if(e.matches('[data-v112-field="filter"]')){filter=e.value;const h=document.getElementById('dlfr112Lab');if(h)h.outerHTML=viewPage(window.DLFR_CARDS_LAB.__sourceData||{});}
}
function handleInput(event){
 if(!gate||!document.getElementById('dlfr112Lab'))return;
 const e=event.target;if(!e.matches('[data-v112-field="search"]'))return;
 query=e.value;
 // Ne pas refaire le rendu complet à chaque frappe afin de conserver le focus.
 const d=window.DLFR_CARDS_LAB.__sourceData||{};
 const grid=document.querySelector('#dlfr112Lab .dlfr112-grid');if(!grid)return;
 const found=CARDS.filter(c=>(view!=='collection'||(owned.get(c.id)?.count||0)>0)&&(filter==='all'||filter==='owned'&&(owned.get(c.id)?.count||0)>0||filter==='missing'&&!(owned.get(c.id)?.count)||filter===c.type||filter===c.series)&&normalize(c.name+' '+c.series+' '+rarity(c)).includes(normalize(query)));
 grid.innerHTML=found.map(c=>cardItem(c,d)).join('')||'<p class="muted">Aucune carte pour ce filtre.</p>';
}
document.addEventListener('click',handleClick);
document.addEventListener('input',handleInput);
document.addEventListener('change',handleChange);
window.DLFR_CARDS_LAB={
 setGate(value){if(!value){gate=false;reset();view='album';}else gate=true;},
 view(data){if(!gate)return '<p>Accès réservé.</p>';this.__sourceData=data;return viewPage(data);},
 get stats(){return {unique:inventoryUnique(),total:CARDS.length,volatile:true};}
};
})();

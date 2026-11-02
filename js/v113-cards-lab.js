/* DLFR V113 — laboratoire de collection, exclusivement en mémoire vive.
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
// Nouvelles cartes ajoutées par la propriétaire. Aucun stockage implicite.
const customCards=[]; let editCardId=null, creatorImage='', imageError='', clearedImage=false;
const BASE_COUNT=CARDS.length, MAX_CUSTOM=250;

// Mémoire volatile : le rechargement de la page efface entièrement cette collection.
const owned=new Map(),overrides=new Map(),journal=[];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const idString=i=>String(i).padStart(3,'0');
const normalize=s=>String(s||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const rarity=c=>overrides.get(c.id)||c.rarity;
const validUrl=x=>{try{const u=new URL(String(x));return u.protocol==='https:'&&u.username===''&&u.password===''?u.href:'';}catch{return ''}};
const validImage=x=>{const s=String(x||'');if(s.length<=3000000&&/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s))return s;return validUrl(s);};
const safeText=(s,max=100)=>String(s??'').trim().slice(0,max);
const allSeries=()=>[...new Set(['Legends','Modern','Players','DLFR',...customCards.map(c=>c.series)])];
const cleanCard=(x,id)=>{
 if(!x||typeof x!=='object'||Array.isArray(x))return null;
 const name=safeText(x.name,80),series=safeText(x.series,50)||'Custom',description=safeText(x.description,400),
 type=['level','player','dlfr'].includes(x.type)?x.type:'dlfr',rarity=rarities.includes(x.rarity)?x.rarity:'Commun';
 if(!name)return null;
 const image=validImage(x.image||'');
 return {id,name,series,type,rarity,description,image};
};
const youtubeThumbnail=x=>{try{const u=new URL(x),h=u.hostname.toLowerCase().replace(/^www\./,'');let id='';if(h==='youtu.be')id=u.pathname.split('/')[1]||'';else if(['youtube.com','m.youtube.com'].includes(h))id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.split('/')[2];return /^[\w-]{11}$/.test(id)?`https://i.ytimg.com/vi/${id}/hqdefault.jpg`:'';}catch{return '';}};
function imageFor(card,data){
 if(card.image)return validImage(card.image);
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
function editCard(){return customCards.find(c=>c.id===editCardId)||null;}
function previewCard(){const old=editCard();return {id:old?.id||newCardId(),name:old?.name||'Nouvelle carte',rarity:old?.rarity||'Rare',type:old?.type||'level',series:old?.series||'Custom',image:creatorImage||old?.image||''};}
function creatorView(data){
 const cur=editCard(), preview=previewCard();
 return `<section class="dlfr112-panel dlfr113-creator"><div class="dlfr112-section-head"><h2>✦ Atelier de création</h2><p>Ajoute des niveaux, joueurs ou cartes exclusives à ton catalogue. Les cartes apparaîtront immédiatement dans l'album de test.</p></div>
 <div class="dlfr113-create-layout"><div class="dlfr113-create-form">
 <form id="dlfr113CreateForm" autocomplete="off">
 <div class="dlfr113-form-grid">
 <label>Nom de la carte <span class="dlfr113-required">*</span><input id="dlfr113Name" name="cardName" maxlength="80" required value="${esc(cur?.name||'')}" placeholder="Ex. : Oblivion"></label>
 <label>Catégorie<select id="dlfr113Type" name="cardType">${[['level','Niveau'],['player','Joueur'],['dlfr','DLFR / Spéciale']].map(([k,v])=>`<option value="${k}" ${cur?.type===k?'selected':''}>${v}</option>`).join('')}</select></label>
 <label>Rareté<select id="dlfr113Rarity" name="cardRarity">${rarities.map(r=>`<option value="${esc(r)}" ${(cur?.rarity||'Rare')===r?'selected':''}>${esc(r)}</option>`).join('')}</select></label>
 <label>Collection / série<input id="dlfr113Series" name="cardSeries" maxlength="50" value="${esc(cur?.series||'Custom')}" placeholder="Ex. : French Legends"></label>
 <label class="dlfr113-wide">Description (au dos de la carte)<textarea id="dlfr113Description" name="cardDescription" maxlength="400" rows="3" placeholder="Quelques mots sur ce niveau ou ce joueur…">${esc(cur?.description||'')}</textarea></label>
 <label class="dlfr113-wide">URL d'image HTTPS (optionnel)<input type="url" id="dlfr113ImageUrl" name="cardImageUrl" placeholder="https://…/image.png" value="${esc((cur?.image||'').startsWith('data:')?'':cur?.image||'')}"></label>
 <label class="dlfr113-wide">Ou importer une image depuis ton PC <span class="dlfr113-hint">(PNG, JPEG, WebP, GIF · 2 Mo max)</span><input type="file" id="dlfr113ImageFile" accept="image/png,image/jpeg,image/webp,image/gif"></label>
 </div>
 <div class="dlfr113-create-buttons"><button type="submit" class="btn">${cur?'Enregistrer les modifications':'Créer la carte'}</button>${cur?'<button type="button" class="btn subtle" data-v112-act="new-card">Nouvelle carte</button><button type="button" class="btn danger" data-v112-act="delete-card">Supprimer cette carte</button>':''}<button type="button" class="btn subtle" data-v112-act="clear-image">Retirer l'image</button></div>
 </form><p class="dlfr113-inline-status" id="dlfr113FormStatus" role="status">${imageError?esc(imageError):'Aucune modification ne sera sauvegardée automatiquement.'}</p></div>
 <aside class="dlfr113-preview"><span class="dlfr113-caption">APERÇU EN DIRECT</span><div id="dlfr113CardPreview">${figure(preview,data)}</div><p class="dlfr113-hint">${cur?'Carte personnalisée #'+idString(cur.id):'Nouvelle carte · numéro attribué automatiquement'}</p></aside></div>
 <div class="dlfr113-library"><div class="dlfr112-section-head"><h3>Mes créations de cette session <span class="dlfr113-counter">${customCards.length}/${MAX_CUSTOM}</span></h3><p>Cliquer sur une carte pour la modifier. Exporter pour conserver tes créations sans utiliser Supabase.</p></div>
 <div class="dlfr113-create-buttons"><button type="button" class="btn subtle" data-v112-act="export-cards" ${customCards.length?'':'disabled'}>↓ Exporter mes cartes (JSON)</button><button type="button" class="btn subtle" data-v112-act="open-import">↑ Importer un catalogue (JSON)</button><input type="file" id="dlfr113ImportFile" accept="application/json,.json" hidden></div>
 <div class="dlfr113-owned-grid">${customCards.map(c=>`<button type="button" class="dlfr112-pick ${cur?.id===c.id?'is-current':''}" data-v112-act="edit-card" data-id="${c.id}" aria-label="Modifier ${esc(c.name)}">${figure(c,data,true)}<span class="dlfr112-pick-label">Modifier #${idString(c.id)}</span></button>`).join('')||'<p class="muted">Pas encore de carte personnalisée. Crée la première ci-dessus !</p>'}</div></div>
 </section>`;
}
function createDraft(){
 const name=safeText(document.getElementById('dlfr113Name')?.value,80), type=document.getElementById('dlfr113Type')?.value,
 rarity=document.getElementById('dlfr113Rarity')?.value, series=safeText(document.getElementById('dlfr113Series')?.value,50)||'Custom',
 description=safeText(document.getElementById('dlfr113Description')?.value,400),url=safeText(document.getElementById('dlfr113ImageUrl')?.value,2048);
 const existing=editCard();
 const image=creatorImage||(url?validUrl(url):(clearedImage?'':existing?.image||''));
 return {name,type,rarity,series,description,image};
}
function refreshPreview(){
 const el=document.getElementById('dlfr113CardPreview');if(!el)return;
 const d=createDraft(), old=editCard(),card=cleanCard({...d,name:d.name||'Nouvelle carte'},old?.id||newCardId());
 if(card)el.innerHTML=figure(card,window.DLFR_CARDS_LAB.__sourceData||{});
}
function newCardId(){let i=1001;for(const c of CARDS)if(c.id>=i)i=c.id+1;return i;}
function saveCustom(){
 const d=createDraft(); if(!d.name){alert('Indique un nom pour la carte.');return false;}
 if(!['level','player','dlfr'].includes(d.type)||!rarities.includes(d.rarity)){alert('Sélectionne une catégorie et une rareté.');return false;}
 const typedUrl=safeText(document.getElementById('dlfr113ImageUrl')?.value,2048);
 if(typedUrl&&!validUrl(typedUrl)&&!creatorImage){alert('L’URL de l’image doit commencer par https://.');return false;}
 const old=editCard();if(!old&&customCards.length>=MAX_CUSTOM){alert(`Limite du laboratoire : ${MAX_CUSTOM} cartes personnalisées.`);return false;}
 const id=old?.id||newCardId(), card=cleanCard(d,id);if(!card)return false;
 if(old){const i=customCards.findIndex(x=>x.id===id);customCards[i]=card;const j=CARDS.findIndex(x=>x.id===id);CARDS[j]=card;log(`Carte modifiée : ${card.name}`);}
 else {customCards.push(card);CARDS.push(card);log(`Carte créée : ${card.name}`);}
 selected=id;editCardId=id;creatorImage='';imageError='';clearedImage=false;return true;
}
function deleteCustom(){const c=editCard();if(!c)return;if(!confirm(`Supprimer « ${c.name} » de ce catalogue temporaire ?`))return;
 const i=customCards.findIndex(x=>x.id===c.id),j=CARDS.findIndex(x=>x.id===c.id);
 if(i>=0)customCards.splice(i,1);if(j>=0)CARDS.splice(j,1);owned.delete(c.id);overrides.delete(c.id);
 log(`Carte supprimée : ${c.name}`);editCardId=null;creatorImage='';clearedImage=false;selected=CARDS[0].id;
}
function exportCards(){if(!customCards.length)return;
 const blob=new Blob([JSON.stringify({format:'dlfr-cards-lab',version:1,exportedAt:new Date().toISOString(),cards:customCards.map(c=>({name:c.name,type:c.type,rarity:c.rarity,series:c.series,description:c.description||'',image:c.image||''}))},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='DLFR_Cards_mes_creations.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
 log(`Export JSON de ${customCards.length} cartes.`);
}
async function importCards(file){
 if(!file||file.size>20000000){alert('Catalogue JSON trop volumineux (20 Mo maximum).');return;}
 try{
  const json=JSON.parse(await file.text());if(json?.format!=='dlfr-cards-lab'||json?.version!==1||!Array.isArray(json.cards)||json.cards.length>MAX_CUSTOM)throw new Error('Format ou quantité de cartes incompatible.');
  const items=[];for(const row of json.cards){const card=cleanCard(row,1001+items.length);if(!card)throw new Error('Une carte du fichier est invalide.');items.push(card);}
  if(!confirm(`Importer ${items.length} cartes ? Cela remplacera les ${customCards.length} cartes personnalisées de cette session, mais pas les 50 cartes ORIGINS.`))return;
  for(const c of customCards){const i=CARDS.findIndex(x=>x.id===c.id);if(i>=0)CARDS.splice(i,1);owned.delete(c.id);overrides.delete(c.id);}
  customCards.length=0;for(const c of items){customCards.push(c);CARDS.push(c);}
  editCardId=null;creatorImage='';clearedImage=false;selected=CARDS[0].id;log(`${items.length} cartes importées depuis le fichier JSON.`);repaint();
 }catch(error){alert('Impossible d’importer ce catalogue : '+error.message);}
}
function repaint(){const p=document.getElementById('dlfr112Lab');if(p)p.outerHTML=viewPage(window.DLFR_CARDS_LAB.__sourceData||{});}
function viewPage(data){
 if(!gate)return '<section class="paper"><h2>Laboratoire privé</h2><p>Accès refusé.</p></section>';
 const current=CARDS.find(c=>c.id===selected)||CARDS[0];
 const currentCount=owned.get(current.id)?.count||0;
 const found=CARDS.filter(c=>(view!=='collection'||(owned.get(c.id)?.count||0)>0)&&(filter==='all'||filter==='owned'&&(owned.get(c.id)?.count||0)>0||filter==='missing'&&!(owned.get(c.id)?.count)||filter===c.type||filter===c.series||filter==='Custom'&&c.id>BASE_COUNT)&&normalize(c.name+' '+c.series+' '+rarity(c)).includes(normalize(query)));
 return `<section class="dlfr112" id="dlfr112Lab">
  <div class="dlfr112-header"><div><div class="dlfr112-eyebrow">DLFR CARDS · ORIGINS 001</div><h1>Atelier DLFR Cards</h1><p>${CARDS.length} cartes à tester, dont ${customCards.length} créées ici. Zéro modification de ta vraie collection.</p></div><span class="dlfr112-demo-label">MODE TEST · NON SAUVEGARDÉ</span></div>
  <div class="dlfr112-warning"><b>Essais temporaires.</b> Toutes les cartes créées, les modifications, échanges et statistiques disparaissent au rechargement. Utilise « Exporter mes cartes » pour conserver tes créations dans un fichier JSON. Aucun Waylling n'est débité, aucun achat ni échange réel n'est effectué.</div>
  <div class="dlfr112-toolbar"><div class="dlfr112-summary"><b>${status()}</b><span>Progression de test : ${Math.round(inventoryUnique()/CARDS.length*100)} %</span><div class="dlfr112-meter"><span style="width:${inventoryUnique()/CARDS.length*100}%"></span></div></div><div class="dlfr112-modes" role="tablist" aria-label="Espace de test">${[['album','Album'],['collection','Ma collection'],['creator','✦ Créer des cartes'],['exchanges','Échanges fictifs'],['control','Pouvoirs admin']].map(([id,title])=>`<button type="button" role="tab" aria-selected="${view===id}" class="${view===id?'active':''}" data-v112-act="mode" data-mode="${id}">${title}</button>`).join('')}</div></div>
  ${view==='album'||view==='collection'?`<div class="dlfr112-album-layout"><div class="dlfr112-gallery-pane"><div class="dlfr112-filters"><label>Affichage<select data-v112-field="filter"><option value="all" ${filter==='all'?'selected':''}>Toutes les cartes</option><option value="owned" ${filter==='owned'?'selected':''}>Possédées</option><option value="missing" ${filter==='missing'?'selected':''}>Manquantes</option><option value="level" ${filter==='level'?'selected':''}>Niveaux</option><option value="player" ${filter==='player'?'selected':''}>Joueurs</option><option value="dlfr" ${filter==='dlfr'?'selected':''}>DLFR</option><option value="Legends" ${filter==='Legends'?'selected':''}>GD Legends</option><option value="Modern" ${filter==='Modern'?'selected':''}>Modern Extremes</option>${customCards.length?`<option value="Custom" ${filter==='Custom'?'selected':''}>Mes créations</option>`:''}</select></label><label>Rechercher<input type="search" data-v112-field="search" placeholder="Nom ou rareté…" value="${esc(query)}"></label></div><div class="dlfr112-grid">${found.map(c=>cardItem(c,data)).join('')||'<p class="muted">Aucune carte pour ce filtre.</p>'}</div></div><aside class="dlfr112-detail"><div class="dlfr112-detail-inner">${figure(current,data)}<h3>${esc(current.name)}</h3><p>${current.id>BASE_COUNT?'CUSTOM':'ORIGINS'} #${idString(current.id)} · ${esc(current.series)}</p>${current.description?`<p class="dlfr113-description">${esc(current.description)}</p>`:''}<div class="dlfr112-detail-actions"><button type="button" class="btn" data-v112-act="give" data-id="${current.id}">+ Recevoir 1 carte</button><button type="button" class="btn subtle" data-v112-act="take" data-id="${current.id}" ${currentCount?'':'disabled'}>− Retirer 1</button><button type="button" class="btn subtle" data-v112-act="holo" data-id="${current.id}" ${currentCount?'':'disabled'}>✧ ${owned.get(current.id)?.holo?'Désactiver':'Activer'} holo</button></div>${current.id>BASE_COUNT?`<button type="button" class="btn subtle" data-v112-act="edit-selected" data-id="${current.id}">✎ Modifier cette carte</button>`:''}<small>Ces actions sont réservées au labo ; aucune récompense n'est transférée à ton compte.</small></div></aside></div>`:''}
  ${view==='creator'?creatorView(data):''}
  ${view==='exchanges'?`<section class="dlfr112-panel"><div class="dlfr112-section-head"><h2>Échanges fictifs</h2><p>Simulation locale avec un partenaire imaginaire. Impossible d'impliquer ou de modifier le compte d'un autre joueur.</p></div><div class="dlfr112-trade"><label>Tu donnes<select id="dlfr112TradeGive">${CARDS.filter(c=>(owned.get(c.id)?.count||0)>0).map(optionCard).join('')||'<option value="">Aucune carte possédée</option>'}</select></label><div class="dlfr112-arrows">⇄</div><label>Tu reçois<select id="dlfr112TradeGet">${CARDS.map(optionCard).join('')}</select></label></div><button class="btn" type="button" data-v112-act="trade" ${inventoryUnique()===0?'disabled':''}>Simuler l'échange</button><p class="muted small">Aucun échange n'est enregistré. Le partenaire est fictif, sans compte Supabase.</p></section>`:''}
  ${view==='control'?`<section class="dlfr112-panel"><div class="dlfr112-section-head"><h2>Console de test · Pouvoirs admin</h2><p>Tu peux tout essayer ici sans influencer le jeu ni tes futurs résultats de collection.</p></div><div class="dlfr112-admin-actions"><button class="btn" type="button" data-v112-act="all">✦ Recevoir les 50 cartes</button><button class="btn subtle" type="button" data-v112-act="holo-all">✧ Tout passer en holographique</button><button class="btn danger" type="button" data-v112-act="reset">Tout réinitialiser (y compris créations)</button></div><div class="dlfr112-admin-edit"><label>Carte à modifier<select id="dlfr112CardPick">${CARDS.map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${idString(c.id)} · ${esc(c.name)}</option>`).join('')}</select></label><label>Rareté fictive<select id="dlfr112Rarity">${rarities.map(r=>`<option value="${esc(r)}" ${r===rarity(current)?'selected':''}>${esc(r)}</option>`).join('')}</select></label><button class="btn subtle" type="button" data-v112-act="rarity">Tester la rareté</button></div></section>`:''}
  ${journal.length?`<section class="dlfr112-panel dlfr112-log"><div class="dlfr112-section-head"><h2>Historique de cette session</h2><span class="muted small">Effacé au rechargement</span></div>${journal.slice(-5).reverse().map(x=>`<p>• ${esc(x)}</p>`).join('')}</section>`:''}
 </section>`;
}
function log(message){journal.push(message);if(journal.length>30)journal.shift();}
function get(id){return CARDS.find(c=>c.id===Number(id));}
function give(id,count=1){const c=get(id);if(!c)return;const x=owned.get(c.id)||{count:0,holo:false};x.count+=count;owned.set(c.id,x);}
function take(id){const x=owned.get(Number(id));if(!x||x.count<=0)return false;x.count--;if(x.count<=0)owned.delete(Number(id));return true;}
function reset(){owned.clear();overrides.clear();journal.length=0;selected=2;query='';filter='all';customCards.length=0;CARDS.splice(BASE_COUNT);editCardId=null;creatorImage='';imageError='';clearedImage=false;}
function handleClick(event){
 const b=event.target.closest?.('[data-v112-act]');if(!b||!gate)return;
 if(!document.getElementById('dlfr112Lab'))return;
 event.preventDefault();
 const act=b.dataset.v112Act;
 if(act==='mode'){view=b.dataset.mode;filter='all';query='';}
 else if(act==='select'){selected=Number(b.dataset.id);}
 else if(act==='edit-selected'||act==='edit-card'){const c=get(b.dataset.id);if(!c||c.id<=BASE_COUNT)return;editCardId=c.id;selected=c.id;creatorImage='';imageError='';clearedImage=false;view='creator';}
 else if(act==='new-card'){editCardId=null;creatorImage='';imageError='';clearedImage=false;}
 else if(act==='delete-card'){deleteCustom();}
 else if(act==='clear-image'){creatorImage='';clearedImage=true;const u=document.getElementById('dlfr113ImageUrl');if(u)u.value='';imageError='';refreshPreview();return;}
 else if(act==='export-cards'){exportCards();return;}
 else if(act==='open-import'){document.getElementById('dlfr113ImportFile')?.click();return;}
 else if(act==='give'){give(b.dataset.id);log(`+1 ${get(b.dataset.id)?.name}`);}
 else if(act==='take'){if(take(b.dataset.id))log(`−1 ${get(b.dataset.id)?.name}`);}
 else if(act==='holo') {const card=owned.get(Number(b.dataset.id));if(card){card.holo=!card.holo;log(`Holographie modifiée : ${get(b.dataset.id)?.name}`);}}
 else if(act==='all'){for(const c of CARDS)if(!(owned.get(c.id)?.count>0))give(c.id);log('Collection ORIGINS complète ajoutée pour ce test.');}
 else if(act==='holo-all'){for(const v of owned.values())v.holo=true;log('Toutes les cartes possédées passent en holographique.');}
 else if(act==='reset'){if(!confirm('Tout réinitialiser, y compris les cartes personnalisées non exportées ?'))return;reset();}
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
 repaint();
}
function handleChange(event){
 if(!gate||!document.getElementById('dlfr112Lab'))return;
 const e=event.target;
 if(e.matches('[data-v112-field="filter"]')){filter=e.value;const h=document.getElementById('dlfr112Lab');if(h)h.outerHTML=viewPage(window.DLFR_CARDS_LAB.__sourceData||{});}
}
function handleInput(event){
 if(gate&&document.getElementById('dlfr112Lab')&&['dlfr113Name','dlfr113Type','dlfr113Rarity','dlfr113Series','dlfr113Description','dlfr113ImageUrl'].includes(event.target.id)){if(event.target.id==='dlfr113ImageUrl'&&event.target.value){creatorImage='';clearedImage=false;}refreshPreview();return;}
 if(!gate||!document.getElementById('dlfr112Lab'))return;
 const e=event.target;if(!e.matches('[data-v112-field="search"]'))return;
 query=e.value;
 // Ne pas refaire le rendu complet à chaque frappe afin de conserver le focus.
 const d=window.DLFR_CARDS_LAB.__sourceData||{};
 const grid=document.querySelector('#dlfr112Lab .dlfr112-grid');if(!grid)return;
 const found=CARDS.filter(c=>(view!=='collection'||(owned.get(c.id)?.count||0)>0)&&(filter==='all'||filter==='owned'&&(owned.get(c.id)?.count||0)>0||filter==='missing'&&!(owned.get(c.id)?.count)||filter===c.type||filter===c.series||filter==='Custom'&&c.id>BASE_COUNT)&&normalize(c.name+' '+c.series+' '+rarity(c)).includes(normalize(query)));
 grid.innerHTML=found.map(c=>cardItem(c,d)).join('')||'<p class="muted">Aucune carte pour ce filtre.</p>';
}
document.addEventListener('submit',event=>{
 if(!gate||event.target.id!=='dlfr113CreateForm'||!document.getElementById('dlfr112Lab'))return;
 event.preventDefault();if(saveCustom()){repaint();const status=document.getElementById('dlfr113FormStatus');if(status)status.textContent='Carte enregistrée dans cette session ! Pense à exporter ton catalogue.';}
});
document.addEventListener('change',async event=>{
 if(!gate||!document.getElementById('dlfr112Lab'))return;
 const el=event.target;
 if(el.id==='dlfr113ImportFile'){const file=el.files?.[0];if(file)await importCards(file);return;}
 if(el.id==='dlfr113ImageFile'){
  const file=el.files?.[0];if(!file)return;
  if(file.size>2000000||!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)){imageError='Image refusée : PNG/JPG/WebP/GIF, 2 Mo maximum.';alert(imageError);el.value='';return;}
  try{const reader=new FileReader();reader.onload=()=>{creatorImage=validImage(reader.result);clearedImage=false;if(!creatorImage){alert('Image invalide.');return;}const field=document.getElementById('dlfr113ImageUrl');if(field)field.value='';refreshPreview();};reader.readAsDataURL(file);}catch(error){alert('Impossible de lire ce fichier image.');}
 }
});
document.addEventListener('click',handleClick);
document.addEventListener('input',handleInput);
document.addEventListener('change',handleChange);
window.DLFR_CARDS_LAB={
 setGate(value){if(!value){gate=false;reset();view='album';}else gate=true;},
 view(data){if(!gate)return '<p>Accès réservé.</p>';this.__sourceData=data;return viewPage(data);},
 get stats(){return {unique:inventoryUnique(),total:CARDS.length,volatile:true};}
};
})();

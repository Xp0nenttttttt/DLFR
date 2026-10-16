/* DLFR 2.3 — Fiches cinématiques : affichage public, aucune écriture Supabase. */
(function(root){
'use strict';
const text=v=>String(v??'').trim();
const normalized=v=>text(v).toLocaleLowerCase('fr');
function safeUrl(value){
 try {const u=new URL(text(value));return (['https:','http:'].includes(u.protocol)&&u.hostname&&!u.username&&!u.password)?u.href:'';}catch{return '';}
}
function youtubeId(value){
 const link=safeUrl(value);if(!link)return '';
 const u=new URL(link),h=u.hostname.toLowerCase().replace(/^www\./,''),segments=u.pathname.split('/').filter(Boolean);
 let id='';
 if(h==='youtu.be')id=segments[0]||'';
 else if(['youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com'].includes(h)){
  if(u.pathname==='/watch')id=u.searchParams.get('v')||'';
  else if(['shorts','live','embed'].includes(segments[0]))id=segments[1]||'';
 }
 return /^[a-zA-Z0-9_-]{11}$/.test(id)?id:'';
}
function thumbFromVideo(link){const id=youtubeId(link);return id?'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg':'';}
function artwork(d,allowAsset){
 const value=text(d.thumbnail_url);
 return (safeUrl(value)||(allowAsset&&/^assets\/[a-zA-Z0-9_./-]+$/.test(value)&&!value.includes('..')?value:''))||thumbFromVideo(d.video_url)||thumbFromVideo(d.verifier_video_url)||thumbFromVideo(d.first_fr_video_url)||'';
}
function embedHtml(link,escape){
 const url=safeUrl(link);if(!url)return '';
 const id=youtubeId(url);
 if(id)return `<iframe title="Lecteur vidéo du niveau" loading="lazy" src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
 if(/\.(mp4|webm)$/i.test(new URL(url).pathname))return `<video src="${escape(url)}" controls autoplay playsinline preload="metadata"></video>`;
 return '';
}
function dated(value){const valueText=text(value);if(!/^\d{4}-\d{2}-\d{2}/.test(valueText))return null;const dt=new Date(valueText);return Number.isFinite(dt.getTime())?dt:null;}
function timeline(level,history=[],records=[]){
 const lines=[];
 const add=(value,label,description,type)=>{const d=dated(value);if(d)lines.push({timestamp:d.getTime(),iso:d.toISOString(),label,description,type});};
 add(level.first_fr_achieved_at,'Premier record français daté retrouvé',text(level.first_fr_player)||'Joueur non renseigné','first');
 add(level.first_frbe_achieved_at,'Premier record FR/BE daté retrouvé',text(level.first_frbe_player)||'Joueur non renseigné','first');
 add(level.legacy_since,'Passage en Legacy','Date enregistrée pour ce statut','status');
 for(const row of history.filter(r=>String(r.demon_id)===String(level.id))){
  const old=Number(row.old_position),next=Number(row.new_position);
  const label=Number.isFinite(old)&&Number.isFinite(next)?`Classement #${old} → #${next}`:'Modification de classement';
  add(row.created_at,label,text(row.note)||'Modification enregistrée dans la DLFR','ranking');
 }
 add(level.created_at,'Fiche enregistrée dans la base','Date de création de la fiche, pas forcément celle du niveau','metadata');
 // Les complétions historiques ne contiennent pas leur date de victoire :
 // seules les dates d'enregistrement sont connues.
 const seen=new Set();
 for(const row of [...records].filter(r=>Number(r.progress)===100&&dated(r.created_at)).sort((a,b)=>dated(a.created_at)-dated(b.created_at))){
  const name=normalized(row.player);if(!name||seen.has(name))continue;
  seen.add(name);
  add(row.created_at,'Complétion 100 % enregistrée',text(row.player)+' · date d’enregistrement (pas forcément de victoire)','record');
  if(seen.size>=5)break;
 }
 // Les premiers records datés et les premiers enregistrements restent visibles
 // même lorsque le niveau a connu beaucoup de changements de classement.
 const first=lines.filter(r=>['first','record'].includes(r.type)).sort((a,b)=>a.timestamp-b.timestamp).slice(0,7);
 const other=lines.filter(r=>!['first','record'].includes(r.type)).sort((a,b)=>a.timestamp-b.timestamp).slice(-8);
 return [...first,...other].sort((a,b)=>a.timestamp-b.timestamp);
}
function bestFrench(records,players){
 const byName=new Map();
 for(const p of players||[]){
  if(p?.hidden_from_stats||text(p?.country_code).toUpperCase()!=='FR')continue;
  for(const value of [p.player_key,p.username,p.display_name])if(text(value))byName.set(normalized(value),p);
 }
 const result=new Map();
 for(const r of records||[]){
  if(Number(r.progress)!==100)continue;
  const p=byName.get(normalized(r.player));if(!p)continue;
  result.set(p.player_key,p);
 }
 return [...result.values()].sort((a,b)=>Number(b.score||0)-Number(a.score||0)||text(a.display_name||a.username).localeCompare(text(b.display_name||b.username),'fr')).slice(0,6);
}
function render(level,context={}){
 const e=context.escape||((v)=>String(v??''));
 const link=context.link||((page,props)=>'?page='+encodeURIComponent(page)+'&player='+encodeURIComponent(props.player));
 const money=context.format||String;
 const calendar=context.formatDate||(v=>String(v).slice(0,10));
 const records=Array.isArray(context.records)?context.records:[];
 const players=Array.isArray(context.players)?context.players:[];
 const main=artwork(level,true),video=safeUrl(level.video_url)||safeUrl(level.verifier_video_url);
 const fallback=thumbFromVideo(level.video_url)||thumbFromVideo(level.verifier_video_url)||'';
 const hasEmbed=!!embedHtml(video,e);
 const status=context.status||'Classement principal';
 const points=context.points||'';
 const history=timeline(level,context.history||[],records);
 const winners=bestFrench(records,players);
 const getPlayer=name=>players.find(p=>!p.hidden_from_stats&&[p.player_key,p.username,p.display_name].some(v=>normalized(v)===normalized(name)));
 const recordLink=name=>{const p=getPlayer(name);return p?`<a class="link" data-nav href="${e(link('stats',{player:p.player_key}))}">${e(name)}</a>`:e(name);};
 const sorted=[...records].sort((a,b)=>Number(b.progress)-Number(a.progress)||Date.parse(a.created_at||0)-Date.parse(b.created_at||0));
 const dateTag=r=>dated(r.created_at)?`<span class="dlfr23-record-date">Enregistré le ${e(calendar(r.created_at))}</span>`:'';
 const winnerCards=winners.map((p,i)=>`<a class="dlfr23-player" data-nav href="${e(link('stats',{player:p.player_key}))}"><span class="dlfr23-player-spot">${i+1}</span><span class="dlfr23-player-name">${e(p.display_name||p.username||p.player_key)}</span><span class="dlfr23-player-points">${e(money(p.score||0))} pts DLFR</span></a>`).join('');
 const events=history.map(ev=>`<li class="dlfr23-event ${ev.type==='first'?'dlfr23-event-first':''}"><time datetime="${e(ev.iso)}">${e(calendar(ev.iso))}</time><div><strong>${e(ev.label)}</strong><span>${e(ev.description)}</span></div></li>`).join('');
 const list=sorted.map(r=>`<div class="dlfr23-record"><div><strong>${recordLink(r.player||'Inconnu')}</strong><span class="dlfr23-record-percent">${e(r.progress)} %</span>${dateTag(r)}</div>${safeUrl(r.video_url)?`<a class="link" href="${e(safeUrl(r.video_url))}" target="_blank" rel="noopener noreferrer">Preuve ↗</a>`:''}</div>`).join('');
 const art=main?`<img class="dlfr23-hero-image dlfr23-artwork" data-dlfr23-fallback="${e(fallback)}" src="${e(main)}" alt="" loading="eager">`:'';
 const centerpiece=main?`<img class="dlfr23-media-thumb dlfr23-artwork" data-dlfr23-fallback="${e(fallback)}" src="${e(main)}" alt="Miniature de ${e(level.name)}" loading="lazy">`:`<div class="dlfr23-media-placeholder">${e(level.name)}</div>`;
 const mainVideo=video?`<div class="dlfr23-player-frame" id="dlfr23Player">${centerpiece}${hasEmbed?`<button type="button" class="dlfr23-play" data-dlfr23-play="${e(video)}" aria-label="Lancer la vidéo du niveau">▶ <span>Lancer la vidéo</span></button>`:''}</div><div class="dlfr23-media-links"><a class="btn subtle" href="${e(video)}" target="_blank" rel="noopener noreferrer">Ouvrir la vidéo ↗</a>${safeUrl(level.verifier_video_url)&&safeUrl(level.verifier_video_url)!==video?`<a class="link" href="${e(safeUrl(level.verifier_video_url))}" target="_blank" rel="noopener noreferrer">Vidéo de vérification ↗</a>`:''}</div>`:`<div class="dlfr23-player-frame">${centerpiece}</div><p class="muted small">Aucune vidéo du niveau renseignée pour le moment.</p>`;
 return `<section class="paper dlfr23-level">
 <div class="dlfr23-hero">${art}<div class="dlfr23-hero-overlay"></div><div class="dlfr23-hero-content"><a class="dlfr23-back" href="${e(link('list',{tab:context.listTab||'main'}))}" data-nav>← Retour au classement</a><div class="dlfr23-hero-tags"><span>${e(status)}</span>${level.unrated?'<span>UNRATED</span>':''}${level.legacy?'<span>Legacy</span>':''}</div><p class="dlfr23-eyebrow">DEMONLIST FRANCOPHONE · NIVEAU</p><h1>${e(level.name)}</h1><p class="dlfr23-subtitle">${e(level.difficulty||'Extreme Demon')} <span aria-hidden="true">·</span> <strong>${e(points)}</strong></p></div></div>
 <div class="dlfr23-content"><div class="dlfr23-facts"><div><span>Création</span><strong>${e(level.creator||'À renseigner')}${level.creator_more?`, ${e(level.creator_more)}`:''}</strong></div><div><span>Publication</span><strong>${e(level.publisher==='AREDL'?'À renseigner':level.publisher||'À renseigner')}</strong></div><div><span>Vérification</span><strong>${e(level.verifier||'À renseigner')}</strong></div><div><span>ID Geometry Dash</span><strong>${e(level.level_id||'—')}</strong></div><div><span>Progression requise</span><strong>${e(level.requirement||100)} %</strong></div><div><span>Records publics</span><strong>${records.length}</strong></div></div>
 ${level.description?`<p class="dlfr23-description">${e(level.description)}</p>`:''}
 <div class="dlfr23-sections"><section class="dlfr23-main-media"><div class="dlfr23-section-head"><p class="kicker">MÉDIAS</p><h2>Découvrir le niveau</h2></div>${mainVideo}</section><aside class="dlfr23-french"><div class="dlfr23-section-head"><p class="kicker">COMMUNAUTÉ</p><h2>Joueurs français</h2></div>${winners.length?`<p class="small muted">Joueurs ayant une complétion à 100 %, classés par points DLFR globaux (et non par date de victoire).</p><div class="dlfr23-player-list">${winnerCards}</div>`:'<p class="muted">Aucune complétion française associée à un profil renseigné pour ce niveau.</p>'}</aside></div>
 <div class="dlfr23-lower"><section class="dlfr23-history"><div class="dlfr23-section-head"><p class="kicker">ARCHIVES DLFR</p><h2>Chronologie</h2></div>${events?`<ol class="dlfr23-timeline">${events}</ol>`:'<p class="muted">Aucune date historique exploitable pour ce niveau.</p>'}<p class="small muted">Les dates d'enregistrement ou de classement ne sont pas nécessairement les dates de complétion. Les premières performances françaises ne sont indiquées que si elles sont datées dans la base.</p></section><section class="dlfr23-records"><div class="dlfr23-section-head"><p class="kicker">COMPLÉTIONS</p><h2>Records enregistrés (${records.length})</h2></div><div class="dlfr23-record-list">${list||'<p class="muted">Aucun record enregistré.</p>'}</div></section></div>
 ${context.proofHtml||''}
 </div></section>`;
}
const api=Object.freeze({safeUrl,youtubeId,thumbFromVideo,artwork,embedHtml,dated,timeline,bestFrench,render});
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.DLFR_LEVEL_CINEMA=api;
})(typeof window!=='undefined'?window:undefined);

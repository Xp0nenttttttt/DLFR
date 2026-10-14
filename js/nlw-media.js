/* DLFR 2.9.4 : médias AREDL approuvés uniquement, lecture seule. */
(function(root){
  'use strict';
  const approved = new Map();
  function asObj(v){return v && typeof v==='object' && !Array.isArray(v)?v:{};}
  function safeUrl(value){
    if(typeof value!=='string' || value.length>2048)return '';
    try{const u=new URL(value);return (['https:','http:'].includes(u.protocol)&&u.hostname&&!u.username&&!u.password) ? u.href : '';}
    catch{return '';}
  }
  function youtubeId(value){
    const url=safeUrl(value);if(!url)return '';
    const u=new URL(url),host=u.hostname.toLowerCase().replace(/^www\./,''),parts=u.pathname.split('/').filter(Boolean);
    let id='';
    if(host==='youtu.be')id=parts[0]||'';
    else if(['youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com'].includes(host)){
      if(u.pathname==='/watch')id=u.searchParams.get('v')||'';
      else if(['shorts','live','embed'].includes(parts[0]))id=parts[1]||'';
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id)?id:'';
  }
  function thumbnail(value){const id=youtubeId(value);return id?`https://i.ytimg.com/vi/${id}/hqdefault.jpg`:'';}
  function setApproved(data){
    let count=0;
    const rows=Array.isArray(data)?data:asObj(data).levels;
    if(!Array.isArray(rows))return 0;
    for(const row of rows){
      if(!row || row.approved!==true || !/^[1-9]\d*$/.test(String(row.gd_level_id||'')) || row.records_complete!==true)continue;
      approved.set(String(row.gd_level_id),row);count++;
    }
    return count;
  }
  async function loadApproved(path){
    // Facultatif : par défaut le fichier n'existe pas, aucune donnée AREDL n'est publiée.
    if(typeof fetch!=='function')return false;
    try{const response=await fetch(path,{cache:'no-store'});if(!response.ok)return false;
      return setApproved(await response.json())>0;
    }catch{return false;}
  }
  function card(title,entry,esc){
    const info=asObj(entry), player=asObj(info.player), link=safeUrl(info.video_url);
    const thumb=link?thumbnail(link):'',name=String(player.name||'Nom non renseigné');
    const when=info.completed_at||info.achieved_at||'';
    const date=typeof when==='string' && /^\d{4}-\d\d-\d\d/.test(when)?when.slice(0,10):'';
    return `<article class="nlw-proof-card">${link
      ? `<a class="nlw-proof-picture" href="${esc(link)}" target="_blank" rel="noopener noreferrer" aria-label="Voir la preuve vidéo ${esc(title)}">${thumb?`<img loading="lazy" src="${esc(thumb)}" alt="Miniature YouTube : ${esc(title)}">`:'<span class="nlw-proof-placeholder">Voir la vidéo</span>'}<span class="nlw-proof-play">▶ Vidéo ↗</span></a>`
      : '<div class="nlw-proof-picture nlw-proof-placeholder">Vidéo non renseignée</div>'}
      <div class="nlw-proof-body"><h3>${esc(title)}</h3><p>${esc(name)}${player.country?` · ${esc(player.country)}`:''}${date?` · ${esc(date)}`:''}</p>${link?`<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Ouvrir la preuve ↗</a>`:'<span class="nlw-proof-context">Preuve vidéo indisponible</span>'}</div></article>`;
  }
  function renderForLevel(level,esc){
    if(typeof esc!=='function')return '';
    const gd=String(level?.level_id||level?.gd_level_id||'');
    const data=approved.get(gd);
    if(!data)return '';
    const verifiers=Array.isArray(data.verifiers)?data.verifiers.filter(v=>['FR','BE'].includes(v?.player?.country)):[];
    const first=asObj(data.first_fr_be);
    let cards=verifiers.map(v=>card('Vérification FR / BE',v,esc));
    if(first.status==='first_dated_record')cards.push(card('Premier record FR / BE daté retrouvé',first,esc));
    if(!cards.length)return '';
    return `<section class="nlw-proof-section"><h2>Vidéos et preuves AREDL</h2><p class="nlw-proof-context">Sources AREDL examinées par la modération. La première vidéo datée retrouvée ne garantit pas la première victoire historique.</p><div class="nlw-proof-grid">${cards.join('')}</div></section>`;
  }
  const api=Object.freeze({safeUrl,youtubeId,thumbnail,setApproved,loadApproved,renderForLevel});
  if(typeof module==='object' && module.exports)module.exports=api;
  if(root)root.DLFR_NLW_MEDIA=api;
})(typeof window!=='undefined'?window:undefined);

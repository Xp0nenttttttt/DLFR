/* DemonlistFrancophone — navigateur seul (aucun PHP). Moteur de la première migration. */
(() => {
'use strict';
const C = window.DEMONLIST_CONFIG || {};
const HAS_SUPABASE = !!(C.supabaseUrl && C.supabasePublishableKey);
const LIVE = true; // Site réel uniquement : aucun mode démo.
const V2 = window.DLFR_V2;
const CLANS = window.DLFR_CLANS;
const CLAN_PLUS = window.DLFR_CLAN_PLUS;
const UNVERIFIED = window.DLFR_UNVERIFIED;
const GEO = window.DLFR_GEO;
const UNRATED_STATS = window.DLFR_UNRATED_STATS;
const SUBMISSIONS = window.DLFR_SUBMISSIONS;
const DISCORD = window.DLFR_DISCORD;
const USERNAME_AUTH = window.DLFR_USERNAME_AUTH;
const BADGES = window.DLFR_BADGES;
const COMMUNITY = window.DLFR_COMMUNITY;
const ACTIVITY = window.DLFR_ACTIVITY;
const REGION_MAP = window.DLFR_REGIONS_MAP;
const PROD = window.DLFR_PRODUCTION;
const HISTORY = window.DLFR_HISTORY || {levels:[],records:[],snapshot:null};
const historicLevels = () => HISTORY.levels || [];
const oldArchive = () => historicLevels().filter(d=>Number(d.old_position)>150).sort((a,b)=>a.old_position-b.old_position);
const levelPanelGroups = [['edit','✎ Éditer les fiches'],['create','＋ Créer un niveau'],['review','◫ NLW et imports'],['remove','↺ Retirer / restaurer']];
let activeLevelPanel='edit';
const discordState=()=>null;
const discordIdentity=()=>LIVE?DISCORD.sessionDiscordIdentity(state.session):discordState();
function avatarOf(playerKey,profile){
  if(false && profile?.avatar_source==='discord'){const d=discordState();if(d.connected&&d.linked_player_key===playerKey)return DISCORD.allowedDiscordImage(d.avatar_url);}
  return imageLink(profile?.avatar_url);
}
const v2Tables=['fr_achievements','clans','clan_members','nlw_staff','player_sanctions','aredl_levels','clan_invites','clan_requests','level_submissions'];
// Le catalogue AREDL brut n'est pas utilisé par les pages publiques : ne pas l'envoyer à chaque visite.
const livePublicTables=['fr_achievements','clans','clan_members','badge_awards'];
const communityTables=['dlfr_profile_preferences','dlfr_profile_showcase','dlfr_profile_follows'];
const packTables=['dlfr_level_packs','dlfr_level_pack_levels','dlfr_level_pack_claims'];
const livePrivateTables=['profile_claim_requests','level_submissions','clan_invites','clan_requests','player_profile_owners'];
// V64 : les tables de supervision ne sont lues que dans leur onglet de modération.
const liveStaffTables=[];
// V61 : conserver les tables nécessaires à la Demonlist au premier chargement.
// Les groupes volumineux de personnalisation / level packs / historique sont lus
// uniquement quand une page en a réellement besoin (et jamais pour un visiteur de la liste).
const tables = ['site_settings','players','demons','completions','news_items','profile_titles','player_profile_titles','player_profiles','hall_of_fame'];
const optionalGroups = Object.freeze({
 reactions: ['dlfr_reactions'],
 community: ['dlfr_profile_preferences','dlfr_profile_showcase','dlfr_profile_follows'],
 packs: ['dlfr_level_packs','dlfr_level_pack_levels','dlfr_level_pack_claims'],
 history: ['player_stat_snapshots','demon_position_history'],
 adminLevels: ['dlfr_level_archive_log'],
 adminSafety: ['player_sanctions'],
 adminAudit: ['community_audit_log']
});
const optionalStatus=Object.fromEntries(Object.keys(optionalGroups).map(name=>[name,'idle']));
let dataGeneration=0;
function requiredGroups(page){
 const groups=[];
 if(['activity','news','player','my-profile'].includes(page))groups.push('reactions');
 if(['stats','players','player','my-profile','activity','packs'].includes(page)||page==='admin'&&['profiles','awards'].includes(state.adminTab))groups.push('community');
 if(['stats','players','player','my-profile','packs'].includes(page)||page==='admin'&&state.adminTab==='packs')groups.push('packs');
 if(['player','demon'].includes(page))groups.push('history');
 if(page==='admin'&&hasFullStaffPowers()){
  if(state.adminTab==='levels')groups.push('adminLevels');
  if(state.adminTab==='safety')groups.push('adminSafety');
  if(state.adminTab==='audit'||state.adminTab==='team'&&state.staffRole==='owner'&&!ownerPreviewActive())groups.push('adminAudit');
 }
 return groups;
}
// Limite les pics de requêtes PostgREST, sans changer le nombre de connexions
// autorisées par Supabase ni les permissions RLS.
const MAX_PARALLEL_READS=4;
let activeReads=0;
const readWaiters=[];
async function withReadSlot(fn){
 if(activeReads>=MAX_PARALLEL_READS)await new Promise(resolve=>readWaiters.push(resolve));
 activeReads++;
 try{return await fn();}
 finally{activeReads--;const next=readWaiters.shift();if(next)next();}
}
function startOptionalGroup(name){
 if(optionalStatus[name]!=='idle'||!state.data)return;
 const generation=dataGeneration;
 optionalStatus[name]='loading';
 Promise.all(optionalGroups[name].map(async t=>{
   try{return await readAll(t);}catch(error){console.warn('[DLFR V61] Groupe',name,t,error);throw error;}
 })).then(results=>{
   if(generation!==dataGeneration)return;
   optionalGroups[name].forEach((t,i)=>{state.data[t]=results[i];});
   optionalStatus[name]='ready';
   if(name==='community')state.communityReady=true;
   if(name==='packs')state.packsReady=true;
   render();
 }).catch(error=>{
   if(generation!==dataGeneration)return;
   optionalStatus[name]='error';
   if(name==='community')state.communityReady=false;
   if(name==='packs')state.packsReady=false;
   console.warn('[DLFR V61] Chargement optionnel indisponible',name,error);
   render();
 });
}

let db = null, state = { data:null, staff:false, staffRole:null, session:null, country:'MONDE', region:'ALL', selectedPlayer:'', list:'main', keyword:'', busy:false, statsTab:'players', statsYear:'all', comparePlayer:'', profileTab:'overview', activityTab:'following', selectedRegion:'BRE', regionsSort:'points', regionsGeometryRequested:false, newsFilter:'all', newsSearch:'', adminTab:'overview', editingNews:null, unrated:false, calcPlayer:'', calcDemons:[], calcNlw:false, unbeatSearch:'', unbeatLimit:120, communityExcel:{status:'idle',items:[],message:'',offline:false}, demoRole:'owner', demoActor:'spleen', selectedClan:1, clanSort:'points', clanSearch:'', clanDetailTab:'overview', ownKey:null, ownAccountMessage:'', mySubmissionFilter:'all', mySubmissionSearch:'', ownerPreview:'owner', ownerPreviewQueue:[], ownerPreviewError:'', teamCandidates:[], teamCandidatesReady:false, teamCandidatesError:'', mergedSourceKeys:[], mergedSourceError:'', mergeRequests:[], mergeRequestCandidates:[], mergeRequestsError:'', mergeCandidatesError:'', clanInbox:[], clanCandidates:[], clanExtraError:'', usernameAccount:null, usernameAccountError:'' };
// V100 : classement privé des décisions de modération, uniquement via une RPC agrégée.
Object.assign(state,{
 moderationLeaderboard:[],modLeaderboardPeriod:0,modLeaderboardLoading:false,
 modLeaderboardReady:false,modLeaderboardError:'',modLeaderboardUpdatedAt:''
});
let modLeaderboardSequence=0;
// V101 — noms publics des auteurs des messages de modération (soumissions du compte uniquement).
state.mySubmissionReviewAuthors=Object.create(null);
async function refreshMySubmissionReviewAuthors(){
 const uid=state.session?.user?.id;
 state.mySubmissionReviewAuthors=Object.create(null);
 if(!uid||!db)return;
 try{
  const {data,error}=await db.rpc('dlfr_my_submission_review_authors');
  if(error)throw error;
  if(state.session?.user?.id!==uid)return;
  for(const row of Array.isArray(data)?data:[]){
   const id=Number(row.submission_id);
   if(!Number.isSafeInteger(id)||id<=0)continue;
   state.mySubmissionReviewAuthors[String(id)]={
    name:plain(row.moderator_name)||'la modération',
    playerKey:plain(row.moderator_player_key)
   };
  }
 }catch(error){
  console.warn('[DLFR V101] Auteurs des messages indisponibles :',error?.message||error);
 }
}
const PERF_DEBUG=new URLSearchParams(location.search).has('perf');
const perfNow=()=>typeof performance!=='undefined'?performance.now():Date.now();
const el = document.getElementById('app');
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain = v=>String(v??'').trim();
// Les profils historiques peuvent ne pas avoir de display_name dans Supabase.
const sortPlayerName = p => plain(p?.display_name) || plain(p?.username) || plain(p?.player_key);
// "X and more" est un crédit de megacollab, pas un vrai pseudo de joueur.
const isCreatorGroupCredit = name => /\band\s+more\b/i.test(plain(name).replace(/[\u2066-\u2069]/g,''));
const hasFullStaffPowers = () => ['owner','editor','supermoderator'].includes(state.staffRole);
const ownerPreviewActive=()=>state.staffRole==='owner'&&state.ownerPreview!=='owner';
const key = s=>plain(s).toLocaleLowerCase('fr');
const fmt = n => Number(n||0).toLocaleString('fr-FR',{maximumFractionDigits:2,minimumFractionDigits:2});
const num = n => Number(n||0);
const url = (page,fields={})=>'?' + new URLSearchParams({page,...fields}).toString();
const http = value => { const s=plain(value); try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';} };
// Les URLs sont traitées comme des données : jamais de code HTML externe ni d'iframe arbitraire.
function imageLink(value){const s=plain(value);return (/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(s))&&!LIVE ? (s.length<1350000?s:'') : (http(s)||(s.startsWith('assets/')&&!s.includes('..')?s:''));}
function videoContent(value){
 const raw=http(value);if(!raw)return '';
 const u=new URL(raw),host=u.hostname.toLowerCase().replace(/^www\./,'');
 let yt='';
 if(host==='youtu.be') yt=u.pathname.slice(1).split('/')[0];
 if(['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host)){
   if(u.pathname==='/watch')yt=u.searchParams.get('v')||'';
   else if(/^\/(shorts|live|embed)\//.test(u.pathname))yt=u.pathname.split('/')[2]||'';
 }
 if(/^[a-zA-Z0-9_-]{11}$/.test(yt))return `<div class="news-video"><iframe loading="lazy" src="https://www.youtube-nocookie.com/embed/${yt}" title="Vidéo de l'actualité" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
 if(/^https?:$/.test(u.protocol)&&/\.(mp4|webm)$/i.test(u.pathname))return `<video class="news-video-file" preload="none" controls playsinline src="${esc(raw)}"></video>`;
 return `<a class="link" href="${esc(raw)}" target="_blank" rel="noopener noreferrer">Voir la vidéo ↗</a>`;
}
function newsMedia(n){const picture=imageLink(n.image_url);return `${picture?`<a class="news-image-link" target="_blank" rel="noopener noreferrer" href="${esc(picture)}"><img class="news-image" loading="lazy" src="${esc(picture)}" alt="Illustration de : ${esc(n.headline)}"></a>`:''}${n.video_url?videoContent(n.video_url):''}`;}
async function uploadNewsImage(file){
 if(!file)return '';
 if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type))throw Error('Image JPG, PNG, WebP ou GIF uniquement.');
 if(file.size>5*1024*1024)throw Error('Image trop volumineuse : maximum 5 Mo.');
 if(!LIVE){
  if(file.size>650*1024)throw Error('Mode démo : image de 650 Ko maximum pour la sauvegarde locale. Utilise une URL pour une image plus grande.');
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(Error('Impossible de lire cette image.'));r.readAsDataURL(file);});
 }
 const suffix=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'})[file.type];
 const id=crypto.randomUUID();
 const path=`actualites/${id}.${suffix}`;
 const {error}=await db.storage.from('demonlist-news').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
 if(error)throw Error('Impossible d’envoyer cette image pour le moment.');
 const {data}=db.storage.from('demonlist-news').getPublicUrl(path);
 return data.publicUrl;
}
function productionProofMedia(d){
  const items=[];
  function add(title,name,link,stored,when){
    const v=http(link);if(!v)return;
    let thumbnail=imageLink(stored);
    if(!thumbnail){
      try{const u=new URL(v);const host=u.hostname.toLowerCase().replace(/^www\./,'');
        let id=host==='youtu.be'?u.pathname.slice(1).split('/')[0]:'';
        if(['youtube.com','m.youtube.com'].includes(host)) id=u.pathname==='/watch'?(u.searchParams.get('v')||''):u.pathname.split('/')[2]||'';
        if(/^[\w-]{11}$/.test(id))thumbnail=`https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      }catch{}
    }
    items.push(`<article class="prod-proof-card">${thumbnail?`<a target="_blank" rel="noopener noreferrer" href="${esc(v)}"><img loading="lazy" src="${esc(thumbnail)}" alt="Miniature vidéo : ${esc(title)}"></a>`:''}<h3>${esc(title)}</h3><p>${esc(name||'Identité inconnue')}${when?' · '+esc(date(when)):''}</p><a class="link" href="${esc(v)}" target="_blank" rel="noopener noreferrer">Voir la preuve vidéo ↗</a></article>`);
  }
  add('Vidéo de vérification',d.verifier,d.verifier_video_url,d.thumbnail_url,null);
  add('Premier record français daté disponible',d.first_fr_player,d.first_fr_video_url,d.first_fr_thumbnail_url,d.first_fr_achieved_at);
  return items.length?`<section class="prod-proof-media" aria-label="Preuves vidéo AREDL">${items.join('')}</section>`:(d.data_source==='aredl'?'<p class="small muted">Preuves françaises non encore renseignées : une synchronisation détaillée est nécessaire.</p>':'');
}
function staffNamesHTML(team){
 if(state.data?.staff_directory_error)return '<p class="small muted">L’équipe de modération ne peut pas être affichée pour le moment.</p>';
 const labels={owner:'propriétaire',editor:'supermodo (ancien rôle)',supermoderator:'supermodo',moderator:'modo',nlw:'modo NLW'};
 const members=(state.data?.staff_directory||[]).filter(m=>m.team===team).sort((a,b)=>Number(b.role==='owner')-Number(a.role==='owner')||sortPlayerName(a).localeCompare(sortPlayerName(b),'fr'));
 if(!members.length)return '<p class="small muted">Aucun membre renseigné pour le moment.</p>';
 return members.map(m=>`<div class="staff-name">${m.country_code?flag(m.country_code)+' ':''}${esc(m.display_name||'Modérateur')}${labels[m.role]?` <span class="muted">· ${esc(labels[m.role])}</span>`:''}</div>`).join('');
}
const flag = code => GEO?.countryImage(code) || '';
const regionFor = p=> p?.country_code==='FR' ? (profileByKey().get(p.player_key)?.region_code||'') : '';
const regionFlag = p=>GEO?.regionImage(regionFor(p))||'';
const regionText = p=>GEO?.regionInfo(regionFor(p))?.name||'';
const regionIdentity = p => {const r=regionText(p);return r?`<span class="region-identity">${regionFlag(p)} <span>${esc(r)}</span></span>`:'';};
const date = d => {if(!d)return '';const x=new Date(d);return Number.isNaN(x.getTime())?'':x.toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});};
const friendlyMessage=message=>{
 const raw=String(message??'');
 if(/\b(?:supabase|postgres|migration|\bsql\b|\brls\b|policy|policies|schema cache|\brpc\b|\bjavascript\b|\bscript\b|\bcdn\b|auth\.?uid|\bjs\/|\b42_USERNAME)\b/i.test(raw)||/\b(?:PGRST|42P01|23503|42703|42883|column reference)\b/i.test(raw)){
  console.warn('[DLFR] Détail technique (non affiché publiquement) :',raw);
  return 'Cette action est momentanément indisponible. Réessaie dans un instant ou contacte la modération.';
 }
 return raw;
};
const toast=msg=>{const x=$('toast');x.textContent=friendlyMessage(msg);x.classList.add('visible');setTimeout(()=>x.classList.remove('visible'),3500);};
const templateNotice=()=>'';
function migrationNotice(){
 if(!HAS_SUPABASE)return '<div class="notice warning">Le site est temporairement indisponible. Réessaie un peu plus tard.</div>';
 if(state.data?.demons?.length)return '';
 return '<div class="notice warning"><b>Aucun niveau publié.</b> Connecte-toi comme modérateur pour ajouter un niveau ou valider une soumission.</div>';
}
const cfg=()=>state.data.site_settings[0]||{main_limit:75,extended_limit:150,top1_points:350,legacy_scores:false};
// Cache de calcul par rendu : les classements et badges ne sont construits
// qu'une seule fois lorsque plusieurs cartes les demandent sur la même page.
let renderCatalogCache=null, renderRankingCache=null, renderProfilesCache=null;
const profileByKey=()=>renderProfilesCache||(renderProfilesCache=new Map((state.data.player_profiles||[]).map(p=>[p.player_key,p])));
function resetRenderCalculations(){renderCatalogCache=null;renderRankingCache=null;renderProfilesCache=null;}
async function loadStaffCandidates(){
 if(!LIVE||state.staffRole!=='owner'||ownerPreviewActive()||!db)return;
 const {data,error}=await db.rpc('dlfr_staff_candidates');
 state.teamCandidatesReady=true;
 state.teamCandidatesError=error?.message||'';
 state.teamCandidates=error?[]:(Array.isArray(data)?data:[]);
}
async function loadModeratorLeaderboard(){
 if(!LIVE||!db||!state.session||!state.staff)return;
 const sequence=++modLeaderboardSequence;
 const days=state.modLeaderboardPeriod||null;
 state.modLeaderboardLoading=true;
 state.modLeaderboardError='';
 state.modLeaderboardReady=false;
 try{
  const {data,error}=await db.rpc('dlfr_moderation_leaderboard',{p_days:days});
  if(error)throw Error(error.message);
  if(sequence!==modLeaderboardSequence)return;
  if(!Array.isArray(data))throw Error('Réponse du classement invalide.');
  state.moderationLeaderboard=data;
  state.modLeaderboardReady=true;
  state.modLeaderboardUpdatedAt=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
 }catch(error){
  if(sequence!==modLeaderboardSequence)return;
  state.modLeaderboardError=error.message||String(error);
  state.moderationLeaderboard=[];
  state.modLeaderboardReady=true;
 }finally{
  if(sequence===modLeaderboardSequence){state.modLeaderboardLoading=false;if(nav()==='admin'&&state.adminTab==='leaderboard')render();}
 }
}
function moderationLeaderboardPage(){
 const rows=(state.moderationLeaderboard||[]).slice().sort((a,b)=>Number(b.total||0)-Number(a.total||0)||Number(b.accepted||0)-Number(a.accepted||0)||String(a.display_name||'').localeCompare(String(b.display_name||''),'fr'));
 const played=rows.filter(r=>Number(r.total)>0);
 const overall=played.reduce((x,r)=>x+Number(r.total||0),0);
 const approved=played.reduce((x,r)=>x+Number(r.accepted||0),0);
 const rejected=played.reduce((x,r)=>x+Number(r.rejected||0),0);
 const max=Math.max(1,...played.map(r=>Number(r.total)||0));
 const roleName={owner:'Propriétaire',supermoderator:'Supermodo',editor:'Supermodo',moderator:'Modo',nlw:'Modo NLW',former:'Ancien membre'};
 const periodButtons=[[0,'Depuis toujours'],[30,'30 jours'],[7,'7 jours']].map(([days,label])=>`<button type="button" data-mod-leaderboard-period="${days}" class="btn small ${state.modLeaderboardPeriod===days?'':'subtle'}" aria-pressed="${state.modLeaderboardPeriod===days}">${label}</button>`).join('');
 const displayName=r=>r.player_key?`<a data-nav class="link" href="${url('player',{player:r.player_key})}">${esc(r.display_name||'Modérateur')}</a>`:esc(r.display_name||'Modérateur');
 const medal=['🥇','🥈','🥉'];
 const podium=[1,0,2].filter(i=>played[i]).map(i=>{const r=played[i];return `<div class="dlfr-v100-podium-card dlfr-v100-place-${i+1} ${r.is_self?'is-self':''}"><div class="dlfr-v100-medal" aria-hidden="true">${medal[i]}</div><div class="dlfr-v100-podium-name">${displayName(r)}</div><span class="dlfr-v100-podium-role">${esc(roleName[r.moderation_role]||'Modo')}</span><strong>${Number(r.total)||0}</strong><span class="small muted">soumissions traitées</span></div>`;}).join('');
 const cards=rows.map((r,i)=>{const total=Number(r.total)||0,accept=Number(r.accepted)||0,deny=Number(r.rejected)||0;return `<div class="dlfr-v100-rank-row ${r.is_self?'is-self':''}"><div class="dlfr-v100-rank-position">${total>0&&i<3?medal[i]:`#${i+1}`}</div><div class="dlfr-v100-rank-body"><div class="dlfr-v100-rank-name">${r.country_code?flag(r.country_code)+' ':''}${displayName(r)}${r.is_self?'<span class="dlfr-v100-you">Toi</span>':''}<small>${esc(roleName[r.moderation_role]||'Modo')}</small></div><div class="dlfr-v100-progress" role="img" aria-label="${total} soumissions traitées"><span style="width:${total?Math.max(1,Math.round(total/max*100)):0}%"></span></div></div><div class="dlfr-v100-rank-split"><span><b>${accept}</b> acceptée(s)</span><span><b>${deny}</b> refusée(s)</span></div><div class="dlfr-v100-total"><strong>${total}</strong><small>total</small></div></div>`;}).join('');
 return `<section class="dlfr-v100-board"><div class="dlfr-v100-head"><div><span class="kicker">ÉQUIPE DLFR · SOUMISSIONS</span><h2>Classement des modérateurs</h2><p class="muted small">Chaque soumission de niveau acceptée ou refusée compte une fois, au nom du compte ayant pris la décision. Les demandes en attente ne comptent pas.</p></div><button type="button" class="btn subtle small" data-mod-leaderboard-refresh ${state.modLeaderboardLoading?'disabled':''}>↻ Actualiser</button></div><div class="dlfr-v100-controls">${periodButtons}</div>${state.modLeaderboardLoading?'<p class="notice" aria-live="polite">Chargement du classement…</p>':state.modLeaderboardError?`<div class="notice warning">Classement indisponible. ${esc(state.modLeaderboardError)}</div>`:`<div class="dlfr-v100-summary"><div><strong>${overall}</strong><span>Soumissions traitées</span></div><div><strong>${approved}</strong><span>Acceptées</span></div><div><strong>${rejected}</strong><span>Refusées</span></div><div><strong>${played.length}</strong><span>Modos ayant traité une demande</span></div></div>${podium?`<div class="dlfr-v100-podium">${podium}</div>`:''}<div class="dlfr-v100-rank-list">${cards||'<p class="muted">Aucune soumission modérée sur cette période.</p>'}</div><p class="small muted">${state.modLeaderboardUpdatedAt?'Mis à jour à '+esc(state.modLeaderboardUpdatedAt)+' · ':''}Les anciens membres ayant un historique apparaissent également. Les actions anciennes non attribuées à un modérateur ne sont pas comptabilisées.</p>`}</section>`;
}
function staffTeamPanel(){
 if(state.staffRole!=='owner'||ownerPreviewActive())return '';
 const roles={owner:'Propriétaire',supermoderator:'Supermodo',editor:'Supermodo (ancien)',moderator:'Modo',nlw:'Modo NLW'};
 const members=state.teamCandidates.filter(x=>x.current_role);
 const owners=members.filter(x=>x.current_role==='owner');
 const levelActions=(state.data.community_audit_log||[]).filter(a=>['SCOPED_LEVEL_CREATE','SCOPED_LEVEL_EDIT'].includes(String(a.action_key||'').toUpperCase()));
 const levelCounts=new Map();
 for(const a of levelActions){const uid=a.actor_user_id;if(!uid)continue;const entry=levelCounts.get(uid)||{targets:new Set(),created:0,edited:0};if(a.target!=null)entry.targets.add(String(a.target));if(String(a.action_key).toUpperCase()==='SCOPED_LEVEL_CREATE')entry.created++;else entry.edited++;levelCounts.set(uid,entry);}
 const managedCount=uid=>levelCounts.get(uid)?.targets.size||0;
 const managedDetails=uid=>{const x=levelCounts.get(uid);return x?`${x.created} création(s) · ${x.edited} modification(s)`:'Aucune action de niveau enregistrée';};
 const label=x=>`${x.display_name||'Compte DLFR'} — ${x.auth_user_id.slice(0,8)}…${x.current_role?' · '+(roles[x.current_role]||x.current_role):''}`;
 const options='<option value="">Sélectionner un compte connecté</option>'+state.teamCandidates.map(x=>`<option value="${esc(x.auth_user_id)}">${esc(label(x))}</option>`).join('');
 return `<section class="admin-card dlfr-team-panel" data-admin-section="team"><div class="dlfr-team-heading"><div><span class="kicker">GESTION PROPRIÉTAIRE</span><h3>Équipe de modération</h3><p class="muted">Attribue les accès à un compte déjà inscrit sur la DLFR. Seuls les propriétaires peuvent modifier ces droits.</p></div><button class="btn subtle small" type="button" data-refresh-team>↻ Actualiser</button></div>
 ${state.teamCandidatesError?`<div class="notice warning">Impossible de charger les comptes autorisés. Vérifie que la migration 49 est installée. <small>${esc(state.teamCandidatesError)}</small></div>`:''}
 ${!state.teamCandidatesReady?'<p class="muted">Chargement des comptes…</p>':''}
 <div class="dlfr-team-list"><h4>Équipe actuelle</h4><p class="small muted">Niveaux gérés = fiches distinctes créées ou modifiées via les outils de modération journalisés. Les anciennes actions non enregistrées ne peuvent pas être comptées rétroactivement.</p>${members.map(x=>`<div class="dlfr-team-member"><span><b>${esc(x.display_name||'Compte DLFR')}</b><small>${esc(x.auth_user_id.slice(0,8))}…</small><small>${esc(managedDetails(x.auth_user_id))}</small></span><span class="dlfr-team-member-meta"><span class="tag ${x.current_role==='owner'?'dlfr-team-owner':''}">${esc(roles[x.current_role]||x.current_role)}</span><strong class="dlfr-managed-count">${managedCount(x.auth_user_id)} <small>niveau(x)</small></strong></span></div>`).join('')||'<p class="muted">Aucun compte retourné.</p>'}</div>
 <div class="dlfr-team-forms"><form data-form="prodManageStaff" class="dlfr-team-form"><h4>Attribuer ou retirer un rôle</h4><label class="field">Compte DLFR<select name="auth_user_id" required>${options}</select></label><label class="field">Rôle<select name="role"><option value="nlw">Modo NLW</option><option value="moderator">Modo</option><option value="supermoderator">Supermodo</option></select></label><label class="field">Action<select name="enabled"><option value="yes">Attribuer</option><option value="no">Retirer ce rôle</option></select></label><button type="submit" class="btn" ${!state.teamCandidatesReady||!!state.teamCandidatesError?'disabled':''}>Enregistrer le rôle</button><p class="small muted">Les propriétaires ne peuvent pas être rétrogradés depuis ce formulaire.</p></form>
 <form data-form="addCoowner" class="dlfr-team-form dlfr-team-form-owner"><h4>Ajouter un deuxième propriétaire</h4><p class="small muted">Accès total, y compris aux permissions et aux paramètres sensibles. Réserve cette fonction à une personne de confiance.</p><label class="field">Compte à promouvoir<select name="auth_user_id" required>${options}</select></label><label class="field">Confirmation : écrire COPROPRIETAIRE<input name="confirmation" autocomplete="off" placeholder="COPROPRIETAIRE" required></label><button type="submit" class="btn danger" ${!state.teamCandidatesReady||!!state.teamCandidatesError||owners.length>=2?'disabled':''}>Nommer copropriétaire</button><p class="small muted">${owners.length>=2?'Deux propriétaires sont déjà enregistrés.':'Cette action est irréversible depuis le site ; aucun propriétaire ne peut être retiré depuis ce panneau.'}</p></form></div></section>`;
}
// V83 — insertion directe des UNRATED aux rangs simulés, dans une seule liste.
// Ne touche jamais aux positions SQL officielles.
function integratedCatalog(demons,enabled){
 const rated=demons.filter(d=>!d.unrated).map(d=>({...d,original_position:Number(d.position),position:Number(d.position)})).sort((a,b)=>a.position-b.position);
 if(!enabled)return rated;
 const simulated=rated.slice();
 const extras=demons.filter(d=>d.unrated&&d.is_public!==false&&!d.legacy)
  .map(d=>({...d,original_position:null,requested_position:Math.max(1,Number(d.unrated_position)||151)}))
  .sort((a,b)=>a.requested_position-b.requested_position||String(a.name).localeCompare(String(b.name),'fr'));
 for(const d of extras){
  const rank=d.requested_position;
  for(const row of simulated)if(row.position>=rank)row.position++;
  d.position=rank;
  simulated.push(d);
 }
 return simulated.sort((a,b)=>a.position-b.position||Number(!!b.unrated)-Number(!!a.unrated));
}
const catalog=()=>renderCatalogCache||(renderCatalogCache=integratedCatalog(state.data.demons,state.unrated));
const unratedData=()=>UNRATED_STATS.calculate(V2,state.data.demons,state.data.completions,state.data.players,num(cfg().top1_points));
const nlwPoints=(d,r=100)=>V2.nlwPoints(d,r);
const noSqlNotice=()=>'';
const allowV2Edit=()=>state.staff;
const canNLW=()=>false;
const callout=x=>`<div class="notice">${x}</div>`;
// Les sauvegardes fictives ont été supprimées.
const saveDemo=()=>{}; // Compatibilité avec les anciennes branches inactives du moteur V2.
function withTimeout(promise,ms,message){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]).finally(()=>clearTimeout(timer));}
// Pagination bornée sous le plafond PostgREST (parfois 250 lignes par réponse).
// Important : si on demande 1000 et que le serveur n'en rend que 250, il ne
// faut pas interpréter ces 250 lignes comme la fin de la table.
const READ_PAGE_SIZE=200;
const READ_SORT_KEYS=Object.freeze({
 site_settings:['id'],players:['player_key'],demons:['id'],completions:['id'],
 news_items:['id'],profile_titles:['id'],player_profile_titles:['player_key','title_id'],
 player_profiles:['player_key'],hall_of_fame:['id'],
 fr_achievements:['id'],badge_awards:['player_key','badge_id'],
 clan_members:['player_key'],level_submissions:['id'],
 dlfr_profile_preferences:['player_key'],dlfr_profile_showcase:['player_key','slot'],
 dlfr_profile_follows:['follower_key','followed_key'],
 dlfr_level_packs:['id'],dlfr_level_pack_levels:['pack_id','demon_id'],
 dlfr_level_pack_claims:['pack_id','player_key'],
 dlfr_reactions:['auth_user_id','target_key','emoji']
});
async function readAll(name){return withReadSlot(async()=>{
 const start=perfNow();let out=[],from=0;
 while(true){
  const query=db.from(name).select('*');
  // Ordre stable entre les pages (évite de perdre ou dupliquer des niveaux).
  for(const column of READ_SORT_KEYS[name]||[])query.order(column,{ascending:true});
  // Conserver la RLS serveur et réduire les lignes inutiles pour les visiteurs.
  if(name==='demons'&&!state.staff)query.or('is_public.eq.true,is_public.is.null');
  if(name==='level_submissions'&&!state.staff&&state.session?.user?.id)query.eq('auth_user_id',state.session.user.id);
  const {data,error}=await query.range(from,from+READ_PAGE_SIZE-1);
  if(error)throw Error(`${name} : ${error.message}`);
  if(!Array.isArray(data))throw Error(`${name} : réponse invalide`);
  out.push(...data);
  if(data.length<READ_PAGE_SIZE)break;
  from+=READ_PAGE_SIZE;
  if(from>=60000)throw Error(`Limite de lecture atteinte pour ${name}; contacter la modération`);
 }
 if(PERF_DEBUG)console.info('[DLFR perf] Lecture',name,out.length+' lignes',Math.round(perfNow()-start)+' ms');
 return out;
});}
async function refreshLiveData(){
 state.modLeaderboardReady=false;
 ++dataGeneration; // Invalider les chargements optionnels antérieurs à une modification.
 resetRenderCalculations();
 const base=await withTimeout(Promise.all(tables.map(readAll)),45000,'Supabase ne répond pas après 45 secondes.');
 state.data=Object.fromEntries(tables.map((t,i)=>[t,base[i]]));
 // Les fiches AREDL catalogue brut sont conservées en base, mais exclues de la liste publique.
 state.unpublishedAredlDemons=(state.data.demons||[]).filter(x=>x.is_public===false);
 state.data.demons=(state.data.demons||[]).filter(x=>x.is_public!==false);
 // Annuaire public des modérateurs : noms publics seulement, aucune donnée Auth sensible.
 const staffDirectory=await db.rpc('dlfr_public_staff_directory');
 state.data.staff_directory=staffDirectory.error?[]:(staffDirectory.data||[]);
 state.data.staff_directory_error=staffDirectory.error?.message||null;
 if(staffDirectory.error)console.warn('Annuaire équipe indisponible :',staffDirectory.error.message);
 for(const t of v2Tables)state.data[t]=[];
 // Lectures indépendantes en parallèle : auparavant, chaque table optionnelle
 // attendait la précédente, même pour une page qui ne l'utilisait pas.
 const publicTables=[...new Set([...livePublicTables,...(state.session?livePrivateTables:[]),...(hasFullStaffPowers()?liveStaffTables:[])])];
 // Les tables optionnelles ne sont pas nécessaires aux visiteurs de la liste.
 // Sur une actualisation après modération, leur contenu sera relu à la prochaine
 // ouverture de la page concernée, et non pendant le rafraîchissement global.
 for(const [name,group] of Object.entries(optionalGroups)){
  optionalStatus[name]='idle';
  for(const table of group)state.data[table]=[];
 }
 state.communityReady=false;state.packsReady=false;
 await Promise.all(publicTables.map(async t=>{state.data[t]=await readAll(t);}));
 await refreshMySubmissionReviewAuthors();
 state.verificationClaims=[];state.verificationClaimsError='';
 if(state.session){const claims=await db.rpc('dlfr_verification_claim_list');
   if(claims.error)state.verificationClaimsError='Demandes indisponibles : installe la migration 45 ou réessaie. '+claims.error.message;
   else state.verificationClaims=claims.data||[];
 }
 // La fusion conserve volontairement la fiche source, mais celle-ci ne doit plus
 // être proposée dans les menus de modération. Le journal est privé : RPC dédiée.
 state.mergedSourceKeys=[];state.mergedSourceError='';
 if(hasFullStaffPowers()){
  const merged=await db.rpc('dlfr_merged_player_sources');
  if(merged.error){
   state.mergedSourceError='Historique des fusions indisponible : vérifie la migration SQL 51.';
   console.warn('[DLFR] Lecture des fusions :',merged.error);
  }else state.mergedSourceKeys=(Array.isArray(merged.data)?merged.data:[]).map(x=>plain(x.player_key)).filter(Boolean);
 }
 state.mergeRequests=[];state.mergeRequestCandidates=[];state.mergeRequestsError='';state.mergeCandidatesError='';
 if(state.session){
  // V69 : ces RPC sont indépendantes. Une erreur de chargement des candidats ne doit
  // JAMAIS faire disparaitre la file de demandes deja retournee par Supabase.
  const [requests,candidates]=await Promise.all([
    db.rpc('dlfr_player_merge_request_list'),
    db.rpc('dlfr_player_merge_candidates')
  ]);
  if(requests.error){
   state.mergeRequestsError='Demandes de fusion indisponibles : '+requests.error.message;
   console.warn('[DLFR] Liste des demandes de fusion :',requests.error);
  }else state.mergeRequests=Array.isArray(requests.data)?requests.data:[];
  if(candidates.error){
   state.mergeCandidatesError='Recherche de fiches disponibles indisponible : '+candidates.error.message;
   console.warn('[DLFR] Candidats de fusion :',candidates.error);
  }else state.mergeRequestCandidates=Array.isArray(candidates.data)?candidates.data:[];
 }
 state.scopedQueue=[];
 if(state.staff){
   const queue=await db.rpc('dlfr_review_queue_status');
   if(queue.error)state.scopedQueueError=queue.error.message;
   else state.scopedQueue=queue.data||[];
 }
 if(state.staff){
  await Promise.all(['staff_roles','nlw_staff_roles'].map(async t=>{
   try{state.data[t]=await readAll(t);}catch(error){state.data[t]=[];console.warn('DLFR : rôle modérateur inaccessible',t,error.message);}
  }));
 }
 for(const t of ['badge_awards','profile_claim_requests','player_profile_owners','level_submissions','clan_invites','clan_requests','player_sanctions','community_audit_log'])if(!Array.isArray(state.data[t]))state.data[t]=[];
 // Badges : les attributions persistantes Supabase ne doivent jamais être effacées par la migration de démonstration.
 state.data.badge_catalog_version=28;
 BADGES.init(state.data);
}
async function processDiscordAvatarReturn(){
 const params=new URLSearchParams(location.search);
 if(params.get('dlfr_discord_avatar_refresh')!=='1')return;
 params.delete('dlfr_discord_avatar_refresh');
 history.replaceState({},'',location.pathname+(params.toString()?'?'+params.toString():'')+location.hash);
 let expected='';
 try{expected=sessionStorage.getItem('dlfr_avatar_refresh_uid')||'';sessionStorage.removeItem('dlfr_avatar_refresh_uid');}catch{}
 if(!expected||!state.session||state.session.user.id!==expected||!state.ownKey){toast('Actualisation Discord annulée : compte ou profil différent.');return;}
 const {data,error}=await db.auth.getUser();
 if(error||!data?.user){toast('Impossible de vérifier la nouvelle identité Discord.');return;}
 const currentUser=data.user;
 if(currentUser.id!==expected){toast('Identité différente : avatar inchangé.');return;}
 const discordUser=DISCORD.sessionDiscordIdentity({user:currentUser});
 const picture=discordUser?.avatar_url;
 if(!picture){toast('Discord n’a pas fourni de nouvel avatar.');return;}
 const {error:saveError}=await db.from('player_profiles').upsert({player_key:state.ownKey,avatar_url:picture},{onConflict:'player_key'});
 if(saveError){toast('Mise à jour avatar : '+saveError.message);return;}
 state.session={...state.session,user:currentUser};
 state.data.player_profiles=await readAll('player_profiles');
 toast('Photo de profil mise à jour depuis Discord.');
}
async function refreshUsernameAccount(){
 state.usernameAccount=null;state.usernameAccountError='';
 if(!LIVE||!state.session||C.enableUsernameLogin!==true||!USERNAME_AUTH?.status)return;
 try{const info=await USERNAME_AUTH.status(db,C);state.usernameAccount=info.username||null;}
 catch(error){state.usernameAccountError='Le statut de ton compte n’a pas pu être chargé.';console.warn('[DLFR auth] Statut du pseudo :',error);}
}
async function load(){
 if(!HAS_SUPABASE){showPageError(Error('Configuration des services absente.'));return;}
 if(!window.supabase){console.error('[DLFR] Bibliothèque de connexion non chargée.');el.innerHTML='<div class="center-panel"><h2>Connexion momentanément indisponible</h2><p>Réessaie dans quelques instants.</p></div>';return;}
 db=window.supabase.createClient(C.supabaseUrl,C.supabasePublishableKey);
 try{
  const {data:sessionData,error:sessionError}=await db.auth.getSession();if(sessionError)throw sessionError;
  state.session=sessionData.session;
  await checkStaff();
  await refreshLiveData();
  await checkSelfOwner();
  await refreshUsernameAccount();
  await refreshClanTools();
  await processDiscordAvatarReturn();
  $('sourceLabel').textContent=`${state.data.demons.filter(x=>x.is_public!==false).length} niveaux répertoriés`;
  render();
 }catch(err){console.error("[DLFR] Chargement initial :",err);el.innerHTML=`<div class="center-panel" role="alert"><h2>Impossible de charger la Demonlist</h2><p>Les données sont momentanément indisponibles. Réessaie dans quelques instants.</p><button type="button" class="btn" onclick="location.reload()">Réessayer</button></div>`;}
}
async function checkStaff(){
 if(!LIVE)return;
 state.staff=false;state.staffRole=null;
 state.ownerPreview='owner';
 if(!state.session)return;
 const {data,error}=await db.from('staff_roles').select('role').eq('auth_user_id',state.session.user.id).maybeSingle();
 if(!error && data){state.staffRole=data.role;state.staff=['editor','owner','supermoderator','moderator'].includes(data.role);}
 if(!state.staff){
  const nlw=await db.from('nlw_staff_roles').select('auth_user_id').eq('auth_user_id',state.session.user.id).maybeSingle();
  if(!nlw.error&&nlw.data){state.staffRole='nlw';state.staff=true;}
 }
}
async function checkSelfOwner(){
 state.ownKey=null;state.ownAccountMessage='';
 if(!LIVE||!state.session)return;
 const {data,error}=await db.from('player_profile_owners').select('player_key').eq('auth_user_id',state.session.user.id).maybeSingle();
 if(error){state.ownAccountMessage='La liaison des comptes joueurs n’est pas encore installée. Consulte le guide V2.4.';return;}
 if(!data){state.ownAccountMessage='Ton compte est connecté. Tu peux créer une fiche joueur vierge ou demander la liaison avec une fiche existante.';return;}
 state.ownKey=data.player_key;
 // La liaison Auth, lue via RLS pour ce compte, fait foi.
 // players.has_account peut encore etre desynchronise sur de vieilles fiches.
 const mine=(state.data.players||[]).find(p=>p.player_key===state.ownKey);
 if(mine)mine.has_account=true;
}
// DLFR 2.12 — file d'invitations liée au compte authentifié, jamais à un pseudo saisi.
// Le serveur contrôle les droits; on ne fait pas confiance aux options HTML.
async function refreshClanTools(){
 state.clanInbox=[];state.clanCandidates=[];state.clanExtraError='';
 if(!LIVE||!state.session||!state.ownKey)return;
 const current=CLANS.member(state.data,state.ownKey);
 const responses=await Promise.all([
  db.rpc('dlfr_clan_my_invitations'),
  current&&['leader','officer'].includes(current.role)
   ?db.rpc('dlfr_clan_invite_candidates',{p_clan_id:Number(current.clan_id)})
   :Promise.resolve({data:[],error:null})
 ]);
 const [inbox,candidates]=responses;
 if(inbox.error||candidates.error){
  state.clanExtraError='Les invitations ne sont pas disponibles pour le moment. Vérifie l’installation de la mise à jour.';
  console.warn('[DLFR clans] Récupération des invitations :',inbox.error||candidates.error);
 }
 state.clanInbox=inbox.error?[]:(inbox.data||[]);
 state.clanCandidates=candidates.error?[]:(candidates.data||[]);
}
function clanInvitationsHtml(actor,data){
 if(!actor)return '';
 const list=LIVE?(state.clanInbox||[]):CLANS.pending(data,actor).map(x=>({...x,invitation_id:x.id,clan_name:CLAN_PLUS.clan(data,x.clan_id)?.name||'Clan'}));
 return `<section class="clan-v22-panel dlfr212-inbox"><div class="row-between"><h3>Mes invitations · ${list.length}</h3><button type="button" class="btn subtle small" data-clan-refresh>Actualiser</button></div>
 ${state.clanExtraError?`<p class="notice warning">${esc(state.clanExtraError)}</p>`:''}
 ${list.map(i=>`<div class="clan-v22-queue"><span>Invitation de <b>${esc(i.clan_name||CLAN_PLUS.clan(data,i.clan_id)?.name||'?')}</b></span><div class="clan-actions"><button class="btn small" data-clan-action="accept" data-invite-id="${esc(i.invitation_id)}">Accepter</button><button class="btn subtle small" data-clan-action="decline" data-invite-id="${esc(i.invitation_id)}">Refuser</button></div></div>`).join('')||'<p class="muted small">Aucune invitation en attente.</p>'}</section>`;
}
function closeNavMenus(){document.querySelectorAll('.nav-menu[open]').forEach(menu=>menu.open=false);}
function nav(){
 const page=new URLSearchParams(location.search).get('page')||'list';
 const canonical=['hall','achievements'].includes(page)?'honors':page;
 document.querySelectorAll('[data-link]').forEach(a=>a.classList.toggle('active',a.dataset.link===canonical));
 document.querySelectorAll('.nav-menu').forEach(menu=>{
   const active=!!menu.querySelector('a[data-link="'+canonical+'"]');
   menu.classList.toggle('active',active);
 });
 return page;
}
function go(page,fields={}){closeNavMenus();history.pushState({},'',url(page,fields));if(page==='list')state.list=(fields.tab==='nlw'||fields.tab==='archive')?'nlw':'main';state.keyword='';render();window.scrollTo({top:0,behavior:'instant'});}
function box(label,value){return `<div class="statbox"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div></div>`;}
function scoreBase(position){const p=+position;return p>=56?1.039035131*((185.7*Math.exp(-.02715*p))+14.84):p>=36?1.0371139743*((212.61*Math.pow(1.036,1-p))+25.071):p>=21?((250-83.389)*Math.pow(1.0099685,2-p)-31.152)*1.0371139743:p>=4?((326.1*Math.exp(-.0871*p))+51.09)*1.037117142:p>=1?(-18.2899079915*p)+368.2899079915:0;}
function score(demon,progress=100){
 const s=cfg(),p=num(demon.position),required=Math.max(1,Math.min(100,num(demon.requirement||100)));
 if(p<1||p>num(s.extended_limit)||num(progress)<required)return 0;
 const base=scoreBase(p)*num(s.top1_points)/scoreBase(1);
 return +progress===100?base:(base*Math.pow(5,(+progress-required)/Math.max(1,100-required)))/10;
}
function ranked(){
 if(renderRankingCache)return renderRankingCache;
 const d=state.data,demons=catalog(),byId=Object.fromEntries(demons.map(v=>[v.id,v]));
 const completionScoreByPlayer = new Map();
 const playersByLegacyId=new Map(d.players.filter(p=>num(p.legacy_id)>0).map(p=>[num(p.legacy_id),p]));
 const resolvePlayer=V2.playerResolver(d.players),scoredRecords=V2.scoringRecords(d.players,demons,d.completions);
 const people=new Map(d.players.map(p=>[p.player_key,{...p,total_records:0,total_completions:0,main:[],extended:[],beyond:[],legacy:[],progress:[],created:[],published:[],verified:[],pointsComputed:num(p.bonus_points),hardest:null,hardestKind:null,hardestHistorical:false}]));
 const ensure=(name)=>{const resolved=resolvePlayer(name);const k=resolved?.player_key||key(name);if(!k)return null;if(isCreatorGroupCredit(name)&&!people.has(k))return null;if(!people.has(k))people.set(k,{player_key:k,username:name,display_name:name,country_code:'',has_account:false,hidden_from_stats:false,points:0,bonus_points:0,pointsComputed:0,total_records:0,total_completions:0,main:[],extended:[],beyond:[],legacy:[],progress:[],created:[],published:[],verified:[],hardest:null,hardestKind:null,hardestHistorical:false});return people.get(k);};
 for(const demon of demons){for(const [field,dest] of [['creator','created'],['publisher','published'],['verifier','verified']]){
   const names=field==='verifier'?[playersByLegacyId.get(num(demon.verifier_user_id))?.player_key||demon.verifier]:field==='creator'?[demon.creator,...plain(demon.creator_more).split(',')]:[demon[field]];
   for(const name of names){const player=ensure(name);if(player&&!player[dest].some(x=>x.id===demon.id))player[dest].push(demon);}
 }}
 for(const r of scoredRecords){const player=ensure(r.player),demon=byId[r.demon_id];if(!player||!demon)continue;
    player.total_records++;if(+r.progress>=100)player.total_completions++;
    const points=score(demon,r.progress),rankDemon=+demon.position<=+cfg().main_limit?'main':+demon.position<=+cfg().extended_limit?'extended':V2.nlwRank(demon)>0?'beyond':null;
    if(r.progress>=100){if(rankDemon)player[rankDemon].push(demon);}else player.progress.push({demon,progress:r.progress});
    if(V2.historicalLegacy(r,demon))player.legacy.push(demon);
    player.pointsComputed+=points;
    if(!completionScoreByPlayer.has(player.player_key))completionScoreByPlayer.set(player.player_key,new Map());
    completionScoreByPlayer.get(player.player_key).set(demon.id,points);
    if(r.progress>=100 && +demon.position>0 && (+demon.position<=cfg().extended_limit||V2.nlwRank(demon)>0) && (!player.hardest || +demon.position<+player.hardest.position)){player.hardest=demon;player.hardestKind=r.from_verification?'vérifié':'complété';player.hardestHistorical=false;}
 }
 // Comme dans le PHP original : vérification = points 100%, moins les points déjà obtenus sur ce niveau.
 for(const demon of demons){
  if(demon.position<1 || demon.position>cfg().extended_limit)continue;
  const byUserId=d.players.find(p=>num(p.legacy_id)>0 && num(p.legacy_id)===num(demon.verifier_user_id));
  const verifier=people.get(byUserId?.player_key||key(demon.verifier));
  // Les anciens profils non lies a Discord gardent leurs points de verification.
  // has_account controle uniquement la liaison du compte, jamais le score historique.
  if(!verifier)continue;
  const existing=completionScoreByPlayer.get(verifier.player_key)?.get(demon.id)||0;
  verifier.pointsComputed+=Math.max(0,score(demon,100)-existing);
  if(!verifier.hardest||+demon.position<+verifier.hardest.position){verifier.hardest=demon;verifier.hardestKind='vérifié';verifier.hardestHistorical=false;}
 }
 // Références de vérification du site historique : informatives et sans points.
 // Si une fiche d'import est encore masquée, son rang historique peut figurer sur le
 // profil mais ne devient pas automatiquement un rang DLFR publié.
 for(const old of historicLevels()){
   const pos=Number(old.old_position);if(!(pos>=1&&pos<=150))continue;
   const verifier=people.get(key(old.verifier));if(!verifier)continue;
   if(!verifier.hardest||pos<Number(verifier.hardest.position)){
     verifier.hardest={id:null,position:pos,name:old.name,legacy_id:old.legacy_id};
     verifier.hardestKind='vérifié';verifier.hardestHistorical=true;
   }
 }
 // Les crédits de création/publication ne suffisent pas à faire d’un auteur un joueur classé.
 // On consulte aussi le catalogue historique afin de traiter les anciennes fiches importées.
 const creatorCreditKeys=new Set();
 for(const level of [...demons,...historicLevels()]){
  for(const credit of [level.creator,level.publisher,...plain(level.creator_more).split(',')]){
   const identity=key(credit);if(identity)creatorCreditKeys.add(identity);
  }
 }
 const nlw=V2.project(d.players,d.demons,d.completions,state.unrated),extras=new Map(nlw.map(x=>[x.player_key,x]));
 const batchBadges=V2.badgesBatch([...people.values()],demons,d.completions);
 const clanByPlayer=new Map((d.clan_members||[]).map(c=>[c.player_key,c]));
 const result=[...people.values()].map(p=>{const n=extras.get(p.player_key);const nlwScore=n?.nlw_score||0;return {...p,score:(LIVE||state.unrated)?p.pointsComputed:num(p.points),nlwScore,nlwRank:n?.nlw_rank||null,creatorCreditOnly:creatorCreditKeys.has(p.player_key),autoBadges:batchBadges.get(p.player_key)||[],clan:clanByPlayer.get(p.player_key)};});
 result.sort((a,b)=>b.score-a.score||sortPlayerName(a).localeCompare(sortPlayerName(b),'fr'));
 let pos=0;for(const p of result)p.rank=statsPlayerVisible(p)?++pos:null;
 return (renderRankingCache=result);
}
function statsPlayerVisible(p){
 if(!p || p.hidden_from_stats)return false;
 // Un créateur/publiant sans victoire, sans vérification et sans points historiques
 // n'est pas un joueur classé. Les joueurs qui créent AUSSI des niveaux restent visibles.
 if(p.creatorCreditOnly && !(num(p.total_records)>0 || (p.verified||[]).length>0 || num(p.score)>0 || num(p.points)>0))return false;
 return true;
}
function getPlayer(value){return ranked().find(p=>p.player_key===key(value))||null;}
function hardestLabel(p){
 if(!p?.hardest)return 'Aucun';
 return `#${p.hardest.position} ${p.hardest.name}${p.hardestHistorical?' (rang historique · vérifié)':p.hardestKind==='vérifié'?' (vérifié)':''}`;
}
function archiveCardsHTML(rows){
 if(!rows.length)return '<div class="paper empty">Aucun niveau historique correspondant.</div>';
 return rows.map(d=>{
  const image=imageLink(d.thumbnail_url);
  return `<article class="paper list-entry"><a href="${url('archive',{id:d.legacy_id})}" data-nav>${image?`<img loading="lazy" class="demon-thumb" src="${esc(image)}" alt="Miniature ${esc(d.name)}">`:`<div class="demon-thumb faux-thumb">${esc(d.name)}</div>`}</a><div><h2><a href="${url('archive',{id:d.legacy_id})}" data-nav>Ancien #${esc(d.old_position)} — ${esc(d.name)}</a></h2><div class="entry-meta">Vérifié par <b>${esc(d.verifier||'Non renseigné')}</b></div><p class="muted small">Fiche historique · non homologuée NLW · barème indicatif ${fmt(V2.nlwPoints({position:Number(d.old_position)},100))} pt(s) à 100 % au rang ancien · non attribués</p></div></article>`;
 }).join('');
}
function archivePage(){
 const id=Number(new URLSearchParams(location.search).get('id'));
 const d=historicLevels().find(x=>Number(x.legacy_id)===id);
 if(!d)return '<div class="center-panel">Fiche historique introuvable.</div>';
 const outside=Number(d.old_position)>150;
 const all=(HISTORY.records||[]).filter(r=>Number(r.legacy_id)===id);
 const img=imageLink(d.thumbnail_url);
 return `<div class="paper"><p><a href="${url('list',{tab:'nlw'})}" data-nav class="link">← Retour à la NLW</a></p><h1>${esc(d.name)}</h1><p class="notice">${outside?'Hors Top 150':'Ancien Top 150'} · rang de l’ancien site : #${esc(d.old_position)}. Fiche d’archive (instantané du 14 octobre 2026), sans points officiels tant que la modération ne l’a pas publiée dans NLW.</p><div class="level-detail">${img?`<img class="demon-thumb" src="${esc(img)}" alt="Miniature ${esc(d.name)}">`:`<div class="demon-thumb faux-thumb">${esc(d.name)}</div>`}<div><p><b>GD ID :</b> ${esc(d.level_id||'—')}<br><b>Créateur :</b> ${esc(d.creator||'—')}<br><b>Publiant :</b> ${esc(d.publisher||'—')}<br><b>Vérificateur :</b> ${esc(d.verifier||'—')}<br><b>Minimum historique :</b> ${esc(d.requirement)}%</p>${http(d.video_url)?`<a class="btn" rel="noopener noreferrer" target="_blank" href="${esc(http(d.video_url))}">Vidéo historique ↗</a>`:''}</div></div><h2>Records de l’ancienne liste (${all.length})</h2>${all.length?all.map(r=>`<div class="record-row"><div><a class="link" data-nav href="${url('player',{player:key(r.player)})}">${esc(r.player)}</a> — ${esc(r.progress)}% <span class="muted small">(date d'enregistrement : ${esc(plain(r.recorded_at).slice(0,10)||'inconnue')})</span></div>${http(r.video_url)?`<a target="_blank" rel="noopener noreferrer" class="link" href="${esc(http(r.video_url))}">Preuve ↗</a>`:''}</div>`).join(''):'<p class="muted">Aucun record archivé dans cet instantané.</p>'}</div>`;
}
// V68 — priorité à une vérification reconnue dans la base (verifier_user_id).
// L'acceptation d'une revendication renseigne cet identifiant via la RPC
// dlfr_review_verification_claim. Sinon, pour la NLW, afficher le premier FR.
// On ne modifie jamais les données Supabase : seulement le crédit affiché.
function displayedLevelVerifier(d){
 const isValidCredit=value=>{
  const valueText=plain(value);
  return valueText&&!/^(?:à renseigner|a renseigner|non renseigné|non renseigne|inconnu|unknown|n\/?a|null|none|aredl|—|-)$/i.test(valueText);
 };
 const recordedVerifier=plain(d.verifier);
 if(V2.nlwRank(d)>0){
  // Une revendication acceptée lie le vérificateur à sa fiche joueur.
  // Un simple texte importé dans `verifier` n'atteste pas une revendication.
  const verifiedId=Number(d.verifier_user_id);
  if(Number.isSafeInteger(verifiedId)&&verifiedId>0){
   // Privilégier le crédit saisi par la modération, puis la fiche liée si le
   // texte public est encore un placeholder.
   if(isValidCredit(recordedVerifier))return recordedVerifier;
   const linked=(state.data?.players||[]).find(p=>Number(p.legacy_id)===verifiedId);
   const linkedName=sortPlayerName(linked);
   if(isValidCredit(linkedName))return linkedName;
  }
  const firstFrench=plain(d.first_fr_player);
  if(isValidCredit(firstFrench))return firstFrench;
 }
 return isValidCredit(recordedVerifier)?recordedVerifier:'À renseigner';
}
function cardsHTML(demons){if(!demons.length)return '<div class="paper empty">Aucun niveau dans cette catégorie.</div>';
 return demons.map(d=>{const p=num(d.position),req=+d.requirement||100,isRank=p<=cfg().extended_limit;
   const pills=`<div class="level-status">${p>150&&!d.legacy?`<span class="level-badge outside">NLW #${p-150}${d.unrated?' · simulé':' · '+fmt(nlwPoints(d))+' pts NLW'}</span>`:''}${d.legacy?'<span class="level-badge legacy">Legacy</span>':''}${d.unrated?'<span class="level-badge unrated-badge">UNRATED</span>':''}</div>`;
   const thumb=http(d.thumbnail_url)||((d.video_url||d.verifier_video_url)&&window.DLFR_NLW_MEDIA?.thumbnail(d.video_url||d.verifier_video_url))||'',image=thumb?`<img loading="lazy" class="demon-thumb" src="${esc(thumb)}" onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src=this.src.replace('/maxresdefault.jpg','/hqdefault.jpg')}else{this.style.display='none'}" alt="Miniature de ${esc(d.name)}">`:(String(d.thumbnail_url||'').startsWith('assets/')?`<img class="demon-thumb" src="${esc(d.thumbnail_url)}" alt="Miniature de ${esc(d.name)}">`:`<div class="demon-thumb faux-thumb">${esc(d.name)}</div>`);
   return `<article class="paper list-entry ${p<=75?'main-rank':''}"><a href="${url('demon',{id:d.id})}" data-nav>${image}</a><div><h2><a href="${url('demon',{id:d.id})}" data-nav style="text-decoration:none">${p<=150?'#'+p:p>150&&p<100000000?'NLW #'+(p-150):'Hors liste'} - ${esc(d.name)}</a></h2><div class="entry-meta">publié par <b>${esc(d.publisher&&d.publisher!=='AREDL'?d.publisher:'À renseigner')}</b>, vérifié par <b>${esc(displayedLevelVerifier(d))}</b></div><div class="points ${isRank?'':'no-points'}">${d.unrated?(isRank?`Simulation UNRATED · ${fmt(score(d,100))} points estimés`:'Simulation UNRATED · 0 point NLW officiel'):isRank?`${fmt(score(d,req))} (${req}%) — ${fmt(score(d,100))} (100%) points`:V2.nlwRank(d)>0?`NLW : ${fmt(nlwPoints(d))} points NLW (0 point principal)`:'Hors classement · 0 point'}</div>${(p>cfg().extended_limit||d.legacy||d.unrated)?pills:''}</div></article>`;
 }).join('');}
// Évite les doublons quand un niveau historique est publié en Main List OU en NLW.
// L'ID GD est prioritaire ; le nom ne sert que si une des deux fiches n'a pas d'ID.
function historicalArchiveWithoutPublishedLevels(archive, published){
 const active=published.filter(d=>{
  const p=Number(d.original_position ?? d.position);
  return d.is_public!==false&&!d.unrated&&!d.legacy&&Number.isSafeInteger(p)&&p>=1&&p<100000000;
 });
 const ids=new Set(active.map(d=>plain(d.level_id)).filter(Boolean));
 const allNames=new Set(active.map(d=>key(d.name)).filter(Boolean));
 const namesWithoutId=new Set(active.filter(d=>!plain(d.level_id)).map(d=>key(d.name)).filter(Boolean));
 return archive.filter(d=>{
  const id=plain(d.level_id),name=key(d.name);
  if(id)return !ids.has(id)&&!(name&&namesWithoutId.has(name));
  return !(name&&allNames.has(name));
 });
}
function nlwListCards(search=''){
 // Les UNRATED s'insèrent dans la NLW uniquement avec le toggle actif.
 const levels=catalog().filter(d=>d.is_public!==false&&!d.legacy&&Number(d.position)>150&&Number(d.position)<100000000);
 const q=key(search);
 const visible=levels.filter(d=>key(d.name).includes(q));
 const historical=historicalArchiveWithoutPublishedLevels(oldArchive(),catalog()).filter(d=>key(d.name).includes(q));
 if(!visible.length&&!historical.length)return '<div class="paper empty">Aucun niveau NLW correspondant.</div>';
 return `${visible.length?cardsHTML(visible):''}${historical.length?archiveCardsHTML(historical):''}`;
}
// V58 : seule la navigation Legacy est masquée ; les niveaux, records et archives restent en base.
// V58 — aperçu public des actualités sur la liste (brouillons exclus).
function listNewsSidebar(){
 const articles=(state.data.news_items||[]).filter(n=>n.is_published===true)
  .sort((a,b)=>Number(!!b.is_pinned)-Number(!!a.is_pinned)||new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,4);
 const cards=articles.map(n=>{
  const description=plain(n.body||'').replace(/\s+/g,' ').trim();
  const summary=description.length>135?description.slice(0,132).trimEnd()+'…':description;
  return `<article class="v58-news-item"><div class="v58-news-meta"><span class="v58-news-tag">${esc(getNewsCategory(n))}</span>${n.is_pinned?'<span class="v58-news-pinned">★ À la une</span>':''}</div><h3>${esc(n.headline||'Actualité')}</h3><time datetime="${esc(plain(n.created_at||''))}">${esc(date(n.created_at)||'')}</time>${summary?`<p>${esc(summary)}</p>`:''}</article>`;
 }).join('');
 return `<section class="info-panel right-panel v58-side-news" aria-labelledby="v58-news-title"><h2 id="v58-news-title">Actualités</h2><p class="v58-side-lead">Les dernières nouvelles de la Demonlist francophone.</p><div class="v58-side-news-list">${cards||'<p class="v58-no-news">Aucune actualité publiée pour le moment.</p>'}</div><a class="btn v58-side-all" href="${url('news')}" data-nav>Voir toutes les actualités <span aria-hidden="true">↗</span></a></section>`;
}
// Directives de soumission fournies par l'équipe, reprises intégralement.
function submissionGuidelinesSidebar(){
 const sections=[
  ['1. Compte et propriété',[
   'Vous devez être connecté avec votre propre compte joueur lors de la soumission.',
   'Ne soumettez pas de records au nom d’autres joueurs, sauf si un modérateur le demande explicitement.'
  ]],
  ['2. Exigences des preuves vidéo',[
   'Votre preuve doit être claire, non éditée et continue depuis le début de l’essai jusqu’à la mort/la complétion.',
   'La vidéo doit conserver l’audio original et ne doit pas masquer les informations critiques du gameplay.',
   'Pas de coupures, d’éditions de vitesse ou de falsification visuelle.',
   'Pas d’overlays qui cachent les transitions, les entrées ou le contexte de l’essai.',
   'La qualité vidéo doit être suffisamment élevée pour vérifier la légitimité du gameplay.'
  ]],
  ['3. Règles de légitimité',[
   'Tout run hacké, assisté par outils, boté, assisté par macros, noclip ou modifié est interdit.',
   'Les runs utilisant des mods modifiant le gameplay, des outils de replay ou des automatisations externes seront refusés.'
  ]],
  ['4. Exactitude des données de soumission',[
   'Choisissez le nom exact du démon et soumettez la progression réelle que vous avez atteinte.',
   'Une progression inférieure à l’exigence du démon est automatiquement invalide pour les records de la liste.',
   'Votre plateforme et votre taux de rafraîchissement doivent correspondre au run présenté dans la preuve.'
  ]],
  ['5. Vidéo brute et preuves supplémentaires',[
   'La vidéo brute est fortement recommandée pour les records difficiles et peut être exigée par les modérateurs.',
   'Si les preuves demandées ne sont pas fournies à temps, la soumission peut être rejetée.'
  ]],
  ['6. Résultats de l’examen',[
   '<strong>Approuvé :</strong> le record est ajouté à la liste publique.',
   '<strong>Rejeté :</strong> le record reste hors de la liste ; vous pouvez le resoumettre avec de meilleures preuves.',
   '<strong>Signalé :</strong> les modérateurs peuvent demander des clips supplémentaires, des fichiers bruts ou des éclaircissements.'
  ]],
  ['7. Abus et sanctions',[
   'Les soumissions frauduleuses, l’usurpation d’identité, le spam répété ou les preuves intentionnellement trompeuses peuvent entraîner des restrictions.'
  ]]
 ];
 return `<section class="info-panel right-panel v58-side-guidelines" aria-labelledby="v58-guidelines-title"><h2 id="v58-guidelines-title">Directives de soumission</h2><p class="v58-side-lead">Ces règles sont basées sur le standard de modération commun de Pointercrate.</p><p class="v58-guidelines-important"><strong>Important :</strong> Chaque soumission est examinée manuellement. L’absence de preuve ou une vidéo suspecte sera rejetée.</p><div class="v58-guideline-sections">${sections.map(([title,paragraphs])=>`<details class="v58-guideline"><summary>${esc(title)}</summary><div>${paragraphs.map(p=>`<p>${p.startsWith('<strong>')?p:esc(p)}</p>`).join('')}</div></details>`).join('')}</div><p class="v58-guidelines-tip"><strong>Astuce :</strong> Gardez la vidéo publique/non répertoriée et incluez des notes utiles sur le run. Des preuves plus claires signifient une approbation plus rapide.</p></section>`;
}
// V86 — Calendrier des défis et essais cosmétiques propriétaire. Les autorisations sont vérifiées côté SQL.
let v86Loading=0;
function v86AdminHTML(){
 if(state.staffRole!=='owner'||ownerPreviewActive())return '';
 const monday=new Date();const dow=(monday.getUTCDay()+6)%7;monday.setUTCDate(monday.getUTCDate()-dow);const week=monday.toISOString().slice(0,10);
 return `<section class="paper v86-owner" id="v86-owner"><h2>📅 Défis hebdomadaires</h2><p class="muted small">Programme plusieurs semaines à l'avance. La publication est automatique chaque lundi à 00:00 UTC.</p>
 <form data-form="v86Weekly" class="v86-weekly-form"><label class="field">Semaine (lundi UTC)<input name="week_start" type="date" required value="${week}"></label><label class="field">Niveau<select name="demon_id" required><option value="">Choisir un niveau public</option>${(state.data?.demons||[]).filter(d=>d.is_public!==false).sort((a,b)=>String(a.name).localeCompare(String(b.name),'fr')).map(d=>`<option value="${esc(d.id)}">${esc(d.name)} · #${esc(d.position)}</option>`).join('')}</select></label><label class="field">Wayllings dorés<input type="number" name="reward" min="1" max="500" value="50" required></label><button class="btn" type="submit">Ajouter / modifier la semaine</button></form>
 <div id="v86-schedule"><p class="small muted">Chargement du calendrier…</p></div><h2>🧪 Essais de la boutique</h2><p class="small muted">Accès de test réservé à ton compte. Aucun achat ni dépense : tu peux essayer les objets depuis la boutique et retirer leurs accès ici.</p><div id="v86-cosmetics"><p class="small muted">Chargement des objets…</p></div><h3>🛍️ Aperçu direct de la boutique</h3><p class="small muted">Après avoir activé un essai, utilise « Équiper » ici. Aucun achat nécessaire.</p><div id="v81-rewards" class="v81-rewards" aria-live="polite">Chargement de la boutique…</div></section>`;
}
async function v86AdminLoad(){
 const host=document.getElementById('v86-owner');if(!host||!db)return;
 const seq=++v86Loading;
 try{
  const {data,error}=await db.rpc('dlfr_owner_rewards_panel');if(error)throw error;
  if(seq!==v86Loading||!host.isConnected)return;
  const schedule=document.getElementById('v86-schedule');const items=document.getElementById('v86-cosmetics');const rows=data.weeks||[];
  schedule.innerHTML=`<h3>Calendrier programmé</h3>${rows.length?`<div class="v86-rows">${rows.map(w=>`<div class="v86-row"><div><b>${esc(w.week_start)}</b> · ${esc(w.name)} <span class="muted small">+${wayllingLabel(w.reward)} ${w.locked?'· récompenses distribuées':''}</span></div>${!w.locked?`<button type="button" class="btn subtle small" data-v86-delete="${esc(w.week_start)}">Retirer</button>`:'<span class="muted small">Verrouillé</span>'}</div>`).join('')}</div>`:'<p class="muted small">Aucun défi programmé.</p>'}`;
  items.innerHTML=`<div class="v86-rows">${(data.items||[]).map(i=>`<div class="v86-row"><div>${esc(i.emoji)} <b>${esc(i.label)}</b> <span class="muted small">${i.purchased?'· acheté':''}${i.testing?' · test actif':''}</span></div>${!i.purchased?`<button type="button" class="btn small ${i.testing?'subtle':''}" data-v86-test="${esc(i.item_key)}" data-v86-enable="${i.testing?'false':'true'}">${i.testing?'Retirer le test':'Essayer gratuitement'}</button>`:'<span class="muted small">Déjà possédé</span>'}</div>`).join('')}</div>`;
 }catch(err){if(host.isConnected)host.querySelector('#v86-schedule').textContent='Erreur de chargement : '+err.message;}
}
// V80 : défi hebdomadaire indépendant des points DLFR.
let v80WeeklyLoad=0;
async function v80WeeklyRender(){
 const area=document.getElementById('v80-weekly');if(!area||!db)return;
 const seq=++v80WeeklyLoad;
 try{
  const {data,error}=await db.rpc('dlfr_weekly_status');
  if(error)throw error;
  if(seq!==v80WeeklyLoad||!area.isConnected)return;
  if(!data?.active){area.innerHTML='<span class="muted small">Aucun défi hebdomadaire publié pour cette semaine.</span>';return;}
  const challenge=data.challenge||{};
  const claimed=!!data.claimed,eligible=!!data.eligible;
  area.innerHTML=`<div class="v80-weekly-title"><span>✦ Défi de la semaine</span><span class="v80-wallet">🪙 ${esc(data.wallet??0)} pièces</span></div>
  <p><a data-nav href="${url('demon',{id:challenge.demon_id})}"><strong>${esc(challenge.name||'Niveau hebdomadaire')}</strong></a> <span class="muted small">· +${wayllingLabel(challenge.reward||50)}</span></p>
  <p class="small muted">Complète le niveau à 100 % pendant la semaine du défi, puis réclame ta récompense. Les points DLFR ne changent pas.</p>
  ${claimed?'<span class="v80-weekly-done">✓ Récompense récupérée</span>':eligible?'<button type="button" class="btn small" data-v80-claim>Récupérer mes pièces</button>':state.session?'<span class="small muted">En attente d’une complétion validée cette semaine.</span>':'<span class="small muted">Connecte-toi pour participer.</span>'}`;
 }catch(err){if(seq===v80WeeklyLoad&&area.isConnected){area.innerHTML='<span class="muted small">Défis indisponibles : la migration V80 est-elle installée ?</span>';}}
}
// V81 : boutique cosmétique, monnaie et équipement, sans toucher aux points DLFR.
const wayllingLabel=n=>`${esc(n??0)} waylling${Number(n)>1?'s':''} doré${Number(n)>1?'s':''}`;

let v81Request=0;
async function v81RewardsRender(){
 const area=document.getElementById('v81-rewards');if(!area||!db)return;
 const seq=++v81Request;
 try{
  const [sr,cr]=await Promise.all([db.rpc('dlfr_rewards_status'),db.from('dlfr_reward_catalog').select('item_key,label,description,emoji,category,price').eq('active',true).order('price')]);
  if(sr.error)throw sr.error;if(cr.error)throw cr.error;
  if(seq!==v81Request||!area.isConnected)return;
  const status=sr.data||{},owns=new Set(status.inventory||[]),equip=status.equipped||{};
  v96ApplyHalloweenStatus(status);
  area.innerHTML=`<div class="v81-header"><b>✦ DLFR Rewards</b><span>✦ ${wayllingLabel(status.balance??0)} · 🔥 ${esc(status.streak??0)} semaine(s) de série</span></div>
  <details class="v81-shop" ${document.getElementById('v86-owner')?'open':''}><summary>🛍️ Boutique et collection ${status.signed_in?'':'· connexion requise'}</summary><div class="v81-items">${(cr.data||[]).map(item=>{
   const trial=(status.test_inventory||[]).includes(item.item_key),owned=owns.has(item.item_key)||trial,equipped=equip[item.category]===item.item_key;
   const showDesc=item.category==='badge';
   const desc=showDesc?esc(item.description||'Badge cosmétique à exposer sur ton profil.'):'';
   return `<div class="v81-item v90-shop-item v90-item-${esc(item.item_key)}"><span class="v90-swatch" aria-hidden="true"></span><div class="v81-item-title">${esc(item.emoji)} <strong>${esc(item.label)}</strong>${trial?'<span class="muted small"> · essai propriétaire</span>':''}</div>${showDesc?`<small>${desc}</small>`:''}<div class="v81-item-action"><span>✦ ${wayllingLabel(item.price)}</span>${status.signed_in?(owned?`<button type="button" class="btn small subtle" data-v81-equip="${esc(item.item_key)}" data-v81-category="${esc(item.category)}">${equipped?'✓ Équipé':'Équiper'}</button>`:`<button type="button" class="btn small" data-v81-buy="${esc(item.item_key)}" ${Number(status.balance)<Number(item.price)?'disabled':''}>Acheter</button>`):'<span class="muted small">Se connecter</span>'}</div></div>`;
  }).join('')}</div></details>`;
 }catch(err){if(seq===v81Request&&area.isConnected)area.innerHTML='<span class="small muted">Boutique indisponible : '+esc(err.message||'Erreur Supabase')+'</span>';}
}
// V90 — effets animés des récompenses (profil, aperçu Statistiques, classement). Purement visuel.
const V90_PRESTIGE=new Set(['frame_amethyst_crown','frame_celestial','banner_bloodmoon','banner_voidwalker','frame_glitch','banner_glitch']);
const V90_FX={items:{},t:0,loading:false};
function v90Safe(items){return (Array.isArray(items)?items:[]).filter(x=>/^[a-z0-9_]+$/.test(String(x?.item_key||'')));}
function v90Cls(items){
 const list=v90Safe(items);if(!list.length)return '';
 const tiers=list.filter(x=>V90_PRESTIGE.has(x.item_key)).map(x=>[1,2,3].includes(Number(x.tier))?Number(x.tier):1);
 const c=['v90-fx','v90-t'+(tiers.length?Math.max(...tiers):1),...list.map(x=>'v90-has-'+x.item_key)];
 if(list.some(x=>x.item_key.startsWith('frame_')))c.push('v90-hasframe');
 return c.join(' ');
}
function v90LayerHTML(items){
 const list=v90Safe(items);if(!list.length)return '';
 const keys=new Set(list.map(x=>x.item_key));
 const n=keys.has('banner_voidwalker')||keys.has('banner_night')||keys.has('banner_glitch')?18:14;
 let parts='';
 for(let i=0;i<n;i++)parts+=`<i style="--x:${(i*53+7)%96}%;--y:${(i*29+13)%88}%;--s:${2+(i*7)%4}px;--d:${(3.2+((i*13)%40)/10).toFixed(1)}s;--l:${(((-(i*7))%50)/10).toFixed(1)}s;--dx:${(i%2?1:-1)*(6+(i*5)%22)}px"></i>`;
 return `<div class="v90-fx-layer" aria-hidden="true"><span class="v90-glow"></span><b class="v90-core"></b>${parts}</div>`;
}
function v90Emojis(items){return v90Safe(items).map(x=>esc(x.emoji||'')).join('');}
function v90Fx(card,badges){
 if(!card)return;
 [...card.classList].filter(c=>c.startsWith('v90-')).forEach(c=>card.classList.remove(c));
 card.querySelectorAll('.v90-fx-layer').forEach(n=>n.remove());
 if(!v90Safe(badges).length)return;
 const cls=v90Cls(badges);card.classList.add(...cls.split(' '));
 const hero=card.querySelector('.profile-hero');if(!hero)return;
 hero.classList.add('v90-hero');
 const nm=hero.querySelector('.profile-hero-copy strong');if(nm)nm.classList.add('v90-name');
 hero.insertAdjacentHTML('beforeend',v90LayerHTML(badges));
}
// Charge, une seule fois par minute, les objets équipés de tous les joueurs (1 appel RPC).
async function v90LoadFx(){
 if(!db||V90_FX.loading||Date.now()-V90_FX.t<60000)return;
 V90_FX.loading=true;
 try{
  const {data,error}=await db.rpc('dlfr_rewards_public_bulk');
  if(error)throw error;
  const next=data&&typeof data==='object'?data:{};
  const changed=JSON.stringify(next)!==JSON.stringify(V90_FX.items);
  V90_FX.items=next;V90_FX.t=Date.now();
  const page=new URLSearchParams(location.search).get('page')||'list';
  if(changed&&(page==='stats'||page==='players'))render();
 }catch(e){V90_FX.t=Date.now();}finally{V90_FX.loading=false;}
}
// Reflet + parallaxe qui suivent la souris au-dessus des bannières animées.
if(!window.__v90Pointer){window.__v90Pointer=true;let raf=0;
 document.addEventListener('pointermove',ev=>{
  const hero=ev.target.closest&&ev.target.closest('.v90-hero');if(!hero||raf)return;
  raf=requestAnimationFrame(()=>{raf=0;const r=hero.getBoundingClientRect();if(!r.width)return;
   const x=(ev.clientX-r.left)/r.width,y=(ev.clientY-r.top)/r.height;
   hero.style.setProperty('--mx',(x*100).toFixed(1)+'%');hero.style.setProperty('--my',(y*100).toFixed(1)+'%');
   hero.style.setProperty('--px',(x*2-1).toFixed(2));hero.style.setProperty('--py',(y*2-1).toFixed(2));});
 },{passive:true});}
async function v81ProfileRewards(){
 const area=document.getElementById('v81-profile-rewards');if(!area||!db)return;
 const k=area.dataset.playerKey;
 try{
  const {data,error}=await db.rpc('dlfr_rewards_public',{p_player_key:k});if(error)throw error;
  if(!area.isConnected||area.dataset.playerKey!==k)return;
  const badges=Array.isArray(data)?data:[];
  const prestige=V90_PRESTIGE;
  const card=area.closest('.stats-profile'),community=area.closest('.dlfr20-community');
  const classes=['v85-profile-moon','v85-profile-void','v89-effect-amethyst','v89-effect-celestial','v89-effect-bloodmoon','v89-effect-voidwalker','v89-effect-glitch','v89-effect-glitch-frame','v89-effect-glitch-banner'];
  area.classList.remove(...classes);
  card&&card.classList.remove(...classes);
  community&&community.classList.remove(...classes);
  const primary=(['banner_glitch','banner_voidwalker','banner_bloodmoon','frame_glitch','frame_celestial','frame_amethyst_crown'].map(key=>badges.find(x=>x.item_key===key)).find(Boolean))||null;
  const effectClass=primary?({banner_glitch:'v89-effect-glitch-banner',frame_glitch:'v89-effect-glitch-frame',banner_voidwalker:'v89-effect-voidwalker',banner_bloodmoon:'v89-effect-bloodmoon',frame_celestial:'v89-effect-celestial',frame_amethyst_crown:'v89-effect-amethyst'}[primary.item_key]||''):'';
  if(effectClass){area.classList.add(effectClass);card&&card.classList.add(effectClass);community&&community.classList.add(effectClass);}
  if(badges.some(x=>x.item_key==='banner_bloodmoon'))area.classList.add('v85-profile-moon');
  if(badges.some(x=>x.item_key==='banner_voidwalker'))area.classList.add('v85-profile-void');
  v90Fx(card||community,badges);
  const tierLabel=x=>prestige.has(x.item_key)?esc(x.tier_label||'I'):'Collection';
  const tierNum=x=>[1,2,3].includes(Number(x.tier))?Number(x.tier):1;
  const highlight=primary?`<div class="v89-reward-stage v89-stage-${esc(primary.item_key)} v89-tier-${tierNum(primary)}"><div class="v89-reward-stage-visual" aria-hidden="true"><span class="v89-orb v89-orb-a"></span><span class="v89-orb v89-orb-b"></span><span class="v89-orb v89-orb-c"></span></div><div class="v89-reward-stage-copy"><span class="kicker">Effet principal actif</span><strong>${esc(primary.emoji)} ${esc(primary.label)}</strong><p>${esc(primary.description||'Récompense cosmétique premium équipée sur la carte du joueur.')}</p><small>${prestige.has(primary.item_key)?`Palier ${esc(primary.tier_label||'I')}`:'Actif'} · Effets visuels appliqués à la fiche du joueur</small>${prestige.has(primary.item_key)?`<div class="v90-tier-pips" data-t="${tierNum(primary)}"><i></i><i></i><i></i></div><div class="v90-tier-hint">${tierNum(primary)>=3?'Palier maximal atteint':tierNum(primary)===2?'Palier III à 8 défis réclamés':'Palier II à 3 défis réclamés'}</div>`:''}</div></div>`:'';
  area.innerHTML=badges.length?`<div class="v81-profile-picks v85-profile-picks v89-profile-picks"><div class="row-between"><b>✦ Récompenses exposées</b><span class="small muted">${badges.length} équipée(s)</span></div>${highlight}<div class="v89-reward-grid">${badges.map(x=>`<span class="v81-profile-pick v89-reward-chip ${prestige.has(x.item_key)?'v85-prestige':''} v89-${esc(x.item_key)} v85-tier-${tierNum(x)}" data-type="${esc(x.category)}"><span class="v89-chip-emoji">${esc(x.emoji)}</span><span><b>${esc(x.label)}</b><small>${tierLabel(x)}</small></span></span>`).join('')}</div></div>`:'';
 }catch(err){console.warn('[DLFR] Récompenses du profil indisponibles',err);if(area.isConnected)area.innerHTML='<p class="small muted">Impossible de charger les effets de profil pour le moment.</p>';}
}
function listPage(){
 const nav=['main','nlw'],labels=['Main List · Top 150','NLW · rang 151+'];
 const sLabel=nav.includes(state.list)?state.list:'main';
 const levels=catalog().filter(x=>sLabel==='legacy'?x.legacy:sLabel==='nlw'?V2.nlwRank(x)>0:(state.unrated||!x.unrated)&&+x.position>0&&+x.position<=150);
 const top=`<div class="list-tabs">${nav.map((x,i)=>`<button type="button" class="${sLabel===x?'active':''}" data-list="${x}">${esc(labels[i])}</button>`).join('')}</div>${sLabel==='main'?'<div class="v2-legend"><span class="hist-main">Main List · #1–75</span><span>Extended List · #76–150</span></div>':''}`;
 const heading={main:'Geometry Dash Demonlist',nlw:'NLW · Non List Worthy',legacy:'Legacy List'}[sLabel];
 const description={main:'Les 150 niveaux classés de la DemonlistFrancophone.',nlw:'Les niveaux NLW publiés et les archives historiques. En activant UNRATED, les niveaux non homologués s’insèrent aux rangs simulés et décalent les suivants, sans modifier les positions officielles.',legacy:'Anciens niveaux de la Main List, après validation de leur statut Legacy.'}[sLabel];
 const html=sLabel==='nlw'?nlwListCards(state.keyword):cardsHTML(levels.filter(x=>key(x.name).includes(key(state.keyword))));
 return `${templateNotice()}${state.unrated?callout('<b>Mode UNRATED</b> — estimation alternative des positions et points, sans modifier le classement officiel.'):''}${top}<div id="v80-weekly" class="v80-weekly" aria-live="polite"><span class="muted small">Chargement du défi hebdomadaire…</span></div><div id="v81-rewards" class="v81-rewards" aria-live="polite">Chargement des récompenses…</div><div class="page-columns"><section><div class="center-panel"><h1>${heading}</h1><p>${description}</p><label class="filterbox"><span>⌕</span><input id="demonSearch" type="search" placeholder="Filtrer les niveaux affichés..." value="${esc(state.keyword)}" autocomplete="off"></label></div><div id="demonItems">${html}</div></section><aside class="right-side"><div class="info-panel right-panel"><h2>Éditeurs de liste</h2><p>Contacter les éditeurs pour les changements de classement.</p>${staffNamesHTML("general")}<h2>Équipe NLW</h2><p>L’équipe chargée de la liste NLW.</p>${staffNamesHTML("nlw")}</div>${listNewsSidebar()}${submissionGuidelinesSidebar()}</aside></div>`;
}
function completionLinks(levels){return levels.length?levels.sort((a,b)=>a.position-b.position).map(d=>`<a class="link" href="${url('demon',{id:d.id})}" data-nav>#${esc(d.position)} ${esc(d.name)}</a>`).join(' - '):'<span class="muted">Aucun</span>';}
// V66 : le classement NLW commence à #1 pour la position globale 151.
function nlwCompletionLinks(levels){return levels.length?levels.map(d=>`<a class="link" href="${url('demon',{id:d.id})}" data-nav>NLW #${esc(V2.nlwRank(d))} ${esc(d.name)}</a>`).join(' - '):'<span class="muted">Aucun</span>';}
function titleHTML(p){return BADGES.gallery(state.data,p.player_key,esc,date);}

const fullName=p=>p?.display_name||p?.username||p?.player_key||'?';
// La catégorie est une décision de l'éditeur, jamais une déduction à partir du titre.
const getNewsCategory=n=>['Annonce','Record','Classement','Communauté'].find(c=>key(c)===key(n?.category))||'Annonce';
const yearsFromRecords=()=>[...new Set((state.data.completions||[]).map(r=>plain(r.created_at).slice(0,4)).filter(y=>/^\d{4}$/.test(y)))].sort().reverse();
function countCommunityRecords(start,end){const positions=new Map(catalog().map(d=>[Number(d.id),Number(d.position)]));const seen=new Set();for(const r of state.data.completions||[]){const pos=positions.get(Number(r.demon_id));if(+r.progress!==100||pos<start||pos>end)continue;seen.add(key(r.player)+'|'+r.demon_id);}return seen.size;}
function statsOverview(){
 const people=ranked().filter(statsPlayerVisible);
 const all=state.data.demons||[];const records=state.data.completions||[];
 return `<div class="overview-stats">${box('Joueurs classés',people.filter(p=>p.score>0).length)}${box('Niveaux suivis',all.length)}${box('MAIN LIST · #1–75',countCommunityRecords(1,75))}${box('EXTENDED LIST · #76–150',countCommunityRecords(76,150))}${box('NLW publiés',catalog().filter(d=>V2.nlwRank(d)>0).length)}</div>`;
}
function countryRows(){const by=new Map();for(const p of ranked().filter(statsPlayerVisible)){
 const code=p.country_code||'??'; if(!by.has(code))by.set(code,{code,score:0,players:0,records:0,leader:p});
 const a=by.get(code);a.score+=p.score;a.players++;a.records+=p.total_completions;if(p.score>a.leader.score)a.leader=p;
}return [...by.values()].sort((a,b)=>b.score-a.score);}
function graphRank(data){if(!data.length)return '<p class="empty small">Pas encore d’instantanés : vérifier GitHub Actions → Historique journalier Demonlist.</p>';
 const d=data.map(x=>({day:x.snapshot_day, rank:+(x.rank_position??x.rank??0)})).filter(x=>x.rank>0);if(!d.length)return '<p class="empty small">Aucun rang dans les instantanés enregistrés.</p>';if(d.length===1)return `<div class="chart-box"><p class="small">📍 Premier relevé : <b>#${d[0].rank}</b> · ${esc(d[0].day)}</p><p class="small muted">Le tracé apparaîtra au prochain relevé.</p></div>`;
 const min=Math.min(...d.map(x=>x.rank)),max=Math.max(...d.map(x=>x.rank)),gap=Math.max(1,max-min);
 const coords=d.map((x,i)=>[28+i*478/(d.length-1),25+(x.rank-min)/gap*108]);
 return `<div class="chart-box"><svg viewBox="0 0 540 160" role="img" aria-label="Historique du rang, rang 1 en haut"><path d="M25 25V136H510" fill="none" stroke="#8ca5b9"/><path d="${coords.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')}" fill="none" stroke="#9362be" stroke-width="3"/>${coords.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="4" fill="#9362be"><title>${esc(d[i].day)} : #${d[i].rank}</title></circle>`).join('')}<text x="29" y="17" fill="currentColor" font-size="11">Meilleur : #${min}</text><text x="360" y="155" fill="currentColor" font-size="10">${esc(d.at(-1).day)}</text></svg></div>`;
}
function recordTable(p){const byId=new Map(catalog().map(d=>[+d.id,d]));const year=state.statsYear;
 const rows=state.data.completions.filter(c=>key(c.player)===p.player_key&&byId.get(+c.demon_id)?.position<=150&&!byId.get(+c.demon_id)?.legacy&&(year==='all'||plain(c.created_at).slice(0,4)===year)).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
 return `<div class="profile-section"><div class="row-between"><h3>Records (${rows.length})</h3><label class="small">Année <select id="recordsYear"><option value="all">Toutes</option>${yearsFromRecords().map(y=>`<option value="${y}" ${year===y?'selected':''}>${y}</option>`).join('')}</select></label></div><div class="record-table-wrap"><table class="record-table"><thead><tr><th>Niveau</th><th>Liste</th><th>Progression</th><th>Date</th><th>Preuve</th></tr></thead><tbody>${rows.map(r=>{const d=byId.get(+r.demon_id);const group=!d?'—':+d.position>150?'NLW':+d.position<=75?'Main List':'Extended List';return `<tr><td>${d?`<a class="link" href="${url('demon',{id:d.id})}" data-nav>${esc(d.name)}</a>`:'—'}</td><td>${esc(group)}</td><td><b>${esc(r.progress)}%</b></td><td>${date(r.created_at)||'—'}</td><td>${http(r.video_url)?`<a href="${esc(http(r.video_url))}" target="_blank" rel="noopener noreferrer">Vidéo ↗</a>`:'—'}</td></tr>`;}).join('')||'<tr><td colspan="5" class="empty">Aucun record pour cette période.</td></tr>'}</tbody></table></div></div>`;
}
function discordPanel(actor, profile={}) {
  const identity=discordIdentity();
  const connected=identity?.connected;
  const avatar=connected?DISCORD.allowedDiscordImage(identity.avatar_url):'';
  if (LIVE) {
    if (!C.enableDiscordOAuth) return `<section class="discord-panel"><div class="discord-panel-head"><span class="discord-glyph">◈</span><div><h2>Discord</h2><p>La connexion Discord n’est pas disponible pour le moment.</p></div></div><p class="small muted">Réessaie un peu plus tard.</p></section>`;
    return `<section class="discord-panel"><div class="discord-panel-head"><span class="discord-glyph">◈</span><div><h2>${connected?'Discord connecté':'Connecter Discord'}</h2><p>${connected?esc(identity.username):'Utilise ton compte Discord pour te connecter ou associer cette identité.'}</p></div>${avatar?`<img class="discord-avatar" src="${esc(avatar)}" alt="Avatar Discord">`:''}</div>
     ${!state.session?'<button type="button" class="btn discord-button" data-action="discordOAuthLogin">Se connecter avec Discord</button>':connected?`<p class="small muted">Ton avatar Discord peut être copié dans ton profil sans remplacer automatiquement ton avatar personnalisé.</p>${state.ownKey?'<button type="button" class="btn subtle small" data-action="discordRefreshAvatar">Actualiser ma photo depuis Discord</button>':''}${state.ownKey&&avatar?'<button type="button" class="btn subtle small" data-action="discordUseAvatar">Copier la photo actuellement connue</button>':''}`:'<p class="small muted">Tu peux associer Discord dans « Mes méthodes de connexion » ci-dessus.</p>'}
     <p class="discord-disclaimer">L'identité Discord ne prouve pas, à elle seule, la propriété d'un profil Geometry Dash. La liaison au joueur doit être approuvée et protégée par RLS.</p></section>`;
  }

}
function communitySelfFields(actor){
 if(!state.communityReady)return '<div class="notice warning">La personnalisation avancée n’est pas disponible pour le moment.</div>';
 const pref=(state.data.dlfr_profile_preferences||[]).find(x=>x.player_key===actor)||{};
 const badges=COMMUNITY.ownedBadges(state.data,actor,BADGES),chosen=new Set(pref.featured_badges||[]);
 const titles=COMMUNITY.ownedTitles(state.data,actor),items=COMMUNITY.showcase(state.data,actor);
 const demons=(state.data.demons||[]).filter(x=>x.is_public!==false).sort((a,b)=>Number(a.position)-Number(b.position));
 const opts=demons.map(d=>`<option value="${esc(d.id)}">${Number(d.position)>150?'NLW #'+esc(Number(d.position)-150):'#'+esc(d.position)} — ${esc(d.name)}</option>`).join('');
 return `<fieldset class="dlfr20-fieldset"><legend>✦ Personnalisation & vitrines</legend>
  <p class="small muted">Ces éléments apparaîtront sur ta fiche publique. Les titres et les badges doivent déjà avoir été obtenus.</p>
  <label class="field">Couleur d'accent de mon profil<input type="color" name="accent_color" value="${esc(COMMUNITY.hex(pref.accent_color))}"></label>
  <label class="field">Titre officiel mis en avant<select name="featured_title_id"><option value="">Aucun titre mis en avant</option>${titles.map(t=>`<option value="${esc(t.id)}" ${String(pref.featured_title_id)===String(t.id)?'selected':''}>${esc(t.label)}</option>`).join('')}</select></label>
  <div class="field"><b>Mes badges favoris (3 maximum)</b>${badges.length?`<div class="dlfr20-badge-picker">${badges.map(x=>`<label><input type="checkbox" name="featured_badges" value="${esc(x.id)}" ${chosen.has(x.id)?'checked':''}> ${esc(x.def.symbol)} ${esc(x.def.label)}</label>`).join('')}</div>`:'<p class="muted small">Tu pourras sélectionner des badges dès que tu en possèderas.</p>'}</div>
  <h3>Ma vitrine de niveaux</h3><p class="muted small">Choisis jusqu'à trois niveaux, ajoute une description et, si tu le souhaites, un lien vers ta vidéo.</p>
  <div class="dlfr20-showcase-edit">${[1,2,3].map(slot=>{const x=items.find(z=>Number(z.slot)===slot)||{};return `<div class="dlfr20-showcase-slot"><b>Emplacement ${slot}</b><label class="field">Niveau<select name="showcase_demon_${slot}"><option value="">Aucun niveau</option>${opts.replaceAll(`value="${esc(x.demon_id)}"`,`value="${esc(x.demon_id)}" selected`)}</select></label><label class="field">Description (180 caractères)<input name="showcase_caption_${slot}" maxlength="180" value="${esc(x.caption||'')}" placeholder="Pourquoi ce niveau est spécial pour moi…"></label><label class="field">Ma vidéo (URL HTTPS)<input type="url" name="showcase_video_${slot}" maxlength="500" placeholder="https://youtu.be/…" value="${esc(x.video_url||'')}"></label></div>`;}).join('')}</div>
 </fieldset>`;
}
function usernameLoginForm(){
 if(C.enableUsernameLogin!==true)return '<p class="notice warning">La connexion par pseudo n’est pas encore disponible.</p>';
 return `<form data-form="usernameLogin" class="dlfr29-auth-card"><h3>Connexion DLFR</h3><p class="small muted">Ancien joueur ? Utilise « Se connecter » avec ton ancien pseudo et ton ancien mot de passe, même court. Ne recrée pas de compte si tu en avais déjà un.</p><label class="field">Pseudo<input name="username" autocomplete="username" minlength="3" maxlength="24" pattern="(?:[A-Za-z0-9_]|-){3,24}" required></label><label class="field">Mot de passe<input name="password" type="password" minlength="1" maxlength="128" autocomplete="current-password" required></label><details><summary>Migration : choisir un nouveau mot de passe</summary><p class="small muted">Essaie d’abord ton ancien mot de passe, quelle que soit sa longueur. Si Supabase le refuse, reviens ici choisir un nouveau mot de passe. Aucun changement n’est nécessaire si la connexion fonctionne.</p><label class="field">Nouveau mot de passe<input name="new_password" type="password" minlength="8" maxlength="128" autocomplete="new-password"></label><label class="field">Confirmer le nouveau mot de passe<input name="new_password_confirm" type="password" minlength="8" maxlength="128" autocomplete="new-password"></label></details><button class="btn" type="submit">Se connecter</button></form>`;
}
function linkedAccountsPanel(){
 if(!LIVE||!state.session)return '';
 const discord=discordIdentity(),username=state.usernameAccount;
 const status=state.usernameAccountError?`<p class="notice warning">${esc(state.usernameAccountError)}</p>`:'';
 const creator=C.enableUsernameLogin===true&&!username&&!!discord;
 return `<section class="paper self-linked-accounts"><h2>🔗 Mes méthodes de connexion</h2><p class="small muted">Discord et le pseudo peuvent ouvrir le même compte, sans dupliquer tes records ou tes badges.</p><p><b>Pseudo :</b> ${username?esc(username):'Pas encore configuré'} · <b>Discord :</b> ${discord?'Connecté':'Non associé'}</p>${status}
 ${creator?`<form data-form="attachUsername" class="dlfr29-auth-card"><h3>Ajouter un pseudo et un mot de passe à mon compte Discord</h3><label class="field">Pseudo de connexion<input name="username" autocomplete="username" pattern="(?:[A-Za-z0-9_]|-){3,24}" minlength="3" maxlength="24" required></label><label class="field">Mot de passe<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label class="field">Confirmer le mot de passe<input name="password_confirm" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><p class="muted small">Le pseudo sert uniquement à te connecter et ne change pas le pseudo de ta fiche Geometry Dash. Pour la sécurité, reconnecte-toi à Discord juste avant cette opération.</p><button class="btn" type="submit">Activer la connexion par pseudo</button></form>`:''}
 ${username&&!discord&&C.enableDiscordOAuth===true?'<button type="button" class="btn discord-button" data-action="discordIdentityLink">Associer mon Discord</button>':''}
 ${username&&discord?'<p class="notice">Les deux connexions sont associées à ce compte DLFR.</p>':''}
 ${username&&!discord?'<p class="muted small">Si Discord appartient déjà à un autre compte DLFR, la liaison sera refusée. Contacte l’équipe pour vérifier les deux comptes.</p>':''}
 ${username?`<details class="account-management"><summary>Modifier mon pseudo de connexion</summary><form data-form="renameUsername" class="dlfr29-auth-card"><label class="field">Nouveau pseudo<input name="username" value="${esc(username)}" autocomplete="username" pattern="(?:[A-Za-z0-9_]|-){3,24}" minlength="3" maxlength="24" required></label><button class="btn" type="submit">Enregistrer le nouveau pseudo</button><p class="small muted">Cela change uniquement le pseudo utilisé pour te connecter, pas ta fiche Geometry Dash.</p></form></details>`:''}
 <details class="account-management account-danger"><summary>Supprimer mon compte DLFR</summary><form data-form="deleteAccount" class="dlfr29-auth-card"><p class="small muted">Cette action est définitive : tu seras déconnecté·e et tu ne pourras plus utiliser ce compte. Les records et badges publics déjà associés à ta fiche joueur ne sont pas automatiquement effacés.</p>${username?'<label class="field">Mot de passe actuel<input name="password" type="password" autocomplete="current-password" required></label>':''}<label class="field">Pour confirmer, écris SUPPRIMER<input name="confirmation" autocomplete="off" placeholder="SUPPRIMER" pattern="SUPPRIMER" required></label><button class="btn danger" type="submit">Supprimer définitivement mon compte</button></form></details>
 </section>`;
}
function mergeRequestStatus(status){return status==='accepted'?'Acceptée':status==='rejected'?'Refusée':'En attente';}
function playerMergeRequestPanel(){
 if(!LIVE||!state.session||!state.ownKey)return '';
 const target=(state.data.players||[]).find(p=>p.player_key===state.ownKey);
 if(!target)return '';
 const mine=(state.mergeRequests||[]).filter(r=>r.target_key===state.ownKey);
 const pending=mine.some(r=>r.status==='pending');
 const choices=(state.mergeRequestCandidates||[]).filter(p=>p.player_key!==state.ownKey);
 const preview=choices.slice(0,35);
 return `<section class="paper dlfr-merge-request"><h2>⇄ Demander une fusion de fiches</h2>
 <p class="small muted">Tu as une ancienne fiche joueur en doublon ? <b>Tout joueur connecté avec une fiche liée peut envoyer cette demande, sans être modérateur.</b> Demande à transférer ses records et badges vers ta fiche actuelle. <b>Cette demande n'est pas automatique :</b> un supermodérateur devra vérifier la preuve et approuver la fusion. Les comptes Discord ou pseudo ne sont pas fusionnés.</p>
 <p><strong>Fiche à conserver :</strong> ${esc(target.display_name||target.username)} <span class="muted small">(${esc(state.ownKey)})</span></p>
 ${state.mergeRequestsError||state.mergeCandidatesError?`<div class="notice warning">${esc(state.mergeRequestsError||state.mergeCandidatesError)}</div>`:
 `<form data-form="requestPlayerMerge" class="dlfr-merge-request-form">
 <label class="field">Rechercher mon ancienne fiche<input type="search" id="selfMergeSourceSearch" placeholder="Pseudo, nom ou identifiant…" autocomplete="off"></label>
 <label class="field">Fiche en doublon à absorber<select id="selfMergeSourceSelect" name="source_key" size="6" required><option value="" selected disabled>Choisir une fiche dans les résultats</option>${preview.map(p=>`<option value="${esc(p.player_key)}">${esc(p.username)} · ${esc(p.player_key)}</option>`).join('')}</select></label>
 <p class="small muted">Seules les fiches non liées à un compte et non déjà fusionnées sont proposées. Recherche dans la liste puis sélectionne le bon profil.</p>
 <label class="field">Pourquoi s'agit-il de ton ancienne fiche ?<textarea name="message" maxlength="600" rows="3" placeholder="Ex. ancien pseudo Geometry Dash, vidéo de changement de pseudo…"></textarea></label>
 <label class="field">Lien de preuve (facultatif)<input type="url" name="proof_url" maxlength="500" pattern="https://.*" placeholder="https://…"></label>
 <button class="btn" type="submit" ${!choices.length?'disabled':''}>Envoyer ma demande</button></form>`}
 <h3>Mes demandes</h3>
 ${mine.length?`<div class="dlfr-merge-request-history">${mine.slice(0,15).map(r=>`<div class="dlfr-merge-request-item"><strong>${esc(r.source_username||r.source_key)} → ${esc(r.target_username||r.target_key)}</strong><span class="tag">${mergeRequestStatus(r.status)}</span><small class="muted">${esc(date(r.created_at))}</small>${r.moderator_note?`<p class="small">Modération : ${esc(r.moderator_note)}</p>`:''}</div>`).join('')}</div>`:'<p class="small muted">Aucune demande pour le moment.</p>'}
 ${pending?'<p class="small muted">Une demande est déjà en attente : les nouvelles demandes seront examinées séparément.</p>':''}</section>`;
}
function mergeRequestsModeratorPanel(){
 if(!LIVE||!hasFullStaffPowers()||ownerPreviewActive())return '';
 const requests=(state.mergeRequests||[]).filter(r=>r.status==='pending');
 return `<section class="paper dlfr-merge-moderation"><div class="row-between"><h2>⇄ Demandes de fusion de fiches (${requests.length})</h2><button type="button" class="btn subtle small" data-refresh-merges>Actualiser les fusions</button></div>
 <p class="small muted">Vérifie que les deux fiches appartiennent bien à la même personne. Prévisualise avant d'accepter. Une fiche déjà associée à un autre compte ne peut pas être absorbée. Si ton ami a demandé une <b>revendication de fiche</b>, cette demande figure dans les demandes de profils, pas dans les fusions.</p>
 ${state.mergeRequestsError?`<div class="notice warning">${esc(state.mergeRequestsError)}</div>`:''}
 ${requests.length?requests.map(r=>`<div class="dlfr-merge-moderation-card">
 <h3>Demande #${esc(r.id)} : ${esc(r.source_username||r.source_key)} → ${esc(r.target_username||r.target_key)}</h3>
 <p class="small muted">Source : ${esc(r.source_key)} · Cible : ${esc(r.target_key)} · ${esc(date(r.created_at))}</p>
 <p><b>Justification :</b> ${esc(r.message||'Non précisée')}</p>
 ${/^https:\/\//i.test(r.proof_url||'')?`<p><a href="${esc(r.proof_url)}" target="_blank" rel="noopener noreferrer" class="link">Voir la preuve ↗</a></p>`:''}
 <form data-form="reviewPlayerMerge" class="dlfr-merge-review-form">
 <input type="hidden" name="request_id" value="${esc(r.id)}">
 <label class="field">Note de modération (facultative)<textarea name="note" maxlength="500" rows="2"></textarea></label>
 <div class="form-actions"><button type="submit" class="btn subtle" name="merge_review_action" value="preview">Prévisualiser</button><button type="submit" class="btn danger" name="merge_review_action" value="reject">Refuser</button></div>
 <div class="dlfr-merge-review-preview notice" data-merge-preview="${esc(r.id)}" hidden></div>
 <label class="field">Pour accepter, écrire exactement FUSIONNER<input type="text" name="confirmation" autocomplete="off" placeholder="FUSIONNER"></label>
 <button type="submit" class="btn" name="merge_review_action" value="accept" disabled>Accepter la fusion</button>
 </form></div>`).join(''):'<p class="small muted">Aucune demande de fusion en attente.</p>'}</section>`;
}
function selfProfilePage(){
 if(LIVE&&!state.session){
  const usernameForms=C.enableUsernameLogin===true?`<div class="dlfr29-auth-grid">${usernameLoginForm()}<form data-form="usernameRegister" class="dlfr29-auth-card"><h3>Créer un compte DLFR</h3><label class="field">Pseudo<input name="username" autocomplete="username" minlength="3" maxlength="24" pattern="(?:[A-Za-z0-9_]|-){3,24}" required></label><label class="field">Mot de passe<input name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></label><label class="field">Confirmer le mot de passe<input name="password_confirm" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></label><p class="small muted">Nouveaux comptes uniquement. Si tu avais un compte sur l’ancien site, utilise le formulaire « Connexion DLFR » ci-contre. Aucun e-mail demandé ; conserve ton mot de passe.</p><button class="btn" type="submit">Créer mon compte</button></form></div>`:usernameLoginForm();
  return `${templateNotice()}<section class="paper self-page"><h1>Se connecter ou créer un compte</h1>${usernameForms}${C.enableDiscordOAuth===true?`<details class="alternate-login"><summary>Ou continuer avec Discord</summary>${discordPanel(null)}</details>`:''}<p class="small muted">Un ancien compte validé peut récupérer sa fiche libre au premier accès si le pseudo correspond exactement et sans conflit. Les autres liaisons nécessitent une validation.</p></section>`;
 }
 if(LIVE&&!state.ownKey)return `<section class="paper self-page"><h1>Mon profil</h1><div class="notice warning">${esc(state.ownAccountMessage||'Ton compte n’est pas relié à un profil joueur.')}</div>${linkedAccountsPanel()}${discordPanel(null)}<section class="paper dlfr-merge-request" aria-labelledby="mergeRequestAccessTitle"><h2 id="mergeRequestAccessTitle">⇄ Demander une fusion de fiches</h2><p>Cette demande est <strong>ouverte à tous les joueurs connectés</strong>, sans permission de modérateur.</p><p>Pour que les records et badges soient transférés vers <strong>ta bonne fiche</strong>, associe d’abord une fiche joueur à ce compte dans le formulaire ci-dessous. Une fois la liaison effectuée, reviens dans « Mon profil » : le formulaire de demande apparaîtra ici. Une revendication de fiche et une fusion de deux fiches sont deux demandes différentes.</p><p class="small muted">Si l’ancienne fiche est déjà associée à un autre compte, une intervention manuelle de la modération est nécessaire.</p></section><div id="selfPlayerClaim">${PROD.claimSection(state)}</div>${mySubmissionsTeaser()}<button class="btn subtle" type="button" data-action="selfLogout">Se déconnecter</button></section>`;
 const actor=LIVE?state.ownKey:state.demoActor;
 const player=state.data.players.find(p=>p.player_key===actor);
 if(!player)return '<section class="paper"><h1>Mon profil</h1><p>Aucun joueur lié à ce compte.</p></section>';
 const profile=state.data.player_profiles.find(p=>p.player_key===actor)||{},isFR=player.country_code==='FR';
 const until=player.demo_suspended_until,suspended=!!(until&&new Date(until)>new Date());
 const select='';
 const value=(field)=>esc(profile[field]??'');
 const field=(label,name,max=255,placeholder='')=>`<label class="field">${label}<input type="text" name="${name}" maxlength="${max}" placeholder="${esc(placeholder)}" value="${value(name)}"></label>`;
 const currentProfile=getPlayer(actor);
 return `${templateNotice()}<section class="paper self-page"><div class="self-heading"><div><h1>Mon profil</h1><p class="muted">Modifie ta présentation publique. Les points, records, titres officiels et sanctions restent gérés par les modérateurs.</p></div>${!LIVE?'<span class="tag">SIMULATION LOCALE</span>':'<button type="button" class="btn subtle small" data-action="selfLogout">Se déconnecter</button>'}</div>${select}
 ${linkedAccountsPanel()}
 ${discordPanel(actor,profile)}
 <section class="dlfr72-self-preview" aria-labelledby="dlfr72PreviewTitle"><div class="dlfr72-self-preview-head"><div><span class="kicker">Ma fiche publique</span><h2 id="dlfr72PreviewTitle">Aperçu de mon profil</h2><p class="muted small">Voici le profil tel qu’il apparaît aux autres joueurs, avec tes informations actuellement enregistrées.</p></div><a class="btn subtle small" data-nav href="${url('player',{player:actor})}">Ouvrir ma fiche ↗</a></div><div id="selfProfilePublicPreview">${statProfile(currentProfile)}</div></section>
 ${playerMergeRequestPanel()}
 ${mySubmissionsTeaser()}
 <details class="badge-catalog-section"><summary>🏅 Badges à découvrir — collection & raretés</summary><p class="small muted">Les badges non obtenus restent mystérieux : seules leur catégorie et leur rareté sont visibles. Les conditions ne sont jamais révélées.</p>${BADGES.catalog(state.data,actor,esc,date)}</details>

 <div class="dlfr72-settings-heading"><span class="kicker">Personnalisation</span><h2>Paramètres de mon profil</h2><p class="muted small">Modifie tes informations puis enregistre pour les voir apparaître dans l’aperçu.</p></div>
 ${suspended?'<div class="notice warning">Ce profil est suspendu dans la simulation. Les modifications sont temporairement désactivées.</div>':''}
 ${frameOptions(actor)}
 <form class="self-profile-form" data-form="selfProfile"><div class="self-form-grid"><label class="field self-field-wide">Biographie<textarea name="bio" maxlength="1200" rows="4">${value('bio')}</textarea></label>${!LIVE?`<label class="field">Source de l’avatar<select name="avatar_source"><option value="custom" ${(profile.avatar_source||'custom')==='custom'?'selected':''}>Avatar personnalisé</option><option value="discord" ${profile.avatar_source==='discord'?'selected':''} ${!(discordState().connected&&discordState().linked_player_key===actor)?'disabled':''}>Avatar Discord (liaison approuvée en démo)</option></select></label>`:''}${field('Avatar (URL ou chemin assets/)','avatar_url',500,'https://…')}${field('Bannière (URL ou chemin assets/)','banner_url',500,'https://…')}<label class="field">Année de début<input name="join_year" type="number" min="2013" max="2100" value="${value('join_year')}"></label>${field('Niveau favori','favorite_level',120)}${field('Objectif actuel','current_goal',180)}${field('Chaîne YouTube','youtube_url',500)}${field('Chaîne Twitch','twitch_url',500)}${field('Autre lien','social_url',500)}${field('Accomplissement à la une 1','highlight_1',150)}${field('Accomplissement à la une 2','highlight_2',150)}${field('Accomplissement à la une 3','highlight_3',150)}
 <label class="field">Pays <span class="country-select-row"><span id="selfCountryFlag">${flag(player.country_code)}</span><select name="country_code" id="selfCountry" required><option value="" ${!player.country_code?'selected':''} disabled>Choisir un pays</option>${GEO.countries.map(([code])=>`<option value="${code}" ${code===player.country_code?'selected':''}>${esc(GEO.countryName(code))} (${code})</option>`).join('')}</select></span></label><label class="field" id="selfRegionRow" ${!isFR?'hidden':''}>Région française <span class="country-select-row"><span id="selfRegionFlag">${isFR?GEO.regionImage(profile.region_code):''}</span><select name="region_code" id="selfRegion"><option value="">Non renseignée</option>${GEO.regions.map(r=>`<option value="${esc(r.code)}" ${r.code===profile.region_code?'selected':''}>${esc(r.name)}</option>`).join('')}</select></span></label></div><p class="small muted">Ton pays peut être modifié après la création du compte. Si tu quittes la France, ta région française sera effacée ; les classements géographiques seront actualisés.</p>
 ${communitySelfFields(actor)}
 <p><a class="link" data-nav href="${url('activity')}">Consulter les activités de mes abonnements ↗</a></p>
 <div class="self-actions"><button class="btn" type="submit" ${suspended?'disabled':''}>Enregistrer mon profil</button><span class="muted small">${LIVE?'Tes modifications seront enregistrées sur ton profil.':'Aperçu local : tes modifications ne seront pas publiées.'}</span></div></form>
 </section>`;
}
async function saveSelfProfile(form){
 const actor=LIVE?state.ownKey:state.demoActor;
 // Le droit de modifier vient de state.ownKey (liaison Auth verifiee),
 // et des regles RLS Supabase, PAS du badge public has_account.
 const player=state.data.players.find(x=>x.player_key===actor);
 if(!player||!actor||(LIVE&&(!state.session||actor!==state.ownKey)))
   throw Error('Aucune fiche joueur associee a ce compte. Recharge puis verifie la liaison dans Mon profil.');
 if(player.demo_suspended_until&&new Date(player.demo_suspended_until)>new Date())throw Error('Profil suspendu en démonstration.');
 const f=Object.fromEntries(new FormData(form).entries());
 const safeURL=(value,label)=>{const s=plain(value);if(!s)return '';if(!imageLink(s))throw Error(`${label} : URL ou chemin assets/ invalide.`);return s;};
 const webURL=(value,label)=>{const s=plain(value);if(!s)return '';if(!http(s))throw Error(`${label} : lien http(s) requis.`);return s;};
 const data={player_key:actor,bio:plain(f.bio).slice(0,1200),avatar_url:safeURL(f.avatar_url,'Avatar'),banner_url:safeURL(f.banner_url,'Bannière'),join_year:f.join_year?Number(f.join_year):null,favorite_level:plain(f.favorite_level).slice(0,120),current_goal:plain(f.current_goal).slice(0,180),youtube_url:webURL(f.youtube_url,'YouTube'),twitch_url:webURL(f.twitch_url,'Twitch'),social_url:webURL(f.social_url,'Lien personnel'),highlight_1:plain(f.highlight_1).slice(0,150),highlight_2:plain(f.highlight_2).slice(0,150),highlight_3:plain(f.highlight_3).slice(0,150)};
 if(!LIVE){data.avatar_source=f.avatar_source==='discord'?'discord':'custom';if(data.avatar_source==='discord'&&(!discordState().connected||discordState().linked_player_key!==actor))throw Error('Valide d’abord la liaison Discord en simulation.');}
 if(data.join_year&&(data.join_year<2013||data.join_year>2100))throw Error('Année de début invalide.');
 const country=String(f.country_code||'').toUpperCase();
 if(!GEO.validCountries.has(country))throw Error('Choisis un pays valide.');
 if(country==='FR'&&(!LIVE||C.enableRegionProfiles))data.region_code=GEO.regionInfo(f.region_code)?.code||null;
 if(country!=='FR')data.region_code=null;
 if(!LIVE){const current=state.data.player_profiles.findIndex(p=>p.player_key===actor);if(current>=0)state.data.player_profiles[current]={...state.data.player_profiles[current],...data};else state.data.player_profiles.push(data);player.country_code=country;saveDemo();}
 else {if(!state.session||!state.ownKey||actor!==state.ownKey)throw Error('Ce compte n’est pas autorisé à modifier ce joueur.');
   const {error}=await db.from('player_profiles').upsert(data,{onConflict:'player_key'});if(error)throw Error('Supabase : '+error.message);
   state.data.player_profiles=await readAll('player_profiles');
   if(state.communityReady){
     const badgeIds=new FormData(form).getAll('featured_badges').map(String);
     if(badgeIds.length>3)throw Error('Sélectionne au maximum trois badges favoris.');
     const showcase=[];
     for(let slot=1;slot<=3;slot++){
       const id=Number(f[`showcase_demon_${slot}`]);
       if(!id)continue;
       const vid=plain(f[`showcase_video_${slot}`]);
       if(vid&&!/^https:\/\/[^\s]+$/i.test(vid))throw Error('La vidéo de vitrine doit utiliser HTTPS.');
       showcase.push({slot,demon_id:id,caption:plain(f[`showcase_caption_${slot}`]).slice(0,180),video_url:vid||null});
     }
     if(new Set(showcase.map(x=>x.demon_id)).size!==showcase.length)throw Error('Choisis trois niveaux différents pour la vitrine.');
     const {error}=await db.rpc('dlfr_save_profile_extras',{
       p_accent_color:COMMUNITY.hex(f.accent_color),
       p_featured_title_id:f.featured_title_id?Number(f.featured_title_id):null,
       p_featured_badges:badgeIds,p_showcase:showcase
     });
     if(error)throw Error('Personnalisation DLFR 2.0 : '+error.message);
     for(const t of ['dlfr_profile_preferences','dlfr_profile_showcase'])state.data[t]=await readAll(t);
   }
   if(country!==player.country_code){
     const {error}=await db.rpc('dlfr_change_own_country',{p_country_code:country,p_region_code:country==='FR'&&C.enableRegionProfiles?(GEO.regionInfo(f.region_code)?.code||null):null});
     if(error){console.error('[DLFR] Mise à jour du pays',error);throw Error('Impossible de mettre à jour ton pays pour le moment.');}
     state.data.players=await readAll('players');
     state.data.player_profiles=await readAll('player_profiles');
   }
 }
 toast('Profil enregistré !');render();
}
function comparison(p,other){if(!other)return '<p class="muted small">Choisis un joueur pour comparer leurs statistiques.</p>';
 const rows=[['Points',fmt(p.score),fmt(other.score)],['Classement',p.rank?'#'+p.rank:'—',other.rank?'#'+other.rank:'—'],['Complétions',p.total_completions,other.total_completions],['Main List · #1–75',new Set(p.main.map(d=>d.id)).size,new Set(other.main.map(d=>d.id)).size],['Extended List · #76–150',new Set(p.extended.map(d=>d.id)).size,new Set(other.extended.map(d=>d.id)).size],['NLW',p.beyond.length,other.beyond.length],['UNRATED (points simulés)',fmt(unratedData().players.find(x=>x.player_key===p.player_key)?.points||0),fmt(unratedData().players.find(x=>x.player_key===other.player_key)?.points||0)],['Niveaux vérifiés',p.verified.length,other.verified.length]];
 return `<div class="record-table-wrap"><table class="record-table"><thead><tr><th>Indicateur</th><th>${esc(fullName(p))}</th><th>${esc(fullName(other))}</th></tr></thead><tbody>${rows.map(([n,a,b])=>`<tr><td>${esc(n)}</td><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</tbody></table></div>`;
}

function communityPublicPanel(playerKey){
 if(!state.communityReady)return '';
 const pref=(state.data.dlfr_profile_preferences||[]).find(x=>x.player_key===playerKey)||{};
 const bowned=new Map(COMMUNITY.ownedBadges(state.data,playerKey,BADGES).map(x=>[x.id,x]));
 const highlighted=(pref.featured_badges||[]).map(id=>bowned.get(String(id))).filter(Boolean).slice(0,3);
 const title=COMMUNITY.ownedTitles(state.data,playerKey).find(x=>String(x.id)===String(pref.featured_title_id));
 const followers=COMMUNITY.followers(state.data,playerKey),following=COMMUNITY.following(state.data,playerKey);
 const amFollowing=!!state.ownKey&&followers.some(f=>f.follower_key===state.ownKey);
 const canFollow=!!state.session&&!!state.ownKey&&state.ownKey!==playerKey;
 const followButton=state.ownKey===playerKey?'':canFollow?`<button type="button" class="btn small ${amFollowing?'subtle':''}" data-community-follow="${esc(playerKey)}">${amFollowing?'✓ Abonné':'＋ Suivre'}</button>`:!state.session?`<a class="link small" data-nav href="${url('my-profile')}">Se connecter pour suivre</a>`:'';
 const demonMap=new Map((state.data.demons||[]).map(d=>[Number(d.id),d]));
 const showcase=COMMUNITY.showcase(state.data,playerKey).map(s=>({s,d:demonMap.get(Number(s.demon_id))})).filter(x=>x.d);
 return `<section class="profile-section dlfr20-community" style="--dlfr20-accent:${esc(COMMUNITY.hex(pref.accent_color))}">
 <div class="dlfr20-community-top"><div><h3>✦ Espace communautaire</h3><p class="muted small">${followers.length} abonné(s) · ${following.length} abonnement(s)</p></div>${followButton}</div>
 ${title?`<div class="dlfr20-title">✧ ${esc(title.label)}</div>`:''}
 ${highlighted.length?`<div class="dlfr20-featured-badges">${highlighted.map(x=>`<div class="dlfr-badge dlfr20-favorite" data-rarity="${esc(x.def.rarity.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,''))}"><span class="dlfr-badge-icon">${esc(x.def.symbol)}</span><b>${esc(x.def.label)}</b></div>`).join('')}</div>`:''}
 ${packEnabled()?(state.data.dlfr_level_pack_claims||[]).filter(c=>c.player_key===playerKey).map(c=>{const p=(state.data.dlfr_level_packs||[]).find(p=>Number(p.id)===Number(c.pack_id));return p?`<span class="dlfr27-earned-reward">✦ ${esc(p.reward_label)} · Level Pack</span>`:'';}).join(''):''}
 <div id="v81-profile-rewards" data-player-key="${esc(playerKey)}"></div>
 ${showcase.length?`<h3 class="dlfr20-gallery-title">Ma vitrine de niveaux</h3><div class="dlfr20-gallery">${showcase.map(({s,d})=>{const thumb=imageLink(d.thumbnail_url);const video=http(s.video_url);return `<article class="dlfr20-level-card"><a data-nav href="${url('demon',{id:d.id})}" class="dlfr20-card-link">${thumb?`<img loading="lazy" src="${esc(thumb)}" alt="Miniature du niveau ${esc(d.name)}">`:'<span class="dlfr20-no-thumb">✦</span>'}<strong>${esc(d.name)}</strong></a>${s.caption?`<p>${esc(s.caption)}</p>`:''}${video?`<a href="${esc(video)}" target="_blank" rel="noopener noreferrer" class="link">Voir ma vidéo ↗</a>`:''}</article>`;}).join('')}</div>`:''}
 ${state.ownKey===playerKey&&following.length?`<details class="dlfr20-follow-list"><summary>Mes abonnements (${following.length})</summary><div>${following.map(x=>`<a data-nav class="link" href="${url('player',{player:x.followed_key})}">${esc(getPlayer(x.followed_key)?.display_name||getPlayer(x.followed_key)?.username||x.followed_key)}</a>`).join(' · ')}</div></details>`:''}
 </section>`;
}
// DLFR 2.1 — fil communautaire et recommandations, basé sur les données publiques déjà approuvées.
function activityCards(entries,compact=false){
 const profiles=new Map((state.data.player_profiles||[]).map(p=>[p.player_key,p]));
 const players=new Map((state.data.players||[]).map(p=>[p.player_key,p]));
 const levels=new Map((state.data.demons||[]).map(d=>[Number(d.id),d]));
 return entries.map(e=>{
  const p=players.get(e.playerKey),picture=avatarOf(e.playerKey,profiles.get(e.playerKey));
  const display=sortPlayerName(p)||e.playerKey;
  const playerUrl=url('player',{player:e.playerKey});
  const avatar=picture?`<img src="${esc(picture)}" alt="" loading="lazy">`:`<span aria-hidden="true">${esc(display.charAt(0).toUpperCase()||'?')}</span>`;
  const stamp=new Date(e.at).toISOString();
  const when=date(stamp);
  const isCompletion=e.type==='completion';
  const d=isCompletion?levels.get(Number(e.levelId)):null;
  const media=isCompletion&&d?imageLink(d.thumbnail_url):'';
  const action=isCompletion?`a un record à 100 % enregistré sur <a data-nav href="${url('demon',{id:e.levelId})}">${esc(e.levelName)}</a>`:`a obtenu le badge <strong>${esc(e.badgeName)}</strong>`;
  const proof=isCompletion?http(e.videoUrl):'';
  return `<article class="dlfr21-activity-card ${compact?'dlfr21-compact':''}">
   <a class="dlfr21-feed-avatar" data-nav href="${playerUrl}" aria-label="Profil de ${esc(display)}">${avatar}</a>
   <div class="dlfr21-feed-content"><div class="dlfr21-activity-meta"><a data-nav href="${playerUrl}">${esc(display)}</a><time datetime="${stamp}">${esc(when)}</time></div>
   <p>${isCompletion?'✓ ':esc(e.badgeSymbol)+' '}${action}</p>
   ${isCompletion?v79ReactionBar(e.id):''}
   ${proof?`<a class="link small" target="_blank" rel="noopener noreferrer" href="${esc(proof)}">Voir la preuve vidéo ↗</a>`:''}</div>
   ${media&&!compact?`<a data-nav href="${url('demon',{id:e.levelId})}" class="dlfr21-level-thumb"><img loading="lazy" src="${esc(media)}" alt="Miniature de ${esc(e.levelName)}"></a>`:''}
  </article>`;
 }).join('');
}
function activityPage(){
 if(!ACTIVITY)return '<section class="paper">Module du fil communautaire manquant : ajoute js/activity-feed.js.</section>';
 if(!state.communityReady)return `${templateNotice()}<section class="paper dlfr21-page"><h1>Vie communautaire</h1><p class="notice warning">Les abonnements ne sont pas disponibles pour le moment. Réessaie plus tard.</p></section>`;
 const following=(state.ownKey?COMMUNITY.following(state.data,state.ownKey):[]).map(x=>x.followed_key);
 const onlyFollowing=state.activityTab==='following'&&!!state.ownKey;
 const personalTab=state.activityTab==='following';
 const entries=ACTIVITY.events(state.data,{badges:BADGES,onlyKeys:onlyFollowing?following:personalTab?[]:null,limit:40,days:365});
 const excluded=[...(following||[]),state.ownKey];
 const registered=new Set((state.data.players||[]).map(p=>p.player_key));
 const eligible=ranked().filter(p=>registered.has(p.player_key)&&statsPlayerVisible(p));
 const discovered=ACTIVITY.discover(eligible,{exclude:excluded,limit:3});
 const profileMap=new Map((state.data.player_profiles||[]).map(p=>[p.player_key,p]));
 const suggestions=discovered.map(p=>{const name=sortPlayerName(p),avatar=avatarOf(p.player_key,profileMap.get(p.player_key));return `<a class="dlfr21-discover" data-nav href="${url('player',{player:p.player_key})}"><span class="dlfr21-discover-avatar">${avatar?`<img loading="lazy" src="${esc(avatar)}" alt="">`:esc(name.charAt(0).toUpperCase()||'?')}</span><span><strong>${esc(name)}</strong><small>Voir le profil ↗</small></span></a>`;}).join('');
 let empty='Aucune activité récente enregistrée dans cette période.';
 if(personalTab&&!state.ownKey)empty='Connecte-toi et lie ton profil DLFR pour voir les activités des joueurs que tu suis.';
 else if(personalTab&&!following.length)empty='Tu ne suis encore personne. Découvre des profils pour composer ton fil.';
 else if(personalTab)empty='Pas encore de nouvelle complétion ou de badge daté parmi tes abonnements cette année.';
 const actions=personalTab&&!state.ownKey?`<p><a class="btn small" href="${url('my-profile')}" data-nav>Se connecter</a></p>`:'';
 return `${templateNotice()}<section class="paper dlfr21-page"><div class="dlfr21-head"><div><p class="small muted">DLFR 2.1 · Communauté</p><h1>Vie communautaire</h1><p class="muted">Les derniers records publics et badges des joueurs francophones, au même endroit.</p></div><span class="tag">✦ Activité</span></div>
 <div class="dlfr21-layout"><div class="dlfr21-main"><div class="dlfr21-feed-tabs" role="group" aria-label="Choisir le fil"><button type="button" data-activity-tab="following" class="${personalTab?'active':''}" aria-pressed="${personalTab}">Mes abonnements</button><button type="button" data-activity-tab="all" class="${!personalTab?'active':''}" aria-pressed="${!personalTab}">Toute la communauté</button></div>
 ${entries.length?activityCards(entries):`<div class="dlfr21-empty"><p>${esc(empty)}</p>${actions}</div>`}
 <p class="small muted dlfr21-footnote">Les dates des records correspondent à leur enregistrement dans la DLFR, pas nécessairement à la date de réussite. Les badges sans date fiable et les soumissions non validées ne sont pas affichés.</p></div>
 <aside class="dlfr21-side"><h2>Profils à découvrir</h2><p class="muted small">Une sélection renouvelée chaque semaine, sans classement supplémentaire.</p>${suggestions||'<p class="muted small">Aucun profil à proposer pour le moment.</p>'}<div class="dlfr21-tip"><h3>Ton espace</h3><p>Personnalise ta fiche, choisis tes badges favoris et suis d’autres joueurs.</p><a data-nav class="link" href="${url('my-profile')}">Mon profil ↗</a></div></aside></div></section>`;
}
function profileRecentActivity(playerKey){
 if(!state.communityReady||!ACTIVITY)return '';
 const events=ACTIVITY.events(state.data,{badges:BADGES,onlyKeys:[playerKey],limit:3,days:365});
 return events.length?`<section class="profile-section dlfr21-profile-activity"><div class="row-between"><h3>Activité récente</h3><a class="link small" href="${url('activity')}" data-nav>Voir le fil communautaire ↗</a></div>${activityCards(events,true)}</section>`:'';
}
function v79LevelGallery(items, kind='rated'){
 const arr=[...new Map((items||[]).filter(Boolean).map(d=>[String(d.id),d])).values()];
 if(!arr.length)return '<p class="muted small">Aucun niveau dans cette catégorie.</p>';
 return `<div class="v80-level-list">${arr.map(d=>{
   const rank=d.unrated?'UNRATED #'+num(d.unrated_position):num(d.position)>150?'NLW #'+(num(d.position)-150):'#'+num(d.position);
   return `<a class="v80-level-row" data-nav href="${url('demon',{id:d.id})}"><span class="v80-level-rank">${esc(rank)}</span><strong>${esc(d.name)}</strong><span class="v80-level-arrow" aria-hidden="true">↗</span></a>`;
 }).join('')}</div>`;
}

function statProfile(p){if(!p)return '<div class="stats-profile empty">Sélectionne un joueur.</div>';
 const profile=state.data.player_profiles.find(v=>v.player_key===p.player_key)||{};
 const allSnapshots=state.data.player_stat_snapshots.filter(s=>s.player_key===p.player_key).sort((a,b)=>String(a.snapshot_day??'').localeCompare(String(b.snapshot_day??'')));
 const todayUTC=new Date().toISOString().slice(0,10);
 const unreliable=allSnapshots.filter(s=>s.snapshot_day===todayUTC && ((+s.points===0 && +p.score>0.01) || (+s.rank_position>0 && +p.rank>0 && +s.rank_position!==+p.rank)));
 const snapshots=allSnapshots.filter(s=>!unreliable.includes(s));
 const snapshotWarning=unreliable.length?'<p class="notice small">⚠️ Relevé du jour incohérent avec le classement actuel : masqué en attendant une correction. Aucun ancien score n’a été inventé.</p>':'';
 const recs=state.data.completions.filter(c=>key(c.player)===p.player_key);
 const monthly={};for(const r of recs){if(+r.progress<100)continue;const m=plain(r.created_at).slice(0,7);if(m)monthly[m]=(monthly[m]||0)+1;}
 const rankedStr=p.rank?`#${p.rank}`:'—';
 const banner=imageLink(profile.banner_url),avatar=avatarOf(p.player_key,profile);const suspension=state.data.players.find(x=>x.player_key===p.player_key)?.demo_suspended_until;const isSuspended=!!(suspension&&new Date(suspension)>new Date());
 const recent=recs.filter(c=>+c.progress===100&&catalog().some(d=>+d.id===+c.demon_id&&Number(d.position)>=1&&Number(d.position)<=150&&!d.legacy)).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,5);
 const demonLookup=new Map(catalog().map(d=>[+d.id,d]));
 // V65 : listes de complétions visibles sur la fiche : Main (1-75) et Extended (76-150).
 // Ne pas modifier les records, les scores ni les archives historiques en base.
 const currentListCompleted=[...(p.main||[]),...(p.extended||[])];
 const top75Completed=currentListCompleted.filter(d=>Number(d.position)>=1&&Number(d.position)<=75&&!d.legacy);
 const extendedCompleted=currentListCompleted.filter(d=>Number(d.position)>=76&&Number(d.position)<=150&&!d.legacy);
 // V66 : afficher les niveaux NLW homologués réellement complétés, avec leurs rangs NLW.
 // Ne pas mélanger la liste héritée ou les UNRATED avec les complétions NLW.
 const nlwCompleted=[...new Map((p.beyond||[])
   .filter(d=>d&&d.is_public!==false&&!d.legacy&&!d.unrated&&V2.nlwRank(d)>0)
   .map(d=>[Number(d.id),d])).values()]
   .sort((a,b)=>V2.nlwRank(a)-V2.nlwRank(b)||String(a.name).localeCompare(String(b.name),'fr'));
 const profileFacts=[['Région',p.country_code==='FR'?GEO.regionInfo(profile.region_code)?.name:''],['Depuis',profile.join_year],['Niveau favori',profile.favorite_level],['Objectif',profile.current_goal]]
  .filter(([_,v])=>plain(v)).map(([l,v])=>`<div class="profile-fact"><strong>${esc(l)}</strong><span>${esc(v)}</span></div>`).join('');
 const socials=[['YouTube',profile.youtube_url],['Twitch',profile.twitch_url],['Lien personnel',profile.social_url]].filter(([_,v])=>http(v))
  .map(([n,v])=>`<a class="social-link" target="_blank" rel="noopener noreferrer" href="${esc(http(v))}">${n} ↗</a>`).join('');
 return `<div class="stats-profile dlfr20-profile" style="--dlfr20-accent:${esc(COMMUNITY.hex((state.data.dlfr_profile_preferences||[]).find(x=>x.player_key===p.player_key)?.accent_color))}"><div class="profile-hero">${banner?`<img class="profile-cover-img" src="${esc(banner)}" alt="" aria-hidden="true">`:''}
    <div class="profile-hero-inner">${framedAvatar(p.player_key,avatar?`<img class="profile-avatar" src="${esc(avatar)}" alt="Avatar de ${esc(p.display_name||p.username)}">`:`<div class="profile-avatar profile-avatar-fallback" aria-hidden="true">${esc((p.display_name||p.username||'?').slice(0,1).toUpperCase())}</div>`)}
      <div class="profile-hero-copy"><span class="profile-pretitle">Profil joueur · ${p.has_account?'Compte':'Sans compte'}</span><strong>${flag(p.country_code)} ${esc(p.display_name||p.username)}</strong>${regionIdentity(p)}<span>${p.hardest?'Hardest : '+esc(hardestLabel(p)):'Aucun hardest connu'}</span></div>
    </div></div>
 ${isSuspended?'<p class="notice warning"><b>Profil suspendu en démonstration</b> — cette sanction n’affecte pas l’authentification réelle.</p>':''}<h2 class="player-title">${flag(p.country_code)} ${esc(p.display_name||p.username)} ${!p.has_account?'<span class="tag">Sans compte</span>':''}</h2><div class="profile-region-line">${regionIdentity(p)}</div><div style="text-align:center;margin-bottom:8px">${p.clan?` <a class="tag clan-profile-link" href="${url('clans')}" data-nav>Clan : ${esc(state.data.clans.find(c=>Number(c.id)===Number(p.clan.clan_id))?.tag||'—')}</a>`:''}</div>
 <div class="statboxes">${box('Classement Demonlist',rankedStr)}${box('Points totaux',fmt(p.score))}${box('Hardest (complété ou vérifié)',hardestLabel(p))}</div>
 <div class="statboxes two">${box('Points NLW',fmt(p.nlwScore||0))}${box('Rang NLW',p.nlwRank?'#'+p.nlwRank:'—')}</div><div class="statboxes two">${box('UNRATED complétés',unratedData().players.find(x=>x.player_key===p.player_key)?.completions||0)}${box('Points UNRATED (estimation)',fmt(unratedData().players.find(x=>x.player_key===p.player_key)?.points||0))}</div><div class="statboxes two main-stats-highlight">${box('MAIN LIST · #1–75',new Set(p.main.map(d=>d.id)).size)}${box('EXTENDED LIST · #76–150',new Set(p.extended.map(d=>d.id)).size)}</div><div class="statboxes two">${box('Contributions',`${p.created.length} Créés, ${p.published.length} Publiés, ${p.verified.length} Vérifiés`)}${box('Complétions NLW',String(p.beyond.length))}</div>
 ${communityPublicPanel(p.player_key)}
 ${profileRecentActivity(p.player_key)}
 <div class="profile-section badge-gallery badge-gallery-v27"><h3>Collection de badges permanents</h3>${titleHTML(p)||'<span class="muted">Aucun badge attribué.</span>'}<p class="small muted">Chaque badge reste acquis et conserve sa date, même si les critères évoluent. Les anciens titres importés n'ont pas de date historique vérifiable.</p></div><div class="profile-section profile-tabs" role="tablist" aria-label="Sections du profil">${[['overview','Présentation'],['records','Records'],['charts','Graphiques'],['achievements','Distinctions']].map(([id,label])=>`<button type="button" role="tab" aria-selected="${state.profileTab===id}" data-profile-tab="${id}" class="${state.profileTab===id?'active':''}">${label}</button>`).join('')}</div>
 <div class="profile-pane ${state.profileTab==='overview'?'':'is-hidden'}" data-pane="overview">
 ${profile.bio?`<div class="profile-bio">${esc(profile.bio)}</div>`:''}
  ${profileFacts?`<div class="profile-facts">${profileFacts}</div>`:''}
  ${socials?`<div class="profile-socials">${socials}</div>`:''}
  <div class="profile-section"><h3>Dernières complétions</h3>${recent.length?`<div class="recent-completions">${recent.map(r=>{const dem=demonLookup.get(+r.demon_id);return `<div class="recent-item"><span>✓</span><a class="link" href="${url('demon',{id:r.demon_id})}" data-nav>${esc(dem?.name||'Niveau inconnu')}</a><time>${date(r.created_at)}</time></div>`;}).join('')}</div>`:'<p class="muted">Aucun record daté.</p>'}</div>
 </div><div class="profile-pane ${state.profileTab==='records'?'':'is-hidden'}" data-pane="records">${recordTable(p)}
 <div class="profile-section"><h3>Top 75 complété</h3>${v79LevelGallery(top75Completed)}</div><div class="profile-section"><h3>76–150 complété</h3>${v79LevelGallery(extendedCompleted)}</div><div class="profile-section"><h3>NLW — ${nlwCompleted.length} niveau(x) complété(s)</h3>${v79LevelGallery(nlwCompleted)}</div>
 ${[['Démons créés',p.created],['Démons publiés',p.published],['Démons vérifiés',p.verified]].map(([t,a])=>`<div class="profile-section"><h3>${t}</h3><p>${completionLinks(a)}</p></div>`).join('')}
 <div class="profile-section"><h3>Progression sur</h3><p>${p.progress.length?p.progress.map(r=>esc(r.demon.name)+' : '+r.progress+'%').join(' · '):'Aucun'}</p></div>
 </div><div class="profile-pane ${state.profileTab==='charts'?'':'is-hidden'}" data-pane="charts">
 <div class="profile-section"><h3>Progression historique</h3>${snapshotWarning}${lineGraph(snapshots)}<p class="muted small">Les instantanés sont enregistrés uniquement à partir de leur activation.</p></div>
 <div class="profile-section"><h3>Évolution du rang</h3>${graphRank(snapshots)}</div>
 <div class="profile-section"><h3>Complétions par mois</h3>${barGraph(monthly)}</div></div>
 <div class="profile-pane ${state.profileTab==='achievements'?'':'is-hidden'}" data-pane="achievements">
 ${[profile.highlight_1,profile.highlight_2,profile.highlight_3].filter(Boolean).length?`<div class="profile-section"><h3>Accomplissements mis en avant</h3><p>${[profile.highlight_1,profile.highlight_2,profile.highlight_3].filter(Boolean).map(x=>`<span class="tag">★ ${esc(x)}</span>`).join('')}</p></div>`:''}
 ${state.data.hall_of_fame.filter(h=>h.player_key===p.player_key&&h.is_published).map(h=>`<div class="hof-item"><div class="hof-year">${esc(h.award_year)} · ${esc(h.category)}</div><h3>${esc(h.headline)}</h3><p>${esc(h.description)}</p></div>`).join('')||'<p class="muted small">Aucune distinction officielle pour le moment.</p>'}
 </div></div>`;
}
// DLFR 2.2 — Carte et classements régionaux : données publiques uniquement.
function regionsPage(){
 if(!REGION_MAP)return '<section class="paper"><h1>Régions</h1><p>Le module js/regions-map.js est manquant.</p></section>';
 if(!state.regionsGeometryRequested){
  state.regionsGeometryRequested=true;
  REGION_MAP.ensureGeometry().then(()=>{if(nav()==='regions')render();});
 }
 const GEOREG=GEO.regions;
 const allPlayers=ranked().filter(statsPlayerVisible);
 const snapshot=REGION_MAP.summarize(allPlayers,state.data.player_profiles,GEOREG);
 const region=GEO.regionInfo(state.selectedRegion)||GEO.regionInfo('BRE');
 const code=region.code, item=snapshot[code];
 const topList=Object.values(snapshot).sort((a,b)=>{
  if(state.regionsSort==='players')return b.active-a.active||b.points-a.points;
  if(state.regionsSort==='hardest')return Number(a.hardest?.level?.position||Infinity)-Number(b.hardest?.level?.position||Infinity)||b.points-a.points;
  return b.points-a.points||b.active-a.active;
 });
 const withRegion=topList.filter(x=>x.players.length).length;
 const withoutRegion=allPlayers.filter(p=>p.country_code==='FR'&&!GEO.regionInfo(regionFor(p))).length;
 const profileLink=p=>url('player',{player:p.player_key});
 const playerRow=(p,i)=>`<a class="dlfr22-player-row" data-nav href="${profileLink(p)}"><span class="dlfr22-player-rank">#${i+1}</span><span class="dlfr22-player-name">${esc(fullName(p))}${p.has_account?'':' <small>· Profil non revendiqué</small>'}</span><strong>${fmt(p.score)} pts</strong><span aria-hidden="true">›</span></a>`;
 const flagFor=reg=>GEO.regionImage(reg);
 const allRegionRows=topList.map((x,i)=>`<button type="button" class="dlfr22-region-rank ${code===x.code?'selected':''}" data-region-code="${x.code}"><span class="dlfr22-region-place">${i+1}</span>${flagFor(x.code)}<span class="dlfr22-region-name">${esc(GEO.regionInfo(x.code)?.name||x.code)}<small>${x.active} joueur(s) avec activité publique</small></span><strong>${state.regionsSort==='players'?String(x.active):state.regionsSort==='hardest'?x.hardest?'#'+x.hardest.level.position:'—':fmt(x.points)+' pts'}</strong></button>`).join('');
 const flagButtons=REGION_MAP.overseas.map(id=>`<button type="button" class="dlfr22-overseas ${code===id?'selected':''}" data-region-code="${id}">${flagFor(id)}<span>${esc(GEO.regionInfo(id)?.name||id)}</span><strong>${snapshot[id]?.active||0}</strong></button>`).join('');
 const geographyLabel=id=>GEO.regionInfo(id)?.name||id;
 return `${templateNotice()}<section class="paper dlfr22-page"><div class="dlfr22-header"><div><p class="kicker">COMMUNAUTÉ · DLFR 2.2</p><h1>La France sur la DLFR</h1><p class="muted">Explore les régions françaises, les joueurs qui les représentent et leurs performances publiques.</p></div><span class="tag">18 régions</span></div>
 <div class="dlfr22-summary">${box('Régions représentées',withRegion+' / 18')}${box('Joueurs avec région',Object.values(snapshot).reduce((n,x)=>n+x.players.length,0))}${box('Points français géolocalisés',fmt(Object.values(snapshot).reduce((n,x)=>n+x.points,0)))}</div>
 <div class="dlfr22-grid"><div class="dlfr22-map-pane"><div class="dlfr22-map-heading"><h2>Carte interactive</h2><span class="muted small">Sélectionne une région</span></div><div class="dlfr22-map" id="dlfrRegionMap">${REGION_MAP.draw(code,geographyLabel)}</div>${!REGION_MAP.hasGeometry?'<p class="dlfr22-map-foot small muted">Contours géographiques en cours de chargement. En cas d’échec réseau, une carte schématique cliquable reste disponible.</p>':''}
 <h3 class="dlfr22-overseas-title">Outre-mer</h3><div class="dlfr22-overseas-list">${flagButtons}</div></div>
 <aside class="dlfr22-region-pane"><div class="dlfr22-region-title">${flagFor(code)}<div><span class="small muted">Région sélectionnée</span><h2>${esc(region.name)}</h2></div></div>
 <div class="dlfr22-region-stats">${box('Joueurs',item.players.length)}${box('Avec activité',item.active)}${box('Points DLFR',fmt(item.points))}${box('Points NLW',fmt(item.nlwPoints))}</div>
 <div class="dlfr22-spotlight"><h3>Meilleur joueur régional</h3>${item.top?`<a class="link" data-nav href="${profileLink(item.top)}">${esc(fullName(item.top))}</a><strong>${fmt(item.top.score)} pts</strong>`:'<p class="muted small">Aucun joueur renseigné dans cette région.</p>'}</div>
 <div class="dlfr22-spotlight"><h3>Hardest terminé dans la région</h3>${item.hardest?`<a class="link" data-nav href="${url('demon',{id:item.hardest.level.id})}">${esc(item.hardest.level.name)} <span class="muted">(#${esc(item.hardest.level.position)})</span></a><small class="muted">Par ${esc(fullName(item.hardest.player))}</small>`:'<p class="muted small">Aucune complétion publiée disponible.</p>'}</div>
 <h3 class="dlfr22-regional-heading">Classement régional</h3><div class="dlfr22-players">${item.players.length?item.players.map(playerRow).join(''):'<p class="muted small">Les profils français doivent renseigner leur région pour apparaître ici.</p>'}</div></aside></div>
 <div class="dlfr22-ranking"><div class="dlfr22-ranking-head"><div><h2>Classement interrégional</h2><p class="muted small">Somme des points de classement principaux des profils de chaque région.</p></div><label class="field">Trier par<select id="dlfrRegionSort"><option value="points" ${state.regionsSort==='points'?'selected':''}>Points DLFR</option><option value="players" ${state.regionsSort==='players'?'selected':''}>Joueurs actifs</option><option value="hardest" ${state.regionsSort==='hardest'?'selected':''}>Hardest terminé</option></select></label></div><div class="dlfr22-ranking-list">${allRegionRows}</div></div>
 <p class="dlfr22-method muted small">Données publiques de la DLFR, mises à jour au chargement. « Avec activité » signifie au moins une complétion, une vérification ou des points publics — pas une connexion récente. Les points principaux et NLW sont affichés séparément. ${withoutRegion?`${withoutRegion} profil(s) français sans région ne sont pas comptés.`:'Les profils sans région ne sont pas comptés.'} Pour choisir ta région : Mon espace → Mon profil.</p></section>`;
}
function lineGraph(data){if(!data.length)return '<p class="empty small">Aucun historique : vérifier GitHub Actions → Historique journalier Demonlist.</p>';if(data.length===1)return `<div class="chart-box"><p class="small">📍 Premier relevé : <b>${fmt(+data[0].points||0)} points</b> · ${esc(data[0].snapshot_day)}</p><p class="small muted">Le graphique apparaîtra après un second relevé.</p></div>`;const max=Math.max(...data.map(x=>+x.points),1),min=Math.min(...data.map(x=>+x.points)),den=Math.max(1,max-min);const coords=data.map((x,i)=>[24+i*480/Math.max(1,data.length-1),135-(+x.points-min)/den*110]);return `<div class="chart-box"><svg viewBox="0 0 540 160" role="img" aria-label="Évolution des points"><path d="M20 135H515" stroke="#bbc7d3"/><path d="${coords.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')}" fill="none" stroke="#167fbe" stroke-width="3"/>${coords.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="3.2" fill="#167fbe"/>`).join('')}<text x="20" y="14" font-size="11" fill="currentColor">${fmt(max)} pts</text><text x="22" y="155" font-size="10" fill="currentColor">${esc(data[0].snapshot_day)}</text><text x="420" y="155" font-size="10" fill="currentColor">${esc(data.at(-1).snapshot_day)}</text></svg></div>`;}
function barGraph(monthly){const keys=Object.keys(monthly).sort().slice(-12);if(!keys.length)return '<p class="empty small">Pas de dates de records renseignées.</p>';const mx=Math.max(...keys.map(k=>monthly[k]));return `<div class="chart-box"><div style="display:flex;align-items:flex-end;gap:6px;min-height:115px">${keys.map(k=>`<div style="flex:1;text-align:center"><div style="background:#1783c1;height:${Math.max(4,85*monthly[k]/mx)}px" title="${esc(k)} : ${monthly[k]} complétion(s)"></div><span style="font-size:9px">${esc(k.slice(5))}</span></div>`).join('')}</div></div>`;}
// DLFR 2.4 — fiches publiques indépendantes des classements.
// DLFR 2.7 — Level Packs & cadres basés sur des récompenses obtenues.
const packEnabled=()=>!!(window.DLFR_LEVEL_PACKS&&state.packsReady&&state.communityReady);
function frameOptions(playerKey){
 if(!packEnabled())return '';
 const choices=window.DLFR_LEVEL_PACKS.frames(state.data,playerKey,BADGES);
 const active=window.DLFR_LEVEL_PACKS.frame(state.data,playerKey,BADGES).id;
 return `<section class="dlfr27-frame-picker"><h3>✦ Cadre de profil</h3><p class="small muted">Les cadres sont déblocables grâce aux badges obtenus et aux Level Packs réussis. Ils ne modifient pas tes statistiques.</p><form data-form="chooseFrame"><label class="field">Mon cadre<select name="frame_key">${choices.map(c=>`<option value="${esc(c.id)}" ${active===c.id?'selected':''}>${esc(c.label)}</option>`).join('')}</select></label><button type="submit" class="btn small">Utiliser ce cadre</button></form></section>`;
}
function framedAvatar(playerKey,html){
 const selected=packEnabled()?window.DLFR_LEVEL_PACKS.frame(state.data,playerKey,BADGES):null;
 const css=['beginner','impressive','epic','legendary','mythic','ultra','pack','achievement','hall'].includes(selected?.css)?' dlfr27-frame-'+selected.css:'';
 return `<div class="dlfr27-frame${css}" title="${esc(selected?.id==='none'?'Aucun cadre sélectionné':'Cadre : '+selected?.label)}">${html}</div>`;
}
function packPage(){
 if(!state.packsReady)return `${templateNotice()}<section class="paper"><h1>Level Packs</h1><div class="notice warning">Les Level Packs ne sont pas disponibles pour le moment.</div></section>`;
 const packs=(state.data.dlfr_level_packs||[]).filter(p=>p.is_published||state.staff).sort((a,b)=>Number(b.is_published)-Number(a.is_published)||Number(a.id)-Number(b.id));
 const levelById=new Map((state.data.demons||[]).map(d=>[Number(d.id),d]));
 const me=state.ownKey||'';
 const cards=packs.map(p=>{
   const pr=window.DLFR_LEVEL_PACKS.progress(state.data,p,me);
   const artwork=imageLink(p.banner_url);
   const rewardType=p.reward_kind==='title'?'Tag / titre':'Badge + cadre';
   const steps=pr.entries.map(item=>{
      const d=levelById.get(Number(item.demon_id));
      const done=(state.data.completions||[]).some(c=>me&&key(c.player)===key(me)&&Number(c.demon_id)===Number(item.demon_id)&&Number(c.progress)===100);
      return `<li class="${done?'is-complete':''}"><span>${done?'✓':'○'}</span> ${d?`<a data-nav href="${url('demon',{id:d.id})}">${esc(d.name)}</a>`:`<span class="muted">Niveau indisponible (#${esc(item.demon_id)})</span>`}</li>`;
   }).join('');
   const canClaim=!!me&&!!state.session&&pr.done&&!pr.claimed&&p.is_published;
   return `<article class="dlfr27-pack"><div class="dlfr27-pack-banner">${artwork?`<img src="${esc(artwork)}" loading="lazy" alt="">`:''}<span>${p.reward_kind==='title'?'♛':'✦'}</span></div><div class="dlfr27-pack-main"><div class="dlfr27-pack-title"><h2>${esc(p.title)}</h2><span class="tag">${esc(rewardType)} · ${esc(p.reward_label)}</span>${!p.is_published?'<span class="tag">Brouillon</span>':''}</div><p>${esc(p.description||'Un défi composé de plusieurs niveaux.')}</p><div class="dlfr27-pack-progress"><div class="dlfr27-pack-track"><i style="width:${pr.total?100*pr.earned/pr.total:0}%"></i></div><strong>${me?`${pr.earned}/${pr.total}`:`${pr.total} niveaux`}</strong></div><ol class="dlfr27-pack-levels">${steps}</ol>${pr.claimed?'<p class="dlfr27-pack-earned">✓ Récompense obtenue</p>':canClaim?`<button type="button" class="btn" data-claim-pack="${p.id}">Réclamer ma récompense</button>`:!me?'<p class="small muted">Connecte ton profil DLFR pour suivre ta progression.</p>':pr.done?'<p class="small muted">Connecte-toi pour réclamer cette récompense.</p>':''}</div></article>`;
 }).join('');
 return `${templateNotice()}<section class="paper dlfr27-packs-page"><div class="v2-intro"><span class="kicker">Communauté · défis</span><h1>Level Packs</h1><p>Des collections de niveaux créées par la modération. Termine chacun des niveaux avec une complétion validée à 100 % pour débloquer un tag ou un badge spécial.</p></div><div class="dlfr27-packs-grid">${cards||'<p class="empty">Aucun pack publié pour le moment.</p>'}</div><p class="small muted">Les récompenses doivent être réclamées après validation des records. Les pseudos historiques doivent être correctement rapprochés pour être comptabilisés.</p></section>`;
}
function packModerationEditor(){
 if(!state.packsReady)return '<section class="admin-card" data-admin-section="packs"><p class="notice warning">L’édition des Level Packs n’est pas disponible pour le moment.</p></section>';
 const levels=(state.data.demons||[]).filter(d=>d.is_public!==false&&!d.legacy&&!d.unrated&&(state.staffRole!=='nlw'||Number(d.position)>150&&Number(d.position)<100000000)).sort((a,b)=>Number(a.position)-Number(b.position));
 const packs=(state.data.dlfr_level_packs||[]).slice().sort((a,b)=>Number(b.id)-Number(a.id));
 return `<section class="admin-card dlfr27-pack-editor" data-admin-section="packs"><h2>Créer / modifier un Level Pack</h2><p class="small muted">Choisis de 2 à 30 niveaux publics. Les récompenses sont attribuées après validation des niveaux à 100 %. Les niveaux et la récompense sont verrouillés dès le premier gain.</p>
 <label class="field">Pack à modifier<select id="dlfr27PackSelect"><option value="">＋ Nouveau Level Pack</option>${packs.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}${p.is_published?'':' · brouillon'}</option>`).join('')}</select></label>
 <form data-form="levelPackEditor"><input type="hidden" name="pack_id"><label class="field">Nom du pack<input name="title" required maxlength="110" placeholder="Ex. Les étoiles de la NLW"></label><label class="field">Description<textarea name="description" maxlength="1500" rows="3"></textarea></label><label class="field">Bannière (URL HTTPS, facultative)<input type="url" name="banner_url" maxlength="500"></label><div class="two-col"><label class="field">Type de récompense<select name="reward_kind"><option value="badge">Badge et cadre de profil</option><option value="title">Tag / titre officiel</option></select></label><label class="field">Nom de la récompense<input name="reward_label" required maxlength="80" placeholder="Explorateur de la NLW"></label></div>
 <label class="field">Rechercher un niveau<input type="search" id="dlfr27PackLevelSearch" placeholder="Filtrer par nom ou rang"></label><div class="dlfr27-pack-level-picker">${levels.map(d=>`<label data-pack-level-row data-search="${esc(key(d.name+' '+d.position))}"><input type="checkbox" name="level_ids" value="${esc(d.id)}"><span>${Number(d.position)>150?'NLW #'+esc(Number(d.position)-150):'#'+esc(d.position)} · ${esc(d.name)}</span></label>`).join('')}</div><label class="field"><input type="checkbox" name="is_published"> Publier le pack</label><button class="btn" type="submit">Enregistrer le pack</button></form><p class="small muted">Un modérateur NLW ne peut créer des packs qu'avec les niveaux NLW. Les permissions sont vérifiées côté Supabase.</p></section>`;
}
function fillPackEditor(id){
 const form=document.querySelector('[data-form="levelPackEditor"]');if(!form)return;
 form.reset();form.elements.pack_id.value='';
 const p=(state.data.dlfr_level_packs||[]).find(x=>Number(x.id)===Number(id));
 if(!p)return;
 form.elements.pack_id.value=p.id;
 for(const field of ['title','description','banner_url','reward_kind','reward_label'])form.elements[field].value=p[field]||'';
 form.elements.is_published.checked=!!p.is_published;
 const selected=new Set((state.data.dlfr_level_pack_levels||[]).filter(x=>Number(x.pack_id)===Number(p.id)).map(x=>Number(x.demon_id)));
 form.querySelectorAll('input[name="level_ids"]').forEach(x=>{x.checked=selected.has(Number(x.value));});
}
async function savePackForm(form){
 if(!state.staff||ownerPreviewActive())throw Error('Action indisponible en mode aperçu.');
 const f=new FormData(form);let selected=f.getAll('level_ids').map(Number);
 const existing=(state.data.dlfr_level_pack_claims||[]).some(x=>Number(x.pack_id)===Number(f.get('pack_id')));
 if(existing){const ordered=(state.data.dlfr_level_pack_levels||[]).filter(x=>Number(x.pack_id)===Number(f.get('pack_id'))).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order)).map(x=>Number(x.demon_id));if(selected.length===ordered.length&&selected.every(x=>ordered.includes(x)))selected=ordered;}
 if(selected.length<2||selected.length>30)throw Error('Sélectionne 2 à 30 niveaux.');
 const {error}=await db.rpc('dlfr_save_level_pack',{
   p_pack_id:Number(f.get('pack_id'))||null,p_title:String(f.get('title')||''),p_description:String(f.get('description')||''),
   p_banner_url:String(f.get('banner_url')||''),p_reward_kind:String(f.get('reward_kind')||''),
   p_reward_label:String(f.get('reward_label')||''),p_level_ids:selected,p_is_published:f.has('is_published')
 });
 if(error)throw Error(error.message);
 await Promise.all(packTables.map(async table=>{state.data[table]=await readAll(table);}));
 optionalStatus.packs='ready';state.packsReady=true;
 toast('Level Pack enregistré !');render();
}
async function claimPack(packId){
 if(!state.session||!state.ownKey)throw Error('Connecte ton profil DLFR.');
 const {error}=await db.rpc('dlfr_claim_level_pack',{p_pack_id:Number(packId)});
 if(error)throw Error(error.message);
 await refreshLiveData();toast('Récompense obtenue !');render();
}
async function saveFrame(form){
 if(!state.session||!state.ownKey)throw Error('Compte joueur non connecté.');
 const {error}=await db.rpc('dlfr_choose_profile_frame',{p_frame_key:form.elements.frame_key.value});
 if(error)throw Error(error.message);
 state.data.dlfr_profile_preferences=await readAll('dlfr_profile_preferences');toast('Cadre de profil enregistré !');render();
}
function setupDiscordServerLink(){
 const nav=document.querySelector('.nav-tools');if(!nav)return;
 const raw=plain(C.discordInviteUrl);
 let dest='';try{const u=new URL(raw);if(u.protocol==='https:'&&(u.hostname==='discord.gg'||u.hostname==='discord.com'||u.hostname==='www.discord.com')&&(u.hostname==='discord.gg'||/^\/invite\//.test(u.pathname)))dest=u.href;}catch{}
 if(!dest)return;
 const a=document.createElement('a');a.className='dlfr27-discord-link';a.href=dest;a.target='_blank';a.rel='noopener noreferrer';a.textContent='◈ Rejoindre le Discord';nav.prepend(a);
}

function playerPage(){
 const requested=key(new URLSearchParams(location.search).get('player'));
 const player=ranked().find(p=>p.player_key===requested&&statsPlayerVisible(p));
 if(!player)return `<section class="paper dlfr24-public"><h1>Profil introuvable</h1><p class="muted">Ce joueur n’existe pas ou sa fiche n’est pas publique.</p><a data-nav class="btn subtle" href="${url('players')}">Voir les profils</a></section>`;
 state.selectedPlayer=player.player_key;
 return `${templateNotice()}<section class="paper dlfr24-public"><div class="dlfr24-breadcrumb"><a class="link" data-nav href="${url('players')}">Profils des joueurs</a><span aria-hidden="true">›</span><span>${esc(fullName(player))}</span></div>
 <div class="dlfr24-profile-head"><div><span class="kicker">Fiche publique DLFR</span><h1>${flag(player.country_code)} ${esc(fullName(player))}</h1><p class="muted">Présentation, performances, distinctions et vitrine communautaire.</p></div><div class="dlfr24-profile-actions"><a data-nav class="btn subtle small" href="${url('stats')}">Classements ↗</a>${state.ownKey===player.player_key?`<a data-nav class="btn small" href="${url('my-profile')}">Modifier mon profil</a>`:''}</div></div>
 <div id="profileContent">${statProfile(player)}</div></section>`;
}
function playersPage(){
 const players=ranked().filter(statsPlayerVisible);
 const items=players.map(p=>{
   const profile=profileByKey().get(p.player_key)||{};
   const avatar=avatarOf(p.player_key,profile);
   return `<a class="dlfr24-player-card ${p.has_account?'':'unclaimed'} ${v90Cls(V90_FX.items[p.player_key])}" data-nav href="${url('player',{player:p.player_key})}" data-profile-search="${esc(key(fullName(p)))}">
     ${framedAvatar(p.player_key,`<span class="dlfr24-player-avatar">${avatar?`<img loading="lazy" src="${esc(avatar)}" alt="">`:esc(fullName(p).slice(0,1).toUpperCase()||'?')}</span>`)}
     <span class="dlfr24-player-info"><strong>${flag(p.country_code)} ${esc(fullName(p))}</strong><small>${p.rank?'#'+p.rank+' · ':''}${fmt(p.score)} pts · ${p.has_account?'Compte lié':'Sans compte'}</small></span><span aria-hidden="true">↗</span></a>`;
 }).join('');
 return `${templateNotice()}<section class="paper dlfr24-directory"><div class="dlfr24-directory-head"><div><span class="kicker">Communauté</span><h1>Profils des joueurs</h1><p class="muted">Retrouve la fiche publique d’un joueur sans passer par les statistiques.</p></div><a class="btn subtle small" data-nav href="${url('stats')}">Voir les classements</a></div><label class="filterbox"><span aria-hidden="true">⌕</span><input id="dlfr24ProfileSearch" type="search" placeholder="Chercher un joueur…" aria-label="Rechercher un profil"></label><div id="dlfr24PlayerList" class="dlfr24-player-grid">${items}</div><p class="muted small" id="dlfr24NoProfiles" hidden>Aucun joueur ne correspond à cette recherche.</p></section>`;
}
// DLFR 2.5.1 — carte compacte dans Statistiques. La page joueur reste indépendante.
function statsProfilePreview(p){
 if(!p)return `<div class="dlfr251-preview-empty"><h3>Aucun joueur sélectionné</h3><p class="muted small">Choisis un joueur dans le classement pour afficher un aperçu ici.</p></div>`;
 const profile=profileByKey().get(p.player_key)||{};
 const pref=(state.data.dlfr_profile_preferences||[]).find(v=>v.player_key===p.player_key)||{};
 const banner=imageLink(profile.banner_url),avatar=avatarOf(p.player_key,profile);
 const name=fullName(p),initial=(name||'?').slice(0,1).toUpperCase();
 const accent=COMMUNITY.hex(pref.accent_color);
 const titles=state.communityReady?COMMUNITY.ownedTitles(state.data,p.player_key):[];
 const featured=titles.find(t=>String(t.id)===String(pref.featured_title_id));
 const mainCount=new Set(p.main.map(d=>d.id)).size,extendedCount=new Set(p.extended.map(d=>d.id)).size;
 const fxItems=V90_FX.items[p.player_key];
 return `<article class="dlfr251-preview ${v90Cls(fxItems)}" style="--dlfr251-accent:${esc(accent)}" aria-label="Aperçu de ${esc(name)}">
   <div class="dlfr251-preview-banner ${fxItems?.length?'v90-hero':''}">${banner?`<img loading="lazy" src="${esc(banner)}" alt="">`:''}${v90LayerHTML(fxItems)}</div>
   <div class="dlfr251-preview-content">
    <div class="dlfr251-preview-identity">${framedAvatar(p.player_key,`<span class="dlfr251-preview-avatar">${avatar?`<img loading="lazy" src="${esc(avatar)}" alt="Avatar de ${esc(name)}">`:`<span aria-hidden="true">${esc(initial)}</span>`}</span>`)}<div class="dlfr251-preview-name"><h3 class="${fxItems?.length?'v90-name':''}">${flag(p.country_code)} ${esc(name)}</h3><p class="muted small">${p.has_account?'Compte DLFR':'Profil non revendiqué'} ${p.country_code==='FR'?`· ${esc(GEO.regionInfo(regionFor(p))?.name||'France')}`:''}</p></div></div>
    ${featured?`<p class="dlfr251-preview-title">✦ ${esc(featured.label)}</p>`:''}
    <div class="dlfr251-preview-stats">${box('Rang DLFR',p.rank?'#'+p.rank:'—')}${box('Points Top 150',fmt(p.score))}${box('Points NLW',fmt(p.nlwScore||0))}${box('Rang NLW',p.nlwRank?'#'+p.nlwRank:'—')}${box('Hardest',hardestLabel(p))}${box('Main List',mainCount)}${box('Extended',extendedCount)}${box('NLW',p.beyond.length)}</div>
    ${profile.bio?`<p class="dlfr251-preview-bio">${esc(profile.bio)}</p>`:''}
    <a data-nav class="btn dlfr251-preview-open" href="${url('player',{player:p.player_key})}">Voir le profil complet ↗</a>
   </div>
 </article>`;
}
function chooseStatsPreview(playerKey){
 const player=getPlayer(playerKey);if(!statsPlayerVisible(player))return;
 state.selectedPlayer=player.player_key;
 const preview=$('dlfr251StatsPreview');if(preview)preview.innerHTML=statsProfilePreview(player);
 document.querySelectorAll('#rankList [data-stats-preview]').forEach(row=>{
  const selected=row.dataset.statsPreview===player.player_key;
  row.classList.toggle('selected',selected);row.setAttribute('aria-pressed',String(selected));
 });
}
function nlwLeaderboardHtml(users,countries){
 // Mêmes filtres, liste et aperçu que le classement principal.
 const nlw=users.filter(p=>p.nlwScore>0).sort((a,b)=>b.nlwScore-a.nlwScore||fullName(a).localeCompare(fullName(b),'fr'));
 const chosen=nlw.find(p=>p.player_key===state.selectedPlayer)||nlw[0]||null;
 if(chosen)state.selectedPlayer=chosen.player_key;
 const options=countries.map(c=>`<option value="${esc(c)}" ${c===state.country?'selected':''}>${c==='MONDE'?'MONDE - International':GEO.countryName(c)+' ('+esc(c)+')'}</option>`).join('');
 return `<div class="dlfr24-stats-ranking dlfr251-stats-layout dlfr212-nlw-stats"><div class="ranking-panel"><div class="kicker">Classement NLW</div><p class="small muted">${nlw.length} joueurs dans cette sélection · points distincts du Top 150</p>
 <div class="country-select-row"><span id="countryFilterPreview">${flag(state.country)}</span><select id="countryFilter" aria-label="Filtrer la NLW par pays">${options}</select></div>
 ${state.country==='FR'?`<div class="country-select-row"><span>${GEO.regionImage(state.region)}</span><select id="regionFilter" aria-label="Filtrer par région"><option value="ALL">Toutes les régions</option>${GEO.regions.map(r=>`<option value="${r.code}" ${state.region===r.code?'selected':''}>${esc(r.name)}</option>`).join('')}</select></div>`:''}
 <label class="filterbox" style="margin-top:9px"><span>⌕</span><input id="playerSearch" type="search" placeholder="Rechercher un joueur NLW…" value="${esc(state.keyword)}"></label>
 <div class="rank-list" id="rankList">${rankRows(nlw,chosen,'nlw')}</div><p class="small muted">Sélectionne un joueur pour voir son aperçu, puis accéder à son profil complet.</p></div>
 <aside id="dlfr251StatsPreview" class="dlfr251-preview-column" aria-live="polite">${statsProfilePreview(chosen)}</aside></div></section>`;
}
function statsPage(){const users=ranked().filter(statsPlayerVisible);const countries=['MONDE',...new Set(users.map(p=>p.country_code).filter(Boolean))].sort((a,b)=>a==='MONDE'?-1:b==='MONDE'?1:a.localeCompare(b));
 const filtered=users.filter(p=>(state.country==='MONDE'||p.country_code===state.country)&&(state.country!=='FR'||state.region==='ALL'||regionFor(p)===state.region)&&key(fullName(p)).includes(key(state.keyword)));
 const chosen=filtered.find(p=>p.player_key===state.selectedPlayer)||filtered[0]||null;if(chosen)state.selectedPlayer=chosen.player_key;
 const top=`${templateNotice()}<section class="paper stats-main"><div class="center-panel" style="box-shadow:none;border:0;padding:13px 0 4px"><h1>Statistiques</h1><p>Joueurs, pays et progression de la communauté francophone.</p></div>${statsOverview()}
 <div class="switch-tabs"><button type="button" data-stats-tab="players" class="${state.statsTab==='players'?'active':''}">Joueurs</button><button type="button" data-stats-tab="countries" class="${state.statsTab==='countries'?'active':''}">Pays</button><button type="button" data-stats-tab="nlw" class="${state.statsTab==='nlw'?'active':''}">Classement NLW</button><button type="button" data-stats-tab="unrated" class="${state.statsTab==='unrated'?'active':''}">UNRATED</button><button type="button" data-stats-tab="compare" class="${state.statsTab==='compare'?'active':''}">Comparaison</button></div>`;
 if(state.statsTab==='unrated'){const u=unratedData(),active=u.players.filter(x=>x.points||x.completions||x.verifications),p=getPlayer(state.selectedPlayer);return top+`<div class="notice"><b>UNRATED — statistiques simulées</b><p>Ces points correspondent uniquement aux démons UNRATED, calculés sur leurs positions estimées lorsque le mode UNRATED est activé. Ils ne sont pas des points officiels.</p><button type="button" class="btn subtle small" data-action="toggleUnratedStats">${state.unrated?'Revenir au classement officiel':'Activer le classement UNRATED'}</button></div><div class="overview-stats">${box('Niveaux UNRATED',u.demons.length)}${box('Complétions UNRATED',u.totalCompletions)}${box('Vérifications UNRATED',u.totalVerifications)}${box('Joueurs concernés',active.length)}</div><h3>Classement des points UNRATED</h3><div class="record-table-wrap"><table class="record-table"><thead><tr><th>Rang</th><th>Joueur</th><th>Complétés</th><th>Vérifiés</th><th>Points simulés</th></tr></thead><tbody>${active.map((x,i)=>`<tr><td>#${i+1}</td><td><a class="link" data-nav href="${url('player',{player:x.player_key})}">${esc(x.name)}</a></td><td>${x.completions}</td><td>${x.verifications}</td><td><b>${fmt(x.points)}</b></td></tr>`).join('')||'<tr><td colspan="5">Aucune donnée UNRATED pour le moment.</td></tr>'}</tbody></table></div><h3>Niveaux UNRATED et positions estimées</h3><div class="record-table-wrap"><table class="record-table"><thead><tr><th>Position en mode UNRATED</th><th>Niveau</th><th>Vérificateur</th><th>Points à 100 %</th></tr></thead><tbody>${u.demons.map(d=>`<tr><td>#${d.position}</td><td><a class="link" data-nav href="${url('demon',{id:d.id})}">${esc(d.name)}</a></td><td>${esc(d.verifier||'—')}</td><td>${fmt(V2.actualPoints(d,100,num(cfg().top1_points)))}</td></tr>`).join('')||'<tr><td colspan="4">Aucun niveau UNRATED.</td></tr>'}</tbody></table></div></section>`;}
 if(state.statsTab==='nlw')return top+nlwLeaderboardHtml(filtered,countries);
 if(state.statsTab==='countries')return top+`<div class="record-table-wrap"><table class="record-table"><thead><tr><th>Rang</th><th>Pays</th><th>Points cumulés</th><th>Joueurs</th><th>Complétions</th><th>Meilleur joueur</th></tr></thead><tbody>${countryRows().map((c,i)=>`<tr><td>#${i+1}</td><td>${flag(c.code)} ${esc(c.code==='??'?'Non renseigné':c.code)}</td><td><b>${fmt(c.score)}</b></td><td>${c.players}</td><td>${c.records}</td><td>${esc(fullName(c.leader))}</td></tr>`).join('')}</tbody></table></div><p class="muted small">Joueurs historiques inclus, même sans compte Discord lié. Les profils sans pays renseigné sont regroupés sous « Non renseigné ».</p></section>`;
 if(state.statsTab==='compare'){const a=chosen||users[0],b=users.find(p=>p.player_key===state.comparePlayer)||users.find(p=>p.player_key!==a?.player_key);return top+`<div class="compare-panel"><div class="compare-selects"><label>Joueur A <select id="compareA">${users.map(p=>`<option value="${esc(p.player_key)}" ${p.player_key===a?.player_key?'selected':''}>${esc(fullName(p))}</option>`).join('')}</select></label><label>Joueur B <select id="compareB">${users.filter(p=>p.player_key!==a?.player_key).map(p=>`<option value="${esc(p.player_key)}" ${p.player_key===b?.player_key?'selected':''}>${esc(fullName(p))}</option>`).join('')}</select></label></div>${a?comparison(a,b):'<p class="empty">Pas de joueurs.</p>'}</div></section>`;}
 return top+`<div class="dlfr24-stats-ranking dlfr251-stats-layout"><div class="ranking-panel"><div class="kicker">International</div><div class="country-select-row"><span id="countryFilterPreview">${flag(state.country)}</span><select id="countryFilter" aria-label="Filtrer par pays">${countries.map(c=>`<option value="${esc(c)}" ${c===state.country?'selected':''}>${c==='MONDE'?'MONDE - International':GEO.countryName(c)+' ('+esc(c)+')'}</option>`).join('')}</select></div>${state.country==='FR'?`<div class="country-select-row"><span>${GEO.regionImage(state.region)}</span><select id="regionFilter" aria-label="Filtrer par région française"><option value="ALL">Toutes les régions</option>${GEO.regions.map(r=>`<option value="${r.code}" ${state.region===r.code?'selected':''}>${esc(r.name)}</option>`).join('')}</select></div>`:''}<label class="filterbox" style="margin-top:9px"><span>⌕</span><input type="search" id="playerSearch" placeholder="Rechercher un joueur…" value="${esc(state.keyword)}"></label><div class="rank-list" id="rankList">${rankRows(filtered,chosen)}</div><p class="muted small">Clique sur un joueur pour afficher son aperçu. Ouvre ensuite sa fiche complète depuis la carte à droite. Les profils sans compte apparaissent en gris.</p></div><aside id="dlfr251StatsPreview" class="dlfr251-preview-column" aria-live="polite">${statsProfilePreview(chosen)}</aside></div></section>`;
}
function rankRows(users,chosen,mode='main'){return users.length?users.map(p=>`<button type="button" data-stats-preview="${esc(p.player_key)}" aria-pressed="${p.player_key===chosen?.player_key}" class="rank-item ${p.has_account?'':'unclaimed'} ${p.player_key===chosen?.player_key?'selected':''} ${v90Cls(V90_FX.items[p.player_key])}"><span class="rank-num">#${mode==='nlw'?(p.nlwRank||'-'):(p.rank||'-')}</span><span class="rank-name">${flag(p.country_code)} ${regionFlag(p)} ${esc(p.display_name||p.username)}${V90_FX.items[p.player_key]?.length?`<span class="v90-row-fx" aria-hidden="true">${v90Emojis(V90_FX.items[p.player_key])}</span>`:''}</span><span class="rank-score">${fmt(mode==='nlw'?p.nlwScore:p.score)}</span></button>`).join(''):'<div class="empty">Aucun joueur trouvé.</div>';}
function demonPage(){
 const id=Number(new URLSearchParams(location.search).get('id'));
 const d=catalog().find(x=>Number(x.id)===id);
 if(!d)return '<div class="center-panel">Niveau introuvable.</div>';
 const recs=state.data.completions.filter(c=>Number(c.demon_id)===id);
 const r=V2.nlwRank(d),isNlw=r>0;
 const status=isNlw?'NLW #'+r:d.legacy?'Legacy · ancien Top 150':Number(d.position)<=cfg().main_limit?'Main List #'+d.position:Number(d.position)<=cfg().extended_limit?'Extended List #'+d.position:'Hors classement';
 const points=isNlw?fmt(nlwPoints(d))+' points NLW':Number(d.position)>cfg().extended_limit?'0 point officiel':fmt(score(d,100))+' points à 100 %';
 // Clone destiné au rendu seulement : ne modifie jamais la fiche enregistrée.
 const displayedDemon=isNlw?{...d,verifier:displayedLevelVerifier(d)}:d;
 return templateNotice()+window.DLFR_LEVEL_CINEMA.render(displayedDemon,{
  records:recs,players:ranked().filter(statsPlayerVisible),history:state.data.demon_position_history||[],
  escape:esc,link:url,format:fmt,formatDate:date,status,points,
  listTab:isNlw?'nlw':d.legacy?'legacy':'main',proofHtml:window.DLFR_BULK.proof(d)+productionProofMedia(d)+window.DLFR_CLAIMS.claimPanel(d,state)
 });
}
function newsPage(){const all=[...state.data.news_items].filter(x=>x.is_published||hasFullStaffPowers()).sort((a,b)=>(+(!!b.is_pinned)-+(!!a.is_pinned))||new Date(b.created_at)-new Date(a.created_at));
 const items=all.filter(n=>(state.newsFilter==='all'||getNewsCategory(n)===state.newsFilter)&&`${key(n.headline)} ${key(n.body)} ${key(n.player_name)}`.includes(key(state.newsSearch)));
 const categories=['all','Annonce','Record','Classement','Communauté'];
 return `${templateNotice()}<div class="paper news-page"><div class="center-panel" style="box-shadow:none;border:0"><h1>Actualités</h1><p>Informations, nouveaux records et événements de la communauté.</p></div><div class="news-controls"><div class="news-filters">${categories.map(c=>`<button type="button" class="${state.newsFilter===c?'active':''}" data-news-filter="${esc(c)}">${c==='all'?'Tout voir':esc(c)}</button>`).join('')}</div><label class="filterbox"><span>⌕</span><input id="newsSearch" type="search" value="${esc(state.newsSearch)}" placeholder="Rechercher une actualité"></label></div><div id="newsItems">${newsItemsHTML(items)}</div></div>`;
}
const V79_REACTIONS=['❤️','🔥','👏','💜','🎉'];
function v79ReactionBar(target){
 if(!state.data?.dlfr_reactions)return '';
 const rows=(state.data.dlfr_reactions||[]).filter(r=>r.target_key===target);
 return `<div class="v79-reactions" aria-label="Réactions">${V79_REACTIONS.map(emoji=>{
 const matched=rows.filter(r=>r.emoji===emoji),mine=!!state.session&&matched.some(r=>r.auth_user_id===state.session.user.id);
 return `<button type="button" data-v79-react="${esc(target)}" data-v79-emoji="${esc(emoji)}" class="v79-reaction ${mine?'selected':''}" aria-pressed="${mine}" title="${esc(emoji)}">${esc(emoji)} <small>${matched.length||''}</small></button>`;
 }).join('')}</div>`;
}
function newsItemsHTML(items){return items.length?items.map(n=>`<article class="news-card ${n.is_pinned?'pinned':''}"><div class="news-meta"><span class="news-category">${esc(getNewsCategory(n))}</span>${n.is_pinned?'<span class="news-pin">★ À la une</span>':''}<time>${date(n.created_at)}${!n.is_published?' · Brouillon':''}</time></div><h3>${esc(n.headline)}</h3><p class="news-body">${esc(n.body)}</p>${newsMedia(n)}${v79ReactionBar('news:'+n.id)}${n.player_name?`<a class="tag" href="${url('player',{player:key(n.player_name)})}" data-nav>${esc(n.player_name)}</a>`:''}${hasFullStaffPowers()?`<div class="news-editor-actions"><button class="btn subtle small" data-edit-news="${n.id}">Modifier</button><button class="btn subtle small" data-toggle-news="${n.id}">${n.is_published?'Mettre en brouillon':'Publier'}</button></div>`:''}</article>`).join(''):'<p class="empty">Aucune actualité trouvée.</p>';}
// Un champ de modération ne doit proposer que de vrais joueurs enregistrés.
const playerOptions=()=>state.data.players.slice().sort((a,b)=>sortPlayerName(a).localeCompare(sortPlayerName(b),'fr')).map(x=>`<option value="${esc(x.player_key)}">${esc(sortPlayerName(x))}</option>`).join('');
// Ne retirer QUE les véritables sources de fusion enregistrées en base.
// hidden_from_stats n'est pas un indicateur de fusion : d'autres joueurs peuvent être masqués.
const mergeCandidates=()=>{
 const merged=new Set((state.mergedSourceKeys||[]).map(key));
 return (state.data.players||[]).filter(p=>!merged.has(key(p.player_key))).slice().sort((a,b)=>sortPlayerName(a).localeCompare(sortPlayerName(b),'fr'));
};
const mergePlayerOptions=()=>{
 const candidates=mergeCandidates(),names=new Map();
 candidates.forEach(p=>{const name=key(sortPlayerName(p));names.set(name,(names.get(name)||0)+1);});
 return candidates.map(p=>{
  const name=sortPlayerName(p),label=names.get(key(name))>1?`${name} (${p.player_key})`:name;
  return `<option value="${esc(p.player_key)}">${esc(label)}</option>`;
 }).join('');
};

const submitLevelList=()=>(state.data.demons||[]).filter(d=>d.is_public!==false&&!d.legacy).slice().sort((a,b)=>num(a.unrated?a.unrated_position+1e9:a.position)-num(b.unrated?b.unrated_position+1e9:b.position));
const submitLevelLabel=d=>d.unrated?'UNRATED #'+num(d.unrated_position):num(d.position)>num(cfg().extended_limit)?'NLW #'+(num(d.position)-num(cfg().extended_limit)):'#'+num(d.position);
const submitIsYoutube=v=>{try{const u=new URL(plain(v));return u.protocol==='https:'&&/^(www\.|m\.)?(youtube\.com|youtu\.be)$/i.test(u.hostname);}catch{return false;}};
// V59 — historique personnel ; ne jamais sélectionner par pseudo seul.
// L'identité Auth de la soumission reste la source de vérité (même si la fiche change).
function mySubmissionRows(){
 if(!state.session?.user?.id)return [];
 const uid=state.session.user.id;
 return (state.data?.level_submissions||[])
   .filter(r=>r.auth_user_id===uid)
   .slice().sort((a,b)=>(Date.parse(b.created_at||0)||0)-(Date.parse(a.created_at||0)||0)||Number(b.id||0)-Number(a.id||0));
}
function normalizedSubmissionStatus(value){
 const v=key(value);
 if(v==='approved'||v==='accepted')return 'approved';
 if(v==='rejected'||v==='refused')return 'rejected';
 return 'pending';
}
function submissionStatusMeta(status){
 switch(normalizedSubmissionStatus(status)){
  case 'approved':return {label:'Acceptée',cls:'approved',description:'Validée par la modération'};
  case 'rejected':return {label:'Refusée',cls:'rejected',description:'Non retenue par la modération'};
  default:return {label:'En attente',cls:'pending',description:'En cours de vérification'};
 }
}
function mySubmissionsTeaser(){
 if(!state.session)return '';
 const rows=mySubmissionRows(),pending=rows.filter(x=>normalizedSubmissionStatus(x.status)==='pending').length;
 return `<div class="v59-my-submissions-link"><div><strong>Mes soumissions</strong><p class="small muted">${rows.length} soumission(s) envoyée(s) · ${pending} en attente</p></div><a class="btn subtle small" data-nav href="${url('my-submissions')}">Suivre mes soumissions ↗</a></div>`;
}
function mySubmissionsPage(){
 if(!state.session)return `${templateNotice()}<section class="paper v59-submission-dashboard"><h1>Mes soumissions</h1><p>Connecte-toi pour consulter l'historique de tes demandes.</p><a class="btn" data-nav href="${url('my-profile')}">Me connecter</a></section>`;
 const rows=mySubmissionRows();
 const counts={all:rows.length,pending:0,approved:0,rejected:0};
 for(const r of rows)counts[normalizedSubmissionStatus(r.status)]++;
 const f=state.mySubmissionFilter;
 const needle=key(state.mySubmissionSearch);
 const filtered=rows.filter(r=>(f==='all'||normalizedSubmissionStatus(r.status)===f)&&(!needle||key([r.level_name,r.level_id,r.id].join(' ')).includes(needle)));
 const filterButton=(k,label)=>`<button type="button" class="v59-filter ${f===k?'active':''}" data-my-submission-filter="${k}" aria-pressed="${f===k}">${label} <span>${counts[k]}</span></button>`;
 const cards=filtered.map(r=>{
  const meta=submissionStatusMeta(r.status);
  const d=(state.data?.demons||[]).find(x=>Number(x.id)===Number(r.demon_id));
  const title=plain(r.level_name)||(d?.name||'Niveau non renseigné');
  const statusDate=r.reviewed_at&&meta.cls!=='pending'?` · Examinée le ${esc(date(r.reviewed_at))}`:'';
  const reviewer=state.mySubmissionReviewAuthors?.[String(r.id)];
  const reviewerName=reviewer?.name||'la modération';
  const reviewerKey=reviewer?.playerKey;
  const reviewerLabel=reviewerKey && (state.data.players||[]).some(p=>p.player_key===reviewerKey)
   ? `<a class="link" data-nav href="${url('player',{player:reviewerKey})}">${esc(reviewerName)}</a>`
   : esc(reviewerName);
  const reviewTitle=reviewer ? `Message de ${reviewerLabel}` : 'Message de la modération';
  const levelLink=meta.cls==='approved'&&d?`<a class="link" data-nav href="${url('demon',{id:d.id})}">Voir le niveau ↗</a>`:'';
  return `<article class="v59-submission-card v59-${meta.cls}">
   <div class="v59-submission-top"><div><h3>${esc(title)}</h3><p class="small muted">Soumission n°${esc(r.id)} · ${esc(date(r.created_at)||'Date inconnue')}${statusDate}</p></div><span class="v59-status v59-status-${meta.cls}">${esc(meta.label)}</span></div>
   <p class="v59-submission-details"><span>${esc(r.progress||100)} %</span>${r.level_id?`<span>ID GD : ${esc(r.level_id)}</span>`:''}<span>${esc(meta.description)}</span></p>
   ${r.review_message&&meta.cls!=='pending'?`<div class="dlfr-review-message"><strong>${reviewTitle}</strong><p>${esc(r.review_message)}</p></div>`:''}
   <div class="v59-submission-links">${http(r.video_url)?`<a class="link" href="${esc(http(r.video_url))}" target="_blank" rel="noopener noreferrer">Vidéo de preuve ↗</a>`:''}${levelLink}</div>
  </article>`;
 }).join('');
 return `${templateNotice()}<section class="paper v59-submission-dashboard"><div class="v59-submission-heading"><div><h1>Mes soumissions</h1><p>Retrouve tes records envoyés à la modération et leur état, comme sur l’AREDL.</p></div><button class="btn subtle small" type="button" data-action="refreshMySubmissions">↻ Actualiser</button></div>
 <div class="v59-submission-counters"><div><b>${counts.pending}</b><span>En attente</span></div><div><b>${counts.approved}</b><span>Acceptées</span></div><div><b>${counts.rejected}</b><span>Refusées</span></div></div>
 <div class="v59-submission-filters" role="group" aria-label="Filtrer mes soumissions">${filterButton('all','Toutes')}${filterButton('pending','En attente')}${filterButton('approved','Acceptées')}${filterButton('rejected','Refusées')}</div>
 <label class="field v59-submission-search">Rechercher un niveau ou un ID<input id="mySubmissionSearch" type="search" placeholder="Nom du niveau, ID GD, numéro de soumission…" value="${esc(state.mySubmissionSearch)}" autocomplete="off"></label>
 <div class="v59-submission-results" id="mySubmissionResults">${cards||`<div class="v59-submission-empty"><strong>${rows.length?'Aucune soumission dans cette sélection.':'Tu n’as encore envoyé aucune soumission.'}</strong><p class="muted small">${rows.length?'Change de filtre ou efface ta recherche.':'Tes futurs envois et décisions de modération apparaîtront ici.'}</p></div>`}</div>
 <p class="small muted v59-submission-note">Une soumission acceptée n’est pas nécessairement déjà visible dans la liste publique si la publication du niveau attend encore une décision. Les messages envoyés par les modérateurs apparaissent sur les soumissions traitées.</p>
 <a class="btn" data-nav href="${url('submit-record')}">＋ Soumettre un record</a></section>`;
}
function submissionPriorRecord(demon, playerKey){
 if(!demon||!playerKey)return null;
 const profile=(state.data?.players||[]).find(p=>p.player_key===playerKey);
 const aliases=new Set([playerKey,profile?.username,profile?.display_name].filter(Boolean).map(key));
 return (state.data?.completions||[]).filter(c=>Number(c.demon_id)===Number(demon.id)&&aliases.has(key(c.player)))
   .sort((a,b)=>Number(b.progress||0)-Number(a.progress||0))[0]||null;
}
function submissionPriorWarning(demon, progress){
 const prev=submissionPriorRecord(demon,state.ownKey);
 if(!prev)return '';
 const former=Number(prev.progress||0);
 return former>=progress ? `Tu as déjà un record de ${former} % sur ce niveau (y compris les records importés). Une nouvelle soumission à ${progress} % serait un doublon.` : `Tu as déjà ${former} % sur ce niveau. Tu peux soumettre une amélioration à ${progress} %.`;
}
function submitRecordPage(){
 const owner=(state.data.players||[]).find(p=>p.player_key===state.ownKey);
 const myName=owner?.username||'';
 const ready=!!(state.session&&state.ownKey&&myName);
 const levels=submitLevelList();
 const hasExisting=levels.length>0;
 return `${templateNotice()}<section class="paper v2-page dlfr-submit-clean"><div class="v2-intro"><h1>Soumettre un record</h1><p>Ton niveau est déjà dans la liste ? Sélectionne-le. Sinon, tu peux proposer un nouveau niveau avec ta preuve vidéo.</p></div>
 ${!ready?`<div class="notice warning">${!state.session?'Connecte-toi à ton compte DLFR.':'Associe ou crée ta fiche joueur dans Mon profil pour participer.'}</div><a href="${url('my-profile')}" data-nav class="btn">Accéder à mon profil</a>`:
 `<form data-form="submitRecord" class="submission-form submission-simple"><div class="submission-identity"><span class="small muted">Soumission par</span><strong>${esc(myName)}</strong></div>
 <fieldset class="dlfr-submit-mode"><legend>1 · Le niveau est-il déjà sur la DLFR ?</legend>
 <div class="dlfr-submit-mode-options"><label class="dlfr-submit-mode-card"><input type="radio" name="submission_mode" value="existing" ${hasExisting?'checked':''} ${hasExisting?'':'disabled'}><span><strong>Oui, il est dans la liste</strong><small>Je soumets une complétion ou un record sur une fiche existante.</small></span></label>
 <label class="dlfr-submit-mode-card"><input type="radio" name="submission_mode" value="new" ${hasExisting?'':'checked'}><span><strong>Non, proposer un niveau</strong><small>Le niveau n’a pas encore de fiche sur la DLFR.</small></span></label></div></fieldset>
 <div id="submitExistingFields" class="dlfr-submit-fields submission-wide" ${hasExisting?'':'hidden'}>
 <div class="field"><label for="submitLevelSearch">2 · Choisis le niveau de ta complétion</label><input id="submitLevelSearch" type="search" placeholder="Rechercher par nom ou ID Geometry Dash…" autocomplete="off">
 <p class="small muted">${levels.length} niveaux disponibles, y compris les NLW après le rang 250. Recherche par nom ou ID Geometry Dash, puis sélectionne le résultat.</p>
 <select id="submitLevelSelect" name="demon_id" aria-label="Résultats de niveaux" ${hasExisting?'required':''} size="8"><option value="" selected disabled>— Choisir un niveau dans la liste —</option>${levels.map(d=>`<option value="${esc(d.id)}" data-pos="${esc(d.unrated?0:num(d.position))}" data-req="${esc(Math.max(1,Math.min(100,num(d.requirement||100))))}" data-search="${esc(key(d.name)+' '+plain(d.level_id))}">${esc(submitLevelLabel(d))} — ${esc(d.name)}</option>`).join('')}</select><div id="submitSelectedLevel" class="dlfr-submit-selected" role="status" aria-live="polite"><span>◌</span> Aucun niveau sélectionné</div></div></div>
 <div id="submitNewFields" class="dlfr-submit-fields submission-wide" ${hasExisting?'hidden':''}>
 <div class="notice small">Ce niveau n'est pas encore publié. La modération examinera sa fiche et décidera du classement avant toute publication.</div>
 <label class="field">Nom du niveau<input name="level_name" maxlength="120" minlength="2" ${hasExisting?'':'required'} placeholder="Ex. Nouveau Extreme Demon"></label>
 <label class="field">ID Geometry Dash<input name="level_id" inputmode="numeric" pattern="[0-9]+" maxlength="18" ${hasExisting?'':'required'} placeholder="ID du niveau en jeu"></label>
 <p class="small muted">Tu n'as pas besoin de renseigner le créateur, l'éditeur ou le vérificateur : les modérateurs compléteront la fiche.</p></div>
 <div class="notice warning submission-wide" id="submitDuplicateWarning" role="status" hidden></div>
 <p class="small muted submission-wide" id="submitLevelHint">Sélectionne un niveau pour voir les preuves requises.</p>
 <label class="field submission-wide">Vidéo YouTube de ta complétion<input name="video_url" type="url" required maxlength="1000" placeholder="https://youtu.be/…"></label>
 <label class="field submission-wide" id="submitRawField" hidden>Raw footage <span id="submitRawOptional">(obligatoire pour le Top 150)</span><input name="raw_footage_url" type="url" maxlength="1000" placeholder="Lien Drive, YouTube non répertorié…"></label>
 <label class="field" id="submitProgressField" hidden>Pourcentage de complétion (%)<input name="progress" type="number" min="1" max="100" value="100"></label>
 <button type="submit" class="btn">Envoyer en modération</button></form>`}${mySubmissionsTeaser()}</section>`;
}
function submitSyncForm(){
 const sel=document.getElementById('submitLevelSelect');if(!sel)return;
 const form=sel.closest('form');const mode=form?.querySelector('input[name="submission_mode"]:checked')?.value||'existing';const isNew=mode==='new';
 const existing=document.getElementById('submitExistingFields'),newFields=document.getElementById('submitNewFields');
 if(existing)existing.hidden=isNew;
 if(newFields)newFields.hidden=!isNew;
 sel.required=!isNew;
 for(const inp of newFields?.querySelectorAll('input')||[])inp.required=isNew;
 const opt=sel.value?sel.selectedOptions[0]:null,hint=document.getElementById('submitLevelHint'),raw=document.getElementById('submitRawField'),prog=document.getElementById('submitProgressField');
 const chosen=document.getElementById('submitSelectedLevel');if(chosen){chosen.classList.toggle('is-selected',!!opt&&!isNew);chosen.textContent=isNew?'Nouveau niveau à proposer':opt?'✓ Niveau sélectionné : '+opt.textContent.trim():'◌ Aucun niveau sélectionné';}
 const pos=opt?num(opt.dataset.pos):0,req=opt?num(opt.dataset.req):100;
 const top150=!isNew&&!!opt&&pos>=1&&pos<=num(cfg().extended_limit),top75=!isNew&&!!opt&&pos>=1&&pos<=num(cfg().main_limit);
 const rawLabel=document.getElementById('submitRawOptional');if(rawLabel)rawLabel.textContent=top150?'(obligatoire pour le Top 150)':'(facultatif pour une proposition hors liste)';
 raw.hidden=!(isNew||top150);raw.querySelector('input').required=top150;
 const pct=top75&&req<100;prog.hidden=!pct;const pi=prog.querySelector('input');pi.required=pct;pi.min=String(req);if(!pct)pi.value='100';else if(num(pi.value)<req)pi.value=String(req);
 const selectedDemon=!isNew&&opt?(state.data?.demons||[]).find(d=>String(d.id)===String(opt.value)):null;
 const requestedProgress=top75&&req<100?Number(pi.value||100):100;
 const warning=document.getElementById('submitDuplicateWarning');
 if(warning){const msg=submissionPriorWarning(selectedDemon,requestedProgress);warning.hidden=!msg;warning.textContent=msg;}
 hint.textContent=isNew?'Nouvelle proposition : ajoute une preuve YouTube à 100 %. Le raw footage pourra être demandé si le niveau rejoint le Top 150.':!opt?'Sélectionne un niveau pour voir ce qui est demandé.':top75?(req<100?`Top 75 : indique ton pourcentage (minimum ${req} %). Raw footage obligatoire.`:'Top 75 : complétion à 100 %. Raw footage obligatoire.'):top150?'Top 150 : complétion à 100 %. Raw footage obligatoire.':'Seule la vidéo YouTube est demandée (complétion à 100 %).';
}
function levelCreditsEditor(){
 const levels=(state.data.demons||[]).slice().sort((a,b)=>num(a.position)-num(b.position));
 if(!levels.length)return '<div class="admin-card" data-admin-section="levels">Aucun niveau disponible.</div>';
 const d=levels[0];
 return `<div class="admin-card level-studio" data-admin-section="levels"><h2>Éditeur complet de niveaux</h2>
 <p class="small muted">Les complétions existantes sont conservées. Si tu modifies le classement, consulte l’aperçu avant de confirmer.</p><p class="dlfr29-inline-step">Étape 1 sur 3 — Choisir le niveau</p>
 <label class="field" for="levelStudioSearch">Rechercher un niveau<input id="levelStudioSearch" type="search" placeholder="Nom, rang ou ID Geometry Dash…" autocomplete="off" aria-controls="levelStudioChoices" aria-expanded="false"></label>
 <div class="dlfr-level-choice-results" id="levelStudioChoices" role="group" aria-label="Niveaux à sélectionner" hidden></div>
 <form data-form="levelStudio"><div class="dlfr-level-current" id="levelStudioCurrent" role="status" aria-live="polite">Fiche sélectionnée : ${esc(d.name)}</div><select id="levelStudioSelect" name="demon_id" required hidden aria-label="Identifiant de la fiche sélectionnée"><option value="${esc(d.id)}" selected>${esc(d.name)}</option></select>
 <p class="dlfr29-inline-step">Étape 2 sur 3 — Mettre à jour la fiche</p><div class="studio-layout"><div><h3>Identité et difficulté</h3>
 <label class="field">Nom<input name="name" required maxlength="120"></label>
 <label class="field">ID Geometry Dash<input name="level_id" inputmode="numeric" maxlength="30"></label>
 <label class="field">Créateur(s)<input name="creator" maxlength="200"></label>
 <label class="field">Créateurs supplémentaires<input name="creator_more" maxlength="300"></label>
 <label class="field">Publié par<input name="publisher" required maxlength="200"></label>
 <label class="field">Vérifié par<input name="verifier" maxlength="200"></label>
 <label class="field">Difficulté<input name="difficulty" maxlength="80"></label>
 <label class="field">Progression requise (%)<input name="requirement" type="number" min="1" max="100" required></label>
 <label class="field">Mode de complétion<select name="completion_mode"><option value="standard">Standard</option><option value="solo">Solo</option><option value="two_player">2-Player</option></select></label>
 </div><div><h3>Classement et publication</h3>
 <label class="field" id="studioPositionLabel">Position globale<input name="position" type="number" min="1" max="99999998" required></label><label class="field" id="studioUnratedRankLabel" hidden>Rang UNRATED estimé<input name="unrated_position" type="number" min="1" max="99999998"></label>
 <p class="small muted">Top 150 : #1–150 · NLW #1 : 151 · NLW #5 : 155. Pour sortir un niveau du Top 150, saisis une position au-delà de 150 et coche « Legacy » uniquement si le niveau doit rejoindre les archives historiques.</p>
 <div class="notice small" id="levelStudioMoveNotice" role="status" aria-live="polite">Sélectionne un niveau et un rang pour prévisualiser le déplacement.</div>
 <label class="field"><input name="is_public" type="checkbox"> Fiche publiée</label>
 <label class="field"><input name="legacy" type="checkbox"> Niveau historique (Legacy)</label>
 <label class="field">Date Legacy<input name="legacy_since" type="date"></label>
 <label class="field">Vidéo du niveau<input name="video_url" type="url" placeholder="https://youtu.be/…"></label>
 <label class="field">Vidéo de vérification<input name="verifier_video_url" type="url"></label>
 <label class="field">URL de miniature<input name="thumbnail_url" type="url" placeholder="https://i.ytimg.com/vi/…/hqdefault.jpg"></label>
 <button type="button" class="btn subtle small" data-studio-thumbnail>Utiliser la miniature YouTube</button>
 <label class="field">Description<textarea name="description" rows="4"></textarea></label>
 <div class="studio-preview" id="levelStudioPreview">Aperçu de la miniature</div>
 </div></div>
 <p class="dlfr29-inline-step">Étape 3 sur 3 — Vérifier et confirmer</p><div class="notice warning small">Attention : le rang principal et le rang NLW partagent la colonne « position ». Les changements de position modifient les points calculés. Les complétions ne seront pas supprimées.</div>
 <label class="field"><input name="confirm_move" type="checkbox"> Je confirme un éventuel changement de classement et le décalage des niveaux concernés.</label>
 <label class="field" id="levelStudioTransferConfirm" style="display:none"><span id="levelStudioTransferCaption">Confirmation de transfert : saisis <b>TRANSFERER</b></span><input name="confirm_transfer" maxlength="10" autocomplete="off" placeholder="TRANSFERER"></label>
 <button class="btn" type="submit">Enregistrer la fiche du niveau</button></form></div>`;
}
// La liste native contenait parfois plusieurs milliers d'options : sur certains
// navigateurs, son ouverture pouvait perdre le focus. Recherche légère sans rerender.
function levelStudioChoices(query='', open=true){
 const holder=document.getElementById('levelStudioChoices');
 const input=document.getElementById('levelStudioSearch');
 if(!holder||!input)return;
 if(!open){holder.hidden=true;input.setAttribute('aria-expanded','false');return;}
 const q=key(query||'').trim();
 const levels=(state.data?.demons||[]).slice().sort((a,b)=>num(a.position)-num(b.position));
 const matches=levels.filter(d=>{
  if(!q)return true;
  const rank=d.unrated?'unrated '+num(d.unrated_position):num(d.position)>150?'nlw '+(num(d.position)-150):String(num(d.position));
  return key([d.name,d.level_id,d.id,rank].map(plain).join(' ')).includes(q);
 });
 const visible=matches.slice(0,35);
 holder.innerHTML=`<div class="dlfr-level-choice-info">${matches.length} résultat(s) · ${visible.length} affiché(s)${!q?' · tape un nom pour affiner':''}</div>`+
 visible.map(d=>`<button type="button" class="dlfr-level-choice" data-studio-pick="${esc(d.id)}"><span>${d.unrated?'UNRATED #'+esc(d.unrated_position||'?'):num(d.position)>150?'NLW #'+esc(num(d.position)-150):'#'+esc(d.position)} — ${esc(d.name)}</span><small>GD ${esc(d.level_id||'—')}</small></button>`).join('')+
 (!matches.length?'<p class="small muted">Aucun niveau trouvé. Vérifie le nom ou l’ID Geometry Dash.</p>':'');
 holder.hidden=false;
 input.setAttribute('aria-expanded','true');
}
function chooseLevelStudio(id){
 const select=document.getElementById('levelStudioSelect');
 const level=(state.data?.demons||[]).find(d=>String(d.id)===String(id));
 if(!select||!level)return;
 select.replaceChildren(new Option(String(level.name||''),String(level.id),true,true));
 const current=document.getElementById('levelStudioCurrent');
 if(current)current.textContent='Fiche sélectionnée : '+(level.unrated?'UNRATED #'+(level.unrated_position||'?'):num(level.position)>150?'NLW #'+(num(level.position)-150):'#'+num(level.position))+' — '+String(level.name||'');
 const search=document.getElementById('levelStudioSearch');
 if(search)search.value='';
 levelStudioChoices('',false);
 syncLevelStudio();
}
function syncLevelStudio(){
 const select=document.getElementById('levelStudioSelect'),form=select?.closest('form');if(!form)return;
 const d=(state.data.demons||[]).find(x=>String(x.id)===select.value);if(!d)return;
 const rankLabel=document.getElementById('studioUnratedRankLabel'),positionLabel=document.getElementById('studioPositionLabel');
 if(rankLabel)rankLabel.hidden=!d.unrated; if(positionLabel)positionLabel.hidden=!!d.unrated;
 if(form.elements.position){form.elements.position.required=!d.unrated;form.elements.position.disabled=!!d.unrated;}
 if(form.elements.unrated_position){form.elements.unrated_position.value=d.unrated?String(Number(d.unrated_position)||151):'';form.elements.unrated_position.required=!!d.unrated;}
 for(const field of ['name','level_id','creator','creator_more','publisher','verifier','difficulty','requirement','completion_mode','position','legacy_since','video_url','verifier_video_url','thumbnail_url','description']){
  if(!form.elements[field])continue;
  const v=d[field];form.elements[field].value=v==null?'':String(v);
 }
 for(const field of ['is_public','legacy'])form.elements[field].checked=!!d[field];
 form.elements.confirm_move.checked=false;
 form.elements.confirm_transfer.value='';
 updateStudioMovementPreview(form);
 updateStudioPreview(form);
}
// Rang NLW = position SQL - 150. Les positions techniques des imports cachés ne sont pas des rangs NLW.
function suggestedLegacyPosition(excludingDemonId=null){
 const last=Math.max(150,...(state.data.demons||[]).filter(d=>d.is_public===true&&!d.legacy&&!d.unrated&&Number(d.position)>150&&Number(d.position)<100000000&&(excludingDemonId===null||Number(d.id)!==Number(excludingDemonId))).map(d=>Number(d.position)));
 // Pendant un déplacement, la dernière place NLW est libérée par décalage.
 // Pour une nouvelle création, il faut en revanche une place après la NLW.
 return Math.max(151,last+(excludingDemonId===null?1:0));
}
function suggestLegacyAfterList(form){
 if(!form?.elements?.legacy?.checked||form.elements.unrated?.checked)return;
 const field=form.elements.position; if(!field)return;
 const excluded=form.dataset.form==='levelStudio'?Number(form.elements.demon_id.value):null;
 const suggested=suggestedLegacyPosition(excluded);
 if(!Number.isSafeInteger(Number(field.value))||Number(field.value)<suggested)field.value=String(suggested);
}
function updateStudioMovementPreview(form){
 const selected=form.elements.demon_id?.value;
 const level=(state.data.demons||[]).find(x=>String(x.id)===String(selected));
 const preview=document.getElementById('levelStudioMoveNotice'),confirm=document.getElementById('levelStudioTransferConfirm');
 if(!preview||!confirm||!level)return;
 const from=Number(level.position),to=Number(form.elements.position.value);
 const valid=Number.isSafeInteger(to)&&to>=1&&to<99999999;
 const legacy=form.elements.legacy.checked,unrated=!!level.unrated;
 const cross=valid&&((from<=150&&to>150)||(from>150&&from<100000000&&to<=150));
 confirm.style.display=cross?'block':'none';
 const caption=document.getElementById('levelStudioTransferCaption');
 if(caption&&cross)caption.innerHTML=from<=150
    ?'Confirmation de sortie du Top 150 : saisis <b>TRANSFERER</b>'
    :'Confirmation d’entrée dans le Top 150 : saisis <b>TRANSFERER</b>';
 if(!cross)form.elements.confirm_transfer.value='';
 if(unrated){const rank=Number(form.elements.unrated_position?.value);preview.textContent=Number.isSafeInteger(rank)&&rank>=1&&rank<=99999998?`Rang UNRATED simulé #${rank}. La position technique SQL ne sera pas modifiée.`:'Saisis un rang UNRATED estimé valide (1 à 99 999 998).';return;}
 if(!valid){preview.textContent='Saisis une position globale valide (1 à 99 999 998).';return;}
 if(legacy&&to<=150){preview.textContent='Un niveau Legacy doit être placé hors du Top 150 (position 151 ou plus).';return;}
 if(legacy&&!level.legacy&&to<suggestedLegacyPosition(level.id)){preview.textContent=`Pour garder la NLW sans trou, place le niveau Legacy après les niveaux NLW publiés : position ${suggestedLegacyPosition(level.id)} ou plus.`;return;}
 if(from===to){preview.textContent=legacy&&!level.legacy
     ?'Le niveau quittera la NLW pour apparaître dans Legacy, sans points NLW. Son numéro global reste réservé.'
     :!legacy&&level.legacy?'Le niveau quittera Legacy pour rejoindre la NLW à sa position actuelle.':'Position inchangée : seules les informations de la fiche seront enregistrées.';return;}
 if(from>150&&to<=150){
   const allowed=level.is_public===true&&!unrated&&from<100000000&&form.elements.is_public.checked&&!legacy;
   preview.textContent=allowed
     ?`${level.legacy?'Retour Legacy':'Promotion NLW #'+(from-150)} → Top 150 #${to}. Les niveaux entre les deux positions sont décalés (+1). Si le #150 est occupé, il passe en NLW #1. Les records sont conservés.`
     :'Le niveau doit être public, Rated et non Legacy à l’arrivée. Un import caché ne peut pas être transféré directement.';
   return;
 }
 if(from<=150&&to>150){
   preview.textContent=`Sortie du Top 150 #${from} → ${legacy?'Legacy':'NLW #'+(to-150)} (position ${to}). Les positions intermédiaires sont remontées d’un rang (−1) : le niveau au #151 peut devenir #150. ${legacy?'Le niveau ne rapporte ni points principaux ni points NLW.':'Ses records restent associés au niveau et compteront au barème NLW.'} Confirmation requise.`;
   return;
 }
 preview.textContent=`Déplacement #${from} → #${to} : les positions intermédiaires seront décalées, sans supprimer les records.${legacy?' Le niveau sera marqué Legacy et ne rapportera pas de points NLW.':''}`;
}
function updateNewLevelRankPreview(form){
 const preview=document.getElementById('newLevelRankPreview');if(!preview||!form)return;
 const pos=Number(form.elements.position?.value),raw=form.elements.position?.value;
 const legacy=!!form.elements.legacy?.checked,unrated=!!form.elements.unrated?.checked;
 if(!raw){preview.textContent='Choisis la position globale : 151 correspond à NLW #1.';return;}
 if(!Number.isSafeInteger(pos)||pos<1||pos>=99999999){preview.textContent='Position invalide.';return;}
 if(legacy&&unrated){preview.textContent='Choisis Legacy ou UNRATED, pas les deux.';return;}
 if(legacy&&pos<=150){preview.textContent='Legacy doit être hors du Top 150 : utilise une position à partir de 151.';return;}
 if(legacy&&pos<suggestedLegacyPosition()){preview.textContent=`Place les nouveaux niveaux Legacy après la NLW, à partir de la position ${suggestedLegacyPosition()}.`;return;}
 preview.textContent=unrated?`Publication UNRATED, rang estimé #${pos}.`:
   legacy?`Publication Legacy à la position ${pos}, sans points principaux ni NLW.`:
   pos<=150?`Publication dans le Top 150 au rang #${pos}. Les positions occupées sont décalées.`:
   `Publication NLW #${pos-150} (position globale ${pos}). Les positions occupées sont décalées.`;
}
function studioYoutubeThumbnail(link){try{const u=new URL(link),h=u.hostname.replace(/^www\./,'').toLowerCase();let id='';if(h==='youtu.be')id=u.pathname.split('/')[1];else if(['youtube.com','m.youtube.com'].includes(h))id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.split('/')[2];return /^[\w-]{11}$/.test(id||'')?'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg':'';}catch{return '';}}
function updateStudioPreview(form){const container=document.getElementById('levelStudioPreview');if(!container)return;const media=imageLink(form.elements.thumbnail_url.value)||studioYoutubeThumbnail(form.elements.video_url.value)||studioYoutubeThumbnail(form.elements.verifier_video_url.value);container.innerHTML=media?`<img src="${esc(media)}" alt="Aperçu miniature" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.hidden=false"><p hidden>Miniature indisponible — vérifie son URL.</p>`:'<p class="muted small">Aucune miniature renseignée</p>';}
function historicNlwPublisher(){
 const all=oldArchive();
 const pubs=state.data.demons||[];
 const unpublished=state.unpublishedAredlDemons||[];
 const options=all.map(old=>{
  const matching=pubs.some(x=>(plain(old.level_id)&&plain(x.level_id)===plain(old.level_id))||key(x.name)===key(old.name));
  // Précaution côté interface seulement : l'identité est vérifiée une seconde fois côté SQL.
  const hidden=unpublished.filter(x=>((plain(old.level_id)&&plain(x.level_id)===plain(old.level_id))||key(x.name)===key(old.name)));
  return {old,matching,hidden: hidden.length===1};
 }).filter(x=>!x.matching);
 if(!options.length)return `<div class="admin-card" data-admin-section="levels"><h3>Anciennes fiches NLW à rapprocher</h3><p class="small muted">Tous les niveaux historiques hors Top 150 sont déjà présents dans la liste ou aucun n’est à homologuer.</p></div>`;
 const first=options[0].old;
 return `<div class="admin-card" data-admin-section="levels"><h3>Anciennes fiches NLW à rapprocher</h3>
 <p class="small muted">Les archives sont consultables mais ne donnent pas de points. Après contrôle des records et du rang, publie la <b>fiche historique liée</b> dans la NLW officielle. Les victoires déjà importées sur cette fiche seront alors comptées automatiquement. Aucune victoire n’est créée par ce bouton.</p>
 <form data-form="historicNlwPublish"><label class="field">Niveau historique<select name="legacy_id" id="historicNlwSelect" required>${options.map(({old,hidden})=>`<option value="${esc(old.legacy_id)}" data-old-position="${esc(old.old_position)}">Ancien #${esc(old.old_position)} — ${esc(old.name)}${hidden?'':' · rapprochement à vérifier'}</option>`).join('')}</select></label>
 <label class="field">Rang DLFR choisi (151 = NLW #1)<input type="number" id="historicNlwPosition" name="position" min="151" max="99999998" value="${esc(first.old_position)}" required></label>
 <p class="small muted">Le système vérifie une correspondance unique par ID Geometry Dash (ou par nom lorsque l’ID historique est absent). Si le rang est occupé, choisis un rang libre. Les autres fiches ne sont pas déplacées.</p>
 <label class="field">Confirmation<input name="confirmation" required placeholder="Écrire PUBLIER NLW" autocomplete="off"></label>
 <button class="btn" type="submit">Publier dans NLW et activer le barème</button></form></div>`;
}
function arrangeLevelsPanel(){
 if(state.adminTab!=='levels')return;
 const container=document.querySelector('.moderation-sections');
 if(!container)return;
 const cards=[...container.querySelectorAll('.admin-card[data-admin-section="levels"]')];
 if(!cards.length)return;
 // Les outils existants restent accessibles, mais une seule catégorie est affichée.
 cards.forEach(card=>{
  const heading=(card.querySelector('h2,h3')?.textContent||'').toLowerCase();
  const group=card.classList.contains('level-studio')||heading.includes('crédit')?'edit':
    heading.includes('ajouter directement')?'create':
    heading.includes('retirer ou restaurer')?'remove':'review';
  card.dataset.levelGroup=group;
  card.hidden=group!==activeLevelPanel;
 });
 let nav=document.getElementById('levelsToolsNav');
 if(!nav){nav=document.createElement('nav');nav.id='levelsToolsNav';nav.className='level-tools-nav';nav.setAttribute('aria-label','Actions sur les niveaux');container.insertBefore(nav,cards[0]);}
 const guidance={edit:['Modifier une fiche','1. Recherche et sélectionne le niveau','2. Corrige les informations ou le rang','3. Vérifie l’aperçu et enregistre'],create:['Ajouter un niveau','1. Réutilise une fiche existante ou choisis « Nouveau niveau »','2. Complète les crédits, le rang et les médias','3. Vérifie les champs puis enregistre'],review:['Anciennes fiches et NLW','1. Sélectionne une fiche historique','2. Vérifie son identité et le rang choisi','3. Publie après confirmation'],remove:['Retirer et restaurer','1. Choisis la fiche et l’opération','2. Examine ses éventuelles dépendances','3. Confirme seulement après vérification']}[activeLevelPanel];
 nav.innerHTML=`<div class="level-tools-heading"><div><span class="kicker">GESTION DES NIVEAUX</span><h2>Que souhaites-tu faire ?</h2><p>Un seul outil à la fois, sans modifier les autres niveaux inutilement.</p></div></div><div class="level-tools-tabs">${levelPanelGroups.map(([id,label])=>`<button type="button" data-level-group="${id}" class="${activeLevelPanel===id?'active':''}" aria-pressed="${activeLevelPanel===id}">${label}</button>`).join('')}</div><div class="dlfr29-level-steps"><h3>${guidance[0]}</h3><ol>${guidance.slice(1).map(v=>`<li>${v}</li>`).join('')}</ol></div>`;
}
// Préremplissage depuis une fiche AREDL masquée : aucun enregistrement en base ici.
function fillImportedDemonForm(select){
 const form=select?.closest('form[data-form="demon"]');
 if(!form)return;
 const id=String(select.value||'');
 const demon=(state.unpublishedAredlDemons||[]).find(d=>String(d.id)===id);
 const names=['name','level_id','publisher','verifier','creator','completion_mode','verifier_video_url','thumbnail_url','requirement','legacy_since'];
 if(!demon){
  if(form.dataset.importedPrefill==='yes'){
   names.forEach(n=>{const field=form.elements.namedItem(n);if(field)field.value=n==='requirement'?'100':'';});
   for(const n of ['legacy','unrated']){const field=form.elements.namedItem(n);if(field)field.checked=false;}
  }
  form.dataset.importedPrefill='no';
  const note=form.querySelector('[data-import-prefill-note]');if(note)note.textContent='Sélectionne une fiche pour charger ses informations.';
  return;
 }
 const missing=v=>!v||String(v).trim().toLowerCase()==='aredl';
 const values={
  name:demon.name||'',level_id:demon.level_id||'',
  publisher:missing(demon.publisher)?'À renseigner':demon.publisher,
  verifier:demon.verifier||'',creator:demon.creator||'',
  completion_mode:demon.completion_mode==='standard'?'':(demon.completion_mode||''),
  verifier_video_url:demon.verifier_video_url||'',thumbnail_url:demon.thumbnail_url||'',
  requirement:demon.requirement??100,legacy_since:demon.legacy_since||''
 };
 // Ne jamais importer la position 1600+ de la sauvegarde : c'est un rangement technique.
 for(const [name,value] of Object.entries(values)){
  const field=form.elements.namedItem(name);
  if(field)field.value=String(value);
 }
 for(const name of ['legacy','unrated']){const field=form.elements.namedItem(name);if(field)field.checked=Boolean(demon[name]);}
 form.dataset.importedPrefill='yes';
 const note=form.querySelector('[data-import-prefill-note]');
 if(note)note.textContent='Informations chargées depuis '+(demon.name||'la fiche')+'. Vérifie les crédits et choisis manuellement la position DLFR/NLW. Aucun changement enregistré.';
}
const ADMIN_GUIDES={
 overview:{name:'Par où commencer ?',desc:'Retrouve rapidement les actions les plus courantes. Tu peux revenir ici à tout moment.',steps:['Choisis le type de demande.','Ouvre le bon outil.','Vérifie les informations avant de confirmer.']},
 requests:{name:'Soumissions et demandes',desc:'Commence par les dossiers en attente : preuves vidéo, revendications de profils et corrections.',steps:['Ouvre le dossier à examiner.','Vérifie la preuve et l’identité.','Accepte ou refuse avec un motif clair.']},
 levels:{name:'Gérer les niveaux',desc:'Modifie une fiche, crée un niveau, contrôle une ancienne importation ou retire une fiche.',steps:['Choisis une opération ci-dessous.','Vérifie les crédits et le rang.','Prévisualise puis confirme l’enregistrement.']},
 packs:{name:'Créer un Level Pack',desc:'Compose une sélection de niveaux et choisis une récompense communautaire.',steps:['Choisis le nom et le type de récompense.','Sélectionne entre 2 et 30 niveaux.','Vérifie la sélection avant publication.']},
 news:{name:'Publier une actualité',desc:'Rédige une annonce pour les joueurs et vérifie son contenu avant publication.',steps:['Rédige le titre et le texte.','Ajoute les médias si nécessaire.','Relis puis publie.']},
 profiles:{name:'Gérer les joueurs',desc:'Crée une fiche joueur, attribue une victoire vérifiée, personnalise une fiche ou fusionne des doublons.',steps:['Choisis la création, la victoire ou l’outil d’identités.','Contrôle les informations et les liens.','Enregistre la modification.']},
 awards:{name:'Badges et distinctions',desc:'Gère les titres officiels, les badges et le Hall of Fame.',steps:['Choisis un joueur.','Choisis la récompense et sa justification.','Confirme l’attribution.']},
 achievements:{name:'Exploits français',desc:'Mets en avant une performance marquante de la communauté.',steps:['Choisis le joueur et le niveau.','Renseigne la performance et la preuve.','Relis avant d’enregistrer.']},
 clans:{name:'Gérer les clans',desc:'Consulte les groupes et les demandes de la communauté.',steps:['Sélectionne le clan.','Vérifie l’action demandée.','Confirme le changement.']},
 safety:{name:'Sécurité et sanctions',desc:'Interviens sur des profils et contenus signalés.',steps:['Lis le signalement.','Vérifie les éléments disponibles.','Applique la mesure adaptée.']},
 team:{name:'Gérer les accès',desc:'Ajoute un modérateur NLW, un modo, un supermodo ou un deuxième propriétaire.',steps:['Sélectionne le compte connecté.','Choisis le rôle nécessaire.','Confirme la modification des permissions.']},
 leaderboard:{name:'Classement des modérateurs',desc:'Un podium amusant basé sur les décisions de soumissions réellement enregistrées.',steps:['Choisis la période.', 'Compare les acceptations et les refus.', 'Actualise après une session de modération.']},
 nlw:{name:'Équipe NLW',desc:'Gère les responsabilités spécifiques à la liste NLW.',steps:['Choisis la personne concernée.','Vérifie les droits à attribuer.','Confirme la mise à jour.']},
 audit:{name:'Journal de modération',desc:'Retrouve les actions effectuées pour comprendre l’historique des changements.',steps:['Parcours les modifications.','Identifie la fiche concernée.','Vérifie le résultat sur le site.']}
};
function adminGuideHtml(){
 const g=ADMIN_GUIDES[state.adminTab]||ADMIN_GUIDES.overview;
 const quick=[['requests','📥','Traiter les demandes','Vérifications et profils en attente'],['levels','✎','Modifier un niveau','Rang, créateurs, vidéos, miniature'],['packs','◇','Créer un Level Pack','Niveaux et récompenses'],['profiles','♧','Gérer les joueurs','Profils, fusions et vérificateurs']];
 const isOverview=state.adminTab==='overview';
 return `<section class="dlfr29-guide" aria-label="Guide de modération"><div class="dlfr29-guide-heading"><span class="kicker">ASSISTANT DE MODÉRATION</span><h2>${g.name}</h2><p>${g.desc}</p></div>${isOverview?`<div class="dlfr29-quick-grid">${quick.map(([id,icon,title,desc])=>`<button type="button" data-admin-tab="${id}" class="dlfr29-quick"><span class="dlfr29-quick-icon" aria-hidden="true">${icon}</span><strong>${title}</strong><small>${desc}</small><span class="dlfr29-quick-arrow" aria-hidden="true">→</span></button>`).join('')}</div>`:`<ol class="dlfr29-guide-steps">${g.steps.map((step,i)=>`<li><span>${i+1}</span>${step}</li>`).join('')}</ol><button class="dlfr29-back" type="button" data-admin-tab="overview">← Retour aux raccourcis</button>`}</section>`;
}

function modVictoryOptions(search=''){
 const q=key(search), available=(state.data.demons||[]).filter(d=>d.is_public===true&&!d.legacy&&Number(d.position)>0)
  .filter(d=>!q||key(`${d.name} ${d.level_id||''} ${Number(d.position)>100000000?'UNRATED':Number(d.position)>150?'NLW':'TOP'} ${d.position}`).includes(q))
  .sort((a,b)=>Number(a.position)-Number(b.position));
 const found=available.slice(0,60);
 return `<option value="">${available.length>60?'Affiner la recherche ('+available.length+' résultats)…':'Choisir un niveau ('+available.length+' résultat(s))'}</option>`+
  found.map(d=>{const place=d.unrated?'UNRATED':Number(d.position)>150?'NLW #'+(Number(d.position)-150):'Top #'+d.position;
   return `<option value="${esc(d.id)}">${esc(place)} · ${esc(d.name)}${d.level_id?' · GD '+esc(d.level_id):''}</option>`;}).join('');
}
function modPlayersAndVictoriesPanel(){
 const eligible=(state.data.players||[]).filter(p=>!(state.mergedSourceKeys||[]).includes(p.player_key))
  .slice().sort((a,b)=>sortPlayerName(a).localeCompare(sortPlayerName(b),'fr'));
 return `<div class="admin-card" data-admin-section="profiles"><h3>＋ Créer une fiche joueur</h3>
 <p class="small muted">Crée une fiche DLFR sans compte lié, pour un joueur absent du site. Si la personne a déjà une fiche, utilise la liaison ou la fusion, pas une nouvelle création.</p>
 <form data-form="prodPlayer">
 <label class="field">Pseudo Geometry Dash<input name="username" required minlength="2" maxlength="70" pattern="(?:[A-Za-z0-9_]|-){2,70}" placeholder="Pseudo du joueur" autocomplete="off"></label>
 <label class="field">Nom affiché (facultatif)<input name="display_name" maxlength="80" placeholder="Laisser vide pour reprendre le pseudo"></label>
 <label class="field">Pays<select name="country_code"><option value="">Non renseigné</option><option value="FR">France</option><option value="BE">Belgique</option><option value="CH">Suisse</option><option value="CA">Canada</option></select></label>
 <p class="small muted">Aucun compte Discord/pseudo n'est créé ou revendiqué automatiquement.</p>
 <button class="btn" type="submit">Créer la fiche</button></form></div>
 <div class="admin-card" data-admin-section="profiles"><h3>✓ Attribuer une victoire à un joueur</h3>
 <p class="small muted">Attribution manuelle d'une complétion à 100 % sur un niveau publié (Top 150, NLW ou UNRATED). Vérifie la preuve avant validation. Un record existant sera actualisé, jamais dupliqué.</p>
 <form data-form="prodCompletion">
 <label class="field">Joueur<select name="player_key" required><option value="">Sélectionner un joueur</option>${eligible.map(p=>`<option value="${esc(p.player_key)}">${esc(sortPlayerName(p))} · ${esc(p.player_key)}</option>`).join('')}</select></label>
 <label class="field">Rechercher le niveau<input type="search" id="modVictorySearch" autocomplete="off" placeholder="Nom, rang ou ID Geometry Dash"></label>
 <label class="field">Niveau<select id="modVictoryLevel" name="demon_id" required>${modVictoryOptions()}</select></label>
 <label class="field">Vidéo de preuve (recommandée)<input name="video_url" type="url" maxlength="1000" placeholder="https://youtube.com/…"></label>
 <label class="field">Date de la victoire (facultative)<input name="achieved_at" type="date"></label>
 <label class="field"><input type="checkbox" name="confirm_verified" value="yes" required style="width:auto"> J'ai vérifié que la victoire à 100 % appartient bien à ce joueur</label>
 <button type="submit" class="btn">Attribuer la victoire</button></form></div>`;
}
// V60 — Édition bornée des niveaux pour la modération standard et NLW.
function scopedAllowedLevels(role=state.staffRole){
 return (state.data?.demons||[]).filter(d=>d.is_public===true&&!d.legacy&&!d.unrated&&Number(d.position)>=1&&Number(d.position)<100000000&&(role!=='nlw'||Number(d.position)>150))
  .sort((a,b)=>Number(a.position)-Number(b.position));
}
function scopedLevelSearch(q=''){
 const list=document.getElementById('scopedLevelCandidates');if(!list)return;
 const search=key(q.trim());
 const candidates=scopedAllowedLevels().filter(d=>!search||key(`${d.name||''} ${d.level_id||''} ${d.position}`).includes(search)).slice(0,60);
 list.replaceChildren(...candidates.map(d=>new Option(`#${d.position} — ${d.name}${d.level_id?' · GD '+d.level_id:''}`,String(d.id))));
 list.selectedIndex=-1;
}
function scopedLevelPick(id){
 const d=scopedAllowedLevels().find(d=>String(d.id)===String(id));
 const form=document.querySelector('[data-form="scopedEditLevel"]');if(!form||!d)return;
 const values={demon_id:d.id,name:d.name,position:d.position,level_id:d.level_id,creator:d.creator,publisher:d.publisher,verifier:d.verifier,requirement:d.requirement||100,completion_mode:d.completion_mode||'standard',video_url:d.video_url,verifier_video_url:d.verifier_video_url,thumbnail_url:d.thumbnail_url};
 for(const [field,value] of Object.entries(values)){
  if(form.elements[field])form.elements[field].value=value??'';
 }
 const title=document.getElementById('scopedLevelSelected');if(title)title.textContent=`Fiche sélectionnée : ${d.name} (#${d.position})`;
 form.querySelectorAll('input,select,button').forEach(el=>el.disabled=false);
}
function scopedLevelsPanel(role){
 const nlw=role==='nlw';
 return `<section class="paper dlfr-v60-editor"><h2>Gérer les niveaux · ${nlw?'NLW uniquement':'Top 150 et NLW'}</h2>
 <p class="small muted">Créer une nouvelle fiche ou modifier un niveau existant. ${nlw?'Les rangs 1 à 150 et les UNRATED ne sont pas accessibles à ton rôle.':'Tu peux aussi créer des niveaux UNRATED ; les transferts Top 150 / NLW restent réservés aux supermodérateurs.'} ${nlw?'Les niveaux Legacy, masqués et les retraits restent réservés à la supermodération.':'La modification des fiches UNRATED, les niveaux Legacy, les fiches masquées et les retraits restent réservés à la supermodération.'}</p>
 <div class="admin-card"><h3>＋ Ajouter un niveau</h3>
 <form data-form="scopedCreateLevel" class="dlfr-v60-form">
 <label class="field">Nom du niveau<input name="name" maxlength="120" required></label>
 <label class="field">${nlw?'Position globale':'Position globale / rang UNRATED estimé'}<input name="position" type="number" min="${nlw?151:1}" max="99999998" required placeholder="${nlw?151:1}"></label>
 ${!nlw?`<label class="field"><input type="checkbox" name="unrated" style="width:auto"> Publier comme niveau UNRATED</label><p class="small muted">Si coché, la position correspond au rang UNRATED estimé (classement séparé) : aucun niveau Rated n'est déplacé. Le rang UNRATED doit être libre.</p>`:''}
 <label class="field">ID Geometry Dash<input name="level_id" inputmode="numeric" pattern="[0-9]+" maxlength="30" placeholder="Facultatif"></label>
 <label class="field">Publié par<input name="publisher" maxlength="200" required></label>
 <label class="field">Créateur<input name="creator" maxlength="200"></label>
 <label class="field">Vérificateur<input name="verifier" maxlength="200"></label>
 <label class="field">Progression requise (%)<input type="number" name="requirement" min="1" max="100" value="100" required></label>
 <label class="field">Mode<select name="completion_mode"><option value="standard">Standard</option><option value="solo">Solo</option><option value="two_player">2-Player</option></select></label>
 <label class="field">Vidéo de vérification<input name="verifier_video_url" type="url" maxlength="1000" placeholder="https://…"></label>
 <label class="field">Miniature<input name="thumbnail_url" type="url" maxlength="1000" placeholder="https://…"></label>
 <p class="small muted">Pour les niveaux Rated, un rang occupé décale les suivants. Pour les UNRATED, choisis un rang disponible. Les niveaux déjà présents (y compris importés et masqués) ne sont pas recréés : contacte un supermodo pour les publier.</p>
 <button class="btn" type="submit">Créer le niveau</button></form></div>
 <div class="admin-card"><h3>✎ Modifier une fiche existante</h3>
 <label class="field">Rechercher un niveau<input id="scopedLevelSearch" type="search" placeholder="Nom, rang ou ID Geometry Dash…" autocomplete="off"></label>
 <label class="field">Résultats<select id="scopedLevelCandidates" size="7" aria-label="Choisir un niveau à modifier"></select></label>
 <form data-form="scopedEditLevel" class="dlfr-v60-form">
 <p id="scopedLevelSelected" class="small muted">Sélectionne un niveau dans les résultats ci-dessus.</p>
 <input type="hidden" name="demon_id" value="">
 <label class="field">Nom<input name="name" maxlength="120" required disabled></label>
 <label class="field">Position globale<input name="position" type="number" min="${nlw?151:1}" max="99999998" required disabled></label>
 <label class="field">ID Geometry Dash<input name="level_id" inputmode="numeric" maxlength="30" disabled></label>
 <label class="field">Publié par<input name="publisher" maxlength="200" required disabled></label>
 <label class="field">Créateur<input name="creator" maxlength="200" disabled></label>
 <label class="field">Vérificateur<input name="verifier" maxlength="200" disabled></label>
 <label class="field">Progression requise (%)<input name="requirement" type="number" min="1" max="100" required disabled></label>
 <label class="field">Mode<select name="completion_mode" disabled><option value="standard">Standard</option><option value="solo">Solo</option><option value="two_player">2-Player</option></select></label>
 <label class="field">Vidéo du niveau<input name="video_url" type="url" maxlength="1000" disabled></label>
 <label class="field">Vidéo de vérification<input name="verifier_video_url" type="url" maxlength="1000" disabled></label>
 <label class="field">Miniature<input name="thumbnail_url" type="url" maxlength="1000" disabled></label>
 <label class="field"><input type="checkbox" name="confirm_move" value="on"> Je confirme le changement de position, s'il y en a un.</label>
 <button type="submit" class="btn" disabled>Enregistrer les modifications</button></form></div>
 </section>`;
}
function adminPage(){if(LIVE&&!state.staff){
  // Être connecté via Discord et être autorisé à modérer sont deux contrôles séparés.
  // Ne pas demander un mot de passe à une personne déjà authentifiée.
  if(state.session){
    const identity=discordIdentity();
    const name=identity?.username||state.session.user?.user_metadata?.full_name||'compte connecté';
    return `<div class="paper"><h1>Modération</h1><p>Compte connecté : <b>${esc(name)}</b>.</p><div class="notice warning"><b>Pas d’accès modérateur pour cette session.</b><p>Ce compte ne dispose pas des droits nécessaires. Contacte le propriétaire de la DLFR si tu penses qu'il s'agit d'une erreur.</p></div><div class="form-actions"><button type="button" class="btn" data-action="refreshStaffAccess">Actualiser mes droits</button><button type="button" class="btn subtle" data-action="logout">Déconnexion</button></div></div>`;
  }
  return `<div class="paper"><h1>Modération</h1><p>Connecte-toi avec un compte autorisé pour accéder à la modération.</p>${usernameLoginForm()}${C.enableDiscordOAuth===true?`<details class="alternate-login"><summary>Ou se connecter avec Discord</summary>${discordPanel(null)}</details>`:''}</div>`;
 }
 if(!LIVE&&!state.staff)return `<div class="paper"><h1>Laboratoire de modération</h1><p>Cet espace d’essai n’enregistre pas de modifications sur le site officiel.</p><button class="btn" data-action="demoStaff">Activer la simulation modérateur</button></div>`;
 if(LIVE&&(['nlw','moderator'].includes(state.staffRole)||ownerPreviewActive()&&['nlw','moderator'].includes(state.ownerPreview))){
   const role=ownerPreviewActive()?state.ownerPreview:state.staffRole;
   const view=ownerPreviewActive()?{...state,staffRole:role,scopedQueue:state.ownerPreviewQueue.filter(x=>role==='moderator'||Number(x.position)>150),scopedQueueError:state.ownerPreviewError}:state;
   return `${templateNotice()}<div class="paper"><div class="admin-mode">Modération · ${role==='nlw'?'NLW':'Top 150 + NLW'}</div><div class="row-between"><h1>Modération</h1><button class="btn subtle small" data-action="logout">Déconnexion</button></div><div class="dlfr-v60-tabs"><button type="button" data-admin-tab="requests" class="${state.adminTab!=='levels'?'active':''}">Soumissions</button><button type="button" data-admin-tab="levels" class="${state.adminTab==='levels'?'active':''}">Niveaux</button><button type="button" data-admin-tab="leaderboard" class="${state.adminTab==='leaderboard'?'active':''}">🏆 Classement</button></div><p class="small muted">Les permissions de création et de modification sont vérifiées par Supabase selon ton rôle.</p></div>${state.adminTab==='leaderboard'?moderationLeaderboardPage():state.adminTab==='levels'?scopedLevelsPanel(role):`${PROD.scopedReview(view)}${window.DLFR_CLAIMS.moderation(state)}<div class="paper dlfr27-scoped-packs">${state.adminTab==='packs'?packModerationEditor():''}</div>`}`;
 }
 const mergePlayers=state.adminTab==='profiles'?mergePlayerOptions():''; const players=['profiles','awards','achievements','safety','nlw'].includes(state.adminTab)?playerOptions():'';return `${templateNotice()}<div class="paper"><div class="admin-mode">Espace privé · équipe de modération</div><div class="row-between"><h1>Modération</h1><div><button class="btn subtle small" data-action="logout">Déconnexion</button></div></div><p class="muted">Choisis une action ci-dessous. Les modifications sont enregistrées et contrôlées automatiquement.</p></div><div class="admin-workspace" data-role="${state.demoRole}"><div class="admin-nav" role="tablist" aria-label="Sections de modération">${[['overview','Accueil'],['requests','Demandes'+((state.mergeRequests||[]).filter(x=>x.status==='pending').length?' · '+(state.mergeRequests||[]).filter(x=>x.status==='pending').length+' fusion(s)':'')],['levels','Niveaux'],['leaderboard','🏆 Classement modos'],['packs','Level Packs'],...(state.staffRole==='owner'&&!ownerPreviewActive()?[['weekly','Défis & tests']]:[]),['news','Actualités'],['profiles','Profils'],['awards','Badges & Palmarès'],['achievements','Achievements FR'],['clans','Clans'],['safety','Sanctions'],['audit','Journal'],...(state.staffRole==='owner'&&!ownerPreviewActive()?[['team','Équipe']]:[])].map(([id,label])=>`<button type="button" role="tab" aria-selected="${state.adminTab===id}" class="${state.adminTab===id?'active':''}" data-admin-tab="${id}">${label}</button>`).join('')}</div><div class="admin-content">${state.adminTab==='weekly'?v86AdminHTML():''}${state.adminTab==='weekly'?'':adminGuideHtml()}<div class="dlfr29-requests" ${state.adminTab==='requests'?'':'hidden'}>${state.adminTab==='requests'?(LIVE?PROD.scopedReview(ownerPreviewActive()?{...state,staffRole:state.ownerPreview}:state)+PROD.moderation(ownerPreviewActive()?{...state,staffRole:state.ownerPreview}:state):'')+window.DLFR_CLAIMS.moderation(state)+mergeRequestsModeratorPanel():''}</div><div class="admin-intro ${state.adminTab==='overview'?'':'is-hidden'}"><h2>Tableau de bord</h2>${state.adminTab==='overview'?statsOverview():''}<p class="muted">Choisis une action dans les raccourcis ou une rubrique dans le menu. Chaque modification est contrôlée avant son enregistrement.</p>${(state.mergeRequests||[]).some(r=>r.status==='pending')?`<p class="notice">⇄ ${(state.mergeRequests||[]).filter(r=>r.status==='pending').length} demande(s) de fusion de fiches en attente. <button type="button" class="btn subtle small" data-admin-tab="requests">Ouvrir les demandes</button></p>`:''}</div><div class="moderation-sections" data-active-admin="${state.adminTab}">
 ${state.adminTab==='leaderboard'?moderationLeaderboardPage():''}${state.adminTab==='team'?staffTeamPanel():''}
 ${state.adminTab==='audit'&&optionalStatus.adminAudit==='loading'||state.adminTab==='levels'&&optionalStatus.adminLevels==='loading'||state.adminTab==='safety'&&optionalStatus.adminSafety==='loading'?'<p class="small muted" aria-live="polite">Chargement des données de cette rubrique…</p>':''}
 ${state.adminTab==='levels'&&activeLevelPanel==='edit'?levelCreditsEditor():''}${state.adminTab==='levels'&&activeLevelPanel==='review'?historicNlwPublisher():''}${state.adminTab==='packs'?packModerationEditor():''}
 ${state.adminTab==='levels'&&activeLevelPanel==='review'?window.DLFR_BULK.panel():''}${state.adminTab==='levels'&&activeLevelPanel==='review'?window.DLFR_CLAIMS.compactPanel():''}
 ${state.adminTab==='levels'&&activeLevelPanel==='create'?`<div class="admin-card" data-admin-section="levels"><h3>Ajouter directement un niveau</h3><p class="small muted">Pour accepter une soumission, utilise le panneau ci-dessous. La liste est maintenant entièrement gérée par les modérateurs. Indique un rang : les niveaux Rated suivants seront décalés si nécessaire. Les UNRATED sont gérés séparément.</p><form data-form="demon"><label class="field">Réutiliser une fiche importée et masquée (facultatif)<select name="existing_demon_id"><option value="">Nouveau niveau</option>${(state.unpublishedAredlDemons||[]).filter(d=>!(state.data.dlfr_level_archive_log||[]).some(a=>!a.restored_at&&String(a.demon_id)===String(d.id))).slice().sort((a,b)=>{const ra=Number(a.aredl_rank),rb=Number(b.aredl_rank);const va=Number.isFinite(ra)&&ra>0?ra:Number.POSITIVE_INFINITY;const vb=Number.isFinite(rb)&&rb>0?rb:Number.POSITIVE_INFINITY;return va-vb||String(a.name||"").localeCompare(String(b.name||""),"fr");}).map(d=>`<option value="${esc(d.id)}">${Number(d.aredl_rank)>0?`AREDL #${esc(d.aredl_rank)}`:"AREDL ?"} — ${esc(d.name)} (GD ${esc(d.level_id||"?")})</option>`).join("")}</select></label><p class="small muted" data-import-prefill-note>Sélectionne une fiche pour charger ses informations. Les crédits manquants restent à vérifier.</p><label class="field">Position dans la liste globale (151 = NLW #1)<input name="position" type="number" min="1" required></label><label class="field">Nom<input name="name" required maxlength="120"></label><label class="field">ID Geometry Dash<input name="level_id" inputmode="numeric" maxlength="30"></label><label class="field">Publié par / éditeur (texte libre)<input name="publisher" placeholder="Nom de l’éditeur" required maxlength="200"></label><label class="field">Vérifié par — joueur DLFR<select name="verifier_player_key"><option value="">Conserver / saisir le crédit ci-dessous</option>${(state.data.players||[]).slice().sort((a,b)=>String(a.display_name||a.username).localeCompare(String(b.display_name||b.username))).map(p=>`<option value="${esc(p.player_key)}">${esc(p.display_name||p.username)}</option>`).join('')}<option value="__new__">＋ Créer un nouveau joueur</option></select></label><label class="field">Nouveau joueur vérificateur (uniquement si « Créer »)<input name="new_verifier_name" maxlength="80" placeholder="Pseudo du nouveau joueur"></label><label class="field">Crédit vérificateur (si aucun joueur choisi)<input name="verifier" placeholder="À renseigner"></label><label class="field">Créateur<input name="creator"></label><label class="field">Mode de complétion<select name="completion_mode"><option value="">Conserver le mode existant / Standard</option><option value="solo">Solo</option><option value="two_player">2-Player</option></select></label><label class="field">Vidéo de vérification (facultatif)<input name="verifier_video_url" type="url" placeholder="https://youtu.be/…"></label><label class="field">Miniature YouTube ou image (facultatif)<input name="thumbnail_url" type="url" placeholder="https://i.ytimg.com/vi/…/hqdefault.jpg"></label><label class="field">Progression minimum (%)<input name="requirement" type="number" min="1" max="100" value="100" required></label><label class="field"><input name="legacy" type="checkbox" style="width:auto"> A déjà appartenu au Top 150 (Legacy)</label><label class="field">Date de sortie de liste (si connue)<input name="legacy_since" type="date"></label><label class="field"><input type="checkbox" name="unrated"> Niveau UNRATED (position estimée en mode alternatif)</label><div class="notice small" id="newLevelRankPreview" role="status" aria-live="polite">Choisis une position globale pour savoir où sera publié le niveau.</div><button class="btn">Ajouter le niveau</button><p class="small muted">Position 151 = NLW #1 ; position 157 = NLW #7. Coche « Legacy » uniquement pour publier le niveau dans les archives historiques (sans points NLW).</p></form></div>
 `:''}${state.adminTab==='levels'&&activeLevelPanel==='remove'?`<div class="admin-card" data-admin-section="levels"><h3>Retirer ou restaurer un niveau</h3>
<p class="small muted">Le retrait est réversible : la fiche disparaît du site, les records et les preuves restent enregistrés. Les rangs Rated suivants se referment. Pour éviter toute erreur, saisis le nom exact du niveau avant de confirmer.</p>
<form data-form="prodArchiveLevel"><label class="field">Niveau public à retirer<select name="demon_id" required><option value="">Choisir un niveau</option>${(state.data.demons||[]).slice().sort((a,b)=>+a.position-+b.position).map(d=>`<option value="${esc(d.id)}">#${esc(d.position)} — ${esc(d.name)}${d.unrated?' (UNRATED)':''}</option>`).join('')}</select></label>
<label class="field">Écris exactement le nom du niveau<input name="confirm_name" required autocomplete="off" placeholder="Confirmation obligatoire"></label>
<label class="field">Motif (facultatif)<input name="reason" maxlength="350" placeholder="Doublon, classement corrigé…"></label>
<button class="btn danger" type="submit">Retirer ce niveau de la liste</button></form>
${state.staffRole==='owner'&&!ownerPreviewActive()?`<div class="dlfr-hidden-cleanup"><h4>Supprimer définitivement une fiche masquée</h4><p class="small muted">Uniquement pour le propriétaire. Les records, vitrines et autres références non techniques bloquent la suppression ; aucune autre position n'est modifiée.</p><form data-form="deleteHiddenLevel"><label class="field">Rechercher un niveau masqué<input id="hiddenDeleteSearch" type="search" placeholder="Nom, ID, AREDL…"></label><label class="field">Fiche à supprimer<select name="demon_id" id="hiddenDeleteSelect" required><option value="">Choisir une fiche masquée</option>${(state.unpublishedAredlDemons||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),'fr')).map(d=>`<option value="${esc(d.id)}">${esc(d.name)} · #${esc(d.position)} · ${esc(d.data_source||'import')}</option>`).join('')}</select></label><div class="form-actions"><button class="btn subtle" type="submit" name="delete_action" value="preview">Examiner les dépendances</button></div><div id="hiddenDeletePreview" class="notice" hidden></div><label class="field">Recopier le nom exact<input name="confirm_name" autocomplete="off" placeholder="Nom du niveau"></label><label class="field">Confirmation : SUPPRIMER<input name="confirmation" autocomplete="off" placeholder="SUPPRIMER"></label><button class="btn danger" type="submit" name="delete_action" value="delete" disabled>Supprimer définitivement</button></form></div>`:''}
<h4>Restaurer un niveau retiré</h4>
${(()=>{const archives=(state.data.dlfr_level_archive_log||[]).filter(x=>!x.restored_at);const hidden=new Map((state.unpublishedAredlDemons||[]).map(d=>[String(d.id),d]));const available=archives.filter(a=>hidden.has(String(a.demon_id)));return available.length?`<form data-form="prodRestoreLevel"><label class="field">Niveau à restaurer<select name="demon_id" required>${available.map(a=>`<option value="${esc(a.demon_id)}">${esc(hidden.get(String(a.demon_id)).name)} · ancien rang #${esc(a.original_unrated?a.original_position-100000000:a.original_position)}</option>`).join('')}</select></label><label class="field">Nouveau rang (facultatif, sinon ancien rang)<input type="number" name="position" min="1" max="99999998" placeholder="Ancienne position par défaut"></label><button class="btn subtle" type="submit">Restaurer ce niveau</button></form>`:'<p class="small muted">Aucun niveau archivé à restaurer.</p>';})()}
</div>
 
 `:''}${state.adminTab==='news'?`<div class="admin-card" data-admin-section="news"><h3>Publier une actualité</h3><form data-form="news"><input type="hidden" name="news_id" value=""><label class="field">Titre<input name="headline" maxlength="160" required></label><label class="field">Annonce<textarea name="body" required></textarea></label><label class="field">Joueur concerné (facultatif)<input name="player_name"></label><label class="field">Catégorie<select name="category"><option>Annonce</option><option>Record</option><option>Classement</option><option>Communauté</option></select></label><label class="field"><input type="checkbox" name="is_pinned" style="width:auto"> Mettre à la une</label><label class="field">Image (URL, facultatif)<input name="image_url" type="url" placeholder="https://…/image.webp"></label><label class="field">Ou importer une image (PNG / JPG / WebP / GIF, max 5 Mo)<input name="image_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><label class="field">Vidéo (URL YouTube ou vidéo .mp4 / .webm)<input name="video_url" type="url" placeholder="https://youtu.be/…"></label><p class="small muted">Tu peux mettre une image et une vidéo dans la même actualité. Les médias sont conservés dans le stockage Supabase et les vidéos sont intégrées depuis leurs liens.</p><label class="field"><input type="checkbox" name="is_published" checked style="width:auto"> Publié (sinon brouillon)</label><div class="news-live-preview" id="newsDraftPreview"><b>Prévisualisation</b><p>Commence à remplir le formulaire pour voir l’aperçu.</p></div><div class="form-actions"><button class="btn" type="submit">Enregistrer l’actualité</button><button type="button" class="btn subtle" data-action="cancelNews">Annuler l’édition</button></div></form><div class="managed-news"><h4>Actualités existantes</h4>${state.data.news_items.slice().reverse().slice(0,10).map(n=>`<div class="managed-item"><span>${esc(n.headline)} <small>${n.is_published?'· publiée':'· brouillon'}</small></span><button class="btn subtle small" data-edit-news="${n.id}">Éditer</button></div>`).join('')}</div></div>
 
 
 
 
 ${state.adminTab==='profiles'?modPlayersAndVictoriesPanel():''}
 `:''}${state.adminTab==='profiles'?`<div class="admin-card" data-admin-section="profiles"><h3>Personnaliser un profil</h3><form data-form="profile"><label class="field">Joueur<select name="player_key" id="profileEditorPlayer" required>${players}</select></label><div class="profile-location-fields"><label class="field">Pays <span class="country-select-row"><span id="profileCountryPreview"></span><select name="country_code" id="profileEditorCountry"><option value="">Non renseigné</option>${GEO.countries.map(([code])=>`<option value="${code}">${esc(GEO.countryName(code))} (${code})</option>`).join('')}</select></span></label><label class="field" id="profileEditorRegionField" hidden>Région française <span class="country-select-row"><span id="profileRegionPreview"></span><select name="region_code" id="profileEditorRegion"><option value="">Non renseignée</option>${GEO.regions.map(r=>`<option value="${r.code}">${esc(r.name)}</option>`).join('')}</select></span></label></div><p class="small muted">Images locales des drapeaux : assets/flags. Les fichiers de drapeaux régionaux personnalisés sont conservés. En production, la région nécessite la migration SQL dédiée.</p><label class="field">Biographie<textarea name="bio" maxlength="1200"></textarea></label><label class="field">URL d'avatar<input name="avatar_url" type="url" placeholder="https://…"></label><label class="field">URL de bannière<input name="banner_url" type="url"></label><label class="field">Année de début<input name="join_year" type="number" min="2013" max="2100" placeholder="2021"></label><label class="field">Niveau favori<input name="favorite_level" maxlength="120"></label><label class="field">Objectif actuel<input name="current_goal" maxlength="180"></label><label class="field">Lien YouTube<input name="youtube_url" type="url"></label><label class="field">Lien Twitch<input name="twitch_url" type="url"></label><label class="field">Lien personnel<input name="social_url" type="url"></label><label class="field">Accomplissement 1<input name="highlight_1"></label><label class="field">Accomplissement 2<input name="highlight_2"></label><label class="field">Accomplissement 3<input name="highlight_3"></label><div class="profile-editor-tip">Sélectionne un joueur pour charger sa biographie et ses informations actuelles.</div><button class="btn">Enregistrer</button></form></div>
 `:''}${state.adminTab==='awards'?`<div class="admin-card" data-admin-section="awards"><h3>Badges manuels & Hall of Fame</h3>${hasFullStaffPowers()?`<section class="dlfr212-manual-badges"><h4>Attribuer un badge manuel</h4><p class="small muted">Uniquement les distinctions manuelles officielles. Les badges de progression sont automatiques.</p><form data-form="${LIVE?'prodBadgeManual':'badgeGrant'}"><label class="field">Joueur<select name="player_key" required><option value="">Choisir un joueur…</option>${players}</select></label><label class="field">Badge<select name="badge_id" required>${BADGES.definitions.filter(b=>b.manual).map(b=>`<option value="${esc(b.id)}">${esc(b.label)} · ${esc(b.rarity)}</option>`).join('')}</select></label><label class="field">Date<input name="obtained_at" type="date" required value="${new Date().toISOString().slice(0,10)}"></label><button class="btn" type="submit">Attribuer le badge</button></form></section>`:''}<h4>Hall of Fame</h4><form data-form="hall"><label class="field">Joueur<select name="player_key">${players}</select></label><label class="field">Distinction<input name="headline" required></label><label class="field">Année<input name="award_year" type="number" min="2010" max="2100"></label><label class="field">Catégorie<input name="category" value="Accomplissement" required></label><label class="field">Description<textarea name="description"></textarea></label><label class="field">Source (facultative)<input name="source_url" type="url"></label><button class="btn">Ajouter au Hall of Fame</button></form></div>
 `:''}${state.adminTab==='profiles'?`<div class="admin-card" data-admin-section="profiles"><h3>Identités des joueurs</h3><div class="form-actions"><button type="button" class="btn subtle" data-identity-tab="merge">Fusion</button><button type="button" class="btn subtle" data-identity-tab="verifiers">Vérificateurs</button></div><p class="small muted">Fusionner deux fiches ou rattacher les niveaux vérifiés à une fiche joueur existante, sans fusionner les comptes.</p></div>
 `:''}${state.adminTab==='profiles'?`<div class="admin-card" data-admin-section="profiles" data-identity-section="verifiers" hidden><h3>Rapprocher les vérificateurs</h3><p class="small muted">Cette liste rassemble les vérificateurs qui ne sont pas encore associés à une fiche joueur. Le rapprochement nécessite une validation explicite ; les noms similaires ne sont jamais fusionnés automatiquement.</p><button type="button" class="btn subtle" data-load-verifiers>Actualiser les vérificateurs</button><form data-form="linkVerifier"><label class="field">Crédit vérificateur exact<select name="verifier_name" required><option value="">Charger la liste pour sélectionner…</option></select></label><div id="verifierLinkPreview" class="notice">Sélectionne un vérificateur pour afficher les niveaux non liés.</div><label class="field">Destination<select name="mode"><option value="existing">Fiche joueur existante</option><option value="new">Créer une fiche joueur sans compte</option></select></label><label class="field">Fiche à associer<select name="player_key"><option value="">Choisir un joueur</option>${players}</select></label><label class="field">Nouveau pseudo (uniquement si création)<input name="new_player_name" maxlength="80" placeholder="Pseudo du nouveau joueur"></label><label class="field">Confirmation : écris RATTACHER<input name="confirmation" autocomplete="off" placeholder="RATTACHER" required></label><button class="btn" type="submit">Rattacher les vérifications</button></form></div>
 `:''}${state.adminTab==='profiles'?`<div class="admin-card" data-admin-section="profiles" data-identity-section="merge"><h3>Fusionner deux fiches joueur</h3><p class="small muted">Transférer les records et distinctions d’un doublon vers un profil principal. La fiche source reste conservée et masquée comme archive. Aucun compte de connexion n’est transféré.</p>
<form data-form="mergePlayers"><label class="field">Profil à conserver<select name="target_key" required><option value="">Choisir le profil principal</option>${mergePlayers}</select></label><label class="field">Doublon à absorber<select name="source_key" required><option value="">Choisir le doublon</option>${mergePlayers}</select></label><p class="small muted">La source ne doit pas être liée à un compte Discord. Les fiches déjà absorbées ne sont plus proposées. Prévisualise avant de confirmer.</p>${state.mergedSourceError?`<p class="notice warning">${esc(state.mergedSourceError)} Les actions de fusion sont désactivées en attendant.</p>`:`<p class="small muted">${(state.mergedSourceKeys||[]).length} fiche(s) fusionnée(s) exclue(s) des menus.</p>`}<div class="form-actions"><button class="btn subtle" type="submit" name="merge_action" value="preview" ${state.mergedSourceError?'disabled':''}>Prévisualiser</button></div><div id="mergePlayersPreview" class="notice" hidden></div><label class="field">Pour valider, saisis exactement FUSIONNER<input name="confirmation" autocomplete="off" placeholder="FUSIONNER"></label><button class="btn danger" type="submit" name="merge_action" value="execute" ${state.mergedSourceError?'disabled':''}>Confirmer la fusion</button></form></div>
 `:''}${state.adminTab==='profiles'?`<div class="admin-card" data-admin-section="profiles"><h3>Visibilité des joueurs</h3><form data-form="visibility"><label class="field">Joueur<select name="player_key">${players}</select></label><label class="field">Dans les classements<select name="hidden_from_stats"><option value="false">Afficher</option><option value="true">Masquer</option></select></label><button class="btn">Mettre à jour</button></form></div>
 `:''}${state.adminTab==='overview'?`<div class="admin-card" data-admin-section="overview"><h3>Statistiques de modération</h3>${statsOverview()}${renderBadgeSummary()}<div class="admin-kpis">${box('Badges définis',state.data.badge_definitions.length)}${box('Badges attribués',state.data.badge_awards.length)}${box('Actualités',state.data.news_items.length)}${box('Comptes sans profil',ranked().filter(p=>!p.has_account).length)}${box('Clans',state.data.clans.length)}${box('Achievements FR',(state.data.fr_achievements||[]).length)}${box('Points NLW cumulés',fmt(ranked().reduce((n,p)=>n+p.nlwScore,0)))}</div><p class="small muted">Statistiques calculées depuis les tables Supabase.</p></div>
`:''}${state.adminTab==='levels'&&activeLevelPanel==='review'?`<div class="admin-card" data-admin-section="levels"><h3>État des classements</h3><p><b>Top 150</b> : ${catalog().filter(x=>x.position<=150).length} niveau(x)</p><p><b>NLW</b> : ${catalog().filter(x=>x.position>150).length} niveau(x)</p><p><b>Unrated</b> : ${state.data.demons.filter(x=>x.unrated).length} niveau(x) candidats</p><p class="small muted">Position NLW = position globale − 150. La grille reste distincte des points principaux.</p></div>
`:''}${state.adminTab==='achievements'?`<div class="admin-card" data-admin-section="achievements"><h3>Créer un achievement FR</h3><form data-form="frAchievement"><label class="field">Titre<input name="title" required maxlength="110"></label><label class="field">Joueur<select name="player_key">${players}</select></label><label class="field">Niveau<input name="level_name" required></label><label class="field">Run / exploit<input name="run_text" placeholder="48–100, 39 %..."></label><label class="field">Description<textarea name="description"></textarea></label><label class="field">Vidéo / preuve<input name="video_url" type="url"></label><button class="btn">Ajouter l'achievement</button></form></div>
`:''}${state.adminTab==='clans'?`<div class="admin-card" data-admin-section="clans"><h3>Gestion des clans</h3><p>La création, les invitations et les changements de membres se font directement depuis la page Clans.</p><button type="button" class="btn" data-route="clans">Ouvrir les clans</button></div>
`:''}${state.adminTab==='safety'?`<div class="admin-card" data-admin-section="safety"><h3>Modération de profils</h3><p class="small muted">Certaines mesures de cette section sont uniquement des démonstrations et ne suspendent pas réellement un compte. Pour une intervention sur un compte, contacte le propriétaire.</p><form data-form="safety"><label class="field">Joueur<select name="player_key">${players}</select></label><label class="field">Action<select name="action"><option value="remove_banner">Retirer la bannière</option><option value="temp_ban">Suspension temporaire simulée</option><option value="unban">Lever la suspension</option></select></label><label class="field">Durée en jours<input name="days" type="number" min="1" max="365" value="7"></label><label class="field">Motif<input name="reason" required maxlength="300"></label><button class="btn danger" ${LIVE?'disabled':''}>Appliquer en démo</button></form><h3>Sanctions en démo</h3>${(state.data.player_sanctions||[]).slice(-6).reverse().map(x=>`<p class="small">${esc(x.player_key)} : ${esc(x.action)} · ${esc(x.reason)} ${x.until?'jusqu’au '+date(x.until):''}</p>`).join('')||'<p class="muted">Aucune sanction</p>'}</div>
`:''}${state.adminTab==='nlw'?`<div class="admin-card" data-admin-section="nlw"><h3>Modérateurs NLW</h3><p class="small muted">Les modérateurs NLW ne gèrent que les niveaux de la liste NLW. Le propriétaire attribue les accès.</p><form data-form="nlwStaff"><label class="field">Joueur<select name="player_key">${players}</select></label><button class="btn" ${LIVE?'disabled':''}>Ajout direct indisponible</button></form><p>${(state.data.nlw_staff||[]).map(x=>`<span class="tag">${esc(x.player_key)}</span>`).join('')||'Aucun'}</p></div>
 `:''}${state.adminTab==='audit'?`<div class="admin-card" data-admin-section="audit"><h3>Journal de modération</h3><p class="muted small">Historique des dernières interventions de modération.</p><div>${(state.data.community_audit_log||[]).slice(-20).reverse().map(x=>`<div class="record-row small"><b>${esc(x.action_key)} · ${esc(x.target)}</b><span>${date(x.created_at)}</span></div>`).join('')||'<p class="empty">Aucune action récente.</p>'}</div></div>`:''}
 </div></div></div>`;
}
function v2Header(title,sub){return `${templateNotice()}<section class="paper v2-page"><div class="v2-intro"><span class="kicker">DEMONLIST FRANCOPHONE · V2.7</span><h1>${title}</h1><p>${sub}</p></div>`;}
function calculatorPage(){const demons=catalog(),user=getPlayer(state.calcPlayer)||ranked().find(p=>p.has_account),completed=new Set(state.data.completions.filter(r=>key(r.player)===user?.player_key&&Number(r.progress)===100).map(r=>Number(r.demon_id)));
 const plans=demons.filter(d=>state.calcDemons.includes(Number(d.id))&&!completed.has(Number(d.id)));
 const gainMain=plans.filter(d=>d.position<=150).reduce((x,d)=>x+score(d),0),gainNLW=plans.filter(d=>d.position>150).reduce((x,d)=>x+nlwPoints(d),0);
 const current=user?.score||0,curNLW=user?.nlwScore||0;
 const predicted=ranked().filter(p=>!p.hidden_from_stats&&p.player_key!==user?.player_key&&p.score>current+gainMain).length+1;
 const predictedNLW=ranked().filter(p=>!p.hidden_from_stats&&p.player_key!==user?.player_key&&p.nlwScore>curNLW+gainNLW).length+1;
 return v2Header('Calculateur de points','Choisis un joueur et des niveaux pour simuler une future complétion à 100 %. Aucune donnée réelle ne change.')+
 `<label class="field">Joueur<select id="calcPlayer">${ranked().filter(p=>p.has_account).map(p=>`<option value="${esc(p.player_key)}" ${p.player_key===user?.player_key?'selected':''}>${esc(fullName(p))}</option>`).join('')}</select></label><div class="overview-stats">${box('Points actuels',fmt(current))}${box('Gain Top 150','+'+fmt(gainMain))}${box('Rang simulé','#'+predicted)}${box('Points NLW futurs',fmt(curNLW+gainNLW))}</div><div class="two-col"><div class="admin-card"><h3>Niveaux à terminer</h3><label class="field">Rechercher<input id="calcSearch" type="search" placeholder="Nom du démon"></label><div class="v2-level-picker" id="calcOptions">${calculatorChoices(demons,completed)}</div></div><div class="admin-card"><h3>Résultat de la simulation</h3><p><b>Top 150 :</b> ${fmt(current)} + ${fmt(gainMain)} = <b>${fmt(current+gainMain)}</b> pts</p><p><b>NLW :</b> ${fmt(curNLW)} + ${fmt(gainNLW)} = <b>${fmt(curNLW+gainNLW)}</b> pts NLW</p><p><b>Rang NLW simulé :</b> #${predictedNLW}</p><p><b>${plans.length}</b> niveau(x) choisi(s) · déjà complétés exclus</p><p class="small muted">Projection indicative : le rang des autres joueurs reste fixe, points de vérification et éventuels records partiels ignorés.</p><button class="btn subtle" type="button" data-action="clearCalc">Tout désélectionner</button><hr class="divider"><h3>Sélection</h3>${plans.map(d=>`<p class="small">#${d.position} ${esc(d.name)} · ${fmt(d.position<=150?score(d):nlwPoints(d))} pts ${d.position<=150?'principaux':'NLW'}</p>`).join('')||'<p class="muted">Choisis des niveaux à gauche.</p>'}</div></div></section>`;
}
function calculatorChoices(ds,completed){return ds.filter(d=>!completed.has(Number(d.id))).map(d=>`<label class="v2-check-level"><input type="checkbox" data-calc-demon="${d.id}" ${state.calcDemons.includes(Number(d.id))?'checked':''}><span><b>${d.position>150?'NLW #'+V2.nlwRank(d):'#'+d.position}</b> ${esc(d.name)}${d.unrated?' · UNRATED':''}</span><span class="muted">${fmt(d.position<=150?score(d):nlwPoints(d))} pts</span></label>`).join('')||'<p class="muted">Tous les niveaux sont déjà complétés.</p>';}
function unbeatenPage(){
 const source=state.communityExcel;
 // En démo, les vérifications fictives ne doivent jamais masquer de vrais niveaux AREDL.
 const checked=UNVERIFIED.classify(source.items,LIVE?state.data.demons:[],LIVE?state.data.completions:[]);
 state.communityExcel.classified=checked;
 const summary=source.status==='loading'
   ?'<div class="notice">Chargement du fichier Excel AREDL…</div>'
   :source.status==='error'
     ?`<div class="notice warning"><b>Le fichier Excel n’a pas pu être lu.</b><p>${esc(source.message)}</p><p>Place <code>data/niveaux-non-battus.xlsx</code> dans GitHub. Le fichier peut utiliser <code>Column1.name</code> et <code>Column1.position</code>.</p></div>`
     :source.offline
       ?'<div class="notice warning"><b>Exemples fictifs hors ligne :</b> ouvre le site sur GitHub Pages (ou sur un serveur local) pour lire le vrai classeur.</div>'
       :'<p class="small muted">Catalogue AREDL : <code>data/niveaux-non-battus.xlsx</code> · sa publication sur GitHub met cette liste à jour.</p>';
 const lookup=UNVERIFIED.normalize(state.unbeatSearch);
 const matches=checked.available.filter(x=>!lookup||UNVERIFIED.normalize(x.name).includes(lookup)||String(x.level_id||'').includes(state.unbeatSearch.trim()));
 const caveat=source.status==='ready'&&!source.offline&&checked.unknownCount
   ?`<div class="notice warning"><b>Statuts communautaires non renseignés pour ${checked.unknownCount} niveaux.</b> Ton Excel donne les positions AREDL, mais pas les vérifications françaises. Ces niveaux sont des <b>candidats à vérifier</b>, et non des démons certifiés non battus. Ajoute « Oui » ou « Non » dans la colonne <code>Vérifié communauté</code> pour suivre leur statut. Les vérificateurs et complétions à 100 % présents dans Supabase peuvent également les masquer.</div>`:'';
 return v2Header('Niveaux non vérifiés · Communauté','Catalogue AREDL et suivi des vérifications francophones, séparé du classement principal.')+
  `${summary}${caveat}<div class="unverified-stats"><div><strong>${source.status==='loading'?'…':checked.available.length}</strong><span>À suivre</span></div><div><strong>${checked.verified.length}</strong><span>Vérifiés / masqués</span></div><div><strong>${source.items.length}</strong><span>Niveaux AREDL</span></div></div>`+
  `<label class="field">Rechercher par nom ou ID GD<input id="unbeatenSearch" type="search" value="${esc(state.unbeatSearch)}" placeholder="Nom du niveau ou ID…"></label>`+
  `<p id="unbeatenCount" class="small muted">${matches.length} résultat(s) · ${Math.min(matches.length,state.unbeatLimit)} affiché(s)</p><div id="unbeatenResults" class="unverified-grid">${unbeatenEntriesHTML()}</div>`+
  `<details class="verified-breakdown"><summary>Voir les ${checked.verified.length} niveaux retirés automatiquement ou manuellement</summary><p class="small muted">${checked.confirmedOnSite} niveau(x) confirmé(s) par un vérificateur ou une complétion 100 % sur la Demonlist ; ${checked.confirmedManual} marqué(s) « Oui » dans Excel. Un lien vers une fiche sans record ne suffit pas.</p><div class="verified-breakdown-list">${checked.verified.slice(0,150).map(x=>`<div><span>${esc(x.name)}</span> <span class="muted">${esc(x.verification_source)}</span> ${x.demonlist_id!=null?`<a class="link" data-nav href="${url('demon',{id:x.demonlist_id})}">Fiche ↗</a>`:''}</div>`).join('')||'<p>Aucun niveau retiré.</p>'}</div>${checked.verified.length>150?`<p class="small muted">150 premiers affichés sur ${checked.verified.length}.</p>`:''}</details>`+
  `<p class="small muted" style="margin-top:15px">Les niveaux vérifiés sont automatiquement retirés des propositions quand les informations sont disponibles. Le simple fait de posséder un lien ou de figurer dans AREDL ne suffit pas. Aucune synchronisation automatique avec les vérifications externes à la Demonlist n’est possible sans autre source.</p></section>`;
}
function unbeatenEntriesHTML(){
 const checked=state.communityExcel.classified||UNVERIFIED.classify(state.communityExcel.items,LIVE?state.data.demons:[],LIVE?state.data.completions:[]);
 const search=UNVERIFIED.normalize(state.unbeatSearch);
 const levels=checked.available.filter(x=>!search || UNVERIFIED.normalize(x.name).includes(search)||String(x.level_id||'').includes(state.unbeatSearch.trim()));
 const count=document.getElementById('unbeatenCount');
 if(count)count.textContent=`${levels.length} résultat(s) · ${Math.min(levels.length,state.unbeatLimit)} affiché(s)`;
 const list=levels.slice(0,state.unbeatLimit).map(level=>{
   const match=state.data.demons.find(d=>level.level_id&&d.level_id ? String(d.level_id)===String(level.level_id) : UNVERIFIED.normalize(d.name)===UNVERIFIED.normalize(level.name));
   const rank=Number(level.aredl_rank), rankLabel=Number.isFinite(rank)&&rank>0?'AREDL #'+rank:'';
   const video=http(level.video_url);
   const unknown=!level.verification_known;
   return `<article class="unverified-card"><div class="unverified-title">${match?`<a data-nav class="link" href="${url('demon',{id:match.id})}">${esc(level.name)}</a>`:esc(level.name)}</div><div class="unverified-metadata">${rankLabel?`<span class="tag">${esc(rankLabel)}</span>`:''}${level.level_id?`<span class="tag">GD ID ${esc(level.level_id)}</span>`:''}${level.nlw_tier?`<span class="tag">NLW ${esc(level.nlw_tier)}</span>`:''}${level.aredl_points!==''?`<span class="tag">${esc(level.aredl_points)} pts AREDL</span>`:''}<span class="unverified-status ${unknown?'pending':''}">${unknown?'Statut à confirmer':'Non vérifié'}</span></div>${level.notes?`<p class="small muted">${esc(level.notes)}</p>`:''}${video?`<a class="link small" target="_blank" rel="noopener noreferrer" href="${esc(video)}">Voir la vidéo ↗</a>`:''}</article>`;
 }).join('')||'<p class="empty">Aucun niveau correspondant à cette recherche.</p>';
 return list+(levels.length>state.unbeatLimit?`<div class="unverified-load-row"><button class="btn subtle" type="button" data-action="moreUnbeaten">Voir 120 niveaux supplémentaires (${levels.length-state.unbeatLimit} restants)</button></div>`:'');
}
let excelReaderPromise=null;
function ensureExcelReader(){
 if(window.XLSX)return Promise.resolve();
 if(excelReaderPromise)return excelReaderPromise;
 excelReaderPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';script.async=true;
  script.onload=()=>window.XLSX?resolve():reject(Error('Lecteur Excel indisponible.'));
  script.onerror=()=>reject(Error('Impossible de charger le lecteur Excel.'));
  document.head.appendChild(script);
 }).catch(error=>{excelReaderPromise=null;throw error;});
 return excelReaderPromise;
}
async function loadCommunityExcel(){
 if(state.communityExcel.status!=='idle')return;
 state.communityExcel.status='loading';
 const input='data/niveaux-non-battus.xlsx';
 try{
   if(location.protocol==='file:'){
     state.communityExcel={status:'ready',items:UNVERIFIED.OFFLINE_EXAMPLES,message:'',offline:true};
   }else{
     const response=await fetch(input+'?v='+Date.now(),{cache:'no-store'});
     if(!response.ok)throw Error('Fichier inaccessible ('+response.status+').');
     await ensureExcelReader();
     const workbook=window.XLSX.read(await response.arrayBuffer(),{type:'array'});
     const first=workbook.Sheets[workbook.SheetNames[0]];
     if(!first)throw Error('Le classeur Excel ne contient pas de feuille.');
     const objects=window.XLSX.utils.sheet_to_json(first,{defval:'',raw:false});
     const items=UNVERIFIED.fromSheet(objects);
     state.communityExcel={status:'ready',items,message:'',offline:false};
   }
 }catch(error){state.communityExcel={status:'error',items:[],message:String(error.message||error),offline:false};}
 if(state.data && nav()==='unbeaten')render();
}
const CLAN_STYLE_OPTIONS=[['classic','Classique'],['aurora','Aurore'],['neon','Néon'],['minimal','Minimaliste']];
function clanStyle(value){return ['classic','aurora','neon','minimal'].includes(value)?value:'classic';}
function clanPreviewCard(c){
 const col=CLAN_PLUS.hex(c?.color),name=String(c?.name||'Nouveau clan'),tag=String(c?.tag||'CLAN').toUpperCase();
 const image=src=>{const u=imageLink(src);return u?`<img src="${esc(u)}" alt="" loading="lazy">`:'';};
 return `<div class="clan-v99-preview clan-v99-style-${clanStyle(c?.card_style)}" data-clan-preview style="--clan-accent:${esc(col)}">
   <div class="clan-v99-preview-cover" data-clan-preview-cover>${image(c?.banner_url)}</div>
   <div class="clan-v99-preview-content"><span class="clan-v99-preview-logo" data-clan-preview-logo>${image(c?.logo_url)||esc(tag)}</span>
   <div class="clan-v99-preview-identity"><small data-clan-preview-tag>[${esc(tag)}]</small><strong data-clan-preview-name>${esc(name)}</strong><em data-clan-preview-motto>${esc(c?.motto||'Votre devise ici…')}</em></div></div>
  </div>`;
}
function clanStyleChoice(selected){return `<label class="field">Style de la fiche<select name="card_style">${CLAN_STYLE_OPTIONS.map(([value,label])=>`<option value="${value}" ${clanStyle(selected)===value?'selected':''}>${label}</option>`).join('')}</select></label>`;}
function syncClanPreview(form){
 const panel=form.querySelector('[data-clan-preview]');if(!panel)return;
 const val=name=>form.elements.namedItem(name)?.value||'';
 const text=(name,value)=>{const node=panel.querySelector(`[data-clan-preview-${name}]`);if(node)node.textContent=value;};
 panel.style.setProperty('--clan-accent',CLAN_PLUS.hex(val('color')));
 panel.className='clan-v99-preview clan-v99-style-'+clanStyle(val('card_style'));
 text('name',val('name')||'Nouveau clan');text('tag','['+(val('tag')||form.dataset.tag||'CLAN').toUpperCase()+']');
 text('motto',val('motto')||'Votre devise ici…');
 for(const part of ['logo','banner']){
   const root=panel.querySelector(`[data-clan-preview-${part==='banner'?'cover':'logo'}]`);if(!root)continue;
   const raw=val(part+'_url'),safe=raw.startsWith('https://')?imageLink(raw):'';
   root.replaceChildren();
   if(safe){const img=document.createElement('img');img.src=safe;img.alt='';img.loading='lazy';root.appendChild(img);}
   else if(part==='logo')root.textContent=(val('tag')||form.dataset.tag||'CLAN').toUpperCase();
 }
}
async function updateClanDemo(command){
 try{
  if(LIVE){
   if(!state.ownKey)throw Error('Un profil Geometry Dash approuvé est nécessaire.');
   const {error}=await db.rpc('dlfr_clan_action',{p_command:command});if(error)throw error;
   await refreshLiveData();
   await checkSelfOwner();
   await refreshClanTools();
   toast('Clan mis à jour !');render();return;
  }
  const engine=['update','promote','demote','request','withdraw','approve','reject'].includes(command.type)?CLAN_PLUS:CLANS;
  const next=engine.apply(state.data,{...command,actor:state.demoActor});
  for(const table of ['clans','clan_members','clan_invites','clan_requests'])if(Array.isArray(next[table]))state.data[table]=next[table];
  auditV2('CLAN_'+command.type.toUpperCase(),command.target||command.name||String(command.clan_id||command.request_id||''));
  toast('Clan mis à jour en démo locale');render();
 }catch(error){toast('Clan : '+error.message);}
}
function handleClanForm(form){try{
 const f=Object.fromEntries(new FormData(form));
 const type=form.dataset.form;
 if(type==='clanCreate')updateClanDemo({type:'create',name:f.name,tag:f.tag,description:f.description,color:f.color,motto:f.motto,card_style:f.card_style,banner_url:f.banner_url,logo_url:f.logo_url,recruiting:!!form.querySelector('[name="recruiting"]:checked')});
 else if(type==='clanRequest')updateClanDemo({type:'request',clan_id:Number(f.clan_id),message:f.message});
 else if(type==='clanEdit')updateClanDemo({type:'update',clan_id:Number(f.clan_id),name:f.name,description:f.description,banner_url:f.banner_url,logo_url:f.logo_url,color:f.color,recruiting:!!form.querySelector('[name="recruiting"]:checked'),motto:f.motto,card_style:f.card_style});
 else {const mine=CLANS.member(state.data,LIVE?state.ownKey:state.demoActor);if(!mine)throw Error('Rejoins un clan pour inviter.');updateClanDemo({type:'invite',clan_id:mine.clan_id,target:f.target});}
 }catch(error){toast('Clan : '+error.message);}
}
function handleClanAction(btn){try{
 const type=btn.dataset.clanAction,clan_id=Number(btn.dataset.clanId)||CLANS.member(state.data,LIVE?state.ownKey:state.demoActor)?.clan_id;
 if(['remove','transfer','disband'].includes(type)&&!confirm(type==='disband'?'Dissoudre ce clan ? Tous les membres et invitations seront retirés.':type==='transfer'?'Transférer définitivement la direction du clan ?':'Retirer ce joueur du clan ?'))return;
 updateClanDemo({type,clan_id,invite_id:btn.dataset.inviteId,request_id:btn.dataset.requestId,target:btn.dataset.target});
 }catch(error){toast('Clan : '+error.message);}
}
function clansPage(){
 const data=state.data,clans=data.clans||[],invites=data.clan_invites||[],requests=data.clan_requests||[],actor=LIVE?(state.ownKey||''):state.demoActor;
 const leaderBoard=CLAN_PLUS.stats(data,ranked(),catalog(),score);
 const myMembership=CLAN_PLUS.membership(data,actor),myClan=myMembership?CLAN_PLUS.clan(data,myMembership.clan_id):null;
 const isLeader=myMembership?.role==='leader',isManager=['leader','officer'].includes(myMembership?.role);
 const players=data.players.filter(p=>!p.hidden_from_stats);
 const who=k=>{const p=players.find(x=>key(x.player_key)===key(k));return p?fullName(p):k;};
 const showPicture=(value,kind)=>{const source=imageLink(value);return source?`<img class="${kind}" loading="lazy" src="${esc(source)}" alt="">`:'';};
 const actorSelect=!LIVE?`<div class="clan-player-simulator"><div><strong>Simulation de compte</strong><p class="small muted">La sélection d’un joueur est réservée à ce mode de démonstration.</p></div><label class="field">Jouer en tant que<select id="clanDemoActor">${players.map(p=>`<option value="${esc(p.player_key)}" ${key(p.player_key)===key(actor)?'selected':''}>${esc(fullName(p))}</option>`).join('')}</select></label></div>`:(state.ownKey?'':'<div class="notice warning">Pour rejoindre un clan, connecte ton compte Discord et revendique un profil approuvé.</div>');
 const selectedId=Number(new URLSearchParams(location.search).get('id'));
 const selected=leaderBoard.find(c=>c.clan.id===selectedId);
 const roleTag=r=>r==='leader'?'★ Chef':r==='officer'?'◆ Officier':'Membre';
 const actions=(c)=>{
   if(!actor)return '';
   const owns=!!myClan&&myClan.id===c.id;
   const manager=owns&&isManager,chief=owns&&isLeader;
   const pending=invites.filter(x=>Number(x.clan_id)===c.id&&x.status==='pending');
   const applicants=requests.filter(x=>Number(x.clan_id)===c.id&&x.status==='pending');
   const possible=LIVE?(state.clanCandidates||[]).map(x=>({player_key:x.candidate_key,display_name:x.candidate_name})).filter(p=>!CLANS.member(data,p.player_key)&&key(p.player_key)!==key(actor)):players.filter(p=>p.has_account&&!CLANS.member(data,p.player_key)&&key(p.player_key)!==key(actor));
   if(!owns){
     if(myClan)return '';
     const existing=requests.find(r=>r.clan_id===c.id&&key(r.player_key)===key(actor)&&r.status==='pending');
     return `<section class="clan-v22-panel"><h3>Rejoindre ce clan</h3>${existing?`<p>Candidature envoyée.</p><button class="btn subtle small" data-clan-action="withdraw" data-request-id="${existing.id}">Retirer ma candidature</button>`:c.recruiting?`<form data-form="clanRequest"><input type="hidden" name="clan_id" value="${c.id}"><label class="field">Motivation (facultatif)<input name="message" maxlength="220" placeholder="Pourquoi rejoindre ce clan ?"></label><button class="btn">Envoyer ma candidature</button></form>`:'<p class="muted small">Ce clan recrute uniquement sur invitation.</p>'}</section>`;
   }
   const inviteForm=manager?`<form data-form="clanInvite" class="clan-inline-form"><label class="field">Inviter un joueur<select name="target" required>${possible.map(p=>`<option value="${esc(p.player_key)}">${esc(fullName(p))}</option>`).join('')}</select></label><button class="btn" ${possible.length?'':'disabled'}>Inviter</button>${!possible.length?'<p class="small muted">Aucun joueur disponible à inviter. Les profils doivent être reliés à un compte.</p>':''}</form>`:'';
   const invitesList=manager?`<h4>Invitations en attente</h4>${pending.map(i=>`<div class="clan-v22-queue"><span>${esc(who(i.invitee_key))}</span><button class="btn subtle small" data-clan-action="cancel" data-invite-id="${i.id}">Annuler</button></div>`).join('')||'<p class="muted small">Aucune invitation en attente.</p>'}`:'';
   const requestsList=manager?`<h4>Candidatures reçues · ${applicants.length}</h4>${applicants.map(r=>`<div class="clan-v22-queue"><div><b>${esc(who(r.player_key))}</b> <span class="muted">${esc(r.message||'Sans message')}</span></div><div class="clan-actions"><button class="btn small" data-clan-action="approve" data-request-id="${r.id}">Accepter</button><button class="btn subtle small" data-clan-action="reject" data-request-id="${r.id}">Refuser</button></div></div>`).join('')||'<p class="muted small">Aucune candidature en attente.</p>'}`:'';
   const editForm=chief?`<details class="clan-v22-edit clan-v99-editor"><summary>🎨 Personnaliser mon clan</summary><p class="small muted">Le nom, la bannière, le logo, la devise et le style sont visibles par tous. Les changements sont enregistrés par le chef du clan.</p>
   <form data-form="clanEdit" class="clan-v22-form" data-tag="${esc(c.tag)}"><input name="clan_id" type="hidden" value="${c.id}">
   <label class="field">Nom du clan<input name="name" maxlength="45" minlength="3" required value="${esc(c.name)}"></label>
   <label class="field">Devise du clan<input name="motto" maxlength="110" value="${esc(c.motto||'')}" placeholder="Une phrase pour représenter ton équipe"></label>
   <label class="field clan-v99-field-wide">Description<textarea name="description" rows="3" maxlength="500">${esc(c.description||'')}</textarea></label>
   <label class="field">Bannière (URL HTTPS)<input name="banner_url" type="url" value="${esc(c.banner_url||'')}" placeholder="https://…"></label>
   <label class="field">Logo carré (URL HTTPS)<input name="logo_url" type="url" value="${esc(c.logo_url||'')}" placeholder="https://…"></label>
   <label class="field">Couleur d'accent<input name="color" type="color" value="${esc(CLAN_PLUS.hex(c.color))}"></label>
   ${clanStyleChoice(c.card_style)}
   <label class="clan-v22-check clan-v99-field-wide"><input name="recruiting" type="checkbox" ${c.recruiting?'checked':''}> Autoriser les candidatures de nouveaux membres</label>
   <div class="clan-v99-field-wide"><b>Aperçu avant publication</b>${clanPreviewCard(c)}</div>
   <button class="btn" type="submit">Enregistrer ma personnalisation</button></form></details>`:'';
   const leaderActions=chief?`<button class="btn subtle small" data-clan-action="disband" data-clan-id="${c.id}">Dissoudre le clan</button>`:`<button class="btn subtle small" data-clan-action="leave">Quitter le clan</button>`;
   return `<section class="clan-v22-panel"><h3>Gestion de mon clan <span class="tag">${roleTag(myMembership.role)}</span></h3>${inviteForm}${requestsList}${invitesList}${editForm}<div class="clan-actions">${leaderActions}</div></section>`;
 };
 const rankBlock=x=>`<div class="clan-v22-ranks"><div><span>Rang points</span><strong>#${x.totalPointsRank}</strong></div><div><span>Rang démons</span><strong>#${x.topCountRank}</strong></div><div><span>Rang hardest</span><strong>#${x.hardestPositionRank}</strong></div><div><span>Rang NLW</span><strong>#${x.nlwPointsRank}</strong></div></div>`;
 const metrics=x=>`<div class="clan-v22-metrics"><div><strong>${fmt(x.totalPoints)}</strong><span>Points Top 150 cumulés</span></div><div><strong>${fmt(x.nlwPoints)}</strong><span>Points NLW cumulés</span></div><div><strong>${x.topCount}</strong><span>Démons Top 150 distincts</span></div><div><strong>${x.uniqueCount}</strong><span>Démons tous classements</span></div><div><strong>${x.members.length}/25</strong><span>Membres</span></div><div><strong>${x.hardest?'#'+esc(x.hardest.position):'—'}</strong><span>Hardest du clan</span></div></div>`;
 if(selected){
  const c=selected.clan,manager=!!CLAN_PLUS.canManage(data,c.id,actor),chief=!!CLAN_PLUS.isLeader(data,c.id,actor);
  const tab=['overview','members','levels','created'].includes(state.clanDetailTab)?state.clanDetailTab:'overview';
  const membersHtml=[...selected.members].sort((a,b)=>({leader:0,officer:1,member:2}[a.role]-{leader:0,officer:1,member:2}[b.role])).map(m=>{
   const person=selected.people.find(p=>key(p.player_key)===key(m.player_key));
   const memberActions=(manager&&key(m.player_key)!==key(actor))?`<div class="clan-actions">${chief&&m.role!=='leader'?`<button class="btn subtle small" data-clan-action="${m.role==='officer'?'demote':'promote'}" data-clan-id="${c.id}" data-target="${esc(m.player_key)}">${m.role==='officer'?'Rétrograder':'Nommer officier'}</button>`:''}${chief?`<button class="btn subtle small" data-clan-action="transfer" data-clan-id="${c.id}" data-target="${esc(m.player_key)}">Transférer chef</button>`:''}${(chief||m.role==='member')?`<button class="btn subtle small" data-clan-action="remove" data-clan-id="${c.id}" data-target="${esc(m.player_key)}">Retirer</button>`:''}</div>`:'';
   return `<div class="clan-v22-member"><div><a data-nav class="link" href="${url('player',{player:m.player_key})}"><strong>${esc(who(m.player_key))}</strong></a><span class="tag">${roleTag(m.role)}</span></div><b>${fmt(person?.score||0)} pts</b>${memberActions}</div>`;
  }).join('');
  const finished=[...selected.entries].sort((a,b)=>Number(a.demon.position)-Number(b.demon.position));
  const completedHtml=finished.slice(0,100).map(e=>`<div class="clan-v22-level"><span class="clan-v22-position">#${esc(e.demon.position||'—')}</span><div><a class="link" data-nav href="${url('demon',{id:e.demon.id})}"><b>${esc(e.demon.name)}</b></a><div class="small muted">Terminé par ${[...e.players].map(who).map(esc).join(', ')}</div></div><span>${Number(e.demon.position)<=150?fmt(score(e.demon,100))+' pts':'NLW'}</span></div>`).join('');
  const latest=[...selected.completions].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,8);
  return v2Header('Profil de clan · '+esc(c.name),'Classement, membres, accomplissements et gestion communautaire.')+actorSelect+clanInvitationsHtml(actor,data)+`<a data-nav class="clan-v22-back" href="${url('clans')}">← Retour au classement des clans</a><div class="clan-v22-hero clan-v99-style-${clanStyle(c.card_style)}" style="--clan-accent:${esc(CLAN_PLUS.hex(c.color))}">${showPicture(c.banner_url,'clan-v22-banner')}<div class="clan-v22-hero-body"><div class="clan-v22-logo">${showPicture(c.logo_url,'clan-v22-logo-image')||esc(c.tag)}</div><div><span class="clan-v22-eyebrow">[${esc(c.tag)}] · ${c.recruiting?'Recrutement ouvert':'Sur invitation'}</span><h2>${esc(c.name)}</h2>${c.motto?`<div class="clan-v99-hero-motto">${esc(c.motto)}</div>`:''}<p>${esc(c.description||'')}</p></div></div></div>${rankBlock(selected)}${metrics(selected)}<div class="clan-v22-tabs">${[['overview','Présentation'],['members','Membres'],['levels','Démons complétés'],['created','Créations']].map(([id,label])=>`<button class="${tab===id?'active':''}" data-clan-tab="${id}" type="button">${label}</button>`).join('')}</div>${tab==='members'?`<section class="clan-section"><h2>Membres du clan (${selected.members.length})</h2>${membersHtml||'<p class="muted">Aucun membre.</p>'}</section>`:tab==='levels'?`<section class="clan-section"><h2>Collection de démons du clan</h2><p class="small muted">Chaque niveau est compté une seule fois, même si plusieurs membres l'ont terminé. Les points principaux cumulés, eux, sont la somme des points individuels.</p><div class="clan-v22-split"><span>Main : ${selected.mainCount}</span><span>Extended : ${selected.extendedCount}</span><span>NLW : ${selected.nlw.length}</span><span>Créés ou publiés : ${selected.created.length}</span></div><div class="clan-v22-levels">${completedHtml||'<p class="muted">Aucune complétion.</p>'}</div>${finished.length>100?'<p class="small muted">Seuls les 100 premiers niveaux sont affichés pour garder la page rapide.</p>':''}</section>`:tab==='created'?`<section class="clan-section"><h2>Niveaux créés ou publiés</h2><p class="muted small">Niveaux dont un membre est crédité comme créateur ou éditeur. Les crédits ne rapportent pas automatiquement des points de clan.</p><div class="clan-v22-levels">${selected.created.map(d=>`<div class="clan-v22-level"><span class="clan-v22-position">#${esc(d.position||'—')}</span><a data-nav class="link" href="${url('demon',{id:d.id})}">${esc(d.name)}</a><span>${Number(d.position)<=150?'Top 150':'NLW'}</span></div>`).join('')||'<p class="muted">Aucun niveau créé ou publié connu.</p>'}</div></section>`:`<section class="clan-section"><h2>Vue d'ensemble</h2><div class="clan-v22-split"><span>Points de niveaux distincts : ${fmt(selected.levelPoints)}</span><span>Top 150 : ${selected.topCount}</span><span>Main : ${selected.mainCount}</span><span>Extended : ${selected.extendedCount}</span></div><h3>Dernières complétions des membres</h3>${latest.map(r=>`<div class="clan-v22-recent"><span>${esc(date(r.created_at)||'Date inconnue')}</span><a data-nav class="link" href="${url('player',{player:key(r.player)})}">${esc(who(r.player))}</a><span>→</span><a data-nav class="link" href="${url('demon',{id:r.demon.id})}">${esc(r.demon.name)}</a></div>`).join('')||'<p class="muted">Aucune complétion.</p>'}</section>`}${actions(c)}</section>`;
 }
 const invitations=clanInvitationsHtml(actor,data);
 const formCreate=!!actor&&!myClan?`<details class="clan-v22-create clan-v99-editor"><summary>+ Créer un clan</summary><form data-form="clanCreate" class="clan-v22-form" data-tag="CLAN">
 <label class="field">Nom du clan<input name="name" required minlength="3" maxlength="45"></label>
 <label class="field">Tag (2 à 5 caractères)<input name="tag" required maxlength="5" pattern="[A-Za-z0-9]{2,5}"></label>
 <label class="field clan-v99-field-wide">Description<textarea name="description" maxlength="300" rows="2"></textarea></label>
 <label class="field">Devise<input name="motto" maxlength="110" placeholder="La devise de votre équipe"></label>
 <label class="field">Couleur<input type="color" name="color" value="#287bba"></label>
 <label class="field">Bannière (URL HTTPS)<input name="banner_url" type="url" placeholder="https://…"></label>
 <label class="field">Logo carré (URL HTTPS)<input name="logo_url" type="url" placeholder="https://…"></label>
 ${clanStyleChoice('classic')}
 <label class="clan-v22-check clan-v99-field-wide"><input type="checkbox" name="recruiting"> Candidatures ouvertes</label>
 <div class="clan-v99-field-wide"><b>Aperçu du clan</b>${clanPreviewCard({name:'Nouveau clan',tag:'CLAN',color:'#287bba',card_style:'classic'})}</div>
 <button class="btn">Créer mon clan</button></form></details>`:'';
 const sort=state.clanSort||'points';const sorter={points:(a,b)=>b.totalPoints-a.totalPoints,extremes:(a,b)=>b.topCount-a.topCount,hardest:(a,b)=>a.hardestPosition-b.hardestPosition,nlw:(a,b)=>b.nlwPoints-a.nlwPoints};
 const order=[...leaderBoard].sort((a,b)=>sorter[sort](a,b)||a.clan.id-b.clan.id).filter(x=>key(x.clan.name+' '+x.clan.tag+' '+x.clan.description).includes(key(state.clanSearch)));
 const cards=order.map((item,index)=>{const c=item.clan;return `<a data-nav class="clan-v22-rank-row clan-v99-style-${clanStyle(c.card_style)}" href="${url('clans',{id:c.id})}" data-clan-searchable="${esc(key(c.name+' '+c.tag+' '+c.description))}" style="--clan-accent:${esc(CLAN_PLUS.hex(c.color))}"><span class="clan-v22-rank">#${index+1}</span><span class="clan-v22-mark">${showPicture(c.logo_url,'clan-v22-tiny-logo')||esc(c.tag)}</span><span class="clan-v22-name"><strong>[${esc(c.tag)}] ${esc(c.name)}</strong><small>${item.members.length} membres · ${c.recruiting?'Candidatures ouvertes':'Sur invitation'}${c.motto?' · '+esc(c.motto):''}</small></span><span class="clan-v22-rank-metric">${sort==='points'?fmt(item.totalPoints)+' pts':sort==='nlw'?fmt(item.nlwPoints)+' NLW':sort==='extremes'?item.topCount+' démons':item.hardest?'#'+item.hardest.position:'—'}</span><span aria-hidden="true">→</span></a>`;}).join('');
 return v2Header('Classement des clans','Inspiré de l’AREDL : points cumulés, démons distincts, hardest, équipe et accomplissements.')+actorSelect+invitations+(myClan?`<div class="clan-v22-myclan">Mon clan : <a data-nav class="link" href="${url('clans',{id:myClan.id})}"><b>[${esc(myClan.tag)}] ${esc(myClan.name)}</b></a> <span class="tag">${roleTag(myMembership.role)}</span></div>`:'')+formCreate+`<section class="clan-section clan-v22-board"><div class="clan-v22-boardhead"><h2>Classement des clans · ${leaderBoard.length}</h2><label class="field">Rechercher<input id="clanSearch" placeholder="Nom ou tag…" value="${esc(state.clanSearch||'')}"></label></div><div class="clan-v22-sort">${[['points','Points Top 150'],['extremes','Démons complétés'],['hardest','Hardest'],['nlw','Points NLW']].map(([id,label])=>`<button class="${sort===id?'active':''}" data-clan-sort="${id}" type="button">${label}</button>`).join('')}</div><div id="clanRanking">${cards||'<p class="muted">Aucun clan.</p>'}</div><p class="small muted">${LIVE?'Classements calculés à partir des données Supabase des membres.':'Classements calculés depuis les données Supabase.'}</p></section></section>`;
}
function historyPage(){const lookup=new Map(catalog().map(d=>[Number(d.id),d]));const records=state.data.completions.map(r=>({...r,demon:lookup.get(Number(r.demon_id))})).filter(r=>r.demon&&r.demon.position<=150&&Number(r.progress)>=100).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));return v2Header('Historique des complétions · Top 150','Un flux chronologique des complétions, avec mise en valeur uniforme de la Main List (#1–75).')+`<div class="v2-legend"><span class="hist-main">Main List · #1–75</span><span>Extended List · #76–150</span></div><div class="v2-timeline">${records.map(r=>`<article class="timeline-record ${r.demon.position<=75?'main-rank':''}"><time>${date(r.created_at)}</time><div><a class="link" data-nav href="${url('player',{player:key(r.player)})}">${esc(r.player)}</a> a terminé <a class="link" data-nav href="${url('demon',{id:r.demon.id})}"><b>#${r.demon.position} ${esc(r.demon.name)}</b></a>${r.demon.unrated?' <span class="tag">UNRATED</span>':''}</div>${http(r.video_url)?`<a href="${esc(http(r.video_url))}" rel="noopener noreferrer" target="_blank">Preuve ↗</a>`:''}</article>`).join('')||'<p class="empty">Aucune complétion Top 150.</p>'}</div></section>`;}
function renderBadgeSummary(){const p=ranked().filter(statsPlayerVisible);return `<div class="badge-summary">${['Faucheur de liste','Vérificateur','Amateur de difficulté'].map(n=>`<article><b>${n}</b><p>${p.filter(x=>x.autoBadges.some(a=>a.id===n)).length} joueur(s) ayant un palier</p></article>`).join('')}</div>`;}
// V2.7 — page unique pour le Hall of Fame historique et les achievements français.
// Les anciennes routes ?page=hall et ?page=achievements restent compatibles.
function honorsPage(page='honors'){
 const qs=new URLSearchParams(location.search);
 const tab=['all','hall','achievements'].includes(qs.get('tab'))?qs.get('tab'):(page==='hall'?'hall':page==='achievements'?'achievements':'all');
 const halls=(state.data.hall_of_fame||[]).filter(x=>x.is_published||state.staff);
 const achievements=state.data.fr_achievements||[];
 const items=[
  ...halls.map(h=>({type:'hall',sortTime:Number(h.award_year)>0?Date.UTC(Number(h.award_year),0,1):0,title:h.headline,player:h.player_key,description:h.description||'',category:h.category||'Distinction',when:plain(h.award_year)||'—',source:http(h.source_url),isDraft:!h.is_published})),
  ...achievements.map(a=>({type:'achievements',sortTime:new Date(a.created_at).getTime()||0,title:a.title,player:a.player_key,description:a.description||'',category:a.level_name||'Exploit communautaire',when:date(a.created_at),run:a.run_text||'',source:http(a.video_url),isDraft:false}))
 ];
 // Tri chronologique commun : date exacte pour les exploits, début d’année pour les distinctions.
 items.sort((a,b)=>b.sortTime-a.sortTime||(a.type==='hall'?-1:1));
 const shown=items.filter(i=>tab==='all'||i.type===tab);
 const tabs=[['all','Tout voir',items.length],['hall','Distinctions',halls.length],['achievements','Exploits FR',achievements.length]];
 const header=v2Header('Palmarès & exploits','Un seul espace pour les distinctions historiques, les runs et les exploits marquants de la communauté.');
 const counters=`<div class="honors-overview"><div><strong>${halls.length}</strong><span>Distinctions</span></div><div><strong>${achievements.length}</strong><span>Exploits français</span></div><div><strong>${new Set(items.map(i=>key(i.player)).filter(Boolean)).size}</strong><span>Joueurs mis à l'honneur</span></div></div>`;
 const nav=`<nav class="honors-tabs" aria-label="Filtrer le palmarès">${tabs.map(([id,label,n])=>`<a data-nav href="${url('honors',{tab:id})}" class="${tab===id?'active':''}" ${tab===id?'aria-current="page"':''}>${label}<span>${n}</span></a>`).join('')}</nav>`;
 const cards=shown.map(item=>`<article class="honors-card ${item.type==='hall'?'honors-distinction':'honors-exploit'}"><div class="honors-card-top"><span class="honors-category">${item.type==='hall'?'✦ Distinction':'◇ Exploit FR'}</span><span class="honors-date">${esc(item.when)}</span></div><h2>${esc(item.title)}</h2><p class="honors-meta">${esc(item.category)}${item.run?' · '+esc(item.run):''}${item.isDraft?' · Brouillon':''}</p><p><a class="link" data-nav href="${url('player',{player:item.player})}">${esc(item.player)}</a></p>${item.description?`<p class="honors-description">${esc(item.description)}</p>`:''}${item.source?`<a class="honors-proof" href="${esc(item.source)}" target="_blank" rel="noopener noreferrer">${item.type==='hall'?'Voir la source':'Voir la preuve'} ↗</a>`:''}</article>`).join('');
 return header+counters+nav+`<div class="honors-grid">${cards||'<p class="empty honors-empty">Aucune entrée dans cette catégorie pour le moment.</p>'}</div><p class="small muted honors-explainer">Les distinctions sont des récompenses historiques. Les exploits mettent en avant des runs ou des défis, sans attribution de points.</p></section>`;
}
function showPageError(error){
 console.error('[DLFR] Erreur de démarrage / affichage :',error);
 el.innerHTML='<section class="center-panel startup-error" role="alert"><h2>La page n’a pas pu s’afficher</h2><p>Un problème temporaire empêche l’affichage. Tes données ne sont pas modifiées.</p><button type="button" class="btn" onclick="location.reload()">Réessayer</button><p class="small muted">Si le problème persiste, préviens l’équipe DLFR.</p></section>';
}

function render(){
 const start=perfNow();
 resetRenderCalculations();if(!state.data)return;v96EnsureHalloweenTheme();try{
 if(!BADGES?.init || !UNRATED_STATS?.calculate || !V2?.decorate || !V2?.project || !UNVERIFIED?.classify || !CLANS?.apply || !CLAN_PLUS?.stats || !SUBMISSIONS?.approve)throw Error('Fichier JavaScript V2 manquant ou version incohérente : réinstalle les scripts du pack V2.0.3.');
 if(!LIVE){const first=state.data.badge_baseline_scanned!==true;const changed=BADGES.captureAutomatic(state.data,ranked(),new Date().toISOString().slice(0,10),first);if(first){state.data.badge_baseline_scanned=true;}if(changed||first)saveDemo();}
 const page=nav(),params=new URLSearchParams(location.search);if(page==='unbeaten'&&state.communityExcel.status==='idle')loadCommunityExcel().catch(showPageError);if(page==='stats'&&params.has('player')){history.replaceState({},'',url('player',{player:params.get('player')}));return render();}if(page==='player')state.selectedPlayer=key(params.get('player'));if(page==='list'){const tab=new URLSearchParams(location.search).get('tab');state.list=(tab==='nlw'||tab==='archive')?'nlw':'main';}
 const needed=requiredGroups(page);
 // Éviter des sections vides pendant le chargement à la demande, tout en
 // permettant un affichage dégradé lorsque le serveur renvoie une erreur.
 for(const name of needed)startOptionalGroup(name);
 if(needed.some(name=>optionalStatus[name]==='loading')){
  el.innerHTML='<section class="center-panel loading" aria-live="polite"><h2>Chargement des données de cette page…</h2><p class="small muted">Les autres pages restent accessibles.</p></section>';
  return;
 }
 if(page==='admin'&&state.adminTab==='leaderboard'&&!state.modLeaderboardReady&&!state.modLeaderboardLoading)void loadModeratorLeaderboard();
 const content=page==='archive'?archivePage():page==='stats'?statsPage():page==='player'?playerPage():page==='players'?playersPage():page==='my-profile'?selfProfilePage():page==='my-submissions'?mySubmissionsPage():page==='demon'?demonPage():page==='news'?newsPage():page==='activity'?activityPage():page==='packs'?packPage():page==='regions'?regionsPage():['honors','hall','achievements'].includes(page)?honorsPage(page):page==='calculator'?calculatorPage():page==='unbeaten'?unbeatenPage():page==='clans'?clansPage():page==='history'?historyPage():page==='submit-record'?submitRecordPage():page==='admin'?adminPage():listPage();el.innerHTML=migrationNotice()+content;
 // Donner un accès clair à l'inscription et à la connexion, sans modifier la navigation existante.
 const accountNavLink=document.querySelector('a[data-link="my-profile"]');
 if(accountNavLink) accountNavLink.textContent=state.session?'Mon profil':'Se connecter / Créer un compte';
 if(page==='list'){v80WeeklyRender();v81RewardsRender();}if(page==='admin'&&state.adminTab==='weekly'&&state.staffRole==='owner'&&!ownerPreviewActive())v86AdminLoad();
 if(page==='player'||(page==='my-profile'&&document.getElementById('v81-profile-rewards')))v81ProfileRewards();if(page==='stats'||page==='players')v90LoadFx();
 if(page==='admin'&&state.staffRole==='owner'){
   const switcher=document.createElement('section');switcher.className='paper owner-role-switcher';
   switcher.innerHTML='<h2>Aperçu des rôles de modération</h2><p class="small muted">Vue de l’interface seulement : ton compte reste propriétaire. Aucun enregistrement n’est autorisé en aperçu.</p><div class="owner-role-actions">'+
   [['owner','Propriétaire'],['nlw','Modo NLW'],['moderator','Modo'],['supermoderator','Supermodo']].map(([role,label])=>`<button type="button" class="btn ${state.ownerPreview===role?'':'subtle'}" data-owner-preview-role="${role}" aria-pressed="${state.ownerPreview===role}">${label}</button>`).join('')+'</div>'+
   (ownerPreviewActive()?'<div class="notice warning"><b>APERÇU — LECTURE SEULE</b> · Aucune permission ni rôle réel n’a été modifié.</div>':'');
   el.prepend(switcher);
   if(ownerPreviewActive()){
     el.querySelectorAll('form input,form select,form textarea,form button').forEach(x=>{x.disabled=true;});
     el.querySelectorAll('button').forEach(x=>{
       if(!x.hasAttribute('data-owner-preview-role')&&!x.hasAttribute('data-admin-tab')&&!x.hasAttribute('data-level-group')&&!x.hasAttribute('data-identity-tab'))x.disabled=true;
     });
   }
 }
 if(page==='admin'&&state.adminTab==='levels'&&['nlw','moderator'].includes(state.staffRole))scopedLevelSearch('');if(page==='admin'&&state.adminTab==='profiles')fillProfileEditor();if(page==='admin'&&state.adminTab==='levels'){arrangeLevelsPanel();syncLevelStudio();}document.title=({list:'Demonlist',stats:'Statistiques',player:'Profil joueur',players:'Profils des joueurs',news:'Actualités',activity:'Vie communautaire',regions:'Carte des régions',packs:'Level Packs',hall:'Palmarès & exploits',honors:'Palmarès & exploits',admin:'Modération',calculator:'Calculateur',unbeaten:'Non vérifiés',achievements:'Palmarès & exploits',clans:'Clans',history:'Historique','my-profile':'Mon profil','my-submissions':'Mes soumissions','submit-record':'Soumettre un record',demon:'Niveau',archive:'Archives historiques'})[page]+' · DemonlistFrancophone';
 if(PERF_DEBUG)console.info('[DLFR perf] Rendu',page,Math.round(perfNow()-start)+' ms');
 }catch(error){showPageError(error);}
}
function auditV2(action,target){state.data.community_audit_log.push({action_key:action,target,created_at:new Date().toISOString()});saveDemo();}
async function save(table,item,{upsert=false,on=null}={}){
 if(!LIVE){const existing=state.data[table];const copy={...item};if(!('id' in copy)&&['news_items','profile_titles','hall_of_fame','demons','completions'].includes(table))copy.id=Math.max(0,...existing.map(r=>Number(r.id)||0))+1;
 if(table==='news_items'&&!copy.created_at)copy.created_at=new Date().toISOString();if(upsert){const match=existing.findIndex(p=>(on||['id']).every(f=>String(p[f])===String(copy[f])));if(match>=0)existing[match]={...existing[match],...copy};else existing.push(copy);}else existing.push(copy);
 state.data.community_audit_log.push({action_key:upsert?'UPDATE':'INSERT',target:table,created_at:new Date().toISOString()});saveDemo();return;
 }
 const q=upsert?db.from(table).upsert(item,{onConflict:(on||['id']).join(',')}):db.from(table).insert(item);
 const {error}=await q;if(error)throw Error(error.message);
}
async function handleForm(form,submitter=null){if(ownerPreviewActive()&&new URLSearchParams(location.search).get('page')==='admin')throw Error('Aperçu du rôle en lecture seule.');if(state.busy)return;state.busy=true;const submit=form.querySelector('[type="submit"],button:not([type])');if(submit)submit.disabled=true;
 try{ if(form.dataset.form==='v86Weekly'){
  if(!LIVE||state.staffRole!=='owner'||ownerPreviewActive())throw Error('Réservé au propriétaire.');
  const f=Object.fromEntries(new FormData(form).entries());
  const {error}=await db.rpc('dlfr_owner_weekly_save',{p_week:f.week_start,p_demon_id:Number(f.demon_id),p_reward:Number(f.reward)});
  if(error)throw error;toast('Défi programmé !');await v86AdminLoad();return;
 }

 const type=form.dataset.form, f=Object.fromEntries(new FormData(form).entries());
  if(type==='scopedCreateLevel'||type==='scopedEditLevel'){
   if(!LIVE||!state.staff||!['nlw','moderator'].includes(state.staffRole))throw Error('Rôle de modération standard ou NLW requis.');
   const pos=Number(f.position),nlw=state.staffRole==='nlw';
   const isUnrated=type==='scopedCreateLevel'&&f.unrated==='on';
   if(isUnrated&&state.staffRole!=='moderator')throw Error('La création UNRATED est réservée aux modos classiques et à la supermodération.');
   if(!Number.isSafeInteger(pos)||pos<(nlw?151:1)||pos>99999998)throw Error('Position non autorisée pour ce rôle.');
   const params={p_name:plain(f.name),p_position:pos,p_publisher:plain(f.publisher),p_creator:plain(f.creator)||null,p_verifier:plain(f.verifier)||null,p_requirement:Number(f.requirement),p_completion_mode:plain(f.completion_mode)||'standard',p_verifier_video_url:plain(f.verifier_video_url)||null,p_thumbnail_url:plain(f.thumbnail_url)||null};
   if(type==='scopedCreateLevel'){
    params.p_gd_level_id=plain(f.level_id)||null;
    const {error}=await db.rpc(isUnrated?'dlfr_scoped_unrated_create':'dlfr_scoped_level_create',params);
    if(error)throw Error(error.message);
    toast(isUnrated?'Niveau UNRATED créé !':'Niveau créé !');
   }else{
    const id=Number(f.demon_id);
    const current=scopedAllowedLevels().find(d=>Number(d.id)===id);
    if(!current)throw Error('Niveau inaccessible pour ce rôle.');
    if(Number(current.position)!==pos&&f.confirm_move!=='on')throw Error('Confirme le changement de position avant de continuer.');
    params.p_demon_id=id;params.p_level_id=plain(f.level_id)||null;params.p_video_url=plain(f.video_url)||null;
    const {error}=await db.rpc('dlfr_scoped_level_update',params);
    if(error)throw Error(error.message);
    toast('Fiche de niveau mise à jour !');
   }
   await refreshLiveData();state.adminTab='levels';render();return;
  }
 if(type==='compactNlw'){
  if(!hasFullStaffPowers())throw Error('Supermodération requise.');
  if(await window.DLFR_CLAIMS.compact(db,form,submitter)){await refreshLiveData();toast('Rangs NLW regroupés.');}return;
 }
 if(type==='claimVerification'){
  const {error}=await db.rpc('dlfr_submit_verification_claim',{p_demon_id:Number(f.demon_id),p_video_url:f.video_url,p_message:f.message||''});
  if(error)throw Error(error.message);await refreshLiveData();render();toast('Demande envoyée à la modération.');return;
 }
 if(type==='reviewVerification'){
  if(!['accept','reject'].includes(submitter?.value))throw Error('Choisis Accepter ou Refuser.');
  const {error}=await db.rpc('dlfr_review_verification_claim',{p_claim_id:Number(f.claim_id),p_accept:submitter.value==='accept',p_snapshot:f.snapshot,p_note:f.note||'',p_previous_player_key:f.previous_player_key||null});
  if(error)throw Error(error.message);await refreshLiveData();render();toast('Décision enregistrée.');return;
 }
 if(type==='bulkNlwFR'){
  if(!hasFullStaffPowers())throw Error('Supermodération requise.');
  const published=await window.DLFR_BULK.submit(db,form,submitter);
  if(published){await refreshLiveData();toast('Import NLW terminé.');}
  return;
 }
 if(type==='deleteHiddenLevel'){
  if(!LIVE||state.staffRole!=='owner')throw Error('Seul le propriétaire peut supprimer une fiche masquée.');
  const id=Number(f.demon_id),action=submitter?.value;
  if(!Number.isSafeInteger(id)||id<=0)throw Error('Choisis un niveau masqué.');
  if(action==='preview'){
    const {data,error}=await db.rpc('dlfr_preview_hidden_demon_delete',{p_demon_id:id});
    if(error)throw Error(error.message);
    const target=document.getElementById('hiddenDeletePreview');
    if(target){target.hidden=false;target.textContent=`${data.name} · #${data.position}\n`+
      (data.references||[]).map(r=>`${r.table}: ${r.count} référence(s)${r.technique?' (historique technique)':' — bloque la suppression'}`).join('\n')+
      (data.can_delete?'\nSuppression autorisée après confirmation.':'\nSuppression refusée : des données liées doivent être conservées.');
      target.style.whiteSpace='pre-wrap';}
    form.dataset.deletePreviewId=data.can_delete?String(id):'';
    const del=form.querySelector('[name="delete_action"][value="delete"]');if(del)del.disabled=!data.can_delete;
    toast('Aperçu des dépendances chargé.');return;
  }
  if(action!=='delete'||form.dataset.deletePreviewId!==String(id))throw Error('Examine d’abord cette fiche avant de confirmer.');
  if(f.confirmation!=='SUPPRIMER')throw Error('Écris exactement SUPPRIMER.');
  const target=(state.unpublishedAredlDemons||[]).find(d=>Number(d.id)===id);
  if(!target||f.confirm_name!==target.name)throw Error('Recopie exactement le nom du niveau.');
  if(!confirm(`Supprimer définitivement ${target.name} ? Cette opération ne pourra pas être annulée.`))return;
  const {error}=await db.rpc('dlfr_delete_hidden_demon',{p_demon_id:id,p_confirm_name:f.confirm_name,p_confirmation:f.confirmation});
  if(error)throw Error(error.message);
  await refreshLiveData();toast('Niveau masqué supprimé définitivement.');render();return;
 }
 if(type==='prodCompletion'){
  if(!hasFullStaffPowers()||!state.staff)throw Error('Supermodérateur requis.');
  if(f.confirm_verified!=='yes')throw Error('Confirme avoir vérifié la victoire.');
  const level=(state.data.demons||[]).find(d=>String(d.id)===String(f.demon_id));
  const player=(state.data.players||[]).find(p=>p.player_key===f.player_key);
  if(!player||!level||level.is_public!==true||level.legacy)throw Error('Joueur ou niveau publié introuvable.');
  if((state.mergedSourceKeys||[]).includes(player.player_key))throw Error('Cette fiche a déjà été fusionnée.');
  const previous=(state.data.completions||[]).find(r=>Number(r.demon_id)===Number(level.id)&&key(r.player)===player.player_key);
  if(!confirm(`${previous?'Mettre à jour':'Attribuer'} la victoire 100 % de ${sortPlayerName(player)} sur ${level.name} ?${previous?' Un record existe déjà ('+previous.progress+' %).':''}`))return;
 }
 if(type==='addCoowner'){
  if(!LIVE||state.staffRole!=='owner')throw Error('Réservé au propriétaire.');
  if(f.confirmation!=='COPROPRIETAIRE')throw Error('Écris COPROPRIETAIRE pour confirmer.');
  const target=state.teamCandidates.find(x=>x.auth_user_id===f.auth_user_id);
  if(!target||target.current_role==='owner')throw Error('Sélectionne un compte qui n’est pas déjà propriétaire.');
  if(!confirm('Donner les droits COMPLETS de propriétaire à '+(target.display_name||'ce compte')+' ? Cette action ne peut pas être annulée dans le site.'))return;
  const {error}=await db.rpc('dlfr_add_coowner',{p_auth_user_id:f.auth_user_id,p_confirmation:f.confirmation});
  if(error)throw Error(error.message);
  await refreshLiveData();await loadStaffCandidates();render();toast('Deuxième propriétaire ajouté.');return;
 }
 if(type==='linkVerifier'){
  if(!LIVE||!state.staff||['nlw','moderator'].includes(state.staffRole))throw Error('Supermodérateur requis.');
  if(f.confirmation!=='RATTACHER')throw Error('Écris RATTACHER pour confirmer.');
  if(!f.verifier_name)throw Error('Choisis un vérificateur.');
  f.verifier_name=window.__dlfrVerifierUnlinked?.[Number(f.verifier_name)]?.verifier_name;
  if(!f.verifier_name)throw Error('Recharge les vérificateurs.');
  if(f.mode==='existing'&&!f.player_key)throw Error('Choisis une fiche joueur.');
  if(f.mode==='new'&&!String(f.new_player_name||'').trim())throw Error('Saisis le pseudo de la nouvelle fiche.');
  const {data,error}=await db.rpc('dlfr_link_verifier',{p_verifier_name:f.verifier_name,p_player_key:f.mode==='existing'?f.player_key:null,p_new_player_name:f.mode==='new'?f.new_player_name:null});
  if(error)throw Error(error.message);
  await refreshLiveData();toast('Vérifications liées : '+(data?.updated||0)+' niveau(x).');render();return;
 }
 if(type==='requestPlayerMerge'){
  if(!LIVE||!state.session||!state.ownKey)throw Error('Relie d’abord ta fiche joueur à ton compte.');
  if(state.mergeRequestsError)throw Error(state.mergeRequestsError);
  if(!state.mergeRequestCandidates.some(x=>x.player_key===f.source_key))throw Error('Choisis une fiche libre dans les résultats.');
  const {error}=await db.rpc('dlfr_request_player_merge',{p_source_key:f.source_key,p_message:f.message||'',p_proof_url:f.proof_url||''});
  if(error)throw Error(error.message);
  await refreshLiveData();render();toast('Demande de fusion envoyée à la modération.');return;
 }
 if(type==='reviewPlayerMerge'){
  if(!LIVE||!hasFullStaffPowers()||ownerPreviewActive())throw Error('Supermodérateur requis.');
  const request=(state.mergeRequests||[]).find(r=>Number(r.id)===Number(f.request_id)&&r.status==='pending');
  if(!request)throw Error('Demande introuvable ou déjà traitée.');
  const act=submitter?.value;
  if(act==='preview'){
   const {data,error}=await db.rpc('dlfr_merge_players_preview',{p_source_key:request.source_key,p_target_key:request.target_key});
   if(error)throw Error(error.message);
   const preview=document.querySelector(`[data-merge-preview="${request.id}"]`);
   if(preview){preview.hidden=false;preview.textContent='Aperçu contrôlé : '+JSON.stringify(data,null,2);preview.style.whiteSpace='pre-wrap';}
   const acceptButton=form.querySelector('[name="merge_review_action"][value="accept"]');if(acceptButton)acceptButton.disabled=false;
   toast('Aperçu chargé. Vérifie l’identité du joueur avant validation.');return;
  }
  if(!['accept','reject'].includes(act))throw Error('Action non reconnue.');
  if(act==='accept'&&f.confirmation!=='FUSIONNER')throw Error('Saisis exactement FUSIONNER pour accepter.');
  if(act==='accept'&&!confirm('Confirmer la fusion de '+request.source_username+' vers '+request.target_username+' ? Les records seront transférés et la source archivée.'))return;
  const {error}=await db.rpc('dlfr_review_player_merge_request',{p_request_id:Number(request.id),p_accept:act==='accept',p_note:f.note||'',p_confirmation:act==='accept'?f.confirmation:''});
  if(error)throw Error(error.message);
  await refreshLiveData();render();toast(act==='accept'?'Demande acceptée : fusion enregistrée.':'Demande refusée.');return;
 }
 if(type==='mergePlayers'){
  if(!LIVE||!state.staff||['nlw','moderator'].includes(state.staffRole))throw Error('Supermodérateur requis.');
  if(!f.source_key||!f.target_key||f.source_key===f.target_key)throw Error('Choisis deux profils distincts.');
  if(state.mergedSourceError)throw Error('Impossible de vérifier l’historique des fusions.');
  if(!mergeCandidates().some(p=>p.player_key===f.source_key)||!mergeCandidates().some(p=>p.player_key===f.target_key))throw Error('Ce profil a déjà été fusionné ou n’existe plus dans la liste des profils actifs.');
  const execute=submitter?.value==='execute';
  if(execute&&f.confirmation!=='FUSIONNER')throw Error('Écris FUSIONNER pour confirmer.');
  const {data,error}=await db.rpc(execute?'dlfr_merge_players':'dlfr_merge_players_preview',{p_source_key:f.source_key,p_target_key:f.target_key});
  if(error)throw Error(error.message);
  if(execute){await refreshLiveData();toast('Fusion enregistrée. Profil source archivé.');render();}
  else {const e=document.getElementById('mergePlayersPreview');if(e){e.hidden=false;e.textContent='Aperçu : '+JSON.stringify(data,null,2);e.style.whiteSpace='pre-wrap';}toast('Aperçu chargé : vérifie les données avant confirmation.');}
  return;
 }

 if(LIVE&&PROD.handles(type)){
  if(type!=='prodClaim'&&type!=='selfCreatePlayer'&&type!=='submitRecord'&&!state.staff)throw Error('Modérateur requis.');
  // Les actions personnelles restent accessibles aux joueurs ayant aussi un rôle de modération.
  if(['nlw','moderator'].includes(state.staffRole)&&!['prodScopedReview','prodClaim','selfCreatePlayer','submitRecord'].includes(type))throw Error('Action réservée aux supermodérateurs.');
  if(type==='submitRecord'){f.__demon=f.submission_mode==='new'?null:(state.data.demons||[]).find(d=>String(d.id)===String(f.demon_id));f.__cfg=cfg();}
  await PROD.send(db,type,f,submitter);
  await refreshLiveData();
  if(type==='prodManageStaff')await loadStaffCandidates();
  await checkSelfOwner();
  if(type==='selfCreatePlayer'&&!state.ownKey)throw Error('La fiche a ete creee, mais le lien avec ton compte n\'est pas visible. Recharge avant de recommencer : ne cree pas une deuxieme fiche.');
  if(['selfCreatePlayer','prodClaimReview'].includes(type))await refreshClanTools();
  toast(type==='selfCreatePlayer'?'Fiche creee et associee a ton compte !':type==='prodClaim'?'Demande de liaison enregistrée. Elle attend la vérification de la modération.':'Opération enregistrée.');render();return;
 }

 if(type==='renameUsername'){
  if(!LIVE||!state.session||!USERNAME_AUTH?.rename)throw Error('Connecte-toi pour modifier ton pseudo.');
  const result=await USERNAME_AUTH.rename(db,C,f.username);
  await refreshUsernameAccount();
  toast('Pseudo de connexion modifié.');render();return;
 }
 if(type==='deleteAccount'){
  if(!LIVE||!state.session||!USERNAME_AUTH?.removeAccount)throw Error('Connecte-toi pour supprimer ton compte.');
  if(!confirm('Supprimer définitivement ton compte DLFR ? Cette action est irréversible.'))return;
  await USERNAME_AUTH.removeAccount(db,C,f.confirmation,f.password||'');
  try{await db.auth.signOut({scope:'local'});}catch{}
  state.session=null;state.ownKey=null;state.usernameAccount=null;state.usernameAccountError='';state.staff=false;state.staffRole=null;
  toast('Compte supprimé.');render();return;
 }
 if(type==='attachUsername'){
  if(!LIVE||!state.session||!discordIdentity()||C.enableUsernameLogin!==true||!USERNAME_AUTH?.attach)throw Error('Connecte-toi avec Discord pour activer ton pseudo.');
  if(f.password!==f.password_confirm)throw Error('Les mots de passe ne correspondent pas.');
  await USERNAME_AUTH.attach(db,C,f.username,f.password);
  await refreshUsernameAccount();
  toast('Connexion par pseudo activée sur ton compte Discord !');render();return;
 }
 if(type==='usernameRegister'||type==='usernameLogin'){
  if(!LIVE||C.enableUsernameLogin!==true||!USERNAME_AUTH)throw Error('Connexion par pseudo non configurée.');
  const action=type==='usernameRegister'?'register':'login';
  if(action==='register'&&f.password!==f.password_confirm)throw Error('Les deux mots de passe sont différents.');
  if(action==='login'&&f.new_password!==f.new_password_confirm)throw Error('Les deux nouveaux mots de passe sont différents.');
  const session=await USERNAME_AUTH.signIn(db,C,action,f.username,f.password,action==='login'?{newPassword:f.new_password||''}:{});
  state.session=session;
  await checkStaff();await refreshLiveData();await checkSelfOwner();await refreshUsernameAccount();await refreshClanTools();
  toast(action==='register'?'Compte créé. Tu peux maintenant créer ou revendiquer ta fiche Geometry Dash.':'Connexion réussie.');
  render();return;
 }
 if(type==='selfProfile'){await saveSelfProfile(form);return;}
 if(type==='submitRecord'){
  if(LIVE)throw Error('Soumissions réelles indisponibles avant la migration Auth / RLS.');
  const owner=(state.data.players||[]).find(p=>p.player_key===state.ownKey);
  if(!state.session||!owner?.username)throw Error('Fiche joueur liée au compte obligatoire.');
  const isNew=f.submission_mode==='new';
  const demon=isNew?null:(state.data.demons||[]).find(d=>String(d.id)===String(f.demon_id));
  if(!isNew&&!demon)throw Error('Choisis un niveau dans la liste.');
  const player=plain(owner.username),level_name=isNew?plain(f.level_name):plain(demon.name),video_url=http(f.video_url),raw_footage_url=http(f.raw_footage_url);
  const level_id=isNew?plain(f.level_id):plain(demon.level_id);
  if(isNew&&(!/^\d{1,18}$/.test(level_id)||level_name.length<2||level_name.length>120))throw Error('Nom ou ID Geometry Dash invalide.');
  if(isNew&&(state.data.demons||[]).some(d=>d.is_public!==false&&String(d.level_id||'')===level_id))throw Error('Ce niveau existe déjà : sélectionne-le dans la liste.');
  const pos=demon&&!demon.unrated?num(demon.position):0,req=demon?Math.max(1,Math.min(100,num(demon.requirement||100))):100;
  const top150=!isNew&&pos>=1&&pos<=num(cfg().extended_limit),top75=!isNew&&pos>=1&&pos<=num(cfg().main_limit);
  const progress=top75?Number(f.progress||100):100;
  if(!submitIsYoutube(video_url))throw Error('Ajoute un lien YouTube valide (youtube.com ou youtu.be).');
  if(top150&&!raw_footage_url)throw Error('Le raw footage est obligatoire pour le Top 150.');
  if(!Number.isInteger(progress)||progress<req||progress>100)throw Error('Pourcentage invalide (minimum '+req+' %).');
  const rows=state.data.level_submissions||[];
  if(rows.some(x=>x.status==='pending'&&(level_id&&String(x.level_id)===level_id||SUBMISSIONS.norm(x.level_name)===SUBMISSIONS.norm(level_name))&&SUBMISSIONS.norm(x.player)===SUBMISSIONS.norm(player)))throw Error('Une soumission identique attend déjà validation.');
  rows.push({id:Math.max(0,...rows.map(x=>Number(x.id)||0))+1,status:'pending',level_name,level_id,player,progress,video_url,raw_footage_url,publisher:isNew?'À renseigner':plain(demon.publisher),creator:isNew?'':plain(demon.creator),verifier:isNew?'':plain(demon.verifier),suggested_position:null,submitted_at:new Date().toISOString()});
  state.data.level_submissions=rows;saveDemo();toast('Soumission envoyée en modération (démo).');render();return;
 }
 if(type==='reviewSubmission'){
  if(LIVE||!state.staff)throw Error('Acceptation réelle non disponible sans service sécurisé.');
  const accepted=SUBMISSIONS.approve(state.data,f.submission_id,{rating:f.rating,position:f.position,requirement:f.requirement},state.demoRole,new Date().toISOString().slice(0,10));
  state.data=accepted.data; auditV2('APPROVE',accepted.created?'Niveau '+accepted.demon.name+' · '+(accepted.demon.unrated?'UNRATED':'Rated'):'Record '+accepted.record.player+' / '+accepted.demon.name);
  saveDemo();toast(accepted.created?'Niveau '+(accepted.demon.unrated?'UNRATED':'Rated')+' créé et record accepté.':'Record accepté sur un niveau existant.');render();return;
 }
 if(['badgeCategory','badgeCreate','badgeGrant','badgeDelete','badgeCategoryDelete'].includes(type)){
   if(LIVE)throw Error('Badges réels indisponibles avant migration Supabase sécurisée.');
   if(state.demoRole==='nlw_editor')throw Error('Les badges requièrent un modérateur général.');
   if(type==='badgeCategory') BADGES.addCategory(state.data,f.name);
   if(type==='badgeCreate') BADGES.create(state.data,f);
   if(type==='badgeGrant') BADGES.grant(state.data,f.player_key,f.badge_id,f.obtained_at);
   if(type==='badgeDelete') BADGES.deleteBadge(state.data,f.badge_id);
   if(type==='badgeCategoryDelete') BADGES.deleteCategory(state.data,f.category_id);
   saveDemo();toast('Badge enregistré en démonstration.');render();return;
 }
 if(!state.staff)throw Error('Compte modérateur requis.');
 if(!LIVE&&state.demoRole==='nlw_editor'&&type!=='demon')throw Error('Le rôle NLW peut seulement ajouter des niveaux hors Top 150.');
 if(LIVE&&['clan','clanMember','safety','nlwStaff'].includes(type))throw Error('Nouvelle fonctionnalité en lecture seule : migration V2 Supabase non appliquée.');
 if(type==='levelStudio'){
  if(!LIVE||!hasFullStaffPowers())throw Error('Supermodérateur requis.');
  const id=Number(f.demon_id),pos=Number(f.position),current=(state.data.demons||[]).find(x=>Number(x.id)===id);
  if(!current)throw Error('Fiche introuvable.');
  if(current.unrated){
    const unratedRank=Number(f.unrated_position);
    if(!Number.isSafeInteger(unratedRank)||unratedRank<1||unratedRank>=99999999)throw Error('Rang UNRATED invalide.');
    const {error}=await db.rpc('dlfr_v79_update_unrated', {p_demon_id:id,p_unrated_rank:unratedRank,p_name:plain(f.name),p_level_id:plain(f.level_id),p_creator:plain(f.creator),p_creator_more:plain(f.creator_more),p_publisher:plain(f.publisher),p_verifier:plain(f.verifier),p_difficulty:plain(f.difficulty),p_requirement:Number(f.requirement),p_completion_mode:plain(f.completion_mode),p_video_url:plain(f.video_url),p_verifier_video_url:plain(f.verifier_video_url),p_thumbnail_url:plain(f.thumbnail_url),p_description:plain(f.description),p_is_public:f.is_public==='on'});
    if(error)throw Error(error.message);
    await refreshLiveData();toast('Fiche UNRATED enregistrée sans toucher à sa position technique.');render();return;
  }
  if(!Number.isSafeInteger(pos)||pos<1||pos>=99999999)throw Error('Position invalide.');
  if(pos!==Number(current.position)&&f.confirm_move!=='on')throw Error('Coche la confirmation pour modifier le classement.');
  const from=Number(current.position);
  const crossing=(from<=150&&pos>150)||(from>150&&from<100000000&&pos<=150);
  if(crossing&&f.confirm_transfer!=='TRANSFERER')throw Error('Pour changer de classement, écris TRANSFERER dans le champ de confirmation.');
  if(f.legacy==='on'&&pos<=150)throw Error('Un niveau Legacy doit avoir une position supérieure à 150.');
  if(f.legacy==='on'&&!current.legacy&&pos<suggestedLegacyPosition(current.id))throw Error('Place le niveau Legacy après les niveaux NLW publiés, à partir de la position '+suggestedLegacyPosition(current.id)+'.');
  if(crossing&&(f.is_public!=='on'))throw Error('Le niveau doit rester public pour changer de classement.');
  if(from>150&&pos<=150){
    if(current.is_public!==true||from>=100000000||f.legacy==='on')throw Error('Pour entrer dans le Top 150, le niveau doit être public, Rated et non Legacy.');
  }
  if(from<=150&&pos>150&&current.is_public!==true)throw Error('Impossible de transférer un niveau masqué.');
  const {error}=await db.rpc('dlfr_update_demon_full',{
    p_demon_id:id,p_name:plain(f.name),p_position:pos,p_level_id:plain(f.level_id),
    p_creator:plain(f.creator),p_creator_more:plain(f.creator_more),p_publisher:plain(f.publisher),p_verifier:plain(f.verifier),
    p_difficulty:plain(f.difficulty),p_requirement:Number(f.requirement),p_completion_mode:plain(f.completion_mode),
    p_video_url:plain(f.video_url),p_verifier_video_url:plain(f.verifier_video_url),p_thumbnail_url:plain(f.thumbnail_url),
    p_description:plain(f.description),p_is_public:f.is_public==='on',p_legacy:f.legacy==='on',p_legacy_since:f.legacy_since||null
  });
  if(error)throw Error(error.message);
  await refreshLiveData();toast('Fiche enregistrée et classement synchronisé.');render();return;
 }
 if(type==='levelCredits'){
  if(!LIVE||!hasFullStaffPowers())throw Error('Supermodérateur requis.');
  const id=Number(f.demon_id);
  if(!Number.isSafeInteger(id)||id<=0)throw Error('Niveau invalide.');
  const recover=submitter?.value==='recover';
  if(!recover && (!plain(f.publisher)||plain(f.publisher).length>200||plain(f.creator).length>200))throw Error('Publié par obligatoire (200 caractères maximum).');
  const response=recover
   ?await db.rpc('dlfr_restore_legacy_credits',{p_demon_id:id})
   :await db.rpc('dlfr_update_level_credits',{p_demon_id:id,p_creator:plain(f.creator)||null,p_publisher:plain(f.publisher)});
  if(response.error)throw Error(response.error.message);
  await refreshLiveData();toast(recover?'Crédits récupérés depuis la sauvegarde.':'Crédits du niveau enregistrés.');render();return;
 }
 if(type==='historicNlwPublish'){
  if(!LIVE||!hasFullStaffPowers())throw Error('Supermodérateur requis.');
  if(plain(f.confirmation)!=='PUBLIER NLW')throw Error('Saisis exactement PUBLIER NLW pour confirmer.');
  const legacyId=Number(f.legacy_id),position=Number(f.position);
  if(!Number.isSafeInteger(legacyId)||legacyId<=0||!Number.isSafeInteger(position)||position<151||position>=99999999)throw Error('Identifiant historique ou rang NLW invalide.');
  const {error}=await db.rpc('dlfr_publish_historic_nlw',{p_legacy_id:legacyId,p_position:position});
  if(error)throw Error(error.message);
  await refreshLiveData();toast('Niveau NLW publié. Les records déjà associés sont maintenant pris en compte.');render();return;
 }
 if(type==='demon'){
  const pos=+f.position;if(!LIVE&&state.demoRole==='nlw_editor'&&pos<=150)throw Error('Un modérateur NLW ne peut gérer que les positions 151 et au-delà.');
  if(LIVE){
    if(!Number.isSafeInteger(pos)||pos<1||pos>=99999999)throw Error('Position invalide.');
    if(f.legacy==='on'&&(pos<=150||f.unrated==='on'))throw Error('Un niveau Legacy doit être Rated et placé après le Top 150.');
    if(f.legacy==='on'&&pos<suggestedLegacyPosition())throw Error('Place le niveau Legacy après la NLW, à partir de la position '+suggestedLegacyPosition()+'.');
    const {error}=await db.rpc('dlfr_manual_publish_level_v3',{
      p_publisher_player_key:null,
      p_verifier_player_key:f.verifier_player_key||null,
      p_new_publisher_name:null,
      p_new_verifier_name:plain(f.new_verifier_name)||null,
      p_name:plain(f.name),p_gd_level_id:plain(f.level_id)||null,p_position:pos,
      p_publisher:plain(f.publisher),p_creator:plain(f.creator)||null,
      p_verifier:plain(f.verifier)||null,p_unrated:f.unrated==='on',
      p_requirement:+f.requirement||100,
      p_existing_demon_id:f.existing_demon_id?Number(f.existing_demon_id):null,
      p_verifier_video_url:plain(f.verifier_video_url)||null,
      p_thumbnail_url:plain(f.thumbnail_url)||null,
      p_completion_mode:plain(f.completion_mode)||null,
      p_legacy:f.legacy==='on',p_legacy_since:f.legacy_since||null
    });
    if(error)throw Error(error.message);
  }else{
  if(state.data.demons.some(d=>+d.position===pos&&!d.unrated))throw Error('Un niveau occupe déjà cette position.');
  await save('demons',{position:f.unrated?100000000+pos:pos,name:plain(f.name),level_id:plain(f.level_id)||null,publisher:plain(f.publisher),verifier:plain(f.verifier),creator:plain(f.creator),requirement:+f.requirement,legacy:!!f.legacy,legacy_since:f.legacy_since||null,unrated:!!f.unrated,unrated_position:f.unrated?pos:null,difficulty:'Extreme Demon'});
  }
 }else if(type==='news'){
  let image_url=plain(f.image_url);
  const old=state.data.news_items.find(x=>String(x.id)===String(f.news_id));
  if(old&&!image_url)image_url=old.image_url||'';
  const file=form.querySelector('[name="image_file"]')?.files?.[0];
  if(file)image_url=await uploadNewsImage(file);
  if(image_url&&!imageLink(image_url))throw Error('URL d’image invalide. Utilise un lien http(s).');
  if(f.video_url&&!http(f.video_url))throw Error('URL de vidéo invalide.');
  const item={headline:plain(f.headline),body:plain(f.body),player_name:plain(f.player_name)||null,image_url:image_url||null,video_url:plain(f.video_url)||null,is_published:f.is_published==='on',category:getNewsCategory({category:f.category}),is_pinned:f.is_pinned==='on'};
  if(old){item.id=old.id;await save('news_items',item,{upsert:true,on:['id']});}
  else await save('news_items',item);
  state.editingNews=null;
 }
 else if(type==='frAchievement'){if(LIVE){await save('fr_achievements',{title:plain(f.title),player_key:f.player_key,level_name:plain(f.level_name),run_text:plain(f.run_text),description:plain(f.description),video_url:http(f.video_url)||null});}else{const rows=state.data.fr_achievements;rows.push({id:Math.max(0,...rows.map(x=>x.id))+1,...f,created_at:new Date().toISOString()});saveDemo();auditV2('CREATE','Achievement FR : '+f.title);}}
 else if(type==='clan'){const rows=state.data.clans;if(rows.some(c=>key(c.tag)===key(f.tag)))throw Error('Ce tag de clan existe déjà.');rows.push({id:Math.max(0,...rows.map(x=>x.id))+1,...f});saveDemo();auditV2('CREATE','Clan : '+f.name);}
 else if(type==='clanMember'){state.data.clan_members=state.data.clan_members.filter(x=>x.player_key!==f.player_key);state.data.clan_members.push({player_key:f.player_key,clan_id:+f.clan_id,role:f.role});saveDemo();auditV2('MEMBER',f.player_key);}
 else if(type==='nlwStaff'){if(!state.data.nlw_staff.some(x=>x.player_key===f.player_key))state.data.nlw_staff.push({player_key:f.player_key,role:'nlw_editor'});saveDemo();auditV2('NLW_STAFF',f.player_key);}
 else if(type==='safety'){const pp=state.data.player_profiles.find(x=>x.player_key===f.player_key);if(f.action==='remove_banner'){if(pp)pp.banner_url='';}else if(f.action==='temp_ban'){const player=state.data.players.find(x=>x.player_key===f.player_key);if(player)player.demo_suspended_until=new Date(Date.now()+Math.max(1,+f.days)*86400000).toISOString();}else if(f.action==='unban'){const player=state.data.players.find(x=>x.player_key===f.player_key);if(player)player.demo_suspended_until=null;}const entry={player_key:f.player_key,action:f.action,reason:f.reason,until:f.action==='temp_ban'?new Date(Date.now()+Math.max(1,+f.days)*86400000).toISOString():null};state.data.player_sanctions.push(entry);saveDemo();auditV2('SANCTION',f.player_key+' : '+f.action);}
 else if(type==='title')await save('profile_titles',{label:f.label,description:f.description||null,color:f.color,is_active:true});
 else if(type==='award')await save('player_profile_titles',{player_key:f.player_key,title_id:+f.title_id},{upsert:true,on:['player_key','title_id']});
 else if(type==='profile'){
  const player=state.data.players.find(x=>x.player_key===f.player_key);
  if(!player)throw Error('Joueur inconnu.');
  const country=GEO.validCountries.has(f.country_code)?f.country_code:'';
  const region=country==='FR'&&GEO.regionInfo(f.region_code)?f.region_code:null;
  // Ne jamais modifier silencieusement un pays/drapeau par une simple variable client.
  // En démo : navigateur uniquement. En production : seul un modérateur connecté peut écrire via RLS.
  if(LIVE&&region&&!C.enableRegionProfiles)throw Error('Le choix de région n’est pas disponible actuellement.');
  const profile={player_key:f.player_key,bio:f.bio,banner_url:f.banner_url,avatar_url:f.avatar_url,join_year:f.join_year?+f.join_year:null,favorite_level:f.favorite_level,current_goal:f.current_goal,youtube_url:f.youtube_url,twitch_url:f.twitch_url,social_url:f.social_url,highlight_1:f.highlight_1,highlight_2:f.highlight_2,highlight_3:f.highlight_3};
  if(!LIVE||C.enableRegionProfiles)profile.region_code=region;
  await save('player_profiles',profile,{upsert:true,on:['player_key']});
  if(LIVE){const {error}=await db.from('players').update({country_code:country||null}).eq('player_key',f.player_key);if(error)throw Error('Pays : '+error.message);}
  player.country_code=country||null;
  saveDemo();
 }
 else if(type==='hall')await save('hall_of_fame',{player_key:f.player_key,headline:f.headline,description:f.description,award_year:f.award_year?+f.award_year:null,category:f.category,source_url:f.source_url||null,is_published:true});
 else if(type==='visibility'){
  const p=state.data.players.find(x=>x.player_key===f.player_key);if(!p)throw Error('Ce joueur n’est pas un compte importé. Ajoute son profil à la table players pour modifier sa visibilité.');
  // UPDATE ciblé uniquement, pour ne jamais écraser les stats importées du joueur.
  const {error}=await db.from('players').update({hidden_from_stats:f.hidden_from_stats==='true'}).eq('player_key',p.player_key);
  if(error)throw Error(error.message);
 }
 if(LIVE){
  const changedTables={news:['news_items'],frAchievement:['fr_achievements'],title:['profile_titles'],award:['player_profile_titles'],profile:['player_profiles','players'],hall:['hall_of_fame'],visibility:['players']}[type];
  if(changedTables){
   await Promise.all(changedTables.map(async name=>{state.data[name]=await readAll(name);}));
   resetRenderCalculations();
   if(PERF_DEBUG)console.info('[DLFR perf] Actualisation ciblée après',type,changedTables);
  }else await refreshLiveData();
 }
 toast('Modification enregistrée !');render();
 }catch(err){toast('Erreur : '+err.message);}finally{state.busy=false;if(submit)submit.disabled=false;}
}
function fillNewsEditor(id){const n=state.data.news_items.find(x=>String(x.id)===String(id));const form=document.querySelector('[data-form="news"]');if(!n||!form)return;
 for(const k of ['news_id','headline','body','player_name','image_url','video_url'])if(form.elements[k])form.elements[k].value=k==='news_id'?n.id:(n[k]||'');
 if(form.elements.category)form.elements.category.value=getNewsCategory(n);
 if(form.elements.is_pinned)form.elements.is_pinned.checked=!!n.is_pinned;
 if(form.elements.is_published)form.elements.is_published.checked=!!n.is_published;
 state.editingNews=n.id;updateNewsPreview(form);form.scrollIntoView({behavior:'smooth',block:'start'});
}
function syncRegionEditor(){const form=document.querySelector('[data-form="profile"]');if(!form)return;
 const country=form.elements.country_code.value;
 const group=$('profileEditorRegionField');
 if(group)group.hidden=country!=='FR';
 if(country!=='FR')form.elements.region_code.value='';
 const cp=$('profileCountryPreview'),rp=$('profileRegionPreview');
 if(cp)cp.innerHTML=GEO.countryImage(country);
 if(rp)rp.innerHTML=country==='FR'?GEO.regionImage(form.elements.region_code.value):'';
}
function fillProfileEditor(){const form=document.querySelector('[data-form="profile"]');if(!form)return;
 const id=form.elements.player_key.value;
 const p=state.data.player_profiles.find(x=>x.player_key===id)||{};
 const player=state.data.players.find(x=>x.player_key===id)||{};
 for(const k of ['bio','avatar_url','banner_url','join_year','favorite_level','current_goal','youtube_url','twitch_url','social_url','highlight_1','highlight_2','highlight_3'])if(form.elements[k])form.elements[k].value=p[k]??'';
 form.elements.country_code.value=player.country_code||'';
 form.elements.region_code.value=player.country_code==='FR'?(p.region_code||''):'';
 syncRegionEditor();
}
function updateNewsPreview(form){if(!form)return;const holder=$('newsDraftPreview');if(!holder)return;
 const headline=plain(form.elements.headline.value)||'Titre de l’actualité';const body=plain(form.elements.body.value)||'Le contenu apparaîtra ici…';const media=plain(form.elements.image_url.value);
 holder.innerHTML=`<div class="news-meta"><span class="news-category">${esc(form.elements.category?.value||'Annonce')}</span>${form.elements.is_pinned?.checked?'<span class="news-pin">★ À la une</span>':''}</div><h4>${esc(headline)}</h4><p class="news-body">${esc(body.slice(0,350))}</p>${media&&imageLink(media)?`<img class="news-preview-img" src="${esc(imageLink(media))}" alt="Aperçu">`:''}`;
}
// Import JSON de démonstration désactivé.
// V96 — le thème Halloween est un cosmétique du compte, et non une permission
// dépendante de l'affichage de la boutique. On vérifie les droits serveur à
// chaque changement de session puis on garde la préférence locale.
let v82HalloweenOwned=false;
let v96ThemeSessionId=undefined;
let v96ThemeRequest=0;
function v96StoredTheme(){
 // null signifie « aucun choix explicite » : on évite de l'écraser au démarrage.
 try{return localStorage.getItem('demonlist-theme');}catch{return null;}
}
function v96SyncThemeMenu(){
 const sel=$('themeSelect');
 if(!sel)return;
 let opt=sel.querySelector('option[value="halloween"]');
 if(v82HalloweenOwned&&!opt){opt=new Option('Halloween ✦','halloween');sel.add(opt);}
 if(!v82HalloweenOwned&&opt)opt.remove();
 const current=['halloween','autumn','midnight','dark'].find(name=>document.documentElement.classList.contains(name))||'light';
 if(sel.value!==current)sel.value=current;
}
function setTheme(theme,persist=true){
 const valid=['light','dark','midnight','autumn'];
 const t=theme==='halloween'&&v82HalloweenOwned?'halloween':valid.includes(theme)?theme:'light';
 document.documentElement.classList.remove('dark','midnight','autumn','halloween');
 if(t!=='light')document.documentElement.classList.add(t);
 v96SyncThemeMenu();
 if(persist){try{localStorage.setItem('demonlist-theme',t);}catch{}}
}
function v96ApplyHalloweenStatus(status){
 const inventory=new Set([...(status?.inventory||[]),...(status?.test_inventory||[])]);
 v82HalloweenOwned=!!status?.signed_in&&inventory.has('theme_halloween');
 const equipped=v82HalloweenOwned&&status?.equipped?.theme==='theme_halloween';
 const saved=v96StoredTheme();
 // IMPORTANT : lors d'un changement de page, le rafraîchissement de la boutique
 // ne doit PAS remplacer un choix « Halloween » enregistré par « Midnight ».
 // L'équipement côté serveur fournit uniquement le défaut en l'absence de choix.
 const requested=saved||(equipped?'halloween':'light');
 if(requested==='halloween'&&!v82HalloweenOwned){
  setTheme('light'); // le thème n'est plus possédé sur ce compte
 }else{
  setTheme(requested,saved===null);
 }
}
async function v96RefreshHalloweenTheme(){
 const seq=++v96ThemeRequest;
 const uid=state.session?.user?.id||null;
 if(!uid||!db){
  v82HalloweenOwned=false;
  const saved=v96StoredTheme();
  setTheme(saved==='halloween'?'light':(saved||'light'),saved==='halloween');
  return;
 }
 try{
  const {data,error}=await db.rpc('dlfr_rewards_status');
  if(error)throw error;
  if(seq!==v96ThemeRequest||state.session?.user?.id!==uid)return;
  v96ApplyHalloweenStatus(data||{});
 }catch(err){
  // Une erreur réseau ne doit pas retirer un thème déjà vérifié pour
  // la même session. Réessai possible depuis le rafraîchissement de la boutique.
  console.warn('[DLFR Halloween] Impossible de charger le thème :',err);
  v96SyncThemeMenu();
 }
}
function v96EnsureHalloweenTheme(){
 const uid=state.session?.user?.id||null;
 if(uid!==v96ThemeSessionId){
  v96ThemeSessionId=uid;
  v82HalloweenOwned=false;
  // Revalider les droits lors d'un changement de compte, pas à chaque page.
  void v96RefreshHalloweenTheme();
  return;
 }
 // Le rendu de la page peut changer, mais l'option du menu et les classes
 // CSS ne doivent pas disparaître quand on navigue dans le site.
 if(v82HalloweenOwned&&v96StoredTheme()==='halloween'&&
    !document.documentElement.classList.contains('halloween')){
  setTheme('halloween',false);
 }else v96SyncThemeMenu();
}
function refreshUnrated(){document.documentElement.classList.toggle('unrated-mode',state.unrated);const button=$('unratedToggle');button.textContent=state.unrated?'◈ UNRATED ON':'◈ UNRATED OFF';button.setAttribute('aria-pressed',String(state.unrated));}
function bootEvents(){
 setupDiscordServerLink();
 // Un seul menu déroulant ouvert ; Echap ferme le menu et rend le focus au bouton.
 document.addEventListener('click',ev=>{
   const current=ev.target.closest('.nav-menu');
   document.querySelectorAll('.nav-menu[open]').forEach(menu=>{if(menu!==current)menu.open=false;});
 });
 document.addEventListener('error',ev=>{
  const img=ev.target;
  if(!img?.matches?.('.dlfr23-artwork'))return;
  const fallback=img.dataset.dlfr23Fallback||'';
  if(fallback&&img.src!==fallback){img.src=fallback;return;}
  img.hidden=true;
  if(img.classList.contains('dlfr23-media-thumb')){
   const alt=document.createElement('div');alt.className='dlfr23-media-placeholder';
   alt.textContent=img.alt||'Miniature indisponible';img.parentNode?.insertBefore(alt,img);
  }
 },true);
 document.addEventListener('keydown',ev=>{
   if(ev.target?.id==='levelStudioSearch'){
     if(ev.key==='Escape'){levelStudioChoices('',false);return;}
     if(ev.key==='ArrowDown'){ev.preventDefault();levelStudioChoices(ev.target.value);document.querySelector('[data-studio-pick]')?.focus();return;}
     if(ev.key==='Enter'){const first=document.querySelector('#levelStudioChoices:not([hidden]) [data-studio-pick]');if(first){ev.preventDefault();chooseLevelStudio(first.dataset.studioPick);}return;}
   }
   if(ev.target?.matches?.('[data-studio-pick]')&&ev.key==='Escape'){
     levelStudioChoices('',false);document.getElementById('levelStudioSearch')?.focus();return;
   }
   const regionKey=ev.target?.closest?.('[data-region-code][role=button]');
   if(regionKey&&(ev.key==='Enter'||ev.key===' ')){ev.preventDefault();const reg=GEO.regionInfo(regionKey.dataset.regionCode);if(reg){state.selectedRegion=reg.code;render();}return;}
   if(ev.key!=='Escape')return;
   const current=document.querySelector('.nav-menu[open]');
   if(current){closeNavMenus();current.querySelector('summary')?.focus();}
 });
 document.addEventListener('click',ev=>{
   if(!ownerPreviewActive()||new URLSearchParams(location.search).get('page')!=='admin')return;
   const button=ev.target.closest('button');
   if(!button)return;
   if(button.matches('[data-owner-preview-role],[data-admin-tab],[data-level-group],[data-identity-tab]'))return;
   ev.preventDefault();ev.stopImmediatePropagation();toast('Aperçu en lecture seule.');
 },true);
 document.addEventListener('click',async(ev)=>{
  const testBtn=ev.target.closest('[data-v86-test]');
  if(testBtn){if(state.staffRole!=='owner'||ownerPreviewActive())return;testBtn.disabled=true;try{const {error}=await db.rpc('dlfr_owner_test_item',{p_item_key:testBtn.dataset.v86Test,p_enable:testBtn.dataset.v86Enable==='true'});if(error)throw error;toast(testBtn.dataset.v86Enable==='true'?'Essai activé : ouvre la boutique pour équiper l’objet.':'Accès de test retiré.');await v86AdminLoad();await v81RewardsRender();await v81ProfileRewards();}catch(e){toast('Erreur : '+e.message);testBtn.disabled=false;}return;}
  const delWeek=ev.target.closest('[data-v86-delete]');
  if(delWeek){if(state.staffRole!=='owner'||ownerPreviewActive())return;if(!confirm('Retirer le défi du '+delWeek.dataset.v86Delete+' ?'))return;delWeek.disabled=true;try{const {error}=await db.rpc('dlfr_owner_weekly_delete',{p_week:delWeek.dataset.v86Delete});if(error)throw error;toast('Semaine retirée');await v86AdminLoad();}catch(e){toast('Erreur : '+e.message);delWeek.disabled=false;}return;}
  const weeklyClaimButton=ev.target.closest('[data-v80-claim]');
  if(weeklyClaimButton){
   weeklyClaimButton.disabled=true;
   try{const {error}=await db.rpc('dlfr_weekly_claim');if(error)throw error;toast('Récompense hebdomadaire récupérée !');await v80WeeklyRender();}
   catch(err){toast('Impossible de récupérer les pièces : '+err.message);weeklyClaimButton.disabled=false;}
   return;
  }
  const buy=ev.target.closest('[data-v81-buy]');
  if(buy){buy.disabled=true;try{const {error}=await db.rpc('dlfr_reward_buy',{p_item_key:buy.dataset.v81Buy});if(error)throw error;toast('Objet ajouté à ta collection !');await v81RewardsRender();}catch(err){toast('Achat impossible : '+err.message);buy.disabled=false;}return;}
  const equip=ev.target.closest('[data-v81-equip]');
  if(equip){equip.disabled=true;try{const item=equip.textContent.includes('Équipé')?'':equip.dataset.v81Equip;const category=equip.dataset.v81Category;const {error}=await db.rpc('dlfr_reward_equip',{p_item_key:item,p_category:category});if(error)throw error;toast('Vitrine mise à jour !');V90_FX.t=0;if(category==='theme'){if(item==='theme_halloween'){v82HalloweenOwned=true;setTheme('halloween');}else if(v96StoredTheme()==='halloween')setTheme('light');}await v81RewardsRender();}catch(err){toast('Équipement impossible : '+err.message);equip.disabled=false;}return;}
  const reaction=ev.target.closest('[data-v79-react]');
  if(reaction){
   if(!state.session){toast('Connecte-toi pour réagir.');return;}
   if(!state.data?.dlfr_reactions){toast('Réactions indisponibles : applique la migration SQL V79.');return;}
   const target=reaction.dataset.v79React,emoji=reaction.dataset.v79Emoji;
   if(!/^(news:[0-9]+|completion:[0-9]+|badge:[a-z0-9_-]+:[a-z0-9_-]+)$/.test(target)||!V79_REACTIONS.includes(emoji))return;
   try{
    reaction.disabled=true;
    const current=(state.data.dlfr_reactions||[]).find(r=>r.target_key===target&&r.emoji===emoji&&r.auth_user_id===state.session.user.id);
    const query=db.from('dlfr_reactions');
    const {error}=current?await query.delete().eq('target_key',target).eq('emoji',emoji).eq('auth_user_id',state.session.user.id):await query.insert({target_key:target,emoji,auth_user_id:state.session.user.id});
    if(error)throw error;
    state.data.dlfr_reactions=await readAll('dlfr_reactions');render();
   }catch(error){toast('Réaction non enregistrée : '+error.message);reaction.disabled=false;}
   return;
  }
  const pick=ev.target.closest('[data-studio-pick]');
  if(pick){ev.preventDefault();chooseLevelStudio(pick.dataset.studioPick);return;}
  if(!ev.target.closest('#levelStudioSearch,#levelStudioChoices'))levelStudioChoices('',false);
  const a=ev.target.closest('a[data-nav]');if(a){ev.preventDefault();const link=new URL(a.href);history.pushState({},'',link.search);state.keyword='';render();window.scrollTo(0,0);return;}
 const claim=ev.target.closest('[data-claim-pack]');if(claim){try{claim.disabled=true;await claimPack(claim.dataset.claimPack);}catch(e){toast('Level Pack : '+e.message);claim.disabled=false;}return;}
 const cinemaPlay=ev.target.closest('[data-dlfr23-play]');
 if(cinemaPlay){
  const holder=document.getElementById('dlfr23Player');
  const embed=window.DLFR_LEVEL_CINEMA.embedHtml(cinemaPlay.dataset.dlfr23Play,esc);
  if(holder&&embed){holder.innerHTML=embed;holder.classList.add('dlfr23-is-playing');}
  return;
 }
 const follow=ev.target.closest('[data-community-follow]');
 if(follow){
   const target=follow.dataset.communityFollow;
   if(!state.session||!state.ownKey){go('my-profile');toast('Connecte et associe ton compte DLFR pour suivre un joueur.');return;}
   if(target===state.ownKey||!state.communityReady)return;
   try{
     follow.disabled=true;
     const existing=COMMUNITY.followers(state.data,target).some(x=>x.follower_key===state.ownKey);
     const query=db.from('dlfr_profile_follows');
     const {error}=existing?await query.delete().eq('follower_key',state.ownKey).eq('followed_key',target):await query.insert({follower_key:state.ownKey,followed_key:target});
     if(error)throw Error(error.message);
     state.data.dlfr_profile_follows=await readAll('dlfr_profile_follows');
     const panel=$('profileContent');if(panel)panel.innerHTML=statProfile(getPlayer(state.selectedPlayer));
     toast(existing?'Abonnement retiré.':'Joueur suivi !');
   }catch(error){toast('Abonnement : '+error.message);follow.disabled=false;}
   return;
 }
 const selectRegion=ev.target.closest('[data-region-code]');if(selectRegion){const reg=GEO.regionInfo(selectRegion.dataset.regionCode);if(reg){state.selectedRegion=reg.code;render();}return;}
 const list=ev.target.closest('[data-list]');if(list){go('list',{tab:list.dataset.list});return;}
 const route=ev.target.closest('[data-route]');if(route){go(route.dataset.route);return;}
 const teamRefresh=ev.target.closest('[data-refresh-team]');
 if(teamRefresh){if(state.staffRole==='owner'&&!ownerPreviewActive()){await loadStaffCandidates();render();}return;}
 const previewChoice=ev.target.closest('[data-stats-preview]');if(previewChoice){chooseStatsPreview(previewChoice.dataset.statsPreview);return;}
 const st=ev.target.closest('[data-stats-tab]');if(st){state.statsTab=st.dataset.statsTab;state.keyword='';render();return;}
 const pt=ev.target.closest('[data-profile-tab]');if(pt){state.profileTab=pt.dataset.profileTab;const ownPreview=pt.closest('#selfProfilePublicPreview');if(ownPreview){const actor=LIVE?state.ownKey:state.demoActor;ownPreview.innerHTML=statProfile(getPlayer(actor));}else{const chosen=getPlayer(state.selectedPlayer);if($('profileContent'))$('profileContent').innerHTML=statProfile(chosen);}/* V95 : un changement d'onglet remplace la carte du profil, donc recharger les effets. */v81ProfileRewards().catch(err=>console.warn('[DLFR] Effets de profil',err));return;}
 const at=ev.target.closest('[data-activity-tab]');if(at){state.activityTab=at.dataset.activityTab==='all'?'all':'following';render();return;}
 const nf=ev.target.closest('[data-news-filter]');if(nf){state.newsFilter=nf.dataset.newsFilter;render();return;}
 const myFilter=ev.target.closest('[data-my-submission-filter]');if(myFilter){state.mySubmissionFilter=myFilter.dataset.mySubmissionFilter;render();return;}
 const thumb=ev.target.closest('[data-studio-thumbnail]');if(thumb){const form=thumb.closest('form');const v=studioYoutubeThumbnail(form.elements.video_url.value)||studioYoutubeThumbnail(form.elements.verifier_video_url.value);if(v){form.elements.thumbnail_url.value=v;updateStudioPreview(form);}else toast('Ajoute d’abord une vidéo YouTube valide.');return;}
 const claimButton=ev.target.closest('[data-review-claim]');
 const manageButton=ev.target.closest('[data-review-manage]');
 const refreshButton=ev.target.closest('[data-review-refresh]');
 if(claimButton||manageButton||refreshButton){
   if(ownerPreviewActive()){toast('Aperçu en lecture seule.');return;}
   if(!state.staff||state.busy)return;
   state.busy=true;
   const button=claimButton||manageButton||refreshButton;
   button.disabled=true;
   try{
     if(claimButton){
       const id=claimButton.dataset.reviewClaim;
       const {data,error}=await db.rpc('dlfr_claim_review',{p_submission_id:id==='random'?null:Number(id)});
       if(error)throw Error(error.message);
       toast(data?.already_claimed?'Tu as déjà une soumission en cours.':'Soumission réservée pour 20 minutes.');
     }else if(manageButton){
       const action=manageButton.dataset.reviewManage;
       if(!['release','renew'].includes(action))throw Error('Action inconnue.');
       const {error}=await db.rpc('dlfr_manage_review_claim',{p_submission_id:Number(manageButton.dataset.reviewId),p_action:action});
       if(error)throw Error(error.message);
       toast(action==='release'?'Soumission libérée.':'Réservation prolongée de 20 minutes.');
     }
     const {data,error}=await db.rpc('dlfr_review_queue_status');
     if(error)throw Error(error.message);
     state.scopedQueue=data||[];state.scopedQueueError='';
     if(state.adminTab==='requests'&&state.data.level_submissions?.length)state.data.level_submissions=await readAll('level_submissions');
     render();
   }catch(error){toast('File de modération : '+error.message);button.disabled=false;}
   finally{state.busy=false;}
   return;
 }
 const roleChoice=ev.target.closest('[data-owner-preview-role]');
 if(roleChoice){
   if(state.staffRole!=='owner')return;
   const role=roleChoice.dataset.ownerPreviewRole;
   if(!['owner','nlw','moderator','supermoderator'].includes(role))return;
   state.ownerPreview=role;
   state.ownerPreviewQueue=[];state.ownerPreviewError='';
   if(['nlw','moderator'].includes(role)){
     try{const {data,error}=await db.rpc('dlfr_review_queue_status');if(error)throw error;state.ownerPreviewQueue=data||[];}
     catch(error){state.ownerPreviewError=error.message||String(error);}
   }
   state.adminTab='overview';render();return;
 }
 // Le data-level-group existe aussi sur les cartes de contenu : ne réagir qu'aux boutons de navigation.
 const levelGroupButton=ev.target.closest('.level-tools-tabs button[data-level-group]');if(levelGroupButton){activeLevelPanel=levelGroupButton.dataset.levelGroup;render();return;}
 const it=ev.target.closest('[data-identity-tab]');if(it){document.querySelectorAll('[data-identity-section]').forEach(e=>e.hidden=e.dataset.identitySection!==it.dataset.identityTab);return;}
 const loadV=ev.target.closest('[data-load-verifiers]');if(loadV){try{loadV.disabled=true;const {data,error}=await db.rpc('dlfr_unlinked_verifiers');if(error)throw Error(error.message);const names=Array.isArray(data)?data:[];window.__dlfrVerifierUnlinked=names;const sel=document.querySelector('[data-form="linkVerifier"] [name="verifier_name"]');if(sel){sel.innerHTML='<option value="">Sélectionner…</option>'+names.map((n,i)=>'<option value="'+i+'">'+esc(n.verifier_name)+' ('+n.count+' niveaux)</option>').join('');}const prev=document.getElementById('verifierLinkPreview');if(prev)prev.textContent=names.length+' crédits non liés. Sélectionne une entrée pour voir les niveaux.';}catch(e){toast(e.message||String(e));}finally{loadV.disabled=false;}return;}
 const refreshMerges=ev.target.closest('[data-refresh-merges]');if(refreshMerges){
  if(!LIVE||!hasFullStaffPowers()||ownerPreviewActive())return;
  refreshMerges.disabled=true;
  try{
   const {data,error}=await db.rpc('dlfr_player_merge_request_list');
   if(error)throw Error(error.message);
   state.mergeRequests=Array.isArray(data)?data:[];
   state.mergeRequestsError='';
   render();toast('Demandes de fusion actualisées.');
  }catch(error){state.mergeRequestsError='Impossible de charger les demandes : '+(error.message||String(error));console.warn('[DLFR] Actualisation fusions :',error);render();toast(state.mergeRequestsError);}
  return;
 }
 const modPeriod=ev.target.closest('[data-mod-leaderboard-period]');
 if(modPeriod){
  const days=Number(modPeriod.dataset.modLeaderboardPeriod);
  if(![0,7,30].includes(days))return;
  if(days!==state.modLeaderboardPeriod){state.modLeaderboardPeriod=days;void loadModeratorLeaderboard();render();}
  return;
 }
 const modRefresh=ev.target.closest('[data-mod-leaderboard-refresh]');
 if(modRefresh){void loadModeratorLeaderboard();render();return;}
 const ad=ev.target.closest('[data-admin-tab]');if(ad){
  state.adminTab=ad.dataset.adminTab;render();
  // V69 : recharger la file de fusion quand on ouvre les demandes, sans
  // rafraichir les 20+ autres tables de la Demonlist.
  if(state.adminTab==='requests'&&LIVE&&hasFullStaffPowers()&&!ownerPreviewActive()){
   try{
    const {data,error}=await db.rpc('dlfr_player_merge_request_list');
    if(error)throw Error(error.message);
    state.mergeRequests=Array.isArray(data)?data:[];
    state.mergeRequestsError='';
   }catch(error){state.mergeRequestsError='Erreur de chargement des demandes : '+(error.message||String(error));console.warn('[DLFR] Demandes :',error);}
   render();
  }
  if(state.adminTab==='team'&&state.staffRole==='owner'&&!ownerPreviewActive()){await loadStaffCandidates();render();}
  return;
 }
 const ed=ev.target.closest('[data-edit-news]');if(ed){if(!state.staff)return;state.adminTab='news';go('admin');fillNewsEditor(ed.dataset.editNews);return;}
 const tn=ev.target.closest('[data-toggle-news]');if(tn){if(!state.staff)return;const item=state.data.news_items.find(x=>String(x.id)===tn.dataset.toggleNews);if(item){try{await save('news_items',{...item,is_published:!item.is_published},{upsert:true,on:['id']});if(LIVE)state.data.news_items=await readAll('news_items');toast('Statut actualisé');render();}catch(e){toast('Erreur : '+e.message);}}return;}
 const clanSort=ev.target.closest('[data-clan-sort]');if(clanSort){state.clanSort=clanSort.dataset.clanSort;render();return;}
 const clanTab=ev.target.closest('[data-clan-tab]');if(clanTab){state.clanDetailTab=clanTab.dataset.clanTab;render();return;}
 const clanRefresh=ev.target.closest('[data-clan-refresh]');if(clanRefresh){clanRefresh.disabled=true;try{await refreshClanTools();render();toast('Invitations actualisées.');}catch(error){console.error('[DLFR clans]',error);toast('Impossible de rafraîchir les invitations.');clanRefresh.disabled=false;}return;}
 const clanAction=ev.target.closest('[data-clan-action]');if(clanAction){handleClanAction(clanAction);return;}
 const rej=ev.target.closest('[data-review-reject]');if(rej){if(LIVE||!state.staff)return;try{state.data=SUBMISSIONS.reject(state.data,rej.dataset.reviewReject);auditV2('REJECT','Soumission #'+rej.dataset.reviewReject);saveDemo();toast('Soumission refusée.');render();}catch(e){toast('Erreur : '+e.message);}return;}
 const act=ev.target.closest('[data-action]');if(!act)return;
 if(act.dataset.action==='refreshMySubmissions'&&LIVE){
   if(!state.session){toast('Connecte-toi pour voir tes soumissions.');return;}
   act.disabled=true;
   try{
     // RLS serveur + filtre identité Auth explicite : jamais par pseudo affiché.
     const {data,error}=await db.from('level_submissions').select('*').eq('auth_user_id',state.session.user.id).order('created_at',{ascending:false}).limit(2000);
     if(error)throw Error(error.message);
     const mine=(data||[]);
     const others=(state.data.level_submissions||[]).filter(r=>r.auth_user_id!==state.session.user.id);
     state.data.level_submissions=[...others,...mine];await refreshMySubmissionReviewAuthors();render();toast('Soumissions actualisées.');
   }catch(error){toast('Impossible d’actualiser : '+error.message);act.disabled=false;}
   return;
 }
 if(act.dataset.action==='refreshStaffAccess'&&LIVE){
   try{
     const {data,error}=await db.auth.getSession();if(error)throw error;
     state.session=data.session;
     await checkStaff();
     if(state.staff){await refreshLiveData();await checkSelfOwner();toast('Permissions de modération reconnues.');}
     else toast('Aucun rôle de modération générale pour ce compte Discord.');
     render();
   }catch(e){toast('Vérification des droits : '+e.message);}
   return;
  }
  if(act.dataset.action==='discordOAuthLogin'&&LIVE){if(!C.enableDiscordOAuth){toast('Discord n’est pas configuré.');return;}try{await DISCORD.signIn(db,new URL('?page=my-profile',location.href).href);}catch(e){toast('Connexion Discord : '+e.message);}return;}
 if(act.dataset.action==='discordIdentityLink'&&LIVE){if(!state.session||!C.enableDiscordOAuth)return;try{await DISCORD.linkIdentity(db,new URL('?page=my-profile',location.href).href);}catch(e){toast('Association impossible : '+e.message+' Si Discord appartient déjà à un autre compte, contacte la modération.');}return;}
 if(act.dataset.action==='discordRefreshAvatar'&&LIVE){
   if(!state.session||!state.ownKey||!discordIdentity()){
    toast('Associe d’abord Discord à ton compte et à une fiche joueur.');return;
   }
   if(!confirm('Remplacer ta photo de profil actuelle par celle de Discord ?'))return;
   if(!C.enableDiscordOAuth){toast('Discord OAuth est désactivé.');return;}
   try{
    sessionStorage.setItem('dlfr_avatar_refresh_uid',state.session.user.id);
    const redirect=new URL(location.pathname,location.origin);
    redirect.searchParams.set('page','my-profile');redirect.searchParams.set('dlfr_discord_avatar_refresh','1');
    await DISCORD.signIn(db,redirect.href);
   }catch(e){sessionStorage.removeItem('dlfr_avatar_refresh_uid');toast('Actualisation Discord : '+e.message);}
   return;
  }
 if(act.dataset.action==='discordUseAvatar'&&LIVE){const picture=DISCORD.sessionDiscordIdentity(state.session)?.avatar_url;const field=document.querySelector('[data-form="selfProfile"] input[name="avatar_url"]');if(picture&&field){field.value=picture;field.focus();toast('Avatar Discord copié dans le champ. Enregistre le profil pour confirmer.');}return;}
 if(act.dataset.action==='moreUnbeaten'){state.unbeatLimit+=120;const results=$('unbeatenResults');if(results)results.innerHTML=unbeatenEntriesHTML();return;}
 if(act.dataset.action==='toggleUnratedStats'){state.unrated=!state.unrated;refreshUnrated();render();return;}
 if(act.dataset.action==='selfLogout'&&LIVE){await db.auth.signOut();state.session=null;state.ownKey=null;state.usernameAccount=null;state.staff=false;render();return;}
 if(act.dataset.action==='clearCalc'){state.calcDemons=[];render();return;}
 if(act.dataset.action==='cancelNews'){state.editingNews=null;const form=document.querySelector('[data-form="news"]');if(form){form.reset();form.elements.news_id.value='';updateNewsPreview(form);}return;}
 if(act.dataset.action==='logout'&&LIVE){await db.auth.signOut();state.session=null;state.usernameAccount=null;state.staff=false;render();}
 });
 document.addEventListener('focusin',ev=>{if(ev.target.id==='levelStudioSearch')levelStudioChoices(ev.target.value);});
 document.addEventListener('input',ev=>{
 const clanForm=ev.target.closest('[data-form="clanCreate"],[data-form="clanEdit"]');if(clanForm)syncClanPreview(clanForm);
 if(ev.target.id==='dlfr27PackLevelSearch'){const q=key(ev.target.value);document.querySelectorAll('[data-pack-level-row]').forEach(row=>{row.hidden=!row.dataset.search.includes(q)});return;}
 if(ev.target.id==='hiddenDeleteSearch'){
   const select=document.getElementById('hiddenDeleteSelect'),query=key(ev.target.value);
   if(select)for(const opt of select.options)opt.hidden=!!opt.value&&!key(opt.textContent).includes(query);
   return;
 }
 if(ev.target.id==='modVictorySearch'){const sel=$('modVictoryLevel');if(sel)sel.innerHTML=modVictoryOptions(ev.target.value);return;}
 if(ev.target.id==='scopedLevelSearch'){scopedLevelSearch(ev.target.value);return;}
  if(ev.target.id==='levelStudioSearch'){levelStudioChoices(ev.target.value);return;}
 if(ev.target.closest('[data-form="levelStudio"]')){updateStudioPreview(ev.target.closest('form'));updateStudioMovementPreview(ev.target.closest('form'));}
 if(ev.target.closest('[data-form="levelStudio"]')&&ev.target.name==='legacy'){
    const form=ev.target.closest('form');if(ev.target.checked)suggestLegacyAfterList(form);
    updateStudioMovementPreview(form);
 }
 if(ev.target.closest('[data-form="demon"]')&&['position','legacy','unrated'].includes(ev.target.name)){
   const form=ev.target.closest('form');if(ev.target.name==='legacy'&&ev.target.checked)suggestLegacyAfterList(form);
   updateNewLevelRankPreview(form);
 }
 if(ev.target.id==='clanSearch'){state.clanSearch=ev.target.value;document.querySelectorAll('[data-clan-searchable]').forEach(r=>r.hidden=!r.dataset.clanSearchable.includes(key(state.clanSearch)));}
 if(ev.target.id==='unbeatenSearch'){state.unbeatSearch=ev.target.value;state.unbeatLimit=120;const results=$('unbeatenResults');if(results)results.innerHTML=unbeatenEntriesHTML();}
 if(ev.target.id==='newsSearch'){state.newsSearch=ev.target.value;const items=state.data.news_items.filter(n=>(n.is_published||state.staff)&&(state.newsFilter==='all'||getNewsCategory(n)===state.newsFilter)&&`${key(n.headline)} ${key(n.body)} ${key(n.player_name)}`.includes(key(state.newsSearch)));$('newsItems').innerHTML=newsItemsHTML(items.sort((a,b)=>+(!!b.is_pinned)-+(!!a.is_pinned)||new Date(b.created_at)-new Date(a.created_at)));}
 if(ev.target.closest('[data-form="news"]'))updateNewsPreview(ev.target.closest('form'));
 if(ev.target.id==='calcSearch'){const q=key(ev.target.value);document.querySelectorAll('.v2-check-level').forEach(x=>x.hidden=!key(x.textContent).includes(q));}
 if(ev.target.id==='demonSearch'){state.keyword=ev.target.value;const d=catalog().filter(x=>state.list==='legacy'?x.legacy:state.list==='nlw'?V2.nlwRank(x)>0:(state.unrated||!x.unrated)&&+x.position>0&&+x.position<=150);$('demonItems').innerHTML=state.list==='nlw'?nlwListCards(state.keyword):cardsHTML(d.filter(x=>key(x.name).includes(key(state.keyword))));}
 if(ev.target.id==='dlfr24ProfileSearch'){const value=key(ev.target.value);let visible=0;document.querySelectorAll('[data-profile-search]').forEach(item=>{item.hidden=!item.dataset.profileSearch.includes(value);if(!item.hidden)visible++;});const empty=$('dlfr24NoProfiles');if(empty)empty.hidden=visible!==0;return;}
 if(ev.target.id==='playerSearch'){
  state.keyword=ev.target.value;
  const ppl=ranked().filter(x=>statsPlayerVisible(x)&&(state.statsTab!=='nlw'||x.nlwScore>0)&&(state.country==='MONDE'||x.country_code===state.country)&&(state.country!=='FR'||state.region==='ALL'||regionFor(x)===state.region)&&key(fullName(x)).includes(key(state.keyword)));
  const chosen=ppl.find(x=>x.player_key===state.selectedPlayer)||ppl[0]||null;
  if(chosen)state.selectedPlayer=chosen.player_key;
  if(state.statsTab==='nlw')ppl.sort((a,b)=>b.nlwScore-a.nlwScore||fullName(a).localeCompare(fullName(b),'fr'));
  $('rankList').innerHTML=rankRows(ppl,chosen,state.statsTab==='nlw'?'nlw':'main');
  const preview=$('dlfr251StatsPreview');if(preview)preview.innerHTML=statsProfilePreview(chosen);
 }
 });
 document.addEventListener('change',ev=>{const f=ev.target.closest('[data-form="clanCreate"],[data-form="clanEdit"]');if(f)syncClanPreview(f);if(ev.target.id==='scopedLevelCandidates'){scopedLevelPick(ev.target.value);return;}
  if(ev.target.id==='dlfrRegionSort'){state.regionsSort=['points','players','hardest'].includes(ev.target.value)?ev.target.value:'points';render();return;}

 if(ev.target.id==='selfCountry'){const code=ev.target.value;const regionRow=$('selfRegionRow'),region=$('selfRegion');if(regionRow)regionRow.hidden=code!=='FR';if(region&&code!=='FR')region.value='';if($('selfCountryFlag'))$('selfCountryFlag').innerHTML=GEO.countryImage(code);if($('selfRegionFlag'))$('selfRegionFlag').innerHTML=code==='FR'?GEO.regionImage(region?.value):'';}
 if(ev.target.id==='selfRegion'&&$('selfRegionFlag'))$('selfRegionFlag').innerHTML=GEO.regionImage(ev.target.value);
 if(ev.target.id==='countryFilter'){state.country=ev.target.value;state.region='ALL';state.keyword='';render();}
 if(ev.target.id==='regionFilter'){state.region=ev.target.value;state.keyword='';render();}
 if(ev.target.id==='recordsYear'){state.statsYear=ev.target.value;const panel=$('profileContent');if(panel)panel.innerHTML=statProfile(getPlayer(state.selectedPlayer));}
 if(ev.target.id==='compareA'){state.selectedPlayer=ev.target.value;render();}
 if(ev.target.id==='compareB'){state.comparePlayer=ev.target.value;render();}
 if(ev.target.id==='profileEditorPlayer')fillProfileEditor();
 if(ev.target.id==='levelStudioSelect')syncLevelStudio();
 if(ev.target.id==='dlfr27PackSelect')fillPackEditor(ev.target.value);
 if(ev.target.id==='hiddenDeleteSelect'){const form=ev.target.closest('form');if(form){form.dataset.deletePreviewId='';const del=form.querySelector('[name="delete_action"][value="delete"]');if(del)del.disabled=true;const preview=document.getElementById('hiddenDeletePreview');if(preview)preview.hidden=true;}}
 if(ev.target.matches('[data-form="linkVerifier"] select[name="verifier_name"]')){const item=window.__dlfrVerifierUnlinked?.[Number(ev.target.value)];const preview=document.getElementById('verifierLinkPreview');if(preview)preview.textContent=item?`${item.count} niveau(x) non liés : ${(item.levels||[]).map(n=>n.name+' (#'+n.id+')').join(', ')}`:'Sélectionne un vérificateur.';}
 if(ev.target.matches('[data-form="demon"] select[name="existing_demon_id"]'))fillImportedDemonForm(ev.target);
 if(ev.target.closest('[data-form="demon"]')&&['position','legacy','unrated'].includes(ev.target.name))updateNewLevelRankPreview(ev.target.closest('form'));
 if(ev.target.id==='historicNlwSelect'){const opt=ev.target.selectedOptions[0];const pos=document.getElementById('historicNlwPosition');if(opt&&pos)pos.value=opt.dataset.oldPosition||'151';}
 if(ev.target.id==='profileEditorCountry'||ev.target.id==='profileEditorRegion')syncRegionEditor();
 if(ev.target.id==='calcPlayer'){state.calcPlayer=ev.target.value;state.calcDemons=[];render();}
 if(ev.target.matches('[data-calc-demon]')){const id=+ev.target.dataset.calcDemon;state.calcDemons=ev.target.checked?[...new Set([...state.calcDemons,id])]:state.calcDemons.filter(x=>x!==id);render();}
 if(ev.target.id==='importDemo')importDemo(ev.target.files?.[0]);
 if(ev.target.closest('[data-form="news"]'))updateNewsPreview(ev.target.closest('form'));
});
 document.addEventListener('submit',ev=>{const form=ev.target;if(!form.matches('[data-form="levelPackEditor"],[data-form="chooseFrame"]'))return;ev.preventDefault();ev.stopImmediatePropagation();(async()=>{try{if(form.dataset.form==='levelPackEditor')await savePackForm(form);else await saveFrame(form);}catch(e){toast(e.message||String(e));}})();},true);
 document.addEventListener('input',ev=>{
  if(ev.target.id!=='selfMergeSourceSearch')return;
  const select=document.getElementById('selfMergeSourceSelect');if(!select)return;
  const needle=key(ev.target.value),players=(state.mergeRequestCandidates||[]).filter(p=>p.player_key!==state.ownKey);
  const matches=players.filter(p=>key((p.username||'')+' '+p.player_key).includes(needle)).slice(0,35);
  select.replaceChildren(...matches.map(p=>new Option((p.username||'Joueur')+' · '+p.player_key,p.player_key)));
  select.selectedIndex=-1;
 });
 document.addEventListener('input',ev=>{
  if(ev.target.id!=='mySubmissionSearch')return;
  state.mySubmissionSearch=ev.target.value;
  const root=document.getElementById('mySubmissionResults');
  if(!root)return;
  const doc=new DOMParser().parseFromString(mySubmissionsPage(),'text/html');
  root.replaceChildren(...Array.from(doc.querySelectorAll('#mySubmissionResults > *')));
 });
 document.addEventListener('input',ev=>{if(ev.target.id!=='submitLevelSearch')return;const sel=document.getElementById('submitLevelSelect');if(!sel)return;const q=key(ev.target.value);for(const o of sel.options){if(!o.value)continue;o.hidden=!key(o.textContent+' '+o.dataset.search).includes(q);}if(sel.value&&sel.selectedOptions[0]?.hidden)sel.value='';submitSyncForm();});
 document.addEventListener('change',ev=>{if(ev.target.id==='submitLevelSelect'||ev.target.name==='submission_mode'||ev.target.name==='progress')submitSyncForm();});
 document.addEventListener('submit',ev=>{if(ownerPreviewActive()&&new URLSearchParams(location.search).get('page')==='admin'){ev.preventDefault();ev.stopImmediatePropagation();toast('Aperçu en lecture seule.');}},true);
 document.addEventListener('submit',ev=>{if(ev.target.matches('[data-form="clanCreate"], [data-form="clanInvite"], [data-form="clanRequest"], [data-form="clanEdit"]')){ev.preventDefault();handleClanForm(ev.target);return;}if(ev.target.matches('[data-form]')){ev.preventDefault();handleForm(ev.target,ev.submitter||null);}});
 document.querySelectorAll('.nav-links a,.brand').forEach(a=>a.addEventListener('click',ev=>{ev.preventDefault();go(a.dataset.link||'list');}));
 $('themeSelect').addEventListener('change',e=>setTheme(e.target.value));
 $('unratedToggle').addEventListener('click',()=>{state.unrated=!state.unrated;state.calcDemons=[];refreshUnrated();render();});
 window.addEventListener('popstate',()=>{closeNavMenus();state.keyword='';render();});
 try{const initial=v96StoredTheme();setTheme(initial==='halloween'?'light':(initial||'light'),false);}catch{}refreshUnrated();
}
try{
 bootEvents();
 load().catch(showPageError);

}catch(error){showPageError(error);}
})();

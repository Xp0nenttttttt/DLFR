/* DemonlistFrancophone — navigateur seul (aucun PHP). Moteur de la première migration. */
(() => {
'use strict';
const C = window.DEMONLIST_CONFIG || {};
const HAS_SUPABASE = !!(C.supabaseUrl && C.supabasePublishableKey);
// Le mode aperçu ne modifie pas Supabase : les données fictives restent dans le navigateur.
const FORCE_PREVIEW = (()=>{try{const queryDemo=new URLSearchParams(location.search).get('demo')==='1';if(queryDemo)sessionStorage.setItem('dlfr-preview-mode','demo');return queryDemo||sessionStorage.getItem('dlfr-preview-mode')==='demo';}catch{return new URLSearchParams(location.search).get('demo')==='1';}})();
const LIVE = HAS_SUPABASE && !FORCE_PREVIEW;
const V2 = window.DLFR_V2;
const CLANS = window.DLFR_CLANS;
const CLAN_PLUS = window.DLFR_CLAN_PLUS;
const UNVERIFIED = window.DLFR_UNVERIFIED;
const v2Tables=['fr_achievements','clans','clan_members','nlw_staff','player_sanctions','aredl_levels','clan_invites','clan_requests'];
const tables = ['site_settings','players','demons','completions','news_items','profile_titles','player_profile_titles','player_profiles','hall_of_fame','player_stat_snapshots','demon_position_history'];
let db = null, state = { data:null, staff:false, session:null, country:'MONDE', selectedPlayer:'', list:'main', keyword:'', busy:false, statsTab:'players', statsYear:'all', comparePlayer:'', profileTab:'overview', newsFilter:'all', newsSearch:'', adminTab:'overview', editingNews:null, unrated:false, calcPlayer:'', calcDemons:[], calcNlw:false, unbeatSearch:'', unbeatLimit:120, communityExcel:{status:'loading',items:[],message:'',offline:false}, demoRole:'owner', demoActor:'spleen', selectedClan:1, clanSort:'points', clanSearch:'', clanDetailTab:'overview' };
const el = document.getElementById('app');
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain = v=>String(v??'').trim();
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
 if(error)throw Error('Envoi de l’image impossible : '+error.message+' (vérifie supabase/03_media_profiles_v11.sql)');
 const {data}=db.storage.from('demonlist-news').getPublicUrl(path);
 return data.publicUrl;
}
const flag = code=> {const c=plain(code).toUpperCase();return /^[A-Z]{2}$/.test(c)?[...c].map(ch=>String.fromCodePoint(ch.charCodeAt(0)+127397)).join(''):'';};
const date = d => {if(!d)return '';const x=new Date(d);return Number.isNaN(x.getTime())?'':x.toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});};
const toast=msg=>{const x=$('toast');x.textContent=msg;x.classList.add('visible');setTimeout(()=>x.classList.remove('visible'),3500);};
const templateNotice=()=> LIVE ? '' : `<div class="notice warning"><strong>Mode démonstration :</strong> tous les joueurs, scores et niveaux affichés sont des exemples. Aucune donnée n'est enregistrée dans Supabase.${HAS_SUPABASE?' <button type="button" class="btn subtle small" data-action="previewLive">Revenir aux données réelles</button>':' Pour utiliser la base réelle, renseigne js/config.js.'}</div>`;
function migrationNotice(){
 if(!HAS_SUPABASE || !LIVE || state.data?.demons?.length)return '';
 const people=state.data?.players?.length||0,records=state.data?.completions?.length||0;
 return `<div class="notice migration-notice" role="status"><strong>Supabase est connecté, mais aucun niveau public n'est disponible.</strong><p>Actuellement : <b>0 niveau</b>, <b>${people} joueur(s)</b>, <b>${records} record(s)</b>. Le schéma Supabase crée les tables, mais ne transfère pas automatiquement les données de x10Hosting.</p><p>Prochaine étape : exporter les tables MySQL <code>users</code>, <code>demons</code> et <code>completions</code>, puis utiliser <code>tools/convert_mysql_csv.py</code> et importer les CSV dans Supabase (ordre : players, demons, completions).${people||records?' Vérifie également les règles de lecture RLS de la table demons.':''}</p><button type="button" class="btn" data-action="previewDemo">Voir le site avec des données d’exemple</button><p class="small muted">La démo ne remplit pas la base et ne modifie aucune donnée réelle.</p></div>`;
}
const cfg=()=>state.data.site_settings[0]||{main_limit:75,extended_limit:150,top1_points:350,legacy_scores:false};
const catalog=()=>V2.decorate(state.data.demons,state.unrated);
const nlwPoints=(d,r=100)=>V2.nlwPoints(d,r);
const noSqlNotice=()=>LIVE?'<p class="muted small">Options V2 en lecture seule jusqu’à la migration SQL/RLS. Aucune écriture nouvelle sur Supabase.</p>':'';
const allowV2Edit=()=>!LIVE&&state.staff;
const canNLW=()=>!LIVE && state.staff && (state.demoRole!=='nlw_editor'||state.data.nlw_staff.length>0);
const callout=x=>`<div class="notice">${x}</div>`;
const demoLoad=()=>{
 // Récupération sans perte de la base : la réinitialisation ne touche qu'au navigateur.
 const query=new URLSearchParams(location.search);
 if(query.has('reset')){try{localStorage.removeItem('demonlist-demo-v1');}catch{} query.delete('reset');try{history.replaceState({},'',location.pathname+'?'+query.toString());}catch{}}
 if(!window.DEMONLIST_DEMO)throw Error('js/demo-data.js est manquant ou non chargé sur GitHub Pages.');
 const d=JSON.parse(JSON.stringify(window.DEMONLIST_DEMO));try{const saved=localStorage.getItem('demonlist-demo-v1');if(saved){const obj=JSON.parse(saved);if(obj && typeof obj==='object') for(const t of [...tables,...v2Tables])if(Array.isArray(obj[t])) d[t]=obj[t];}}catch{};if(!Array.isArray(d.community_audit_log))d.community_audit_log=[];for(const t of v2Tables)if(!Array.isArray(d[t]))d[t]=[];return d;};
const saveDemo=()=>{if(!LIVE)try{localStorage.setItem('demonlist-demo-v1',JSON.stringify(state.data));}catch{}};
function withTimeout(promise,ms,message){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]).finally(()=>clearTimeout(timer));}
async function readAll(name){let out=[],from=0;while(true){const {data,error}=await db.from(name).select('*').range(from,from+999);if(error)throw Error(`${name} : ${error.message}`);out.push(...data);if(data.length<1000)break;from+=1000;if(from>=60000)throw Error(`Limite de lecture atteinte pour ${name}; pagination serveur à prévoir`);}return out;}
async function load(){
 if(!LIVE){try{state.data=demoLoad();$('sourceLabel').textContent=HAS_SUPABASE?'Aperçu local (Supabase non modifié)':'Démonstration locale';render();}catch(error){showPageError(error);}return;}
 if(!window.supabase){el.innerHTML='<div class="center-panel"><h2>Supabase indisponible</h2><p>Le client Supabase n’a pas pu être chargé. Vérifie ta connexion.</p><button type="button" class="btn" data-action="previewDemo">Voir la démo locale</button></div>';return;}
 db=window.supabase.createClient(C.supabaseUrl,C.supabasePublishableKey);
 try{
   const result=await withTimeout(Promise.all(tables.map(readAll)),20000,'Supabase ne répond pas après 20 secondes.');state.data=Object.fromEntries(tables.map((t,i)=>[t,result[i]]));for(const t of v2Tables)state.data[t]=[];
   const {data:sessionData}=await db.auth.getSession();state.session=sessionData.session;
   await checkStaff();
   state.data.community_audit_log=state.staff?await readAll('community_audit_log'):[];
   $('sourceLabel').textContent=state.data.demons.length?`Supabase · ${state.data.demons.length} niveau(x)`:'Supabase · aucun niveau importé';render();
 }catch(err){el.innerHTML=`<div class="center-panel"><h2>Connexion Supabase impossible</h2><p>${esc(err.message)}</p><p class="small">Vérifie le schéma SQL, les permissions RLS et la clé publique du projet.</p><button type="button" class="btn" data-action="previewDemo">Tester le site en mode démo</button></div>`;}
}
async function checkStaff(){
 if(!LIVE)return;
 state.staff=false;
 if(!state.session)return;
 const {data,error}=await db.from('staff_roles').select('role').eq('auth_user_id',state.session.user.id).maybeSingle();
 if(!error && data)state.staff=['helper','editor','owner'].includes(data.role);
}
function nav(){const page=(new URLSearchParams(location.search)).get('page')||'list';document.querySelectorAll('[data-link]').forEach(a=>a.classList.toggle('active',a.dataset.link===page));return page;}
function go(page,fields={}){history.pushState({},'',url(page,fields));state.keyword='';render();window.scrollTo({top:0,behavior:'instant'});}
function box(label,value){return `<div class="statbox"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div></div>`;}
function scoreBase(position){const p=+position;return p>=56?1.039035131*((185.7*Math.exp(-.02715*p))+14.84):p>=36?1.0371139743*((212.61*Math.pow(1.036,1-p))+25.071):p>=21?((250-83.389)*Math.pow(1.0099685,2-p)-31.152)*1.0371139743:p>=4?((326.1*Math.exp(-.0871*p))+51.09)*1.037117142:p>=1?(-18.2899079915*p)+368.2899079915:0;}
function score(demon,progress=100){
 const s=cfg(),p=num(demon.position),required=Math.max(1,Math.min(100,num(demon.requirement||100)));
 if(p<1||p>num(s.extended_limit)||num(progress)<required)return 0;
 const base=scoreBase(p)*num(s.top1_points)/scoreBase(1);
 return +progress===100?base:(base*Math.pow(5,(+progress-required)/Math.max(1,100-required)))/10;
}
function ranked(){
 const d=state.data,demons=catalog(),byId=Object.fromEntries(demons.map(v=>[v.id,v]));
 const completionScoreByPlayer = new Map();
 const people=new Map(d.players.map(p=>[p.player_key,{...p,total_records:0,total_completions:0,main:[],extended:[],beyond:[],legacy:[],progress:[],created:[],published:[],verified:[],pointsComputed:num(p.bonus_points),hardest:null}]));
 const ensure=(name)=>{const k=key(name);if(!k)return null;if(!people.has(k))people.set(k,{player_key:k,username:name,display_name:name,country_code:'',has_account:false,hidden_from_stats:false,points:0,bonus_points:0,pointsComputed:0,total_records:0,total_completions:0,main:[],extended:[],beyond:[],legacy:[],progress:[],created:[],published:[],verified:[],hardest:null});return people.get(k);};
 for(const demon of demons){for(const [field,dest] of [['creator','created'],['publisher','published'],['verifier','verified']]){
   const names=field==='creator'?[demon.creator,...plain(demon.creator_more).split(',')]:[demon[field]];
   for(const name of names){const player=ensure(name);if(player&&!player[dest].some(x=>x.id===demon.id))player[dest].push(demon);}
 }}
 for(const r of d.completions){const player=ensure(r.player),demon=byId[r.demon_id];if(!player||!demon)continue;
    player.total_records++;if(+r.progress>=100)player.total_completions++;
    const points=score(demon,r.progress),rankDemon=+demon.position<=+cfg().main_limit?'main':+demon.position<=+cfg().extended_limit?'extended':'beyond';
    if(r.progress>=100)player[rankDemon].push(demon);else player.progress.push({demon,progress:r.progress});
    if(V2.historicalLegacy(r,demon))player.legacy.push(demon);
    player.pointsComputed+=points;
    if(!completionScoreByPlayer.has(player.player_key))completionScoreByPlayer.set(player.player_key,new Map());
    completionScoreByPlayer.get(player.player_key).set(demon.id,points);
    if(r.progress>=100 && demon.position<=cfg().extended_limit && (!player.hardest || +demon.position<+player.hardest.position))player.hardest=demon;
 }
 // Comme dans le PHP original : vérification = points 100%, moins les points déjà obtenus sur ce niveau.
 for(const demon of demons){
  if(demon.position<1 || demon.position>cfg().extended_limit)continue;
  const byUserId=d.players.find(p=>num(p.legacy_id)>0 && num(p.legacy_id)===num(demon.verifier_user_id));
  const verifier=people.get(byUserId?.player_key||key(demon.verifier));
  if(!verifier || !verifier.has_account)continue;
  const existing=completionScoreByPlayer.get(verifier.player_key)?.get(demon.id)||0;
  verifier.pointsComputed+=Math.max(0,score(demon,100)-existing);
 }
 const nlw=V2.project(d.players,d.demons,d.completions,state.unrated),extras=new Map(nlw.map(x=>[x.player_key,x]));
 const result=[...people.values()].map(p=>{const n=extras.get(p.player_key);const nlwScore=n?.nlw_score||0;return {...p,score:(LIVE||state.unrated)?p.pointsComputed:num(p.points),nlwScore,nlwRank:n?.nlw_rank||null,autoBadges:V2.badges(p,demons,d.completions),clan:(d.clan_members||[]).find(c=>c.player_key===p.player_key)};});
 result.sort((a,b)=>b.score-a.score||a.display_name.localeCompare(b.display_name));
 let pos=0;for(const p of result)if(!p.hidden_from_stats){p.rank=++pos;} else p.rank=null;
 return result;
}
function getPlayer(value){return ranked().find(p=>p.player_key===key(value))||null;}
function cardsHTML(demons){if(!demons.length)return '<div class="paper empty">Aucun niveau dans cette catégorie.</div>';
 return demons.map(d=>{const p=num(d.position),req=+d.requirement||100,isRank=p<=cfg().extended_limit;
   const pills=`<div class="level-status">${p>150?`<span class="level-badge outside">NLW #${V2.nlwRank(d)} · ${fmt(nlwPoints(d))} pts NLW</span>`:''}${d.legacy?'<span class="level-badge legacy">Legacy</span>':''}${d.unrated?'<span class="level-badge unrated-badge">UNRATED</span>':''}</div>`;
   const thumb=http(d.thumbnail_url),image=thumb?`<img loading="lazy" class="demon-thumb" src="${esc(thumb)}" alt="Miniature de ${esc(d.name)}">`:(String(d.thumbnail_url||'').startsWith('assets/')?`<img class="demon-thumb" src="${esc(d.thumbnail_url)}" alt="Miniature de ${esc(d.name)}">`:`<div class="demon-thumb faux-thumb">${esc(d.name)}</div>`);
   return `<article class="paper list-entry ${p<=30?'top30':p<=75?'top75':''}"><a href="${url('demon',{id:d.id})}" data-nav>${image}</a><div><h2><a href="${url('demon',{id:d.id})}" data-nav style="text-decoration:none">#${p} - ${esc(d.name)}</a></h2><div class="entry-meta">publié par <b>${esc(d.publisher||'-')}</b>, vérifié par <b>${esc(d.verifier||'-')}</b></div><div class="points ${isRank?'':'no-points'}">${isRank?`${fmt(score(d,req))} (${req}%) — ${fmt(score(d,100))} (100%) points`:`NLW : ${fmt(nlwPoints(d))} points NLW (0 point principal)`}</div>${(p>cfg().extended_limit||d.legacy||d.unrated)?pills:''}</div></article>`;
 }).join('');}
function listPage(){const d=state.data,nav=['main','nlw','legacy'],labels=['Main List · Top 150','NLW · rang 151+','Legacy List'];
 const sLabel=state.list;const levels=catalog().filter(x=>sLabel==='legacy'?x.legacy:sLabel==='nlw'?x.position>150:x.position<=150);
 const top=`<div class="list-tabs">${nav.map((x,i)=>`<button type="button" class="${sLabel===x?'active':''}" data-list="${x}">${esc(labels[i])}</button>`).join('')}</div>${sLabel==='main'?'<div class="v2-legend"><span class="hist-top30">Top 1–30 : rouge</span><span class="hist-top75">Top 31–75 : jaune</span><span>Top 76–150 : neutre</span></div>':''}`;
 return `${templateNotice()}${state.unrated?callout('<b>Mode UNRATED</b> — simulation alternative des positions et points, sans modifier le classement officiel.'):''}${top}<div class="page-columns"><section><div class="center-panel"><h1>${sLabel==='nlw'?'NLW · Next List Wave':sLabel==='legacy'?'Legacy List':'Geometry Dash Demonlist'}</h1><p>${sLabel==='nlw'?'Classement indépendant pour les niveaux à partir de la position 151. Points et rangs NLW distincts.':sLabel==='legacy'?'Anciens niveaux de la Main List. Les records réalisés après leur sortie ne deviennent pas des records Legacy.':'Les 150 niveaux classés de la DemonlistFrancophone.'}</p><label class="filterbox"><span>⌕</span><input id="demonSearch" type="search" placeholder="Filtrer les démons affichés..." value="${esc(state.keyword)}" autocomplete="off"></label></div><div id="demonItems">${cardsHTML(levels.filter(x=>key(x.name).includes(key(state.keyword))))}</div></section><aside class="right-side"><div class="info-panel right-panel"><h2>Éditeurs de liste</h2><p>Contacter les éditeurs pour les changements de classement.</p><div class="staff-name">🇫🇷 YOMAYOCB</div><div class="staff-name">🇫🇷 SOFFAX</div><h2>Équipe NLW</h2><p>Les modérateurs NLW peuvent gérer uniquement les niveaux au-delà du Top 150.</p></div><div class="info-panel right-panel"><h2>Directives</h2><p>Seules les runs légitimes avec preuves claires sont acceptées.</p><button class="btn" data-route="news">Actualités de la liste</button></div></aside></div>`;
}
function completionLinks(levels){return levels.length?levels.sort((a,b)=>a.position-b.position).map(d=>`<a class="link" href="${url('demon',{id:d.id})}" data-nav>#${esc(d.position)} ${esc(d.name)}</a>`).join(' - '):'<span class="muted">Aucun</span>';}
function titleHTML(p){return state.data.player_profile_titles.filter(a=>a.player_key===p.player_key).map(a=>state.data.profile_titles.find(t=>t.id===a.title_id && t.is_active)).filter(Boolean).map(t=>`<span class="tag user-title" style="background:${/^#[0-9a-f]{6}$/i.test(t.color)?t.color:'#287bba'}" title="${esc(t.description||'')}">${esc(t.label)}</span>`).join('');}

const fullName=p=>p?.display_name||p?.username||p?.player_key||'?';
const getNewsCategory=n=>['Annonce','Record','Classement','Communauté'].includes(n.category)?n.category:(/record|termin|complet|victor/i.test(n.headline)?'Record':/top|classement|rang/i.test(n.headline)?'Classement':'Annonce');
const yearsFromRecords=()=>[...new Set((state.data.completions||[]).map(r=>plain(r.created_at).slice(0,4)).filter(y=>/^\d{4}$/.test(y)))].sort().reverse();
function countCommunityRecords(start,end){const positions=new Map(catalog().map(d=>[Number(d.id),Number(d.position)]));const seen=new Set();for(const r of state.data.completions||[]){const pos=positions.get(Number(r.demon_id));if(+r.progress!==100||pos<start||pos>end)continue;seen.add(key(r.player)+'|'+r.demon_id);}return seen.size;}
function statsOverview(){
 const people=ranked().filter(p=>!p.hidden_from_stats&&p.has_account);
 const all=state.data.demons||[];const records=state.data.completions||[];
 return `<div class="overview-stats">${box('Joueurs classés',people.filter(p=>p.score>0).length)}${box('Niveaux suivis',all.length)}${box('Complétions Main · #1–75',countCommunityRecords(1,75))}${box('Complétions Extended · #76–150',countCommunityRecords(76,150))}${box('Hors Top '+cfg().extended_limit,all.filter(d=>+d.position>cfg().extended_limit).length)}</div>`;
}
function countryRows(){const by=new Map();for(const p of ranked().filter(p=>!p.hidden_from_stats&&p.has_account)){
 const code=p.country_code||'??'; if(!by.has(code))by.set(code,{code,score:0,players:0,records:0,leader:p});
 const a=by.get(code);a.score+=p.score;a.players++;a.records+=p.total_completions;if(p.score>a.leader.score)a.leader=p;
}return [...by.values()].sort((a,b)=>b.score-a.score);}
function graphRank(data){if(data.length<2)return '<p class="empty small">L’historique réel commencera à être enregistré après activation des instantanés.</p>';
 const d=data.map(x=>({day:x.snapshot_day, rank:+(x.rank??0)})).filter(x=>x.rank>0);if(d.length<2)return '<p class="empty small">Pas assez de rangs enregistrés.</p>';
 const min=Math.min(...d.map(x=>x.rank)),max=Math.max(...d.map(x=>x.rank)),gap=Math.max(1,max-min);
 const coords=d.map((x,i)=>[28+i*478/(d.length-1),25+(x.rank-min)/gap*108]);
 return `<div class="chart-box"><svg viewBox="0 0 540 160" role="img" aria-label="Historique du rang, rang 1 en haut"><path d="M25 25V136H510" fill="none" stroke="#8ca5b9"/><path d="${coords.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')}" fill="none" stroke="#9362be" stroke-width="3"/>${coords.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="4" fill="#9362be"><title>${esc(d[i].day)} : #${d[i].rank}</title></circle>`).join('')}<text x="29" y="17" fill="currentColor" font-size="11">Meilleur : #${min}</text><text x="360" y="155" fill="currentColor" font-size="10">${esc(d.at(-1).day)}</text></svg></div>`;
}
function recordTable(p){const byId=new Map(catalog().map(d=>[+d.id,d]));const year=state.statsYear;
 const rows=state.data.completions.filter(c=>key(c.player)===p.player_key&&byId.get(+c.demon_id)?.position<=150&&(year==='all'||plain(c.created_at).slice(0,4)===year)).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
 return `<div class="profile-section"><div class="row-between"><h3>Records (${rows.length})</h3><label class="small">Année <select id="recordsYear"><option value="all">Toutes</option>${yearsFromRecords().map(y=>`<option value="${y}" ${year===y?'selected':''}>${y}</option>`).join('')}</select></label></div><div class="record-table-wrap"><table class="record-table"><thead><tr><th>Niveau</th><th>Liste</th><th>Progression</th><th>Date</th><th>Preuve</th></tr></thead><tbody>${rows.map(r=>{const d=byId.get(+r.demon_id);const group=!d?'—':+d.position>150?'NLW':+d.position<=75?'Main List':'Extended List';return `<tr><td>${d?`<a class="link" href="${url('demon',{id:d.id})}" data-nav>${esc(d.name)}</a>`:'—'}</td><td>${esc(group)}</td><td><b>${esc(r.progress)}%</b></td><td>${date(r.created_at)||'—'}</td><td>${http(r.video_url)?`<a href="${esc(http(r.video_url))}" target="_blank" rel="noopener noreferrer">Vidéo ↗</a>`:'—'}</td></tr>`;}).join('')||'<tr><td colspan="5" class="empty">Aucun record pour cette période.</td></tr>'}</tbody></table></div></div>`;
}
function comparison(p,other){if(!other)return '<p class="muted small">Choisis un joueur pour comparer leurs statistiques.</p>';
 const rows=[['Points',fmt(p.score),fmt(other.score)],['Classement',p.rank?'#'+p.rank:'—',other.rank?'#'+other.rank:'—'],['Complétions',p.total_completions,other.total_completions],['Main List · #1–75',new Set(p.main.map(d=>d.id)).size,new Set(other.main.map(d=>d.id)).size],['Extended List · #76–150',new Set(p.extended.map(d=>d.id)).size,new Set(other.extended.map(d=>d.id)).size],['NLW',p.beyond.length,other.beyond.length],['Legacy',p.legacy.length,other.legacy.length],['Niveaux vérifiés',p.verified.length,other.verified.length]];
 return `<div class="record-table-wrap"><table class="record-table"><thead><tr><th>Indicateur</th><th>${esc(fullName(p))}</th><th>${esc(fullName(other))}</th></tr></thead><tbody>${rows.map(([n,a,b])=>`<tr><td>${esc(n)}</td><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</tbody></table></div>`;
}

function statProfile(p){if(!p)return '<div class="stats-profile empty">Sélectionne un joueur.</div>';
 const profile=state.data.player_profiles.find(v=>v.player_key===p.player_key)||{};
 const snapshots=state.data.player_stat_snapshots.filter(s=>s.player_key===p.player_key).sort((a,b)=>a.snapshot_day.localeCompare(b.snapshot_day));
 const recs=state.data.completions.filter(c=>key(c.player)===p.player_key);
 const monthly={};for(const r of recs){if(+r.progress<100)continue;const m=plain(r.created_at).slice(0,7);if(m)monthly[m]=(monthly[m]||0)+1;}
 const rankedStr=p.rank?`#${p.rank}`:'—';
 const banner=imageLink(profile.banner_url),avatar=imageLink(profile.avatar_url);const suspension=state.data.players.find(x=>x.player_key===p.player_key)?.demo_suspended_until;const isSuspended=!!(suspension&&new Date(suspension)>new Date());
 const recent=recs.filter(c=>+c.progress===100&&catalog().find(d=>+d.id===+c.demon_id)?.position<=150).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,5);
 const demonLookup=new Map(catalog().map(d=>[+d.id,d]));
 const profileFacts=[['Depuis',profile.join_year],['Niveau favori',profile.favorite_level],['Objectif',profile.current_goal]]
  .filter(([_,v])=>plain(v)).map(([l,v])=>`<div class="profile-fact"><strong>${esc(l)}</strong><span>${esc(v)}</span></div>`).join('');
 const socials=[['YouTube',profile.youtube_url],['Twitch',profile.twitch_url],['Lien personnel',profile.social_url]].filter(([_,v])=>http(v))
  .map(([n,v])=>`<a class="social-link" target="_blank" rel="noopener noreferrer" href="${esc(http(v))}">${n} ↗</a>`).join('');
 return `<div class="stats-profile"><div class="profile-hero">${banner?`<img class="profile-cover-img" src="${esc(banner)}" alt="" aria-hidden="true">`:''}
    <div class="profile-hero-inner">${avatar?`<img class="profile-avatar" src="${esc(avatar)}" alt="Avatar de ${esc(p.display_name||p.username)}">`:`<div class="profile-avatar profile-avatar-fallback" aria-hidden="true">${esc((p.display_name||p.username||'?').slice(0,1).toUpperCase())}</div>`}
      <div class="profile-hero-copy"><span class="profile-pretitle">Profil joueur · ${p.has_account?'Compte':'Sans compte'}</span><strong>${flag(p.country_code)} ${esc(p.display_name||p.username)}</strong><span>${p.hardest?'Hardest : '+esc(p.hardest.name):'Aucun hardest connu'}</span></div>
    </div></div>
 ${isSuspended?'<p class="notice warning"><b>Profil suspendu en démonstration</b> — cette sanction n’affecte pas l’authentification réelle.</p>':''}<h2 class="player-title">${flag(p.country_code)} ${esc(p.display_name||p.username)} ${!p.has_account?'<span class="tag">Sans compte</span>':''}</h2><div style="text-align:center;margin-bottom:8px">${titleHTML(p)}${p.clan?` <a class="tag clan-profile-link" href="${url('clans')}" data-nav>Clan : ${esc(state.data.clans.find(c=>Number(c.id)===Number(p.clan.clan_id))?.tag||'—')}</a>`:''}</div>
 <div class="statboxes">${box('Classement Demonlist',rankedStr)}${box('Points totaux',fmt(p.score))}${box('Démon le plus difficile',p.hardest?`#${p.hardest.position} ${p.hardest.name}`:'Aucun')}</div>
 <div class="statboxes two">${box('Points NLW',fmt(p.nlwScore||0))}${box('Rang NLW',p.nlwRank?'#'+p.nlwRank:'—')}</div><div class="statboxes two">${box('Main List · #1–75',new Set(p.main.map(d=>d.id)).size)}${box('Extended List · #76–150',new Set(p.extended.map(d=>d.id)).size)}</div><div class="statboxes two">${box('Contributions',`${p.created.length} Créés, ${p.published.length} Publiés, ${p.verified.length} Vérifiés`)}${box('Autres complétions',`${p.legacy.length} Legacy, ${p.beyond.length} NLW`)}</div>
 <div class="profile-section badge-gallery"><h3>Badges automatiques</h3>${p.autoBadges.length?p.autoBadges.map(b=>`<span class="auto-badge" title="Palier ${b.goal}">✦ ${esc(b.name)}</span>`).join(''):'<span class="muted">Aucun badge débloqué</span>'}<p class="small muted">Les badges Faucheur dépendent des complétions actuellement dans le Top 150. Les badges Vérificateur restent acquis.</p></div><div class="profile-section profile-tabs" role="tablist" aria-label="Sections du profil">${[['overview','Présentation'],['records','Records'],['charts','Graphiques'],['achievements','Distinctions']].map(([id,label])=>`<button type="button" role="tab" aria-selected="${state.profileTab===id}" data-profile-tab="${id}" class="${state.profileTab===id?'active':''}">${label}</button>`).join('')}</div>
 <div class="profile-pane ${state.profileTab==='overview'?'':'is-hidden'}" data-pane="overview">
 ${profile.bio?`<div class="profile-bio">${esc(profile.bio)}</div>`:''}
  ${profileFacts?`<div class="profile-facts">${profileFacts}</div>`:''}
  ${socials?`<div class="profile-socials">${socials}</div>`:''}
  <div class="profile-section"><h3>Dernières complétions</h3>${recent.length?`<div class="recent-completions">${recent.map(r=>{const dem=demonLookup.get(+r.demon_id);return `<div class="recent-item"><span>✓</span><a class="link" href="${url('demon',{id:r.demon_id})}" data-nav>${esc(dem?.name||'Niveau inconnu')}</a><time>${date(r.created_at)}</time></div>`;}).join('')}</div>`:'<p class="muted">Aucun record daté.</p>'}</div>
 </div><div class="profile-pane ${state.profileTab==='records'?'':'is-hidden'}" data-pane="records">${recordTable(p)}
 <div class="profile-section"><h3>Top 150 complété</h3><p>${completionLinks([...p.main,...p.extended])}</p></div><div class="profile-section"><h3>NLW — ${p.beyond.length} niveau(x) complété(s)</h3><p class="muted small">Les détails des niveaux hors liste ne sont pas affichés dans les statistiques principales.</p></div><div class="profile-section"><h3>Liste héritée complétée (avant sortie uniquement)</h3><p>${completionLinks(p.legacy)}</p></div>
 ${[['Démons créés',p.created],['Démons publiés',p.published],['Démons vérifiés',p.verified]].map(([t,a])=>`<div class="profile-section"><h3>${t}</h3><p>${completionLinks(a)}</p></div>`).join('')}
 <div class="profile-section"><h3>Progression sur</h3><p>${p.progress.length?p.progress.map(r=>esc(r.demon.name)+' : '+r.progress+'%').join(' · '):'Aucun'}</p></div>
 </div><div class="profile-pane ${state.profileTab==='charts'?'':'is-hidden'}" data-pane="charts">
 <div class="profile-section"><h3>Progression historique</h3>${lineGraph(snapshots)}<p class="muted small">Les instantanés sont enregistrés uniquement à partir de leur activation.</p></div>
 <div class="profile-section"><h3>Évolution du rang</h3>${graphRank(snapshots)}</div>
 <div class="profile-section"><h3>Complétions par mois</h3>${barGraph(monthly)}</div></div>
 <div class="profile-pane ${state.profileTab==='achievements'?'':'is-hidden'}" data-pane="achievements">
 ${[profile.highlight_1,profile.highlight_2,profile.highlight_3].filter(Boolean).length?`<div class="profile-section"><h3>Accomplissements mis en avant</h3><p>${[profile.highlight_1,profile.highlight_2,profile.highlight_3].filter(Boolean).map(x=>`<span class="tag">★ ${esc(x)}</span>`).join('')}</p></div>`:''}
 ${state.data.hall_of_fame.filter(h=>h.player_key===p.player_key&&h.is_published).map(h=>`<div class="hof-item"><div class="hof-year">${esc(h.award_year)} · ${esc(h.category)}</div><h3>${esc(h.headline)}</h3><p>${esc(h.description)}</p></div>`).join('')||'<p class="muted small">Aucune distinction officielle pour le moment.</p>'}
 </div></div>`;
}
function lineGraph(data){if(data.length<2)return '<p class="empty small">Aucun historique disponible pour le moment.</p>';const max=Math.max(...data.map(x=>+x.points),1),min=Math.min(...data.map(x=>+x.points)),den=Math.max(1,max-min);const coords=data.map((x,i)=>[24+i*480/Math.max(1,data.length-1),135-(+x.points-min)/den*110]);return `<div class="chart-box"><svg viewBox="0 0 540 160" role="img" aria-label="Évolution des points"><path d="M20 135H515" stroke="#bbc7d3"/><path d="${coords.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')}" fill="none" stroke="#167fbe" stroke-width="3"/>${coords.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="3.2" fill="#167fbe"/>`).join('')}<text x="20" y="14" font-size="11" fill="currentColor">${fmt(max)} pts</text><text x="22" y="155" font-size="10" fill="currentColor">${esc(data[0].snapshot_day)}</text><text x="420" y="155" font-size="10" fill="currentColor">${esc(data.at(-1).snapshot_day)}</text></svg></div>`;}
function barGraph(monthly){const keys=Object.keys(monthly).sort().slice(-12);if(!keys.length)return '<p class="empty small">Pas de dates de records renseignées.</p>';const mx=Math.max(...keys.map(k=>monthly[k]));return `<div class="chart-box"><div style="display:flex;align-items:flex-end;gap:6px;min-height:115px">${keys.map(k=>`<div style="flex:1;text-align:center"><div style="background:#1783c1;height:${Math.max(4,85*monthly[k]/mx)}px" title="${esc(k)} : ${monthly[k]} complétion(s)"></div><span style="font-size:9px">${esc(k.slice(5))}</span></div>`).join('')}</div></div>`;}
function statsPage(){const users=ranked().filter(p=>!p.hidden_from_stats);const countries=['MONDE',...new Set(users.map(p=>p.country_code).filter(Boolean))].sort((a,b)=>a==='MONDE'?-1:b==='MONDE'?1:a.localeCompare(b));
 const filtered=users.filter(p=>(state.country==='MONDE'||p.country_code===state.country)&&key(fullName(p)).includes(key(state.keyword)));
 const chosen=getPlayer(state.selectedPlayer)||filtered[0]||users[0];if(chosen)state.selectedPlayer=chosen.player_key;
 const top=`${templateNotice()}<section class="paper stats-main"><div class="center-panel" style="box-shadow:none;border:0;padding:13px 0 4px"><h1>Statistiques</h1><p>Joueurs, pays et progression de la communauté francophone.</p></div>${statsOverview()}
 <div class="switch-tabs"><button type="button" data-stats-tab="players" class="${state.statsTab==='players'?'active':''}">Joueurs</button><button type="button" data-stats-tab="countries" class="${state.statsTab==='countries'?'active':''}">Pays</button><button type="button" data-stats-tab="nlw" class="${state.statsTab==='nlw'?'active':''}">Classement NLW</button><button type="button" data-stats-tab="compare" class="${state.statsTab==='compare'?'active':''}">Comparaison</button></div>`;
 if(state.statsTab==='nlw')return top+`<h3>Points NLW · indépendants des points principaux</h3><div class="record-table-wrap"><table class="record-table"><thead><tr><th>Rang NLW</th><th>Joueur</th><th>Points NLW</th><th>Complétions NLW</th></tr></thead><tbody>${users.filter(p=>p.nlwScore>0).sort((a,b)=>b.nlwScore-a.nlwScore).map((p,i)=>`<tr><td>#${i+1}</td><td><a class="link" data-nav href="${url('stats',{player:p.player_key})}">${esc(fullName(p))}</a></td><td>${fmt(p.nlwScore)}</td><td>${p.beyond.length}</td></tr>`).join('')||'<tr><td colspan="4">Aucun point NLW</td></tr>'}</tbody></table></div></section>`;
 if(state.statsTab==='countries')return top+`<div class="record-table-wrap"><table class="record-table"><thead><tr><th>Rang</th><th>Pays</th><th>Points cumulés</th><th>Joueurs</th><th>Complétions</th><th>Meilleur joueur</th></tr></thead><tbody>${countryRows().map((c,i)=>`<tr><td>#${i+1}</td><td>${flag(c.code)} ${esc(c.code==='??'?'Non renseigné':c.code)}</td><td><b>${fmt(c.score)}</b></td><td>${c.players}</td><td>${c.records}</td><td>${esc(fullName(c.leader))}</td></tr>`).join('')}</tbody></table></div><p class="muted small">Classement calculé à partir des profils publics de cette version.</p></section>`;
 if(state.statsTab==='compare'){const a=chosen||users[0],b=getPlayer(state.comparePlayer)||users.find(p=>p.player_key!==a?.player_key);return top+`<div class="compare-panel"><div class="compare-selects"><label>Joueur A <select id="compareA">${users.map(p=>`<option value="${esc(p.player_key)}" ${p.player_key===a?.player_key?'selected':''}>${esc(fullName(p))}</option>`).join('')}</select></label><label>Joueur B <select id="compareB">${users.filter(p=>p.player_key!==a?.player_key).map(p=>`<option value="${esc(p.player_key)}" ${p.player_key===b?.player_key?'selected':''}>${esc(fullName(p))}</option>`).join('')}</select></label></div>${a?comparison(a,b):'<p class="empty">Pas de joueurs.</p>'}</div></section>`;}
 return top+`<div class="stats-grid"><div class="ranking-panel"><div class="kicker">International</div><select id="countryFilter" aria-label="Filtrer par pays">${countries.map(c=>`<option value="${esc(c)}" ${c===state.country?'selected':''}>${c==='MONDE'?'MONDE - International':flag(c)+' '+esc(c)}</option>`).join('')}</select><label class="filterbox" style="margin-top:9px"><span>⌕</span><input type="search" id="playerSearch" placeholder="Rechercher un joueur…" value="${esc(state.keyword)}"></label><div class="rank-list" id="rankList">${rankRows(filtered,chosen)}</div><p class="muted small">Les profils sans compte apparaissent en gris.</p></div><div id="profileContent">${statProfile(chosen)}</div></div></section>`;
}
function rankRows(users,chosen){return users.length?users.map(p=>`<button type="button" class="rank-item ${p.player_key===chosen?.player_key?'selected':''} ${p.has_account?'':'unclaimed'}" data-player="${esc(p.player_key)}"><span class="rank-num">#${p.rank||'-'}</span><span class="rank-name">${flag(p.country_code)} ${esc(p.display_name||p.username)}</span><span class="rank-score">${fmt(p.score)}</span></button>`).join(''):'<div class="empty">Aucun joueur trouvé.</div>';}
function demonPage(){const id=+(new URLSearchParams(location.search)).get('id'),d=catalog().find(x=>+x.id===id);if(!d)return '<div class="center-panel">Niveau introuvable.</div>';
 const recs=state.data.completions.filter(c=>+c.demon_id===id).sort((a,b)=>+b.progress - +a.progress);
 const thumb=http(d.thumbnail_url)|| (plain(d.thumbnail_url).startsWith('assets/')?d.thumbnail_url:'');
 return `${templateNotice()}<div class="paper"><p><a href="${url('list')}" data-nav class="link">← Retour à la liste</a></p><h1>#${d.position} - ${esc(d.name)}</h1><div class="level-detail">${thumb?`<img class="demon-thumb" style="width:100%;height:auto" src="${esc(thumb)}" alt="Miniature">`:'<div class="demon-thumb faux-thumb" style="width:100%">'+esc(d.name)+'</div>'}<div><p>Publié par <b>${esc(d.publisher)}</b><br>Vérifié par <b>${esc(d.verifier||'-')}</b><br>Créé par <b>${esc(d.creator||'-')}</b></p><p><b>Rang :</b> #${d.position} · <b>Minimum :</b> ${d.requirement}%</p><p class="small">${+d.position>cfg().extended_limit?'NLW : '+fmt(nlwPoints(d))+' points NLW':fmt(score(d,100))+' points (100%)'}</p><div class="level-status">${+d.position>cfg().extended_limit?'<span class="level-badge outside">NLW #'+V2.nlwRank(d)+'</span>':''}${d.unrated?'<span class="level-badge unrated-badge">UNRATED</span>':''}${d.legacy?'<span class="level-badge legacy">Legacy · ancien Top 150</span>':''}</div>${http(d.video_url)?`<a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(http(d.video_url))}">Regarder la vidéo ↗</a>`:''}</div></div><hr class="divider"><p>${esc(d.description||'')}</p><h2>Records (${recs.length})</h2>${recs.length?recs.map(r=>`<div class="record-row"><div><a class="link" data-nav href="${url('stats',{player:key(r.player)})}">${esc(r.player)}</a> — ${esc(r.progress)}%</div>${http(r.video_url)?`<a target="_blank" rel="noopener noreferrer" class="link" href="${esc(http(r.video_url))}">Vidéo ↗</a>`:''}</div>`).join(''):'<p class="empty">Aucun record enregistré.</p>'}</div>`;
}
function newsPage(){const all=[...state.data.news_items].filter(x=>x.is_published||state.staff).sort((a,b)=>(+(!!b.is_pinned)-+(!!a.is_pinned))||new Date(b.created_at)-new Date(a.created_at));
 const items=all.filter(n=>(state.newsFilter==='all'||getNewsCategory(n)===state.newsFilter)&&`${key(n.headline)} ${key(n.body)} ${key(n.player_name)}`.includes(key(state.newsSearch)));
 const categories=['all','Annonce','Record','Classement','Communauté'];
 return `${templateNotice()}<div class="paper news-page"><div class="center-panel" style="box-shadow:none;border:0"><h1>Actualités</h1><p>Informations, nouveaux records et événements de la communauté.</p></div><div class="news-controls"><div class="news-filters">${categories.map(c=>`<button type="button" class="${state.newsFilter===c?'active':''}" data-news-filter="${esc(c)}">${c==='all'?'Tout voir':esc(c)}</button>`).join('')}</div><label class="filterbox"><span>⌕</span><input id="newsSearch" type="search" value="${esc(state.newsSearch)}" placeholder="Rechercher une actualité"></label></div><div id="newsItems">${newsItemsHTML(items)}</div></div>`;
}
function newsItemsHTML(items){return items.length?items.map(n=>`<article class="news-card ${n.is_pinned?'pinned':''}"><div class="news-meta"><span class="news-category">${esc(getNewsCategory(n))}</span>${n.is_pinned?'<span class="news-pin">★ À la une</span>':''}<time>${date(n.created_at)}${!n.is_published?' · Brouillon':''}</time></div><h3>${esc(n.headline)}</h3><p class="news-body">${esc(n.body)}</p>${newsMedia(n)}${n.player_name?`<a class="tag" href="${url('stats',{player:key(n.player_name)})}" data-nav>${esc(n.player_name)}</a>`:''}${state.staff?`<div class="news-editor-actions"><button class="btn subtle small" data-edit-news="${n.id}">Modifier</button><button class="btn subtle small" data-toggle-news="${n.id}">${n.is_published?'Mettre en brouillon':'Publier'}</button></div>`:''}</article>`).join(''):'<p class="empty">Aucune actualité trouvée.</p>';}
function hallPage(){const items=state.data.hall_of_fame.filter(x=>x.is_published||state.staff).sort((a,b)=>(b.award_year||0)-(a.award_year||0));return `${templateNotice()}<div class="paper"><div class="center-panel" style="border:0;box-shadow:none"><h1>Hall of Fame</h1><p>Les accomplissements marquants de la communauté francophone.</p></div><div class="hof-grid">${items.length?items.map(h=>`<article class="hof-item"><div class="hof-year">${esc(h.award_year||'—')} · ${esc(h.category)}${!h.is_published?' · Brouillon':''}</div><h3>${esc(h.headline)}</h3><p><a class="link" data-nav href="${url('stats',{player:h.player_key})}">${esc(h.player_key)}</a></p><p>${esc(h.description||'')}</p>${http(h.source_url)?`<a class="link small" href="${esc(http(h.source_url))}" target="_blank" rel="noopener noreferrer">Source ↗</a>`:''}</article>`).join(''):'<p class="empty">Aucune récompense pour le moment.</p>'}</div></div>`;}
const playerOptions=()=>ranked().sort((a,b)=>a.display_name.localeCompare(b.display_name)).map(x=>`<option value="${esc(x.player_key)}">${esc(x.display_name||x.username)}</option>`).join('');
function adminPage(){if(LIVE&&!state.staff){return `<div class="paper"><h1>Modération</h1><p class="muted">Les rôles sont validés par Supabase Auth et les règles RLS, pas par le navigateur.</p><form data-form="login"><label class="field">Adresse e-mail<input name="email" type="email" required autocomplete="email"></label><label class="field">Mot de passe<input name="password" type="password" required autocomplete="current-password"></label><div class="form-actions"><button class="btn">Connexion</button>${state.session?'<button type="button" class="btn subtle" data-action="logout">Déconnexion</button>':''}</div></form>${state.session?'<p class="notice warning">Ce compte n’a pas encore le rôle de modérateur. Celui-ci doit être attribué par un propriétaire depuis Supabase.</p>':''}</div>`;}
 if(!LIVE&&!state.staff)return `<div class="paper"><h1>Laboratoire de modération</h1><p>Cette démonstration sauvegarde tes essais <b>uniquement dans le navigateur</b> et n’a aucun effet sur le site original.</p><button class="btn" data-action="demoStaff">Activer la simulation modérateur</button></div>`;
 const players=playerOptions();return `${templateNotice()}<div class="paper"><div class="admin-mode">${LIVE?'Modération connectée · changements sur Supabase':'Laboratoire local · aucune modification de la base de données'}</div><div class="row-between"><h1>Modération</h1><div>${!LIVE?'<button class="btn subtle small" data-action="resetDemo">Réinitialiser démo</button>':'<button class="btn subtle small" data-action="logout">Déconnexion</button>'}</div></div>${!LIVE?`<label class="field" style="max-width:300px">Rôle simulé<select id="demoRole"><option value="owner" ${state.demoRole==='owner'?'selected':''}>Administrateur</option><option value="editor" ${state.demoRole==='editor'?'selected':''}>Modérateur général</option><option value="nlw_editor" ${state.demoRole==='nlw_editor'?'selected':''}>Modérateur NLW seulement</option></select></label>`:''}<p class="muted">Le contrôle d’accès réel est assuré par les policies Supabase. Le journal des changements est automatique.</p></div><div class="admin-workspace" data-role="${state.demoRole}"><div class="admin-nav" role="tablist" aria-label="Sections de modération">${[['overview','Vue d’ensemble'],['levels','Niveaux'],['news','Actualités'],['profiles','Profils'],['awards','Titres & Hall of Fame'],['achievements','Achievements FR'],['clans','Clans'],['safety','Sanctions'],['nlw','Modos NLW'],['audit','Journal']].map(([id,label])=>`<button type="button" role="tab" aria-selected="${state.adminTab===id}" class="${state.adminTab===id?'active':''}" data-admin-tab="${id}">${label}</button>`).join('')}</div><div class="admin-content"><div class="admin-intro ${state.adminTab==='overview'?'':'is-hidden'}"><h2>Tableau de bord</h2>${statsOverview()}<p class="muted">Choisis une rubrique pour ajouter ou modifier les informations de la Demonlist. ${LIVE?'Les changements réels demandent les permissions Supabase.':'Toutes les modifications ici sont locales et réinitialisables.'}</p>${!LIVE?'<button type="button" class="btn subtle" data-action="exportDemo">Exporter la démo (.json)</button> <label class="btn subtle import-label">Importer une démo (.json)<input id="importDemo" type="file" accept="application/json,.json" hidden></label>':''}</div><div class="moderation-sections" data-active-admin="${state.adminTab}">
 <div class="admin-card" data-admin-section="levels"><h3>Ajouter un niveau</h3><form data-form="demon"><label class="field">Position dans la liste globale (151 = NLW #1)<input name="position" type="number" min="1" required></label><label class="field">Nom<input name="name" required maxlength="120"></label><label class="field">Publié par<input name="publisher" required></label><label class="field">Vérifié par<input name="verifier"></label><label class="field">Créateur<input name="creator"></label><label class="field">Progression minimum (%)<input name="requirement" type="number" min="1" max="100" value="100" required></label><label class="field"><input name="legacy" type="checkbox" style="width:auto"> A déjà appartenu au Top 150 (Legacy)</label><label class="field">Date de sortie de liste (si connue)<input name="legacy_since" type="date"></label><label class="field"><input type="checkbox" name="unrated"> Niveau UNRATED (position estimée en mode alternatif)</label><button class="btn">Ajouter le niveau</button><p class="small muted">Si son rang dépasse 150, il apparaît hors classement et vaut automatiquement 0 point.</p></form></div>
 <div class="admin-card" data-admin-section="news"><h3>Publier une actualité</h3><form data-form="news"><input type="hidden" name="news_id" value=""><label class="field">Titre<input name="headline" maxlength="160" required></label><label class="field">Annonce<textarea name="body" required></textarea></label><label class="field">Joueur concerné (facultatif)<input name="player_name"></label><label class="field">Catégorie (aperçu local)<select name="category"><option>Annonce</option><option>Record</option><option>Classement</option><option>Communauté</option></select></label><label class="field"><input type="checkbox" name="is_pinned" style="width:auto"> Mettre à la une (aperçu local)</label><label class="field">Image (URL, facultatif)<input name="image_url" type="url" placeholder="https://…/image.webp"></label><label class="field">Ou importer une image (PNG / JPG / WebP / GIF, max 5 Mo)<input name="image_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><label class="field">Vidéo (URL YouTube ou vidéo .mp4 / .webm)<input name="video_url" type="url" placeholder="https://youtu.be/…"></label><p class="small muted">Tu peux mettre une image et une vidéo dans la même actualité. En démo, images depuis le PC limitées à 650 Ko. Les vidéos sont intégrées depuis leurs liens.</p><label class="field"><input type="checkbox" name="is_published" checked style="width:auto"> Publié (sinon brouillon)</label><div class="news-live-preview" id="newsDraftPreview"><b>Prévisualisation</b><p>Commence à remplir le formulaire pour voir l’aperçu.</p></div><div class="form-actions"><button class="btn" type="submit">Enregistrer l’actualité</button><button type="button" class="btn subtle" data-action="cancelNews">Annuler l’édition</button></div></form><div class="managed-news"><h4>Actualités existantes</h4>${state.data.news_items.slice().reverse().slice(0,10).map(n=>`<div class="managed-item"><span>${esc(n.headline)} <small>${n.is_published?'· publiée':'· brouillon'}</small></span><button class="btn subtle small" data-edit-news="${n.id}">Éditer</button></div>`).join('')}</div></div>
 <div class="admin-card" data-admin-section="awards"><h3>Créer un titre</h3><form data-form="title"><label class="field">Nom du titre<input name="label" maxlength="90" placeholder="Top 1 France 2025" required></label><label class="field">Description<input name="description" maxlength="200"></label><label class="field">Couleur<input name="color" type="color" value="#287bba" style="height:38px;padding:3px"></label><button class="btn">Créer le titre</button></form></div>
 <div class="admin-card" data-admin-section="awards"><h3>Attribuer un titre</h3><form data-form="award"><label class="field">Joueur<select name="player_key" required>${players}</select></label><label class="field">Titre<select name="title_id" required>${state.data.profile_titles.map(x=>`<option value="${x.id}">${esc(x.label)}</option>`).join('')}</select></label><button class="btn">Attribuer</button></form></div>
 <div class="admin-card" data-admin-section="profiles"><h3>Personnaliser un profil</h3><form data-form="profile"><label class="field">Joueur<select name="player_key" id="profileEditorPlayer" required>${players}</select></label><label class="field">Biographie<textarea name="bio" maxlength="1200"></textarea></label><label class="field">URL d'avatar<input name="avatar_url" type="url" placeholder="https://…"></label><label class="field">URL de bannière<input name="banner_url" type="url"></label><label class="field">Année de début<input name="join_year" type="number" min="2013" max="2100" placeholder="2021"></label><label class="field">Niveau favori<input name="favorite_level" maxlength="120"></label><label class="field">Objectif actuel<input name="current_goal" maxlength="180"></label><label class="field">Lien YouTube<input name="youtube_url" type="url"></label><label class="field">Lien Twitch<input name="twitch_url" type="url"></label><label class="field">Lien personnel<input name="social_url" type="url"></label><label class="field">Accomplissement 1<input name="highlight_1"></label><label class="field">Accomplissement 2<input name="highlight_2"></label><label class="field">Accomplissement 3<input name="highlight_3"></label><div class="profile-editor-tip">Sélectionne un joueur pour charger sa biographie et ses informations actuelles.</div><button class="btn">Enregistrer</button></form></div>
 <div class="admin-card" data-admin-section="awards"><h3>Hall of Fame</h3><form data-form="hall"><label class="field">Joueur<select name="player_key">${players}</select></label><label class="field">Distinction<input name="headline" required></label><label class="field">Année<input name="award_year" type="number" min="2010" max="2100"></label><label class="field">Catégorie<input name="category" value="Accomplissement" required></label><label class="field">Description<textarea name="description"></textarea></label><label class="field">Source (facultative)<input name="source_url" type="url"></label><button class="btn">Ajouter au Hall of Fame</button></form></div>
 <div class="admin-card" data-admin-section="profiles"><h3>Visibilité des joueurs</h3><form data-form="visibility"><label class="field">Joueur<select name="player_key">${players}</select></label><label class="field">Dans les classements<select name="hidden_from_stats"><option value="false">Afficher</option><option value="true">Masquer</option></select></label><button class="btn">Mettre à jour</button></form></div>
 <div class="admin-card" data-admin-section="overview"><h3>Statistiques de modération</h3>${statsOverview()}${renderBadgeSummary()}<div class="admin-kpis">${box('Titres existants',state.data.profile_titles.length)}${box('Actualités',state.data.news_items.length)}${box('Comptes sans profil',ranked().filter(p=>!p.has_account).length)}${box('Clans',state.data.clans.length)}${box('Achievements FR',(state.data.fr_achievements||[]).length)}${box('Points NLW cumulés',fmt(ranked().reduce((n,p)=>n+p.nlwScore,0)))}</div><p class="small muted">Statistiques de démonstration — les tables Supabase V2 ne sont pas encore installées.</p></div>
<div class="admin-card" data-admin-section="levels"><h3>État des classements</h3><p><b>Top 150</b> : ${catalog().filter(x=>x.position<=150).length} niveau(x)</p><p><b>NLW</b> : ${catalog().filter(x=>x.position>150).length} niveau(x)</p><p><b>Unrated</b> : ${state.data.demons.filter(x=>x.unrated).length} niveau(x) candidats</p><p class="small muted">Position NLW = position globale − 150. La grille reste distincte des points principaux.</p></div>
<div class="admin-card" data-admin-section="achievements"><h3>Créer un achievement FR</h3><form data-form="frAchievement"><label class="field">Titre<input name="title" required maxlength="110"></label><label class="field">Joueur<select name="player_key">${players}</select></label><label class="field">Niveau<input name="level_name" required></label><label class="field">Run / exploit<input name="run_text" placeholder="48–100, 39 %..."></label><label class="field">Description<textarea name="description"></textarea></label><label class="field">Vidéo / preuve<input name="video_url" type="url"></label><button class="btn" ${LIVE?'disabled':''}>Ajouter l'achievement (démo)</button></form></div>
<div class="admin-card" data-admin-section="clans"><h3>Gestion des clans</h3><p>La création, les invitations et les changements de membres se font désormais sur la page Clans avec le compte joueur simulé. Les modérateurs n’attribuent pas directement les membres.</p><button type="button" class="btn" data-route="clans">Ouvrir les clans</button></div>
<div class="admin-card" data-admin-section="safety"><h3>Modération de profils</h3><p class="small muted">Suppression de bannière et suspension temporaire sont simulées localement. Pour bannir réellement un compte, il faudra des règles RLS et un service sécurisé : jamais uniquement du JavaScript.</p><form data-form="safety"><label class="field">Joueur<select name="player_key">${players}</select></label><label class="field">Action<select name="action"><option value="remove_banner">Retirer la bannière</option><option value="temp_ban">Suspension temporaire simulée</option><option value="unban">Lever la suspension</option></select></label><label class="field">Durée en jours<input name="days" type="number" min="1" max="365" value="7"></label><label class="field">Motif<input name="reason" required maxlength="300"></label><button class="btn danger" ${LIVE?'disabled':''}>Appliquer en démo</button></form><h3>Sanctions en démo</h3>${(state.data.player_sanctions||[]).slice(-6).reverse().map(x=>`<p class="small">${esc(x.player_key)} : ${esc(x.action)} · ${esc(x.reason)} ${x.until?'jusqu’au '+date(x.until):''}</p>`).join('')||'<p class="muted">Aucune sanction</p>'}</div>
<div class="admin-card" data-admin-section="nlw"><h3>Modérateurs NLW</h3><p class="small muted">Droits limités aux niveaux de rang 151 et au-delà. Démonstration locale : aucun droit n'est accordé dans Supabase avant migration RLS.</p><form data-form="nlwStaff"><label class="field">Joueur<select name="player_key">${players}</select></label><button class="btn" ${LIVE?'disabled':''}>Ajouter un modérateur NLW (démo)</button></form><p>${(state.data.nlw_staff||[]).map(x=>`<span class="tag">${esc(x.player_key)}</span>`).join('')||'Aucun'}</p></div>
 <div class="admin-card" data-admin-section="audit"><h3>Journal de modération</h3><p class="muted small">Dernières actions enregistrées automatiquement par la base.</p><div>${(state.data.community_audit_log||[]).slice(-20).reverse().map(x=>`<div class="record-row small"><b>${esc(x.action_key)} · ${esc(x.target)}</b><span>${date(x.created_at)}</span></div>`).join('')||'<p class="empty">Aucune action récente.</p>'}</div></div>
 </div></div></div>`;
}
function v2Header(title,sub){return `${templateNotice()}<section class="paper v2-page"><div class="v2-intro"><span class="kicker">DEMONLIST FRANCOPHONE · V2.2</span><h1>${title}</h1><p>${sub}</p></div>`;}
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
  `<p class="small muted" style="margin-top:15px">Une ligne « Vérifié communauté = Oui » est cachée. Avec les données réelles Supabase, un vérificateur ou une complétion à 100 % sur le même niveau le masque aussi. Le simple fait de posséder un lien ou de figurer dans AREDL ne suffit pas. Aucune synchronisation automatique avec les vérifications externes à la Demonlist n’est possible sans autre source.</p></section>`;
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
async function loadCommunityExcel(){
 const input='data/niveaux-non-battus.xlsx';
 try{
   if(location.protocol==='file:'){
     state.communityExcel={status:'ready',items:UNVERIFIED.OFFLINE_EXAMPLES,message:'',offline:true};
   }else{
     const response=await fetch(input+'?v='+Date.now(),{cache:'no-store'});
     if(!response.ok)throw Error('Fichier inaccessible ('+response.status+').');
     if(!window.XLSX)throw Error('Le lecteur Excel JavaScript est indisponible (connexion ou CDN).');
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
function achievementsPage(){const items=state.data.fr_achievements||[];return v2Header('Achievements français','Runs, défis et exploits remarquables : sans points et sans classement entre les entrées.')+`<div class="v2-achievements">${items.map(a=>`<article class="achievement-card"><span class="news-category">Achievement communautaire</span><h2>${esc(a.title)}</h2><p class="muted">${esc(a.level_name)} · ${esc(a.run_text||'')}</p><p><a data-nav class="link" href="${url('stats',{player:a.player_key})}">${esc(a.player_key)}</a> · ${date(a.created_at)}</p><p>${esc(a.description||'')}</p>${http(a.video_url)?`<a class="btn small" target="_blank" rel="noopener noreferrer" href="${esc(http(a.video_url))}">Voir la preuve ↗</a>`:''}</article>`).join('')||'<p class="empty">Aucun achievement.</p>'}</div></section>`;}
function updateClanDemo(command){
 if(LIVE)throw Error('Les actions de clan réelles nécessitent la migration Supabase Auth et RLS.');
 const engine=['update','promote','demote','request','withdraw','approve','reject'].includes(command.type)?CLAN_PLUS:CLANS;
 const next=engine.apply(state.data,{...command,actor:state.demoActor});
 for(const table of ['clans','clan_members','clan_invites','clan_requests'])if(Array.isArray(next[table]))state.data[table]=next[table];
 auditV2('CLAN_'+command.type.toUpperCase(),command.target||command.name||String(command.clan_id||command.request_id||''));
 toast('Clan mis à jour (démo locale)');render();
}
function handleClanForm(form){try{
 const f=Object.fromEntries(new FormData(form));
 const type=form.dataset.form;
 if(type==='clanCreate')updateClanDemo({type:'create',name:f.name,tag:f.tag,description:f.description,color:f.color});
 else if(type==='clanRequest')updateClanDemo({type:'request',clan_id:Number(f.clan_id),message:f.message});
 else if(type==='clanEdit')updateClanDemo({type:'update',clan_id:Number(f.clan_id),name:f.name,description:f.description,banner_url:f.banner_url,logo_url:f.logo_url,color:f.color,recruiting:!!form.querySelector('[name="recruiting"]:checked')});
 else {const mine=CLANS.member(state.data,state.demoActor);if(!mine)throw Error('Rejoins un clan pour inviter.');updateClanDemo({type:'invite',clan_id:mine.clan_id,target:f.target});}
 }catch(error){toast('Clan : '+error.message);}
}
function handleClanAction(btn){try{
 const type=btn.dataset.clanAction,clan_id=Number(btn.dataset.clanId)||CLANS.member(state.data,state.demoActor)?.clan_id;
 if(['remove','transfer','disband'].includes(type)&&!confirm(type==='disband'?'Dissoudre ce clan ? Tous les membres et invitations seront retirés.':type==='transfer'?'Transférer définitivement la direction du clan ?':'Retirer ce joueur du clan ?'))return;
 updateClanDemo({type,clan_id,invite_id:btn.dataset.inviteId,request_id:btn.dataset.requestId,target:btn.dataset.target});
 }catch(error){toast('Clan : '+error.message);}
}
function clansPage(){
 const data=state.data,clans=data.clans||[],invites=data.clan_invites||[],requests=data.clan_requests||[],actor=state.demoActor;
 const leaderBoard=CLAN_PLUS.stats(data,ranked(),catalog(),score);
 const myMembership=CLAN_PLUS.membership(data,actor),myClan=myMembership?CLAN_PLUS.clan(data,myMembership.clan_id):null;
 const isLeader=myMembership?.role==='leader',isManager=['leader','officer'].includes(myMembership?.role);
 const players=data.players.filter(p=>p.has_account&&!p.hidden_from_stats);
 const who=k=>{const p=players.find(x=>key(x.player_key)===key(k));return p?fullName(p):k;};
 const showPicture=(value,kind)=>{const source=imageLink(value);return source?`<img class="${kind}" loading="lazy" src="${esc(source)}" alt="">`:'';};
 const actorSelect=!LIVE?`<div class="clan-player-simulator"><div><strong>Simulation de compte</strong><p class="small muted">La sélection d'un joueur n'est possible qu'en démonstration. Supabase Auth sera utilisé pour les vrais comptes.</p></div><label class="field">Jouer en tant que<select id="clanDemoActor">${players.map(p=>`<option value="${esc(p.player_key)}" ${key(p.player_key)===key(actor)?'selected':''}>${esc(fullName(p))}</option>`).join('')}</select></label></div>`:'<div class="notice warning">Clans en lecture seule avec les données réelles. Les candidatures et les permissions nécessiteront Supabase Auth et des règles RLS. <a href="?page=clans&demo=1">Tester la démonstration</a>.</div>';
 const selectedId=Number(new URLSearchParams(location.search).get('id'));
 const selected=leaderBoard.find(c=>c.clan.id===selectedId);
 const roleTag=r=>r==='leader'?'★ Chef':r==='officer'?'◆ Officier':'Membre';
 const actions=(c)=>{
   if(LIVE)return '';
   const owns=!!myClan&&myClan.id===c.id;
   const manager=owns&&isManager,chief=owns&&isLeader;
   const pending=invites.filter(x=>Number(x.clan_id)===c.id&&x.status==='pending');
   const applicants=requests.filter(x=>Number(x.clan_id)===c.id&&x.status==='pending');
   const possible=players.filter(p=>!CLANS.member(data,p.player_key)&&key(p.player_key)!==key(actor));
   if(!owns){
     if(myClan)return '';
     const existing=requests.find(r=>r.clan_id===c.id&&key(r.player_key)===key(actor)&&r.status==='pending');
     return `<section class="clan-v22-panel"><h3>Rejoindre ce clan</h3>${existing?`<p>Candidature envoyée.</p><button class="btn subtle small" data-clan-action="withdraw" data-request-id="${existing.id}">Retirer ma candidature</button>`:c.recruiting?`<form data-form="clanRequest"><input type="hidden" name="clan_id" value="${c.id}"><label class="field">Motivation (facultatif)<input name="message" maxlength="220" placeholder="Pourquoi rejoindre ce clan ?"></label><button class="btn">Envoyer ma candidature</button></form>`:'<p class="muted small">Ce clan recrute uniquement sur invitation.</p>'}</section>`;
   }
   const inviteForm=manager?`<form data-form="clanInvite" class="clan-inline-form"><label class="field">Inviter un joueur<select name="target" required>${possible.map(p=>`<option value="${esc(p.player_key)}">${esc(fullName(p))}</option>`).join('')}</select></label><button class="btn" ${possible.length?'':'disabled'}>Inviter</button></form>`:'';
   const invitesList=manager?`<h4>Invitations en attente</h4>${pending.map(i=>`<div class="clan-v22-queue"><span>${esc(who(i.invitee_key))}</span><button class="btn subtle small" data-clan-action="cancel" data-invite-id="${i.id}">Annuler</button></div>`).join('')||'<p class="muted small">Aucune invitation en attente.</p>'}`:'';
   const requestsList=manager?`<h4>Candidatures reçues · ${applicants.length}</h4>${applicants.map(r=>`<div class="clan-v22-queue"><div><b>${esc(who(r.player_key))}</b> <span class="muted">${esc(r.message||'Sans message')}</span></div><div class="clan-actions"><button class="btn small" data-clan-action="approve" data-request-id="${r.id}">Accepter</button><button class="btn subtle small" data-clan-action="reject" data-request-id="${r.id}">Refuser</button></div></div>`).join('')||'<p class="muted small">Aucune candidature en attente.</p>'}`:'';
   const editForm=chief?`<details class="clan-v22-edit"><summary>Personnaliser mon clan</summary><form data-form="clanEdit" class="clan-v22-form"><input name="clan_id" type="hidden" value="${c.id}"><label class="field">Nom<input name="name" maxlength="45" required value="${esc(c.name)}"></label><label class="field">Description<textarea name="description" rows="3" maxlength="500">${esc(c.description||'')}</textarea></label><label class="field">Image de bannière (URL HTTPS)<input name="banner_url" type="url" value="${esc(c.banner_url||'')}" placeholder="https://..."></label><label class="field">Logo (URL HTTPS)<input name="logo_url" type="url" value="${esc(c.logo_url||'')}" placeholder="https://..."></label><label class="field">Couleur<input name="color" type="color" value="${esc(CLAN_PLUS.hex(c.color))}"></label><label class="clan-v22-check"><input name="recruiting" type="checkbox" ${c.recruiting?'checked':''}> Candidatures ouvertes</label><button class="btn">Enregistrer</button></form></details>`:'';
   const leaderActions=chief?`<button class="btn subtle small" data-clan-action="disband" data-clan-id="${c.id}">Dissoudre le clan</button>`:`<button class="btn subtle small" data-clan-action="leave">Quitter le clan</button>`;
   return `<section class="clan-v22-panel"><h3>Gestion de mon clan <span class="tag">${roleTag(myMembership.role)}</span></h3>${inviteForm}${requestsList}${invitesList}${editForm}<div class="clan-actions">${leaderActions}</div></section>`;
 };
 const rankBlock=x=>`<div class="clan-v22-ranks"><div><span>Rang points</span><strong>#${x.totalPointsRank}</strong></div><div><span>Rang démons</span><strong>#${x.topCountRank}</strong></div><div><span>Rang hardest</span><strong>#${x.hardestPositionRank}</strong></div><div><span>Rang NLW</span><strong>#${x.nlwPointsRank}</strong></div></div>`;
 const metrics=x=>`<div class="clan-v22-metrics"><div><strong>${fmt(x.totalPoints)}</strong><span>Points Top 150 cumulés</span></div><div><strong>${fmt(x.nlwPoints)}</strong><span>Points NLW cumulés</span></div><div><strong>${x.topCount}</strong><span>Démons Top 150 distincts</span></div><div><strong>${x.uniqueCount}</strong><span>Démons tous classements</span></div><div><strong>${x.members.length}/25</strong><span>Membres</span></div><div><strong>${x.hardest?'#'+esc(x.hardest.position):'—'}</strong><span>Hardest du clan</span></div></div>`;
 if(selected){
  const c=selected.clan,manager=!LIVE&&CLAN_PLUS.canManage(data,c.id,actor),chief=!LIVE&&CLAN_PLUS.isLeader(data,c.id,actor);
  const tab=['overview','members','levels','created'].includes(state.clanDetailTab)?state.clanDetailTab:'overview';
  const membersHtml=[...selected.members].sort((a,b)=>({leader:0,officer:1,member:2}[a.role]-{leader:0,officer:1,member:2}[b.role])).map(m=>{
   const person=selected.people.find(p=>key(p.player_key)===key(m.player_key));
   const memberActions=(manager&&key(m.player_key)!==key(actor))?`<div class="clan-actions">${chief&&m.role!=='leader'?`<button class="btn subtle small" data-clan-action="${m.role==='officer'?'demote':'promote'}" data-clan-id="${c.id}" data-target="${esc(m.player_key)}">${m.role==='officer'?'Rétrograder':'Nommer officier'}</button>`:''}${chief?`<button class="btn subtle small" data-clan-action="transfer" data-clan-id="${c.id}" data-target="${esc(m.player_key)}">Transférer chef</button>`:''}${(chief||m.role==='member')?`<button class="btn subtle small" data-clan-action="remove" data-clan-id="${c.id}" data-target="${esc(m.player_key)}">Retirer</button>`:''}</div>`:'';
   return `<div class="clan-v22-member"><div><a data-nav class="link" href="${url('stats',{player:m.player_key})}"><strong>${esc(who(m.player_key))}</strong></a><span class="tag">${roleTag(m.role)}</span></div><b>${fmt(person?.score||0)} pts</b>${memberActions}</div>`;
  }).join('');
  const finished=[...selected.entries].sort((a,b)=>Number(a.demon.position)-Number(b.demon.position));
  const completedHtml=finished.slice(0,100).map(e=>`<div class="clan-v22-level"><span class="clan-v22-position">#${esc(e.demon.position||'—')}</span><div><a class="link" data-nav href="${url('demon',{id:e.demon.id})}"><b>${esc(e.demon.name)}</b></a><div class="small muted">Terminé par ${[...e.players].map(who).map(esc).join(', ')}</div></div><span>${Number(e.demon.position)<=150?fmt(score(e.demon,100))+' pts':'NLW'}</span></div>`).join('');
  const latest=[...selected.completions].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,8);
  return v2Header('Profil de clan · '+esc(c.name),'Classement, membres, accomplissements et gestion communautaire.')+actorSelect+`<a data-nav class="clan-v22-back" href="${url('clans')}">← Retour au classement des clans</a><div class="clan-v22-hero" style="--clan-accent:${esc(CLAN_PLUS.hex(c.color))}">${showPicture(c.banner_url,'clan-v22-banner')}<div class="clan-v22-hero-body"><div class="clan-v22-logo">${showPicture(c.logo_url,'clan-v22-logo-image')||esc(c.tag)}</div><div><span class="clan-v22-eyebrow">[${esc(c.tag)}] · ${c.recruiting?'Recrutement ouvert':'Sur invitation'}</span><h2>${esc(c.name)}</h2><p>${esc(c.description||'')}</p></div></div></div>${rankBlock(selected)}${metrics(selected)}<div class="clan-v22-tabs">${[['overview','Présentation'],['members','Membres'],['levels','Démons complétés'],['created','Créations']].map(([id,label])=>`<button class="${tab===id?'active':''}" data-clan-tab="${id}" type="button">${label}</button>`).join('')}</div>${tab==='members'?`<section class="clan-section"><h2>Membres du clan (${selected.members.length})</h2>${membersHtml||'<p class="muted">Aucun membre.</p>'}</section>`:tab==='levels'?`<section class="clan-section"><h2>Collection de démons du clan</h2><p class="small muted">Chaque niveau est compté une seule fois, même si plusieurs membres l'ont terminé. Les points principaux cumulés, eux, sont la somme des points individuels.</p><div class="clan-v22-split"><span>Main : ${selected.mainCount}</span><span>Extended : ${selected.extendedCount}</span><span>NLW : ${selected.nlw.length}</span><span>Créés ou publiés : ${selected.created.length}</span></div><div class="clan-v22-levels">${completedHtml||'<p class="muted">Aucune complétion.</p>'}</div>${finished.length>100?'<p class="small muted">Seuls les 100 premiers niveaux sont affichés pour garder la page rapide.</p>':''}</section>`:tab==='created'?`<section class="clan-section"><h2>Niveaux créés ou publiés</h2><p class="muted small">Niveaux dont un membre est crédité comme créateur ou éditeur. Les crédits ne rapportent pas automatiquement des points de clan.</p><div class="clan-v22-levels">${selected.created.map(d=>`<div class="clan-v22-level"><span class="clan-v22-position">#${esc(d.position||'—')}</span><a data-nav class="link" href="${url('demon',{id:d.id})}">${esc(d.name)}</a><span>${Number(d.position)<=150?'Top 150':'NLW'}</span></div>`).join('')||'<p class="muted">Aucun niveau créé ou publié connu.</p>'}</div></section>`:`<section class="clan-section"><h2>Vue d'ensemble</h2><div class="clan-v22-split"><span>Points de niveaux distincts : ${fmt(selected.levelPoints)}</span><span>Top 150 : ${selected.topCount}</span><span>Main : ${selected.mainCount}</span><span>Extended : ${selected.extendedCount}</span></div><h3>Dernières complétions des membres</h3>${latest.map(r=>`<div class="clan-v22-recent"><span>${esc(date(r.created_at)||'Date inconnue')}</span><a data-nav class="link" href="${url('stats',{player:key(r.player)})}">${esc(who(r.player))}</a><span>→</span><a data-nav class="link" href="${url('demon',{id:r.demon.id})}">${esc(r.demon.name)}</a></div>`).join('')||'<p class="muted">Aucune complétion.</p>'}</section>`}${actions(c)}</section>`;
 }
 const ownInvites=CLANS.pending(data,actor);
 const invitations=!LIVE?`<section class="clan-v22-panel"><h3>Mes invitations · ${ownInvites.length}</h3>${ownInvites.map(i=>{const c=CLAN_PLUS.clan(data,i.clan_id);return `<div class="clan-v22-queue"><span>Invitation de <b>${esc(c?.name||'?')}</b></span><div class="clan-actions"><button class="btn small" data-clan-action="accept" data-invite-id="${i.id}">Accepter</button><button class="btn subtle small" data-clan-action="decline" data-invite-id="${i.id}">Refuser</button></div></div>`;}).join('')||'<p class="muted small">Aucune invitation en attente.</p>'}</section>`:'';
 const formCreate=!LIVE&&!myClan?`<details class="clan-v22-create"><summary>+ Créer un clan</summary><form data-form="clanCreate" class="clan-v22-form"><label class="field">Nom du clan<input name="name" required minlength="3" maxlength="45"></label><label class="field">Tag (2 à 5 caractères)<input name="tag" required maxlength="5"></label><label class="field">Description<input name="description" maxlength="300"></label><label class="field">Couleur<input type="color" name="color" value="#287bba"></label><button class="btn">Créer mon clan</button></form></details>`:'';
 const sort=state.clanSort||'points';const sorter={points:(a,b)=>b.totalPoints-a.totalPoints,extremes:(a,b)=>b.topCount-a.topCount,hardest:(a,b)=>a.hardestPosition-b.hardestPosition,nlw:(a,b)=>b.nlwPoints-a.nlwPoints};
 const order=[...leaderBoard].sort((a,b)=>sorter[sort](a,b)||a.clan.id-b.clan.id).filter(x=>key(x.clan.name+' '+x.clan.tag+' '+x.clan.description).includes(key(state.clanSearch)));
 const cards=order.map((item,index)=>{const c=item.clan;return `<a data-nav class="clan-v22-rank-row" href="${url('clans',{id:c.id})}" data-clan-searchable="${esc(key(c.name+' '+c.tag+' '+c.description))}" style="--clan-accent:${esc(CLAN_PLUS.hex(c.color))}"><span class="clan-v22-rank">#${index+1}</span><span class="clan-v22-mark">${showPicture(c.logo_url,'clan-v22-tiny-logo')||esc(c.tag)}</span><span class="clan-v22-name"><strong>[${esc(c.tag)}] ${esc(c.name)}</strong><small>${item.members.length} membres · ${c.recruiting?'Candidatures ouvertes':'Sur invitation'}</small></span><span class="clan-v22-rank-metric">${sort==='points'?fmt(item.totalPoints)+' pts':sort==='nlw'?fmt(item.nlwPoints)+' NLW':sort==='extremes'?item.topCount+' démons':item.hardest?'#'+item.hardest.position:'—'}</span><span aria-hidden="true">→</span></a>`;}).join('');
 return v2Header('Classement des clans','Inspiré de l’AREDL : points cumulés, démons distincts, hardest, équipe et accomplissements.')+actorSelect+invitations+(myClan?`<div class="clan-v22-myclan">Mon clan : <a data-nav class="link" href="${url('clans',{id:myClan.id})}"><b>[${esc(myClan.tag)}] ${esc(myClan.name)}</b></a> <span class="tag">${roleTag(myMembership.role)}</span></div>`:'')+formCreate+`<section class="clan-section clan-v22-board"><div class="clan-v22-boardhead"><h2>Classement des clans · ${leaderBoard.length}</h2><label class="field">Rechercher<input id="clanSearch" placeholder="Nom ou tag…" value="${esc(state.clanSearch||'')}"></label></div><div class="clan-v22-sort">${[['points','Points Top 150'],['extremes','Démons complétés'],['hardest','Hardest'],['nlw','Points NLW']].map(([id,label])=>`<button class="${sort===id?'active':''}" data-clan-sort="${id}" type="button">${label}</button>`).join('')}</div><div id="clanRanking">${cards||'<p class="muted">Aucun clan.</p>'}</div><p class="small muted">Données de démo fictives. Rang de chaque catégorie calculé sur les clans visibles, avec les complétions enregistrées des membres actuels.</p></section></section>`;
}
function historyPage(){const lookup=new Map(catalog().map(d=>[Number(d.id),d]));const records=state.data.completions.map(r=>({...r,demon:lookup.get(Number(r.demon_id))})).filter(r=>r.demon&&r.demon.position<=150&&Number(r.progress)>=100).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));return v2Header('Historique des complétions · Top 150','Un flux chronologique des complétions, avec mise en valeur des niveaux Top 30 et Top 75.')+`<div class="v2-legend"><span class="hist-top30">Top 30 · rouge</span><span class="hist-top75">Top 31–75 · jaune</span><span>Top 76–150 · neutre</span></div><div class="v2-timeline">${records.map(r=>`<article class="timeline-record ${r.demon.position<=30?'top30':r.demon.position<=75?'top75':''}"><time>${date(r.created_at)}</time><div><a class="link" data-nav href="${url('stats',{player:key(r.player)})}">${esc(r.player)}</a> a terminé <a class="link" data-nav href="${url('demon',{id:r.demon.id})}"><b>#${r.demon.position} ${esc(r.demon.name)}</b></a>${r.demon.unrated?' <span class="tag">UNRATED</span>':''}</div>${http(r.video_url)?`<a href="${esc(http(r.video_url))}" rel="noopener noreferrer" target="_blank">Preuve ↗</a>`:''}</article>`).join('')||'<p class="empty">Aucune complétion Top 150.</p>'}</div></section>`;}
function renderBadgeSummary(){const p=ranked().filter(p=>p.has_account&&!p.hidden_from_stats);return `<div class="badge-summary">${['Faucheur de liste','Vérificateur','Amateur de difficulté'].map(n=>`<article><b>${n}</b><p>${p.filter(x=>x.autoBadges.some(a=>a.id===n)).length} joueur(s) ayant un palier</p></article>`).join('')}</div>`;}
function hallV2(){const items=state.data.hall_of_fame.filter(x=>x.is_published||state.staff).sort((a,b)=>(b.award_year||0)-(a.award_year||0));return v2Header('Hall of Fame','Les distinctions de la communauté, par année et catégorie.')+`<div class="hof-hero"><span>✦</span><div><small>ARCHIVES & PALMARÈS</small><h2>Les noms qui ont marqué la communauté</h2><p>Les titres historiques restent visibles indépendamment des classements actuels.</p></div></div><div class="hof-grid">${items.map(h=>`<article class="hof-item hof-premium"><div class="hof-year">✦ ${esc(h.award_year||'—')} · ${esc(h.category)}</div><h3>${esc(h.headline)}</h3><p><a class="link" data-nav href="${url('stats',{player:h.player_key})}">${esc(h.player_key)}</a></p><p>${esc(h.description||'')}</p>${http(h.source_url)?`<a class="link" target="_blank" rel="noopener noreferrer" href="${esc(http(h.source_url))}">Source ↗</a>`:''}</article>`).join('')||'<p class="empty">Aucune récompense.</p>'}</div></section>`;}
function showPageError(error){
 console.error('[DLFR] Erreur de démarrage / affichage :',error);
 const msg=esc(error?.message||String(error)||'Erreur inconnue');
 el.innerHTML=`<section class="center-panel startup-error" role="alert"><h2>La page n’a pas pu s’afficher</h2><p>Le chargement a été interrompu. Ce problème ne modifie pas tes données Supabase.</p><pre class="error-detail">${msg}</pre><div class="startup-actions"><a class="btn" href="?page=list&demo=1&reset=1">Réinitialiser la démo locale</a><a class="btn subtle" href="?page=list&demo=1">Essayer le mode démo</a></div><p class="small muted">Si le problème continue, vérifie que les fichiers <code>js/v2-core.js</code>, <code>js/v2-demo.js</code>, <code>js/community-unverified.js</code> et <code>js/demo-data.js</code> sont présents sur GitHub.</p></section>`;
}
function render(){if(!state.data)return;try{
 if(!V2?.decorate || !V2?.project || !UNVERIFIED?.classify || !CLANS?.apply || !CLAN_PLUS?.stats)throw Error('Fichier JavaScript V2 manquant ou version incohérente : réinstalle les scripts du pack V2.0.3.');
 const page=nav(),params=new URLSearchParams(location.search);if(page==='stats'&&params.has('player'))state.selectedPlayer=key(params.get('player'));const content=page==='stats'?statsPage():page==='demon'?demonPage():page==='news'?newsPage():page==='hall'?hallV2():page==='calculator'?calculatorPage():page==='unbeaten'?unbeatenPage():page==='achievements'?achievementsPage():page==='clans'?clansPage():page==='history'?historyPage():page==='admin'?adminPage():listPage();el.innerHTML=migrationNotice()+content;document.title=({list:'Demonlist',stats:'Statistiques',news:'Actualités',hall:'Hall of Fame',admin:'Modération',calculator:'Calculateur',unbeaten:'Non vérifiés',achievements:'Achievements',clans:'Clans',history:'Historique',demon:'Niveau'})[page]+' · DemonlistFrancophone';
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
async function handleForm(form){if(state.busy)return;state.busy=true;const submit=form.querySelector('[type="submit"],button:not([type])');if(submit)submit.disabled=true;
 try{
 const type=form.dataset.form, f=Object.fromEntries(new FormData(form).entries());
 if(type==='login'){
  const {data,error}=await db.auth.signInWithPassword({email:f.email,password:f.password});if(error)throw Error(error.message);
  state.session=data.session;await checkStaff();toast(state.staff?'Connecté en modérateur':'Connecté. Ce compte ne dispose pas de droits de modération.');render();return;
 }
 if(!state.staff)throw Error('Compte modérateur requis.');
 if(!LIVE&&state.demoRole==='nlw_editor'&&type!=='demon')throw Error('Le rôle NLW peut seulement ajouter des niveaux hors Top 150.');
 if(LIVE&&['frAchievement','clan','clanMember','safety','nlwStaff'].includes(type))throw Error('Nouvelle fonctionnalité en lecture seule : migration V2 Supabase non appliquée.');
 if(type==='demon'){
  const pos=+f.position;if(!LIVE&&state.demoRole==='nlw_editor'&&pos<=150)throw Error('Un modérateur NLW ne peut gérer que les positions 151 et au-delà.');
  if(state.data.demons.some(d=>+d.position===pos&&!d.unrated))throw Error('Un niveau occupe déjà cette position.');
  await save('demons',{position:pos,name:plain(f.name),publisher:plain(f.publisher),verifier:plain(f.verifier),creator:plain(f.creator),requirement:+f.requirement,legacy:!!f.legacy,legacy_since:f.legacy_since||null,unrated:!!f.unrated,unrated_position:f.unrated?pos:null,difficulty:'Extreme Demon'});
 }else if(type==='news'){
  let image_url=plain(f.image_url);
  const old=state.data.news_items.find(x=>String(x.id)===String(f.news_id));
  if(old&&!image_url)image_url=old.image_url||'';
  const file=form.querySelector('[name="image_file"]')?.files?.[0];
  if(file)image_url=await uploadNewsImage(file);
  if(image_url&&!imageLink(image_url))throw Error('URL d’image invalide. Utilise un lien http(s).');
  if(f.video_url&&!http(f.video_url))throw Error('URL de vidéo invalide.');
  const item={headline:plain(f.headline),body:plain(f.body),player_name:plain(f.player_name)||null,image_url:image_url||null,video_url:plain(f.video_url)||null,is_published:f.is_published==='on'};
  if(!LIVE){item.category=f.category;item.is_pinned=f.is_pinned==='on';}
  if(old){item.id=old.id;await save('news_items',item,{upsert:true,on:['id']});}
  else await save('news_items',item);
  state.editingNews=null;
 }
 else if(type==='frAchievement'){const rows=state.data.fr_achievements;rows.push({id:Math.max(0,...rows.map(x=>x.id))+1,...f,created_at:new Date().toISOString()});saveDemo();auditV2('CREATE','Achievement FR : '+f.title);}
 else if(type==='clan'){const rows=state.data.clans;if(rows.some(c=>key(c.tag)===key(f.tag)))throw Error('Ce tag de clan existe déjà.');rows.push({id:Math.max(0,...rows.map(x=>x.id))+1,...f});saveDemo();auditV2('CREATE','Clan : '+f.name);}
 else if(type==='clanMember'){state.data.clan_members=state.data.clan_members.filter(x=>x.player_key!==f.player_key);state.data.clan_members.push({player_key:f.player_key,clan_id:+f.clan_id,role:f.role});saveDemo();auditV2('MEMBER',f.player_key);}
 else if(type==='nlwStaff'){if(!state.data.nlw_staff.some(x=>x.player_key===f.player_key))state.data.nlw_staff.push({player_key:f.player_key,role:'nlw_editor'});saveDemo();auditV2('NLW_STAFF',f.player_key);}
 else if(type==='safety'){const pp=state.data.player_profiles.find(x=>x.player_key===f.player_key);if(f.action==='remove_banner'){if(pp)pp.banner_url='';}else if(f.action==='temp_ban'){const player=state.data.players.find(x=>x.player_key===f.player_key);if(player)player.demo_suspended_until=new Date(Date.now()+Math.max(1,+f.days)*86400000).toISOString();}else if(f.action==='unban'){const player=state.data.players.find(x=>x.player_key===f.player_key);if(player)player.demo_suspended_until=null;}const entry={player_key:f.player_key,action:f.action,reason:f.reason,until:f.action==='temp_ban'?new Date(Date.now()+Math.max(1,+f.days)*86400000).toISOString():null};state.data.player_sanctions.push(entry);saveDemo();auditV2('SANCTION',f.player_key+' : '+f.action);}
 else if(type==='title')await save('profile_titles',{label:f.label,description:f.description||null,color:f.color,is_active:true});
 else if(type==='award')await save('player_profile_titles',{player_key:f.player_key,title_id:+f.title_id},{upsert:true,on:['player_key','title_id']});
 else if(type==='profile')await save('player_profiles',{player_key:f.player_key,bio:f.bio,banner_url:f.banner_url,avatar_url:f.avatar_url,join_year:f.join_year?+f.join_year:null,favorite_level:f.favorite_level,current_goal:f.current_goal,youtube_url:f.youtube_url,twitch_url:f.twitch_url,social_url:f.social_url,highlight_1:f.highlight_1,highlight_2:f.highlight_2,highlight_3:f.highlight_3},{upsert:true,on:['player_key']});
 else if(type==='hall')await save('hall_of_fame',{player_key:f.player_key,headline:f.headline,description:f.description,award_year:f.award_year?+f.award_year:null,category:f.category,source_url:f.source_url||null,is_published:true});
 else if(type==='visibility'){
  const p=state.data.players.find(x=>x.player_key===f.player_key);if(!p)throw Error('Ce joueur n’est pas un compte importé. Ajoute son profil à la table players pour modifier sa visibilité.');
  await save('players',{...p,hidden_from_stats:f.hidden_from_stats==='true'},{upsert:true,on:['player_key']});
 }
 if(LIVE){state.data=Object.fromEntries(tables.map((t,i)=>[t,state.data[t]]));for(const t of [type==='demon'?'demons':type==='news'?'news_items':type==='title'?'profile_titles':type==='award'?'player_profile_titles':type==='profile'?'player_profiles':type==='hall'?'hall_of_fame':'players','community_audit_log'])state.data[t]=await readAll(t);}
 toast('Modification enregistrée'+(LIVE?' dans Supabase':' en local')+' !');render();
 }catch(err){toast('Erreur : '+err.message);}finally{state.busy=false;if(submit)submit.disabled=false;}
}
function fillNewsEditor(id){const n=state.data.news_items.find(x=>String(x.id)===String(id));const form=document.querySelector('[data-form="news"]');if(!n||!form)return;
 for(const k of ['news_id','headline','body','player_name','image_url','video_url'])if(form.elements[k])form.elements[k].value=k==='news_id'?n.id:(n[k]||'');
 if(form.elements.category)form.elements.category.value=getNewsCategory(n);
 if(form.elements.is_pinned)form.elements.is_pinned.checked=!!n.is_pinned;
 if(form.elements.is_published)form.elements.is_published.checked=!!n.is_published;
 state.editingNews=n.id;updateNewsPreview(form);form.scrollIntoView({behavior:'smooth',block:'start'});
}
function fillProfileEditor(){const form=document.querySelector('[data-form="profile"]');if(!form)return;
 const p=state.data.player_profiles.find(x=>x.player_key===form.elements.player_key.value)||{};
 for(const k of ['bio','avatar_url','banner_url','join_year','favorite_level','current_goal','youtube_url','twitch_url','social_url','highlight_1','highlight_2','highlight_3'])if(form.elements[k])form.elements[k].value=p[k]??'';
}
function updateNewsPreview(form){if(!form)return;const holder=$('newsDraftPreview');if(!holder)return;
 const headline=plain(form.elements.headline.value)||'Titre de l’actualité';const body=plain(form.elements.body.value)||'Le contenu apparaîtra ici…';const media=plain(form.elements.image_url.value);
 holder.innerHTML=`<div class="news-meta"><span class="news-category">${esc(form.elements.category?.value||'Annonce')}</span>${form.elements.is_pinned?.checked?'<span class="news-pin">★ À la une</span>':''}</div><h4>${esc(headline)}</h4><p class="news-body">${esc(body.slice(0,350))}</p>${media&&imageLink(media)?`<img class="news-preview-img" src="${esc(imageLink(media))}" alt="Aperçu">`:''}`;
}
async function importDemo(file){if(!file||LIVE)return;try{if(file.size>3*1024*1024)throw Error('Fichier trop volumineux (3 Mo maximum).');const d=JSON.parse(await file.text());if(!d||typeof d!=='object')throw Error('JSON invalide.');for(const t of tables){if(!Array.isArray(d[t]))throw Error('Table manquante : '+t);if(d[t].length>5000)throw Error('Trop de lignes : '+t);}state.data={...d,community_audit_log:Array.isArray(d.community_audit_log)?d.community_audit_log:[]};for(const t of v2Tables)if(!Array.isArray(state.data[t]))state.data[t]=[];saveDemo();toast('Démo importée');render();}catch(e){toast('Import impossible : '+e.message);}}
function setTheme(theme){const t=['light','dark','midnight','autumn'].includes(theme)?theme:'light';document.documentElement.classList.remove('dark','midnight','autumn');if(t!=='light')document.documentElement.classList.add(t);$('themeSelect').value=t;try{localStorage.setItem('demonlist-theme',t);}catch{}}
function refreshUnrated(){document.documentElement.classList.toggle('unrated-mode',state.unrated);const button=$('unratedToggle');button.textContent=state.unrated?'◈ UNRATED ON':'◈ UNRATED OFF';button.setAttribute('aria-pressed',String(state.unrated));}
function bootEvents(){
 document.addEventListener('click',async(ev)=>{const a=ev.target.closest('a[data-nav]');if(a){ev.preventDefault();const link=new URL(a.href);history.pushState({},'',link.search);state.keyword='';render();window.scrollTo(0,0);return;}
 const list=ev.target.closest('[data-list]');if(list){state.list=list.dataset.list;state.keyword='';render();return;}
 const p=ev.target.closest('[data-player]');if(p){state.selectedPlayer=p.dataset.player;history.replaceState({},'',url('stats',{player:state.selectedPlayer}));const chosen=getPlayer(state.selectedPlayer);$('profileContent').innerHTML=statProfile(chosen);document.querySelectorAll('.rank-item').forEach(x=>x.classList.toggle('selected',x.dataset.player===state.selectedPlayer));return;}
 const route=ev.target.closest('[data-route]');if(route){go(route.dataset.route);return;}
 const st=ev.target.closest('[data-stats-tab]');if(st){state.statsTab=st.dataset.statsTab;state.keyword='';render();return;}
 const pt=ev.target.closest('[data-profile-tab]');if(pt){state.profileTab=pt.dataset.profileTab;const chosen=getPlayer(state.selectedPlayer);if($('profileContent'))$('profileContent').innerHTML=statProfile(chosen);return;}
 const nf=ev.target.closest('[data-news-filter]');if(nf){state.newsFilter=nf.dataset.newsFilter;render();return;}
 const ad=ev.target.closest('[data-admin-tab]');if(ad){state.adminTab=ad.dataset.adminTab;render();return;}
 const ed=ev.target.closest('[data-edit-news]');if(ed){if(!state.staff)return;state.adminTab='news';go('admin');fillNewsEditor(ed.dataset.editNews);return;}
 const tn=ev.target.closest('[data-toggle-news]');if(tn){if(!state.staff)return;const item=state.data.news_items.find(x=>String(x.id)===tn.dataset.toggleNews);if(item){try{await save('news_items',{...item,is_published:!item.is_published},{upsert:true,on:['id']});if(LIVE)state.data.news_items=await readAll('news_items');toast('Statut actualisé');render();}catch(e){toast('Erreur : '+e.message);}}return;}
 const clanSort=ev.target.closest('[data-clan-sort]');if(clanSort){state.clanSort=clanSort.dataset.clanSort;render();return;}
 const clanTab=ev.target.closest('[data-clan-tab]');if(clanTab){state.clanDetailTab=clanTab.dataset.clanTab;render();return;}
 const clanAction=ev.target.closest('[data-clan-action]');if(clanAction){handleClanAction(clanAction);return;}
 const act=ev.target.closest('[data-action]');if(!act)return;
 if(act.dataset.action==='moreUnbeaten'){state.unbeatLimit+=120;const results=$('unbeatenResults');if(results)results.innerHTML=unbeatenEntriesHTML();return;}
 if(act.dataset.action==='clearCalc'){state.calcDemons=[];render();return;}
 if(act.dataset.action==='previewDemo'){
  try{sessionStorage.setItem('dlfr-preview-mode','demo');}catch{}
  location.reload();return;
 }
 if(act.dataset.action==='previewLive'){
  try{sessionStorage.removeItem('dlfr-preview-mode');}catch{}
  location.reload();return;
 }
 if(act.dataset.action==='demoStaff'&&!LIVE){state.staff=true;render();}
 if(act.dataset.action==='cancelNews'){state.editingNews=null;const form=document.querySelector('[data-form="news"]');if(form){form.reset();form.elements.news_id.value='';updateNewsPreview(form);}return;}
 if(act.dataset.action==='exportDemo'&&!LIVE){const blob=new Blob([JSON.stringify(state.data,null,2)],{type:'application/json'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='demonlist-demo-v12.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);return;}
 if(act.dataset.action==='resetDemo'&&!LIVE){try{localStorage.removeItem('demonlist-demo-v1');}catch{}state.data=demoLoad();toast('Démo réinitialisée');render();}
 if(act.dataset.action==='logout'&&LIVE){await db.auth.signOut();state.session=null;state.staff=false;render();}
 });
 document.addEventListener('input',ev=>{
 if(ev.target.id==='clanSearch'){state.clanSearch=ev.target.value;document.querySelectorAll('[data-clan-searchable]').forEach(r=>r.hidden=!r.dataset.clanSearchable.includes(key(state.clanSearch)));}
 if(ev.target.id==='unbeatenSearch'){state.unbeatSearch=ev.target.value;state.unbeatLimit=120;const results=$('unbeatenResults');if(results)results.innerHTML=unbeatenEntriesHTML();}
 if(ev.target.id==='newsSearch'){state.newsSearch=ev.target.value;const items=state.data.news_items.filter(n=>(n.is_published||state.staff)&&(state.newsFilter==='all'||getNewsCategory(n)===state.newsFilter)&&`${key(n.headline)} ${key(n.body)} ${key(n.player_name)}`.includes(key(state.newsSearch)));$('newsItems').innerHTML=newsItemsHTML(items.sort((a,b)=>+(!!b.is_pinned)-+(!!a.is_pinned)||new Date(b.created_at)-new Date(a.created_at)));}
 if(ev.target.closest('[data-form="news"]'))updateNewsPreview(ev.target.closest('form'));
 if(ev.target.id==='calcSearch'){const q=key(ev.target.value);document.querySelectorAll('.v2-check-level').forEach(x=>x.hidden=!key(x.textContent).includes(q));}
 if(ev.target.id==='demonSearch'){state.keyword=ev.target.value;const d=catalog().filter(x=>state.list==='legacy'?x.legacy:state.list==='nlw'?x.position>150:x.position<=150);$('demonItems').innerHTML=cardsHTML(d.filter(x=>key(x.name).includes(key(state.keyword))));}
 if(ev.target.id==='playerSearch'){state.keyword=ev.target.value;const ppl=ranked().filter(x=>!x.hidden_from_stats&&(state.country==='MONDE'||x.country_code===state.country)&&key(x.display_name||x.username).includes(key(state.keyword)));$('rankList').innerHTML=rankRows(ppl,getPlayer(state.selectedPlayer));}
 });
 document.addEventListener('change',ev=>{
 if(ev.target.id==='countryFilter'){state.country=ev.target.value;state.keyword='';render();}
 if(ev.target.id==='recordsYear'){state.statsYear=ev.target.value;$('profileContent').innerHTML=statProfile(getPlayer(state.selectedPlayer));}
 if(ev.target.id==='compareA'){state.selectedPlayer=ev.target.value;render();}
 if(ev.target.id==='compareB'){state.comparePlayer=ev.target.value;render();}
 if(ev.target.id==='profileEditorPlayer')fillProfileEditor();
 if(ev.target.id==='calcPlayer'){state.calcPlayer=ev.target.value;state.calcDemons=[];render();}
 if(ev.target.matches('[data-calc-demon]')){const id=+ev.target.dataset.calcDemon;state.calcDemons=ev.target.checked?[...new Set([...state.calcDemons,id])]:state.calcDemons.filter(x=>x!==id);render();}
 if(ev.target.id==='clanDemoActor'&&!LIVE){state.demoActor=ev.target.value;render();return;}
 if(ev.target.id==='demoRole'){state.demoRole=ev.target.value;state.adminTab=state.demoRole==='nlw_editor'?'levels':'overview';render();}
 if(ev.target.id==='importDemo')importDemo(ev.target.files?.[0]);
 if(ev.target.closest('[data-form="news"]'))updateNewsPreview(ev.target.closest('form'));
});
 document.addEventListener('submit',ev=>{if(ev.target.matches('[data-form="clanCreate"], [data-form="clanInvite"], [data-form="clanRequest"], [data-form="clanEdit"]')){ev.preventDefault();handleClanForm(ev.target);return;}if(ev.target.matches('[data-form]')){ev.preventDefault();handleForm(ev.target);}});
 document.querySelectorAll('.nav-links a,.brand').forEach(a=>a.addEventListener('click',ev=>{ev.preventDefault();go(a.dataset.link||'list');}));
 $('themeSelect').addEventListener('change',e=>setTheme(e.target.value));
 $('unratedToggle').addEventListener('click',()=>{state.unrated=!state.unrated;state.calcDemons=[];refreshUnrated();render();});
 window.addEventListener('popstate',()=>{state.keyword='';render();});
 try{setTheme(localStorage.getItem('demonlist-theme')||'light');}catch{}refreshUnrated();
}
try{
 bootEvents();
 loadCommunityExcel().catch(showPageError);
 load().catch(showPageError);
}catch(error){showPageError(error);}
})();

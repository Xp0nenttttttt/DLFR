/* DemonlistFrancophone — navigateur seul (aucun PHP). Moteur de la première migration. */
(() => {
'use strict';
const C = window.DEMONLIST_CONFIG || {};
const HAS_SUPABASE = !!(C.supabaseUrl && C.supabasePublishableKey);
// Le mode aperçu ne modifie pas Supabase : les données fictives restent dans le navigateur.
const FORCE_PREVIEW = (()=>{try{return sessionStorage.getItem('dlfr-preview-mode')==='demo';}catch{return false;}})();
const LIVE = HAS_SUPABASE && !FORCE_PREVIEW;
const tables = ['site_settings','players','demons','completions','news_items','profile_titles','player_profile_titles','player_profiles','hall_of_fame','player_stat_snapshots','demon_position_history'];
let db = null, state = { data:null, staff:false, session:null, country:'MONDE', selectedPlayer:'', list:'main', keyword:'', busy:false };
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
const demoLoad=()=>{const d=JSON.parse(JSON.stringify(window.DEMONLIST_DEMO));try{const saved=localStorage.getItem('demonlist-demo-v1');if(saved){const obj=JSON.parse(saved);if(obj && typeof obj==='object') for(const t of tables)if(Array.isArray(obj[t])) d[t]=obj[t];}}catch{};return d;};
const saveDemo=()=>{if(!LIVE)try{localStorage.setItem('demonlist-demo-v1',JSON.stringify(state.data));}catch{}};
async function readAll(name){let out=[],from=0;while(true){const {data,error}=await db.from(name).select('*').range(from,from+999);if(error)throw Error(`${name} : ${error.message}`);out.push(...data);if(data.length<1000)break;from+=1000;if(from>=60000)throw Error(`Limite de lecture atteinte pour ${name}; pagination serveur à prévoir`);}return out;}
async function load(){
 if(!LIVE){state.data=demoLoad();$('sourceLabel').textContent=HAS_SUPABASE?'Aperçu local (Supabase non modifié)':'Démonstration locale';render();return;}
 if(!window.supabase){el.innerHTML='<div class="center-panel"><h2>Supabase indisponible</h2><p>Le client Supabase n’a pas pu être chargé. Vérifie ta connexion.</p><button type="button" class="btn" data-action="previewDemo">Voir la démo locale</button></div>';return;}
 db=window.supabase.createClient(C.supabaseUrl,C.supabasePublishableKey);
 try{
   const result=await Promise.all(tables.map(readAll));state.data=Object.fromEntries(tables.map((t,i)=>[t,result[i]]));
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
 if(p<1||p>num(s.extended_limit)||num(progress)<required||(demon.legacy&&!s.legacy_scores))return 0;
 const base=scoreBase(p)*num(s.top1_points)/scoreBase(1);
 return +progress===100?base:(base*Math.pow(5,(+progress-required)/Math.max(1,100-required)))/10;
}
function ranked(){
 const d=state.data,byId=Object.fromEntries(d.demons.map(v=>[v.id,v]));
 const completionScoreByPlayer = new Map();
 const people=new Map(d.players.map(p=>[p.player_key,{...p,total_records:0,total_completions:0,main:[],extended:[],beyond:[],legacy:[],progress:[],created:[],published:[],verified:[],pointsComputed:num(p.bonus_points),hardest:null}]));
 const ensure=(name)=>{const k=key(name);if(!k)return null;if(!people.has(k))people.set(k,{player_key:k,username:name,display_name:name,country_code:'',has_account:false,hidden_from_stats:false,points:0,bonus_points:0,pointsComputed:0,total_records:0,total_completions:0,main:[],extended:[],beyond:[],legacy:[],progress:[],created:[],published:[],verified:[],hardest:null});return people.get(k);};
 for(const demon of d.demons){for(const [field,dest] of [['creator','created'],['publisher','published'],['verifier','verified']]){
   const names=field==='creator'?[demon.creator,...plain(demon.creator_more).split(',')]:[demon[field]];
   for(const name of names){const player=ensure(name);if(player&&!player[dest].some(x=>x.id===demon.id))player[dest].push(demon);}
 }}
 for(const r of d.completions){const player=ensure(r.player),demon=byId[r.demon_id];if(!player||!demon)continue;
    player.total_records++;if(+r.progress>=100)player.total_completions++;
    const points=score(demon,r.progress),rankDemon=+demon.position<=+cfg().main_limit?'main':+demon.position<=+cfg().extended_limit?'extended':'beyond';
    if(r.progress>=100)player[rankDemon].push(demon);else player.progress.push({demon,progress:r.progress});
    if(demon.legacy&&r.progress>=100)player.legacy.push(demon);
    player.pointsComputed+=points;
    if(!completionScoreByPlayer.has(player.player_key))completionScoreByPlayer.set(player.player_key,new Map());
    completionScoreByPlayer.get(player.player_key).set(demon.id,points);
    if(r.progress>=100 && (!player.hardest || +demon.position<+player.hardest.position))player.hardest=demon;
 }
 // Comme dans le PHP original : vérification = points 100%, moins les points déjà obtenus sur ce niveau.
 for(const demon of d.demons){
  if(demon.position<1 || demon.position>cfg().extended_limit || (demon.legacy&&!cfg().legacy_scores))continue;
  const byUserId=d.players.find(p=>num(p.legacy_id)>0 && num(p.legacy_id)===num(demon.verifier_user_id));
  const verifier=people.get(byUserId?.player_key||key(demon.verifier));
  if(!verifier || !verifier.has_account)continue;
  const existing=completionScoreByPlayer.get(verifier.player_key)?.get(demon.id)||0;
  verifier.pointsComputed+=Math.max(0,score(demon,100)-existing);
 }
 const result=[...people.values()].map(p=>({...p,score:LIVE?p.pointsComputed:num(p.points),pointsComputed:+p.pointsComputed.toFixed(2)}));
 result.sort((a,b)=>b.score-a.score||a.display_name.localeCompare(b.display_name));
 let pos=0;for(const p of result)if(!p.hidden_from_stats){p.rank=++pos;} else p.rank=null;
 return result;
}
function getPlayer(value){return ranked().find(p=>p.player_key===key(value))||null;}
function cardsHTML(demons){if(!demons.length)return '<div class="paper empty">Aucun niveau dans cette catégorie.</div>';
 return demons.map(d=>{const p=num(d.position),req=+d.requirement||100,isRank=p<=cfg().extended_limit;
   const pills=`<div class="level-status">${p>cfg().extended_limit?'<span class="level-badge outside">Hors Top 150 · 0 pt</span>':''}${d.legacy?'<span class="level-badge legacy">Legacy</span>':''}</div>`;
   const thumb=http(d.thumbnail_url),image=thumb?`<img loading="lazy" class="demon-thumb" src="${esc(thumb)}" alt="Miniature de ${esc(d.name)}">`:(String(d.thumbnail_url||'').startsWith('assets/')?`<img class="demon-thumb" src="${esc(d.thumbnail_url)}" alt="Miniature de ${esc(d.name)}">`:`<div class="demon-thumb faux-thumb">${esc(d.name)}</div>`);
   return `<article class="paper list-entry"><a href="${url('demon',{id:d.id})}" data-nav>${image}</a><div><h2><a href="${url('demon',{id:d.id})}" data-nav style="text-decoration:none">#${p} - ${esc(d.name)}</a></h2><div class="entry-meta">publié par <b>${esc(d.publisher||'-')}</b>, vérifié par <b>${esc(d.verifier||'-')}</b></div><div class="points ${isRank?'':'no-points'}">${isRank&&!d.legacy?`${fmt(score(d,req))} (${req}%) — ${fmt(score(d,100))} (100%) points`:d.legacy&&p<=cfg().extended_limit?'Liste héritée · 0 point':'Hors Top 150 · 0 point'}</div>${(p>cfg().extended_limit||d.legacy)?pills:''}</div></article>`;
 }).join('');}
function listPage(){const d=state.data, s=cfg(),nav=['main','extended','beyond','legacy'],labels=[`Main List`,`Extended List`,`Hors Top ${s.extended_limit}`,`Legacy List`];
 const sLabel=state.list;
 let demons=[...d.demons].sort((a,b)=>a.position-b.position);
 demons=demons.filter(x=>sLabel==='legacy'?x.legacy:sLabel==='main'?x.position<=s.main_limit&&!x.legacy:sLabel==='extended'?x.position>s.main_limit&&x.position<=s.extended_limit&&!x.legacy:x.position>s.extended_limit);
 const top=`<div class="list-tabs">${nav.map((x,i)=>`<button type="button" class="${sLabel===x?'active':''}" data-list="${x}">${esc(labels[i])}</button>`).join('')}</div>`;
 return `${templateNotice()}${top}<div class="page-columns"><section><div class="center-panel"><h1>Geometry Dash Demonlist</h1><p>La liste principale de Demonlist avec les niveaux les plus difficiles classés du jeu.</p><label class="filterbox"><span aria-hidden="true">⌕</span><input id="demonSearch" type="search" placeholder="Filtrer les démons affichés..." value="${esc(state.keyword)}" autocomplete="off"></label></div><div id="demonItems">${cardsHTML(demons.filter(x=>key(x.name).includes(key(state.keyword))))}</div></section><aside class="right-side"><div class="info-panel right-panel"><h2>Éditeurs de liste</h2><p>Contactez un éditeur si vous avez un problème avec la liste ou si vous souhaitez effectuer un changement spécifique.</p><div class="staff-name">🇫🇷 YOMAYOCB</div><div class="staff-name">🇫🇷 SOFFAX</div><h2>Assistants de liste</h2><p>Contactez ces personnes pour les questions concernant le rejet d'un record.</p><p>AUCUN ASSISTANT DE LISTE POUR LE MOMENT.</p></div><div class="info-panel right-panel"><h2>Directives</h2><p>Seules les runs légitimes, non éditées et avec des preuves claires sont acceptées.</p><button class="btn" data-route="news">Actualités de la liste</button></div><div class="info-panel right-panel"><h2>Soumettre un record</h2><p>La soumission sera activée après migration de l'authentification.</p><button class="btn subtle" disabled>Indisponible en V1</button></div></aside></div>`;
}
function completionLinks(levels){return levels.length?levels.sort((a,b)=>a.position-b.position).map(d=>`<a class="link" href="${url('demon',{id:d.id})}" data-nav>#${esc(d.position)} ${esc(d.name)}</a>`).join(' - '):'<span class="muted">Aucun</span>';}
function titleHTML(p){return state.data.player_profile_titles.filter(a=>a.player_key===p.player_key).map(a=>state.data.profile_titles.find(t=>t.id===a.title_id && t.is_active)).filter(Boolean).map(t=>`<span class="tag user-title" style="background:${/^#[0-9a-f]{6}$/i.test(t.color)?t.color:'#287bba'}" title="${esc(t.description||'')}">${esc(t.label)}</span>`).join('');}
function statProfile(p){if(!p)return '<div class="stats-profile empty">Sélectionne un joueur.</div>';
 const profile=state.data.player_profiles.find(v=>v.player_key===p.player_key)||{};
 const snapshots=state.data.player_stat_snapshots.filter(s=>s.player_key===p.player_key).sort((a,b)=>a.snapshot_day.localeCompare(b.snapshot_day));
 const recs=state.data.completions.filter(c=>key(c.player)===p.player_key);
 const monthly={};for(const r of recs){if(+r.progress<100)continue;const m=plain(r.created_at).slice(0,7);if(m)monthly[m]=(monthly[m]||0)+1;}
 const rankedStr=p.rank?`#${p.rank}`:'—';
 const banner=imageLink(profile.banner_url),avatar=imageLink(profile.avatar_url);
 const recent=recs.filter(c=>+c.progress===100).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,5);
 const demonLookup=new Map(state.data.demons.map(d=>[+d.id,d]));
 const profileFacts=[['Depuis',profile.join_year],['Niveau favori',profile.favorite_level],['Objectif',profile.current_goal]]
  .filter(([_,v])=>plain(v)).map(([l,v])=>`<div class="profile-fact"><strong>${esc(l)}</strong><span>${esc(v)}</span></div>`).join('');
 const socials=[['YouTube',profile.youtube_url],['Twitch',profile.twitch_url],['Lien personnel',profile.social_url]].filter(([_,v])=>http(v))
  .map(([n,v])=>`<a class="social-link" target="_blank" rel="noopener noreferrer" href="${esc(http(v))}">${n} ↗</a>`).join('');
 return `<div class="stats-profile"><div class="profile-hero">${banner?`<img class="profile-cover-img" src="${esc(banner)}" alt="" aria-hidden="true">`:''}
    <div class="profile-hero-inner">${avatar?`<img class="profile-avatar" src="${esc(avatar)}" alt="Avatar de ${esc(p.display_name||p.username)}">`:`<div class="profile-avatar profile-avatar-fallback" aria-hidden="true">${esc((p.display_name||p.username||'?').slice(0,1).toUpperCase())}</div>`}
      <div class="profile-hero-copy"><span class="profile-pretitle">Profil joueur · ${p.has_account?'Compte':'Sans compte'}</span><strong>${flag(p.country_code)} ${esc(p.display_name||p.username)}</strong><span>${p.hardest?'Hardest : '+esc(p.hardest.name):'Aucun hardest connu'}</span></div>
    </div></div>
 <h2 class="player-title">${flag(p.country_code)} ${esc(p.display_name||p.username)} ${!p.has_account?'<span class="tag">Sans compte</span>':''}</h2><div style="text-align:center;margin-bottom:8px">${titleHTML(p)}</div>
 <div class="statboxes">${box('Classement Demonlist',rankedStr)}${box('Points totaux',fmt(p.score))}${box('Démon le plus difficile',p.hardest?`#${p.hardest.position} ${p.hardest.name}`:'Aucun')}</div>
 <div class="statboxes two">${box('Contributions',`${p.created.length} Créés, ${p.published.length} Publiés, ${p.verified.length} Vérifiés`)}${box('Statistiques Demonlist',`${p.main.length} Principale, ${p.extended.length} Étendue, ${p.legacy.length} Héritée`)}</div>
 ${profile.bio?`<div class="profile-bio">${esc(profile.bio)}</div>`:''}
  ${profileFacts?`<div class="profile-facts">${profileFacts}</div>`:''}
  ${socials?`<div class="profile-socials">${socials}</div>`:''}
  <div class="profile-section"><h3>Dernières complétions</h3>${recent.length?`<div class="recent-completions">${recent.map(r=>{const dem=demonLookup.get(+r.demon_id);return `<div class="recent-item"><span>✓</span><a class="link" href="${url('demon',{id:r.demon_id})}" data-nav>${esc(dem?.name||'Niveau inconnu')}</a><time>${date(r.created_at)}</time></div>`;}).join('')}</div>`:'<p class="muted">Aucun record daté.</p>'}</div>
 <div class="profile-section"><h3>Liste principale complétée</h3><p>${completionLinks(p.main)}</p></div><div class="profile-section"><h3>Liste étendue complétée</h3><p>${completionLinks(p.extended)}</p></div><div class="profile-section"><h3>Hors classement complété</h3><p>${completionLinks(p.beyond)}</p></div><div class="profile-section"><h3>Liste héritée complétée</h3><p>${completionLinks(p.legacy)}</p></div>
 ${[['Démons créés',p.created],['Démons publiés',p.published],['Démons vérifiés',p.verified]].map(([t,a])=>`<div class="profile-section"><h3>${t}</h3><p>${completionLinks(a)}</p></div>`).join('')}
 <div class="profile-section"><h3>Progression sur</h3><p>${p.progress.length?p.progress.map(r=>esc(r.demon.name)+' : '+r.progress+'%').join(' · '):'Aucun'}</p></div>
 <div class="profile-section"><h3>Progression historique</h3>${lineGraph(snapshots)}<p class="muted small">Les instantanés sont enregistrés uniquement à partir de leur activation.</p></div>
 <div class="profile-section"><h3>Complétions par mois</h3>${barGraph(monthly)}</div>
 ${[profile.highlight_1,profile.highlight_2,profile.highlight_3].filter(Boolean).length?`<div class="profile-section"><h3>Accomplissements mis en avant</h3><p>${[profile.highlight_1,profile.highlight_2,profile.highlight_3].filter(Boolean).map(x=>`<span class="tag">★ ${esc(x)}</span>`).join('')}</p></div>`:''}
 
 </div>`;
}
function lineGraph(data){if(data.length<2)return '<p class="empty small">Aucun historique disponible pour le moment.</p>';const max=Math.max(...data.map(x=>+x.points),1),min=Math.min(...data.map(x=>+x.points)),den=Math.max(1,max-min);const coords=data.map((x,i)=>[24+i*480/Math.max(1,data.length-1),135-(+x.points-min)/den*110]);return `<div class="chart-box"><svg viewBox="0 0 540 160" role="img" aria-label="Évolution des points"><path d="M20 135H515" stroke="#bbc7d3"/><path d="${coords.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')}" fill="none" stroke="#167fbe" stroke-width="3"/>${coords.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="3.2" fill="#167fbe"/>`).join('')}<text x="20" y="14" font-size="11" fill="currentColor">${fmt(max)} pts</text><text x="22" y="155" font-size="10" fill="currentColor">${esc(data[0].snapshot_day)}</text><text x="420" y="155" font-size="10" fill="currentColor">${esc(data.at(-1).snapshot_day)}</text></svg></div>`;}
function barGraph(monthly){const keys=Object.keys(monthly).sort().slice(-12);if(!keys.length)return '<p class="empty small">Pas de dates de records renseignées.</p>';const mx=Math.max(...keys.map(k=>monthly[k]));return `<div class="chart-box"><div style="display:flex;align-items:flex-end;gap:6px;min-height:115px">${keys.map(k=>`<div style="flex:1;text-align:center"><div style="background:#1783c1;height:${Math.max(4,85*monthly[k]/mx)}px" title="${esc(k)} : ${monthly[k]} complétion(s)"></div><span style="font-size:9px">${esc(k.slice(5))}</span></div>`).join('')}</div></div>`;}
function statsPage(){const users=ranked().filter(p=>!p.hidden_from_stats);const countries=['MONDE',...new Set(users.map(p=>p.country_code).filter(Boolean))].sort((a,b)=>a==='MONDE'?-1:b==='MONDE'?1:a.localeCompare(b));
 const filtered=users.filter(p=>(state.country==='MONDE'||p.country_code===state.country)&&key(p.display_name||p.username).includes(key(state.keyword)));
 const chosen=getPlayer(state.selectedPlayer)||filtered[0]||users[0];if(chosen)state.selectedPlayer=chosen.player_key;
 return `${templateNotice()}<section class="paper stats-main"><div class="center-panel" style="box-shadow:none;border:0;padding:13px 0 4px"><h1>Statistiques</h1><p>Comparez les joueurs par points, complétions, démons les plus difficiles et contributions.</p></div><div class="switch-tabs"><button class="active" type="button">Joueurs</button><button type="button" disabled title="Statistiques des pays : prochaine étape">Pays (à venir)</button></div><div class="stats-grid"><div class="ranking-panel"><div class="kicker">International</div><select id="countryFilter" aria-label="Filtrer par pays">${countries.map(c=>`<option value="${esc(c)}" ${c===state.country?'selected':''}>${c==='MONDE'?'MONDE - International':flag(c)+' '+esc(c)}</option>`).join('')}</select><label class="filterbox" style="margin-top:9px"><span>⌕</span><input type="search" id="playerSearch" placeholder="Rechercher un joueur…" value="${esc(state.keyword)}"></label><div class="rank-list" id="rankList">${rankRows(filtered,chosen)}</div><p class="muted small">Les comptes non réclamés sont affichés en gris.</p></div><div id="profileContent">${statProfile(chosen)}</div></div></section>`;
}
function rankRows(users,chosen){return users.length?users.map(p=>`<button type="button" class="rank-item ${p.player_key===chosen?.player_key?'selected':''} ${p.has_account?'':'unclaimed'}" data-player="${esc(p.player_key)}"><span class="rank-num">#${p.rank||'-'}</span><span class="rank-name">${flag(p.country_code)} ${esc(p.display_name||p.username)}</span><span class="rank-score">${fmt(p.score)}</span></button>`).join(''):'<div class="empty">Aucun joueur trouvé.</div>';}
function demonPage(){const id=+(new URLSearchParams(location.search)).get('id'),d=state.data.demons.find(x=>+x.id===id);if(!d)return '<div class="center-panel">Niveau introuvable.</div>';
 const recs=state.data.completions.filter(c=>+c.demon_id===id).sort((a,b)=>+b.progress - +a.progress);
 const thumb=http(d.thumbnail_url)|| (plain(d.thumbnail_url).startsWith('assets/')?d.thumbnail_url:'');
 return `${templateNotice()}<div class="paper"><p><a href="${url('list')}" data-nav class="link">← Retour à la liste</a></p><h1>#${d.position} - ${esc(d.name)}</h1><div class="level-detail">${thumb?`<img class="demon-thumb" style="width:100%;height:auto" src="${esc(thumb)}" alt="Miniature">`:'<div class="demon-thumb faux-thumb" style="width:100%">'+esc(d.name)+'</div>'}<div><p>Publié par <b>${esc(d.publisher)}</b><br>Vérifié par <b>${esc(d.verifier||'-')}</b><br>Créé par <b>${esc(d.creator||'-')}</b></p><p><b>Rang :</b> #${d.position} · <b>Minimum :</b> ${d.requirement}%</p><p class="small">${+d.position>cfg().extended_limit?'Hors Top 150 · 0 point':d.legacy?'Liste héritée · 0 point':fmt(score(d,100))+' points (100%)'}</p><div class="level-status">${+d.position>cfg().extended_limit?'<span class="level-badge outside">Hors Top 150</span>':''}${d.legacy?'<span class="level-badge legacy">Legacy · ancien Top 150</span>':''}</div>${http(d.video_url)?`<a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(http(d.video_url))}">Regarder la vidéo ↗</a>`:''}</div></div><hr class="divider"><p>${esc(d.description||'')}</p><h2>Records (${recs.length})</h2>${recs.length?recs.map(r=>`<div class="record-row"><div><a class="link" data-nav href="${url('stats',{player:key(r.player)})}">${esc(r.player)}</a> — ${esc(r.progress)}%</div>${http(r.video_url)?`<a target="_blank" rel="noopener noreferrer" class="link" href="${esc(http(r.video_url))}">Vidéo ↗</a>`:''}</div>`).join(''):'<p class="empty">Aucun record enregistré.</p>'}</div>`;
}
function newsPage(){const items=[...state.data.news_items].filter(x=>x.is_published||state.staff).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));return `${templateNotice()}<div class="paper"><div class="center-panel" style="box-shadow:none;border:0"><h1>Actualités</h1><p>Informations et annonces de la DemonlistFrancophone.</p></div>${items.length?items.map(n=>`<article class="news-card"><time>${date(n.created_at)}${!n.is_published?' · Brouillon':''}</time><h3>${esc(n.headline)}</h3><p class="news-body">${esc(n.body)}</p>${newsMedia(n)}${n.player_name?`<span class="tag">${esc(n.player_name)}</span>`:''}</article>`).join(''):'<p class="empty">Aucune actualité publiée.</p>'}</div>`;}
function hallPage(){const items=state.data.hall_of_fame.filter(x=>x.is_published||state.staff).sort((a,b)=>(b.award_year||0)-(a.award_year||0));return `${templateNotice()}<div class="paper"><div class="center-panel" style="border:0;box-shadow:none"><h1>Hall of Fame</h1><p>Les accomplissements marquants de la communauté francophone.</p></div><div class="hof-grid">${items.length?items.map(h=>`<article class="hof-item"><div class="hof-year">${esc(h.award_year||'—')} · ${esc(h.category)}${!h.is_published?' · Brouillon':''}</div><h3>${esc(h.headline)}</h3><p><a class="link" data-nav href="${url('stats',{player:h.player_key})}">${esc(h.player_key)}</a></p><p>${esc(h.description||'')}</p>${http(h.source_url)?`<a class="link small" href="${esc(http(h.source_url))}" target="_blank" rel="noopener noreferrer">Source ↗</a>`:''}</article>`).join(''):'<p class="empty">Aucune récompense pour le moment.</p>'}</div></div>`;}
const playerOptions=()=>ranked().sort((a,b)=>a.display_name.localeCompare(b.display_name)).map(x=>`<option value="${esc(x.player_key)}">${esc(x.display_name||x.username)}</option>`).join('');
function adminPage(){if(LIVE&&!state.staff){return `<div class="paper"><h1>Modération</h1><p class="muted">Les rôles sont validés par Supabase Auth et les règles RLS, pas par le navigateur.</p><form data-form="login"><label class="field">Adresse e-mail<input name="email" type="email" required autocomplete="email"></label><label class="field">Mot de passe<input name="password" type="password" required autocomplete="current-password"></label><div class="form-actions"><button class="btn">Connexion</button>${state.session?'<button type="button" class="btn subtle" data-action="logout">Déconnexion</button>':''}</div></form>${state.session?'<p class="notice warning">Ce compte n’a pas encore le rôle de modérateur. Celui-ci doit être attribué par un propriétaire depuis Supabase.</p>':''}</div>`;}
 if(!LIVE&&!state.staff)return `<div class="paper"><h1>Laboratoire de modération</h1><p>Cette démonstration sauvegarde tes essais <b>uniquement dans le navigateur</b> et n’a aucun effet sur le site original.</p><button class="btn" data-action="demoStaff">Activer la simulation modérateur</button></div>`;
 const players=playerOptions();return `${templateNotice()}<div class="paper"><div class="row-between"><h1>Modération</h1><div>${!LIVE?'<button class="btn subtle small" data-action="resetDemo">Réinitialiser démo</button>':'<button class="btn subtle small" data-action="logout">Déconnexion</button>'}</div></div><p class="muted">Le contrôle d’accès réel est assuré par les policies Supabase. Le journal des changements est automatique.</p></div><div class="moderation-sections">
 <div class="admin-card"><h3>Ajouter un niveau</h3><form data-form="demon"><label class="field">Position<input name="position" type="number" min="1" required></label><label class="field">Nom<input name="name" required maxlength="120"></label><label class="field">Publié par<input name="publisher" required></label><label class="field">Vérifié par<input name="verifier"></label><label class="field">Créateur<input name="creator"></label><label class="field">Progression minimum (%)<input name="requirement" type="number" min="1" max="100" value="100" required></label><label class="field"><input name="legacy" type="checkbox" style="width:auto"> A déjà appartenu au Top 150 (Legacy)</label><button class="btn">Ajouter le niveau</button><p class="small muted">Si son rang dépasse 150, il apparaît hors classement et vaut automatiquement 0 point.</p></form></div>
 <div class="admin-card"><h3>Publier une actualité</h3><form data-form="news"><label class="field">Titre<input name="headline" maxlength="160" required></label><label class="field">Annonce<textarea name="body" required></textarea></label><label class="field">Joueur concerné (facultatif)<input name="player_name"></label><label class="field">Image (URL, facultatif)<input name="image_url" type="url" placeholder="https://…/image.webp"></label><label class="field">Ou importer une image (PNG / JPG / WebP / GIF, max 5 Mo)<input name="image_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><label class="field">Vidéo (URL YouTube ou vidéo .mp4 / .webm)<input name="video_url" type="url" placeholder="https://youtu.be/…"></label><p class="small muted">Tu peux mettre une image et une vidéo dans la même actualité. En démo, images depuis le PC limitées à 650 Ko. Les vidéos sont intégrées depuis leurs liens.</p><button class="btn">Publier</button></form></div>
 <div class="admin-card"><h3>Créer un titre</h3><form data-form="title"><label class="field">Nom du titre<input name="label" maxlength="90" placeholder="Top 1 France 2025" required></label><label class="field">Description<input name="description" maxlength="200"></label><label class="field">Couleur<input name="color" type="color" value="#287bba" style="height:38px;padding:3px"></label><button class="btn">Créer le titre</button></form></div>
 <div class="admin-card"><h3>Attribuer un titre</h3><form data-form="award"><label class="field">Joueur<select name="player_key" required>${players}</select></label><label class="field">Titre<select name="title_id" required>${state.data.profile_titles.map(x=>`<option value="${x.id}">${esc(x.label)}</option>`).join('')}</select></label><button class="btn">Attribuer</button></form></div>
 <div class="admin-card"><h3>Personnaliser un profil</h3><form data-form="profile"><label class="field">Joueur<select name="player_key" required>${players}</select></label><label class="field">Biographie<textarea name="bio" maxlength="1200"></textarea></label><label class="field">URL d'avatar<input name="avatar_url" type="url" placeholder="https://…"></label><label class="field">URL de bannière<input name="banner_url" type="url"></label><label class="field">Année de début<input name="join_year" type="number" min="2013" max="2100" placeholder="2021"></label><label class="field">Niveau favori<input name="favorite_level" maxlength="120"></label><label class="field">Objectif actuel<input name="current_goal" maxlength="180"></label><label class="field">Lien YouTube<input name="youtube_url" type="url"></label><label class="field">Lien Twitch<input name="twitch_url" type="url"></label><label class="field">Lien personnel<input name="social_url" type="url"></label><label class="field">Accomplissement 1<input name="highlight_1"></label><label class="field">Accomplissement 2<input name="highlight_2"></label><label class="field">Accomplissement 3<input name="highlight_3"></label><button class="btn">Enregistrer</button></form></div>
 <div class="admin-card"><h3>Hall of Fame</h3><form data-form="hall"><label class="field">Joueur<select name="player_key">${players}</select></label><label class="field">Distinction<input name="headline" required></label><label class="field">Année<input name="award_year" type="number" min="2010" max="2100"></label><label class="field">Catégorie<input name="category" value="Accomplissement" required></label><label class="field">Description<textarea name="description"></textarea></label><label class="field">Source (facultative)<input name="source_url" type="url"></label><button class="btn">Ajouter au Hall of Fame</button></form></div>
 <div class="admin-card"><h3>Visibilité des joueurs</h3><form data-form="visibility"><label class="field">Joueur<select name="player_key">${players}</select></label><label class="field">Dans les classements<select name="hidden_from_stats"><option value="false">Afficher</option><option value="true">Masquer</option></select></label><button class="btn">Mettre à jour</button></form></div>
 <div class="admin-card"><h3>Journal de modération</h3><p class="muted small">Dernières actions enregistrées automatiquement par la base.</p><div>${(state.data.community_audit_log||[]).slice(-20).reverse().map(x=>`<div class="record-row small"><b>${esc(x.action_key)} · ${esc(x.target)}</b><span>${date(x.created_at)}</span></div>`).join('')||'<p class="empty">Aucune action récente.</p>'}</div></div>
 </div>`;
}
function render(){if(!state.data)return;const page=nav(),params=new URLSearchParams(location.search);if(page==='stats'&&params.has('player'))state.selectedPlayer=key(params.get('player'));const content=page==='stats'?statsPage():page==='demon'?demonPage():page==='news'?newsPage():page==='hall'?hallPage():page==='admin'?adminPage():listPage();el.innerHTML=migrationNotice()+content;document.title=({list:'Demonlist',stats:'Statistiques',news:'Actualités',hall:'Hall of Fame',admin:'Modération',demon:'Niveau'})[page]+' · DemonlistFrancophone';}
async function save(table,item,{upsert=false,on=null}={}){
 if(!LIVE){const existing=state.data[table];const copy={...item};if(!('id' in copy)&&['news_items','profile_titles','hall_of_fame','demons','completions'].includes(table))copy.id=Math.max(0,...existing.map(r=>Number(r.id)||0))+1;
 if(upsert){const match=existing.findIndex(p=>(on||['id']).every(f=>String(p[f])===String(copy[f])));if(match>=0)existing[match]={...existing[match],...copy};else existing.push(copy);}else existing.push(copy);
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
 if(type==='demon'){
  const pos=+f.position;if(state.data.demons.some(d=>+d.position===pos))throw Error('Un niveau occupe déjà cette position.');
  await save('demons',{position:pos,name:plain(f.name),publisher:plain(f.publisher),verifier:plain(f.verifier),creator:plain(f.creator),requirement:+f.requirement,legacy:!!f.legacy,difficulty:'Extreme Demon'});
 }else if(type==='news'){
  let image_url=plain(f.image_url);
  const file=form.querySelector('[name="image_file"]')?.files?.[0];
  if(file)image_url=await uploadNewsImage(file);
  if(image_url && !imageLink(image_url))throw Error('URL d’image invalide. Utilise un lien http(s).');
  if(f.video_url && !http(f.video_url))throw Error('URL de vidéo invalide.');
  await save('news_items',{headline:plain(f.headline),body:plain(f.body),player_name:plain(f.player_name)||null,image_url:image_url||null,video_url:plain(f.video_url)||null,is_published:true});
 }
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
function bootEvents(){
 document.addEventListener('click',async(ev)=>{const a=ev.target.closest('a[data-nav]');if(a){ev.preventDefault();const link=new URL(a.href);history.pushState({},'',link.search);state.keyword='';render();window.scrollTo(0,0);return;}
 const list=ev.target.closest('[data-list]');if(list){state.list=list.dataset.list;state.keyword='';render();return;}
 const p=ev.target.closest('[data-player]');if(p){state.selectedPlayer=p.dataset.player;history.replaceState({},'',url('stats',{player:state.selectedPlayer}));const chosen=getPlayer(state.selectedPlayer);$('profileContent').innerHTML=statProfile(chosen);document.querySelectorAll('.rank-item').forEach(x=>x.classList.toggle('selected',x.dataset.player===state.selectedPlayer));return;}
 const route=ev.target.closest('[data-route]');if(route){go(route.dataset.route);return;}
 const act=ev.target.closest('[data-action]');if(!act)return;
 if(act.dataset.action==='previewDemo'){
  try{sessionStorage.setItem('dlfr-preview-mode','demo');}catch{}
  location.reload();return;
 }
 if(act.dataset.action==='previewLive'){
  try{sessionStorage.removeItem('dlfr-preview-mode');}catch{}
  location.reload();return;
 }
 if(act.dataset.action==='demoStaff'&&!LIVE){state.staff=true;render();}
 if(act.dataset.action==='resetDemo'&&!LIVE){try{localStorage.removeItem('demonlist-demo-v1');}catch{}state.data=demoLoad();toast('Démo réinitialisée');render();}
 if(act.dataset.action==='logout'&&LIVE){await db.auth.signOut();state.session=null;state.staff=false;render();}
 });
 document.addEventListener('input',ev=>{
 if(ev.target.id==='demonSearch'){state.keyword=ev.target.value;const d=state.data.demons.filter(x=>state.list==='legacy'?x.legacy:state.list==='main'?x.position<=cfg().main_limit&&!x.legacy:state.list==='extended'?x.position>cfg().main_limit&&x.position<=cfg().extended_limit&&!x.legacy:x.position>cfg().extended_limit);$('demonItems').innerHTML=cardsHTML(d.filter(x=>key(x.name).includes(key(state.keyword))));}
 if(ev.target.id==='playerSearch'){state.keyword=ev.target.value;const ppl=ranked().filter(x=>!x.hidden_from_stats&&(state.country==='MONDE'||x.country_code===state.country)&&key(x.display_name||x.username).includes(key(state.keyword)));$('rankList').innerHTML=rankRows(ppl,getPlayer(state.selectedPlayer));}
 });
 document.addEventListener('change',ev=>{if(ev.target.id==='countryFilter'){state.country=ev.target.value;state.keyword='';render();}});
 document.addEventListener('submit',ev=>{if(ev.target.matches('[data-form]')){ev.preventDefault();handleForm(ev.target);}});
 document.querySelectorAll('.nav-links a,.brand').forEach(a=>a.addEventListener('click',ev=>{ev.preventDefault();go(a.dataset.link||'list');}));
 $('themeToggle').addEventListener('click',()=>{document.documentElement.classList.toggle('dark');try{localStorage.setItem('demonlist-theme',document.documentElement.classList.contains('dark')?'dark':'light');}catch{}});
 window.addEventListener('popstate',()=>{state.keyword='';render();});
 try{if(localStorage.getItem('demonlist-theme')==='dark')document.documentElement.classList.add('dark');}catch{}
}
bootEvents();load();
})();

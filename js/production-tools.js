/* DLFR V3.0: actions de production. Les autorisations réelles sont dans Supabase RLS/RPC. */
(function(root,factory){const out=factory();if(typeof module==='object'&&module.exports)module.exports=out;else root.DLFR_PRODUCTION=out;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const trim=v=>String(v??'').trim();
const safeUrl=v=>/^https:\/\//i.test(trim(v))?esc(trim(v)):'#';
const slug=v=>trim(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,70);
const row=(label,value)=>`<label class="field">${label}${value}</label>`;
const button=(text)=>`<button class="btn" type="submit">${text}</button>`;
const handles=t=>['prodPlayer','prodCompletion','prodClaim','prodClaimReview','selfCreatePlayer','submitRecord','prodReviewSubmission','prodBadgeManual'].includes(t);
const errorOf=r=>{if(r.error)throw Error(r.error.message);return r.data;};
function claimSection(s){
 if(!s.session)return '';
 const user=s.session.user;
 const claims=(s.data.profile_claim_requests||[]).filter(x=>x.auth_user_id===user.id);
 const pending=claims.some(x=>x.status==='pending');
 const players=(s.data.players||[]).filter(p=>!s.data.player_profile_owners?.some(o=>o.player_key===p.player_key));
 const discordConnected=(user.identities||[]).some(x=>x.provider==='discord') || user.app_metadata?.provider==='discord' || (user.app_metadata?.providers||[]).includes('discord');
 const geo=typeof window!=='undefined'?window.DLFR_GEO:null;
 const countryOptions=(geo?.countries||[['FR','France'],['BE','Belgique'],['CH','Suisse'],['CA','Canada']])
   .map(([code,name])=>`<option value="${esc(code)}" ${code==='FR'?'selected':''}>${esc(name)}</option>`).join('');
 const regionOptions=(geo?.regions||[]).map(r=>`<option value="${esc(r.code)}">${esc(r.name)}</option>`).join('');
 const create = `<section class="prod-panel prod-onboarding"><h3>✨ Je n'ai pas encore de fiche</h3><p class="small muted">Crée une fiche joueur vierge, liée à ton compte Discord. Cette action n'attribue aucun record ni badge. Si ton pseudo existe déjà, utilise plutôt la demande de liaison ci-dessous.</p>
 ${pending?'<div class="notice warning">Une revendication est en attente : attends sa réponse avant de créer une autre fiche.</div>':
 !discordConnected?'<div class="notice warning">Connecte-toi avec Discord pour créer ta fiche personnelle.</div>':
 `<form data-form="selfCreatePlayer" class="prod-create-player">
 ${row('Mon pseudo Geometry Dash','<input name="username" required minlength="2" maxlength="32" pattern="[A-Za-z0-9_-]{2,32}" title="2 à 32 caractères : lettres, chiffres, _ et -" autocomplete="nickname" placeholder="Ex. Spleen">')}
 ${row('Pays',`<select name="country_code" required>${countryOptions}</select>`)}
 ${row('Région (uniquement pour la France)',`<select name="region_code"><option value="">Aucune région</option>${regionOptions}</select>`)}
 <p class="small muted">Le pays et la région sont déclaratifs. Les classements et les records sont vérifiés séparément.</p>
 ${button('Créer ma fiche DLFR')}</form>`}
 </section>`;
 const claim = `<section class="prod-panel"><h3>J'ai déjà une fiche joueur</h3><p class="small muted">Discord ne prouve pas la propriété d'un compte Geometry Dash. Une demande de liaison doit être examinée par la modération.</p>
 ${pending?'<div class="notice">Ta demande de liaison est en attente de vérification.</div>':`<form data-form="prodClaim">
 <label class="field">Fiche existante<select name="player_key" required><option value="">Choisir une fiche</option>${players.map(p=>`<option value="${esc(p.player_key)}">${esc(p.display_name||p.username||p.player_key)}</option>`).join('')}</select></label>
 ${row('Lien de preuve (vidéo ou profil public)','<input name="proof_url" type="url" required pattern="https://.*" maxlength="1000" placeholder="https://…">')}
 ${row('Note aux modérateurs','<textarea name="note" maxlength="600"></textarea>')}${button('Demander la liaison')}</form>`}
 ${claims.filter(x=>x.status!=='pending').slice(-3).map(x=>`<p class="small">Demande pour ${esc(x.player_key)} · ${esc(x.status)}</p>`).join('')}
 </section>`;
 return create+claim;
}
function moderation(s){if(!s.staff)return '';
 const players=(s.data.players||[]).slice().sort((a,b)=>String(a.display_name||a.username).localeCompare(String(b.display_name||b.username)));
 const demons=(s.data.demons||[]).slice().sort((a,b)=>Number(a.position)-Number(b.position));
 const selectPlayers=players.map(p=>`<option value="${esc(p.player_key)}">${esc(p.display_name||p.username)} (${esc(p.player_key)})</option>`).join('');
 const selectDemons=demons.map(d=>`<option value="${esc(d.id)}">#${esc(d.position)} ${esc(d.name)}${d.unrated?' (UNRATED)':''}</option>`).join('');
 const claims=(s.data.profile_claim_requests||[]).filter(x=>x.status==='pending');
 const subs=(s.data.level_submissions||[]).filter(x=>x.status==='pending');
 return `<section class="prod-panel"><h2>Gestion des joueurs et des records réels</h2><p class="small muted">Les profils créés ici n'ont pas encore de propriétaire Discord. Ils peuvent ensuite être revendiqués après validation.</p>
 <div class="prod-grid"><form data-form="prodPlayer"><h3>Créer une fiche joueur</h3>${row('Pseudo Geometry Dash','<input name="username" required minlength="2" maxlength="70">')}${row('Nom affiché (facultatif)','<input name="display_name" maxlength="80">')}${row('Pays','<select name="country_code"><option value="">Inconnu</option><option value="FR">France</option><option value="BE">Belgique</option><option value="CH">Suisse</option><option value="CA">Canada</option></select>')}${button('Créer la fiche')}</form>
 <form data-form="prodCompletion"><h3>Attribuer une victoire</h3>${row('Joueur','<select name="player_key" required>'+selectPlayers+'</select>')}${row('Niveau','<select name="demon_id" required>'+selectDemons+'</select>')}${row('Preuve vidéo (facultative)','<input name="video_url" type="url" maxlength="1000" placeholder="https://…">')}${row('Date réelle (facultative)','<input name="achieved_at" type="date">')}<p class="small muted">Une seule victoire par joueur et niveau. Si elle existe déjà, ses preuves ne sont pas écrasées.</p>${button('Attribuer 100 %')}</form></div>
 <h3>Demandes de liaison Discord / Geometry Dash (${claims.length})</h3>${claims.length?claims.map(x=>`<article class="prod-review"><strong>${esc(x.player_key)}</strong><p class="small">Utilisateur Auth : ${esc(x.auth_user_id)}</p><p class="small">${esc(x.note)}</p><a href="${safeUrl(x.proof_url)}" target="_blank" rel="noopener noreferrer">Examiner la preuve ↗</a><form data-form="prodClaimReview"><input type="hidden" name="request_id" value="${esc(x.id)}"><button class="btn" name="approve" value="yes">Approuver</button> <button class="btn subtle" name="approve" value="no">Refuser</button></form></article>`).join(''):'<p class="muted">Aucune demande.</p>'}
 <h3>Soumissions à modérer (${subs.length})</h3>${subs.length?subs.map(x=>{const existing=demons.find(d=>x.level_id&&String(d.level_id)===String(x.level_id))||demons.find(d=>d.name.toLowerCase()===x.level_name.toLowerCase());return `<article class="prod-review"><strong>${esc(x.level_name)}</strong> · ${esc(x.player)} (${esc(x.progress)} %)<p><a href="${safeUrl(x.video_url)}" target="_blank" rel="noopener noreferrer">Preuve ↗</a>${existing?' · Fiche existante #'+esc(existing.id):' · Nouveau niveau'}</p><form data-form="prodReviewSubmission"><input type="hidden" name="request_id" value="${esc(x.id)}">${existing?'':row('Statut du niveau','<select name="rating"><option value="rated">Rated</option><option value="unrated">UNRATED</option></select>')}${existing?'':row('Position libre (Rated) / position estimée (UNRATED)','<input name="position" type="number" min="1" required>')}<button class="btn" name="approve" value="yes">Valider</button> <button class="btn subtle" name="approve" value="no">Refuser</button></form></article>`;}).join(''):'<p class="muted">Aucune soumission.</p>'}
 <h3>Badges de classement (attribution manuelle)</h3><form data-form="prodBadgeManual"><label class="field">Joueur<select name="player_key">${selectPlayers}</select></label><label class="field">Badge<select name="badge_id"><option value="goat-pays">Le Goat tout simplement</option><option value="goat-region">Le Goat de ta région</option><option value="clash-clans">Clash of Clans</option></select></label>${row('Date d’obtention','<input type="date" name="obtained_at" required>')}${button('Attribuer définitivement')}</form>
 </section>`;
}
async function send(db,type,f,submitter){
 const r=(method,args)=>db.rpc(method,args).then(errorOf);
 const yes=submitter?.value==='yes';
 if(type==='prodPlayer'){
  const name=trim(f.username),key=slug(name);if(!key||name.length<2)throw Error('Pseudo invalide');
  if(!['','FR','BE','CH','CA'].includes(f.country_code))throw Error('Pays invalide');
  return errorOf(await db.from('players').insert({player_key:key,username:name,display_name:trim(f.display_name)||name,country_code:f.country_code||null,has_account:true}));
 }
 if(type==='prodCompletion'){
  if(f.video_url && !/^https:\/\//i.test(f.video_url))throw Error('Preuve HTTPS requise');
  return r('dlfr_assign_completion',{p_player_key:f.player_key,p_demon_id:Number(f.demon_id),p_video_url:f.video_url||null,p_achieved_at:f.achieved_at?f.achieved_at+'T12:00:00Z':null});
 }
 if(type==='selfCreatePlayer'){
  const username=trim(f.username);
  if(!/^[a-zA-Z0-9_-]{2,32}$/.test(username))throw Error('Pseudo : entre 2 et 32 lettres, chiffres, tirets ou underscores.');
  if(!/^[A-Z]{2}$/.test(f.country_code||''))throw Error('Choisis un pays valide.');
  const region=f.country_code==='FR'?(f.region_code||null):null;
  return r('dlfr_create_own_player',{p_username:username,p_country_code:f.country_code,p_region_code:region});
 }
 if(type==='prodClaim'){
  if(!/^https:\/\//i.test(f.proof_url))throw Error('Lien de preuve HTTPS requis');
  return errorOf(await db.from('profile_claim_requests').insert({player_key:f.player_key,proof_url:f.proof_url,note:trim(f.note||''),auth_user_id:(await db.auth.getUser()).data.user.id}));
 }
 if(type==='prodClaimReview')return r('dlfr_review_claim',{p_request_id:Number(f.request_id),p_approve:yes});
 if(type==='prodReviewSubmission')return r('dlfr_review_submission',{p_request_id:Number(f.request_id),p_approve:yes,p_unrated:f.rating==='unrated',p_position:f.position?Number(f.position):null});
 if(type==='prodBadgeManual'){
  const date=f.obtained_at;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>new Date().toISOString().slice(0,10))throw Error('Date invalide ou future');
  return errorOf(await db.from('badge_awards').insert({player_key:f.player_key,badge_id:f.badge_id,obtained_at:date,origin:'moderator'}));
 }
 if(type==='submitRecord'){
  if(!/^https:\/\//i.test(f.video_url))throw Error('Preuve HTTPS requise');
  const who=(await db.auth.getUser()).data.user;
  if(!who)throw Error('Connexion Discord requise');
  return errorOf(await db.from('level_submissions').insert({auth_user_id:who.id,level_name:trim(f.level_name),level_id:trim(f.level_id)||null,player:trim(f.player),progress:Number(f.progress),video_url:f.video_url,publisher:trim(f.publisher),creator:trim(f.creator)||null,verifier:trim(f.verifier)||null,suggested_position:f.suggested_position?Number(f.suggested_position):null}));
 }
 throw Error('Action inconnue');
}
return {handles,claimSection,moderation,send,slug};
});

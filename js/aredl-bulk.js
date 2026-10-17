/* Import explicite par supermodérateur ; toutes les décisions sont revérifiées en SQL. */
(function(root){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function parse(text){
 const data=JSON.parse(text);
 if(data.format!=='dlfr-aredl-fr-bulk-v1'||data.country!=='FR'||!Array.isArray(data.rows)||!data.rows.length||data.rows.length>5000)throw Error('Fichier de collecte FR invalide ou vide.');
 return data;
}
function panel(){return `<div class="admin-card" data-admin-section="levels"><h3>Import groupé AREDL → NLW</h3>
<p>Récupère le fichier <b>aredl-fr-bulk.json</b> depuis GitHub → Actions → <b>Préparer import groupé NLW français</b> → Run workflow → artifact <b>aredl-fr-import</b>. Décompresse l’archive téléchargée.</p>
<p class="small muted">La collecte examine par défaut tous les rangs AREDL. Ici, 238 désigne la première position globale DLFR (NLW #88). Les niveaux sont triés par rang AREDL et placés dans les positions libres à partir de ce rang. Les fiches publiques existantes restent inchangées.</p>
<form data-form="bulkNlwFR"><label class="field">Fichier de collecte JSON<input type="file" name="collection" accept=".json,application/json" required></label>
<label class="field">Première position globale DLFR<input type="number" name="start_position" value="238" min="151" max="99990000" required></label>
<div class="form-actions"><button type="submit" class="btn subtle" name="bulk_action" value="preview">Examiner l’import</button><button type="submit" class="btn" name="bulk_action" value="publish" disabled>Publier le lot examiné</button></div>
<p class="small muted">Les noms, dates et vidéos sont ajoutés aux fiches. Aucun compte joueur ni record donnant des points n’est créé automatiquement. Les dates AREDL ne prouvent pas la première victoire historique.</p>
<div data-bulk-result role="status" aria-live="polite"></div></form></div>`;}
function renderReport(report,source){
 const labels={create:'Ajouter',reuse:'Réutiliser la fiche masquée',keep:'Déjà public — conservé',conflict:'À examiner manuellement'};
 return `<p><b>${report.executed?'Import terminé':'Aperçu'} : ${report.published} ${report.executed?'publiés':'à publier'}</b> · ${report.kept} conservés · ${report.conflicts} conflits exclus.</p>
 ${source.scan_complete!==true?`<p class="notice warning">Collecte partielle : ${esc(source.scanned)}/${esc(source.total)} examinés, ${(source.problems||[]).length} problèmes. Seules les fiches entièrement examinées ci-dessous peuvent être importées. Relance la collecte pour les autres.</p>`:''}
 <div style="max-height:440px;overflow:auto"><table><thead><tr><th>Niveau</th><th>DLFR</th><th>Preuve française</th><th>Action</th></tr></thead><tbody>${report.entries.map(e=>{
 const r=e.row,first=r.first_fr?.player?.name,ver=(r.verifiers_fr||[]).map(v=>v.player.name).join(', ');
 return `<tr><td>${esc(r.name)}<br><small>AREDL #${esc(r.aredl_rank)}</small></td><td>${e.position?'#'+esc(e.position):'—'}</td><td>${ver?'Vérificateur : '+esc(ver)+'<br>':''}${first?'Premier record daté disponible : '+esc(first):'Victor connu (ordre non établi) : '+esc(r.victor_fr?.player?.name||'—')}</td><td>${esc(labels[e.action])}${e.reason?'<br>'+esc(e.reason):''}</td></tr>`;
 }).join('')}</tbody></table></div>
 ${(source.problems||[]).length?`<details><summary>Problèmes de collecte (${source.problems.length})</summary><ul>${source.problems.map(p=>`<li>#${esc(p.aredl_rank)} ${esc(p.name)} : ${esc(p.reason)}</li>`).join('')}</ul></details>`:''}`;
}
async function submit(db,form,submitter){
 const output=form.querySelector('[data-bulk-result]'),publish=form.querySelector('[value="publish"]');
 const execute=submitter?.value==='publish';
 const file=form.elements.collection.files[0];
 if(!file||file.size>20*1024*1024)throw Error('Choisis un fichier JSON de moins de 20 Mo.');
 const text=await file.text(),source=parse(text),start=Number(form.elements.start_position.value);
 const fingerprint=text+'\n'+start;
 if(execute&&(!form._bulkPreview||form._bulkPreview.input!==fingerprint))throw Error('Le fichier ou le rang a changé. Relance Examiner.');
 publish.disabled=true;
 output.textContent=execute?'Publication du lot…':'Examen des preuves et des doublons…';
 try{
 const {data,error}=await db.rpc('dlfr_import_nlw_fr',{p_rows:source.rows,p_start_position:start,p_execute:execute,p_preview_hash:execute?form._bulkPreview.hash:null});
 if(error)throw Error(error.message+(error.code==='PGRST202'?' — Installe la migration 44 dans Supabase.':''));
 output.innerHTML=renderReport(data,source);
 form._bulkPreview=execute?null:{hash:data.preview_hash,input:fingerprint};
 publish.disabled=execute||!data.published;
 return execute;
 }catch(err){form._bulkPreview=null;output.textContent=err.message;throw err;}
}
function proof(d){
 const r=d.bulk_fr_evidence;if(!r)return '';
 const ver=(r.verifiers_fr||[]).map(v=>v.player?.name).filter(Boolean);
 const first=r.first_fr?.player?.name,witness=r.victor_fr?.player?.name;
 const video=r.victor_fr?.video_url;
 return `<section class="notice"><h3>Complétion française · source AREDL</h3>${ver.length?`<p>Vérificateur${ver.length>1?'s':''} français : <b>${esc(ver.join(', '))}</b></p>`:''}
 ${first?`<p>Premier record français daté disponible : <b>${esc(first)}</b></p>`:witness?`<p>Victor français connu : <b>${esc(witness)}</b> · ordre des victoires non établi</p>`:''}
 ${typeof video==='string'&&/^https:\/\//.test(video)?`<a class="link" href="${esc(video)}" target="_blank" rel="noopener noreferrer">Voir la preuve ↗</a>`:''}
 <p class="small muted">Les données AREDL disponibles ne garantissent pas la première victoire historique.${r.undated_fr_records?' Certaines victoires françaises ne sont pas datées.':''}</p></section>`;
}
const api={parse,panel,submit,renderReport,proof};
if(typeof module==='object'&&module.exports)module.exports=api;else root.DLFR_BULK=api;
})(typeof window==='object'?window:globalThis);

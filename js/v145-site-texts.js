/* DLFR V145 — Textes du site modifiables par les propriétaires.
 * Chaque remplacement vise un texte EXACT affiché sur le site (table dlfr_site_texts).
 * Les remplacements sont appliqués pour tous les visiteurs ; seuls les propriétaires voient l'éditeur.
 */
(()=>{'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const S={db:null,owner:false,loaded:false,loading:false,map:new Map(),editing:false,hoverEl:null,dialog:null};
const ORIG=new WeakMap();           // nœud texte → texte d'origine
const SKIP='script,style,textarea,input,select,option,noscript,code,pre,[contenteditable],[data-dlfr145]';
const norm=s=>String(s||'').replace(/\s+/g,' ').trim();

function originalOf(node){
 const cur=norm(node.nodeValue);const known=ORIG.get(node);
 if(known!==undefined){const rep=S.map.get(known);if(cur===known||(rep!==undefined&&cur===norm(rep)))return known;}
 ORIG.set(node,cur);return cur;
}
function writeNode(node,text){
 const v=node.nodeValue,lead=v.match(/^\s*/)[0],trail=v.match(/\s*$/)[0];
 const next=lead+text+trail;if(v!==next)node.nodeValue=next;
}
function applyNode(node){
 if(!node.nodeValue||!node.nodeValue.trim())return;
 const p=node.parentElement;if(!p||p.closest(SKIP))return;
 const o=originalOf(node);const rep=S.map.get(o);
 writeNode(node,rep!==undefined?rep:o);
}
function applyAll(root=document.body){
 if(!root||(!S.map.size&&!S.touched))return;
 const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode()))applyNode(n);
 for(const el of root.querySelectorAll?.('[placeholder]')||[]){
  if(el.closest('[data-dlfr145]'))continue;
  const o=el.dataset.dlfr145Ph??(el.dataset.dlfr145Ph=norm(el.getAttribute('placeholder')));
  const rep=S.map.get(o),want=rep!==undefined?rep:o;if(el.getAttribute('placeholder')!==want)el.setAttribute('placeholder',want);
 }
}
let raf=0;function schedule(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;applyAll();});}
new MutationObserver(muts=>{if(!S.map.size&&!S.touched)return;for(const m of muts){if(m.target.closest?.('[data-dlfr145]')||m.target.parentElement?.closest?.('[data-dlfr145]'))continue;schedule();return;}})
 .observe(document.documentElement,{childList:true,subtree:true,characterData:true});

async function load(){
 if(!S.db||S.loading)return;S.loading=true;
 try{const {data,error}=await S.db.from('dlfr_site_texts').select('original,replacement');if(error)throw error;
  S.map=new Map((data||[]).map(r=>[norm(r.original),r.replacement]));S.loaded=true;applyAll();if(S.editing)paintBar();}
 catch(e){console.warn('[DLFR Textes] Chargement impossible :',e.message||e);}
 finally{S.loading=false;}
}

// ---------- Éditeur (propriétaires)
function textNodeAt(x,y,target){
 let node=null;
 if(document.caretPositionFromPoint){const p=document.caretPositionFromPoint(x,y);node=p?.offsetNode;}
 else if(document.caretRangeFromPoint){const r=document.caretRangeFromPoint(x,y);node=r?.startContainer;}
 if(node&&node.nodeType===3&&node.nodeValue.trim()&&target.contains(node))return node;
 const w=document.createTreeWalker(target,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode()))if(n.nodeValue.trim()&&!n.parentElement.closest(SKIP))return n;
 return null;
}
function ensureButton(){
 let b=document.getElementById('dlfr145Toggle');
 if(!S.owner){b?.remove();if(S.editing)setEditing(false);return;}
 if(!b){b=document.createElement('button');b.type='button';b.id='dlfr145Toggle';b.className='dlfr145-toggle';b.dataset.dlfr145='1';
  b.textContent='✎ Textes du site';b.title='Modifier les textes du site (propriétaires)';b.addEventListener('click',()=>setEditing(!S.editing));document.body.append(b);}
 b.classList.toggle('is-on',S.editing);b.textContent=S.editing?'✓ Terminer':'✎ Textes du site';
}
function paintBar(){
 let bar=document.getElementById('dlfr145Bar');
 if(!S.editing){bar?.remove();return;}
 if(!bar){bar=document.createElement('div');bar.id='dlfr145Bar';bar.className='dlfr145-bar';bar.dataset.dlfr145='1';document.body.append(bar);}
 bar.innerHTML=`<b>Mode édition des textes</b><span>Clique sur n’importe quel texte pour le changer. Les liens et boutons ne réagissent pas tant que ce mode est actif.</span><button type="button" class="btn small subtle" data-dlfr145-list>Textes modifiés (${S.map.size})</button><button type="button" class="btn small" data-dlfr145-stop>Terminer</button>`;
}
function setEditing(on){
 S.editing=!!on;document.body.classList.toggle('dlfr145-editing',S.editing);
 if(!S.editing&&S.hoverEl){S.hoverEl.classList.remove('dlfr145-hover');S.hoverEl=null;}
 ensureButton();paintBar();
}
function closeDialog(){S.dialog?.remove();S.dialog=null;}
function openDialog(original){
 closeDialog();const rep=S.map.get(original);
 const d=document.createElement('div');d.className='dlfr145-modal';d.dataset.dlfr145='1';
 d.innerHTML=`<div class="dlfr145-box" role="dialog" aria-modal="true" aria-label="Modifier un texte">
  <h3>Modifier ce texte</h3>
  <label>Texte d’origine<div class="dlfr145-orig">${esc(original)}</div></label>
  <label>Nouveau texte<textarea rows="${Math.min(10,Math.max(3,Math.ceil(original.length/60)))}" maxlength="2000">${esc(rep??original)}</textarea></label>
  <p class="dlfr145-help">Le changement s’applique partout où ce texte exact apparaît, pour tous les visiteurs. Si le texte contient un nombre ou un pseudo qui varie, il ne vaudra que pour cette valeur précise.</p>
  <div class="dlfr145-actions">${rep!==undefined?'<button type="button" class="btn small subtle" data-dlfr145-reset>Rétablir l’original</button>':''}<span></span><button type="button" class="btn small subtle" data-dlfr145-cancel>Annuler</button><button type="button" class="btn small" data-dlfr145-save>Enregistrer</button></div>
  <p class="dlfr145-err" role="alert"></p></div>`;
 d._original=original;document.body.append(d);S.dialog=d;
 const ta=d.querySelector('textarea');ta.focus();ta.select();
}
function openList(){
 closeDialog();
 const rows=[...S.map.entries()].sort((a,b)=>a[0].localeCompare(b[0],'fr'));
 const d=document.createElement('div');d.className='dlfr145-modal';d.dataset.dlfr145='1';
 d.innerHTML=`<div class="dlfr145-box is-wide" role="dialog" aria-modal="true" aria-label="Textes modifiés">
  <h3>Textes modifiés (${rows.length})</h3>
  ${rows.length?`<ul class="dlfr145-list">${rows.map(([o,r])=>`<li><div><small>Avant</small><p>${esc(o)}</p><small>Après</small><p><b>${esc(r)}</b></p></div><span><button type="button" class="btn small subtle" data-dlfr145-edit="${esc(o)}">Modifier</button><button type="button" class="btn small subtle" data-dlfr145-revert="${esc(o)}">Rétablir</button></span></li>`).join('')}</ul>`:'<p class="dlfr145-help">Aucun texte modifié pour l’instant.</p>'}
  <div class="dlfr145-actions"><span></span><button type="button" class="btn small" data-dlfr145-cancel>Fermer</button></div><p class="dlfr145-err" role="alert"></p></div>`;
 document.body.append(d);S.dialog=d;
}
async function save(original,replacement){
 const {error}=await S.db.rpc('dlfr_site_text_set',{p_original:original,p_replacement:replacement});
 if(error)throw error;
 const r=norm(replacement);S.touched=true;
 if(!r||r===original)S.map.delete(original);else S.map.set(original,replacement.trim());
 applyAll();paintBar();
}
document.addEventListener('mousemove',ev=>{
 if(!S.editing||S.dialog)return;const t=ev.target;
 if(!(t instanceof Element)||t.closest('[data-dlfr145]')){if(S.hoverEl){S.hoverEl.classList.remove('dlfr145-hover');S.hoverEl=null;}return;}
 const n=textNodeAt(ev.clientX,ev.clientY,t);const el=n?.parentElement||null;
 if(el!==S.hoverEl){S.hoverEl?.classList.remove('dlfr145-hover');S.hoverEl=el;el?.classList.add('dlfr145-hover');}
},{passive:true});
document.addEventListener('click',async ev=>{
 const t=ev.target;if(!(t instanceof Element))return;
 const ui=t.closest('[data-dlfr145]');
 if(ui){
  if(t.closest('[data-dlfr145-stop]')){setEditing(false);return;}
  if(t.closest('[data-dlfr145-list]')){openList();return;}
  if(t.closest('[data-dlfr145-cancel]')||t===S.dialog){closeDialog();return;}
  const ed=t.closest('[data-dlfr145-edit]');if(ed){openDialog(ed.dataset.dlfr145Edit);return;}
  const rv=t.closest('[data-dlfr145-revert]'),sv=t.closest('[data-dlfr145-save]'),rs=t.closest('[data-dlfr145-reset]');
  if(rv||sv||rs){
   const box=S.dialog,err=box?.querySelector('.dlfr145-err');const btn=rv||sv||rs;btn.disabled=true;
   try{
    if(rv){await save(rv.dataset.dlfr145Revert,'');openList();}
    else{const o=box._original;await save(o,rs?'':box.querySelector('textarea').value);closeDialog();}
   }catch(e){btn.disabled=false;if(err)err.textContent=e.message||'Enregistrement impossible.';}
  }
  return;
 }
 if(!S.editing)return;
 ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();
 const n=textNodeAt(ev.clientX,ev.clientY,t);if(!n||n.parentElement.closest(SKIP))return;
 openDialog(originalOf(n));
},true);
document.addEventListener('keydown',ev=>{
 if(ev.key==='Escape'&&S.dialog){closeDialog();ev.stopPropagation();}
 else if(ev.key==='Enter'&&(ev.ctrlKey||ev.metaKey)&&S.dialog?.querySelector('[data-dlfr145-save]'))S.dialog.querySelector('[data-dlfr145-save]').click();
},true);
// Pendant l'édition, empêche aussi les formulaires et la navigation au clavier.
document.addEventListener('submit',ev=>{if(S.editing&&!ev.target.closest('[data-dlfr145]')){ev.preventDefault();ev.stopImmediatePropagation();}},true);

window.DLFR_TEXTS={
 mount(ctx){S.db=ctx.db||S.db;S.owner=!!ctx.owner;if(!S.loaded)load();ensureButton();},
 apply:()=>applyAll(),
 reload:()=>load()
};
})();

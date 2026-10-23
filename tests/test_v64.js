'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const s=fs.readFileSync('js/app.js','utf8');
const index=fs.readFileSync('index.html','utf8');
function extract(name){
 const begin=s.indexOf('function '+name+'(');assert(begin>=0,`missing function ${name}`);
 let start=s.indexOf('{',begin),level=0,inQuote=null,escape=false;
 for(let i=start;i<s.length;i++){
  const c=s[i];
  // Functions extracted here contain no raw template literals, block comments, or braces in strings
  if(inQuote){if(escape){escape=false;continue;}if(c==='\\'){escape=true;continue;}if(c===inQuote){inQuote=null;}continue;}
  if(c==='"'||c==="'"){inQuote=c;continue;}
  if(c==='{')level++;else if(c==='}'&&!--level)return s.slice(begin,i+1);
 }
 throw Error('missing closing brace');
}
const required=extract('requiredGroups');
function groups(page,tab,full=true){
 const ctx={state:{adminTab:tab},hasFullStaffPowers:()=>full};
 vm.runInNewContext(required+';this.groups=requiredGroups;',ctx);
 return [...ctx.groups(page)];
}
assert.deepEqual(groups('admin','overview'),[]);
assert.deepEqual(groups('admin','requests'),[]);
assert.deepEqual(groups('admin','packs'),['packs']);
assert.deepEqual(groups('admin','profiles'),['community']);
assert.deepEqual(groups('admin','levels'),['adminLevels']);
assert.deepEqual(groups('admin','audit'),['adminAudit']);
assert.deepEqual(groups('admin','safety'),['adminSafety']);
assert.deepEqual(groups('admin','levels',false),[]);
assert.deepEqual(groups('list','overview'),[]);
assert.deepEqual(groups('player','overview'),['community','packs','history']);
assert(s.includes("state.adminTab==='packs'?packModerationEditor():''"));
assert(s.includes('optionalStatus.packs=\'ready\';state.packsReady=true;'));
assert(s.includes("isUnrated?'dlfr_scoped_unrated_create':'dlfr_scoped_level_create'"));
assert(s.includes("if(isUnrated&&state.staffRole!=='moderator')"));
assert(s.includes("'adminLevels':" )===false); // not an actual named key, exact structure expected
assert(index.includes('js/app.js?v=dlfr-v64-moderation-perf'));
assert(!s.includes('const liveStaffTables=[\'player_sanctions\',\'community_audit_log\',\'dlfr_level_archive_log\']'));
console.log('V64 — 17 contrôles statiques et fonctionnels validés');
// Mesure synthétique : l'ancien onglet construisait un élément par niveau dès
// l'ouverture de l'accueil de la modération, même lorsque l'éditeur était caché.
const a=s.indexOf('function packModerationEditor(){'), b=s.indexOf('\nfunction fillPackEditor(',a);
assert(a>=0&&b>a);
const packFn=s.slice(a,b);
const sample={
 state:{packsReady:true,staffRole:'owner',data:{
  demons:Array.from({length:1200},(_,i)=>({id:i+1,name:`Niveau ${i+1}`,position:i+1,is_public:true,legacy:false,unrated:false})),
  dlfr_level_packs:[]}},
 esc:x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
 key:x=>String(x).toLowerCase()
};
vm.runInNewContext(packFn+';this.html=packModerationEditor();',sample);
assert(sample.html.includes('Créer / modifier un Level Pack'));
assert((sample.html.match(/data-pack-level-row/g)||[]).length===1200);
assert(sample.html.length>100000);
console.log('Simulation Level Packs : 1200 contrôles / '+sample.html.length+' caractères HTML évités sur les autres onglets');

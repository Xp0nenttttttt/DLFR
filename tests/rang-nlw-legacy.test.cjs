const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const js=fs.readFileSync(path.resolve(__dirname,'../js/app.js'),'utf8');
function fn(name,next){
  const start=js.indexOf('function '+name+'(');
  const end=js.indexOf('\nfunction '+next+'(',start);
  assert(start>=0&&end>start,name+' extrait');
  return js.slice(start,end);
}
const snippet=fn('suggestedLegacyPosition','studioYoutubeThumbnail');
const state={data:{demons:[
 {id:1,name:'Top',position:140,is_public:true,legacy:false,unrated:false},
 {id:2,name:'NLW 1',position:151,is_public:true,legacy:false,unrated:false},
 {id:3,name:'NLW 6',position:156,is_public:true,legacy:false,unrated:false},
 {id:4,name:'Legacy',position:157,is_public:true,legacy:true,unrated:false}
]}};
const preview={textContent:''},confirm={style:{}},caption={innerHTML:''};
const document={getElementById(id){return ({levelStudioMoveNotice:preview,levelStudioTransferConfirm:confirm,levelStudioTransferCaption:caption,newLevelRankPreview:preview})[id]}};
const sandbox={state,document,console,Number,Math};
vm.createContext(sandbox);vm.runInContext(snippet,sandbox);
function form(id,position,legacy=false,is_public=true){return {
 dataset:{form:'levelStudio'}, elements:{demon_id:{value:String(id)},position:{value:String(position)},legacy:{checked:legacy},unrated:{checked:false},is_public:{checked:is_public},confirm_transfer:{value:''}}
}}
assert.equal(vm.runInContext('suggestedLegacyPosition()',sandbox),157);
assert.equal(vm.runInContext('suggestedLegacyPosition(1)',sandbox),156);
let f=form(1,155,false);
sandbox.updateStudioMovementPreview(f);
assert.match(preview.textContent,/Sortie du Top 150 #140 → NLW #5/);
assert.equal(confirm.style.display,'block');
assert.match(caption.innerHTML,/TRANSFERER/);
f=form(1,155,true);sandbox.updateStudioMovementPreview(f);
assert.match(preview.textContent,/position 156 ou plus/);
f=form(1,156,true);sandbox.updateStudioMovementPreview(f);
assert.match(preview.textContent,/Legacy/);
f=form(2,50,false);sandbox.updateStudioMovementPreview(f);
assert.match(preview.textContent,/Promotion NLW #1 → Top 150 #50/);
f=form(1,140,true);sandbox.updateStudioMovementPreview(f);
assert.match(preview.textContent,/doit être placé hors du Top 150/);
f=form(1,140,false);sandbox.updateStudioMovementPreview(f);
assert.equal(confirm.style.display,'none');
// A creation can pick its position, including outside the Top 150.
const cf={elements:{position:{value:'155'},legacy:{checked:false},unrated:{checked:false}}};
sandbox.updateNewLevelRankPreview(cf);
assert.match(preview.textContent,/Publication NLW #5/);
cf.elements.legacy.checked=true;sandbox.updateNewLevelRankPreview(cf);
assert.match(preview.textContent,/à partir de la position 157/);
cf.elements.position.value='157';sandbox.updateNewLevelRankPreview(cf);
assert.match(preview.textContent,/Publication Legacy/);
cf.elements.legacy.checked=false;cf.elements.unrated.checked=true;
sandbox.updateNewLevelRankPreview(cf);assert.match(preview.textContent,/Publication UNRATED/);
const sql=fs.readFileSync(path.resolve(__dirname,'../supabase/43_CORRECTIF_RANGS_NLW_LEGACY.sql'),'utf8');
assert(!sql.includes('transfert non prévu par ce correctif'));
assert(sql.includes('CREATE OR REPLACE FUNCTION public.dlfr_manual_publish_level_v3('));
assert(sql.includes('pg_advisory_xact_lock(41028,2)'));
assert(sql.includes("WHEN original.position<=150 AND p_position>150"));
assert(js.includes("db.rpc('dlfr_manual_publish_level_v3'"));
console.log('OK: aperçu transferts, suggestions Legacy, création NLW/UNRATED, migration liée.');

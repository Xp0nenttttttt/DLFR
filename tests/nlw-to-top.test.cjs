const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const sql = fs.readFileSync(path.join(root,'supabase/38_PROMOUVOIR_NLW_VERS_TOP150.sql'),'utf8');
const js = fs.readFileSync(path.join(root,'js/app.js'),'utf8');
assert.match(sql, /IF original\.position>150 AND p_position<=150 THEN/);
assert.match(sql, /original\.is_public IS NOT TRUE/);
assert.match(sql, /original\.legacy IS TRUE OR original\.unrated IS TRUE/);
assert.match(sql, /p_is_public IS DISTINCT FROM TRUE/);
assert.match(sql, /pg_advisory_xact_lock\(41028, 2\)/);
assert.match(sql, /ORDER BY position DESC LOOP/);
assert.match(sql, /ORDER BY position ASC LOOP/);
assert.match(sql, /LEVEL_NLW_TO_TOP/);
assert.match(js, /updateStudioMovementPreview\(form\)/);
assert.match(js, /f\.confirm_transfer!=='TRANSFERER'/);
assert.match(js, /p_position:pos/);

// Reproduit l'ordre des mises à jour pour valider la contrainte UNIQUE(position).
function move(rows, sourceId, to){
 const current = rows.find(x=>x.id===sourceId);
 const from = current.position;
 const parked = Math.max(...rows.map(x=>x.position),99999998)+1;
 function update(row,position){
   assert.equal(rows.some(x=>x!==row&&x.position===position),false,`collision à ${position}`);
   row.position=position;
 }
 update(current,parked);
 const shifting=rows.filter(x=>x!==current && (from>to
  ?x.position>=to&&x.position<from
  :x.position>from&&x.position<=to)).sort((a,b)=>from>to?b.position-a.position:a.position-b.position);
 for(const row of shifting)update(row,row.position+(from>to?1:-1));
 update(current,to);
 return rows;
}
const base=Array.from({length:156},(_,i)=>({id:i+1,position:i+1}));
base.push({id:999,position:1636}); // import technique masqué
const moved=move(base,155,40);
assert.equal(moved.find(x=>x.id===155).position,40);
assert.equal(moved.find(x=>x.id===40).position,41);
assert.equal(moved.find(x=>x.id===150).position,151);
assert.equal(moved.find(x=>x.id===154).position,155);
assert.equal(moved.find(x=>x.id===156).position,156);
assert.equal(moved.find(x=>x.id===999).position,1636);
assert.equal(new Set(moved.map(x=>x.position)).size,moved.length);

const withHoles=[1,2,5,40,150,151,155,156,1600].map((p,i)=>({id:i+1,position:p}));
const source=withHoles.find(x=>x.position===155).id;
move(withHoles,source,30);
assert.equal(withHoles.find(x=>x.id===source).position,30);
assert.equal(new Set(withHoles.map(x=>x.position)).size,withHoles.length);
console.log('DLFR 2.5 : tests promotion NLW -> Top 150 OK');

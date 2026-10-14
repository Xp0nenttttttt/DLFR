const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css/style.css'),'utf8');
assert.match(html, /<details class="nav-menu" data-nav-group="classements">/);
assert.match(html, /<details class="nav-menu" data-nav-group="communaute">/);
assert.match(html, /<details class="nav-menu" data-nav-group="compte">/);
assert.equal((html.match(/<details class="nav-menu"/g)||[]).length,3);
assert.match(html, /href="\?page=honors"/);
assert.match(app, /\['honors','hall','achievements'\]\.includes\(page\)\?honorsPage\(page\)/);
assert.match(css, /\.nav-menu-panel/);
assert.ok(!html.includes('assets/flags/'));
const snippet=app.slice(app.indexOf('function honorsPage('),app.indexOf('function showPageError('));
assert.ok(snippet.startsWith('function honorsPage('));
const source={hall_of_fame:[
 {id:1,is_published:true,headline:'Top 1 France',award_year:2025,category:'Rang',player_key:'alice',description:'Gagnant'},
 {id:2,is_published:false,headline:'Secret',award_year:2026,category:'Rang',player_key:'alice'}],
 fr_achievements:[{id:3,title:'Run exceptionnel',level_name:'Cognition',run_text:'35–100',player_key:'bob',created_at:'2026-10-12T09:00:00Z',description:'Une belle run'}]};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const make=(search,staff=false)=>{
 const context={state:{data:source,staff},location:{search},URLSearchParams,Date,Number,Set,plain:v=>String(v??'').trim(),key:v=>String(v??'').toLowerCase(),
 url:(page,q={})=>'?' + new URLSearchParams({page,...q}).toString(),date:x=>x?'12 oct. 2026':'',http:x=>x||'',esc,v2Header:(title,desc)=>`<header><h1>${title}</h1>${desc}</header>`};
 vm.createContext(context);vm.runInContext(snippet,context);return context.honorsPage(new URLSearchParams(search).get('page')||'honors');
};
let out=make('?page=honors');
assert.equal((out.match(/class="honors-card /g)||[]).length,2);
assert.ok(out.includes('Top 1 France') && out.includes('Run exceptionnel'));
assert.ok(!out.includes('Secret'));
assert.ok(out.includes('Distinctions') && out.includes('Exploits FR'));
out=make('?page=honors&tab=hall');
assert.ok(out.includes('Top 1 France')&&!out.includes('Run exceptionnel'));
out=make('?page=honors&tab=achievements');
assert.ok(out.includes('Run exceptionnel')&&!out.includes('Top 1 France'));
out=make('?page=hall');assert.ok(out.includes('Top 1 France')&&!out.includes('Run exceptionnel'));
out=make('?page=achievements');assert.ok(out.includes('Run exceptionnel')&&!out.includes('Top 1 France'));
out=make('?page=honors',true);assert.ok(out.includes('Secret'));
console.log('Navigation V2.6 + Palmarès (filtres, anciennes routes, publications) PASS');

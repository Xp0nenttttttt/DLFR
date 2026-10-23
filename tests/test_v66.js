'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/app.js','utf8');
const index = fs.readFileSync('index.html','utf8');
const take=(first,last)=>{
  const a=source.indexOf(first); const b=source.indexOf(last,a+1);
  assert.ok(a>=0&&b>a,`Could not extract ${first}`);
  return source.slice(a,b);
};
assert.match(index,/js\/app\.js\?v=dlfr-v68-priorite-verificateur-officiel/);
assert.ok(!source.includes('Les détails des niveaux hors liste ne sont pas affichés'));
assert.ok(source.includes('<h3>Top 75 complété</h3>')&&source.includes('<h3>76–150 complété</h3>'));
assert.ok(!source.includes('<h3>Liste héritée complétée'));
assert.ok(source.includes("if(isUnrated&&state.staffRole!=='moderator')")); // V63 preserved
assert.ok(source.includes("state.adminTab==='packs'?packModerationEditor():''")); // V64 preserved
const levels=[
  {id:1,name:'Top 1',position:1,is_public:true},
  {id:2,name:'Top 75',position:75,is_public:true},
  {id:3,name:'Extended 76',position:76,is_public:true},
  {id:4,name:'Extended 150',position:150,is_public:true},
  {id:5,name:'NLW First',position:151,is_public:true},
  {id:6,name:'NLW Fifth',position:155,is_public:true},
  {id:7,name:'NLW Tenth',position:160,is_public:true},
  {id:8,name:'Legacy Removed',position:158,legacy:true,is_public:true},
  {id:9,name:'Hidden NLW',position:170,is_public:false},
  {id:10,name:'UNRATED Removed',position:100000010,unrated:true,is_public:true},
];
const player={player_key:'alice',username:'alice',display_name:'Alice',country_code:'FR',has_account:true,main:[levels[0],levels[1]],extended:[levels[2],levels[3]],beyond:[levels[6],levels[4],levels[5],levels[5],levels[7],levels[8],levels[9]],legacy:[],progress:[],created:[],published:[],verified:[],total_completions:7,score:0,rank:1};
const state={data:{player_profiles:[],player_stat_snapshots:[],completions:[],players:[],clans:[],hall_of_fame:[]},profileTab:'records',statsYear:'all',communityReady:false};
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
const ctx={state,COMMUNITY:{hex:()=> '#556677'},GEO:{regionInfo:()=>({name:'France'})},
  V2:{nlwRank:d=>d&&!d.legacy&&!d.unrated&&Number(d.position)>150&&Number(d.position)<100000000?Number(d.position)-150:0},
  esc,key:x=>String(x??'').toLowerCase(),plain:x=>String(x??''),fmt:x=>String(x??0),num:x=>Number(x)||0,
  url:(page,params)=>`/${page}/${params?.id??''}`,flag:()=>'',regionIdentity:()=>'',
  imageLink:()=>'',avatarOf:()=>'',framedAvatar:(_,html)=>html,
  catalog:()=>levels,box:(label,val)=>`<span>${label}: ${val}</span>`,
  date:x=>x,hardestLabel:()=>'',unratedData:()=>({players:[]}),
  communityPublicPanel:()=>'',profileRecentActivity:()=>'',titleHTML:()=>' ',
  http:()=>'',lineGraph:()=>'',graphRank:()=>'',barGraph:()=>' ',
  yearsFromRecords:()=>[]};
vm.createContext(ctx);
vm.runInContext(take('function recordTable(p){','function discordPanel(')+take('function completionLinks(levels){','function titleHTML(')+take('function statProfile(p){','// DLFR 2.2'),ctx);
const rendered=ctx.statProfile(player);
assert.match(rendered,/NLW — 3 niveau\(x\) complété\(s\)/);
const nlw=rendered.split('NLW — 3 niveau(x) complété(s)</h3>')[1].split('</div>')[0];
assert.ok(nlw.includes('NLW #1 NLW First')&&nlw.includes('NLW #5 NLW Fifth')&&nlw.includes('NLW #10 NLW Tenth'));
assert.ok(nlw.indexOf('NLW #1 ')<nlw.indexOf('NLW #5 ')&&nlw.indexOf('NLW #5 ')<nlw.indexOf('NLW #10 '));
assert.equal((nlw.match(/NLW #5 /g)||[]).length,1,'No duplicate NLW links');
for(const blocked of ['Legacy Removed','Hidden NLW','UNRATED Removed'])assert.ok(!nlw.includes(blocked));
assert.match(nlw,/href="\/demon\/6"/);
const main=rendered.split('<h3>Top 75 complété</h3>')[1].split('</div>')[0];
const ext=rendered.split('<h3>76–150 complété</h3>')[1].split('</div>')[0];
assert.ok(main.includes('Top 1')&&main.includes('Top 75')&&!main.includes('NLW First'));
assert.ok(ext.includes('Extended 76')&&ext.includes('Extended 150')&&!ext.includes('NLW Fifth'));
const empty=ctx.statProfile({...player,beyond:[]});
assert.match(empty,/NLW — 0 niveau\(x\) complété\(s\)/);
assert.ok(empty.split('NLW — 0 niveau(x) complété(s)</h3>')[1].includes('Aucun'));
assert.equal(ctx.nlwCompletionLinks([]),'<span class="muted">Aucun</span>');
console.log('V66 OK : classement et liens NLW, dédoublonnage, exclusions, absence de records, Top 75/Extended, cache JS, V63/V64');

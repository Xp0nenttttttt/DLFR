'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const app=fs.readFileSync('js/app.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const between=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i+1);assert(i>=0&&j>i,`missing ${a}`);return app.slice(i,j);};
assert(index.includes('js/app.js?v=dlfr-v65-profile-top75-extended'));
assert(!app.includes('<h3>Top 150 complété</h3>'));
assert(!app.includes('<h3>Liste héritée complétée'));
assert(app.includes('<h3>Top 75 complété</h3>'));
assert(app.includes('<h3>76–150 complété</h3>'));
assert(!app.includes("['Legacy',p.legacy.length,other.legacy.length]"));
assert(app.includes("if(isUnrated&&state.staffRole!=='moderator')")); // V63
assert(app.includes("state.adminTab==='packs'?packModerationEditor():''")); // V64
const levels=[{id:1,name:'Top #1',position:1},{id:2,name:'Top #75',position:75},{id:3,name:'Extended #76',position:76},{id:4,name:'Extended #150',position:150},{id:5,name:'Old legacy',position:20,legacy:true}];
const testPlayer={player_key:'alice',username:'alice',display_name:'Alice',country_code:'FR',has_account:true,main:[levels[0],levels[1],levels[4]],extended:[levels[2],levels[3]],beyond:[],legacy:[levels[4]],progress:[],created:[],published:[],verified:[],total_completions:4,score:0,rank:1};
const state={data:{player_profiles:[],player_stat_snapshots:[],completions:[{player:'alice',demon_id:1,progress:100,created_at:'2026-01-01'},{player:'alice',demon_id:5,progress:100,created_at:'2026-01-02'}],players:[],clans:[],hall_of_fame:[]},profileTab:'records',statsYear:'all',communityReady:false};
const esc=x=>String(x??''), key=x=>String(x??'').toLowerCase(), plain=x=>String(x??'');
const ctx={
 state,COMMUNITY:{hex:()=> '#556677'},GEO:{regionInfo:()=>({name:'France'})},
 esc,key,plain,fmt:x=>String(x??0),num:x=>Number(x)||0,
 url:(what,opts)=>`/${what}/${opts?.id||''}`,flag:()=>'',regionIdentity:()=>'',
 imageLink:()=>'',avatarOf:()=>'',framedAvatar:(x,content)=>content,
 catalog:()=>levels,box:(label,v)=>`<span>${label}: ${v}</span>`,
 date:x=>x,hardestLabel:()=>'',unratedData:()=>({players:[]}),
 communityPublicPanel:()=>'',profileRecentActivity:()=>'',titleHTML:()=>'',
 http:()=>'',lineGraph:()=>'',graphRank:()=>'',barGraph:()=>'',
 yearsFromRecords:()=>[],
};
const source=between('function recordTable(p){','function discordPanel(')+between('function completionLinks(levels){','function titleHTML(')+between('function statProfile(p){','// DLFR 2.2');
vm.createContext(ctx);vm.runInContext(source,ctx);
const html=ctx.statProfile(testPlayer);
assert(html.includes('Top 75 complété'));
assert(html.includes('76–150 complété'));
const main=html.split('<h3>Top 75 complété</h3>')[1].split('</div>')[0];
const extended=html.split('<h3>76–150 complété</h3>')[1].split('</div>')[0];
assert(main.includes('#1') && main.includes('#75'));
assert(!main.includes('#76')&&!main.includes('#150')&&!main.includes('Old legacy'));
assert(extended.includes('#76')&&extended.includes('#150'));
assert(!/#1(?!\d)/.test(extended)&&!/#75(?!\d)/.test(extended));
assert(!html.includes('Liste héritée complétée'));
assert(!html.includes('Vérification dans les archives historiques'));
assert(!html.includes('Old legacy'));
assert(!html.includes(' Legacy, '));
assert(ctx.recordTable(testPlayer).includes('Top #1'));
assert(!ctx.recordTable(testPlayer).includes('Old legacy'));
assert(html.includes('NLW'));
console.log('V65: sections Main/Extended, exclusion Legacy, tableaux, V63/V64 et cache-busting OK');

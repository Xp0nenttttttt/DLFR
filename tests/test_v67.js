'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('js/app.js','utf8');
const index=fs.readFileSync('index.html','utf8');
assert.ok(index.includes('js/app.js?v=dlfr-v67-first-fr-verifier-nlw'));
const take=(first,last)=>{const a=source.indexOf(first);const b=source.indexOf(last,a+first.length);assert(a>=0&&b>a,`Missing ${first}`);return source.slice(a,b);};
const nlwRank=d=>!d.unrated&&!d.legacy&&d.is_public!==false&&Number(d.position)>150&&Number(d.position)<100000000?Number(d.position)-150:0;
const all=[
 {id:1,position:216,name:'Spectrum Cyclone',first_fr_player:'GDonut',verifier:null,publisher:'Temp',is_public:true,requirement:100},
 {id:2,position:64,name:'Main Demon',first_fr_player:'FrenchFirst',verifier:'ActualVerifier',publisher:'ABC',is_public:true},
 {id:3,position:150,name:'Extended Demon',first_fr_player:'FrenchFirst',verifier:'ExtendedVerifier',publisher:'ABC',is_public:true},
 {id:4,position:222,name:'NLW No FR',first_fr_player:null,verifier:'RealVerifier',publisher:'Someone',is_public:true},
 {id:5,position:100000023,name:'UNRATED',unrated:true,first_fr_player:'FrenchFirst',verifier:'UnratedVerifier',publisher:'Someone',is_public:true},
 {id:6,position:217,name:'NLW unknown',first_fr_player:'À renseigner',verifier:'KnownVerifier',publisher:'Someone',is_public:true},
];
const captured=[];
const ctx={
 V2:{nlwRank},plain:v=>String(v??'').trim(),num:v=>Number(v)||0,
 esc:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;'),
 http:()=>'',score:()=>0,nlwPoints:()=>12,fmt:n=>String(n),
 url:(page,opts)=>`/${page}/${opts?.id||''}`,cfg:()=>({extended_limit:150,main_limit:75}),
 catalog:()=>all,templateNotice:()=>'',
 state:{data:{completions:[],demon_position_history:[]}},
 ranked:()=>[],statsPlayerVisible:()=>true,date:()=>'',
 window:{DLFR_LEVEL_CINEMA:{render:(d,o)=>{captured.push({d,o});return `<section>${d.verifier}</section>`;}},
   DLFR_BULK:{proof:()=>''},DLFR_CLAIMS:{claimPanel:()=>''},DLFR_NLW_MEDIA:{thumbnail:()=>''}},
 productionProofMedia:()=>'',
 URLSearchParams,
 location:{search:'?id=1'}
};
vm.createContext(ctx);
vm.runInContext(take('function displayedLevelVerifier(d){','// Évite les doublons quand un niveau historique'),ctx);
vm.runInContext(take('function demonPage(){','function newsPage(){'),ctx);
assert.equal(ctx.displayedLevelVerifier(all[0]),'GDonut');
assert.equal(ctx.displayedLevelVerifier(all[1]),'ActualVerifier');
assert.equal(ctx.displayedLevelVerifier(all[2]),'ExtendedVerifier');
assert.equal(ctx.displayedLevelVerifier(all[3]),'RealVerifier');
assert.equal(ctx.displayedLevelVerifier(all[4]),'UnratedVerifier');
assert.equal(ctx.displayedLevelVerifier(all[5]),'KnownVerifier');
const html=ctx.cardsHTML(all);
const card=(name)=>html.split(` - ${name}</a></h2>`)[1]?.split('</article>')[0] || '';
assert.ok(card('Spectrum Cyclone').includes('vérifié par <b>GDonut</b>'));
assert.ok(card('Main Demon').includes('vérifié par <b>ActualVerifier</b>'));
assert.ok(card('NLW No FR').includes('vérifié par <b>RealVerifier</b>'));
ctx.demonPage();
assert.equal(captured.at(-1).d.verifier,'GDonut');
assert.equal(all[0].verifier,null,'No mutation of stored Demon object');
assert.equal(captured.at(-1).d.first_fr_player,'GDonut','Timeline source kept');
ctx.location.search='?id=2';ctx.demonPage();
assert.equal(captured.at(-1).d.verifier,'ActualVerifier');
ctx.location.search='?id=5';ctx.demonPage();
assert.equal(captured.at(-1).d.verifier,'UnratedVerifier');
console.log('V67 OK: NLW first French winner, fallback, no impact on Main/Extended/UNRATED, no Supabase data mutation.');

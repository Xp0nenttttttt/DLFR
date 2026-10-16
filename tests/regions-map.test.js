const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const moduleRegions=require('../js/regions-map.js');
const {summarize,bestCompleted,hasPublicActivity,validateGeojson,featurePath,draw}=moduleRegions;
const REGIONS=[{code:'BRE',name:'Bretagne'},{code:'IDF',name:'Île-de-France'},{code:'GP',name:'Guadeloupe'}];
const players=[
 {player_key:'alice',username:'Alice',country_code:'FR',score:200,nlwScore:25,main:[{id:1,name:'Amethyst',position:3}],total_completions:1,verified:[]},
 {player_key:'bob',username:'Bob',country_code:'FR',score:100,nlwScore:10,main:[],beyond:[{id:5,name:'Shardscapes',position:155}],verified:[{id:5}]},
 {player_key:'charlie',username:'Charlie',country_code:'FR',score:0,main:[],verified:[]},
 {player_key:'unknown',username:'Unknown',country_code:'FR',score:400,main:[],verified:[]},
 {player_key:'someone',username:'Someone',country_code:'BE',score:900,main:[],verified:[]},
 {player_key:'hidden',username:'Hidden',country_code:'FR',score:999,hidden_from_stats:true,main:[]}
];
const profiles=[{player_key:'alice',region_code:'BRE'},{player_key:'bob',region_code:'BRE'},{player_key:'charlie',region_code:'IDF'},{player_key:'unknown',region_code:''},{player_key:'someone',region_code:'BRE'},{player_key:'hidden',region_code:'BRE'}];
const regions=summarize(players,profiles,REGIONS);
assert.equal(regions.BRE.players.length,2);
assert.equal(regions.BRE.active,2);
assert.equal(regions.BRE.points,300);
assert.equal(regions.BRE.nlwPoints,35);
assert.equal(regions.BRE.top.player_key,'alice');
assert.equal(regions.BRE.hardest.level.name,'Amethyst');
assert.equal(regions.IDF.players.length,1);
assert.equal(regions.IDF.active,0);
assert.equal(regions.GP.players.length,0);
assert.equal(hasPublicActivity(players[2]),false);
assert.equal(bestCompleted(players[1]).name,'Shardscapes');
assert.match(draw('BRE'),/data-region-code="BRE"/);
assert.match(draw('BRE'),/carte schématique/i);
const collection={type:'FeatureCollection',features:Array.from({length:13},(_,i)=>({type:'Feature',properties:{code:Object.keys(moduleRegions.regionIds)[i]},geometry:{type:'Polygon',coordinates:[[[0,48],[1,48],[1,49],[0,48]]]}}))};
assert.equal(validateGeojson(collection).length,13);
assert.match(featurePath(collection.features[0]),/^M/);
assert.throws(()=>validateGeojson({type:'FeatureCollection',features:[]}),/13 régions/);
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const start=source.indexOf('// DLFR 2.2 — Carte et classements régionaux');
const end=source.indexOf('function lineGraph(data)',start);
assert.ok(start>=0 && end>start);
const ctx={
 REGION_MAP:moduleRegions,
 state:{regionsGeometryRequested:true,selectedRegion:'BRE',regionsSort:'points',data:{player_profiles:profiles}},
 ranked:()=>players,statsPlayerVisible:p=>!p.hidden_from_stats,
 GEO:{regions:REGIONS,regionInfo:id=>REGIONS.find(r=>r.code===id)||null,regionImage:id=>`[DRAPEAU ${id}]`},
 regionFor:p=>profiles.find(x=>x.player_key===p.player_key)?.region_code||'',
 fmt:n=>Number(n||0).toFixed(2),url:(page,p={})=>'?' + new URLSearchParams({page,...p}),
 esc:x=>String(x??''),fullName:p=>p.display_name||p.username||p.player_key,
 box:(a,b)=>`${a}=${b}`,templateNotice:()=>'',Number,Math,Object,String,console
};
vm.createContext(ctx);
vm.runInContext(source.slice(start,end),ctx);
const html=ctx.regionsPage();
assert.match(html,/Carte interactive/);
assert.match(html,/Classement interrégional/);
assert.match(html,/Alice/);
assert.match(html,/Amethyst/);
assert.match(html,/data-region-code="GP"/);
console.log('DLFR 2.2 carte + statistiques : OK');

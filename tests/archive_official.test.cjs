const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const js = fs.readFileSync(path.resolve(__dirname,'../js/app.js'),'utf8');
const start = js.indexOf('function historicalArchiveWithoutPublishedLevels(');
const end = js.indexOf('\nfunction nlwListCards(',start);
assert(start >= 0 && end > start, 'helper archive présent');
const sandbox = {
 plain:s => String(s ?? '').trim(),
 key:s => String(s ?? '').trim().toLocaleLowerCase('fr'),
 Number,Set,
};
vm.createContext(sandbox);
vm.runInContext(js.slice(start,end),sandbox);
const remove = (archive,published) => sandbox.historicalArchiveWithoutPublishedLevels(archive,published);
const old = [
 {name:'RUTHLESS',old_position:151,level_id:'85612571'},
 {name:'Shardscapes',old_position:155,level_id:'79997992'},
 {name:'Archives seulement',old_position:202,level_id:'123'},
];
const top = [{name:'RUTHLESS',level_id:'85612571',position:140,is_public:true,legacy:false,unrated:false}];
const nlw = [{name:'Shardscapes',level_id:'79997992',position:155,is_public:true,legacy:false,unrated:false}];
assert.deepEqual(Array.from(remove(old,[...top,...nlw]), x=>x.name),['Archives seulement']);
assert.deepEqual(Array.from(remove(old,[]), x=>x.name),['RUTHLESS','Shardscapes','Archives seulement']);
assert.deepEqual(Array.from(remove(old,[{...top[0],is_public:false}]), x=>x.name),['RUTHLESS','Shardscapes','Archives seulement']);
assert.deepEqual(Array.from(remove(old,[{...top[0],legacy:true}]), x=>x.name),['RUTHLESS','Shardscapes','Archives seulement']);
assert.deepEqual(Array.from(remove(old,[{...top[0],level_id:'DIFFERENT'}]), x=>x.name),['RUTHLESS','Shardscapes','Archives seulement']);
assert.deepEqual(Array.from(remove(old,[{...top[0],level_id:''}]), x=>x.name),['Shardscapes','Archives seulement']);
assert.deepEqual(Array.from(remove([{name:'RUTHLESS'}],top), x=>x.name),[]);
assert.match(js,/historicalArchiveWithoutPublishedLevels\(oldArchive\(\),catalogLevels\)/);
console.log('OK — archives retirées pour les niveaux publiés Top 150 et NLW.');

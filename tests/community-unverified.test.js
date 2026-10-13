const assert=require('node:assert/strict');
const U=require('../js/community-unverified.js');
const rows=U.fromSheet([
 {'Nom':'Eclipse Impossible','Rang AREDL':401,'Vérifié':'Non','Vidéo':'https://youtu.be/123','Commentaire':'Attente'},
 {'Nom':'Nuit de Cristal','Rang AREDL':'500','Vérifié':'Oui'},
 {'Nom':'Collision Level','Vérifié':false},
 {'Nom':'Collision Level','Vérifié':false},
 {'Nom':''}
]);
assert.equal(rows.length,3,'ignorer doublons et noms vides');
assert.equal(rows[0].aredl_rank,'401');
assert.equal(rows[1].verified,true);
assert.equal(rows[0].verified,false);
assert.equal(U.normalize('Éclipse  ImPoSsible'),U.normalize('Eclipse Impossible'));
const demons=[{name:'Eclipse Impossible',verifier:'spleen'},{name:'Collision Level',verifier:'non vérifié'}];
let result=U.classify(rows,demons);
assert.deepEqual(result.available.map(x=>x.name),['Collision Level']);
assert.deepEqual(result.verified.map(x=>x.name),['Eclipse Impossible','Nuit de Cristal']);
result=U.classify(rows,[]);
assert.equal(result.available.length,2,'sans demons, seul le statut Excel fait foi');
assert.equal(U.verifiedOnSite(rows[2],demons),false);
assert.equal(U.fromSheet([{'Nom':'Dédoublonné','Vérifié':'Non'},{'Nom':'dédoublonné','Vérifié':'Oui'}])[0].verified,true);
assert.throws(()=>U.fromSheet([{'Unknown':'X'}]),/Nom/);
// Une complétion 100 % d’un démon français valide la sortie automatique.
const catalog=[{id:123,name:'Crimson Dream',level_id:'777',verifier:''},{id:444,name:'Future Chaos',level_id:'888',verifier:'-'}];
const entries=U.fromSheet([
 {'Column1.name':'Crimson Dream','Column1.level_id':777,'Vérifié communauté':'Non'},
 {'Column1.name':'Future Chaos','Column1.level_id':888,'Vérifié communauté':'Non'},
 {'Column1.name':'Nom inventé','Column1.level_id':12345,'Vérifié communauté':'Oui'}
]);
const onlyPartial=[{demon_id:123,progress:68}];
assert.equal(U.classify(entries,catalog,onlyPartial).available.length,2,'68 % ne signifie pas complété');
let matched=U.classify(entries,catalog,[{demon_id:123,progress:100,player:'Spleen'}]);
assert.deepEqual(matched.available.map(x=>x.name),['Future Chaos']);
assert.equal(matched.verified.find(x=>x.name==='Crimson Dream').verification_source,'Complétion 100 % sur la Demonlist');
assert.equal(matched.verified.find(x=>x.name==='Crimson Dream').demonlist_id,123);
assert.equal(matched.confirmedOnSite,1);
assert.equal(matched.confirmedManual,1);
assert.equal(U.findOnDemonlist({name:'Crimson Dream',level_id:'888'},catalog).id,444,'priorité à l’ID GD en cas d’homonyme');
assert.equal(U.verifiedOnSite({name:'Crimson Dream',level_id:'999'},catalog),false,'un autre ID GD ne prouve rien');
console.log('OK: retrait par vérificateur, 100 %, Excel ; pas par 68 % ou nom seul si ID différent');

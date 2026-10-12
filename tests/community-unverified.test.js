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
console.log('OK: communauté non vérifiée + filtrage statut Excel + vérification Demonlist');

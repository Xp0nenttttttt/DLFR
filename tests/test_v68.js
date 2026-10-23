'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const js = fs.readFileSync('js/app.js','utf8');
const html = fs.readFileSync('index.html','utf8');
assert.ok(html.includes('js/app.js?v=dlfr-v68-priorite-verificateur-officiel'));
const start=js.indexOf('function displayedLevelVerifier(d){');
const end=js.indexOf('function cardsHTML(demons){',start);
assert.ok(start>=0 && end>start);
assert.ok(js.includes('esc(displayedLevelVerifier(d))'),'cartes NLW doivent utiliser le crédit affiché');
assert.ok(js.includes('verifier:displayedLevelVerifier(d)'),'fiche cinéma doit utiliser le crédit affiché');
assert.ok(js.includes("db.rpc('dlfr_review_verification_claim'"),'réclamations toujours présentes');
const ctx = {
 V2:{nlwRank:d=>d.is_public===false||d.legacy||d.unrated?0:Number(d.position)>150&&Number(d.position)<100000000?Number(d.position)-150:0},
 state:{data:{players:[{legacy_id:503,username:'VerifierLie',display_name:'Vérificateur lié',player_key:'verified_user'}]}},
 plain:v=>String(v??'').trim(),
 sortPlayerName:p=>String(p?.display_name||p?.username||p?.player_key||'').trim(),
 Number,
};
vm.createContext(ctx);
vm.runInContext(js.slice(start,end),ctx);
const show=ctx.displayedLevelVerifier;
assert.equal(show({position:216,first_fr_player:'GDonut',verifier:'À renseigner',verifier_user_id:null}),'GDonut','sans revendication, premier FR');
assert.equal(show({position:216,first_fr_player:'GDonut',verifier:'NouveauVérif',verifier_user_id:503}),'NouveauVérif','vérification liée prioritaire');
assert.equal(show({position:216,first_fr_player:'GDonut',verifier:'À renseigner',verifier_user_id:503}),'Vérificateur lié','vérification liée avec crédit manquant');
assert.equal(show({position:216,first_fr_player:'GDonut',verifier:'AncienNom',verifier_user_id:null}),'GDonut','le texte seul ne prouve pas la revendication');
assert.equal(show({position:216,first_fr_player:'',verifier:'CréditHistorique',verifier_user_id:null}),'CréditHistorique','fallback crédit existant');
assert.equal(show({position:216,first_fr_player:'',verifier:'À renseigner',verifier_user_id:null}),'À renseigner','fallback vide');
assert.equal(show({position:64,first_fr_player:'GDonut',verifier:'Top150Officiel',verifier_user_id:null}),'Top150Officiel','Top 150 inchangé');
assert.equal(show({position:100000066,unrated:true,first_fr_player:'GDonut',verifier:'UnratedVerifier',verifier_user_id:503}),'UnratedVerifier','UNRATED inchangé');
assert.equal(show({position:216,legacy:true,first_fr_player:'GDonut',verifier:'LegacyVerifier',verifier_user_id:503}),'LegacyVerifier','Legacy inchangé');
assert.equal(show({position:216,first_fr_player:'GDonut',verifier_user_id:0,verifier:'À renseigner'}),'GDonut','id=0 non revendiqué');
console.log('V68 OK : vérification liée > premier FR > crédit connu, cas Top150/UNRATED/Legacy, demandes maintenues.');

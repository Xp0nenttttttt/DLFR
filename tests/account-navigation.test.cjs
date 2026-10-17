const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const app=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
test('formulaires pseudo et mot de passe existants',()=>{assert.match(app,/data-form="usernameLogin"/);assert.match(app,/data-form="usernameRegister"/);});
test('affiche un lien de connexion clair',()=>{assert.match(app,/Se connecter \/ Créer un compte/);});
test('les droits de modération restent gérés par le serveur',()=>{assert.match(app,/await checkStaff\(\)/);});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync(__dirname+'/../js/app.js','utf8');
const prod=fs.readFileSync(__dirname+'/../js/production-tools.js','utf8');
const sql=fs.readFileSync(__dirname+'/../supabase/39_MODERATION_NETTOYAGE_APERCUS.sql','utf8');
test('Le formulaire Attribuer une victoire est retiré',()=>{
 assert.equal(prod.includes('Attribuer une victoire'),false);
 assert.equal(prod.includes('prodCompletion'),false);
 assert.ok(prod.includes('prodScopedReview'));
});
test('Les niveaux masqués sont listés sans perte de records',()=>{
 assert.ok(app.includes('state.unpublishedAredlDemons||[]'));
 assert.ok(app.includes("data-form=\"deleteHiddenLevel\""));
 assert.ok(sql.includes('dlfr_preview_hidden_demon_delete'));
 assert.ok(sql.includes('dlfr_delete_hidden_demon'));
 assert.ok(sql.includes('v_blockers'));
 assert.ok(sql.includes("r.role='owner'"));
 assert.ok(sql.includes('FOR UPDATE'));
 assert.ok(!sql.includes('DELETE FROM public.completions'));
});
test('Les prévisualisations ne donnent jamais les droits aux autres rôles',()=>{
 for(const role of ['nlw','moderator','supermoderator'])assert.ok(app.includes(`'${role}'`));
 assert.ok(app.includes('ownerPreviewActive()'));
 assert.ok(app.includes('APERÇU — LECTURE SEULE'));
 assert.ok(app.includes('stopImmediatePropagation'));
 assert.ok(app.includes('roleChoice.dataset.ownerPreviewRole'));
 assert.ok(!app.includes("state.staffRole=role"));
});

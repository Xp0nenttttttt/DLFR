const assert=require('node:assert/strict');
const fs=require('node:fs');
const PROD=require('../js/production-tools.js');
const demo=[
{id:11,level_name:'Amethyst',player:'A',progress:100,video_url:'https://youtu.be/abc',raw_footage_url:'https://youtu.be/def',position:50,claim_status:'free'},
{id:12,level_name:'Shardscapes',player:'B',progress:100,position:155,video_url:'https://youtu.be/xyz',claim_status:'mine',claim_expires_at:'2026-10-17T19:00:00Z'},
{id:13,level_name:'Cognition',player:'C',progress:100,position:100,video_url:'https://youtu.be/cba',claim_status:'other'}
];
const html=PROD.scopedReview({staffRole:'moderator',scopedQueue:demo});
for(const t of ['data-review-claim="random"','data-review-claim="11"','data-review-manage="renew"','data-review-manage="release"','data-form="prodScopedReview"','En cours chez les autres'])assert(html.includes(t),t);
assert.equal((html.match(/data-form="prodScopedReview"/g)||[]).length,1,'Only claimed items may show approval UI');
const app=fs.readFileSync(__dirname+'/../js/app.js','utf8');
for(const t of ["db.rpc('dlfr_claim_review'","db.rpc('dlfr_manage_review_claim'","db.rpc('dlfr_review_queue_status'"])assert(app.includes(t),t);
const sql=fs.readFileSync(__dirname+'/../supabase/48_FILE_MODERATION_ALEATOIRE.sql','utf8');
for(const t of ['pg_advisory_xact_lock(41028, 23)','SKIP LOCKED','dlfr_check_review_assignment_before_update','a.moderator_id IS DISTINCT FROM auth.uid()'])assert(sql.includes(t),t);
console.log('PASS review queue UI and server guards present');

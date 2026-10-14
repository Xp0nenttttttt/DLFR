'use strict';
const assert=require('node:assert/strict');
const M=require('../js/nlw-media.js');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
assert.equal(M.youtubeId('https://youtu.be/OKEHsJPaeQY?t=1'),'OKEHsJPaeQY');
assert.equal(M.youtubeId('https://youtube.com/watch?v=OKEHsJPaeQY'),'OKEHsJPaeQY');
assert.equal(M.youtubeId('https://youtu.be/bad'),'');
assert.equal(M.youtubeId('https://notyoutube.com/watch?v=OKEHsJPaeQY'),'');
assert.equal(M.safeUrl('javascript:alert(1)'),'');
assert.equal(M.setApproved({levels:[{approved:false,records_complete:true,gd_level_id:'123'}]}),0);
assert.equal(M.renderForLevel({level_id:'123'},esc),'');
const payload={gd_level_id:'123',approved:true,records_complete:true,verifiers:[{
  player:{name:'Test <script>',country:'FR'},video_url:'https://youtu.be/OKEHsJPaeQY'}],
  first_fr_be:{status:'first_dated_record',player:{name:'Premier',country:'BE'},
    completed_at:'2024-01-01T10:00:00Z',video_url:'https://youtube.com/watch?v=OKEHsJPaeQY'}};
assert.equal(M.setApproved({levels:[payload]}),1);
const html=M.renderForLevel({level_id:'123'},esc);
assert.match(html,/Premier record FR \/ BE daté retrouvé/);
assert.match(html,/i.ytimg.com\/vi\/OKEHsJPaeQY\/hqdefault.jpg/);
assert.match(html,/Test &lt;script&gt;/);
assert.doesNotMatch(html,/<script>/);
assert.equal(M.renderForLevel({level_id:'124'},esc),'');
console.log('OK: JS NLW media thumbnails + approved only');

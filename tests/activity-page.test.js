const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.match(html,/js\/activity-feed\.js\?v=dlfr21-1/);
assert.match(html,/href="\?page=activity" data-link="activity"/);
assert.match(app,/page==='activity'\?activityPage\(\)/);
const begin=app.indexOf('// DLFR 2.1 — fil communautaire');
const end=app.indexOf('function statProfile(p)');
assert.ok(begin>0&&end>begin);
const data={players:[{player_key:'alice',display_name:'Alice'},{player_key:'bob',display_name:'Bob'}],player_profiles:[],demons:[{id:1,name:'Awesome Level',thumbnail_url:''}],completions:[{id:9,player:'alice',demon_id:1,progress:100,created_at:'2026-10-15T12:00:00Z'}],badge_awards:[],dlfr_profile_follows:[{follower_key:'bob',followed_key:'alice'}]};
const ctx={window:{},Date,Number,Map,Set,Math,URLSearchParams,
 state:{data,ownKey:'bob',activityTab:'following',communityReady:true},
 COMMUNITY:{following:(d,k)=>d.dlfr_profile_follows.filter(x=>x.follower_key===k)},
 BADGES:{definitions:[],visibleAwards:()=>[]},
 url:(page,p={})=>'?' + new URLSearchParams({page,...p}),
 esc:(x)=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 date:()=> '15 oct. 2026',avatarOf:()=>'',sortPlayerName:p=>p?.display_name||p?.player_key||'',imageLink:()=>'',http:()=>'',templateNotice:()=>'',
 ranked:()=>data.players,statsPlayerVisible:p=>!p.hidden_from_stats};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'js/activity-feed.js'),'utf8'),ctx);
ctx.ACTIVITY=ctx.window.DLFR_ACTIVITY;
vm.runInContext(app.slice(begin,end),ctx);
let page=ctx.activityPage();
assert.ok(page.includes('Awesome Level')&&page.includes('Alice'));
assert.ok(page.includes('Profils à découvrir'));
assert.ok(page.includes('Mes abonnements'));
ctx.state.activityTab='all';page=ctx.activityPage();assert.ok(page.includes('Toute la communauté'));
ctx.state.ownKey=null;ctx.state.activityTab='following';page=ctx.activityPage();
assert.ok(page.includes('Connecte-toi'));
assert.ok(!page.includes('Awesome Level'));
console.log('DLFR 2.1 interface fil : OK');

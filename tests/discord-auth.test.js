'use strict';
const assert = require('node:assert/strict');
const t = require('node:test');
const Discord=require('../js/discord-auth.js');
function storage(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
t('Discord demo connect and moderator approval',()=>{
 const s=storage();assert.equal(Discord.getDemo(s).connected,false);
 Discord.connectDemo(s);assert.equal(Discord.getDemo(s).connected,true);
 Discord.requestDemo(s,'Spleen');assert.equal(Discord.getDemo(s).requested_player_key,'spleen');
 assert.throws(()=>Discord.approveDemo(s,false),/modérateur/);
 Discord.approveDemo(s,true);assert.equal(Discord.getDemo(s).linked_player_key,'spleen');
 assert.throws(()=>Discord.requestDemo(s,'cryostaz'),/déjà lié/);
 Discord.disconnectDemo(s);assert.equal(Discord.getDemo(s).connected,false);
});
t('Auth metadata is read only for real Discord identities',()=>{
 assert.equal(Discord.sessionDiscordIdentity({user:{user_metadata:{avatar_url:'https://cdn.discordapp.com/avatars/1/x.png'}}}),null);
 const ses={user:{app_metadata:{providers:['discord']},user_metadata:{global_name:'Test',avatar_url:'https://cdn.discordapp.com/avatars/123/abc.png'}}};
 assert.equal(Discord.sessionDiscordIdentity(ses).avatar_url,'https://cdn.discordapp.com/avatars/123/abc.png');
 assert.equal(Discord.allowedDiscordImage('https://example.org/avatar.png'),'');
});
t('OAuth helper only calls Supabase Auth',async()=>{
 let arg=null;await Discord.signIn({auth:{signInWithOAuth:async x=>(arg=x,{error:null})}},'https://example.org/app/?page=my-profile');
 assert.equal(arg.provider,'discord');assert.equal(arg.options.redirectTo,'https://example.org/app/?page=my-profile');
});

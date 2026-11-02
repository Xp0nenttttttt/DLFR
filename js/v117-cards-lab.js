/* DLFR V117 — Cards Lab : ouverture cinématique + progression longue.
 * Toujours un laboratoire en mémoire vive : AUCUN INSERT/UPDATE/DELETE, aucun localStorage/sessionStorage,
 * aucune transaction réelle. L'accès est accordé dans app.js après la RPC Supabase dlfr_cards_lab_access().
 * Remplace v116-cards-lab.js (même API window.DLFR_CARDS_LAB).
 */
(()=>{'use strict';
// ============================================================ CATALOGUE (identique V112–V116)
const SOURCE=[
 ['Cataclysm','Commun','level'],['Bloodbath','Mythique','level'],['The Ultimate Phase','Commun','level'],
 ['Sonic Wave','Épique','level'],['Yatagarasu','Épique','level'],['Erebus','Rare','level'],
 ['Artificial Ascent','Rare','level'],['Digital Descent','Rare','level'],['Bloodlust','Rare','level'],
 ['Crimson Planet','Rare','level'],['Zodiac','Épique','level'],['Tartarus','Épique','level'],
 ['The Golden','Commun','level'],['Kenos','Commun','level'],['Sakupen Hell','Commun','level'],
 ['Cold Sweat','Rare','level'],['Firework','Commun','level'],['Slaughterhouse','Légendaire','level'],
 ['Acheron','Légendaire','level'],['LIMBO','Rare','level'],
 ['Avernus','Épique','level'],['Tidal Wave','Mythique','level'],['Kyouki','Rare','level'],
 ['KOCMOC','Épique','level'],['Silent clubstep','Légendaire','level'],['Shardscapes','Commun','level'],
 ['Cognition','Commun','level'],['Amethyst','Légendaire','level'],['GRIEF','Épique','level'],
 ['Thinking Space II','Épique','level'],['Nullscapes','Rare','level'],['Flamewall','Rare','level'],
 ['Artemis 13','Rare','level'],['ORBIT','Rare','level'],['Society','Commun','level'],
 ['Zoink','Mythique','player'],['wPopoff','Légendaire','player'],['Trick','Épique','player'],
 ['Doggie','Légendaire','player'],['Riot','Légendaire','player'],['Technical','Épique','player'],
 ['Spleen','Rare','player'],['vinceleo','Rare','player'],['yomayoCB','Commun','player'],
 ['niwox_','Commun','player'],
 ['First French Victor','Commun','dlfr'],['Weekly Challenger','Commun','dlfr'],
 ['Beyond the List','Commun','dlfr'],['United Clans','Commun','dlfr'],['DLFR Origins','Rare','dlfr']
];
const CARDS=SOURCE.map(([name,rarity,type],i)=>({id:i+1,name,rarity,type,series:i<20?'Legends':i<35?'Modern':i<45?'Players':'DLFR'}));
const rarities=['Commun','Rare','Épique','Légendaire','Mythique'];
const BASE_COUNT=CARDS.length, MAX_CUSTOM=250;
let gate=false, view='album', filter='all', query='', selected=2, forgeSel=0, goalsTab='quests';
const customCards=[]; let editCardId=null, creatorImage='', imageError='', clearedImage=false;

// ============================================================ RÈGLES DE PROGRESSION V117
const MAX_LEVEL=100, MAX_PRESTIGE=10, RENAISSANCE_LEVEL=60;
const RVAL=[1,2,4,8,16];                       // valeur de collection par rareté
const DUST_DUP=[5,12,30,80,200];               // poussière gagnée par doublon
const CRAFT=[40,100,260,800,2400];             // coût de fabrication d'une carte manquante
const STAR_COPIES=[1,2,3,5,8];                 // doublons consommés pour ★1…★5
const STAR_DUST=[15,35,80,180,400];            // poussière de base pour ★1…★5
const STAR_FACTOR=[1,1.5,2.5,4,6];
const FIN=['none','holo','prism','obsidian'], FIN_NAME=['Standard','Holo','Prismatique','Obsidienne'];
const FIN_MULT=[1,1.25,1.6,2.2], FIN_BASE=[0,.06,.012,.0025];
const POWER_TIERS=[20,50,100,180,300,480,720,1000,1400];
const TIER_COLORS=['#c9d1e0','#5fb2ff','#b980ff','#ffc247','#ff5fa2'];
const RANKS=[[1,'Easy','#7fd4ff'],[5,'Normal','#7bf0a0'],[10,'Hard','#ffd36b'],[16,'Harder','#ff9e5e'],[24,'Insane','#ff6fa8'],[32,'Easy Demon','#c58bff'],[42,'Medium Demon','#a67bff'],[54,'Hard Demon','#ff5f5f'],[68,'Insane Demon','#ff3d7a'],[84,'Extreme Demon','#ff2a2a'],[100,'Grand Démon','#ffe27a']];
const PACKS=[
 {id:'start',name:'Découverte',count:3,cost:{shards:18},level:1,weights:[60,27,10,2.6,.4],guarantee:0,theme:'violet',emblem:'✦',subtitle:'Pour débuter la collection'},
 {id:'explore',name:'Explorateur',count:5,cost:{shards:60},level:3,weights:[40,35,18,5.5,1.5],guarantee:1,theme:'blue',emblem:'◆',subtitle:'Une carte Rare ou mieux garantie'},
 {id:'legends',name:'GD Legends',count:5,cost:{shards:90},level:7,weights:[40,33,19,6,2],guarantee:1,theme:'crimson',emblem:'♜',subtitle:'Uniquement la série Legends',filter:c=>c.series==='Legends'},
 {id:'players',name:'Joueurs FR',count:5,cost:{shards:90},level:11,weights:[40,33,19,6,2],guarantee:1,theme:'green',emblem:'★',subtitle:'Uniquement des cartes Joueur',filter:c=>c.type==='player'},
 {id:'prestige',name:'Prestige',count:5,cost:{shards:150},level:15,weights:[0,30,45,20,5],guarantee:2,theme:'gold',emblem:'♛',subtitle:'Une carte Épique ou mieux garantie',finishBoost:1.5},
 {id:'demon',name:'Coffre Démoniaque',count:6,cost:{keys:1},level:20,weights:[0,25,45,25,5],guarantee:3,theme:'demon',emblem:'🔑',subtitle:'Une Légendaire garantie · ouvert avec une clé',finishBoost:1.5},
 {id:'relic',name:'Relique Mythique',count:7,cost:{keys:3,shards:600},level:45,weights:[0,0,50,38,12],guarantee:4,theme:'prism',emblem:'✺',subtitle:'Une Mythique garantie',finishBoost:2}
];
const DESTS=[
 {id:'stereo',name:'Plaines de Stereo Madness',icon:'▲',min:2,level:1,shards:14,xp:16,dust:0,key:0,card:0},
 {id:'clubstep',name:'Forêt de Clubstep',icon:'◭',min:6,level:4,shards:38,xp:44,dust:6,key:0,card:0},
 {id:'deadlocked',name:'Usine Deadlocked',icon:'⚙',min:15,level:9,shards:90,xp:110,dust:16,key:.05,card:0},
 {id:'bloodbath',name:'Cavernes de Bloodbath',icon:'✹',min:40,level:18,shards:220,xp:280,dust:40,key:.15,card:.1},
 {id:'tartarus',name:'Abysse de Tartarus',icon:'☄',min:120,level:34,shards:600,xp:800,dust:110,key:.35,card:.25},
 {id:'acheron',name:'Faille d’Acheron',icon:'✶',min:360,level:55,shards:1500,xp:2100,dust:280,key:1,card:.6},
 {id:'avernus',name:'Trône d’Avernus',icon:'♆',min:720,level:80,shards:3200,xp:4600,dust:600,key:2,card:1}
];
const BRANCHES=[
 {key:'fortune',name:'Fortune',icon:'✦',subtitle:'Raretés, finitions et garanties',color:'violet'},
 {key:'explore',name:'Exploration',icon:'◆',subtitle:'Camps, expéditions et clés',color:'blue'},
 {key:'mastery',name:'Maîtrise',icon:'★',subtitle:'Expérience, poussière et forge',color:'gold'}
];
// max = rangs ; cost = éclats pour le rang 1 (×rang suivant) ; pts = points par rang.
const SKILLS=[
 {id:'fo1',branch:'fortune',name:'Instinct rare',icon:'✦',max:5,level:1,cost:20,pts:1,requires:[],text:r=>`+${r} niveau${r>1?'x':''} de chance sur toutes les raretés`},
 {id:'fo2',branch:'fortune',name:'Éclat holographique',icon:'◈',max:3,level:6,cost:60,pts:1,requires:['fo1'],text:r=>`Finitions Holo/Prisme/Obsidienne +${25*r} %`},
 {id:'fo3',branch:'fortune',name:'Sceau de rareté',icon:'♢',max:1,level:12,cost:180,pts:1,requires:['fo2'],text:()=>'Le paquet Découverte garantit une Rare ou mieux'},
 {id:'fo4',branch:'fortune',name:'Pitié réduite',icon:'⌛',max:3,level:20,cost:260,pts:1,requires:['fo3'],text:r=>`Garantie Légendaire ${5*r} cartes plus tôt`},
 {id:'fo5',branch:'fortune',name:'Constellation mythique',icon:'✧',max:3,level:35,cost:500,pts:1,requires:['fo4'],text:r=>`Poids des Mythiques +${60*r} %`},
 {id:'fo6',branch:'fortune',name:'Prisme parfait',icon:'❖',max:1,level:55,cost:1400,pts:2,requires:['fo5'],text:()=>'Prismatique ×1,5 et Obsidienne ×2'},
 {id:'ex1',branch:'explore',name:'Sac de voyage',icon:'◇',max:5,level:1,cost:20,pts:1,requires:[],text:r=>`Éclats d’expédition +${8*r} %`},
 {id:'ex2',branch:'explore',name:'Cartographe',icon:'⌁',max:3,level:5,cost:60,pts:1,requires:['ex1'],text:r=>`Durée des expéditions −${8*r} %`},
 {id:'ex3',branch:'explore',name:'Second camp',icon:'⛺',max:1,level:14,cost:200,pts:1,requires:['ex2'],text:()=>'+1 expédition simultanée'},
 {id:'ex4',branch:'explore',name:'Chasseur de clés',icon:'🔑',max:3,level:24,cost:300,pts:1,requires:['ex3'],text:r=>`+${5*r} % de chance de clé par expédition`},
 {id:'ex5',branch:'explore',name:'Troisième camp',icon:'⛰',max:1,level:40,cost:700,pts:2,requires:['ex4'],text:()=>'+1 expédition simultanée'},
 {id:'ex6',branch:'explore',name:'Récolte double',icon:'⇈',max:3,level:60,cost:1200,pts:1,requires:['ex5'],text:r=>`${10*r} % de chance de doubler une expédition`},
 {id:'ma1',branch:'mastery',name:'Apprentissage',icon:'✪',max:5,level:1,cost:20,pts:1,requires:[],text:r=>`XP +${6*r} %`},
 {id:'ma2',branch:'mastery',name:'Archiviste',icon:'▣',max:3,level:6,cost:60,pts:1,requires:['ma1'],text:r=>`Poussière +${20*r} %`},
 {id:'ma3',branch:'mastery',name:'Ouvreur expert',icon:'✳',max:1,level:16,cost:220,pts:1,requires:['ma2'],text:()=>'+1 carte dans les paquets de 5 cartes ou plus'},
 {id:'ma4',branch:'mastery',name:'Forgeron',icon:'⚒',max:3,level:26,cost:320,pts:1,requires:['ma3'],text:r=>`Coûts de la Forge −${10*r} %`},
 {id:'ma5',branch:'mastery',name:'Œil de lynx',icon:'✵',max:1,level:38,cost:650,pts:2,requires:['ma4'],text:()=>'La dernière carte d’un paquet privilégie une carte manquante'},
 {id:'ma6',branch:'mastery',name:'Grand archiviste',icon:'⌘',max:3,level:62,cost:1200,pts:1,requires:['ma5'],text:r=>`Éclats des nouvelles cartes +${50*r} %`},
 {id:'cv',branch:'core',name:'Convergence',icon:'✺',max:1,level:50,cost:2000,pts:3,requires:['fo4','ex4','ma4'],text:()=>'+1 niveau de chance et +15 % d’éclats et d’XP'},
 {id:'ap',branch:'core',name:'Apothéose',icon:'☀',max:1,level:85,cost:6000,pts:5,requires:['cv','fo6','ex6','ma6'],text:()=>'+1 carte dans tous les paquets et Mythiques ×2'}
];
const SETS=[
 {id:'legends',name:'GD Legends',test:c=>c.id<=BASE_COUNT&&c.series==='Legends',reward:{keys:2,dust:150}},
 {id:'modern',name:'Modern Extremes',test:c=>c.id<=BASE_COUNT&&c.series==='Modern',reward:{keys:2,dust:150}},
 {id:'players',name:'Joueurs FR',test:c=>c.id<=BASE_COUNT&&c.series==='Players',reward:{keys:2,dust:150}},
 {id:'dlfr',name:'Esprit DLFR',test:c=>c.id<=BASE_COUNT&&c.series==='DLFR',reward:{keys:1,dust:80}},
 {id:'mythic',name:'Panthéon Mythique',test:c=>c.id<=BASE_COUNT&&c.rarity==='Mythique',reward:{keys:3,dust:300}},
 {id:'holo-legends',name:'Legends Holo',test:c=>c.id<=BASE_COUNT&&c.series==='Legends',finish:1,reward:{keys:4,dust:600}},
 {id:'prism-players',name:'Joueurs Prismatiques',test:c=>c.id<=BASE_COUNT&&c.series==='Players',finish:2,reward:{keys:6,dust:1500}},
 {id:'stars-all',name:'Constellation complète',test:c=>c.id<=BASE_COUNT,stars:3,reward:{keys:10,dust:4000}}
];
const QUEST_POOL=[
 {type:'packs',lvl:1,base:[2,4],text:n=>`Ouvrir ${n} paquets`},
 {type:'expeditions',lvl:1,base:[2,3],text:n=>`Terminer ${n} expéditions`},
 {type:'new',lvl:1,base:[2,4],text:n=>`Découvrir ${n} nouvelles cartes`},
 {type:'epic',lvl:3,base:[1,3],text:n=>`Obtenir ${n} cartes Épiques ou mieux`},
 {type:'dust',lvl:4,base:[40,90],scale:true,text:n=>`Gagner ${n} poussière ✧`},
 {type:'spend',lvl:2,base:[80,160],scale:true,text:n=>`Dépenser ${n} éclats ◆`},
 {type:'forge',lvl:5,base:[1,2],text:n=>`Améliorer ou fabriquer ${n} carte${n>1?'s':''} à la Forge`},
 {type:'finish',lvl:8,base:[1,1],text:()=>'Obtenir une carte Holo ou mieux'}
];
const S=()=>progress.stats;
const ACHIEVEMENTS=[
 ...[[10,'Premiers pas',{dust:30}],[25,'Collectionneur',{keys:1}],[40,'Archiviste ORIGINS',{keys:2}],[50,'ORIGINS complet',{keys:5,dust:500},'Gardien d’ORIGINS']].map(([n,name,reward,title],i)=>({id:'col'+i,name,desc:`Posséder ${n} cartes ORIGINS différentes`,value:()=>CARDS.filter(c=>c.id<=BASE_COUNT&&has(c.id)).length,target:n,reward,title})),
 ...[[10,'Déchireur',{dust:40}],[50,'Ouvreur assidu',{keys:1}],[150,'Usine à boosters',{keys:3}],[500,'Main d’or',{keys:8},'Main d’or']].map(([n,name,reward,title],i)=>({id:'pk'+i,name,desc:`Ouvrir ${n} paquets`,value:()=>S().packs,target:n,reward,title})),
 ...[[5,'Randonneur',{dust:30}],[25,'Aventurier',{keys:1}],[100,'Cartographe',{keys:3}],[300,'Nomade éternel',{keys:6},'Nomade']].map(([n,name,reward,title],i)=>({id:'ex'+i,name,desc:`Terminer ${n} expéditions`,value:()=>S().expeditions,target:n,reward,title})),
 {id:'leg1',name:'Lueur dorée',desc:'Obtenir une carte Légendaire',value:()=>S().tiers[3],target:1,reward:{dust:80}},
 {id:'leg2',name:'Ruée vers l’or',desc:'Obtenir 15 cartes Légendaires',value:()=>S().tiers[3],target:15,reward:{keys:2}},
 {id:'myt1',name:'Étoile filante',desc:'Obtenir une carte Mythique',value:()=>S().tiers[4],target:1,reward:{keys:1},title:'Touché par les étoiles'},
 {id:'myt2',name:'Pluie de météores',desc:'Obtenir 10 cartes Mythiques',value:()=>S().tiers[4],target:10,reward:{keys:4}},
 {id:'fin1',name:'Reflets',desc:'Obtenir une carte Holo',value:()=>S().finishes[1]+S().finishes[2]+S().finishes[3],target:1,reward:{dust:50}},
 {id:'fin2',name:'Arc-en-ciel',desc:'Obtenir une carte Prismatique',value:()=>S().finishes[2]+S().finishes[3],target:1,reward:{keys:1}},
 {id:'fin3',name:'Ténèbres polies',desc:'Obtenir une carte Obsidienne',value:()=>S().finishes[3],target:1,reward:{keys:3},title:'Obsidien'},
 {id:'st1',name:'Première étoile',desc:'Améliorer une carte à ★1',value:()=>maxStars(),target:1,reward:{dust:40}},
 {id:'st5',name:'Supernova',desc:'Porter une carte à ★5',value:()=>maxStars(),target:5,reward:{keys:3},title:'Supernova'},
 {id:'cr1',name:'Artisan',desc:'Fabriquer 1 carte',value:()=>S().crafted,target:1,reward:{dust:40}},
 {id:'cr2',name:'Maître artisan',desc:'Fabriquer 10 cartes',value:()=>S().crafted,target:10,reward:{keys:2}},
 ...[[10,{keys:1}],[25,{keys:2}],[50,{keys:3},'Demon Slayer'],[75,{keys:5}],[100,{keys:10},'Grand Démon']].map(([n,reward,title])=>({id:'lv'+n,name:`Niveau ${n}`,desc:`Atteindre le niveau ${n}`,value:()=>Math.max(progress.level,S().bestLevel),target:n,reward,title})),
 {id:'set1',name:'Série terminée',desc:'Terminer une série',value:()=>Object.keys(progress.sets).length,target:1,reward:{keys:1}},
 {id:'set8',name:'Encyclopédiste',desc:'Terminer toutes les séries',value:()=>Object.keys(progress.sets).length,target:SETS.length,reward:{keys:15},title:'Encyclopédiste'},
 {id:'rn1',name:'Renaissance',desc:'Effectuer une Renaissance',value:()=>progress.prestige,target:1,reward:{keys:3},title:'Phénix'},
 {id:'rn5',name:'Cycle éternel',desc:'Effectuer 5 Renaissances',value:()=>progress.prestige,target:5,reward:{keys:10},title:'Éternel'},
 ...[[10,{dust:60}],[50,{keys:2}],[150,{keys:5},'Infatigable']].map(([n,reward,title])=>({id:'qs'+n,name:`${n} missions`,desc:`Accomplir ${n} missions`,value:()=>S().quests,target:n,reward,title})),
 ...[[3,{keys:1}],[6,{keys:3}],[9,{keys:6},'Puissance absolue']].map(([n,reward,title])=>({id:'pw'+n,name:`Puissance ${n}`,desc:`Atteindre le palier de puissance ${n}`,value:()=>powerTier(),target:n,reward,title}))
];
const newStats=()=>({packs:0,expeditions:0,pulled:0,newCards:0,tiers:[0,0,0,0,0],finishes:[0,0,0,0],crafted:0,upgraded:0,quests:0,shardsEarned:0,bestLevel:1});
const freshProgress=()=>({xp:0,level:1,shards:35,dust:0,keys:0,prestige:0,skills:{},camps:[],quests:[],achievements:{},sets:{},pity:{leg:0,myth:0},stats:newStats(),title:'',reveals:[],questSeed:0});
const progress=freshProgress();

// Mémoire volatile : le rechargement de la page efface entièrement cette collection.
const owned=new Map(),overrides=new Map(),journal=[];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const idString=i=>String(i).padStart(3,'0');
const normalize=s=>String(s||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
const rarity=c=>overrides.get(c.id)||c.rarity;
const tierOf=c=>Math.max(0,rarities.indexOf(rarity(c)));
const fmt=n=>Math.round(n).toLocaleString('fr-FR');
const has=id=>(owned.get(id)?.count||0)>0;
const rank=id=>progress.skills[id]||0;
const pick=a=>a[Math.floor(Math.random()*a.length)];
const validUrl=x=>{try{const u=new URL(String(x));return u.protocol==='https:'&&u.username===''&&u.password===''?u.href:'';}catch{return ''}};
const validImage=x=>{const s=String(x||'');if(s.length<=3000000&&/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s))return s;return validUrl(s);};
const safeText=(s,max=100)=>String(s??'').trim().slice(0,max);
const cleanCard=(x,id)=>{
 if(!x||typeof x!=='object'||Array.isArray(x))return null;
 const name=safeText(x.name,80),series=safeText(x.series,50)||'Custom',description=safeText(x.description,400),
 type=['level','player','dlfr'].includes(x.type)?x.type:'dlfr',rarity=rarities.includes(x.rarity)?x.rarity:'Commun';
 if(!name)return null;
 return {id,name,series,type,rarity,description,image:validImage(x.image||'')};
};
const youtubeThumbnail=x=>{try{const u=new URL(x),h=u.hostname.toLowerCase().replace(/^www\./,'');let id='';if(h==='youtu.be')id=u.pathname.split('/')[1]||'';else if(['youtube.com','m.youtube.com'].includes(h))id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.split('/')[2];return /^[\w-]{11}$/.test(id)?`https://i.ytimg.com/vi/${id}/hqdefault.jpg`:'';}catch{return '';}};
function imageFor(card,data){
 if(card.image)return validImage(card.image);
 if(card.type==='dlfr')return '';
 if(card.type==='level'){
  const match=(data?.demons||[]).find(x=>normalize(x.name)===normalize(card.name)&&x.is_public!==false);
  return match?validUrl(match.thumbnail_url)||youtubeThumbnail(match.verifier_video_url||match.video_url):'';
 }
 const player=(data?.players||[]).find(x=>normalize(x.username||x.display_name)===normalize(card.name));
 const profile=(data?.player_profiles||[]).find(x=>String(x.player_key)===String(player?.player_key));
 return validUrl(profile?.avatar_url)||'';
}
const srcData=()=>window.DLFR_CARDS_LAB?.__sourceData||{};
// opts.finish / opts.stars : affichage forcé (révélation d'un tirage précis).
function figure(card,data,compact=false,opts={}){
 const o=owned.get(card.id),n=o?.count||0;
 const finish=opts.finish??o?.finish??0, stars=opts.stars??o?.stars??0;
 const picture=imageFor(card,data);
 const sym=card.type==='level'?'◆':card.type==='player'?'★':'✦';
 return `<div class="dlfr112-card dlfr112-${normalize(rarity(card)).replace(/[^a-z]/g,'')} ${finish?'dlfr112-holo dlfr117-f-'+FIN[finish]:''} ${n||opts.finish!==undefined?'dlfr112-has':'dlfr112-missing'} ${compact?'dlfr112-small':''}">
   <div class="dlfr112-card-top"><span>${card.type==='level'?'LEVEL':card.type==='player'?'PLAYER':'DLFR'} CARD</span><b>#${idString(card.id)}</b></div>
   <div class="dlfr112-art">${picture?`<img loading="lazy" src="${esc(picture)}" alt="Visuel ${esc(card.name)}" onerror="this.remove()">`:`<span aria-hidden="true">${sym}</span>`}</div>
   <div class="dlfr112-card-bottom"><strong title="${esc(card.name)}">${esc(card.name)}</strong><span>${esc(rarity(card))}${finish?' · ✧ '+FIN_NAME[finish].toUpperCase():''}</span></div>
   ${stars?`<span class="dlfr117-stars" aria-label="${stars} étoiles">${'★'.repeat(stars)}</span>`:''}
   ${n&&opts.finish===undefined?`<span class="dlfr112-count">×${n}</span>`:''}
  </div>`;
}
function inventoryUnique(){return [...owned.values()].filter(v=>v.count>0).length;}
function status(){return `${inventoryUnique()} / ${CARDS.length} cartes différentes · ${[...owned.values()].reduce((a,b)=>a+b.count,0)} exemplaires de test`;}
function cardItem(c,data){const yes=has(c.id);return `<button type="button" class="dlfr112-pick ${selected===c.id?'is-current':''}" data-v112-act="select" data-id="${c.id}" aria-label="Voir ${esc(c.name)}">${figure(c,data,true)}<span class="dlfr112-pick-label">${yes?'Possédée · ':'Manquante · '}${esc(c.series)}</span></button>`;}
function optionCard(c){return `<option value="${c.id}">${idString(c.id)} · ${esc(c.name)}</option>`;}
function log(message){journal.push(message);if(journal.length>30)journal.shift();}
function get(id){return CARDS.find(c=>c.id===Number(id));}
function give(id,count=1,finish=0){const c=get(id);if(!c)return;const x=owned.get(c.id)||{count:0,finish:0,stars:0};x.count+=count;x.finish=Math.max(x.finish||0,finish);x.holo=x.finish>0;owned.set(c.id,x);}
function take(id){const x=owned.get(Number(id));if(!x||x.count<=0)return false;x.count--;if(x.count<=0)owned.delete(Number(id));return true;}

// ============================================================ ATELIER DE CRÉATION (V113, inchangé)
function editCard(){return customCards.find(c=>c.id===editCardId)||null;}
function newCardId(){let i=1001;for(const c of CARDS)if(c.id>=i)i=c.id+1;return i;}
function previewCard(){const old=editCard();return {id:old?.id||newCardId(),name:old?.name||'Nouvelle carte',rarity:old?.rarity||'Rare',type:old?.type||'level',series:old?.series||'Custom',image:creatorImage||old?.image||''};}
function creatorView(data){
 const cur=editCard(), preview=previewCard();
 return `<section class="dlfr112-panel dlfr113-creator"><div class="dlfr112-section-head"><h2>✦ Atelier de création</h2><p>Ajoute des niveaux, joueurs ou cartes exclusives à ton catalogue. Les cartes apparaîtront immédiatement dans l'album et dans les paquets.</p></div>
 <div class="dlfr113-create-layout"><div class="dlfr113-create-form">
 <form id="dlfr113CreateForm" autocomplete="off">
 <div class="dlfr113-form-grid">
 <label>Nom de la carte <span class="dlfr113-required">*</span><input id="dlfr113Name" name="cardName" maxlength="80" required value="${esc(cur?.name||'')}" placeholder="Ex. : Oblivion"></label>
 <label>Catégorie<select id="dlfr113Type" name="cardType">${[['level','Niveau'],['player','Joueur'],['dlfr','DLFR / Spéciale']].map(([k,v])=>`<option value="${k}" ${cur?.type===k?'selected':''}>${v}</option>`).join('')}</select></label>
 <label>Rareté<select id="dlfr113Rarity" name="cardRarity">${rarities.map(r=>`<option value="${esc(r)}" ${(cur?.rarity||'Rare')===r?'selected':''}>${esc(r)}</option>`).join('')}</select></label>
 <label>Collection / série<input id="dlfr113Series" name="cardSeries" maxlength="50" value="${esc(cur?.series||'Custom')}" placeholder="Ex. : French Legends"></label>
 <label class="dlfr113-wide">Description (au dos de la carte)<textarea id="dlfr113Description" name="cardDescription" maxlength="400" rows="3" placeholder="Quelques mots sur ce niveau ou ce joueur…">${esc(cur?.description||'')}</textarea></label>
 <label class="dlfr113-wide">URL d'image HTTPS (optionnel)<input type="url" id="dlfr113ImageUrl" name="cardImageUrl" placeholder="https://…/image.png" value="${esc((cur?.image||'').startsWith('data:')?'':cur?.image||'')}"></label>
 <label class="dlfr113-wide">Ou importer une image depuis ton PC <span class="dlfr113-hint">(PNG, JPEG, WebP, GIF · 2 Mo max)</span><input type="file" id="dlfr113ImageFile" accept="image/png,image/jpeg,image/webp,image/gif"></label>
 </div>
 <div class="dlfr113-create-buttons"><button type="submit" class="btn">${cur?'Enregistrer les modifications':'Créer la carte'}</button>${cur?'<button type="button" class="btn subtle" data-v112-act="new-card">Nouvelle carte</button><button type="button" class="btn danger" data-v112-act="delete-card">Supprimer cette carte</button>':''}<button type="button" class="btn subtle" data-v112-act="clear-image">Retirer l'image</button></div>
 </form><p class="dlfr113-inline-status" id="dlfr113FormStatus" role="status">${imageError?esc(imageError):'Aucune modification ne sera sauvegardée automatiquement.'}</p></div>
 <aside class="dlfr113-preview"><span class="dlfr113-caption">APERÇU EN DIRECT</span><div id="dlfr113CardPreview">${figure(preview,data)}</div><p class="dlfr113-hint">${cur?'Carte personnalisée #'+idString(cur.id):'Nouvelle carte · numéro attribué automatiquement'}</p></aside></div>
 <div class="dlfr113-library"><div class="dlfr112-section-head"><h3>Mes créations de cette session <span class="dlfr113-counter">${customCards.length}/${MAX_CUSTOM}</span></h3><p>Cliquer sur une carte pour la modifier. Exporter pour conserver tes créations sans utiliser Supabase.</p></div>
 <div class="dlfr113-create-buttons"><button type="button" class="btn subtle" data-v112-act="export-cards" ${customCards.length?'':'disabled'}>↓ Exporter mes cartes (JSON)</button><button type="button" class="btn subtle" data-v112-act="open-import">↑ Importer un catalogue (JSON)</button><input type="file" id="dlfr113ImportFile" accept="application/json,.json" hidden></div>
 <div class="dlfr113-owned-grid">${customCards.map(c=>`<button type="button" class="dlfr112-pick ${cur?.id===c.id?'is-current':''}" data-v112-act="edit-card" data-id="${c.id}" aria-label="Modifier ${esc(c.name)}">${figure(c,data,true)}<span class="dlfr112-pick-label">Modifier #${idString(c.id)}</span></button>`).join('')||'<p class="muted">Pas encore de carte personnalisée. Crée la première ci-dessus !</p>'}</div></div>
 </section>`;
}
function createDraft(){
 const name=safeText(document.getElementById('dlfr113Name')?.value,80), type=document.getElementById('dlfr113Type')?.value,
 rarity=document.getElementById('dlfr113Rarity')?.value, series=safeText(document.getElementById('dlfr113Series')?.value,50)||'Custom',
 description=safeText(document.getElementById('dlfr113Description')?.value,400),url=safeText(document.getElementById('dlfr113ImageUrl')?.value,2048);
 const existing=editCard();
 const image=creatorImage||(url?validUrl(url):(clearedImage?'':existing?.image||''));
 return {name,type,rarity,series,description,image};
}
function refreshPreview(){
 const el=document.getElementById('dlfr113CardPreview');if(!el)return;
 const d=createDraft(), old=editCard(),card=cleanCard({...d,name:d.name||'Nouvelle carte'},old?.id||newCardId());
 if(card)el.innerHTML=figure(card,srcData());
}
function saveCustom(){
 const d=createDraft(); if(!d.name){alert('Indique un nom pour la carte.');return false;}
 if(!['level','player','dlfr'].includes(d.type)||!rarities.includes(d.rarity)){alert('Sélectionne une catégorie et une rareté.');return false;}
 const typedUrl=safeText(document.getElementById('dlfr113ImageUrl')?.value,2048);
 if(typedUrl&&!validUrl(typedUrl)&&!creatorImage){alert('L’URL de l’image doit commencer par https://.');return false;}
 const old=editCard();if(!old&&customCards.length>=MAX_CUSTOM){alert(`Limite du laboratoire : ${MAX_CUSTOM} cartes personnalisées.`);return false;}
 const id=old?.id||newCardId(), card=cleanCard(d,id);if(!card)return false;
 if(old){const i=customCards.findIndex(x=>x.id===id);customCards[i]=card;const j=CARDS.findIndex(x=>x.id===id);CARDS[j]=card;log(`Carte modifiée : ${card.name}`);}
 else {customCards.push(card);CARDS.push(card);log(`Carte créée : ${card.name}`);}
 selected=id;editCardId=id;creatorImage='';imageError='';clearedImage=false;return true;
}
function deleteCustom(){const c=editCard();if(!c)return;if(!confirm(`Supprimer « ${c.name} » de ce catalogue temporaire ?`))return;
 const i=customCards.findIndex(x=>x.id===c.id),j=CARDS.findIndex(x=>x.id===c.id);
 if(i>=0)customCards.splice(i,1);if(j>=0)CARDS.splice(j,1);owned.delete(c.id);overrides.delete(c.id);
 log(`Carte supprimée : ${c.name}`);editCardId=null;creatorImage='';clearedImage=false;selected=CARDS[0].id;
}
function download(obj,name){const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function exportCards(){if(!customCards.length)return;
 download({format:'dlfr-cards-lab',version:1,exportedAt:new Date().toISOString(),cards:customCards.map(c=>({name:c.name,type:c.type,rarity:c.rarity,series:c.series,description:c.description||'',image:c.image||''}))},'DLFR_Cards_mes_creations.json');
 log(`Export JSON de ${customCards.length} cartes.`);
}
async function importCards(file){
 if(!file||file.size>20000000){alert('Catalogue JSON trop volumineux (20 Mo maximum).');return;}
 try{
  const json=JSON.parse(await file.text());if(json?.format!=='dlfr-cards-lab'||json?.version!==1||!Array.isArray(json.cards)||json.cards.length>MAX_CUSTOM)throw new Error('Format ou quantité de cartes incompatible.');
  const items=[];for(const row of json.cards){const card=cleanCard(row,1001+items.length);if(!card)throw new Error('Une carte du fichier est invalide.');items.push(card);}
  if(!confirm(`Importer ${items.length} cartes ? Cela remplacera les ${customCards.length} cartes personnalisées de cette session, mais pas les 50 cartes ORIGINS.`))return;
  for(const c of customCards){const i=CARDS.findIndex(x=>x.id===c.id);if(i>=0)CARDS.splice(i,1);owned.delete(c.id);overrides.delete(c.id);}
  customCards.length=0;for(const c of items){customCards.push(c);CARDS.push(c);}
  editCardId=null;creatorImage='';clearedImage=false;selected=CARDS[0].id;log(`${items.length} cartes importées depuis le fichier JSON.`);repaint();
 }catch(error){alert('Impossible d’importer ce catalogue : '+error.message);}
}

// ============================================================ PROGRESSION : formules
function levelTarget(l){return Math.round(40+10*Math.pow(l,1.45));}
function rankInfo(level=progress.level){let r=RANKS[0];for(const x of RANKS)if(level>=x[0])r=x;const i=RANKS.indexOf(r);return {name:r[1],color:r[2],index:i,next:RANKS[i+1]||null};}
function totalPoints(){return 1+Math.floor(progress.level/2)+3*progress.prestige;}
function spentPoints(){return SKILLS.reduce((n,s)=>n+rank(s.id)*s.pts,0);}
function freePoints(){return totalPoints()-spentPoints();}
function maxStars(){let m=0;for(const v of owned.values())m=Math.max(m,v.stars||0);return m;}
function collectionPower(){let p=0;for(const [id,v] of owned){const c=get(id);if(!c||v.count<=0)continue;p+=RVAL[tierOf(c)]*(1+.5*(v.stars||0))*FIN_MULT[v.finish||0];}return Math.round(p);}
function powerTier(){const p=collectionPower();return POWER_TIERS.filter(t=>p>=t).length;}
function setBonus(){return .05*Object.keys(progress.sets).length;}
function shardMult(){return (1+.1*progress.prestige)*(1+.03*powerTier())*(1+setBonus())*(rank('cv')?1.15:1);}
function xpMult(){return (1+.1*progress.prestige)*(1+.03*powerTier())*(1+.06*rank('ma1'))*(rank('cv')?1.15:1);}
function dustMult(){return 1+.2*rank('ma2');}
function forgeDiscount(){return 1-.1*rank('ma4');}
function luck(){return rank('fo1')+(rank('cv')?1:0);}
function legPity(){return 45-5*rank('fo4');}
const MYTH_PITY=220;
function slots(){return Math.min(4,1+rank('ex3')+rank('ex5')+(progress.level>=30?1:0));}
function destDuration(d){return Math.round(d.min*60000*(1-.08*rank('ex2')));}
function packCount(p){return p.count+(rank('ma3')&&p.count>=5?1:0)+(rank('ap')?1:0);}
function packGuarantee(p){return p.id==='start'&&rank('fo3')?1:p.guarantee;}
function costText(c){return [c.keys?`🔑 ${c.keys}`:'',c.shards?`◆ ${fmt(c.shards)}`:''].filter(Boolean).join(' + ');}
function canAfford(c){return progress.shards>=(c.shards||0)&&progress.keys>=(c.keys||0);}
function pay(c){progress.shards-=c.shards||0;progress.keys-=c.keys||0;if(c.shards)emit('spend',c.shards);}
function addShards(n){n=Math.round(n);progress.shards+=n;S().shardsEarned+=n;return n;}
function addDust(n){n=Math.round(n);progress.dust+=n;if(n>0)emit('dust',n);return n;}
const levelUps=[];
function addXP(earned){
 earned=Math.round(earned);if(progress.level>=MAX_LEVEL)return earned;
 progress.xp+=earned;
 while(progress.level<MAX_LEVEL&&progress.xp>=levelTarget(progress.level)){
  progress.xp-=levelTarget(progress.level);progress.level++;
  S().bestLevel=Math.max(S().bestLevel,progress.level);
  const bonus=addShards(15+progress.level*4),keys=progress.level%5===0?1:0,dust=progress.level%10===0?100:0;
  progress.keys+=keys;if(dust)addDust(dust);
  const before=rankInfo(progress.level-1).name,after=rankInfo().name;
  levelUps.push({level:progress.level,bonus,keys,dust,rank:before!==after?after:''});
  log(`Niveau ${progress.level} ! +${bonus} ◆${keys?' +1 🔑':''}${dust?' +100 ✧':''}${progress.level%2===0?' · +1 point de talent':''}`);
  toast(`Niveau ${progress.level}`,`${before!==after?'Nouveau rang : '+after+' · ':''}+${bonus} ◆${keys?' · +1 clé':''}${progress.level%2===0?' · +1 point de talent':''}`,'level');
 }
 if(progress.level>=MAX_LEVEL)progress.xp=0;
 return earned;
}
function grant(r){if(!r)return '';const out=[];if(r.shards)out.push(`+${addShards(r.shards)} ◆`);if(r.dust)out.push(`+${addDust(r.dust)} ✧`);if(r.keys){progress.keys+=r.keys;out.push(`+${r.keys} 🔑`);}if(r.xp)out.push(`+${addXP(r.xp)} XP`);return out.join(' · ');}

// ============================================================ Missions, succès, séries
function emit(type,n=1){for(const q of progress.quests)if(q.type===type&&q.have<q.target)q.have=Math.min(q.target,q.have+n);}
function makeQuest(exclude=[]){
 const lvl=progress.level,pool=QUEST_POOL.filter(q=>q.lvl<=lvl&&!exclude.includes(q.type));
 const t=pick(pool.length?pool:QUEST_POOL);
 let target=t.base[0]+Math.floor(Math.random()*(t.base[1]-t.base[0]+1));
 if(t.scale)target=Math.round(target*(1+lvl*.06)/5)*5;
 const xp=Math.round((50+lvl*14)*(.8+target/(t.base[1]||1)*.3)),shards=Math.round(20+lvl*6);
 const reward={xp,shards};if(Math.random()<.18+lvl*.004)reward.keys=1;else reward.dust=Math.round(15+lvl*3);
 progress.questSeed++;
 return {id:'q'+progress.questSeed,type:t.type,target,have:0,reward};
}
function ensureQuests(){while(progress.quests.length<3)progress.quests.push(makeQuest(progress.quests.map(q=>q.type)));}
function questText(q){const t=QUEST_POOL.find(x=>x.type===q.type);return t?t.text(q.target):q.type;}
function claimQuest(id){const i=progress.quests.findIndex(q=>q.id===id);const q=progress.quests[i];if(!q||q.have<q.target)return;
 const txt=grant(q.reward);S().quests++;progress.quests.splice(i,1,makeQuest(progress.quests.filter(x=>x.id!==id).map(x=>x.type)));
 toast('Mission accomplie',txt,'quest');log(`Mission accomplie : ${questText(q)} (${txt})`);}
function rerollCost(){return 10+progress.level*3;}
function rerollQuest(id){const i=progress.quests.findIndex(q=>q.id===id);if(i<0||progress.shards<rerollCost())return;pay({shards:rerollCost()});progress.quests.splice(i,1,makeQuest(progress.quests.map(x=>x.type)));}
function checkAchievements(){
 for(let pass=0;pass<4;pass++){let any=false;
  for(const a of ACHIEVEMENTS){if(progress.achievements[a.id])continue;if(a.value()>=a.target){progress.achievements[a.id]=true;any=true;const txt=grant(a.reward);toast('Succès : '+a.name,`${a.desc} · ${txt}${a.title?' · titre « '+a.title+' »':''}`,'achievement');log(`Succès débloqué : ${a.name} (${txt})`);}}
  if(!any)break;}
}
function setProgress(s){const cards=CARDS.filter(s.test);const ok=cards.filter(c=>{const v=owned.get(c.id);return v&&v.count>0&&(v.finish||0)>=(s.finish||0)&&(v.stars||0)>=(s.stars||0);});return {have:ok.length,total:cards.length};}
function claimSet(id){const s=SETS.find(x=>x.id===id);if(!s||progress.sets[id])return;const p=setProgress(s);if(!p.total||p.have<p.total)return;progress.sets[id]=true;const txt=grant(s.reward);toast('Série terminée : '+s.name,`${txt} · +5 % d’éclats permanents`,'achievement');log(`Série terminée : ${s.name}`);}
function titles(){return ACHIEVEMENTS.filter(a=>a.title&&progress.achievements[a.id]).map(a=>a.title);}

// ============================================================ Talents
function skillState(s){
 const r=rank(s.id);
 if(r>=s.max)return 'maxed';
 if(progress.level<s.level)return 'level';
 if(!s.requires.every(x=>rank(x)>0))return 'requires';
 if(freePoints()<s.pts)return 'points';
 if(progress.shards<skillCost(s))return 'shards';
 return 'available';
}
function skillCost(s){return s.cost*(rank(s.id)+1);}
function skillReason(s){const st=skillState(s);return st==='maxed'?'Maîtrisé':st==='level'?`Niveau ${s.level}`:st==='requires'?'Prérequis manquant':st==='points'?`${s.pts} point${s.pts>1?'s':''} requis`:st==='shards'?`◆ ${fmt(skillCost(s))} requis`:rank(s.id)?`Rang ${rank(s.id)+1} · ◆ ${fmt(skillCost(s))}`:`Débloquer · ◆ ${fmt(skillCost(s))}`;}
function buySkill(id){const s=SKILLS.find(x=>x.id===id);if(!s||skillState(s)!=='available')return;pay({shards:skillCost(s)});progress.skills[id]=rank(id)+1;log(`${s.name} rang ${rank(id)} : ${s.text(rank(id))}`);}
function refundSkills(){let back=0;for(const s of SKILLS){const r=rank(s.id);back+=s.cost*r*(r+1)/2;}progress.shards+=back;progress.skills={};return back;}

// ============================================================ Expéditions
function startExpedition(id){const d=DESTS.find(x=>x.id===id);if(!d||progress.level<d.level||progress.camps.length>=slots())return;const now=Date.now();progress.camps.push({dest:d.id,start:now,end:now+destDuration(d)});log(`Départ : ${d.name}.`);}
function claimExpedition(i){
 const c=progress.camps[i];if(!c||Date.now()<c.end)return null;const d=DESTS.find(x=>x.id===c.dest);progress.camps.splice(i,1);if(!d)return null;
 const times=Math.random()<.1*rank('ex6')?2:1,parts=[];
 for(let k=0;k<times;k++){
  parts.push(`+${addShards(d.shards*(1+.08*rank('ex1'))*shardMult())} ◆`,`+${addXP(d.xp*xpMult())} XP`);
  if(d.dust)parts.push(`+${addDust(d.dust*dustMult())} ✧`);
  const kc=d.key+.05*rank('ex4');const keys=Math.floor(kc)+(Math.random()<kc%1?1:0);if(keys){progress.keys+=keys;parts.push(`+${keys} 🔑`);}
  if(d.card&&Math.random()<d.card){const pool=CARDS.filter(x=>tierOf(x)>=1);const card=pick(pool);const isNew=!has(card.id);const f=rollFinish({});give(card.id,1,f);registerPull(card,f,isNew);parts.push(`carte ${card.name}${isNew?' (nouvelle !)':''}`);}
 }
 S().expeditions++;emit('expeditions');
 const txt=(times>1?'Récolte double ! ':'')+parts.join(' · ');
 toast(d.name,txt,'expedition');log(`Retour de ${d.name} : ${txt}`);return txt;
}
function claimAllExpeditions(){let n=0;for(let i=progress.camps.length-1;i>=0;i--)if(Date.now()>=progress.camps[i].end){claimExpedition(i);n++;}return n;}

// ============================================================ Tirages
function poolFor(pack){const p=CARDS.filter(c=>!pack.filter||pack.filter(c));return p.length?p:CARDS;}
function weights(pack){
 const pool=poolFor(pack),n=luck();
 const mult=[1,1+.16*n,1+.28*n,1+.44*n,(1+.64*n)*(1+.6*rank('fo5'))*(rank('ap')?2:1)];
 const w=pack.weights.map((x,i)=>pool.some(c=>tierOf(c)===i)?x*mult[i]:0);
 const total=w.reduce((a,b)=>a+b,0);return total>0?w.map(x=>x/total):w;
}
function chooseTier(pack,minTier){
 const pool=poolFor(pack),avail=rarities.map((_,i)=>pool.some(c=>tierOf(c)===i));
 const w=weights(pack).map((v,i)=>i<minTier?0:v);let sum=w.reduce((a,b)=>a+b,0);
 if(sum<=0){for(let i=4;i>=0;i--)if(avail[i]&&i>=minTier)return i;return avail.lastIndexOf(true);}
 let r=Math.random()*sum;for(let i=0;i<w.length;i++){r-=w[i];if(r<=0&&w[i]>0)return i;}
 return w.findLastIndex(x=>x>0);
}
function rollFinish(pack){
 const m=(1+.25*rank('fo2'))*(pack.finishBoost||1),r=Math.random();
 const obs=(progress.level>=30||progress.prestige>0)?FIN_BASE[3]*m*(rank('fo6')?2:1):0,pri=FIN_BASE[2]*m*(rank('fo6')?1.5:1),hol=FIN_BASE[1]*m;
 return r<obs?3:r<obs+pri?2:r<obs+pri+hol?1:0;
}
function registerPull(card,finish,isNew){const t=tierOf(card),s=S();s.pulled++;s.tiers[t]++;s.finishes[finish]++;if(isNew){s.newCards++;emit('new');}if(t>=2)emit('epic');if(finish>0)emit('finish');}
function openPack(id){
 const pack=PACKS.find(p=>p.id===id);
 if(!pack||OPEN.st||progress.level<pack.level||!canAfford(pack.cost))return false;
 const before={level:progress.level,xp:progress.xp,target:levelTarget(progress.level),shards:progress.shards,dust:progress.dust};
 levelUps.length=0;pay(pack.cost);S().packs++;emit('packs');
 const count=packCount(pack),guarantee=packGuarantee(pack),pool=poolFor(pack),draws=[];
 for(let i=0;i<count;i++){
  const last=i===count-1;let minT=last?guarantee:0,pityHit='';
  if(progress.pity.myth+1>=MYTH_PITY){minT=4;pityHit='myth';}else if(progress.pity.leg+1>=legPity()){minT=Math.max(minT,3);pityHit='leg';}
  const tier=chooseTier(pack,minT);
  let choices=pool.filter(c=>tierOf(c)===tier);
  if(last&&rank('ma5')){const missing=choices.filter(c=>!has(c.id));if(missing.length)choices=missing;}
  const card=pick(choices.length?choices:pool);const t=tierOf(card);
  progress.pity.leg=t>=3?0:progress.pity.leg+1;progress.pity.myth=t>=4?0:progress.pity.myth+1;
  const isNew=!has(card.id),finish=rollFinish(pack);
  give(card.id,1,finish);registerPull(card,finish,isNew);
  const shards=isNew?addShards(6*(1+.5*rank('ma6'))*shardMult()):addShards(2*shardMult());
  const dust=isNew?0:addDust(DUST_DUP[t]*dustMult());
  draws.push({id:card.id,tier:t,finish,isNew,shards,dust,pity:pityHit&&t>=(pityHit==='myth'?4:3)?pityHit:''});
 }
 const xp=addXP(count*6*xpMult());
 progress.reveals=draws.map(d=>({...d}));
 checkAchievements();
 log(`${pack.name} ouvert : ${count} cartes, +${draws.reduce((n,d)=>n+d.shards,0)} ◆, +${draws.reduce((n,d)=>n+d.dust,0)} ✧.`);
 // Les cartes sont attribuées UNE SEULE FOIS ici ; l'animation n'est qu'une mise en scène.
 startOpening(pack,draws,{before,xp,levels:levelUps.slice()});
 return true;
}
function simulate(packId,times=100){
 const pack=PACKS.find(p=>p.id===packId)||PACKS[0],counts=[0,0,0,0,0];
 for(let k=0;k<times;k++)for(let i=0;i<packCount(pack);i++)counts[chooseTier(pack,i===packCount(pack)-1?packGuarantee(pack):0)]++;
 return counts;
}

// ============================================================ Forge
function starCost(card,v){const s=v.stars||0;if(s>=5)return null;const t=tierOf(card);return {copies:STAR_COPIES[s],dust:Math.round(STAR_DUST[s]*STAR_FACTOR[t]*forgeDiscount())};}
function upgradeCard(id){const c=get(id),v=owned.get(Number(id));if(!c||!v)return;const k=starCost(c,v);if(!k||v.count-1<k.copies||progress.dust<k.dust)return;
 v.count-=k.copies;progress.dust-=k.dust;v.stars=(v.stars||0)+1;S().upgraded++;emit('forge');log(`${c.name} passe à ★${v.stars}.`);toast('Forge',`${c.name} atteint ★${v.stars}`,'forge');}
function craftCost(c){return Math.round(CRAFT[tierOf(c)]*forgeDiscount());}
function craftCard(id){const c=get(id);if(!c||has(c.id)||progress.dust<craftCost(c))return;progress.dust-=craftCost(c);give(c.id);S().crafted++;registerPull(c,0,true);emit('forge');log(`Carte fabriquée : ${c.name}.`);toast('Forge',`${c.name} fabriquée`,'forge');}
function recycleSpare(){let gained=0;for(const [id,v] of owned){const c=get(id);if(!c||(v.stars||0)<5||v.count<=1)continue;gained+=Math.round(DUST_DUP[tierOf(c)]*.5*(v.count-1));v.count=1;}if(gained){addDust(gained);log(`Recyclage : +${gained} ✧.`);}return gained;}

// ============================================================ Renaissance
function renaissanceGain(){return progress.level<RENAISSANCE_LEVEL?0:Math.min(MAX_PRESTIGE-progress.prestige,1+Math.floor((progress.level-RENAISSANCE_LEVEL)/10));}
function doRenaissance(){const g=renaissanceGain();if(!g)return;
 if(!confirm(`Renaissance : tu repars au niveau 1 avec 35 éclats, tes talents sont remis à zéro (sans remboursement) et les expéditions en cours sont perdues.\nTu gardes cartes, étoiles, poussière, clés, succès et séries.\nTu gagnes ${g} ✺ (+10 % d’XP et d’éclats et +3 points de talent chacun). Continuer ?`))return;
 progress.prestige+=g;Object.assign(progress,{level:1,xp:0,shards:35,skills:{},camps:[]});progress.quests=[];ensureQuests();checkAchievements();
 log(`Renaissance ! +${g} ✺ (total ${progress.prestige}).`);toast('Renaissance',`+${g} ✺ · bonus permanent ${progress.prestige*10} %`,'level');}

// ============================================================ Notifications
function toast(title,text,kind='info'){
 let box=document.getElementById('dlfr117Toasts');
 if(!box){box=document.createElement('div');box.id='dlfr117Toasts';box.className='dlfr117-toasts';box.setAttribute('role','status');box.setAttribute('aria-live','polite');document.body.append(box);}
 const el=document.createElement('div');el.className=`dlfr117-toast dlfr117-toast-${kind}`;el.innerHTML=`<b>${esc(title)}</b><span>${esc(text)}</span>`;
 box.append(el);while(box.children.length>4)box.firstElementChild.remove();
 setTimeout(()=>{el.classList.add('is-out');setTimeout(()=>el.remove(),400);},4200);
}

// ============================================================ VUES DE PROGRESSION
function hud(){
 const p=progress,r=rankInfo(),t=levelTarget(p.level),pct=p.level>=MAX_LEVEL?100:Math.min(100,p.xp/t*100),tl=titles();
 return `<div class="dlfr117-hud" style="--rank:${r.color}">
  <div class="dlfr117-rank"><div class="dlfr117-rank-gem" aria-hidden="true"><span>${p.level}</span></div><div><small>RANG</small><strong>${esc(r.name)}</strong>${r.next?`<em>${esc(r.next[1])} au niv. ${r.next[0]}</em>`:'<em>Rang maximal</em>'}</div></div>
  <div class="dlfr117-xp"><div class="dlfr117-xp-row"><span>Niveau ${p.level}${p.prestige?` · ✺ ${p.prestige}`:''}</span><span>${p.level>=MAX_LEVEL?'MAX':`${fmt(p.xp)} / ${fmt(t)} XP`}</span></div><div class="dlfr117-bar"><i style="width:${pct}%"></i></div>
   <label class="dlfr117-title">Titre <select data-v117-field="title"><option value="">— aucun —</option>${tl.map(x=>`<option ${p.title===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label></div>
  <div class="dlfr117-wallet">
   <span title="Éclats : paquets et talents"><b>◆</b>${fmt(p.shards)}</span>
   <span title="Poussière : forge (étoiles et fabrication)"><b>✧</b>${fmt(p.dust)}</span>
   <span title="Clés de Démon : coffres spéciaux"><b>🔑</b>${fmt(p.keys)}</span>
   <span title="Puissance de collection"><b>⚡</b>${fmt(collectionPower())} <small>P${powerTier()}</small></span>
  </div></div>`;
}
function packArt(pack,size=''){
 return `<div class="dlfr117-booster b-${pack.theme} ${size}" aria-hidden="true"><div class="b-crimp"></div><div class="b-body"><div class="b-pattern"></div><div class="b-glow"></div><div class="b-logo">DLFR <b>CARDS</b></div><div class="b-emblem">${pack.emblem}</div><div class="b-name">${esc(pack.name)}</div><div class="b-meta">${packCount(pack)} CARTES · ORIGINS</div><div class="b-foil"></div></div><div class="b-crimp b-bottom"></div></div>`;
}
function fmtPercent(n){return (n*100).toLocaleString('fr-FR',{maximumFractionDigits:n<.01?2:1})+' %';}
function boostersView(){
 const p=progress;
 return `<section class="dlfr117-panel"><div class="dlfr117-head"><div><small>BOUTIQUE DU LABO</small><h2>Boosters</h2><p>Chaque booster a ses probabilités visibles. Les doublons deviennent de la poussière ✧ pour la Forge.</p></div>
  <div class="dlfr117-pity"><div><span>Garantie Légendaire</span><b>${Math.max(1,legPity()-p.pity.leg)} carte${legPity()-p.pity.leg>1?'s':''}</b><div class="dlfr117-bar small"><i style="width:${p.pity.leg/legPity()*100}%"></i></div></div><div><span>Garantie Mythique</span><b>${Math.max(1,MYTH_PITY-p.pity.myth)} cartes</b><div class="dlfr117-bar small myth"><i style="width:${p.pity.myth/MYTH_PITY*100}%"></i></div></div></div></div>
  <div class="dlfr117-packs">${PACKS.map(pack=>{
   const locked=p.level<pack.level,afford=canAfford(pack.cost),w=weights(pack),g=packGuarantee(pack);
   return `<article class="dlfr117-pack ${locked?'is-locked':''}"><div class="dlfr117-pack-stage">${packArt(pack)}${locked?`<span class="dlfr117-lock">🔒 Niveau ${pack.level}</span>`:''}</div>
    <h3>${esc(pack.name)}</h3><p>${esc(pack.subtitle)}</p>
    <div class="dlfr117-odds">${rarities.map((r,i)=>w[i]>0?`<span class="t${i}"><i></i>${esc(r)} ${fmtPercent(w[i])}</span>`:'').join('')}</div>
    <small>${packCount(pack)} cartes${g?` · ${rarities[g]} ou mieux garantie`:''}${pack.finishBoost?` · finitions ×${pack.finishBoost}`:''}</small>
    <button type="button" class="btn" data-v112-act="open-pack" data-pack="${pack.id}" ${locked||!afford?'disabled':''}>${locked?'Verrouillé':afford?`Ouvrir · ${costText(pack.cost)}`:`${costText(pack.cost)} requis`}</button></article>`;}).join('')}</div>
  ${p.reveals.length?`<div class="dlfr117-sub"><h3>Dernier booster</h3><div class="dlfr117-mini-grid">${p.reveals.map(d=>{const c=get(d.id);return c?`<div>${figure(c,srcData(),true,{finish:d.finish})}<span class="${d.isNew?'is-new':''}">${d.isNew?'Nouvelle':'Doublon'} · +${d.shards} ◆${d.dust?` +${d.dust} ✧`:''}</span></div>`:'';}).join('')}</div></div>`:''}
 </section>`;
}
function campRow(c,i){const d=DESTS.find(x=>x.id===c.dest);if(!d)return '';const left=Math.max(0,c.end-Date.now()),pct=Math.min(100,(Date.now()-c.start)/(c.end-c.start)*100);
 return `<div class="dlfr117-camp" data-v117-camp="${i}"><span class="dlfr117-camp-icon">${d.icon}</span><div><strong>${esc(d.name)}</strong><div class="dlfr117-bar small"><i data-v117-bar style="width:${pct}%"></i></div><small data-v117-left>${left?'Retour dans '+duration(left):'De retour !'}</small></div><button class="btn" type="button" data-v112-act="claim-exp" data-index="${i}" ${left?'disabled':''}>${left?'En route':'Récupérer'}</button></div>`;}
function duration(ms){const s=Math.ceil(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=s%60;return h?`${h} h ${String(m).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;}
function expeditionsView(){
 const p=progress,free=slots()-p.camps.length;
 return `<section class="dlfr117-panel"><div class="dlfr117-head"><div><small>CARTE DU MONDE</small><h2>Expéditions</h2><p>Envoie tes camps vers des destinations de plus en plus lointaines. Plus c’est long, plus le butin est riche : clés, poussière et parfois une carte.</p></div><div class="dlfr117-slots"><b>${p.camps.length} / ${slots()}</b><span>camps occupés</span><small>+1 au niveau 30 et via les talents</small></div></div>
  ${p.camps.length?`<div class="dlfr117-camps">${p.camps.map(campRow).join('')}</div>${p.camps.some(c=>Date.now()>=c.end)?'<button class="btn" type="button" data-v112-act="claim-all">Tout récupérer</button>':''}`:'<p class="dlfr117-empty">Aucun camp en route. Choisis une destination ci-dessous.</p>'}
  <div class="dlfr117-dests">${DESTS.map(d=>{const locked=p.level<d.level;const kc=Math.min(1,d.key+.05*rank('ex4'));
   return `<article class="dlfr117-dest ${locked?'is-locked':''}"><span class="dlfr117-dest-icon">${d.icon}</span><h3>${esc(d.name)}</h3><p class="dlfr117-dest-time">⏱ ${duration(destDuration(d))}</p>
    <ul><li>◆ ${fmt(d.shards*(1+.08*rank('ex1'))*shardMult())}</li><li>${fmt(d.xp*xpMult())} XP</li>${d.dust?`<li>✧ ${fmt(d.dust*dustMult())}</li>`:''}${d.key+.05*rank('ex4')>0?`<li>🔑 ${d.key>=1?Math.floor(d.key)+(rank('ex4')?' (+'+5*rank('ex4')+' %)':''):Math.round(kc*100)+' %'}</li>`:''}${d.card?`<li>Carte ${Math.round(d.card*100)} %</li>`:''}</ul>
    <button class="btn ${locked?'subtle':''}" type="button" data-v112-act="start-exp" data-dest="${d.id}" ${locked||free<=0?'disabled':''}>${locked?`🔒 Niveau ${d.level}`:free<=0?'Aucun camp libre':'Envoyer un camp'}</button></article>`;}).join('')}</div>
 </section>`;
}
function talentsView(){
 const node=s=>{const st=skillState(s),r=rank(s.id);
  return `<article class="dlfr117-node is-${st}"><div class="dlfr117-node-top"><span class="dlfr117-node-icon">${r>=s.max?'✓':s.icon}</span><div><small>NIV. ${s.level}${s.requires.length?' · après '+s.requires.map(x=>SKILLS.find(k=>k.id===x)?.name).join(', '):''}</small><h4>${esc(s.name)}</h4></div></div>
   <p>${esc(s.text(Math.max(1,r)))}${s.max>1&&r?` <em>→ rang ${Math.min(s.max,r+1)} : ${esc(s.text(Math.min(s.max,r+1)))}</em>`:''}</p>
   <div class="dlfr117-pips">${Array.from({length:s.max},(_,i)=>`<i class="${i<r?'on':''}"></i>`).join('')}<span>${r}/${s.max} · ${s.pts} pt${s.pts>1?'s':''}/rang</span></div>
   <button class="btn ${st==='available'?'':'subtle'}" type="button" data-v112-act="skill" data-skill="${s.id}" ${st!=='available'?'disabled':''}>${skillReason(s)}</button></article>`;};
 return `<section class="dlfr117-panel dlfr117-talents"><div class="dlfr117-head"><div><small>ARBRE DE TALENTS</small><h2>Talents</h2><p>1 point au départ, +1 tous les 2 niveaux et +3 par Renaissance. L’arbre complet demande ${SKILLS.reduce((n,s)=>n+s.max*s.pts,0)} points : impossible de tout prendre sans renaître, il faut choisir.</p></div><div class="dlfr117-slots"><b>${freePoints()}</b><span>point${freePoints()>1?'s':''} libre${freePoints()>1?'s':''}</span><small>${spentPoints()} / ${totalPoints()} utilisés</small></div></div>
  <div class="dlfr117-tree">${BRANCHES.map(b=>`<div class="dlfr117-branch c-${b.color}"><header><span>${b.icon}</span><div><h3>${b.name}</h3><small>${b.subtitle}</small></div></header>${SKILLS.filter(s=>s.branch===b.key).map(node).join('<i class="dlfr117-link" aria-hidden="true"></i>')}</div>`).join('')}</div>
  <div class="dlfr117-capstones">${SKILLS.filter(s=>s.branch==='core').map(node).join('')}</div>
 </section>`;
}
function forgeView(data){
 const list=CARDS.filter(c=>has(c.id)).sort((a,b)=>tierOf(b)-tierOf(a)||a.id-b.id);
 if(!list.find(c=>c.id===forgeSel))forgeSel=list[0]?.id||0;
 const cur=get(forgeSel),v=cur&&owned.get(cur.id),k=cur&&v?starCost(cur,v):null;
 const missing=CARDS.filter(c=>!has(c.id)).sort((a,b)=>tierOf(a)-tierOf(b)||a.id-b.id);
 return `<section class="dlfr117-panel"><div class="dlfr117-head"><div><small>FORGE</small><h2>Étoiles & fabrication</h2><p>Consomme des doublons et de la poussière ✧ pour faire monter une carte jusqu’à ★5. Chaque étoile augmente ta puissance de collection, qui donne des bonus permanents.</p></div><div class="dlfr117-slots"><b>⚡ ${fmt(collectionPower())}</b><span>Palier ${powerTier()} / ${POWER_TIERS.length}</span><small>${powerTier()<POWER_TIERS.length?`Prochain palier à ${POWER_TIERS[powerTier()]}`:'Palier maximal'} · +${powerTier()*3} % éclats & XP</small></div></div>
  ${list.length?`<div class="dlfr117-forge"><div class="dlfr117-forge-list">${list.map(c=>{const o=owned.get(c.id),sc=starCost(c,o),ready=sc&&o.count-1>=sc.copies&&progress.dust>=sc.dust;return `<button type="button" class="dlfr117-forge-item ${c.id===forgeSel?'is-current':''} ${ready?'is-ready':''}" data-v112-act="forge-select" data-id="${c.id}"><span class="t${tierOf(c)}">${esc(c.name)}</span><small>${'★'.repeat(o.stars||0)}${'☆'.repeat(5-(o.stars||0))} · ×${o.count}</small></button>`;}).join('')}</div>
   <div class="dlfr117-forge-main">${cur?`<div class="dlfr117-forge-card">${figure(cur,data)}</div><div class="dlfr117-forge-info"><h3>${esc(cur.name)}</h3><p>${esc(rarity(cur))} · ${FIN_NAME[v.finish||0]} · ★${v.stars||0}/5</p>
    ${k?`<ul class="dlfr117-reqs"><li class="${v.count-1>=k.copies?'ok':''}">Doublons : ${v.count-1} / ${k.copies}</li><li class="${progress.dust>=k.dust?'ok':''}">Poussière : ${fmt(progress.dust)} / ${fmt(k.dust)} ✧</li></ul><button class="btn" type="button" data-v112-act="upgrade" data-id="${cur.id}" ${v.count-1>=k.copies&&progress.dust>=k.dust?'':'disabled'}>Forger ★${(v.stars||0)+1}</button>`:'<p class="dlfr117-done">★★★★★ Étoiles maximales</p>'}</div>`:''}</div></div>`:'<p class="dlfr117-empty">Ouvre des boosters pour remplir la Forge.</p>'}
  <div class="dlfr117-sub"><h3>Fabriquer une carte manquante</h3><p class="dlfr117-muted">${missing.length?`${missing.length} carte${missing.length>1?'s':''} manquante${missing.length>1?'s':''}.`:'Ta collection est complète.'}</p><div class="dlfr117-craft">${missing.slice(0,60).map(c=>`<button type="button" class="dlfr117-craft-item t${tierOf(c)}" data-v112-act="craft" data-id="${c.id}" ${progress.dust<craftCost(c)?'disabled':''}><span>${esc(c.name)}</span><small>${esc(rarity(c))} · ✧ ${fmt(craftCost(c))}</small></button>`).join('')}</div>
   <button class="btn subtle" type="button" data-v112-act="recycle">Recycler les doublons des cartes ★5</button></div>
 </section>`;
}
function goalsView(){
 const tabs=[['quests','Missions'],['achievements',`Succès ${Object.keys(progress.achievements).length}/${ACHIEVEMENTS.length}`],['sets',`Séries ${Object.keys(progress.sets).length}/${SETS.length}`],['renaissance','Renaissance']];
 let body='';
 if(goalsTab==='quests')body=`<div class="dlfr117-quests">${progress.quests.map(q=>{const done=q.have>=q.target;return `<article class="dlfr117-quest ${done?'is-done':''}"><h4>${esc(questText(q))}</h4><div class="dlfr117-bar small"><i style="width:${q.have/q.target*100}%"></i></div><small>${fmt(q.have)} / ${fmt(q.target)}</small><p>Récompense : ${q.reward.xp} XP · ◆ ${q.reward.shards}${q.reward.keys?' · 🔑 1':''}${q.reward.dust?' · ✧ '+q.reward.dust:''}</p><div class="dlfr117-row">${done?`<button class="btn" type="button" data-v112-act="quest-claim" data-id="${q.id}">Réclamer</button>`:`<button class="btn subtle" type="button" data-v112-act="quest-reroll" data-id="${q.id}" ${progress.shards<rerollCost()?'disabled':''}>Changer · ◆ ${rerollCost()}</button>`}</div></article>`;}).join('')}</div><p class="dlfr117-muted">Une mission réclamée est aussitôt remplacée. Les récompenses grandissent avec ton niveau.</p>`;
 if(goalsTab==='achievements')body=`<div class="dlfr117-achievements">${ACHIEVEMENTS.map(a=>{const ok=progress.achievements[a.id],v=Math.min(a.value(),a.target);return `<article class="dlfr117-ach ${ok?'is-done':''}"><span>${ok?'🏆':'◌'}</span><div><h4>${esc(a.name)}</h4><p>${esc(a.desc)}</p><div class="dlfr117-bar small"><i style="width:${v/a.target*100}%"></i></div><small>${fmt(v)} / ${fmt(a.target)} · ${Object.entries(a.reward).map(([k,n])=>`${{keys:'🔑',dust:'✧',shards:'◆',xp:'XP'}[k]} ${n}`).join(' ')}${a.title?` · titre « ${esc(a.title)} »`:''}</small></div></article>`;}).join('')}</div>`;
 if(goalsTab==='sets')body=`<div class="dlfr117-sets">${SETS.map(s=>{const pr=setProgress(s),done=progress.sets[s.id],ready=!done&&pr.total&&pr.have>=pr.total;return `<article class="dlfr117-set ${done?'is-done':''}"><h4>${esc(s.name)}</h4><p>${s.finish?`Toutes en ${FIN_NAME[s.finish]} ou mieux`:s.stars?`Toutes à ★${s.stars} ou plus`:'Toutes les cartes de la série'}</p><div class="dlfr117-bar small"><i style="width:${pr.total?pr.have/pr.total*100:0}%"></i></div><small>${pr.have} / ${pr.total} · 🔑 ${s.reward.keys} · ✧ ${s.reward.dust} · +5 % ◆ permanents</small>${done?'<b class="dlfr117-ok">✓ Terminée</b>':`<button class="btn" type="button" data-v112-act="set-claim" data-id="${s.id}" ${ready?'':'disabled'}>Valider la série</button>`}</article>`;}).join('')}</div>`;
 if(goalsTab==='renaissance'){const g=renaissanceGain();body=`<div class="dlfr117-reborn"><div class="dlfr117-reborn-mark">✺</div><div><h3>Renaissance ${progress.prestige}/${MAX_PRESTIGE}</h3><p>À partir du niveau ${RENAISSANCE_LEVEL}, tu peux renaître : retour au niveau 1, talents remis à zéro, mais tu gardes toute ta collection, la poussière, les clés, les succès et les séries.</p><ul><li>Chaque ✺ : +10 % d’XP et d’éclats, +3 points de talent permanents.</li><li>Gain : 1 ✺ au niveau 60, +1 tous les 10 niveaux au-delà.</li><li>Bonus actuel : +${progress.prestige*10} % · ${progress.prestige*3} points de talent supplémentaires.</li></ul><button class="btn" type="button" data-v112-act="renaissance" ${g?'':'disabled'}>${g?`Renaître · +${g} ✺`:progress.prestige>=MAX_PRESTIGE?'Maximum atteint':`Disponible au niveau ${RENAISSANCE_LEVEL}`}</button></div></div>`;}
 return `<section class="dlfr117-panel"><div class="dlfr117-head"><div><small>OBJECTIFS</small><h2>Missions, succès & séries</h2><p>Des objectifs à court, moyen et très long terme.</p></div></div><div class="dlfr117-tabs">${tabs.map(([k,t])=>`<button type="button" class="${goalsTab===k?'active':''}" data-v112-act="goals-tab" data-tab="${k}">${t}</button>`).join('')}</div>${body}</section>`;
}
function progressionPage(data){
 ensureQuests();
 const inner=view==='packs'?boostersView():view==='expeditions'?expeditionsView():view==='talents'?talentsView():view==='forge'?forgeView(data):goalsView();
 return `<div class="dlfr117-game">${hud()}${inner}
  <div class="dlfr117-footer"><p>Tout est temporaire. Exporte ta <strong>session de test</strong> pour la reprendre plus tard (les sessions V114–V116 sont acceptées).</p><div class="dlfr113-create-buttons"><button class="btn subtle" data-v112-act="export-session" type="button">↓ Exporter ma session</button><button class="btn subtle" data-v112-act="open-session-import" type="button">↑ Importer une session</button><input type="file" id="dlfr114SessionFile" accept="application/json,.json" hidden></div></div></div>`;
}

// ============================================================ Export / import de session
function exportSession(){
 download({format:'dlfr-cards-session',version:2,exportedAt:new Date().toISOString(),customCards:customCards.map(c=>({...c})),owned:[...owned].map(([id,v])=>({id,count:v.count,finish:v.finish||0,stars:v.stars||0})),overrides:[...overrides],
  progress:{...progress,reveals:[],skills:{...progress.skills},camps:progress.camps.map(c=>({...c})),quests:progress.quests.map(q=>({...q,reward:{...q.reward}})),achievements:{...progress.achievements},sets:{...progress.sets},pity:{...progress.pity},stats:{...progress.stats,tiers:[...progress.stats.tiers],finishes:[...progress.stats.finishes]}}},'DLFR_Cards_session_v117.json');
 log('Session exportée.');
}
async function importSession(file){
 if(!file||file.size>20000000){alert('Fichier de session trop volumineux (20 Mo maximum).');return;}
 try{
  const x=JSON.parse(await file.text());
  if(x?.format!=='dlfr-cards-session'||![1,2].includes(x.version)||!Array.isArray(x.customCards)||x.customCards.length>MAX_CUSTOM||!Array.isArray(x.owned)||!Array.isArray(x.overrides))throw new Error('Format invalide');
  const cards=x.customCards.map((v,i)=>cleanCard(v,1001+i));if(cards.some(c=>!c))throw new Error('Carte invalide');
  const I=(v,max,min=0)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
  const ids=new Set([...SOURCE.map((_,i)=>i+1),...cards.map(c=>c.id)]);
  const inv=[];for(const row of x.owned){
   const finish=x.version===1?(row.holo===true?1:0):row.finish,stars=x.version===1?0:row.stars;
   if(!ids.has(row.id)||!I(row.count,10000,1)||!I(finish,3)||!I(stars,5))throw new Error('Inventaire invalide');inv.push([row.id,{count:row.count,finish,stars,holo:finish>0}]);}
  const rares=[];for(const e of x.overrides){if(!Array.isArray(e)||!ids.has(e[0])||!rarities.includes(e[1]))throw new Error('Rareté invalide');rares.push(e);}
  const p=x.progress;if(!p||typeof p!=='object')throw new Error('Progression absente');
  let np=freshProgress();
  if(x.version===1){
   // V114–V116 : niveau, éclats et compteurs repris ; anciens talents remboursés en points (l'arbre a changé).
   if(!I(p.level,30,1)||!I(p.shards,1000000))throw new Error('Statistiques invalides');
   Object.assign(np,{level:p.level,shards:p.shards});np.stats.packs=I(p.packsOpened,100000)?p.packsOpened:0;np.stats.expeditions=I(p.expeditions,100000)?p.expeditions:0;np.stats.bestLevel=p.level;
  }else{
   if(!I(p.level,MAX_LEVEL,1)||!I(p.xp,10000000)||!I(p.shards,100000000)||!I(p.dust,100000000)||!I(p.keys,100000)||!I(p.prestige,MAX_PRESTIGE)||!I(p.questSeed||0,10000000))throw new Error('Statistiques invalides');
   const skills={};if(!p.skills||typeof p.skills!=='object'||Array.isArray(p.skills))throw new Error('Talents invalides');
   for(const [k,r] of Object.entries(p.skills)){const s=SKILLS.find(z=>z.id===k);if(!s||!I(r,s.max,1)||p.level<s.level)throw new Error('Talent invalide');skills[k]=r;}
   for(const k of Object.keys(skills)){const s=SKILLS.find(z=>z.id===k);if(!s.requires.every(r=>skills[r]))throw new Error('Arbre de talents incohérent');}
   if(SKILLS.reduce((n,s)=>n+(skills[s.id]||0)*s.pts,0)>1+Math.floor(p.level/2)+3*p.prestige)throw new Error('Nombre de points incohérent');
   const camps=Array.isArray(p.camps)?p.camps:[];if(camps.length>4)throw new Error('Expéditions invalides');
   for(const c of camps)if(!DESTS.some(d=>d.id===c?.dest)||!I(c.start,4102444800000)||!I(c.end,4102444800000)||c.end<c.start)throw new Error('Expédition invalide');
   const flags=(o,list)=>{const out={};if(!o||typeof o!=='object'||Array.isArray(o))return out;for(const [k,v] of Object.entries(o))if(v===true&&list.some(z=>z.id===k))out[k]=true;return out;};
   const st=p.stats||{},stats=newStats();for(const k of Object.keys(stats)){if(Array.isArray(stats[k])){if(Array.isArray(st[k])&&st[k].length===stats[k].length&&st[k].every(n=>I(n,100000000)))stats[k]=[...st[k]];}else if(I(st[k],100000000))stats[k]=st[k];}
   const quests=Array.isArray(p.quests)?p.quests.filter(q=>q&&QUEST_POOL.some(t=>t.type===q.type)&&I(q.target,100000,1)&&I(q.have,q.target)&&q.reward&&typeof q.reward==='object'&&['xp','shards','dust','keys'].every(k=>q.reward[k]===undefined||I(q.reward[k],1000000))).slice(0,3).map(q=>({id:String(q.id).slice(0,20),type:q.type,target:q.target,have:q.have,reward:{...q.reward}})):[];
   Object.assign(np,{level:p.level,xp:p.xp,shards:p.shards,dust:p.dust,keys:p.keys,prestige:p.prestige,skills,camps:camps.map(c=>({dest:c.dest,start:c.start,end:c.end})),quests,questSeed:p.questSeed||0,
    achievements:flags(p.achievements,ACHIEVEMENTS),sets:flags(p.sets,SETS),pity:{leg:I(p.pity?.leg,1000)?p.pity.leg:0,myth:I(p.pity?.myth,1000)?p.pity.myth:0},stats,title:typeof p.title==='string'?p.title.slice(0,40):''});
  }
  if(!confirm('Restaurer cette session de test ? Les cartes et la progression actuelles seront remplacées.'))return;
  reset();customCards.push(...cards);CARDS.push(...cards);for(const [id,v] of inv)owned.set(id,v);for(const [id,r] of rares)overrides.set(id,r);
  Object.assign(progress,np);ensureQuests();
  log(`Session de test restaurée (format v${x.version}).`);view='packs';repaint();
 }catch(error){alert('Import de session impossible : '+error.message);}
}

// ============================================================ OUVERTURE CINÉMATIQUE
const OPEN={st:null,el:null,canvas:null,ctx:null,parts:[],raf:0,sound:false,audio:null,last:0,w:0,h:0};
const reducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const wait=ms=>new Promise(r=>setTimeout(r,reducedMotion()?Math.min(ms,120):ms));
function startOpening(pack,draws,meta){
 // Les meilleures cartes à la fin, pour le suspense.
 const order=draws.map((d,i)=>({...d,k:i})).sort((a,b)=>(a.tier*10+a.finish)-(b.tier*10+b.finish)||a.k-b.k);
 OPEN.st={pack,draws:order,i:0,stage:'sealed',flipped:false,busy:false,tear:0,meta};
 mountOpening();
}
function mountOpening(){
 unmountOpening(true);
 const st=OPEN.st,el=document.createElement('div');
 el.id='dlfr117Open';el.className=`dlfr117-open o-theme-${st.pack.theme}`;el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-labelledby','dlfr117OpenTitle');
 el.innerHTML=`<div class="o-bg"></div><div class="o-rays" aria-hidden="true"></div><canvas class="o-fx" aria-hidden="true"></canvas><div class="o-flash" aria-hidden="true"></div>
  <header class="o-top"><div><small>DLFR CARDS · OUVERTURE</small><h2 id="dlfr117OpenTitle">${esc(st.pack.name)}</h2></div><div class="o-tools"><span class="o-count" aria-live="polite"></span><button type="button" data-o="sound" aria-pressed="false">🔇 Son</button><button type="button" data-o="skip">Tout révéler ⏭</button></div></header>
  <div class="o-stage"></div><div class="o-banner" aria-live="polite"></div><div class="o-tray" aria-hidden="true"></div>
  <footer class="o-foot"><div class="o-buttons"></div><p class="o-hint"></p></footer>`;
 document.body.append(el);OPEN.el=el;document.documentElement.classList.add('dlfr117-noscroll');
 OPEN.canvas=el.querySelector('.o-fx');OPEN.ctx=OPEN.canvas.getContext('2d');resizeFx();
 el.addEventListener('click',openingClick);el.addEventListener('pointerdown',packPointerDown);el.addEventListener('pointermove',cardTilt);
 renderOpening();loopFx();
}
function unmountOpening(silent){
 cancelAnimationFrame(OPEN.raf);OPEN.raf=0;OPEN.parts=[];
 if(OPEN.el){OPEN.el.remove();OPEN.el=null;}
 document.documentElement.classList.remove('dlfr117-noscroll');
 if(!silent){OPEN.st=null;repaint();}
}
function setOpening(sel,html){const n=OPEN.el?.querySelector(sel);if(n)n.innerHTML=html;}
function cardBack(tier){return `<div class="o-back-art aura-${tier}"><div class="o-back-ring"></div><span>DLFR</span><b>◆</b><small>CARDS · ORIGINS</small></div>`;}
function renderOpening(){
 const st=OPEN.st,el=OPEN.el;if(!st||!el)return;
 el.dataset.stage=st.stage;
 const n=st.draws.length,data=srcData();
 el.querySelector('.o-count').textContent=st.stage==='cards'?`Carte ${st.i+1} / ${n}`:st.stage==='summary'?'Bilan':`${n} cartes`;
 el.querySelector('[data-o="skip"]').hidden=st.stage==='summary';
 if(st.stage==='sealed'){
  setOpening('.o-stage',`<div class="o-pack" style="--tear:0" data-o="pack" tabindex="-1"><div class="o-pack-half o-pack-top">${packArt(st.pack,'is-big')}</div><div class="o-pack-half o-pack-bottom">${packArt(st.pack,'is-big')}</div><div class="o-tear-line"><span class="o-tear-cut"></span><i class="o-tear-handle">✂</i></div></div>`);
  setOpening('.o-buttons',`<button type="button" class="o-btn o-primary" data-o="next">Déchirer le booster</button>`);
  setOpening('.o-hint','Glisse le long de la ligne pour déchirer · ou clique / Espace');setOpening('.o-banner','');
 }else if(st.stage==='opening'){
  setOpening('.o-buttons','');setOpening('.o-hint','');
 }else if(st.stage==='cards'){
  const d=st.draws[st.i],card=get(d.id),left=n-st.i-1;
  setOpening('.o-stage',`<div class="o-deck">${Array.from({length:Math.min(4,left)},(_,k)=>`<div class="o-ghost" style="--k:${k+1}">${cardBack(0)}</div>`).join('')}
   <div class="o-card t${d.tier} f${d.finish} is-entering" data-o="card" tabindex="0" aria-label="Carte à révéler"><div class="o-card-inner"><div class="o-face o-back">${cardBack(d.tier)}</div><div class="o-face o-front">${card?figure(card,data,false,{finish:d.finish,stars:0}):''}<div class="o-glare"></div></div></div></div></div>`);
  setOpening('.o-banner','');
  setOpening('.o-buttons',`<button type="button" class="o-btn o-primary" data-o="next">Révéler la carte</button>`);
  setOpening('.o-hint',d.tier>=2?'Quelque chose brille derrière cette carte…':'Clique sur la carte ou appuie sur Espace');
  setTimeout(()=>OPEN.el?.querySelector('.o-card')?.classList.remove('is-entering'),reducedMotion()?0:520);
 }else if(st.stage==='summary')renderSummary();
 OPEN.el.querySelector('.o-primary')?.focus({preventScroll:true});
}
function bannerFor(d){
 const r=rarities[d.tier];
 return `<div class="o-ann t${d.tier}"><span class="o-ann-rarity">${esc(r.toUpperCase())}${d.finish?` · ${FIN_NAME[d.finish].toUpperCase()}`:''}</span><strong>${esc(get(d.id)?.name||'')}</strong><em class="${d.isNew?'is-new':''}">${d.isNew?'✦ NOUVELLE CARTE':'DOUBLON'} · +${d.shards} ◆${d.dust?` · +${d.dust} ✧`:''}${d.pity?' · GARANTIE ACTIVÉE':''}</em></div>`;
}
async function revealCurrent(){
 const st=OPEN.st;if(!st||st.busy||st.flipped)return;st.busy=true;
 const d=st.draws[st.i],cardEl=OPEN.el.querySelector('.o-card');
 if(d.tier>=2&&!reducedMotion()){cardEl.classList.add('is-charging');sfx('charge',d.tier);const pos=centerOf(cardEl);for(let k=0;k<d.tier+1;k++){spawnRing(pos.x,pos.y,d.tier);await wait(220+d.tier*70);}}
 if(!OPEN.st)return;
 cardEl.classList.remove('is-charging');cardEl.classList.add('is-flipped');st.flipped=true;sfx('flip');
 await wait(260);if(!OPEN.st)return;
 const pos=centerOf(cardEl);burst(pos.x,pos.y,d.tier,d.finish);sfx('reveal',d.tier);
 const root=OPEN.el;root.classList.remove('rays-1','rays-2','rays-3','rays-4');void root.offsetWidth;
 const rays=Math.min(4,Math.max(d.tier,d.finish?d.finish+1:0));if(rays>=2)root.classList.add('rays-'+rays);
 if(d.tier>=3){root.classList.remove('is-flash');void root.offsetWidth;root.classList.add('is-flash');}
 if(d.tier>=4&&!reducedMotion()){root.classList.remove('is-shake');void root.offsetWidth;root.classList.add('is-shake');}
 setOpening('.o-banner',bannerFor(d));
 const last=st.i===st.draws.length-1;
 setOpening('.o-buttons',`<button type="button" class="o-btn o-primary" data-o="next">${last?'Voir le bilan':'Carte suivante'}</button>`);
 setOpening('.o-hint',d.isNew?'Elle rejoint ta collection.':'Doublon : converti en poussière ✧ pour la Forge.');
 OPEN.el.querySelector('.o-primary')?.focus({preventScroll:true});
 await wait(380);st.busy=false;
}
async function nextCard(){
 const st=OPEN.st;if(!st||st.busy)return;st.busy=true;
 const d=st.draws[st.i],cardEl=OPEN.el.querySelector('.o-card'),card=get(d.id);
 cardEl?.classList.add('is-leaving');
 const tray=OPEN.el.querySelector('.o-tray');if(tray&&card){const t=document.createElement('div');t.className=`o-tray-item t${d.tier}`;t.innerHTML=figure(card,srcData(),true,{finish:d.finish});tray.append(t);}
 OPEN.el.classList.remove('rays-1','rays-2','rays-3','rays-4');
 await wait(300);if(!OPEN.st)return;
 st.i++;st.flipped=false;st.busy=false;
 if(st.i>=st.draws.length){st.stage='summary';}
 renderOpening();
}
async function tearComplete(){
 const st=OPEN.st;if(!st||st.stage!=='sealed')return;
 st.stage='opening';st.tear=1;
 const pack=OPEN.el.querySelector('.o-pack');pack.style.setProperty('--tear',1);pack.classList.add('is-open');
 renderOpening();sfx('tear');
 const r=pack.getBoundingClientRect();burst(r.left+r.width/2,r.top+r.height*.16,2,0,true);
 await wait(1150);if(!OPEN.st)return;
 st.stage='cards';OPEN.el.querySelector('.o-tray').innerHTML='';renderOpening();
}
async function autoTear(){
 const st=OPEN.st;if(!st||st.stage!=='sealed'||st.busy)return;st.busy=true;
 const pack=OPEN.el.querySelector('.o-pack');const r=pack.getBoundingClientRect();const from=st.tear,t0=performance.now(),dur=reducedMotion()?60:560;
 await new Promise(res=>{const step=now=>{const k=Math.min(1,(now-t0)/dur);st.tear=from+(1-from)*k;pack.style.setProperty('--tear',st.tear);if(Math.random()<.7)spark(r.left+r.width*st.tear,r.top+r.height*.16);if(k<1&&OPEN.st)requestAnimationFrame(step);else res();};requestAnimationFrame(step);});
 st.busy=false;tearComplete();
}
let drag=null;
function packPointerDown(e){
 const st=OPEN.st;if(!st||st.stage!=='sealed')return;const pack=e.target.closest('.o-pack');if(!pack)return;
 e.preventDefault();const r=pack.getBoundingClientRect();drag={x0:e.clientX,y0:e.clientY,moved:false,r,pack};
 pack.setPointerCapture?.(e.pointerId);
 const move=ev=>{if(!drag||!OPEN.st)return;const dx=ev.clientX-drag.x0;if(Math.abs(dx)>8)drag.moved=true;if(!drag.moved)return;
  const k=Math.max(OPEN.st.tear,Math.min(1,(ev.clientX-drag.r.left)/drag.r.width));if(k>OPEN.st.tear){OPEN.st.tear=k;drag.pack.style.setProperty('--tear',k);spark(drag.r.left+drag.r.width*k,drag.r.top+drag.r.height*.16);sfx('scratch');}
  if(OPEN.st.tear>=.9){finish();tearComplete();}};
 const finish=()=>{pack.removeEventListener('pointermove',move);pack.removeEventListener('pointerup',up);pack.removeEventListener('pointercancel',up);};
 const up=()=>{const moved=drag?.moved;drag=null;finish();if(!moved&&OPEN.st?.stage==='sealed')autoTear();};
 pack.addEventListener('pointermove',move);pack.addEventListener('pointerup',up);pack.addEventListener('pointercancel',up);
}
function cardTilt(e){
 const c=e.target.closest?.('.o-card.is-flipped');if(!c||e.pointerType==='touch')return;
 const r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
 c.style.setProperty('--rx',`${(.5-y)*16}deg`);c.style.setProperty('--ry',`${(x-.5)*20}deg`);c.style.setProperty('--mx',`${x*100}%`);c.style.setProperty('--my',`${y*100}%`);
}
function primaryAction(){
 const st=OPEN.st;if(!st)return;
 if(st.stage==='sealed')autoTear();
 else if(st.stage==='cards')st.flipped?nextCard():revealCurrent();
 else if(st.stage==='summary')closeOpening();
}
function skipAll(){const st=OPEN.st;if(!st||st.stage==='summary')return;st.stage='summary';st.busy=false;OPEN.el.classList.remove('rays-1','rays-2','rays-3','rays-4');renderOpening();}
function closeOpening(){unmountOpening(false);}
function openingClick(e){
 const b=e.target.closest('[data-o]');if(!b||!OPEN.st)return;const a=b.dataset.o;
 if(a==='next')primaryAction();
 else if(a==='card'){if(OPEN.st.stage==='cards')primaryAction();}
 else if(a==='skip')skipAll();
 else if(a==='close')closeOpening();
 else if(a==='again'){const id=OPEN.st.pack.id;unmountOpening(true);OPEN.st=null;if(!openPack(id))repaint();}
 else if(a==='sound'){OPEN.sound=!OPEN.sound;b.textContent=OPEN.sound?'🔊 Son':'🔇 Son';b.setAttribute('aria-pressed',String(OPEN.sound));if(OPEN.sound)sfx('flip');}
}
function renderSummary(){
 const st=OPEN.st,data=srcData(),m=st.meta,draws=st.draws;
 const shards=draws.reduce((n,d)=>n+d.shards,0),dust=draws.reduce((n,d)=>n+d.dust,0),news=draws.filter(d=>d.isNew).length;
 const best=draws.reduce((a,d)=>d.tier>a.tier||(d.tier===a.tier&&d.finish>a.finish)?d:a,draws[0]);
 const startPct=m.before.level>=MAX_LEVEL?100:m.before.xp/m.before.target*100,endPct=progress.level>=MAX_LEVEL?100:progress.xp/levelTarget(progress.level)*100;
 const again=PACKS.find(p=>p.id===st.pack.id),canAgain=again&&canAfford(again.cost)&&progress.level>=again.level;
 setOpening('.o-stage',`<div class="o-summary"><h3>${news} nouvelle${news>1?'s':''} carte${news>1?'s':''} · ${draws.length-news} doublon${draws.length-news>1?'s':''}</h3>
  <div class="o-sum-grid">${draws.map((d,k)=>{const c=get(d.id);return c?`<div class="o-sum-card t${d.tier} ${d===best&&d.tier>=2?'is-best':''}" style="--k:${k}">${figure(c,data,true,{finish:d.finish})}<span class="${d.isNew?'is-new':''}">${d.isNew?'NOUVELLE':'DOUBLON'}</span></div>`:'';}).join('')}</div>
  <div class="o-gains"><div><b data-count="${shards}">0</b><span>◆ éclats</span></div><div><b data-count="${dust}">0</b><span>✧ poussière</span></div><div><b data-count="${m.xp}">0</b><span>XP</span></div></div>
  <div class="o-xp"><span>Niv. ${progress.level}</span><div class="o-xpbar"><i style="--from:${m.levels.length?0:startPct}%;--to:${endPct}%"></i></div><span>${progress.level>=MAX_LEVEL?'MAX':`${fmt(progress.xp)} / ${fmt(levelTarget(progress.level))}`}</span></div>
  ${m.levels.length?`<div class="o-levelup"><b>NIVEAU ${progress.level} !</b>${m.levels.filter(l=>l.rank).map(l=>`<span>Nouveau rang : ${esc(l.rank)}</span>`).join('')}<small>${m.levels.map(l=>`+${l.bonus} ◆${l.keys?' +1 🔑':''}`).join(' · ')}</small></div>`:''}
  <p class="o-pity">Garantie Légendaire dans ${Math.max(1,legPity()-progress.pity.leg)} cartes · Mythique dans ${Math.max(1,MYTH_PITY-progress.pity.myth)}</p></div>`);
 setOpening('.o-banner','');
 setOpening('.o-buttons',`${canAgain?`<button type="button" class="o-btn" data-o="again">Rouvrir · ${costText(again.cost)}</button>`:''}<button type="button" class="o-btn o-primary" data-o="close">Terminer</button>`);
 setOpening('.o-hint','Échap ou Espace pour fermer');
 OPEN.el.querySelectorAll('[data-count]').forEach(b=>countUp(b,+b.dataset.count));
 if(m.levels.length){sfx('level');setTimeout(()=>{if(!OPEN.el)return;const r=OPEN.el.querySelector('.o-levelup')?.getBoundingClientRect();if(r)burst(r.left+r.width/2,r.top+r.height/2,3,0,true);},500);}
 OPEN.el.querySelector('.o-primary')?.focus({preventScroll:true});
}
function countUp(el,to){const t0=performance.now(),dur=reducedMotion()?1:900;const step=now=>{const k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,3);el.textContent='+'+fmt(to*e);if(k<1&&el.isConnected)requestAnimationFrame(step);};requestAnimationFrame(step);}
function centerOf(el){const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};}

// ----- Particules (canvas)
function resizeFx(){const c=OPEN.canvas;if(!c)return;const dpr=Math.min(2,window.devicePixelRatio||1);OPEN.w=window.innerWidth;OPEN.h=window.innerHeight;c.width=OPEN.w*dpr;c.height=OPEN.h*dpr;OPEN.ctx.setTransform(dpr,0,0,dpr,0,0);}
window.addEventListener('resize',()=>{if(OPEN.el)resizeFx();});
function color(tier,finish){if(tier>=4||finish>=2)return `hsl(${Math.random()*360|0},95%,70%)`;if(finish===3)return Math.random()<.5?'#ff3355':'#2a1030';return TIER_COLORS[tier];}
function burst(x,y,tier,finish=0,soft=false){
 const base=[16,30,56,110,180][tier]*(soft?.6:1),n=Math.round(base/(reducedMotion()?5:1));
 for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=(2+Math.random()*(4+tier*2.2))*(soft?.8:1);
  OPEN.parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-(tier>=3?1.5:0),g:.06+Math.random()*.06,drag:.975,life:1,decay:.008+Math.random()*.012,size:1.5+Math.random()*(2+tier*.8),c:color(tier,finish),kind:Math.random()<.25+tier*.08?'star':'spark'});}
 if(tier>=3&&!reducedMotion())for(let i=0;i<60;i++)OPEN.parts.push({x:Math.random()*OPEN.w,y:-20-Math.random()*200,vx:(Math.random()-.5)*2,vy:2+Math.random()*3,g:.03,drag:.995,life:1,decay:.004,size:3+Math.random()*4,c:color(tier,finish),kind:'confetti',rot:Math.random()*6,vr:(Math.random()-.5)*.3});
 loopFx();
}
function spawnRing(x,y,tier){const n=reducedMotion()?6:26;for(let i=0;i<n;i++){const a=i/n*Math.PI*2,r=150+Math.random()*40;OPEN.parts.push({x:x+Math.cos(a)*r,y:y+Math.sin(a)*r,vx:-Math.cos(a)*4.2,vy:-Math.sin(a)*4.2,g:0,drag:.97,life:.9,decay:.03,size:2+tier*.5,c:TIER_COLORS[tier],kind:'spark'});}loopFx();}
function spark(x,y){for(let i=0;i<3;i++)OPEN.parts.push({x,y,vx:(Math.random()-.5)*3,vy:-Math.random()*3,g:.12,drag:.97,life:1,decay:.04,size:1.5+Math.random()*1.5,c:'#fff3c4',kind:'spark'});loopFx();}
function loopFx(){
 if(OPEN.raf||!OPEN.ctx)return;
 const tick=()=>{
  const ctx=OPEN.ctx;if(!OPEN.el){OPEN.raf=0;return;}
  ctx.clearRect(0,0,OPEN.w,OPEN.h);ctx.globalCompositeOperation='lighter';
  if(!reducedMotion()&&Math.random()<.35)OPEN.parts.push({x:Math.random()*OPEN.w,y:OPEN.h+10,vx:(Math.random()-.5)*.3,vy:-.4-Math.random()*.8,g:0,drag:1,life:.7,decay:.0025,size:1+Math.random()*1.6,c:'rgba(210,190,255,.8)',kind:'mote'});
  const keep=[];
  for(const p of OPEN.parts){
   p.vx*=p.drag;p.vy=p.vy*p.drag+p.g;p.x+=p.vx;p.y+=p.vy;p.life-=p.decay;if(p.life<=0||p.y>OPEN.h+40)continue;keep.push(p);
   ctx.globalAlpha=Math.max(0,Math.min(1,p.life));ctx.fillStyle=p.c;ctx.strokeStyle=p.c;
   if(p.kind==='spark'){ctx.lineWidth=p.size*.7;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*3,p.y-p.vy*3);ctx.stroke();}
   else if(p.kind==='star'){const s=p.size*1.6;ctx.beginPath();ctx.moveTo(p.x,p.y-s);ctx.lineTo(p.x+s*.28,p.y-s*.28);ctx.lineTo(p.x+s,p.y);ctx.lineTo(p.x+s*.28,p.y+s*.28);ctx.lineTo(p.x,p.y+s);ctx.lineTo(p.x-s*.28,p.y+s*.28);ctx.lineTo(p.x-s,p.y);ctx.lineTo(p.x-s*.28,p.y-s*.28);ctx.closePath();ctx.fill();}
   else if(p.kind==='confetti'){ctx.globalCompositeOperation='source-over';p.rot+=p.vr;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.fillRect(-p.size/2,-p.size/4,p.size,p.size/2);ctx.restore();ctx.globalCompositeOperation='lighter';}
   else{ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();}
  }
  OPEN.parts=keep.slice(-1400);ctx.globalAlpha=1;
  OPEN.raf=requestAnimationFrame(tick);
 };
 OPEN.raf=requestAnimationFrame(tick);
}
// ----- Sons synthétisés (désactivés par défaut)
let lastScratch=0;
function sfx(name,tier=0){
 if(!OPEN.sound)return;
 try{
  if(!OPEN.audio){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;OPEN.audio=new C();}
  const ac=OPEN.audio,t=ac.currentTime;
  const tone=(f,at,d,type='sine',g=.07)=>{const o=ac.createOscillator(),v=ac.createGain();o.type=type;o.frequency.setValueAtTime(f,t+at);v.gain.setValueAtTime(0,t+at);v.gain.linearRampToValueAtTime(g,t+at+.01);v.gain.exponentialRampToValueAtTime(.0001,t+at+d);o.connect(v).connect(ac.destination);o.start(t+at);o.stop(t+at+d+.05);};
  const noise=(d,f0,f1,g=.12)=>{const b=ac.createBuffer(1,ac.sampleRate*d,ac.sampleRate),a=b.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;const s=ac.createBufferSource(),fl=ac.createBiquadFilter(),v=ac.createGain();s.buffer=b;fl.type='bandpass';fl.frequency.setValueAtTime(f0,t);fl.frequency.exponentialRampToValueAtTime(f1,t+d);v.gain.setValueAtTime(g,t);v.gain.exponentialRampToValueAtTime(.0001,t+d);s.connect(fl).connect(v).connect(ac.destination);s.start(t);};
  if(name==='scratch'){if(performance.now()-lastScratch<60)return;lastScratch=performance.now();noise(.05,2500,4000,.04);}
  else if(name==='tear')noise(.45,800,5000,.16);
  else if(name==='flip')noise(.08,1800,900,.08);
  else if(name==='charge')tone(110+tier*40,0,.6,'sawtooth',.025);
  else if(name==='reveal'){const notes=[523,659,784,1047,1319];for(let i=0;i<=tier;i++)tone(notes[i],i*.08,.5+tier*.1,'triangle',.06);if(tier>=4)[1568,2093].forEach((f,i)=>tone(f,.45+i*.1,1.2,'sine',.04));}
  else if(name==='level')[523,659,784,1047].forEach((f,i)=>tone(f,i*.09,.6,'square',.03));
 }catch{}
}

// ============================================================ PAGE
function tabs(){return [['album','Album'],['collection','Ma collection'],['packs','✦ Boosters'],['expeditions','Expéditions'],['talents','Talents'],['forge','Forge'],['goals','Objectifs'],['creator','Créer des cartes'],['exchanges','Échanges fictifs'],['control','Pouvoirs admin']];}
function filtered(){return CARDS.filter(c=>(view!=='collection'||has(c.id))&&(filter==='all'||filter==='owned'&&has(c.id)||filter==='missing'&&!has(c.id)||filter===c.type||filter===c.series||filter==='Custom'&&c.id>BASE_COUNT)&&normalize(c.name+' '+c.series+' '+rarity(c)).includes(normalize(query)));}
function viewPage(data){
 if(!gate)return '<section class="paper"><h2>Laboratoire privé</h2><p>Accès refusé.</p></section>';
 const current=CARDS.find(c=>c.id===selected)||CARDS[0];
 const cur=owned.get(current.id),currentCount=cur?.count||0;
 const prog=['packs','expeditions','talents','forge','goals'].includes(view);
 return `<section class="dlfr112 dlfr117" id="dlfr112Lab">
  <div class="dlfr112-header"><div><div class="dlfr112-eyebrow">DLFR CARDS · ORIGINS 001 · V117</div><h1>Atelier DLFR Cards</h1><p>${CARDS.length} cartes à tester, dont ${customCards.length} créées ici.${progress.title?` · <b>${esc(progress.title)}</b>`:''}</p></div><span class="dlfr112-demo-label">MODE TEST · NON SAUVEGARDÉ</span></div>
  <div class="dlfr112-toolbar"><div class="dlfr112-summary"><b>${status()}</b><span>Progression de collection : ${Math.round(inventoryUnique()/CARDS.length*100)} %</span><div class="dlfr112-meter"><span style="width:${inventoryUnique()/CARDS.length*100}%"></span></div></div><div class="dlfr112-modes" role="tablist" aria-label="Espace de test">${tabs().map(([id,title])=>`<button type="button" role="tab" aria-selected="${view===id}" class="${view===id?'active':''}" data-v112-act="mode" data-mode="${id}">${title}${id==='expeditions'&&progress.camps.some(c=>Date.now()>=c.end)?' <i class="dlfr117-dot"></i>':''}${id==='goals'&&progress.quests.some(q=>q.have>=q.target)?' <i class="dlfr117-dot"></i>':''}</button>`).join('')}</div></div>
  ${prog?progressionPage(data):''}
  ${view==='album'||view==='collection'?`<div class="dlfr112-album-layout"><div class="dlfr112-gallery-pane"><div class="dlfr112-filters"><label>Affichage<select data-v112-field="filter"><option value="all" ${filter==='all'?'selected':''}>Toutes les cartes</option><option value="owned" ${filter==='owned'?'selected':''}>Possédées</option><option value="missing" ${filter==='missing'?'selected':''}>Manquantes</option><option value="level" ${filter==='level'?'selected':''}>Niveaux</option><option value="player" ${filter==='player'?'selected':''}>Joueurs</option><option value="dlfr" ${filter==='dlfr'?'selected':''}>DLFR</option><option value="Legends" ${filter==='Legends'?'selected':''}>GD Legends</option><option value="Modern" ${filter==='Modern'?'selected':''}>Modern Extremes</option>${customCards.length?`<option value="Custom" ${filter==='Custom'?'selected':''}>Mes créations</option>`:''}</select></label><label>Rechercher<input type="search" data-v112-field="search" placeholder="Nom ou rareté…" value="${esc(query)}"></label></div><div class="dlfr112-grid">${filtered().map(c=>cardItem(c,data)).join('')||'<p class="muted">Aucune carte pour ce filtre.</p>'}</div></div><aside class="dlfr112-detail"><div class="dlfr112-detail-inner">${figure(current,data)}<h3>${esc(current.name)}</h3><p>${current.id>BASE_COUNT?'CUSTOM':'ORIGINS'} #${idString(current.id)} · ${esc(current.series)}${cur?` · ${FIN_NAME[cur.finish||0]} · ★${cur.stars||0}`:''}</p>${current.description?`<p class="dlfr113-description">${esc(current.description)}</p>`:''}<div class="dlfr112-detail-actions"><button type="button" class="btn" data-v112-act="give" data-id="${current.id}">+ Recevoir 1 carte</button><button type="button" class="btn subtle" data-v112-act="take" data-id="${current.id}" ${currentCount?'':'disabled'}>− Retirer 1</button><button type="button" class="btn subtle" data-v112-act="holo" data-id="${current.id}" ${currentCount?'':'disabled'}>✧ Finition suivante (${FIN_NAME[((cur?.finish||0)+1)%4]})</button>${currentCount?`<button type="button" class="btn subtle" data-v112-act="forge-open" data-id="${current.id}">⚒ Ouvrir dans la Forge</button>`:''}</div>${current.id>BASE_COUNT?`<button type="button" class="btn subtle" data-v112-act="edit-selected" data-id="${current.id}">✎ Modifier cette carte</button>`:''}<small>Ces actions sont réservées au labo ; aucune récompense n'est transférée à ton compte.</small></div></aside></div>`:''}
  ${view==='creator'?creatorView(data):''}
  ${view==='exchanges'?`<section class="dlfr112-panel"><div class="dlfr112-section-head"><h2>Échanges fictifs</h2><p>Simulation locale avec un partenaire imaginaire. Impossible d'impliquer ou de modifier le compte d'un autre joueur.</p></div><div class="dlfr112-trade"><label>Tu donnes<select id="dlfr112TradeGive">${CARDS.filter(c=>has(c.id)).map(optionCard).join('')||'<option value="">Aucune carte possédée</option>'}</select></label><div class="dlfr112-arrows">⇄</div><label>Tu reçois<select id="dlfr112TradeGet">${CARDS.map(optionCard).join('')}</select></label></div><button class="btn" type="button" data-v112-act="trade" ${inventoryUnique()===0?'disabled':''}>Simuler l'échange</button><p class="muted small">Aucun échange n'est enregistré. Le partenaire est fictif, sans compte Supabase.</p></section>`:''}
  ${view==='control'?`<section class="dlfr112-panel"><div class="dlfr112-section-head"><h2>Console de test · Pouvoirs admin</h2><p>Pour essayer rapidement la progression sans attendre.</p></div>
   <div class="dlfr112-admin-actions"><button class="btn" type="button" data-v112-act="all">✦ Recevoir toutes les cartes</button><button class="btn subtle" type="button" data-v112-act="holo-all">✧ Tout passer en Holo</button><button class="btn subtle" type="button" data-v112-act="cheat" data-what="shards">+1 000 ◆</button><button class="btn subtle" type="button" data-v112-act="cheat" data-what="dust">+500 ✧</button><button class="btn subtle" type="button" data-v112-act="cheat" data-what="keys">+5 🔑</button><button class="btn subtle" type="button" data-v112-act="cheat" data-what="levels">+5 niveaux</button><button class="btn subtle" type="button" data-v112-act="cooldown-skip">Terminer les expéditions</button><button class="btn subtle" type="button" data-v112-act="skills-reset">Réinitialiser les talents (remboursement)</button><button class="btn danger" type="button" data-v112-act="reset">Tout réinitialiser (y compris créations)</button></div>
   <div class="dlfr112-admin-edit"><label>Carte à modifier<select id="dlfr112CardPick">${CARDS.map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${idString(c.id)} · ${esc(c.name)}</option>`).join('')}</select></label><label>Rareté fictive<select id="dlfr112Rarity">${rarities.map(r=>`<option value="${esc(r)}" ${r===rarity(current)?'selected':''}>${esc(r)}</option>`).join('')}</select></label><button class="btn subtle" type="button" data-v112-act="rarity">Tester la rareté</button></div>
   <div class="dlfr112-admin-edit"><label>Simulateur d'équilibrage (rien n'est donné)<select id="dlfr117SimPack">${PACKS.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label><button class="btn subtle" type="button" data-v112-act="simulate">Simuler 1 000 paquets</button></div>
   <p class="dlfr117-sim" id="dlfr117SimOut"></p></section>`:''}
  ${journal.length?`<section class="dlfr112-panel dlfr112-log"><div class="dlfr112-section-head"><h2>Historique de cette session</h2><span class="muted small">Effacé au rechargement</span></div>${journal.slice(-6).reverse().map(x=>`<p>• ${esc(x)}</p>`).join('')}</section>`:''}
 </section>`;
}
function repaint(){const p=document.getElementById('dlfr112Lab');if(p){const y=window.scrollY;p.outerHTML=viewPage(srcData());window.scrollTo(0,y);}}
function reset(){owned.clear();overrides.clear();journal.length=0;selected=2;query='';filter='all';customCards.length=0;CARDS.splice(BASE_COUNT);editCardId=null;creatorImage='';imageError='';clearedImage=false;Object.assign(progress,freshProgress());forgeSel=0;if(OPEN.st){OPEN.st=null;unmountOpening(true);}}
function handleClick(event){
 const b=event.target.closest?.('[data-v112-act]');if(!b||!gate)return;
 if(!document.getElementById('dlfr112Lab')||b.closest('#dlfr117Open'))return;
 event.preventDefault();
 const act=b.dataset.v112Act;
 if(act==='mode'){view=b.dataset.mode;filter='all';query='';}
 else if(act==='select'){selected=Number(b.dataset.id);}
 else if(act==='edit-selected'||act==='edit-card'){const c=get(b.dataset.id);if(!c||c.id<=BASE_COUNT)return;editCardId=c.id;selected=c.id;creatorImage='';imageError='';clearedImage=false;view='creator';}
 else if(act==='new-card'){editCardId=null;creatorImage='';imageError='';clearedImage=false;}
 else if(act==='delete-card'){deleteCustom();}
 else if(act==='clear-image'){creatorImage='';clearedImage=true;const u=document.getElementById('dlfr113ImageUrl');if(u)u.value='';imageError='';refreshPreview();return;}
 else if(act==='export-cards'){exportCards();return;}
 else if(act==='open-import'){document.getElementById('dlfr113ImportFile')?.click();return;}
 else if(act==='start-exp'){startExpedition(b.dataset.dest);}
 else if(act==='claim-exp'){claimExpedition(Number(b.dataset.index));}
 else if(act==='claim-all'){claimAllExpeditions();}
 else if(act==='skill'){buySkill(b.dataset.skill);}
 else if(act==='open-pack'){openPack(b.dataset.pack);return;}
 else if(act==='forge-select'){forgeSel=Number(b.dataset.id);}
 else if(act==='forge-open'){forgeSel=Number(b.dataset.id);view='forge';}
 else if(act==='upgrade'){upgradeCard(b.dataset.id);}
 else if(act==='craft'){craftCard(b.dataset.id);}
 else if(act==='recycle'){const n=recycleSpare();if(!n)toast('Forge','Aucun doublon à recycler (seulement les cartes ★5).','info');}
 else if(act==='goals-tab'){goalsTab=b.dataset.tab;}
 else if(act==='quest-claim'){claimQuest(b.dataset.id);}
 else if(act==='quest-reroll'){rerollQuest(b.dataset.id);}
 else if(act==='set-claim'){claimSet(b.dataset.id);}
 else if(act==='renaissance'){doRenaissance();}
 else if(act==='cooldown-skip'){for(const c of progress.camps)c.end=Date.now();log('Expéditions terminées depuis la console de test.');}
 else if(act==='skills-reset'){if(confirm('Réinitialiser uniquement l’arbre de talents ? Les éclats investis seront restitués.')){const back=refundSkills();log(`Arbre réinitialisé, ${back} ◆ remboursés.`);}}
 else if(act==='cheat'){const w=b.dataset.what;if(w==='shards')addShards(1000);else if(w==='dust')progress.dust+=500;else if(w==='keys')progress.keys+=5;else if(w==='levels'){for(let i=0;i<5&&progress.level<MAX_LEVEL;i++)addXP(levelTarget(progress.level)-progress.xp);}log('Console : '+b.textContent);}
 else if(act==='simulate'){const id=document.getElementById('dlfr117SimPack')?.value,c=simulate(id,1000),tot=c.reduce((a,x)=>a+x,0);const out=document.getElementById('dlfr117SimOut');if(out)out.textContent=`${PACKS.find(p=>p.id===id)?.name} × 1 000 : `+rarities.map((r,i)=>`${r} ${fmtPercent(c[i]/tot)}`).join(' · ');return;}
 else if(act==='export-session'){exportSession();return;}
 else if(act==='open-session-import'){document.getElementById('dlfr114SessionFile')?.click();return;}
 else if(act==='give'){give(b.dataset.id);log(`+1 ${get(b.dataset.id)?.name}`);}
 else if(act==='take'){if(take(b.dataset.id))log(`−1 ${get(b.dataset.id)?.name}`);}
 else if(act==='holo'){const card=owned.get(Number(b.dataset.id));if(card){card.finish=((card.finish||0)+1)%4;card.holo=card.finish>0;log(`Finition modifiée : ${get(b.dataset.id)?.name} → ${FIN_NAME[card.finish]}`);}}
 else if(act==='all'){for(const c of CARDS)if(!has(c.id))give(c.id);log('Collection complète ajoutée pour ce test.');}
 else if(act==='holo-all'){for(const v of owned.values()){v.finish=Math.max(1,v.finish||0);v.holo=true;}log('Toutes les cartes possédées passent en Holo.');}
 else if(act==='reset'){if(!confirm('Tout réinitialiser, y compris les cartes personnalisées non exportées ?'))return;reset();}
 else if(act==='rarity'){const cid=Number(document.getElementById('dlfr112CardPick')?.value),r=document.getElementById('dlfr112Rarity')?.value;if(get(cid)&&rarities.includes(r)){selected=cid;overrides.set(cid,r);log('Rareté fictive modifiée : '+get(cid).name+' → '+r);}}
 else if(act==='trade'){
  const offer=Number(document.getElementById('dlfr112TradeGive')?.value),want=Number(document.getElementById('dlfr112TradeGet')?.value);
  if(!get(offer)||!get(want)||offer===want){alert('Choisis deux cartes différentes.');return;}
  if(!take(offer)){alert('Tu ne possèdes pas cette carte dans le test.');return;}
  give(want);log(`Échange fictif : ${get(offer).name} ⇄ ${get(want).name}`);
 }
 else return;
 checkAchievements();repaint();
}
function handleChange(event){
 if(!gate||!document.getElementById('dlfr112Lab'))return;
 const e=event.target;
 if(e.matches('[data-v112-field="filter"]')){filter=e.value;repaint();}
 else if(e.matches('[data-v117-field="title"]')){progress.title=titles().includes(e.value)?e.value:'';repaint();}
}
function handleInput(event){
 if(gate&&document.getElementById('dlfr112Lab')&&['dlfr113Name','dlfr113Type','dlfr113Rarity','dlfr113Series','dlfr113Description','dlfr113ImageUrl'].includes(event.target.id)){if(event.target.id==='dlfr113ImageUrl'&&event.target.value){creatorImage='';clearedImage=false;}refreshPreview();return;}
 if(!gate||!document.getElementById('dlfr112Lab'))return;
 const e=event.target;if(!e.matches('[data-v112-field="search"]'))return;
 query=e.value;
 const grid=document.querySelector('#dlfr112Lab .dlfr112-grid');if(!grid)return;
 grid.innerHTML=filtered().map(c=>cardItem(c,srcData())).join('')||'<p class="muted">Aucune carte pour ce filtre.</p>';
}
document.addEventListener('submit',event=>{
 if(!gate||event.target.id!=='dlfr113CreateForm'||!document.getElementById('dlfr112Lab'))return;
 event.preventDefault();if(saveCustom()){repaint();const s=document.getElementById('dlfr113FormStatus');if(s)s.textContent='Carte enregistrée dans cette session ! Pense à exporter ton catalogue.';}
});
document.addEventListener('change',async event=>{
 if(!gate||!document.getElementById('dlfr112Lab'))return;
 const el=event.target;
 if(el.id==='dlfr113ImportFile'){const file=el.files?.[0];if(file)await importCards(file);return;}
 if(el.id==='dlfr114SessionFile'){const file=el.files?.[0];if(file)await importSession(file);return;}
 if(el.id==='dlfr113ImageFile'){
  const file=el.files?.[0];if(!file)return;
  if(file.size>2000000||!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)){imageError='Image refusée : PNG/JPG/WebP/GIF, 2 Mo maximum.';alert(imageError);el.value='';return;}
  try{const reader=new FileReader();reader.onload=()=>{creatorImage=validImage(reader.result);clearedImage=false;if(!creatorImage){alert('Image invalide.');return;}const field=document.getElementById('dlfr113ImageUrl');if(field)field.value='';refreshPreview();};reader.readAsDataURL(file);}catch(error){alert('Impossible de lire ce fichier image.');}
 }
});
document.addEventListener('keydown',event=>{
 if(!OPEN.st||!OPEN.el)return;
 if(event.key==='Escape'){event.preventDefault();OPEN.st.stage==='summary'?closeOpening():skipAll();return;}
 if((event.key===' '||event.key==='Enter')&&!event.repeat){if(event.key==='Enter'&&document.activeElement?.closest?.('#dlfr117Open button'))return;event.preventDefault();primaryAction();return;}
 if(event.key==='Tab'){const items=[...OPEN.el.querySelectorAll('button:not([disabled]):not([hidden])')];if(!items.length)return;
  if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items[items.length-1].focus();}
  else if(!event.shiftKey&&document.activeElement===items[items.length-1]){event.preventDefault();items[0].focus();}
  else if(!OPEN.el.contains(document.activeElement)){event.preventDefault();items[0].focus();}}
});
// Minuterie : met à jour les camps sans redessiner la page ; ferme l'ouverture si on quitte le labo.
setInterval(()=>{
 if(OPEN.el&&!document.getElementById('dlfr112Lab')){OPEN.st=null;unmountOpening(true);}
 const lab=document.getElementById('dlfr112Lab');if(!lab)return;
 lab.querySelectorAll('[data-v117-camp]').forEach(row=>{const c=progress.camps[Number(row.dataset.v117Camp)];if(!c)return;const left=Math.max(0,c.end-Date.now());
  const bar=row.querySelector('[data-v117-bar]');if(bar)bar.style.width=Math.min(100,(Date.now()-c.start)/(c.end-c.start)*100)+'%';
  const t=row.querySelector('[data-v117-left]');if(t)t.textContent=left?'Retour dans '+duration(left):'De retour !';
  const btn=row.querySelector('button');if(btn&&!left&&btn.disabled){btn.disabled=false;btn.textContent='Récupérer';}});
},1000);
document.addEventListener('click',handleClick);
document.addEventListener('input',handleInput);
document.addEventListener('change',handleChange);
window.DLFR_CARDS_LAB={
 setGate(value){if(!value){gate=false;reset();view='album';}else gate=true;},
 view(data){if(!gate)return '<p>Accès réservé.</p>';this.__sourceData=data;return viewPage(data);},
 get stats(){return {unique:inventoryUnique(),total:CARDS.length,level:progress.level,power:collectionPower(),volatile:true};}
};
})();

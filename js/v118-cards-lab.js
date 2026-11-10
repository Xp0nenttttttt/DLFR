/* DLFR V118 — Cards Lab : catalogue Supabase administrable + ouverture cinématique + progression longue.
 * Toujours un laboratoire en mémoire vive : AUCUN INSERT/UPDATE/DELETE, aucun localStorage/sessionStorage,
 * aucune transaction réelle. L'accès est accordé dans app.js après la RPC Supabase dlfr_cards_lab_access().
 * V118 : cartes et collections lues dans Supabase (dlfr_cards / dlfr_card_collections) et modifiées
 * uniquement via les RPC dlfr_cards_admin_* (réservées au compte autorisé). La progression reste en mémoire.
 * Remplace v117-cards-lab.js (même API window.DLFR_CARDS_LAB + setClient).
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
// Catalogue intégré : utilisé seulement si Supabase n'est pas joignable.
const FALLBACK_COLLECTIONS=[{id:1,slug:'legends',name:'GD Legends',description:'',color:'#e0344f',sort:1},{id:2,slug:'modern',name:'Modern Extremes',description:'',color:'#2f8cff',sort:2},{id:3,slug:'players',name:'Joueurs FR',description:'',color:'#25c48a',sort:3},{id:4,slug:'dlfr',name:'Esprit DLFR',description:'',color:'#8b5cf6',sort:4}];
let COLLECTIONS=FALLBACK_COLLECTIONS.map(c=>({...c}));
function mkCard(r){const col=COLLECTIONS.find(c=>c.id===Number(r.collection_id));return {id:Number(r.id),name:String(r.name||''),rarity:r.rarity,type:r.card_type||r.type||'dlfr',collectionId:Number(r.collection_id),series:col?.name||'—',slug:col?.slug||'',description:r.description||'',image:r.image_url||'',inPacks:r.in_packs!==false,sort:Number(r.sort_order)||0};}
const fallbackCards=()=>SOURCE.map(([name,rarity,type],i)=>mkCard({id:i+1,name,rarity,card_type:type,collection_id:i<20?1:i<35?2:i<45?3:4,sort_order:i+1}));
const CARDS=fallbackCards();
const rarities=['Commun','Rare','Épique','Légendaire','Mythique','Ultra']; // V149 : Ultra, au-dessus de Mythique
const FESTIVE='Festive',SECRET='Secrète',SECRET_RATE=1/1000000,ALL_RARITIES=[...rarities,SECRET,FESTIVE]; // V155 : cartes secrètes (1 sur 1 000 000) // V139 : rareté spéciale du calendrier de l'Avent
const MAX_IMPORT=250;
let gate=false, view='official', filter='all', query='', selected=2, forgeSel=0, goalsTab='quests';
let DB=null;
// V129 — mode Aventure : ouvert à tous, sauvegardé par compte. Catalogue + outils de test : propriétaires et supermodos.
let editor=false,userId=null;
let serverCounts=null,queueTotal=0; // V138 : collection unique (serveur) — exemplaires connus côté serveur
const SAVE={loaded:false,version:0,timer:0,saving:false,pending:false,status:'',tainted:false,conflict:false};
const ANTI={t:[],lock:0,kb:0,status:null,seenReset:''};
const GIFT={list:[],result:null,busy:false}; // V166 — packs offerts (dédommagement)
try{ANTI.seenReset=localStorage.getItem('dlfr-cards-reset-seen')||'';}catch(e){}
const catalog={status:'local',error:'',selCol:1,editCard:null,editCol:null,draft:null,colDraft:null,busy:false,msg:'',msgKind:'',pendingFile:null};

// ============================================================ RÈGLES DE PROGRESSION V117
const MAX_LEVEL=1000, MAX_PRESTIGE=100, RENAISSANCE_LEVEL=100; // V152 : niveau max 1000, 100 Renaissances
const RVAL=[1,2,4,8,16,40];                       // valeur de collection par rareté
const DUST_DUP=[3,7,18,48,120,360];               // poussière gagnée par doublon
const CRAFT=[40,100,260,800,2400,8000];             // coût de fabrication d'une carte manquante
const STAR_COPIES=[1,2,3,5,8,15,22,30,40,50]; // doublons consommés pour ★1…★10 (V151 : ★6-★10 = Éveil)
const STAR_DUST=[15,35,80,180,400,2000,4000,7000,11000,16000]; // poussière de base pour ★1…★10
const MAX_STARS=10;
const STAR_FACTOR=[1,1.5,2.5,4,6,9];
const FIN=['none','holo','prism','obsidian','shiny'], FIN_NAME=['Standard','Holo','Prismatique','Obsidienne','Shiny']; // V150 : Shiny
const FIN_MULT=[1,1.25,1.6,2.2,3], FIN_BASE=[0,.015,.003,.0006,.0002]; // V153 : finitions encore 2× plus rares
const POWER_TIERS=[20,50,100,180,300,480,720,1000,1400];
const TIER_COLORS=['#c9d1e0','#5fb2ff','#b980ff','#ffc247','#ff5fa2','#fff1b8'];
const RANKS=[[1,'Easy','#7fd4ff'],[5,'Normal','#7bf0a0'],[10,'Hard','#ffd36b'],[16,'Harder','#ff9e5e'],[24,'Insane','#ff6fa8'],[32,'Easy Demon','#c58bff'],[42,'Medium Demon','#a67bff'],[54,'Hard Demon','#ff5f5f'],[68,'Insane Demon','#ff3d7a'],[84,'Extreme Demon','#ff2a2a'],[100,'Grand Démon','#ffe27a'],[120,'Extended List','#ff8a3d'],[200,'Main List','#ff5050'],[300,'Top 50','#ff2e63'],[400,'Top 25','#e0218a'],[500,'Top 10','#b026ff'],[650,'Top 5','#7a5cff'],[800,'Top 1','#2ec5ff'],[1000,'GOD','#fff1b8']];
const PACKS=[
 {id:'start',name:'Découverte',count:3,cost:{shards:27},level:1,weights:[78.6,18.4,2.7,.23,.025,0],guarantee:0,theme:'violet',emblem:'✦',subtitle:'Pour débuter la collection'},
 {id:'explore',name:'Explorateur',count:5,cost:{shards:90},level:3,weights:[68.3,26.4,4.6,.55,.095,.00667],guarantee:1,theme:'blue',emblem:'◆',subtitle:'Une carte Rare ou mieux garantie'},
 {id:'players',name:'Joueurs FR',count:5,cost:{shards:135},level:11,weights:[68.5,25.6,5,.7,.14,.00667],guarantee:1,theme:'green',emblem:'★',subtitle:'Uniquement des cartes Joueur',filter:c=>c.type==='player'},
 {id:'prestige',name:'Prestige',count:5,cost:{shards:225},level:15,weights:[0,75.5,21,3,.48,.00667],guarantee:2,theme:'gold',emblem:'♛',subtitle:'Une carte Épique ou mieux garantie',finishBoost:1.5},
 {id:'demon',name:'Coffre Démoniaque',count:6,cost:{keys:1},level:20,weights:[0,69.6,26.4,3.5,.47,.00667],guarantee:3,theme:'demon',emblem:'🔑',subtitle:'Une Légendaire garantie · ouvert avec une clé',finishBoost:1.5},
 {id:'relic',name:'Coffre Mythique',count:7,cost:{keys:4,shards:900},level:45,weights:[0,0,86,12.25,1.65,.00667],guarantee:4,theme:'prism',emblem:'✺',subtitle:'Une Mythique garantie',finishBoost:2}
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
 {key:'mastery',name:'Maîtrise',icon:'★',subtitle:'Expérience, poussière et forge',color:'gold'},
 {key:'legend',name:'Légende',icon:'♛',subtitle:'Talents de haut niveau (100 à 1000)',color:'red'}
];
// max = rangs ; cost = éclats pour le rang 1 (×rang suivant) ; pts = points par rang.
const SKILLS=[
 {id:'fo1',branch:'fortune',name:'Chance',icon:'✦',max:5,level:1,cost:20,pts:1,requires:[],text:r=>`+${r} niveau${r>1?'x':''} de chance sur toutes les raretés`},
 {id:'fo2',branch:'fortune',name:'Éclat holographique',icon:'◈',max:3,level:6,cost:60,pts:1,requires:['fo1'],text:r=>`Finitions Holo/Prisme/Obsidienne +${25*r} %`},
 {id:'fo3',branch:'fortune',name:'Découverte garantie',icon:'♢',max:1,level:12,cost:180,pts:1,requires:['fo2'],text:()=>'Le paquet Découverte garantit une Rare ou mieux'},
 {id:'fo4',branch:'fortune',name:'Garantie plus rapide',icon:'⌛',max:3,level:20,cost:260,pts:1,requires:['fo3'],text:r=>`Garantie Légendaire ${15*r} cartes plus tôt`},
 {id:'fo5',branch:'fortune',name:'Chasseur de Mythiques',icon:'✧',max:3,level:35,cost:500,pts:1,requires:['fo4'],text:r=>`Poids des Mythiques +${20*r} %`},
 {id:'fo6',branch:'fortune',name:'Finitions rares',icon:'❖',max:1,level:55,cost:1400,pts:2,requires:['fo5'],text:()=>'Prismatique ×1,5 et Obsidienne ×2'},
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
 {id:'le1',branch:'legend',name:'Pluie d’éclats',icon:'◆',max:20,level:100,cost:3000,pts:1,requires:[],text:r=>`Éclats +${3*r} %`},
 {id:'le2',branch:'legend',name:'Mémoire',icon:'✪',max:20,level:120,cost:3000,pts:1,requires:['le1'],text:r=>`XP +${3*r} %`},
 {id:'le3',branch:'legend',name:'Poussière d’étoile',icon:'✧',max:20,level:150,cost:3500,pts:1,requires:['le2'],text:r=>`Poussière +${5*r} %`},
 {id:'le4',branch:'legend',name:'Coup de chance',icon:'✦',max:10,level:200,cost:6000,pts:2,requires:['le3'],text:r=>`+${(r*.5).toLocaleString('fr-FR')} niveau de chance sur toutes les raretés`},
 {id:'le6',branch:'legend',name:'Forge éternelle',icon:'⚒',max:10,level:250,cost:7000,pts:1,requires:['le4'],text:r=>`Coûts de la Forge −${3*r} % (−70 % au total au maximum)`},
 {id:'le5',branch:'legend',name:'Chasseur de Shiny',icon:'✨',max:5,level:300,cost:9000,pts:2,requires:['le6'],text:r=>`Chances de Shiny +${20*r} %`},
 {id:'le9',branch:'legend',name:'Expéditions éclair',icon:'⌁',max:10,level:350,cost:9000,pts:1,requires:['le5'],text:r=>`Durée des expéditions −${2*r} %`},
 {id:'le7',branch:'legend',name:'Quatrième camp',icon:'⛺',max:1,level:400,cost:15000,pts:3,requires:['le9'],text:()=>'+1 expédition simultanée'},
 {id:'le8',branch:'legend',name:'Chasseur d’Ultra',icon:'♛',max:5,level:500,cost:20000,pts:3,requires:['le7'],text:r=>`Chances d’Ultra +${30*r} %`},
 {id:'le10',branch:'legend',name:'Légende vivante',icon:'☀',max:1,level:1000,cost:100000,pts:10,requires:['le8'],text:()=>'+1 carte dans tous les paquets, +25 % d’éclats, d’XP et de poussière'},
 {id:'sc1',branch:'spec',spec:'col',name:'Œil du collectionneur',icon:'🃏',max:5,level:30,cost:800,pts:1,requires:[],text:r=>`Finitions et Shiny +${10*r} %`},
 {id:'se1',branch:'spec',spec:'exp',name:'Cartographe d’élite',icon:'🧭',max:5,level:30,cost:800,pts:1,requires:[],text:r=>`Butin des chapitres +${10*r} %`},
 {id:'sa1',branch:'spec',spec:'art',name:'Maître artisan',icon:'⚒',max:5,level:30,cost:800,pts:1,requires:[],text:r=>`Poussière de l’Éveil (★6 à ★10) −${5*r} %`},
 {id:'cv',branch:'core',name:'Maître des cartes',icon:'✺',max:1,level:50,cost:2000,pts:3,requires:['fo4','ex4','ma4'],text:()=>'+1 niveau de chance et +15 % d’éclats et d’XP'},
 {id:'ap',branch:'core',name:'Talent ultime',icon:'☀',max:1,level:85,cost:6000,pts:5,requires:['cv','fo6','ex6','ma6'],text:()=>'+1 carte dans tous les paquets et Mythiques ×1,3'}
];
let SETS=[];
function rebuildSets(){
 const bySlug=s=>COLLECTIONS.find(c=>c.slug===s);
 SETS=[...COLLECTIONS.map(c=>({id:'col-'+c.slug,name:c.name,test:x=>x.collectionId===c.id&&countable(x),reward:{keys:2,dust:150}})),
  {id:'mythic',name:'Toutes les Mythiques',test:c=>c.rarity==='Mythique',reward:{keys:3,dust:300}},
  ...(bySlug('legends')?[{id:'holo-legends',name:bySlug('legends').name+' Holo',test:c=>c.slug==='legends',finish:1,reward:{keys:4,dust:600}}]:[]),
  ...(bySlug('players')?[{id:'prism-players',name:bySlug('players').name+' Prismatiques',test:c=>c.slug==='players',finish:2,reward:{keys:6,dust:1500}}]:[]),
  {id:'stars-all',name:'Tout en ★3',test:()=>true,stars:3,reward:{keys:10,dust:4000}}];
}
rebuildSets();
const QUEST_POOL=[
 {type:'packs',lvl:1,base:[2,4],text:n=>`Ouvrir ${n} paquets`},
 {type:'expeditions',lvl:1,base:[2,3],text:n=>`Terminer ${n} expéditions`},
 {type:'new',lvl:1,base:[2,4],text:n=>`Découvrir ${n} nouvelles cartes`},
 {type:'epic',lvl:3,base:[1,3],text:n=>`Obtenir ${n} cartes Épiques ou mieux`},
 {type:'dust',lvl:4,base:[40,90],scale:true,text:n=>`Gagner ${n} poussière ✧`},
 {type:'spend',lvl:2,base:[80,160],scale:true,text:n=>`Dépenser ${n} éclats ◆`},
 {type:'forge',lvl:5,base:[1,2],text:n=>`Améliorer ${n} carte${n>1?'s':''} à la Forge`},
 {type:'finish',lvl:8,base:[1,1],text:()=>'Obtenir une carte Holo ou mieux'}
];
const S=()=>progress.stats;
const ACHIEVEMENTS=[
 ...[[10,'Premiers pas',{dust:30}],[25,'Collectionneur',{keys:1}],[40,'Archiviste',{keys:2}]].map(([n,name,reward,title],i)=>({id:'col'+i,name,desc:`Posséder ${n} cartes différentes`,value:()=>CARDS.filter(c=>has(c.id)).length,target:n,reward,title})),
 {id:'col3',name:'Catalogue complet',desc:'Posséder toutes les cartes du catalogue',value:()=>CARDS.filter(c=>countable(c)&&has(c.id)).length,get target(){return Math.max(1,CARDS.filter(countable).length);},reward:{keys:5,dust:500},title:'Gardien du catalogue'},
 ...[[10,'Déchireur',{dust:40}],[50,'Ouvreur assidu',{keys:1}],[150,'Usine à boosters',{keys:3}],[500,'Main d’or',{keys:8},'Main d’or']].map(([n,name,reward,title],i)=>({id:'pk'+i,name,desc:`Ouvrir ${n} paquets`,value:()=>S().packs,target:n,reward,title})),
 ...[[5,'Randonneur',{dust:30}],[25,'Aventurier',{keys:1}],[100,'Cartographe',{keys:3}],[300,'Nomade éternel',{keys:6},'Nomade']].map(([n,name,reward,title],i)=>({id:'ex'+i,name,desc:`Terminer ${n} expéditions`,value:()=>S().expeditions,target:n,reward,title})),
 {id:'leg1',name:'Première Légendaire',desc:'Obtenir une carte Légendaire',value:()=>S().tiers[3],target:1,reward:{dust:80}},
 {id:'leg2',name:'Ruée vers l’or',desc:'Obtenir 15 cartes Légendaires',value:()=>S().tiers[3],target:15,reward:{keys:2}},
 {id:'myt1',name:'Première Mythique',desc:'Obtenir une carte Mythique',value:()=>S().tiers[4],target:1,reward:{keys:1},title:'Chanceux'},
 {id:'myt2',name:'10 Mythiques',desc:'Obtenir 10 cartes Mythiques',value:()=>S().tiers[4],target:10,reward:{keys:4}},
 {id:'ult1',name:'Première Ultra',desc:'Obtenir une carte Ultra',value:()=>S().tiers[5]||0,target:1,reward:{keys:10,dust:2000},title:'Ultra'},
 {id:'fin1',name:'Première Holo',desc:'Obtenir une carte Holo',value:()=>S().finishes[1]+S().finishes[2]+S().finishes[3]+(S().finishes[4]||0),target:1,reward:{dust:50}},
 {id:'fin2',name:'Arc-en-ciel',desc:'Obtenir une carte Prismatique',value:()=>S().finishes[2]+S().finishes[3],target:1,reward:{keys:1}},
 {id:'fin3',name:'Première Obsidienne',desc:'Obtenir une carte Obsidienne',value:()=>S().finishes[3],target:1,reward:{keys:3},title:'Obsidien'},
 {id:'fin4',name:'Première Shiny',desc:'Obtenir une carte Shiny',value:()=>S().finishes[4]||0,target:1,reward:{keys:5,dust:1000},title:'Shiny'},
 {id:'st1',name:'Première étoile',desc:'Améliorer une carte à ★1',value:()=>maxStars(),target:1,reward:{dust:40}},
 {id:'st5',name:'Carte ★5',desc:'Porter une carte à ★5',value:()=>maxStars(),target:5,reward:{keys:3},title:'Maître forgeron'},
 {id:'st7',name:'Premier Éveil',desc:'Porter une carte à ★7',value:()=>maxStars(),target:7,reward:{keys:6,dust:3000}},
 {id:'st10',name:'Carte ★10',desc:'Porter une carte à ★10',value:()=>maxStars(),target:10,reward:{keys:15},title:'Éveillé'},
 ...[[10,{keys:1}],[25,{keys:2}],[50,{keys:3},'Demon Slayer'],[75,{keys:5}],[100,{keys:10},'Grand Démon'],[200,{keys:15}],[300,{keys:20},'Main List'],[500,{keys:30},'Top 10'],[750,{keys:40}],[1000,{keys:100},'GOD']].map(([n,reward,title])=>({id:'lv'+n,name:`Niveau ${n}`,desc:`Atteindre le niveau ${n}`,value:()=>Math.max(progress.level,S().bestLevel),target:n,reward,title})),
 {id:'set1',name:'Série terminée',desc:'Terminer une série',value:()=>Object.keys(progress.sets).length,target:1,reward:{keys:1}},
 {id:'set8',name:'Encyclopédiste',desc:'Terminer toutes les séries',value:()=>Object.keys(progress.sets).length,get target(){return SETS.length;},reward:{keys:15},title:'Encyclopédiste'},
 {id:'rn1',name:'Renaissance',desc:'Effectuer une Renaissance',value:()=>progress.prestige,target:1,reward:{keys:3},title:'Phénix'},
 {id:'ch4',name:'Chapitre 4',desc:'Terminer les Ruines de Bloodbath',value:()=>chState().cleared.c4?1:0,target:1,reward:{keys:5}},
 {id:'ch8',name:'Toute l’aventure',desc:'Terminer le Trône de Tidal Wave',value:()=>chState().cleared.c8?1:0,target:1,reward:{keys:25},title:'Aventurier'},
 {id:'ms3',name:'Maîtrise Or',desc:'Une carte en maîtrise rang III',value:()=>Math.max(0,...Object.keys(progress.mastery||{}).map(k=>masteryRank(Number(k)))),target:3,reward:{keys:5}},
 {id:'ms5',name:'Maîtrise Prisme',desc:'Une carte en maîtrise rang V',value:()=>Math.max(0,...Object.keys(progress.mastery||{}).map(k=>masteryRank(Number(k)))),target:5,reward:{keys:15},title:'Maître de carte'},
 {id:'ct5',name:'5 contrats',desc:'Remplir 5 contrats de collection',value:()=>Object.keys(progress.contracts||{}).length,target:5,reward:{keys:5}},
 {id:'ct20',name:'20 contrats',desc:'Remplir 20 contrats de collection',value:()=>Object.keys(progress.contracts||{}).length,target:20,reward:{keys:15},title:'Archiviste'},
 {id:'rn5',name:'5 Renaissances',desc:'Effectuer 5 Renaissances',value:()=>progress.prestige,target:5,reward:{keys:10},title:'Vétéran'},
 {id:'rn10',name:'10 Renaissances',desc:'Effectuer 10 Renaissances',value:()=>progress.prestige,target:10,reward:{keys:15},title:'Increvable'},
 {id:'rn25',name:'25 Renaissances',desc:'Effectuer 25 Renaissances',value:()=>progress.prestige,target:25,reward:{keys:25}},
 {id:'rn50',name:'50 Renaissances',desc:'Effectuer 50 Renaissances',value:()=>progress.prestige,target:50,reward:{keys:40},title:'Immortel'},
 {id:'rn100',name:'100 Renaissances',desc:'Effectuer 100 Renaissances',value:()=>progress.prestige,target:100,reward:{keys:100},title:'✺ 100'},
 ...[[10,{dust:60}],[50,{keys:2}],[150,{keys:5},'Infatigable']].map(([n,reward,title])=>({id:'qs'+n,name:`${n} missions`,desc:`Accomplir ${n} missions`,value:()=>S().quests,target:n,reward,title})),
 ...[[3,{keys:1}],[6,{keys:3}],[9,{keys:6},'Puissance absolue']].map(([n,reward,title])=>({id:'pw'+n,name:`Puissance ${n}`,desc:`Atteindre le palier de puissance ${n}`,value:()=>powerTier(),target:n,reward,title}))
];
const newStats=()=>({packs:0,expeditions:0,pulled:0,newCards:0,tiers:[0,0,0,0,0,0],finishes:[0,0,0,0,0],crafted:0,upgraded:0,quests:0,shardsEarned:0,bestLevel:1});
const freshProgress=()=>({xp:0,level:1,shards:35,dust:0,keys:0,prestige:0,skills:{},camps:[],quests:[],achievements:{},sets:{},pity:{leg:0,myth:0},stats:newStats(),title:'',reveals:[],questSeed:0,chapters:{cleared:{},run:null},contracts:{},mastery:{},spec:null});
const progress=freshProgress();

// Mémoire volatile : le rechargement de la page efface entièrement cette collection.
const owned=new Map(),overrides=new Map(),journal=[];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const idString=i=>String(i).padStart(3,'0');
const normalize=s=>String(s||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
const rarity=c=>overrides.get(c.id)||c.rarity;
const tierOf=c=>rarity(c)===FESTIVE?3:rarity(c)===SECRET?5:Math.max(0,rarities.indexOf(rarity(c)));
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
 type=['level','player','dlfr'].includes(x.type)?x.type:'dlfr',rarity=ALL_RARITIES.includes(x.rarity)?x.rarity:'Commun';
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
const TIER_GEM=['●','◆','✦','★','✺','♛'];
const TYPE_LABEL={level:'NIVEAU',player:'JOUEUR',dlfr:'DLFR'};
function pipsHTML(t){return `<i class="c131-pips" aria-hidden="true">${'◆'.repeat(t+1)}<em>${'◆'.repeat(Math.max(0,rarities.length-1-t))}</em></i>`;}
function figure(card,data,compact=false,opts={}){
 // opts.official : carte de la collection officielle → on ignore l'inventaire du mode Aventure.
 const o=opts.official?null:owned.get(card.id),n=o?.count||0;
 const finish=opts.finish??o?.finish??0, stars=opts.stars??o?.stars??0;
 const picture=imageFor(card,data);
 const r=opts.official?card.rarity:rarity(card),fest=r===FESTIVE,sec=r===SECRET,t=fest?3:sec?5:Math.max(0,rarities.indexOf(r)),slug=normalize(r).replace(/[^a-z]/g,'');
 const sym=card.type==='level'?'◆':card.type==='player'?'★':'✦';
 const has=opts.official?!!opts.owned:!!(n||opts.finish!==undefined||opts.owned);
 if(sec&&!has&&!editor)return `<div class="dlfr112-card dlfr131-card dlfr112-secrete is-mystery t5 dlfr112-missing ${compact?'dlfr112-small':''}"><div class="c131-frame"><div class="c131-head"><span class="c131-type">??? SECRÈTE</span><b class="c131-id">#???</b></div><div class="dlfr112-art c131-art"><span class="c131-sym" aria-hidden="true">?</span><span class="c131-gem" title="Carte secrète · 1 chance sur 1 000 000">?</span></div><div class="c131-plate"><strong>???</strong><span class="c131-rar"><span>Secrète</span></span></div></div><i class="c131-foil" aria-hidden="true"></i></div>`;
 const mr=opts.official?0:masteryRank(card.id);
 return `<div class="dlfr112-card dlfr131-card dlfr112-${slug} t${t} ${mr?'c162-m'+mr:''} ${finish?'dlfr112-holo dlfr117-f-'+FIN[finish]:''} ${has?'dlfr112-has':'dlfr112-missing'} ${compact?'dlfr112-small':''}" data-tilt>
   <div class="c131-frame">
    <div class="c131-head"><span class="c131-type">${sym} ${TYPE_LABEL[card.type]||'CARTE'}</span><b class="c131-id">#${idString(card.id)}</b></div>
    <div class="dlfr112-art c131-art">${picture?`<img loading="lazy" src="${esc(picture)}" alt="Visuel ${esc(card.name)}" onerror="this.remove()">`:`<span class="c131-sym" aria-hidden="true">${sym}</span>`}<span class="c131-gem" title="${fest?'Rareté spéciale · calendrier de l’Avent':sec?'Carte secrète · 1 chance sur 1 000 000':`Rareté ${t+1}/${rarities.length}`}">${fest?'❄':sec?'?':t+1}</span>${has?'':'<span class="c131-lock" aria-hidden="true">?</span>'}</div>
    <div class="c131-plate"><strong title="${esc(card.name)}">${esc(card.name)}</strong><span class="c131-rar">${fest?'<i class="c131-pips c139-snow" aria-hidden="true">❄❄❄❄❄</i>':sec?'<i class="c131-pips c155-sec" aria-hidden="true">??????</i>':pipsHTML(t)}<span>${esc(r)}${finish?' · ✧ '+FIN_NAME[finish]:''}</span></span></div>
   </div>
   <i class="c131-foil" aria-hidden="true"></i><i class="c131-glare" aria-hidden="true"></i>${finish===4?'<span class="c150-shiny" aria-label="Shiny">✨ SHINY</span>':''}${mr?`<span class="c162-mb" title="Maîtrise ${MASTERY_NAME[mr]}">M${['','I','II','III','IV','V'][mr]}</span>`:''}
   ${stars?`<span class="dlfr117-stars" aria-label="${stars} étoiles">${'★'.repeat(stars)}</span>`:''}
   ${n&&opts.finish===undefined&&!opts.hideCount&&!opts.official?`<span class="dlfr112-count">×${n}</span>`:''}
  </div>`;
}
// Échelle des raretés (de la plus courante à la plus rare).
function ladder(rates){
 return `<div class="c131-ladder" role="list" aria-label="Raretés, de la plus courante à la plus rare">${rarities.map((r,t)=>`<span class="c131-step t${t}" role="listitem"><b>${TIER_GEM[t]}</b><span><strong>${esc(r)}</strong>${pipsHTML(t)}${rates?`<small>${esc(rates[t])} %</small>`:''}</span></span>${t<rarities.length-1?'<i class="c131-arrow" aria-hidden="true">›</i>':''}`).join('')}<span class="c131-ladder-note">de la plus courante à la plus rare</span><span class="c131-step c139-step-festive" title="Rareté spéciale : uniquement dans le calendrier de l’Avent"><b>❄</b><span><strong>Festive</strong><small>Calendrier de l’Avent</small></span></span></div>`;
}
function inventoryUnique(){return [...owned.values()].filter(v=>v.count>0).length;}
function status(){return `${inventoryUnique()} / ${shownCards().length} cartes différentes · ${[...owned.values()].reduce((a,b)=>a+b.count,0)} exemplaires`;}
function cardItem(c,data){const yes=has(c.id);return `<button type="button" class="dlfr112-pick ${selected===c.id?'is-current':''}" data-v112-act="select" data-id="${c.id}" aria-label="Voir ${esc(c.name)}">${figure(c,data,true)}<span class="dlfr112-pick-label">${yes?'Possédée · ':'Manquante · '}${esc(c.series)}</span></button>`;}
function optionCard(c){return `<option value="${c.id}">${idString(c.id)} · ${esc(c.name)}</option>`;}
function log(message){journal.push(message);if(journal.length>30)journal.shift();}
function get(id){return CARDS.find(c=>c.id===Number(id));}
function give(id,count=1,finish=0){const c=get(id);if(!c)return;const x=owned.get(c.id)||{count:0,finish:0,stars:0};x.count+=count;x.finish=Math.max(x.finish||0,finish);x.holo=x.finish>0;owned.set(c.id,x);}
function take(id){const x=owned.get(Number(id));if(!x||x.count<=0)return false;x.count--;if(x.count<=0)owned.delete(Number(id));return true;}

function download(obj,name){const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
// ============================================================ PROGRESSION : formules
function levelTarget(l){return Math.round(l<=100?60+15*Math.pow(l,1.45):15000+150*(l-100));} // V159 : ~75 M d’XP du niveau 100 au niveau 1000
function rankInfo(level=progress.level){let r=RANKS[0];for(const x of RANKS)if(level>=x[0])r=x;const i=RANKS.indexOf(r);return {name:r[1],color:r[2],index:i,next:RANKS[i+1]||null};}
function totalPoints(){return 1+Math.floor(progress.level/2)+3*progress.prestige;}
function spentPoints(){return SKILLS.reduce((n,s)=>n+rank(s.id)*s.pts,0);}
function freePoints(){return totalPoints()-spentPoints();}
function maxStars(){let m=0;for(const v of owned.values())m=Math.max(m,v.stars||0);return m;}
function collectionPower(){let p=0;for(const [id,v] of owned){const c=get(id);if(!c||v.count<=0)continue;p+=RVAL[tierOf(c)]*(1+.5*(v.stars||0))*FIN_MULT[v.finish||0];}return Math.round(p);}
function powerTier(){const p=collectionPower();return POWER_TIERS.filter(t=>p>=t).length;}
// V152 : chaque carte possédée donne un bonus permanent selon sa meilleure finition.
const FIN_BONUS=[null,{shards:.005},{shards:.01,xp:.01},{shards:.02,xp:.02,dust:.02},{shards:.03,xp:.03,dust:.03}];
function finBonus(){const o={shards:0,xp:0,dust:0};for(const [id,v] of owned){const b=FIN_BONUS[v.finish||0];if(!b||!(v.count>0)||!get(id))continue;o.shards+=b.shards||0;o.xp+=b.xp||0;o.dust+=b.dust||0;}return o;}
function setBonus(){return .05*Object.keys(progress.sets).length;}
function prestMult(){const p=progress.prestige;return 1+.1*Math.min(p,10)+.04*Math.max(0,p-10);}
function shardMult(){return prestMult()*(1+.03*rank('le1'))*(rank('le10')?1.25:1)*(1+finBonus().shards)*(1+.03*powerTier())*(1+setBonus())*(rank('cv')?1.15:1);}
function xpMult(){return prestMult()*(1+.03*rank('le2'))*(rank('le10')?1.25:1)*(1+finBonus().xp)*(1+.03*powerTier())*(1+.06*rank('ma1'))*(rank('cv')?1.15:1);}
function dustMult(){return (1+.2*rank('ma2')+.05*rank('le3')+finBonus().dust)*(rank('le10')?1.25:1);}
function forgeDiscount(){return Math.max(.3,1-.1*rank('ma4')-.03*rank('le6'))*(isSpec('art')?.8:1);}
function luck(){return rank('fo1')+(rank('cv')?1:0)+.5*rank('le4');}
function legPity(){return 200-15*rank('fo4');}
const MYTH_PITY=1200;
function slots(){return Math.min(5,1+rank('ex3')+rank('ex5')+(progress.level>=30?1:0)+rank('le7'));}
function destDuration(d){return Math.round(d.min*60000*(1-.08*rank('ex2')-.02*rank('le9')));}
// V147 — un booster par collection (réglé dans le Catalogue).
function allPacks(){
 const cols=COLLECTIONS.filter(c=>c.booster!==false&&packable().filter(x=>x.collectionId===c.id).length>=3);
 return [...PACKS,...cols.map(c=>({id:'col-'+c.id,name:c.name,count:c.boosterCount||5,cost:{shards:c.boosterCost||120},level:c.boosterLevel||1,
  weights:[68.3,26.4,4.6,.55,.095,.00667],guarantee:(c.boosterCount||5)>=5?1:0,theme:'collection',emblem:'❖',color:c.color,
  subtitle:`Uniquement les cartes de la collection « ${c.name} »`,filter:x=>x.collectionId===c.id,collection:c.id}))];
}
function packCount(p){return p.count+(rank('ma3')&&p.count>=5?1:0)+(rank('ap')?1:0)+(rank('le10')?1:0);}
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
  const bonus=addShards(10+Math.min(progress.level,100)*2),keys=progress.level%10===0?1:0,dust=progress.level%10===0?100:0; // V154 : récompenses de niveau réduites
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
const QUEST_CD=90*60000; // V159 : une mission réclamée revient au bout de 1 h 30
const questReady=q=>!(q.at>Date.now());
function emit(type,n=1){for(const q of progress.quests)if(questReady(q)&&q.type===type&&q.have<q.target)q.have=Math.min(q.target,q.have+n);}
function makeQuest(exclude=[]){
 const lvl=progress.level,pool=QUEST_POOL.filter(q=>q.lvl<=lvl&&!exclude.includes(q.type));
 const t=pick(pool.length?pool:QUEST_POOL);
 let target=t.base[0]+Math.floor(Math.random()*(t.base[1]-t.base[0]+1));
 if(t.scale)target=Math.round(target*(1+Math.min(lvl,150)*.06)/5)*5;
 const ql=Math.min(lvl,100),xp=Math.round((40+ql*10)*(.8+target/(t.base[1]||1)*.3)),shards=Math.round(15+ql*3); // V159 : récompenses plafonnées au niveau 100
 const reward={xp,shards};if(Math.random()<Math.min(.15,.05+ql*.001))reward.keys=1;else reward.dust=Math.round(10+ql*2);
 progress.questSeed++;
 return {id:'q'+progress.questSeed,type:t.type,target,have:0,reward};
}
function ensureQuests(){while(progress.quests.length<3)progress.quests.push(makeQuest(progress.quests.map(q=>q.type)));}
function questText(q){const t=QUEST_POOL.find(x=>x.type===q.type);return t?t.text(q.target):q.type;}
function claimQuest(id){const i=progress.quests.findIndex(q=>q.id===id);const q=progress.quests[i];if(!q||q.have<q.target)return;
 const txt=grant(q.reward);S().quests++;const nq=makeQuest(progress.quests.filter(x=>x.id!==id).map(x=>x.type));nq.at=Date.now()+QUEST_CD;progress.quests.splice(i,1,nq);
 toast('Mission accomplie',txt,'quest');log(`Mission accomplie : ${questText(q)} (${txt})`);}
function rerollCost(){return 10+Math.min(progress.level,100)*3;}
function rerollQuest(id){const i=progress.quests.findIndex(q=>q.id===id);if(i<0||!questReady(progress.quests[i])||progress.shards<rerollCost())return;pay({shards:rerollCost()});progress.quests.splice(i,1,makeQuest(progress.quests.map(x=>x.type)));}
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
 if(s.spec&&progress.spec!==s.spec)return 'spec';
 if(!s.requires.every(x=>rank(x)>0))return 'requires';
 if(freePoints()<s.pts)return 'points';
 if(progress.shards<skillCost(s))return 'shards';
 return 'available';
}
function skillCost(s){return s.cost*(rank(s.id)+1);}
function skillReason(s){const st=skillState(s);return st==='maxed'?'Maîtrisé':st==='level'?`Niveau ${s.level}`:st==='requires'?'Prérequis manquant':st==='spec'?`Réservé : ${SPECS[s.spec]?.name}`:st==='points'?`${s.pts} point${s.pts>1?'s':''} requis`:st==='shards'?`◆ ${fmt(skillCost(s))} requis`:rank(s.id)?`Rang ${rank(s.id)+1} · ◆ ${fmt(skillCost(s))}`:`Débloquer · ◆ ${fmt(skillCost(s))}`;}
function buySkill(id){const s=SKILLS.find(x=>x.id===id);if(!s||skillState(s)!=='available')return;pay({shards:skillCost(s)});progress.skills[id]=rank(id)+1;log(`${s.name} rang ${rank(id)} : ${s.text(rank(id))}`);}
function refundSkills(){let back=0;for(const s of SKILLS){const r=rank(s.id);back+=s.cost*r*(r+1)/2;}progress.shards+=back;progress.skills={};return back;}

// ============================================================ Expéditions
function startExpedition(id){const d=DESTS.find(x=>x.id===id);if(!d||progress.level<d.level||progress.camps.length>=slots())return;const now=Date.now();progress.camps.push({dest:d.id,start:now,end:now+destDuration(d)});log(`Départ : ${d.name}.`);}
function claimExpedition(i){
 const c=progress.camps[i];if(!c||Date.now()<c.end)return null;const d=DESTS.find(x=>x.id===c.dest);progress.camps.splice(i,1);if(!d)return null;
 const times=Math.random()<.1*rank('ex6')?2:1,parts=[];
 for(let k=0;k<times;k++){
  parts.push(`+${addShards(d.shards*(1+.08*rank('ex1'))*(isSpec('exp')?1.2:1)*shardMult())} ◆`,`+${addXP(d.xp*xpMult())} XP`);
  if(d.dust)parts.push(`+${addDust(d.dust*dustMult())} ✧`);
  const kc=d.key+.05*rank('ex4');const keys=Math.floor(kc)+(Math.random()<kc%1?1:0);if(keys){progress.keys+=keys;parts.push(`+${keys} 🔑`);}
  if(d.card&&Math.random()<d.card&&packable().length){const rare=packable().filter(x=>tierOf(x)>=1),pool=rare.length?rare:packable();const tw=[0,86,12,1.6,.2,.00667],tiers=[...new Set(pool.map(tierOf))];let tr=Math.random()*tiers.reduce((a,t)=>a+tw[t],0),tt=tiers[0];for(const t of tiers.sort((a,b)=>a-b)){tr-=tw[t];if(tr<=0){tt=t;break;}}const card=secretRoll()||pick(pool.filter(x=>tierOf(x)===tt));const isNew=!has(card.id);const f=rollFinish({});give(card.id,1,f);registerPull(card,f,isNew);parts.push(`carte ${card.name}${isNew?' (nouvelle !)':''}`);}
 }
 S().expeditions++;emit('expeditions');
 const txt=(times>1?'Récolte double ! ':'')+parts.join(' · ');
 toast(d.name,txt,'expedition');log(`Retour de ${d.name} : ${txt}`);return txt;
}
function claimAllExpeditions(){let n=0;for(let i=progress.camps.length-1;i>=0;i--)if(Date.now()>=progress.camps[i].end){claimExpedition(i);n++;}return n;}

// ============================================================ Tirages
const colLive=id=>COLLECTIONS.find(c=>c.id===id)?.published!==false; // V150 : collections en brouillon exclues
function packable(){return CARDS.filter(c=>c.inPacks&&c.rarity!==FESTIVE&&c.rarity!==SECRET&&colLive(c.collectionId));}
function shownCards(){return CARDS.filter(c=>c.rarity!==SECRET||editor||has(c.id));}
const countable=c=>c.rarity!==SECRET; // les secrètes ne comptent dans aucune complétion
function secretPool(){return CARDS.filter(c=>c.inPacks&&c.rarity===SECRET&&colLive(c.collectionId));}
function secretRoll(pack){const p=secretPool().filter(c=>!pack?.filter||pack.filter(c));return p.length&&Math.random()<SECRET_RATE?pick(p):null;}
function poolFor(pack){const base=packable(),p=base.filter(c=>!pack.filter||pack.filter(c));return p.length?p:base;}
function weights(pack){
 const pool=poolFor(pack),n=luck();
 const mult=[1,1+.05*n,1+.08*n,1+.12*n,Math.min(3,(1+.15*n)*(1+.2*rank('fo5'))*(rank('ap')?1.3:1)),1+.3*rank('le8')]; // V157 : chance bien plus modérée, Mythiques ×3 au maximum  // V154 : Ultra = 1 carte sur 15 000, la chance ne compte pas
 const w=pack.weights.map((x,i)=>pool.some(c=>tierOf(c)===i)?x*mult[i]:0);
 const total=w.reduce((a,b)=>a+b,0);return total>0?w.map(x=>x/total):w;
}
function chooseTier(pack,minTier){
 const pool=poolFor(pack),avail=rarities.map((_,i)=>pool.some(c=>tierOf(c)===i)),ULTRA=rarities.length-1;
 // V149 : une Ultra ne sort que d'un tirage normal, jamais d'une garantie.
 const full=weights(pack);if(minTier>0&&full[ULTRA]>0&&Math.random()<full[ULTRA]/full.reduce((a,b)=>a+b,0))return ULTRA;
 const w=full.map((v,i)=>i<minTier||(minTier>0&&i===ULTRA)?0:v);let sum=w.reduce((a,b)=>a+b,0);
 if(sum<=0){for(let i=rarities.length-1;i>=0;i--)if(avail[i]&&i>=minTier)return i;return avail.lastIndexOf(true);}
 let r=Math.random()*sum;for(let i=0;i<w.length;i++){r-=w[i];if(r<=0&&w[i]>0)return i;}
 return w.findLastIndex(x=>x>0);
}
function rollFinish(pack){
 const m=(1+.25*rank('fo2'))*(pack.finishBoost||1)*(isSpec('col')?1.3:1)*(1+.1*rank('sc1')),r=Math.random();
 const obs=(progress.level>=30||progress.prestige>0)?FIN_BASE[3]*m*(rank('fo6')?2:1):0,pri=FIN_BASE[2]*m*(rank('fo6')?1.5:1),hol=FIN_BASE[1]*m;
 const shi=FIN_BASE[4]*(pack.finishBoost||1)*(1+.2*rank('le5'))*(1+.1*rank('sc1')); // ~1 carte sur 1 000 : une Shiny
 if(r<shi)return 4;const r2=r-shi;
 return r2<obs?3:r2<obs+pri?2:r2<obs+pri+hol?1:0;
}
function registerPull(card,finish,isNew){const t=tierOf(card),s=S();s.pulled++;s.tiers[t]=(s.tiers[t]||0)+1;s.finishes[finish]=(s.finishes[finish]||0)+1;if(isNew){s.newCards++;emit('new');}if(t>=2)emit('epic');if(finish>0)emit('finish');}
function openPack(id){
 const pack=allPacks().find(p=>p.id===id);
 if(!pack||OPEN.st||progress.level<pack.level||!canAfford(pack.cost))return false;
 if(!poolFor(pack).length){toast('Boosters','Aucune carte disponible dans les boosters : ajoute des cartes au catalogue.','info');return false;}
 const before={level:progress.level,xp:progress.xp,target:levelTarget(progress.level),shards:progress.shards,dust:progress.dust};
 levelUps.length=0;pay(pack.cost);S().packs++;emit('packs');SAVE.urgent=true; // V165 : sauvegarde immédiate (actualiser ne relance plus un booster)
 const count=packCount(pack),guarantee=packGuarantee(pack),pool=poolFor(pack),draws=[];
 for(let i=0;i<count;i++){
  const last=i===count-1;let minT=last?guarantee:0,pityHit='';
  if(progress.pity.myth+1>=MYTH_PITY){minT=4;pityHit='myth';}else if(progress.pity.leg+1>=legPity()){minT=Math.max(minT,3);pityHit='leg';}
  const tier=chooseTier(pack,minT);
  let choices=pool.filter(c=>tierOf(c)===tier);
  if(last&&rank('ma5')){const missing=choices.filter(c=>!has(c.id));if(missing.length)choices=missing;}
  const card=secretRoll(pack)||pick(choices.length?choices:pool);const t=tierOf(card);
  progress.pity.leg=t>=3?0:progress.pity.leg+1;progress.pity.myth=t>=4?0:progress.pity.myth+1;
  const isNew=!has(card.id),finish=rollFinish(pack);
  give(card.id,1,finish);registerPull(card,finish,isNew);
  const shards=isNew?addShards(6*(1+.5*rank('ma6'))*(isSpec('col')?2:1)*shardMult()):addShards(2*shardMult());
  const dust=isNew?0:addDust(DUST_DUP[t]*dustMult()*(isSpec('art')?1.3:1));
  draws.push({id:card.id,tier:t,finish,isNew,shards,dust,pity:pityHit&&t>=(pityHit==='myth'?4:3)?pityHit:''});
 }
 const xp=addXP(count*6*xpMult());
 progress.reveals=draws.map(d=>({...d}));
 checkAchievements();
 log(`${pack.name} ouvert : ${count} cartes, +${draws.reduce((n,d)=>n+d.shards,0)} ◆, +${draws.reduce((n,d)=>n+d.dust,0)} ✧.`);
 // Les cartes sont attribuées UNE SEULE FOIS ici ; l'animation n'est qu'une mise en scène.
 startOpening(pack,draws,{before,xp,levels:levelUps.slice()});
 scheduleSave();
 return true;
}
function simulate(packId,times=100){
 const pack=allPacks().find(p=>p.id===packId)||PACKS[0],counts=rarities.map(()=>0);
 for(let k=0;k<times;k++)for(let i=0;i<packCount(pack);i++)counts[chooseTier(pack,i===packCount(pack)-1?packGuarantee(pack):0)]++;
 return counts;
}

// ============================================================ Forge
function starCost(card,v){const s=v.stars||0;if(s>=MAX_STARS)return null;const t=tierOf(card);return {copies:STAR_COPIES[s],dust:Math.round(STAR_DUST[s]*STAR_FACTOR[t]*forgeDiscount()*(s>=5?1-.05*rank('sa1'):1))};}
function upgradeCard(id){const c=get(id),v=owned.get(Number(id));if(!c||!v)return;const k=starCost(c,v);if(!k||v.count-1<k.copies||progress.dust<k.dust)return;
 v.count-=k.copies;progress.dust-=k.dust;v.stars=(v.stars||0)+1;S().upgraded++;emit('forge');log(`${c.name} passe à ★${v.stars}.`);toast('Forge',`${c.name} atteint ★${v.stars}`,'forge');}
function craftCost(c){return Math.round(CRAFT[tierOf(c)]*forgeDiscount());}
function craftCard(){/* V143 : fabrication de cartes supprimée (trop avantageuse) */}
function recycleSpare(){let gained=0;for(const [id,v] of owned){const c=get(id);if(!c||(v.stars||0)<MAX_STARS||v.count<=1)continue;gained+=Math.round(DUST_DUP[tierOf(c)]*.5*(v.count-1));v.count=1;}if(gained){addDust(gained);log(`Recyclage : +${gained} ✧.`);}return gained;}

// ============================================================ Renaissance
function renaissanceGain(){return progress.level<RENAISSANCE_LEVEL?0:Math.min(MAX_PRESTIGE-progress.prestige,1+Math.floor((progress.level-RENAISSANCE_LEVEL)/25));}
function doRenaissance(){const g=renaissanceGain();if(!g)return;
 if(!confirm(`Renaissance : tu repars au niveau 1 avec 35 éclats, tes talents sont remis à zéro (sans remboursement) et les expéditions en cours sont perdues.\nTu gardes cartes, étoiles, poussière, clés, succès et séries.\nTu gagnes ${g} ✺ (+10 % d’XP et d’éclats et +3 points de talent chacun). Continuer ?`))return;
 progress.prestige+=g;Object.assign(progress,{level:1,xp:0,shards:35,skills:{},camps:[]});progress.quests=[];ensureQuests();checkAchievements();
 log(`Renaissance ! +${g} ✺ (total ${progress.prestige}).`);toast('Renaissance',`+${g} ✺ · bonus permanent +${Math.round((prestMult()-1)*100)} %`,'level');}

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
   <span title="Poussière : étoiles à la Forge"><b>✧</b>${fmt(p.dust)}</span>
   <span title="Clés de Démon : coffres spéciaux"><b>🔑</b>${fmt(p.keys)}</span>
   <span title="Puissance de collection"><b>⚡</b>${fmt(collectionPower())} <small>P${powerTier()}</small></span>
  </div></div>`;
}
// V143 — Paliers de puissance bien visibles (piste à 9 étapes, bonus actuel et prochain).
function finishPanel(){
 const b=finBonus(),cnt=[0,0,0,0,0];for(const [id,v] of owned)if(v.count>0&&get(id))cnt[v.finish||0]++;
 const pc=x=>(Math.round(x*1000)/10).toLocaleString('fr-FR');
 return `<section class="dlfr152-fin" aria-label="Bonus de finitions"><div><small>BONUS DE FINITIONS</small><strong>+${pc(b.shards)} % éclats · +${pc(b.xp)} % XP · +${pc(b.dust)} % poussière</strong></div>
  <ul><li class="f1"><b>${cnt[1]}</b> Holo<span>+0,5 % éclats</span></li><li class="f2"><b>${cnt[2]}</b> Prismatique<span>+1 % éclats et XP</span></li><li class="f3"><b>${cnt[3]}</b> Obsidienne<span>+2 % éclats, XP, poussière</span></li><li class="f4"><b>${cnt[4]}</b> Shiny<span>+3 % éclats, XP, poussière</span></li></ul>
  <p>Chaque carte compte une fois, avec sa meilleure finition. Bonus permanents, sans limite.</p></section>`;
}
function powerTrack(){
 const pw=collectionPower(),t=powerTier(),max=POWER_TIERS.length,next=POWER_TIERS[t],prev=t?POWER_TIERS[t-1]:0;
 const PERK={3:'🔑 ×1',6:'🔑 ×3',9:'🔑 ×6 · titre « Puissance absolue »'};
 const seg=next?Math.min(1,(pw-prev)/(next-prev)):1,fill=Math.min(100,(t+seg)/max*100);
 return `<section class="dlfr143-track" aria-label="Paliers de puissance de collection">
  <div class="dlfr143-track-head"><div><small>PALIERS DE PUISSANCE</small><strong>⚡ ${fmt(pw)} <span>· Palier ${t} / ${max}</span></strong></div>
   <div class="dlfr143-track-now"><b>+${t*3} %</b><span>éclats & XP</span></div>
   <div class="dlfr143-track-next">${next?`<b>${fmt(next-pw)} ⚡</b><span>avant le palier ${t+1} (+${(t+1)*3} %)</span>`:'<b>MAX</b><span>Tous les paliers atteints</span>'}</div></div>
  <div class="dlfr143-rail"><i style="width:${fill}%"></i>${POWER_TIERS.map((v,i)=>`<span class="dlfr143-node ${i<t?'is-done':i===t?'is-next':''}" style="left:${(i+1)/max*100}%" title="Palier ${i+1} : ${fmt(v)} ⚡ · +${(i+1)*3} % éclats & XP${PERK[i+1]?' · récompense '+PERK[i+1]:''}"><em>${i+1}</em><small>${fmt(v)}</small>${PERK[i+1]?`<u>${PERK[i+1].split(' · ')[0]}</u>`:''}</span>`).join('')}</div>
  <p>La puissance monte avec chaque <b>nouvelle carte</b> (plus la rareté est haute, plus elle compte), chaque <b>étoile ★</b> gagnée à la Forge et chaque <b>finition</b> (Holo, etc.).</p>
 </section>`;
}
// V143 — Paliers d'étoiles de la Forge : ce que coûte chaque ★ et où en est la carte.
function starTrack(cur,v){
 if(!cur||!v)return '';const st=v.stars||0,dups=Math.max(0,v.count-1),t=tierOf(cur);
 const steps=STAR_COPIES.map((copies,i)=>({n:i+1,copies,dust:Math.round(STAR_DUST[i]*STAR_FACTOR[t]*forgeDiscount())}));
 const totalLeft=steps.slice(st).reduce((a,x)=>a+x.copies,0);
 return `<section class="dlfr143-stars" aria-label="Paliers d’étoiles de ${esc(cur.name)}">
  <div class="dlfr143-stars-head"><div><small>PALIERS D’ÉTOILES · ${esc(cur.name)}</small><strong>${'★'.repeat(Math.min(st,5))}<span>${'☆'.repeat(Math.max(0,5-st))}</span>${st>5?`<em class="dlfr151-awake">${'★'.repeat(st-5)}${'☆'.repeat(MAX_STARS-st)}</em>`:st===5?`<em class="dlfr151-awake is-off">${'☆'.repeat(5)}</em>`:''}</strong></div>
   <div class="dlfr143-stars-sum">${st>=MAX_STARS?'<b>Étoiles maximales</b><span>Les doublons se recyclent en poussière ✧</span>':`<b>${dups} doublon${dups>1?'s':''} en stock</b><span>${totalLeft} au total pour atteindre ★10</span>`}</div></div>
  <ol class="dlfr143-steps">${steps.map(x=>{const done=x.n<=st,now=x.n===st+1,pc=now?Math.min(100,dups/x.copies*100):done?100:0,okD=now&&dups>=x.copies,okP=now&&progress.dust>=x.dust;
   return `<li class="${done?'is-done':now?'is-now':''}${x.n>5?' is-awake':''}"><em>${x.n>5?'✦':'★'}${x.n}</em><span>${x.copies} doublon${x.copies>1?'s':''}</span><span>${fmt(x.dust)} ✧</span>${now?`<i><b style="width:${pc}%"></b></i><small class="${okD&&okP?'ok':''}">${okD?'✓':Math.min(dups,x.copies)+'/'+x.copies} doublons · ${okP?'✓':fmt(progress.dust)+'/'+fmt(x.dust)} ✧</small>`:done?'<small>✓ Atteint</small>':''}</li>`;}).join('')}</ol>
 </section>`;
}
function packArt(pack,size=''){
 return `<div class="dlfr117-booster b-${pack.theme} ${size}" aria-hidden="true"${pack.color?` style="--pc:${esc(pack.color)}"`:''}><div class="b-crimp"></div><div class="b-body"><div class="b-pattern"></div><div class="b-glow"></div><div class="b-logo">DLFR <b>CARDS</b></div><div class="b-emblem">${pack.emblem}</div><div class="b-name">${esc(pack.name)}</div><div class="b-meta">${pack.real?pack.count:packCount(pack)} CARTE${(pack.real?pack.count:packCount(pack))>1?'S':''} · ORIGINS</div><div class="b-foil"></div></div><div class="b-crimp b-bottom"></div></div>`;
}
function fmtPercent(n){if(n>0&&n<.0005)return '1 sur '+(Math.round(1/n/100)*100).toLocaleString('fr-FR');return (n*100).toLocaleString('fr-FR',{maximumFractionDigits:n<.01?2:1})+' %';}
function boostersView(){
 const p=progress;
 return `<section class="dlfr117-panel"><div class="dlfr117-head"><div><small>BOOSTERS DE L’AVENTURE</small><h2>Boosters</h2><p>Chaque booster a ses probabilités visibles. Les doublons deviennent de la poussière ✧ pour la Forge.</p>${ladder()}</div>
  <div class="dlfr117-pity"><div><span>Garantie Légendaire</span><b>${Math.max(1,legPity()-p.pity.leg)} carte${legPity()-p.pity.leg>1?'s':''}</b><div class="dlfr117-bar small"><i style="width:${p.pity.leg/legPity()*100}%"></i></div></div><div><span>Garantie Mythique</span><b>${Math.max(1,MYTH_PITY-p.pity.myth)} cartes</b><div class="dlfr117-bar small myth"><i style="width:${p.pity.myth/MYTH_PITY*100}%"></i></div></div></div></div>
  <div class="dlfr117-packs">${allPacks().map(pack=>{
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
// ============================================================ V162 : Maîtrise des cartes + Spécialisations
const MASTERY=[100,300,700,1500,3000],MASTERY_NAME=['','Bronze','Argent','Or','Constellation','Prisme'];
function masteryXp(id){return (progress.mastery||{})[id]||0;}
function masteryRank(id){const x=masteryXp(id);return MASTERY.filter(t=>x>=t).length;}
function masteryGain(id,xp){progress.mastery=progress.mastery||{};const before=masteryRank(id);progress.mastery[id]=Math.min(1e6,masteryXp(id)+Math.round(xp*(isSpec('art')?1.5:1)));const after=masteryRank(id);
 if(after>before){const c=get(id);toast('Maîtrise',`${c?.name||'Carte'} atteint le rang ${['','I','II','III','IV','V'][after]} (bordure ${MASTERY_NAME[after]})`,'level');}}
const SPECS={col:{name:'Collectionneur',icon:'🃏',text:'Finitions +30 %, éclats des nouvelles cartes ×2, récompenses des contrats +50 %.'},
 exp:{name:'Explorateur',icon:'🧭',text:'Chapitres : 4 vies au lieu de 3, chemins secrets bien plus fréquents ; expéditions +20 % d’éclats.'},
 art:{name:'Artisan',icon:'⚒',text:'Forge −20 %, doublons +30 % de poussière, maîtrise des cartes +50 %.'}};
function isSpec(k){return progress.spec===k;}
function pickSpec(k){if(!SPECS[k]||progress.level<25)return;const change=!!progress.spec;if(progress.spec===k)return;
 if(change){if(progress.shards<5000){toast('Spécialisation','Changer de spécialisation coûte 5 000 ◆.','info');return;}if(!confirm(`Passer en ${SPECS[k].name} pour 5 000 ◆ ? Les talents exclusifs de ton ancienne spécialisation sont remboursés.`))return;pay({shards:5000});
  for(const sk of SKILLS.filter(x=>x.spec&&x.spec!==k)){const r=rank(sk.id);if(r){let back=0;for(let i=1;i<=r;i++)back+=sk.cost*i;addShards(back);delete progress.skills[sk.id];}}}
 progress.spec=k;log(`Spécialisation : ${SPECS[k].name}.`);toast('Spécialisation',`Tu es maintenant ${SPECS[k].name}.`,'level');}
function specPanel(){
 if(progress.level<25)return `<div class="dlfr162-spec is-locked"><b>Spécialisation</b><span>Au niveau 25, choisis une spécialisation : Collectionneur, Explorateur ou Artisan. Elle donne des bonus et débloque un talent exclusif.</span></div>`;
 return `<div class="dlfr162-spec"><div class="dlfr162-spec-head"><b>Spécialisation</b><span>${progress.spec?`Changer coûte 5 000 ◆ (talents exclusifs remboursés).`:'Choisis-en une : tu pourras changer plus tard.'}</span></div><div class="dlfr162-specs">${Object.entries(SPECS).map(([k,v])=>`<button type="button" class="dlfr162-sp ${progress.spec===k?'is-on':''}" data-v112-act="spec-pick" data-spec="${k}"><span>${v.icon}</span><b>${v.name}</b><small>${v.text}</small>${progress.spec===k?'<em>✓ Active</em>':''}</button>`).join('')}</div></div>`;
}
// ============================================================ V161 : Chapitres (aventure interactive) + Contrats
// Attributs de carte (déterministes) : Précision, Endurance, Technique, Découverte.
const ATTRS=[['pre','Précision','🎯'],['end','Endurance','🛡'],['tec','Technique','⚙'],['dec','Découverte','🔍']];
function hashStr(s){let h=2166136261;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function cardStats(c){
 const v=owned.get(c.id)||{},t=tierOf(c),total=10+t*4+(v.stars||0)*2+(v.finish||0)*2;
 const bias=c.type==='level'?[2,4,4,1]:c.type==='player'?[4,2,4,1]:[2,2,2,5];
 const h=hashStr(c.id+':'+c.name),w=bias.map((b,i)=>b+((h>>>(i*4))&7)),sw=w.reduce((a,b)=>a+b,0);
 const st=w.map(x=>Math.round(total*x/sw));
 if(t<=1&&h%3===0){st[(h>>>16)%4]+=8;} // certaines Communes / Rares ont une vraie spécialité
 return {pre:st[0],end:st[1],tec:st[2],dec:st[3],spec:t<=1&&h%3===0?ATTRS[(h>>>16)%4][0]:null};
}
const CHAPTERS=[
 {id:'c1',name:'Plaines de Stereo Madness',d:1,level:1},{id:'c2',name:'Forêt de Clubstep',d:2,level:5},
 {id:'c3',name:'Usine Deadlocked',d:3,level:12},{id:'c4',name:'Ruines de Bloodbath',d:4,level:20},
 {id:'c5',name:'Cavernes de Sonic Wave',d:5,level:35},{id:'c6',name:'Abysse de Tartarus',d:6,level:55},
 {id:'c7',name:'Faille d’Acheron',d:7,level:80},{id:'c8',name:'Trône de Tidal Wave',d:8,level:110}];
const STEP_KIND={explore:['Explorer','🧭',1],event:['Événement','❗',1],challenge:['Défi','⚔',1.2],treasure:['Trésor','💰',.85],boss:['Boss','💀',1.5]};
const STEP_TXT={explore:['Un couloir de pics s’ouvre devant toi.','Le chemin se sépare en deux.','Une série de plateformes mobiles bloque le passage.'],
 event:['Un portail de gravité apparaît au milieu du niveau.','Un orbe jaune clignote au-dessus du vide.','Le niveau passe soudain en double vitesse.'],
 challenge:['Une partie en wave très serrée.','Un enchaînement de clics au rythme de la musique.','Un passage en mini-vaisseau sans marge d’erreur.'],
 treasure:['Un coffre est posé derrière une rangée de scies.','Des pièces secrètes brillent dans un recoin.','Une clé dorée flotte au-dessus d’un piège.'],
 boss:['Le gardien du chapitre te barre la route.','La dernière partie du niveau, la plus dure.','Le boss final lance ses attaques.']};
const CHOICE_TXT={pre:'Passer au pixel près',end:'Tenir jusqu’au bout',tec:'Enchaîner les inputs',dec:'Chercher un passage caché'};
let chTeam=[];
function chState(){progress.chapters=progress.chapters||{cleared:{},run:null};return progress.chapters;}
function chUnlocked(ch,i){const s=chState();return progress.level>=ch.level&&(i===0||!!s.cleared[CHAPTERS[i-1].id]);}
function chCost(ch){return {shards:60*ch.d,keys:ch.d>=5?1:0};}
// V165 — énergie des chapitres : 6 charges, +1 toutes les 20 min (fini le farm de milliers de runs).
const CH_MAX=6,CH_REGEN=20*60000;
function chEnergy(){const s=chState(),now=Date.now();let e=s.energy;if(!e||typeof e!=='object'||!IV(e.n,CH_MAX)||!IV(e.t,now+60000)){e=s.energy={n:CH_MAX,t:now};}
 if(e.n>=CH_MAX)e.t=now;else{const g=Math.floor((now-e.t)/CH_REGEN);if(g>0){e.n=Math.min(CH_MAX,e.n+g);e.t=e.n>=CH_MAX?now:e.t+g*CH_REGEN;}}return e;}
function chNext(){const e=chEnergy();return e.n>=CH_MAX?0:Math.max(0,e.t+CH_REGEN-Date.now());}
// Tirages fixés par la graine de l'aventure : recharger la page ne relance pas un échec.
function seeded(str){let h=hashStr(str);return()=>{h=(h+0x6D2B79F5)>>>0;let t=h;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function chReq(d,kind){return Math.round((6+7.5*(d-1))*STEP_KIND[kind][2]*(.9+Math.random()*.2));}
function buildSteps(ch){
 const n=4+Math.floor(ch.d/2),kinds=['explore','event','challenge','treasure'],out=[];
 for(let i=0;i<n;i++){const kind=i===n-1?'boss':kinds[(i+Math.floor(Math.random()*4))%4];
  const a=[...ATTRS.map(x=>x[0]).filter(x=>x!=='dec')].sort(()=>Math.random()-.5).slice(0,2);
  const choices=a.map(attr=>({attr,req:chReq(ch.d,kind)}));
  if(kind!=='boss'&&Math.random()<(isSpec('exp')?.6:.35))choices.push({attr:'dec',req:Math.round(chReq(ch.d,kind)*1.3),secret:true});
  out.push({kind,txt:pick(STEP_TXT[kind]),choices});}
 return out;
}
function teamStat(attr,run){return run.team.reduce((n,id)=>{const c=get(id);if(!c)return n;const v=cardStats(c)[attr];return n+(run.armed===id?v*2:v);},0);}
function startChapter(id){
 const i=CHAPTERS.findIndex(c=>c.id===id),ch=CHAPTERS[i],s=chState();if(!ch||s.run||!chUnlocked(ch,i))return;
 const team=chTeam.filter(x=>has(x)).slice(0,3);if(team.length<1){toast('Chapitres','Choisis au moins une carte pour ton équipe.','info');return;}
 const cost=chCost(ch);if(!canAfford(cost)){toast('Chapitres',`Il faut ${costText(cost)} pour partir.`,'info');return;}
 const en=chEnergy();if(en.n<1){toast('Chapitres',`Plus d’énergie : prochaine charge dans ${Math.ceil(chNext()/60000)} min.`,'info');return;}
 en.n--;if(en.n===CH_MAX-1)en.t=Date.now();
 pay(cost);const ml=isSpec('exp')?4:3;s.run={ch:ch.id,step:0,lives:ml,max:ml,team,used:[],armed:null,steps:buildSteps(ch),loot:{shards:0,dust:0,keys:0,cards:[]},log:[],seed:Math.floor(Math.random()*2147483647)};
 log(`Chapitre lancé : ${ch.name}.`);
}
function chArm(id){const r=chState().run;if(!r||r.used.includes(id)||!r.team.includes(id))return;r.armed=r.armed===id?null:id;}
function chChoose(k){
 const s=chState(),r=s.run;if(!r)return;const ch=CHAPTERS.find(c=>c.id===r.ch),st=r.steps[r.step],c=st?.choices[k];if(!c)return;
 const rnd=seeded(`${r.seed||0}:${r.ch}:${r.step}:${c.attr}:${c.secret?1:0}`),rp=a=>a[Math.floor(rnd()*a.length)];
 const total=teamStat(c.attr,r),p=total>=c.req?.95:total>=c.req*.8?.5:.1,ok=rnd()<p,km=STEP_KIND[st.kind][2]*(c.secret?1.6:1)*(s.cleared[ch.id]?.6:1);
 if(r.armed){r.used.push(r.armed);r.armed=null;}SAVE.urgent=true;
 if(ok){const sh=Math.round(15*ch.d*km),du=Math.round(5*ch.d*km);r.loot.shards+=sh;r.loot.dust+=du;
  let extra='';if(st.kind==='treasure'||c.secret){if(rnd()<.3){r.loot.keys++;extra=' · +1 🔑';}}
  if((st.kind==='treasure'&&rnd()<.2)||(st.kind==='boss'&&rnd()<(s.cleared[ch.id]?.5:1))||(c.secret&&rnd()<.5)){const pool=packable();if(pool.length){const tw=[0,85,13,1.8,.2],tiers=[...new Set(pool.map(tierOf))].filter(t=>t>=1&&t<=4);let tt=tiers[0]??0,rr=rnd()*tiers.reduce((a,t)=>a+(tw[t]||0),0);for(const t of tiers.sort((a,b)=>a-b)){rr-=tw[t]||0;if(rr<=0){tt=t;break;}}const cd=rp(pool.filter(x=>tierOf(x)===tt))||rp(pool);r.loot.cards.push(cd.id);extra+=` · carte ${cd.name}`;}}
  r.log.push(`✓ ${STEP_KIND[st.kind][0]} réussi (${ATTRS.find(a=>a[0]===c.attr)[1]} ${total}/${c.req}) : +${sh} ◆ +${du} ✧${extra}`);r.step++;}
 else{r.lives--;r.log.push(`✗ ${STEP_KIND[st.kind][0]} raté (${ATTRS.find(a=>a[0]===c.attr)[1]} ${total}/${c.req}) : −1 vie`);if(st.kind!=='boss')r.step++;}
 if(r.step>=r.steps.length||r.lives<=0)finishChapter(r.step>=r.steps.length&&r.lives>0);
}
function finishChapter(win){
 const s=chState(),r=s.run,ch=CHAPTERS.find(c=>c.id===r.ch),f=(win?1:.5)*(1+.1*rank('se1')),first=win&&!s.cleared[ch.id];
 const parts=[`+${fmt(addShards(r.loot.shards*f*shardMult()))} ◆`,`+${fmt(addDust(r.loot.dust*f*dustMult()))} ✧`,`+${fmt(addXP(40*ch.d*(win?(first?3:1.5):1)*xpMult()))} XP`];
 const keys=Math.floor(r.loot.keys*f)+(first?ch.d:0);if(keys){progress.keys+=keys;parts.push(`+${keys} 🔑`);}
 for(const id of (win?r.loot.cards:r.loot.cards.slice(0,Math.floor(r.loot.cards.length/2)))){const c=get(id);if(!c)continue;const isNew=!has(id),fin=rollFinish({});give(id,1,fin);registerPull(c,fin,isNew);parts.push(`${c.name}${isNew?' (nouvelle !)':''}`);}
 if(win)s.cleared[ch.id]=(s.cleared[ch.id]||0)+1;
 for(const id of r.team)masteryGain?.(id,win?30*ch.d:10*ch.d);
 toast(win?`🧭 ${ch.name} terminé !`:'Aventure interrompue',`${win?'':'Plus de vies : la moitié du butin est gardée. '}${parts.join(' · ')}${first?' · premier passage !':''}`,win?'achievement':'info');
 log(`${ch.name} : ${win?'réussi':'échoué'} (${parts.join(', ')}).`);s.run=null;checkAchievements();
}
function chAbandon(){const r=chState().run;if(!r)return;if(!confirm('Abandonner l’aventure ? Tu gardes la moitié du butin.'))return;r.lives=0;finishChapter(false);}
function statPills(c){const s=cardStats(c);return `<span class="dlfr161-stats">${ATTRS.map(([k,l,ic])=>`<i class="${s.spec===k?'is-spec':''}" title="${l}">${ic}${s[k]}</i>`).join('')}</span>`;}
function chaptersView(){
 const s=chState(),r=s.run,data=srcData();
 if(r){const ch=CHAPTERS.find(c=>c.id===r.ch),st=r.steps[r.step];
  return `<section class="dlfr117-panel dlfr161"><div class="dlfr117-head"><div><small>CHAPITRE ${CHAPTERS.indexOf(ch)+1} · DIFFICULTÉ ${ch.d}/8</small><h2>${esc(ch.name)}</h2><p>Choisis comment franchir chaque étape. Ton équipe additionne ses attributs ; une capacité double une carte pour la prochaine étape (une fois par aventure).</p></div>
   <div class="dlfr161-lives">${'❤'.repeat(r.lives)}${'🖤'.repeat(Math.max(0,(r.max||3)-r.lives))}</div></div>
   <ol class="dlfr161-path">${r.steps.map((x,i)=>`<li class="${i<r.step?'is-done':i===r.step?'is-now':''}"><span>${STEP_KIND[x.kind][1]}</span><small>${STEP_KIND[x.kind][0]}</small></li>`).join('')}</ol>
   ${st?`<div class="dlfr161-step is-${st.kind}"><h3>${STEP_KIND[st.kind][1]} ${STEP_KIND[st.kind][0]}</h3><p>${esc(st.txt)}</p>
    <div class="dlfr161-choices">${st.choices.map((c,k)=>{const tot=teamStat(c.attr,r),a=ATTRS.find(x=>x[0]===c.attr);return `<button type="button" class="dlfr161-choice ${c.secret?'is-secret':''} ${tot>=c.req?'is-ok':tot>=c.req*.8?'is-risky':'is-hard'}" data-v112-act="ch-choose" data-k="${k}"><b>${c.secret?'🗝 Chemin secret · ':''}${CHOICE_TXT[c.attr]}</b><span>${a[2]} ${a[1]} : ${tot} / ${c.req}</span><small>${tot>=c.req?'Très probable':tot>=c.req*.8?'Risqué (1 chance sur 2)':'Très difficile'}${c.secret?' · gros butin':''}</small></button>`;}).join('')}</div></div>`:''}
   <div class="dlfr161-team">${r.team.map(id=>{const c=get(id);if(!c)return '';const used=r.used.includes(id);return `<div class="dlfr161-member ${r.armed===id?'is-armed':''}">${figure(c,data,true)}${statPills(c)}<button type="button" class="btn small ${r.armed===id?'':'subtle'}" data-v112-act="ch-arm" data-id="${id}" ${used?'disabled':''}>${used?'Capacité utilisée':r.armed===id?'✦ Capacité prête':'Utiliser la capacité'}</button></div>`;}).join('')}</div>
   <div class="dlfr161-loot"><b>Butin en cours :</b> ◆ ${fmt(r.loot.shards)} · ✧ ${fmt(r.loot.dust)}${r.loot.keys?` · 🔑 ${r.loot.keys}`:''}${r.loot.cards.length?` · ${r.loot.cards.length} carte${r.loot.cards.length>1?'s':''}`:''} <button type="button" class="btn small subtle" data-v112-act="ch-abandon">Abandonner</button></div>
   ${r.log.length?`<ul class="dlfr161-log">${r.log.slice(-5).reverse().map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
  </section>`;}
 const mine=shownCards().filter(c=>has(c.id)).map(c=>({c,s:cardStats(c)})).sort((a,b)=>(b.s.pre+b.s.end+b.s.tec+b.s.dec)-(a.s.pre+a.s.end+a.s.tec+a.s.dec));
 chTeam=chTeam.filter(x=>has(x)).slice(0,3);
 return `<section class="dlfr117-panel dlfr161"><div class="dlfr117-head"><div><small>AVENTURE</small><h2>Chapitres</h2><p class="dlfr165-energy">⚡ Énergie : <b>${chEnergy().n}/${CH_MAX}</b>${chNext()?` · prochaine charge dans ${Math.ceil(chNext()/60000)} min`:''} · une charge par départ, rejouer un chapitre déjà terminé rapporte moins.</p><p>Forme une équipe de 3 cartes et explore un chapitre étape par étape. Chaque carte a 4 attributs (🎯 Précision, 🛡 Endurance, ⚙ Technique, 🔍 Découverte) selon sa rareté, ses étoiles et sa finition. Certaines cartes Communes ont une spécialité très forte (attribut doré) : elles peuvent être indispensables. La Découverte ouvre les chemins secrets.</p></div></div>
  <div class="dlfr161-chapters">${CHAPTERS.map((ch,i)=>{const un=chUnlocked(ch,i),cost=chCost(ch),done=s.cleared[ch.id]||0;return `<article class="dlfr161-ch ${un?'':'is-locked'} ${done?'is-cleared':''}"><small>Chapitre ${i+1} · difficulté ${ch.d}/8</small><h3>${esc(ch.name)}</h3><p>${4+Math.floor(ch.d/2)} étapes · ${done?`terminé ${done}×`:'jamais terminé'}</p>
   <button type="button" class="btn ${un?'':'subtle'}" data-v112-act="ch-start" data-id="${ch.id}" ${!un||chTeam.length<1||!canAfford(cost)||chEnergy().n<1?'disabled':''}>${un?`Partir · ${costText(cost)}`:progress.level<ch.level?`🔒 Niveau ${ch.level}`:'🔒 Termine le chapitre précédent'}</button></article>`;}).join('')}</div>
  <div class="dlfr117-sub"><h3>Ton équipe (${chTeam.length}/3)</h3><div class="dlfr161-pick">${mine.slice(0,60).map(({c})=>`<button type="button" class="dlfr161-card ${chTeam.includes(c.id)?'is-on':''}" data-v112-act="ch-team" data-id="${c.id}">${figure(c,data,true)}${statPills(c)}</button>`).join('')||'<p class="dlfr117-empty">Ouvre des boosters pour avoir des cartes.</p>'}</div></div>
 </section>`;
}
// ---------- Contrats de collection
function contracts(){
 const data=srcData(),out=[],dem=new Map((data.demons||[]).filter(d=>d.is_public!==false).map(d=>[normalize(d.name),d]));
 const lv=shownCards().filter(c=>c.type==='level'&&countable(c)).map(c=>({c,d:dem.get(normalize(c.name))})).filter(x=>x.d);
 const group=(keyFn,label,prefix)=>{const m=new Map();for(const x of lv){const k=String(keyFn(x.d)||'').trim();if(!k||/^anonyme|^à renseigner/i.test(k))continue;if(!m.has(k))m.set(k,[]);m.get(k).push(x.c);}
  for(const [k,cards] of m)if(cards.length>=3)out.push({id:prefix+normalize(k),name:label(k),cards,need:Math.min(cards.length,Math.max(3,Math.ceil(cards.length*.75)))});};
 group(d=>d.verifier,k=>`Vérifiés par ${k}`,'ver:');group(d=>d.creator,k=>`Créés par ${k}`,'cre:');
 const band=(id,name,a,b)=>{const cards=lv.filter(x=>Number(x.d.position)>=a&&Number(x.d.position)<=b).map(x=>x.c);if(cards.length>=3)out.push({id,name,cards,need:Math.max(3,Math.ceil(cards.length*.7))});};
 band('top10','Le Top 10',1,10);band('main','La Main List (#11 à #75)',11,75);band('ext','L’Extended List (#76 à #150)',76,150);
 const rk=new Map((window.DLFR_RANKING?.()||[]).slice(0,10).map(p=>[normalize(p.name),p]));const tp=shownCards().filter(c=>c.type==='player'&&rk.has(normalize(c.name)));if(tp.length>=3)out.push({id:'ptop10',name:'Les joueurs du Top 10',cards:tp,need:Math.max(3,Math.ceil(tp.length*.7))});
 return out;
}
function contractProgress(k){const have=k.cards.filter(c=>has(c.id)).length;return {have,ok:have>=k.need};}
function contractReward(k){const m=isSpec('col')?1.5:1;return {shards:Math.round(120*k.need*m),dust:Math.round(60*k.need*m),keys:Math.ceil(k.need/2*m)};}
function claimContract(id){const k=contracts().find(x=>x.id===id);progress.contracts=progress.contracts||{};if(!k||progress.contracts[id]||!contractProgress(k).ok)return;
 progress.contracts[id]=true;const txt=grant(contractReward(k));toast('📜 Contrat rempli',`${k.name} · ${txt}`,'achievement');log(`Contrat rempli : ${k.name} (${txt})`);checkAchievements();}
function contractsHTML(){const list=contracts(),done=progress.contracts||{};
 if(!list.length)return '<p class="dlfr117-empty">Aucun contrat pour l’instant : ils apparaissent quand le catalogue contient au moins 3 cartes d’un même thème (même vérificateur, même créateur, Top 10…).</p>';
 return `<p class="dlfr117-muted">Rassemble les cartes d’un thème. Pas besoin de toutes : le nombre demandé laisse de la marge si une carte est introuvable.</p><div class="dlfr161-contracts">${list.sort((a,b)=>(!!done[a.id])-(!!done[b.id])).map(k=>{const p=contractProgress(k),rw=contractReward(k),got=done[k.id];
  return `<article class="dlfr161-contract ${got?'is-done':p.ok?'is-ready':''}"><h4>📜 ${esc(k.name)}</h4><div class="dlfr117-bar small"><i style="width:${Math.min(100,p.have/k.need*100)}%"></i></div><small>${Math.min(p.have,k.need)} / ${k.need} cartes (sur ${k.cards.length} possibles)</small>
   <p class="dlfr161-ccards">${k.cards.map(c=>`<span class="${has(c.id)?'is-have':''}">${has(c.id)?'✓':'·'} ${esc(c.name)}</span>`).join('')}</p>
   <p>Récompense : ◆ ${fmt(rw.shards)} · ✧ ${fmt(rw.dust)} · 🔑 ${rw.keys}</p>${got?'<b class="dlfr161-ok">✓ Rempli</b>':`<button class="btn small" type="button" data-v112-act="contract-claim" data-id="${esc(k.id)}" ${p.ok?'':'disabled'}>Remplir le contrat</button>`}</article>`;}).join('')}</div>`;}
function expeditionsView(){
 const p=progress,free=slots()-p.camps.length;
 return `<section class="dlfr117-panel"><div class="dlfr117-head"><div><small>CARTE DU MONDE</small><h2>Expéditions</h2><p>Envoie tes camps vers des destinations de plus en plus lointaines. Plus l’expédition est longue, plus elle rapporte : clés, poussière et parfois une carte.</p></div><div class="dlfr117-slots"><b>${p.camps.length} / ${slots()}</b><span>camps occupés</span><small>+1 au niveau 30 et via les talents</small></div></div>
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
 return `<section class="dlfr117-panel dlfr117-talents"><div class="dlfr117-head"><div><small>ARBRE DE TALENTS</small><h2>Talents</h2><p>1 point au départ, +1 tous les 2 niveaux et +3 par Renaissance. L’arbre complet demande ${SKILLS.reduce((n,s)=>n+s.max*s.pts,0)} points. La branche Légende se débloque à partir du niveau 100.</p></div><div class="dlfr117-slots"><b>${freePoints()}</b><span>point${freePoints()>1?'s':''} libre${freePoints()>1?'s':''}</span><small>${spentPoints()} / ${totalPoints()} utilisés</small></div></div>
  <div class="dlfr117-tree">${BRANCHES.map(b=>`<div class="dlfr117-branch c-${b.color}"><header><span>${b.icon}</span><div><h3>${b.name}</h3><small>${b.subtitle}</small></div></header>${SKILLS.filter(s=>s.branch===b.key).map(node).join('<i class="dlfr117-link" aria-hidden="true"></i>')}</div>`).join('')}</div>
  <div class="dlfr117-capstones">${SKILLS.filter(s=>s.branch==='core').map(node).join('')}</div>
  ${specPanel()}<div class="dlfr162-specskills">${SKILLS.filter(s=>s.branch==='spec').map(node).join('')}</div>
 </section>`;
}
function forgeView(data){
 const list=CARDS.filter(c=>has(c.id)).sort((a,b)=>tierOf(b)-tierOf(a)||a.id-b.id);
 if(!list.find(c=>c.id===forgeSel))forgeSel=list[0]?.id||0;
 const cur=get(forgeSel),v=cur&&owned.get(cur.id),k=cur&&v?starCost(cur,v):null;
 return `<section class="dlfr117-panel"><div class="dlfr117-head"><div><small>FORGE</small><h2>Étoiles</h2><p>Consomme des doublons et de la poussière ✧ pour faire monter une carte jusqu’à ★5, puis jusqu’à ★10 avec l’<b>Éveil</b> (★6 à ★10, très coûteux). Chaque étoile augmente ta puissance de collection, qui donne des bonus permanents.</p></div></div>
  ${starTrack(cur,v)}${finishPanel()}${powerTrack()}
  ${list.length?`<div class="dlfr117-forge"><div class="dlfr117-forge-list">${list.map(c=>{const o=owned.get(c.id),sc=starCost(c,o),ready=sc&&o.count-1>=sc.copies&&progress.dust>=sc.dust;return `<button type="button" class="dlfr117-forge-item ${c.id===forgeSel?'is-current':''} ${ready?'is-ready':''}" data-v112-act="forge-select" data-id="${c.id}"><span class="t${tierOf(c)}">${esc(c.name)}</span><small>${'★'.repeat(o.stars||0)}${'☆'.repeat(Math.max(0,5-(o.stars||0)))} · ${sc?`${Math.min(o.count-1,sc.copies)}/${sc.copies} doublon${sc.copies>1?'s':''}`:'MAX'}</small>${sc?`<i class="dlfr143-mini"><b style="width:${Math.min(100,(o.count-1)/sc.copies*100)}%"></b></i>`:''}${ready?'<em class="dlfr143-ready">Prêt !</em>':''}</button>`;}).join('')}</div>
   <div class="dlfr117-forge-main">${cur?`<div class="dlfr117-forge-card">${figure(cur,data)}</div><div class="dlfr117-forge-info"><h3>${esc(cur.name)}</h3><p>${esc(rarity(cur))} · ${FIN_NAME[v.finish||0]} · ★${v.stars||0}/${MAX_STARS}</p><p class="dlfr162-mline">Maîtrise : ${masteryRank(cur.id)?`rang ${['','I','II','III','IV','V'][masteryRank(cur.id)]} (${MASTERY_NAME[masteryRank(cur.id)]})`:'aucune'} · ${fmt(masteryXp(cur.id))}${masteryRank(cur.id)<5?` / ${fmt(MASTERY[masteryRank(cur.id)])}`:''} XP <small>(gagnée en partant en chapitre avec cette carte)</small></p>
    ${k?`<ul class="dlfr117-reqs"><li class="${v.count-1>=k.copies?'ok':''}">Doublons : ${v.count-1} / ${k.copies}</li><li class="${progress.dust>=k.dust?'ok':''}">Poussière : ${fmt(progress.dust)} / ${fmt(k.dust)} ✧</li></ul><button class="btn" type="button" data-v112-act="upgrade" data-id="${cur.id}" ${v.count-1>=k.copies&&progress.dust>=k.dust?'':'disabled'}>Forger ★${(v.stars||0)+1}</button>`:'<p class="dlfr117-done">★★★★★ Étoiles maximales</p>'}</div>`:''}</div></div>`:'<p class="dlfr117-empty">Ouvre des boosters pour remplir la Forge.</p>'}
  <div class="dlfr117-sub"><h3>Doublons des cartes ★10</h3><p class="dlfr117-muted">Une carte ★10 ne peut plus monter : ses doublons peuvent être recyclés en poussière ✧.</p>
   <button class="btn subtle" type="button" data-v112-act="recycle">Recycler les doublons des cartes ★10</button></div>
 </section>`;
}
function goalsView(){
 const tabs=[['quests','Missions'],['achievements',`Succès ${Object.keys(progress.achievements).length}/${ACHIEVEMENTS.length}`],['sets',`Séries ${Object.keys(progress.sets).length}/${SETS.length}`],['contracts','Contrats'],['renaissance','Renaissance']];
 let body='';
 if(goalsTab==='quests')body=`<div class="dlfr117-quests">${progress.quests.map(q=>{if(!questReady(q))return `<article class="dlfr117-quest is-wait"><h4>Nouvelle mission en préparation</h4><p class="dlfr159-wait" data-quest-at="${q.at}">Disponible dans <b>${duration(q.at-Date.now())}</b></p></article>`;const done=q.have>=q.target;return `<article class="dlfr117-quest ${done?'is-done':''}"><h4>${esc(questText(q))}</h4><div class="dlfr117-bar small"><i style="width:${q.have/q.target*100}%"></i></div><small>${fmt(q.have)} / ${fmt(q.target)}</small><p>Récompense : ${q.reward.xp} XP · ◆ ${q.reward.shards}${q.reward.keys?' · 🔑 1':''}${q.reward.dust?' · ✧ '+q.reward.dust:''}</p><div class="dlfr117-row">${done?`<button class="btn" type="button" data-v112-act="quest-claim" data-id="${q.id}">Réclamer</button>`:`<button class="btn subtle" type="button" data-v112-act="quest-reroll" data-id="${q.id}" ${progress.shards<rerollCost()?'disabled':''}>Changer · ◆ ${rerollCost()}</button>`}</div></article>`;}).join('')}</div><p class="dlfr117-muted">Une mission réclamée est remplacée par une nouvelle au bout de 1 h 30. Les récompenses grandissent avec ton niveau (jusqu’au niveau 100).</p>`;
 if(goalsTab==='achievements')body=`<div class="dlfr117-achievements">${ACHIEVEMENTS.map(a=>{const ok=progress.achievements[a.id],v=Math.min(a.value(),a.target);return `<article class="dlfr117-ach ${ok?'is-done':''}"><span>${ok?'🏆':'◌'}</span><div><h4>${esc(a.name)}</h4><p>${esc(a.desc)}</p><div class="dlfr117-bar small"><i style="width:${v/a.target*100}%"></i></div><small>${fmt(v)} / ${fmt(a.target)} · ${Object.entries(a.reward).map(([k,n])=>`${{keys:'🔑',dust:'✧',shards:'◆',xp:'XP'}[k]} ${n}`).join(' ')}${a.title?` · titre « ${esc(a.title)} »`:''}</small></div></article>`;}).join('')}</div>`;
 if(goalsTab==='sets')body=`<div class="dlfr117-sets">${SETS.map(s=>{const pr=setProgress(s),done=progress.sets[s.id],ready=!done&&pr.total&&pr.have>=pr.total;return `<article class="dlfr117-set ${done?'is-done':''}"><h4>${esc(s.name)}</h4><p>${s.finish?`Toutes en ${FIN_NAME[s.finish]} ou mieux`:s.stars?`Toutes à ★${s.stars} ou plus`:'Toutes les cartes de la série'}</p><div class="dlfr117-bar small"><i style="width:${pr.total?pr.have/pr.total*100:0}%"></i></div><small>${pr.have} / ${pr.total} · 🔑 ${s.reward.keys} · ✧ ${s.reward.dust} · +5 % ◆ permanents</small>${done?'<b class="dlfr117-ok">✓ Terminée</b>':`<button class="btn" type="button" data-v112-act="set-claim" data-id="${s.id}" ${ready?'':'disabled'}>Valider la série</button>`}</article>`;}).join('')}</div>`;
 if(goalsTab==='contracts')body=contractsHTML();
 if(goalsTab==='renaissance'){const g=renaissanceGain();body=`<div class="dlfr117-reborn"><div class="dlfr117-reborn-mark">✺</div><div><h3>Renaissance ${progress.prestige}/${MAX_PRESTIGE}</h3><p>À partir du niveau ${RENAISSANCE_LEVEL}, tu peux renaître : retour au niveau 1, talents remis à zéro, mais tu gardes toute ta collection, la poussière, les clés, les succès et les séries.</p><ul><li>Chaque ✺ : +10 % d’XP et d’éclats, +3 points de talent permanents.</li><li>Gain : 1 ✺ au niveau ${RENAISSANCE_LEVEL}, +1 tous les 25 niveaux au-delà.</li><li>Bonus actuel : +${Math.round((prestMult()-1)*100)} % · ${progress.prestige*3} points de talent supplémentaires.</li></ul><button class="btn" type="button" data-v112-act="renaissance" ${g?'':'disabled'}>${g?`Renaître · +${g} ✺`:progress.prestige>=MAX_PRESTIGE?'Maximum atteint':`Disponible au niveau ${RENAISSANCE_LEVEL}`}</button></div></div>`;}
 return `<section class="dlfr117-panel"><div class="dlfr117-head"><div><small>OBJECTIFS</small><h2>Missions, succès & séries</h2><p>Missions du moment, succès et séries.</p></div></div><div class="dlfr117-tabs">${tabs.map(([k,t])=>`<button type="button" class="${goalsTab===k?'active':''}" data-v112-act="goals-tab" data-tab="${k}">${t}</button>`).join('')}</div>${body}</section>`;
}
function progressionPage(data){
 ensureQuests();
 const inner=view==='packs'?boostersView():view==='chapters'?chaptersView():view==='expeditions'?expeditionsView():view==='talents'?talentsView():view==='forge'?forgeView(data):goalsView();
 return `<div class="dlfr117-game">${hud()}${inner}
  <div class="dlfr117-footer"><p>Ta partie est sauvegardée automatiquement sur ton compte. Tu peux aussi l’exporter dans un fichier et la réimporter plus tard.${editor?' <em>Équipe :</em> le bouton « Importer (test) » ouvre une session de test qui n’est <strong>pas</strong> sauvegardée (« Importer ma partie » remplace et sauvegarde ta vraie partie).':''}</p><div class="dlfr113-create-buttons"><button class="btn subtle" data-v112-act="export-session" type="button">↓ Exporter ma partie</button><button class="btn subtle" data-v112-act="import-own" type="button">↑ Importer ma partie</button><input type="file" id="dlfr173OwnFile" accept="application/json,.json" hidden>${editor?'<button class="btn subtle" data-v112-act="open-session-import" type="button">↑ Importer (test)</button>':''}<input type="file" id="dlfr114SessionFile" accept="application/json,.json" hidden></div></div></div>`;
}

// ============================================================ Export / import de session
function sessionObject(){
 return {format:'dlfr-cards-session',version:2,exportedAt:new Date().toISOString(),customCards:[],owned:[...owned].map(([id,v])=>({id,count:v.count,finish:v.finish||0,stars:v.stars||0})),overrides:[...overrides],
  progress:{...progress,reveals:[],skills:{...progress.skills},camps:progress.camps.map(c=>({...c})),quests:progress.quests.map(q=>({...q,reward:{...q.reward}})),achievements:{...progress.achievements},sets:{...progress.sets},pity:{...progress.pity},stats:{...progress.stats,tiers:[...progress.stats.tiers],finishes:[...progress.stats.finishes]}}};
}
function exportSession(){download(sessionObject(),'DLFR_Cards_aventure.json');log('Sauvegarde exportée.');}
// V174 — un joueur peut réimporter une partie exportée : elle remplace sa partie et est sauvegardée sur son compte.
async function importOwnSave(file){
 if(!file)return;
 if(file.size>20000000){alert('Fichier trop volumineux (20 Mo maximum).');return;}
 if(!userId||!SAVE.loaded){toast('DLFR Cards','Connecte-toi et attends le chargement de ta partie avant d’importer.','info');return;}
 if(SAVE.tainted){toast('DLFR Cards','Tu es en session de test : recharge la page avant d’importer ta partie.','info');return;}
 let data;try{data=JSON.parse(await file.text());}catch{alert('Ce fichier n’est pas une sauvegarde DLFR Cards.');return;}
 const lvl=Number(data?.progress?.level)||1,pk=Number(data?.progress?.stats?.packs)||0;
 if(!confirm(`Importer cette partie (niveau ${lvl}, ${pk} booster${pk>1?'s':''} ouverts) ? Ta partie actuelle sera remplacée.`))return;
 try{restoreSession(data,false);}catch(error){alert('Import impossible : '+error.message);return;}
 SAVE.conflict=false;SAVE.unreadable=false;SAVE.urgent=true;view='packs';scheduleSave();repaint();
 toast('DLFR Cards',`Partie importée (niveau ${lvl}) et en cours de sauvegarde sur ton compte.`,'achievement');
}
async function importSession(file){
 if(!file||file.size>20000000){alert('Fichier de session trop volumineux (20 Mo maximum).');return;}
 try{restoreSession(JSON.parse(await file.text()),true);}catch(error){alert('Import de session impossible : '+error.message);}
}
// Restaure une sauvegarde (fichier ou compte). Lève une erreur si le contenu est incohérent.
const IV=(v,max,min=0)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
function cleanChapters(c){const out={cleared:{},run:null};if(!c||typeof c!=='object')return out;
 if(c.energy&&IV(c.energy.n,CH_MAX)&&IV(c.energy.t,Date.now()+60000))out.energy={n:c.energy.n,t:c.energy.t};else if(c.energy)out.energy={n:0,t:Date.now()};
 for(const [k,v] of Object.entries(c.cleared||{}))if(CHAPTERS.some(x=>x.id===k)&&IV(v,100000,1))out.cleared[k]=v;
 const r=c.run;if(r&&CHAPTERS.some(x=>x.id===r.ch)&&Array.isArray(r.steps)&&r.steps.length<=10&&IV(r.step,r.steps.length)&&IV(r.lives,4,1)&&Array.isArray(r.team)&&r.team.length<=3&&r.team.every(n=>IV(n,100000000,1)))
  out.run={ch:r.ch,step:r.step,lives:r.lives,max:IV(r.max,4,3)?r.max:3,team:r.team,used:(r.used||[]).filter(n=>r.team.includes(n)),armed:null,steps:r.steps.filter(s=>STEP_KIND[s?.kind]&&Array.isArray(s.choices)).map(s=>({kind:s.kind,txt:String(s.txt||'').slice(0,120),choices:s.choices.filter(c=>CHOICE_TXT[c?.attr]&&IV(c.req,100000,1)).slice(0,3).map(c=>({attr:c.attr,req:c.req,secret:!!c.secret}))})),
   loot:{shards:IV(r.loot?.shards,1e7)?r.loot.shards:0,dust:IV(r.loot?.dust,1e7)?r.loot.dust:0,keys:IV(r.loot?.keys,1000)?r.loot.keys:0,cards:(r.loot?.cards||[]).filter(n=>IV(n,100000000,1)).slice(0,20)},log:[],seed:IV(r.seed,2147483647)?r.seed:0};
 return out;}
function restoreSession(x,interactive){
 {
  if(x?.format!=='dlfr-cards-session'||![1,2].includes(x.version)||!Array.isArray(x.owned)||!Array.isArray(x.overrides)||x.owned.length>5000||x.overrides.length>5000)throw new Error('Format invalide');
  const localCreations=Array.isArray(x.customCards)?x.customCards.length:0;let skipped=0;
  const I=(v,max,min=0)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
  const ids=new Set(CARDS.map(c=>c.id));
  const inv=[];for(const row of x.owned){
   const finish=x.version===1?(row.holo===true?1:0):row.finish,stars=x.version===1?0:row.stars;
   if(!I(row?.id,100000000,1)||!I(row.count,1e12,1)||!I(finish,4)||!I(stars,MAX_STARS))throw new Error('Inventaire invalide');if(!ids.has(row.id)){skipped++;continue;}inv.push([row.id,{count:row.count,finish,stars,holo:finish>0}]);}
  const rares=[];for(const e of x.overrides){if(!Array.isArray(e)||!rarities.includes(e[1]))throw new Error('Rareté invalide');if(ids.has(e[0]))rares.push(e);}
  const p=x.progress;if(!p||typeof p!=='object')throw new Error('Progression absente');
  let np=freshProgress();
  if(x.version===1){
   // V114–V116 : niveau, éclats et compteurs repris ; anciens talents remboursés en points (l'arbre a changé).
   if(!I(p.level,30,1)||!I(p.shards,1000000))throw new Error('Statistiques invalides');
   Object.assign(np,{level:p.level,shards:p.shards});np.stats.packs=I(p.packsOpened,100000)?p.packsOpened:0;np.stats.expeditions=I(p.expeditions,100000)?p.expeditions:0;np.stats.bestLevel=p.level;
  }else{
   if(!I(p.level,MAX_LEVEL,1)||!I(p.xp,1e15)||!I(p.shards,1e15)||!I(p.dust,1e15)||!I(p.keys,1e12)||!I(p.prestige,MAX_PRESTIGE)||!I(p.questSeed||0,1e12))throw new Error('Statistiques invalides');
   const skills={};if(!p.skills||typeof p.skills!=='object'||Array.isArray(p.skills))throw new Error('Talents invalides');
   for(const [k,r] of Object.entries(p.skills)){const s=SKILLS.find(z=>z.id===k);if(!s||!I(r,s.max,1)||p.level<s.level)throw new Error('Talent invalide');skills[k]=r;}
   for(const k of Object.keys(skills)){const s=SKILLS.find(z=>z.id===k);if(!s.requires.every(r=>skills[r]))throw new Error('Arbre de talents incohérent');}
   if(SKILLS.reduce((n,s)=>n+(skills[s.id]||0)*s.pts,0)>1+Math.floor(p.level/2)+3*p.prestige)throw new Error('Nombre de points incohérent');
   const camps=Array.isArray(p.camps)?p.camps:[];if(camps.length>5)throw new Error('Expéditions invalides');
   for(const c of camps)if(!DESTS.some(d=>d.id===c?.dest)||!I(c.start,4102444800000)||!I(c.end,4102444800000)||c.end<c.start)throw new Error('Expédition invalide');
   const flags=(o,list)=>{const out={};if(!o||typeof o!=='object'||Array.isArray(o))return out;for(const [k,v] of Object.entries(o))if(v===true&&list.some(z=>z.id===k))out[k]=true;return out;};
   const st=p.stats||{},stats=newStats();for(const k of Object.keys(stats)){if(Array.isArray(stats[k])){if(Array.isArray(st[k])&&st[k].length<=stats[k].length&&st[k].every(n=>I(n,1e15)))st[k].forEach((n,i)=>{stats[k][i]=n;});}else if(I(st[k],1e15))stats[k]=st[k];}
   const quests=Array.isArray(p.quests)?p.quests.filter(q=>q&&QUEST_POOL.some(t=>t.type===q.type)&&I(q.target,100000,1)&&I(q.have,q.target)&&q.reward&&typeof q.reward==='object'&&['xp','shards','dust','keys'].every(k=>q.reward[k]===undefined||I(q.reward[k],1000000))).slice(0,3).map(q=>({id:String(q.id).slice(0,20),type:q.type,target:q.target,have:q.have,reward:{...q.reward},...(I(q.at,4102444800000)&&q.at>0?{at:q.at}:{})})):[];
   Object.assign(np,{level:p.level,xp:p.xp,shards:p.shards,dust:p.dust,keys:p.keys,prestige:p.prestige,skills,camps:camps.map(c=>({dest:c.dest,start:c.start,end:c.end})),quests,questSeed:p.questSeed||0,
    achievements:flags(p.achievements,ACHIEVEMENTS),sets:flags(Object.fromEntries(Object.entries(p.sets||{}).map(([k,v])=>[['legends','modern','players','dlfr'].includes(k)?'col-'+k:k,v])),SETS),pity:{leg:I(p.pity?.leg,5000)?p.pity.leg:0,myth:I(p.pity?.myth,5000)?p.pity.myth:0},stats,title:typeof p.title==='string'?p.title.slice(0,40):'',chapters:cleanChapters(p.chapters),spec:SPECS[p.spec]?p.spec:null,mastery:Object.fromEntries(Object.entries(p.mastery&&typeof p.mastery==='object'?p.mastery:{}).filter(([k,v])=>/^[0-9]{1,12}$/.test(k)&&Number.isSafeInteger(v)&&v>=0&&v<=1e6).slice(0,5000).map(([k,v])=>[Number(k),v])),contracts:Object.fromEntries(Object.entries(p.contracts&&typeof p.contracts==='object'?p.contracts:{}).filter(([k,v])=>v===true&&k.length<=80).slice(0,500))});
  }
  if(interactive&&!confirm('Restaurer cette sauvegarde ? Les cartes et la progression actuelles seront remplacées.'))return;
  reset();for(const [id,v] of inv)owned.set(id,v);for(const [id,r] of rares)overrides.set(id,r);
  Object.assign(progress,np);ensureQuests();
  log(`Session de test restaurée (format v${x.version}).${skipped?` ${skipped} carte(s) absentes du catalogue ignorées.`:''}${localCreations?` ${localCreations} création(s) locales V113 non reprises : importe-les dans l’onglet Catalogue.`:''}`);if(interactive){SAVE.tainted=true;clearTimeout(SAVE.timer);SAVE.timer=0;view='packs';repaint();}
 }
}

// ============================================================ OUVERTURE CINÉMATIQUE
const OPEN={st:null,el:null,canvas:null,ctx:null,parts:[],raf:0,sound:false,audio:null,last:0,w:0,h:0};
const reducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const wait=ms=>new Promise(r=>setTimeout(r,reducedMotion()?Math.min(ms,120):ms));
const cardOf=d=>d.card||get(d.id);
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
 if(!silent){const m=OPEN.st?.meta;OPEN.st=null;if(m?.real)m.onClose?.();else repaint();}
}
function setOpening(sel,html){const n=OPEN.el?.querySelector(sel);if(n)n.innerHTML=html;}
function cardBack(tier){return `<div class="o-back-art aura-${tier}"><div class="o-back-ring"></div><span>DLFR</span><b>◆</b><small>CARDS · ORIGINS</small></div>`;}
function renderOpening(){
 const st=OPEN.st,el=OPEN.el;if(!st||!el)return;
 el.dataset.stage=st.stage;
 const n=st.draws.length,data=srcData();
 el.querySelector('.o-count').textContent=st.stage==='cards'?`Carte ${st.i+1} / ${n}`:st.stage==='summary'?'Bilan':`${n} carte${n>1?'s':''}`;
 el.querySelector('[data-o="skip"]').hidden=st.stage==='summary';
 if(st.stage==='sealed'){
  setOpening('.o-stage',`<div class="o-pack" style="--tear:0" data-o="pack" tabindex="-1"><div class="o-pack-half o-pack-top">${packArt(st.pack,'is-big')}</div><div class="o-pack-half o-pack-bottom">${packArt(st.pack,'is-big')}</div><div class="o-tear-line"><span class="o-tear-cut"></span><i class="o-tear-handle">✂</i></div></div>`);
  setOpening('.o-buttons',`<button type="button" class="o-btn o-primary" data-o="next">Déchirer le booster</button>`);
  setOpening('.o-hint','Glisse le long de la ligne pour déchirer · ou clique / Espace');setOpening('.o-banner','');
 }else if(st.stage==='opening'){
  setOpening('.o-buttons','');setOpening('.o-hint','');
 }else if(st.stage==='cards'){
  const d=st.draws[st.i],card=cardOf(d),left=n-st.i-1;
  setOpening('.o-stage',`<div class="o-deck">${Array.from({length:Math.min(4,left)},(_,k)=>`<div class="o-ghost" style="--k:${k+1}">${cardBack(0)}</div>`).join('')}
   <div class="o-card t${d.tier} f${d.finish} is-entering" data-o="card" tabindex="0" aria-label="Carte à révéler"><div class="o-card-inner"><div class="o-face o-back">${cardBack(d.tier)}</div><div class="o-face o-front">${card?figure(card,data,false,{finish:d.finish,stars:0}):''}<div class="o-glare"></div></div></div></div></div>`);
  setOpening('.o-banner','');
  setOpening('.o-buttons',`<button type="button" class="o-btn o-primary" data-o="next">Révéler la carte</button>`);
  setOpening('.o-hint',d.tier>=2?'Carte rare…':'Clique sur la carte ou appuie sur Espace');
  setTimeout(()=>OPEN.el?.querySelector('.o-card')?.classList.remove('is-entering'),reducedMotion()?0:520);
 }else if(st.stage==='summary')renderSummary();
 OPEN.el.querySelector('.o-primary')?.focus({preventScroll:true});
}
function bannerFor(d){
 const r=cardOf(d)?.rarity===FESTIVE?FESTIVE:rarities[d.tier];
 return `<div class="o-ann t${d.tier}"><span class="o-ann-rarity">${TIER_GEM[d.tier]} ${esc(r.toUpperCase())} ${pipsHTML(d.tier)}${d.finish?` · ${FIN_NAME[d.finish].toUpperCase()}`:''}</span><span class="o-ann-rank">${r===FESTIVE?'Édition spéciale · calendrier de l’Avent':r===SECRET?'CARTE SECRÈTE · 1 chance sur 1 000 000':`${['La plus courante','Peu courante','Rare','Très rare','Extrêmement rare','La plus rare de toutes'][d.tier]} · rareté ${d.tier+1}/${rarities.length}`}</span><strong>${esc(cardOf(d)?.name||'')}</strong><em class="${d.isNew?'is-new':''}">${OPEN.st?.meta?.real?(d.isNew?'✦ NOUVELLE CARTE':`DOUBLON · recyclable +${d.value} ✦`):`${d.isNew?'✦ NOUVELLE CARTE':'DOUBLON'} · +${d.shards} ◆${d.dust?` · +${d.dust} ✧`:''}${d.pity?' · GARANTIE ACTIVÉE':''}`}</em></div>`;
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
 setOpening('.o-hint',d.isNew?'Elle rejoint ta collection.':st.meta?.real?'Doublon.':'Doublon : converti en poussière ✧ pour la Forge.');
 OPEN.el.querySelector('.o-primary')?.focus({preventScroll:true});
 await wait(380);st.busy=false;
}
async function nextCard(){
 const st=OPEN.st;if(!st||st.busy)return;st.busy=true;
 const d=st.draws[st.i],cardEl=OPEN.el.querySelector('.o-card'),card=cardOf(d);
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
 else if(a==='again'){if(OPEN.st.meta?.real){const m=OPEN.st.meta;unmountOpening(true);OPEN.st=null;m.onAgain?.();return;}const id=OPEN.st.pack.id;unmountOpening(true);OPEN.st=null;if(!openPack(id))repaint();}
 else if(a==='sound'){OPEN.sound=!OPEN.sound;b.textContent=OPEN.sound?'🔊 Son':'🔇 Son';b.setAttribute('aria-pressed',String(OPEN.sound));if(OPEN.sound)sfx('flip');}
}
function renderRealSummary(){
 const st=OPEN.st,m=st.meta,draws=st.draws,data=m.data||{},news=draws.filter(d=>d.isNew).length,dup=draws.filter(d=>!d.isNew).reduce((n,d)=>n+d.value,0);
 const best=draws.reduce((a,d)=>d.tier>a.tier?d:a,draws[0]);
 setOpening('.o-stage',`<div class="o-summary"><h3>${news} nouvelle${news>1?'s':''} carte${news>1?'s':''} · ${draws.length-news} doublon${draws.length-news>1?'s':''}</h3>
  <div class="o-sum-grid">${draws.map((d,k)=>{const c=cardOf(d);return c?`<div class="o-sum-card t${d.tier} ${d===best&&d.tier>=2?'is-best':''}" style="--k:${k}">${figure(c,data,true,{finish:0})}<span class="${d.isNew?'is-new':''}">${d.isNew?'NOUVELLE':'DOUBLON'}</span></div>`:'';}).join('')}</div>
  <div class="o-gains"><div><b data-count="${news}">0</b><span>nouvelle${news>1?'s':''}</span></div><div><b data-count="${Number(m.balance)||0}">0</b><span>✦ solde</span></div></div>
  ${(m.bonuses||[]).map(b=>`<div class="o-levelup"><b>COLLECTION COMPLÈTE !</b><span>${esc(b.collection)}</span><small>+${esc(b.coins)} Wayllings dorés</small></div>`).join('')}
  </div>`);
 setOpening('.o-banner','');
 setOpening('.o-buttons',`${m.againLabel?`<button type="button" class="o-btn" data-o="again">${esc(m.againLabel)}</button>`:''}<button type="button" class="o-btn o-primary" data-o="close">Terminer</button>`);
 setOpening('.o-hint','Échap ou Espace pour fermer');
 OPEN.el.querySelectorAll('[data-count]').forEach(el=>countUp(el,Number(el.dataset.count)));
}
function renderSummary(){
 if(OPEN.st?.meta?.real)return renderRealSummary();
 const st=OPEN.st,data=srcData(),m=st.meta,draws=st.draws;
 const shards=draws.reduce((n,d)=>n+d.shards,0),dust=draws.reduce((n,d)=>n+d.dust,0),news=draws.filter(d=>d.isNew).length;
 const best=draws.reduce((a,d)=>d.tier>a.tier||(d.tier===a.tier&&d.finish>a.finish)?d:a,draws[0]);
 const startPct=m.before.level>=MAX_LEVEL?100:m.before.xp/m.before.target*100,endPct=progress.level>=MAX_LEVEL?100:progress.xp/levelTarget(progress.level)*100;
 const again=allPacks().find(p=>p.id===st.pack.id),canAgain=again&&canAfford(again.cost)&&progress.level>=again.level;
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
 const base=[16,30,56,110,180,280][tier]*(soft?.6:1),n=Math.round(base/(reducedMotion()?5:1));
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
  else if(name==='reveal'){const notes=[523,659,784,1047,1319,1568];for(let i=0;i<=tier;i++)tone(notes[i],i*.08,.5+tier*.1,'triangle',.06);if(tier>=4)[1568,2093].forEach((f,i)=>tone(f,.45+i*.1,1.2,'sine',.04));}
  else if(name==='level')[523,659,784,1047].forEach((f,i)=>tone(f,i*.09,.6,'square',.03));
 }catch{}
}

// ============================================================ PAGE
// ============================================================ CATALOGUE SUPABASE (V118)
const BUCKET='dlfr-cards', IMG_TYPES=['image/png','image/jpeg','image/webp','image/gif'], IMG_MAX=2000000;
function setMsg(text,kind=''){catalog.msg=text;catalog.msgKind=kind;const el=document.getElementById('dlfr118Msg');if(el){el.textContent=text;el.className='dlfr118-msg '+(kind?'is-'+kind:'');}}
function errText(e){const m=e?.message||String(e||'Erreur inconnue');return /duplicate key.*slug/i.test(m)?'Ce nom court (slug) est déjà utilisé par une autre collection.':/Accès refusé|42501|permission denied/i.test(m)?'Accès refusé : seuls les propriétaires et supermodérateurs peuvent modifier le catalogue.':m;}
function applyCatalog(cols,cards){
 COLLECTIONS=(cols||[]).map(c=>({id:Number(c.id),slug:c.slug,name:c.name,description:c.description||'',color:c.color||'#8b5cf6',sort:Number(c.sort_order)||0,booster:c.booster_enabled!==false,boosterCost:Number(c.booster_cost)||120,boosterLevel:Number(c.booster_level)||1,boosterCount:Number(c.booster_count)||5,published:c.is_published!==false}));
 CARDS.length=0;for(const r of cards||[])CARDS.push(mkCard(r));
 for(const id of [...owned.keys()])if(!get(id))owned.delete(id);
 for(const id of [...overrides.keys()])if(!get(id))overrides.delete(id);
 rebuildSets();
 if(!get(selected))selected=CARDS[0]?.id||0;
 if(!COLLECTIONS.some(c=>c.id===catalog.selCol))catalog.selCol=COLLECTIONS[0]?.id??null;
 if(catalog.editCard&&catalog.editCard!=='new'&&!get(catalog.editCard)){catalog.editCard=null;catalog.draft=null;}
}
function useFallback(){COLLECTIONS=FALLBACK_COLLECTIONS.map(c=>({...c}));CARDS.length=0;CARDS.push(...fallbackCards());rebuildSets();catalog.status='local';catalog.selCol=1;catalog.editCard=null;catalog.editCol=null;catalog.draft=null;catalog.colDraft=null;}
async function loadCatalog(){
 if(!DB)return;catalog.status='loading';
 try{
  const [c,k]=await Promise.all([
   DB.from('dlfr_card_collections').select('*').order('sort_order',{ascending:true}).order('id',{ascending:true}),
   DB.from('dlfr_cards').select('id,collection_id,name,card_type,rarity,description,image_url,in_packs,sort_order').order('sort_order',{ascending:true}).order('id',{ascending:true})]);
  if(c.error)throw c.error;if(k.error)throw k.error;
  if(!c.data.length&&!k.data.length&&catalog.status!=='ready'){catalog.status='empty';}else catalog.status='ready';
  applyCatalog(c.data,k.data);catalog.error='';
 }catch(e){catalog.status='error';catalog.error=errText(e);console.warn('[DLFR Cards] Catalogue :',e);}
 repaint();
}
const canEdit=()=>!!DB&&['ready','empty'].includes(catalog.status)&&!catalog.busy;
function slugify(s){return normalize(s).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'collection';}
function colOf(id){return COLLECTIONS.find(c=>c.id===Number(id));}
function cardsOf(colId){return CARDS.filter(c=>c.collectionId===colId);}
function openCardEditor(id){
 const c=id==='new'?null:get(id);
 catalog.editCard=c?c.id:'new';catalog.pendingFile=null;
 catalog.draft=c?{name:c.name,type:c.type,rarity:c.rarity,collection:c.collectionId,description:c.description,imageUrl:c.image,preview:'',inPacks:c.inPacks,sort:c.sort}
  :{name:'',type:'level',rarity:'Rare',collection:catalog.selCol,description:'',imageUrl:'',preview:'',inPacks:true,sort:(cardsOf(catalog.selCol).reduce((m,x)=>Math.max(m,x.sort),0)+1)};
 setMsg('');
}
function openColEditor(id){const c=id==='new'?null:colOf(id);catalog.editCol=c?c.id:'new';catalog.colDraft=c?{name:c.name,slug:c.slug,description:c.description,color:c.color,sort:c.sort,slugTouched:true,booster:c.booster!==false,boosterCost:c.boosterCost||120,boosterLevel:c.boosterLevel||1,boosterCount:c.boosterCount||5}:{name:'',slug:'',description:'',color:'#8b5cf6',sort:COLLECTIONS.reduce((m,x)=>Math.max(m,x.sort),0)+1,slugTouched:false,booster:true,boosterCost:120,boosterLevel:1,boosterCount:5};setMsg('');}
function draftCard(){const d=catalog.draft||{};return {id:catalog.editCard==='new'?0:catalog.editCard,name:d.name||'Nouvelle carte',rarity:d.rarity||'Rare',type:d.type||'level',series:colOf(d.collection)?.name||'',image:d.preview||(validUrl(d.imageUrl)||''),description:d.description||''};}
function previewHtml(){return figure(draftCard(),srcData(),false,{finish:0,stars:0});}
function refreshCatPreview(){const el=document.getElementById('dlfr118Preview');if(el)el.innerHTML=previewHtml();}
function storagePath(url){const mark=`/storage/v1/object/public/${BUCKET}/`;const i=String(url||'').indexOf(mark);return i<0?'':decodeURIComponent(String(url).slice(i+mark.length).split('?')[0]);}
async function uploadImage(file){
 if(file&&window.DLFR_SHRINK)file=await window.DLFR_SHRINK(file,640,900); // V173 : carte réduite (~50 Ko au lieu de ~600 Ko)
 if(!file||!IMG_TYPES.includes(file.type)||file.size>IMG_MAX)throw new Error('Image refusée : PNG, JPEG, WebP ou GIF, 2 Mo maximum.');
 const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[file.type];
 const path=`cards/${(crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2))}.${ext}`;
 const {error}=await DB.storage.from(BUCKET).upload(path,file,{contentType:file.type,cacheControl:'31536000',upsert:false});
 if(error)throw error;
 return DB.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
async function removeImage(url){const p=storagePath(url);if(!p)return;try{await DB.storage.from(BUCKET).remove([p]);}catch(e){console.warn('[DLFR Cards] Image non supprimée :',e);}}
// ============================================================ V158 : propositions automatiques de cartes
// Raretés proposées selon la position du niveau dans la liste ou le rang du joueur au classement.
// Rien n'est créé sans validation : le propriétaire / supermodo coche, ajuste la rareté et confirme.
const SUGG={open:false,src:'levels',sel:new Set(),rar:{},col:0,q:''};
function levelRarity(pos){return pos<=1?'Ultra':pos<=5?'Mythique':pos<=20?'Légendaire':pos<=50?'Épique':pos<=100?'Rare':'Commun';}
function playerRarity(rank){return rank<=1?'Ultra':rank<=3?'Mythique':rank<=10?'Légendaire':rank<=25?'Épique':rank<=60?'Rare':'Commun';}
function suggestions(){
 const data=srcData(),taken=new Set(CARDS.map(c=>dupKey(c.name))),out=[];
 if(SUGG.src==='players'){
  const list=(window.DLFR_RANKING?.()||[]).slice(0,200);
  for(const p of list){if(!p.name||!(p.points>0)||/^anonyme/i.test(p.name))continue;out.push({id:'p:'+p.key,type:'player',name:p.name,info:`#${p.rank} du classement · ${Math.round(p.points).toLocaleString('fr-FR')} pts`,rarity:playerRarity(p.rank),order:p.rank,dup:taken.has(dupKey(p.name))});}
 }else{
  const nlw=SUGG.src==='nlw';
  const list=(data.demons||[]).filter(d=>d.is_public!==false&&!d.is_legacy&&Number(d.position)>0&&(nlw?Number(d.position)>150&&Number(d.position)<=350:Number(d.position)<=150)).sort((a,b)=>a.position-b.position);
  for(const d of list){const pos=Number(d.position);out.push({id:'l:'+(d.id??pos),type:'level',name:String(d.name||'').trim(),info:nlw?`NLW #${pos-150}`:`#${pos} de la liste`,rarity:nlw?'Commun':levelRarity(pos),order:pos,dup:taken.has(dupKey(d.name))});}
 }
 const q=normalize(SUGG.q||'');return out.filter(x=>x.name&&(!q||normalize(x.name).includes(q)));
}
function suggestView(){
 if(!SUGG.open)return `<div class="dlfr158-open"><button class="btn" type="button" data-v112-act="cat-sugg-toggle">✨ Proposer des cartes automatiquement</button><span>À partir de la liste des niveaux et du classement des joueurs, avec une rareté proposée. Tu valides avant toute création.</span></div>`;
 const list=suggestions(),fresh=list.filter(x=>!x.dup),sel=fresh.filter(x=>SUGG.sel.has(x.id));
 if(!colOf(SUGG.col))SUGG.col=(COLLECTIONS.find(c=>c.published===false)||COLLECTIONS[0])?.id||0;
 const opt=r=>ALL_RARITIES.filter(x=>x!==FESTIVE).map(x=>`<option ${x===r?'selected':''}>${esc(x)}</option>`).join('');
 return `<section class="dlfr158" aria-label="Propositions automatiques de cartes">
  <header><div><small>PROPOSITIONS AUTOMATIQUES</small><h3>Cartes suggérées</h3><p>Raretés proposées : ${SUGG.src==='players'?'Top 1 Ultra · 2-3 Mythique · 4-10 Légendaire · 11-25 Épique · 26-60 Rare · ensuite Commun':SUGG.src==='nlw'?'NLW : Commun par défaut':'#1 Ultra · #2-5 Mythique · #6-20 Légendaire · #21-50 Épique · #51-100 Rare · #101-150 Commun'}. Vérifie et ajuste avant de créer.</p></div><button class="btn subtle small" type="button" data-v112-act="cat-sugg-toggle">Fermer</button></header>
  <div class="dlfr158-bar">
   <div class="dlfr158-src" role="tablist">${[['levels','Niveaux · Top 150'],['nlw','Niveaux · NLW'],['players','Joueurs · classement']].map(([k,l])=>`<button type="button" class="${SUGG.src===k?'active':''}" data-v112-act="cat-sugg-src" data-src="${k}">${l}</button>`).join('')}</div>
   <input type="search" data-v158="q" placeholder="Filtrer par nom…" value="${esc(SUGG.q)}">
  </div>
  <p class="dlfr158-count">${fresh.length} proposition${fresh.length>1?'s':''}${list.length-fresh.length?` · ${list.length-fresh.length} déjà en carte (masquée${list.length-fresh.length>1?'s':''})`:''} · <button type="button" class="linklike" data-v112-act="cat-sugg-all">tout cocher</button> · <button type="button" class="linklike" data-v112-act="cat-sugg-none">tout décocher</button></p>
  <div class="dlfr158-list">${fresh.slice(0,250).map(x=>`<label class="dlfr158-row ${SUGG.sel.has(x.id)?'is-on':''}"><input type="checkbox" data-v158-sel="${esc(x.id)}" ${SUGG.sel.has(x.id)?'checked':''}><span class="dlfr158-type">${x.type==='player'?'★ Joueur':'◆ Niveau'}</span><b>${esc(x.name)}</b><small>${esc(x.info)}</small><select data-v158-rar="${esc(x.id)}">${opt(SUGG.rar[x.id]||x.rarity)}</select></label>`).join('')||'<p class="dlfr117-empty">Aucune proposition : tout existe déjà en carte.</p>'}</div>
  <div class="dlfr158-go"><label>Collection<select data-v158="col">${COLLECTIONS.map(c=>`<option value="${c.id}" ${c.id===SUGG.col?'selected':''}>${esc(c.name)}${c.published===false?' (en préparation)':''}</option>`).join('')}</select></label>
   <button class="btn" type="button" data-v112-act="cat-sugg-create" ${sel.length?'':'disabled'}>Créer ${sel.length} carte${sel.length>1?'s':''}</button>
   <small>Conseil : crée-les dans une collection <b>en préparation</b>, ajoute les images, puis publie. Les visuels des niveaux et avatars des joueurs s’affichent automatiquement quand l’image est vide.</small></div>
 </section>`;
}
function createSuggestions(){
 const col=colOf(SUGG.col);if(!col){setMsg('Choisis une collection.','error');return;}
 const rows=suggestions().filter(x=>!x.dup&&SUGG.sel.has(x.id));if(!rows.length)return;
 if(!confirm(`Créer ${rows.length} carte(s) dans « ${col.name} » ?${col.published===false?'':'\n\n⚠ Cette collection est publiée : les joueurs verront les cartes tout de suite.'}`))return;
 withBusy('Création des cartes…',async()=>{
  let sort=cardsOf(col.id).reduce((m,x)=>Math.max(m,x.sort||0),0),n=0;
  for(const x of rows.sort((a,b)=>a.order-b.order)){
   const {error}=await DB.rpc('dlfr_cards_admin_save_card',{p_id:null,p_collection_id:col.id,p_name:x.name.slice(0,80),p_type:x.type,p_rarity:SUGG.rar[x.id]||x.rarity,p_description:'',p_image_url:'',p_in_packs:true,p_sort:++sort});
   if(error)throw error;n++;SUGG.sel.delete(x.id);
  }
  log(`${n} carte(s) créées automatiquement dans ${col.name}`);catalog.selCol=col.id;await loadCatalog();setMsg(`${n} carte(s) créée(s) ✓ — vérifie-les dans « ${col.name} »`,'ok');
 });
}
async function withBusy(label,fn){
 if(!canEdit())return;catalog.busy=true;setMsg(label,'busy');document.querySelectorAll('#dlfr112Lab .dlfr118-cat button').forEach(b=>b.disabled=true);
 try{await fn();}catch(e){catalog.msg=errText(e);catalog.msgKind='error';console.warn('[DLFR Cards] Catalogue :',e);}
 finally{catalog.busy=false;repaint();}
}
// V148 — alerte anti-doublon à la création des cartes.
const dupKey=n=>String(n||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function cardDups(name,exceptId){const k=dupKey(name);if(!k)return {same:[],near:[]};
 const others=CARDS.filter(c=>c.id!==exceptId);
 const same=others.filter(c=>dupKey(c.name)===k);
 const near=k.length>=4?others.filter(c=>{const o=dupKey(c.name);return o!==k&&o.length>=4&&(o.includes(k)||k.includes(o));}).slice(0,3):[];
 return {same,near};}
const dupLabel=c=>`« ${c.name} » (#${idString(c.id)} · ${colOf(c.collectionId)?.name||'sans collection'} · ${rarity(c)})`;
function dupState(){
 if(!catalog.draft)return {cls:'dlfr148-dup',html:''};
 const ex=catalog.editCard==='new'?null:catalog.editCard,{same,near}=cardDups(catalog.draft.name,ex);
 return {cls:'dlfr148-dup'+(same.length?' is-same':near.length?' is-near':''),
  html:same.length?`⚠ Existe déjà : ${same.map(c=>esc(dupLabel(c))).join(', ')}`:near.length?`Nom proche de : ${near.map(c=>esc(dupLabel(c))).join(', ')}`:''};
}
function dupHint(){const el=document.getElementById('dlfr148Dup');if(!el)return;const st=dupState();el.className=st.cls;el.innerHTML=st.html;}
function saveCard(){
 const d=catalog.draft;if(!d)return;
 const name=safeText(d.name,80);
 if(!name){setMsg('Indique un nom pour la carte.','error');return;}
 if(!colOf(d.collection)){setMsg('Choisis une collection.','error');return;}
 if(d.imageUrl&&!validUrl(d.imageUrl)&&!catalog.pendingFile){setMsg('L’URL de l’image doit commencer par https://','error');return;}
 const old=catalog.editCard==='new'?null:get(catalog.editCard);
 if(!old||dupKey(old.name)!==dupKey(name)){const {same}=cardDups(name,old?.id??null);
  if(same.length&&!confirm(`Attention, doublon possible !\n\nUne carte porte déjà ce nom :\n${same.map(c=>'• '+dupLabel(c)).join('\n')}\n\n${old?'Renommer':'Créer'} quand même ?`))return;}
 withBusy('Enregistrement de la carte…',async()=>{
  let image=catalog.pendingFile?await uploadImage(catalog.pendingFile):(validUrl(d.imageUrl)||'');
  const {data,error}=await DB.rpc('dlfr_cards_admin_save_card',{p_id:old?old.id:null,p_collection_id:Number(d.collection),p_name:name,p_type:d.type,p_rarity:d.rarity,p_description:safeText(d.description,400),p_image_url:image,p_in_packs:!!d.inPacks,p_sort:Number(d.sort)||0});
  if(error){if(catalog.pendingFile&&image)await removeImage(image);throw error;}
  if(old?.image&&old.image!==image)await removeImage(old.image);
  catalog.pendingFile=null;log(`${old?'Carte modifiée':'Carte créée'} dans le catalogue : ${name}`);
  await loadCatalog();openCardEditor(Number(data));catalog.selCol=get(data)?.collectionId??catalog.selCol;selected=Number(data);
  repaint();setMsg(old?'Carte enregistrée ✓':'Carte créée ✓','ok');
 });
}
function deleteCard(){
 const c=get(catalog.editCard);if(!c)return;
 if(!confirm(`Supprimer définitivement « ${c.name} » du catalogue ?\nElle disparaîtra de l’album, des boosters et des collections de test.`))return;
 withBusy('Suppression…',async()=>{
  const {error}=await DB.rpc('dlfr_cards_admin_delete_card',{p_id:c.id});if(error)throw error;
  if(c.image)await removeImage(c.image);log(`Carte supprimée du catalogue : ${c.name}`);
  catalog.editCard=null;catalog.draft=null;await loadCatalog();setMsg('Carte supprimée ✓','ok');
 });
}
function saveCollection(){
 const d=catalog.colDraft;if(!d)return;
 const name=safeText(d.name,60),slug=slugify(d.slug||d.name);
 if(!name){setMsg('Indique un nom pour la collection.','error');return;}
 if(slug.length<2){setMsg('Le nom court doit faire au moins 2 caractères.','error');return;}
 if(!/^#[0-9a-f]{6}$/i.test(d.color||''))d.color='#8b5cf6';
 const old=catalog.editCol==='new'?null:colOf(catalog.editCol);
 withBusy('Enregistrement de la collection…',async()=>{
  const {data,error}=await DB.rpc('dlfr_cards_admin_save_collection',{p_id:old?old.id:null,p_slug:slug,p_name:name,p_description:safeText(d.description,400),p_color:d.color,p_sort:Number(d.sort)||0});
  if(error)throw error;
  const bz=await DB.rpc('dlfr_cards_admin_set_collection_booster',{p_id:Number(data),p_enabled:d.booster!==false,p_cost:Math.round(Number(d.boosterCost)||120),p_level:Math.round(Number(d.boosterLevel)||1),p_count:Math.round(Number(d.boosterCount)||5)});
  if(bz.error)throw bz.error;
  log(`${old?'Collection modifiée':'Collection créée'} : ${name}`);
  catalog.selCol=Number(data);catalog.editCol=null;catalog.colDraft=null;await loadCatalog();setMsg(old?'Collection enregistrée ✓':'Collection créée ✓','ok');
 });
}
function deleteCollection(){
 const c=colOf(catalog.selCol);if(!c)return;const list=cardsOf(c.id);
 if(!confirm(list.length?`La collection « ${c.name} » contient ${list.length} carte(s).\nSupprimer la collection ET ses ${list.length} carte(s) définitivement ?`:`Supprimer la collection vide « ${c.name} » ?`))return;
 if(list.length&&prompt(`Pour confirmer, tape le nom court de la collection : ${c.slug}`)!==c.slug){setMsg('Suppression annulée.','');return;}
 withBusy('Suppression de la collection…',async()=>{
  const {error}=await DB.rpc('dlfr_cards_admin_delete_collection',{p_id:c.id,p_with_cards:list.length>0});if(error)throw error;
  for(const x of list)if(x.image)await removeImage(x.image);
  log(`Collection supprimée : ${c.name}${list.length?` (${list.length} cartes)`:''}`);catalog.editCol=null;catalog.colDraft=null;catalog.editCard=null;catalog.draft=null;
  await loadCatalog();setMsg('Collection supprimée ✓','ok');
 });
}
function dataUrlToFile(s){const m=/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(s||'');if(!m)return null;const bin=atob(m[2]),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new File([u],'import',{type:m[1]});}
async function importCreations(file){
 const col=colOf(catalog.selCol);if(!col){setMsg('Choisis d’abord une collection.','error');return;}
 if(!file||file.size>20000000){setMsg('Fichier trop volumineux (20 Mo maximum).','error');return;}
 let rows;try{const j=JSON.parse(await file.text());
  rows=j?.format==='dlfr-cards-lab'&&Array.isArray(j.cards)?j.cards:j?.format==='dlfr-cards-session'&&Array.isArray(j.customCards)?j.customCards:j?.format==='dlfr-cards-catalog'&&Array.isArray(j.cards)?j.cards:null;
  if(!rows)throw new Error('Format non reconnu (créations V113, session V114–V117 ou sauvegarde de catalogue attendue).');
  if(rows.length>MAX_IMPORT)throw new Error(`${MAX_IMPORT} cartes maximum par import.`);
  rows=rows.map(r=>({...cleanCard({...r,type:r.type||r.card_type,image:r.image||r.image_url},0),inPacks:r.in_packs!==false}));if(rows.some(r=>!r.name))throw new Error('Une carte du fichier est invalide.');
 }catch(e){setMsg('Import impossible : '+e.message,'error');return;}
 if(!rows.length){setMsg('Ce fichier ne contient aucune carte.','error');return;}
 {const seen=new Set(CARDS.map(c=>dupKey(c.name))),skipped=[];rows=rows.filter(r=>{const k=dupKey(r.name);if(seen.has(k)){skipped.push(r.name);return false;}seen.add(k);return true;});
  if(skipped.length&&!rows.length){setMsg(`Import annulé : les ${skipped.length} carte(s) du fichier existent déjà.`,'error');return;}
  if(!confirm(`Ajouter ${rows.length} carte(s) à la collection « ${col.name} » ?${skipped.length?`\n\n${skipped.length} doublon(s) ignoré(s) (nom déjà utilisé) : ${skipped.slice(0,8).join(', ')}${skipped.length>8?'…':''}`:''}`))return;}
 withBusy('Import…',async()=>{
  let n=0,sort=cardsOf(col.id).reduce((m,x)=>Math.max(m,x.sort),0);
  for(const r of rows){
   setMsg(`Import ${n+1} / ${rows.length} : ${r.name}…`,'busy');
   let image='';const f=dataUrlToFile(r.image);if(f)image=await uploadImage(f);else image=validUrl(r.image)||'';
   const {error}=await DB.rpc('dlfr_cards_admin_save_card',{p_id:null,p_collection_id:col.id,p_name:r.name,p_type:r.type,p_rarity:r.rarity,p_description:r.description||'',p_image_url:image,p_in_packs:r.inPacks,p_sort:++sort});
   if(error){if(f&&image)await removeImage(image);throw new Error(`Arrêt à « ${r.name} » (${n} importée(s)) : ${errText(error)}`);}n++;
  }
  log(`${n} carte(s) importée(s) dans ${col.name}.`);await loadCatalog();setMsg(`${n} carte(s) importée(s) ✓`,'ok');
 });
}
function exportCatalog(){download({format:'dlfr-cards-catalog',version:1,exportedAt:new Date().toISOString(),collections:COLLECTIONS.map(c=>({id:c.id,slug:c.slug,name:c.name,description:c.description,color:c.color,sort_order:c.sort})),cards:CARDS.map(c=>({id:c.id,collection_id:c.collectionId,collection:c.slug,name:c.name,card_type:c.type,type:c.type,rarity:c.rarity,description:c.description,image_url:c.image,in_packs:c.inPacks,sort_order:c.sort}))},'DLFR_Cards_catalogue.json');}
function catalogView(data){
 const st=catalog.status,col=colOf(catalog.selCol),list=col?cardsOf(col.id):[],dis=canEdit()?'':'disabled';
 const badge=st==='ready'||st==='empty'?'<span class="dlfr118-badge ok">● Connecté</span>':st==='loading'?'<span class="dlfr118-badge">Chargement…</span>':st==='error'?'<span class="dlfr118-badge err">● Erreur</span>':'<span class="dlfr118-badge err">● Hors ligne</span>';
 if(!DB||st==='local'||st==='error')return `<div class="dlfr117-game dlfr118-cat"><section class="dlfr117-panel"><div class="dlfr117-head"><div><small>CATALOGUE OFFICIEL</small><h2>Cartes & collections</h2><p>${st==='error'?'Le catalogue n’a pas pu être chargé : '+esc(catalog.error):'Connexion impossible : catalogue de secours, en lecture seule.'}</p></div>${badge}</div>${DB?'<button class="btn" type="button" data-v112-act="cat-reload">Réessayer</button>':''}</section></div>`;
 const d=catalog.draft,cd=catalog.colDraft;
 const colForm=cd?`<form class="dlfr118-form" id="dlfr118ColForm" autocomplete="off"><h3>${catalog.editCol==='new'?'Nouvelle collection':'Modifier la collection'}</h3>
  ${catalog.editCol==='new'?'<p class="dlfr150-banner">🚧 Une nouvelle collection est créée <b>en préparation</b> : invisible pour les joueurs tant que tu ne l’as pas publiée.</p>':''}<label>Nom<input data-v118-col="name" maxlength="60" required value="${esc(cd.name)}" placeholder="Ex. : French Legends"></label>
  <label>Nom court (identifiant)<input data-v118-col="slug" maxlength="40" value="${esc(cd.slug)}" placeholder="french-legends"><small>Minuscules, chiffres et tirets.</small></label>
  <label>Description<textarea data-v118-col="description" maxlength="400" rows="2">${esc(cd.description)}</textarea></label>
  <div class="dlfr118-row"><label>Couleur<input type="color" data-v118-col="color" value="${esc(cd.color)}"></label><label>Ordre<input type="number" data-v118-col="sort" value="${esc(cd.sort)}" min="-9999" max="9999"></label></div>
  <fieldset class="dlfr147-booster"><legend>Booster de la collection (mode Aventure)</legend>
   <label class="dlfr147-check"><input type="checkbox" data-v118-col="booster" ${cd.booster!==false?'checked':''}> Proposer un booster avec uniquement les cartes de cette collection</label>
   <div class="dlfr118-row"><label>Prix (éclats ◆)<input type="number" data-v118-col="boosterCost" min="1" max="100000" value="${esc(cd.boosterCost??120)}"></label><label>Niveau requis<input type="number" data-v118-col="boosterLevel" min="1" max="200" value="${esc(cd.boosterLevel??1)}"></label><label>Cartes<input type="number" data-v118-col="boosterCount" min="1" max="10" value="${esc(cd.boosterCount??5)}"></label></div>
   <small>Chances : Commun 68,3 % · Rare 26,4 % · Épique 4,6 % · Légendaire 0,55 % · Mythique 0,095 % · Ultra 1 sur 15 000. Il apparaît dès que la collection a au moins 3 cartes « dans les boosters ».</small></fieldset>
  <div class="dlfr118-actions"><button class="btn" type="submit" ${dis}>${catalog.editCol==='new'?'Créer la collection':'Enregistrer'}</button><button class="btn subtle" type="button" data-v112-act="cat-col-cancel">Annuler</button></div></form>`:'';
 const cardForm=d?`<div class="dlfr118-editor"><form class="dlfr118-form" id="dlfr118CardForm" autocomplete="off"><h3>${catalog.editCard==='new'?'Nouvelle carte':'Modifier #'+idString(catalog.editCard)}</h3>
  <label>Nom<input data-v118-card="name" maxlength="80" required value="${esc(d.name)}" placeholder="Ex. : Oblivion"><small id="dlfr148Dup" class="${dupState().cls}" aria-live="polite">${dupState().html}</small></label>
  <div class="dlfr118-row"><label>Catégorie<select data-v118-card="type">${[['level','Niveau'],['player','Joueur'],['dlfr','DLFR / Spéciale']].map(([k,v])=>`<option value="${k}" ${d.type===k?'selected':''}>${v}</option>`).join('')}</select></label>
  <label>Rareté<select data-v118-card="rarity">${ALL_RARITIES.map(r=>`<option ${d.rarity===r?'selected':''}>${esc(r)}</option>`).join('')}</select></label></div>
  <div class="dlfr118-row"><label>Collection<select data-v118-card="collection">${COLLECTIONS.map(c=>`<option value="${c.id}" ${Number(d.collection)===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>Ordre<input type="number" data-v118-card="sort" value="${esc(d.sort)}" min="-9999" max="99999"></label></div>
  <label>Description (dos de la carte)<textarea data-v118-card="description" maxlength="400" rows="3">${esc(d.description)}</textarea></label>
  <label>Image : URL https<input type="url" data-v118-card="imageUrl" value="${esc(catalog.pendingFile?'':d.imageUrl)}" placeholder="https://…/image.png"></label>
  <label>… ou fichier depuis ton PC <small>(PNG, JPEG, WebP, GIF · 2 Mo max · envoyé sur le site)</small><input type="file" id="dlfr118ImageFile" accept="image/png,image/jpeg,image/webp,image/gif"></label>
  <label class="dlfr118-check"><input type="checkbox" data-v118-card="inPacks" ${d.inPacks?'checked':''}> Peut sortir dans les boosters et expéditions</label>
  <div class="dlfr118-actions"><button class="btn" type="submit" ${dis}>${catalog.editCard==='new'?'Créer la carte':'Enregistrer'}</button>${d.imageUrl||catalog.pendingFile?`<button class="btn subtle" type="button" data-v112-act="cat-clear-image">Retirer l’image</button>`:''}<button class="btn subtle" type="button" data-v112-act="cat-card-cancel">Fermer</button>${catalog.editCard!=='new'?`<button class="btn danger" type="button" data-v112-act="cat-card-delete" ${dis}>Supprimer la carte</button>`:''}</div></form>
  <aside class="dlfr118-preview"><small>APERÇU</small><div id="dlfr118Preview">${previewHtml()}</div></aside></div>`:'';
 return `<div class="dlfr117-game dlfr118-cat"><section class="dlfr117-panel">
  <div class="dlfr117-head"><div><small>CATALOGUE OFFICIEL</small><h2>Cartes & collections</h2><p>Réservé aux propriétaires et supermodos. Chaque modification s’applique tout de suite pour tous les joueurs.</p></div><div class="dlfr118-top">${badge}<div class="dlfr118-actions"><button class="btn subtle" type="button" data-v112-act="cat-reload" ${dis}>↻ Recharger</button><button class="btn subtle" type="button" data-v112-act="cat-export">↓ Sauvegarde JSON</button></div></div></div>
  <p class="dlfr118-msg ${catalog.msgKind?'is-'+catalog.msgKind:''}" id="dlfr118Msg" role="status" aria-live="polite">${esc(catalog.msg)}</p>
  <div class="dlfr118-layout"><aside class="dlfr118-cols"><h3>Collections <span>${COLLECTIONS.length}</span></h3>
   ${COLLECTIONS.map(c=>`<button type="button" class="dlfr118-col ${c.id===catalog.selCol?'is-current':''}" data-v112-act="cat-col" data-id="${c.id}" style="--cc:${esc(c.color)}"><i></i><span>${esc(c.name)}${c.published===false?' <em class="dlfr150-draft">brouillon</em>':''}</span><b>${cardsOf(c.id).length}</b></button>`).join('')||'<p class="dlfr117-muted">Aucune collection.</p>'}
   <button type="button" class="btn" data-v112-act="cat-col-new" ${dis}>+ Nouvelle collection</button>${colForm}</aside>
   <div class="dlfr118-main">${col?`<div class="dlfr118-col-head" style="--cc:${esc(col.color)}"><div><h3>${esc(col.name)} <small>/${esc(col.slug)}</small></h3>${col.description?`<p>${esc(col.description)}</p>`:''}<small>${list.length} carte${list.length>1?'s':''} · ${list.filter(c=>!c.inPacks).length} hors boosters</small>
      ${col.published===false?`<p class="dlfr150-banner">🚧 <b>En préparation</b> : cette collection et ses cartes sont invisibles pour les joueurs et ne sortent d’aucun booster. Publie-la quand elle est terminée.</p>`:''}</div>
     <div class="dlfr118-actions">${col.published===false?`<button class="btn dlfr150-publish" type="button" data-v112-act="cat-col-publish" data-on="1" ${dis}>✓ Publier la collection</button>`:`<button class="btn subtle" type="button" data-v112-act="cat-col-publish" data-on="0" ${dis}>🚧 Repasser en préparation</button>`}<button class="btn" type="button" data-v112-act="cat-card-new" ${dis}>+ Nouvelle carte</button><button class="btn subtle" type="button" data-v112-act="cat-col-edit" ${dis}>✎ Modifier</button><button class="btn subtle" type="button" data-v112-act="cat-import" ${dis}>↑ Importer des cartes (JSON)</button><input type="file" id="dlfr118ImportFile" accept="application/json,.json" hidden><button class="btn danger" type="button" data-v112-act="cat-col-delete" ${dis}>Supprimer la collection</button></div></div>
     ${cardForm}
     <div class="dlfr118-grid">${list.map(c=>`<button type="button" class="dlfr112-pick ${catalog.editCard===c.id?'is-current':''}" data-v112-act="cat-card" data-id="${c.id}" aria-label="Modifier ${esc(c.name)}">${figure(c,data,true,{finish:0,stars:0})}<span class="dlfr112-pick-label">#${idString(c.id)}${c.inPacks?'':' · hors boosters'}</span></button>`).join('')||'<p class="dlfr117-empty">Collection vide. Ajoute une première carte.</p>'}</div>`
    :(cardForm||'<p class="dlfr117-empty">Crée une collection pour commencer.</p>')}</div></div>
  ${suggestView()}
 </section></div>`;
}

// ============================================================ PAGE
function tabs(){const t=[...(window.DLFR_CARDS?[['official','★ Collection']]:[]),...(window.DLFR_ADVENT?[['advent','🎄 Avent']]:[]),...(window.DLFR_SEASON?[['boss','⚔ Boss'],['season','🏆 Saison']]:[]),['packs','✦ Boosters'],['chapters','🧭 Chapitres'],['expeditions','Expéditions'],['talents','Talents'],['forge','Forge'],['goals','Objectifs'],['album','Album'],['collection','Ma collection']];return editor?t.concat([['catalog','✎ Catalogue'],['exchanges','Échanges fictifs'],['control','Outils de test']]):t;}
function filtered(){return shownCards().filter(c=>(view!=='collection'||has(c.id)||filter==='missing')&&(filter==='all'||filter==='owned'&&has(c.id)||filter==='missing'&&!has(c.id)||filter===c.type||filter==='col:'+c.collectionId)&&normalize(c.name+' '+c.series+' '+rarity(c)).includes(normalize(query)));}
function albumView(data){
 const current=get(selected)||CARDS[0];
 if(!current)return '<section class="dlfr112-panel"><p>Le catalogue est vide. Ajoute des cartes dans l’onglet ✎ Catalogue.</p></section>';
 const cur=owned.get(current.id),currentCount=cur?.count||0;
 return `${ladder()}<div class="dlfr112-album-layout"><div class="dlfr112-gallery-pane"><div class="dlfr112-filters"><label>Affichage<select data-v112-field="filter">${[['all','Toutes les cartes'],['owned','Possédées'],['missing','Manquantes'],['level','Niveaux'],['player','Joueurs'],['dlfr','DLFR'],...COLLECTIONS.map(c=>['col:'+c.id,'Collection · '+c.name])].map(([v,t])=>`<option value="${esc(v)}" ${filter===v?'selected':''}>${esc(t)}</option>`).join('')}</select></label><label>Rechercher<input type="search" data-v112-field="search" placeholder="Nom ou rareté…" value="${esc(query)}"></label></div><div class="dlfr112-grid">${filtered().map(c=>cardItem(c,data)).join('')||'<p class="muted">Aucune carte pour ce filtre.</p>'}</div></div><aside class="dlfr112-detail"><div class="dlfr112-detail-inner">${figure(current,data)}<h3>${esc(current.name)}</h3><p>#${idString(current.id)} · ${esc(current.series)}${cur?` · ${FIN_NAME[cur.finish||0]} · ★${cur.stars||0}`:''}${current.inPacks?'':' · hors boosters'}</p>${current.description?`<p class="dlfr113-description">${esc(current.description)}</p>`:''}<div class="dlfr112-detail-actions">${editor?`<span class="dlfr141-testtag" title="Outils de test réservés au staff : la partie n’est plus sauvegardée après leur utilisation">Outils de test (partie non sauvegardée) :</span><button type="button" class="btn" data-v112-act="give" data-id="${current.id}">🧪 + Recevoir 1 carte</button><button type="button" class="btn subtle" data-v112-act="take" data-id="${current.id}" ${currentCount?'':'disabled'}>🧪 − Retirer 1</button><button type="button" class="btn subtle" data-v112-act="holo" data-id="${current.id}" ${currentCount?'':'disabled'}>🧪 ✧ Finition suivante (${FIN_NAME[((cur?.finish||0)+1)%4]})</button>`:''}${currentCount?`<button type="button" class="btn subtle" data-v112-act="forge-open" data-id="${current.id}">⚒ Ouvrir dans la Forge</button>`:''}${editor&&DB&&catalog.status==='ready'?`<button type="button" class="btn subtle" data-v112-act="cat-card-open" data-id="${current.id}">✎ Modifier dans le catalogue</button>`:''}</div>${editor?"<small>Outils de test : utiliser + / − / finition passe la session en mode test (non sauvegardée).</small>":''}</div></aside></div>`;
}
function viewPage(data){
 const OFFICIAL='<div id="dlfr127Cards" class="dlfr127-cards is-embedded" aria-live="polite"><div class="dlfr127-loading">Chargement de ta collection…</div></div>';
 if(!gate)return `<section class="dlfr112 dlfr117" id="dlfr112Lab"><div class="dlfr112-header"><div><div class="dlfr112-eyebrow">DLFR CARDS</div><h1>DLFR Cards</h1><p>Collections, expéditions, talents, Forge et quêtes.</p></div></div>${OFFICIAL}</section>`;
 if(view==='official'&&!window.DLFR_CARDS)view='packs';
 if(view==='advent'&&!window.DLFR_ADVENT)view='official';
 if((view==='boss'||view==='season')&&!window.DLFR_SEASON)view='official';
 if(view==='trades')view='official'; // V169 : échanges retirés (jeu solo)
 if(!editor&&['catalog','exchanges','control'].includes(view))view='album';
 const current=get(selected)||CARDS[0];
 const prog=['packs','chapters','expeditions','talents','forge','goals'].includes(view),total=Math.max(1,shownCards().length);
 const src=catalog.status==='loading'?'chargement…':catalog.status==='ready'||catalog.status==='empty'?'':'hors ligne';
 return `<section class="dlfr112 dlfr117" id="dlfr112Lab">
  <div class="dlfr112-header"><div><div class="dlfr112-eyebrow">DLFR CARDS${view==='official'?' · COLLECTION':view==='advent'?' · CALENDRIER DE L’AVENT':view==='boss'?' · BOSS COMMUNAUTAIRE':view==='season'?' · SAISON':view==='trades'?' · ÉCHANGES':' · MODE AVENTURE'}</div><h1>DLFR Cards</h1><p>${shownCards().length} cartes · ${COLLECTIONS.length} collections${src?` · ${src}`:''}${progress.title?` · <b>${esc(progress.title)}</b>`:''}</p></div><span class="dlfr141-savebox"><span class="dlfr112-demo-label ${SAVE.tainted||SAVE.conflict?'is-warn':''}" id="dlfr129Save" aria-live="polite" title="Sauvegarde du mode Aventure">Aventure · ${esc(saveLabel())}</span>${SAVE.tainted&&userId?'<button type="button" class="btn small dlfr141-leave" data-v112-act="leave-test">↺ Revenir à ma partie</button>':''}</span></div>
  <p class="dlfr129-intro">${view==='trades'?'Échange tes doublons avec les autres collectionneurs.':view==='boss'?'Un démon de la liste à abattre ensemble chaque semaine.':view==='season'?'Une saison de 4 semaines : 28 paliers de récompenses et une carte exclusive.':view==='advent'?'Une case par jour du 1er au 25 décembre : cartes <b>Festive</b> et Wayllings dorés. Les jours ratés se rattrapent jusqu’au 31.':view==='official'?'Ta collection, ta vitrine et le classement. Les autres onglets, c’est le mode Aventure.':'Boosters avec tes éclats ◆, expéditions, Forge et talents. Les cartes gagnées vont dans ta collection.'}</p>
  ${antiBanner()}
  <div class="dlfr112-toolbar">${['official','advent','boss','season','trades'].includes(view)?'':`<div class="dlfr112-summary"><b>Aventure · ${status()}</b><span>Progression : ${Math.round(inventoryUnique()/total*100)} %</span><div class="dlfr112-meter"><span style="width:${inventoryUnique()/total*100}%"></span></div></div>`}<div class="dlfr112-modes" role="tablist" aria-label="Sections du mode Aventure">${tabs().map(([id,title])=>`<button type="button" role="tab" aria-selected="${view===id}" class="${view===id?'active':''}" data-v112-act="mode" data-mode="${id}">${title}${id==='expeditions'&&progress.camps.some(c=>Date.now()>=c.end)?' <i class="dlfr117-dot"></i>':''}${id==='goals'&&progress.quests.some(q=>q.have>=q.target)?' <i class="dlfr117-dot"></i>':''}</button>`).join('')}</div></div>
  ${view==='official'?OFFICIAL:''}
  ${view==='advent'?'<div id="dlfr139Advent" class="dlfr139-advent" aria-live="polite"><div class="dlfr127-loading">Chargement du calendrier…</div></div>':''}
  ${view==='boss'?'<div id="dlfr160Boss" aria-live="polite"><div class="dlfr127-loading">Chargement du boss…</div></div>':''}
  ${view==='season'?'<div id="dlfr160Season" aria-live="polite"><div class="dlfr127-loading">Chargement de la saison…</div></div>':''}
  ${view==='trades'?'<div id="dlfr163Trades"><div class="dlfr127-loading">Chargement des échanges…</div></div>':''}
  ${prog?progressionPage(data):''}
  ${view==='album'||view==='collection'?albumView(data):''}
  ${view==='catalog'?catalogView(data):''}
  ${view==='exchanges'?`<section class="dlfr112-panel"><div class="dlfr112-section-head"><h2>Échanges fictifs</h2><p>Simulation locale avec un partenaire imaginaire. Impossible d'impliquer ou de modifier le compte d'un autre joueur.</p></div><div class="dlfr112-trade"><label>Tu donnes<select id="dlfr112TradeGive">${CARDS.filter(c=>has(c.id)).map(optionCard).join('')||'<option value="">Aucune carte possédée</option>'}</select></label><div class="dlfr112-arrows">⇄</div><label>Tu reçois<select id="dlfr112TradeGet">${CARDS.map(optionCard).join('')}</select></label></div><button class="btn" type="button" data-v112-act="trade" ${inventoryUnique()===0?'disabled':''}>Simuler l'échange</button><p class="muted small">Aucun échange n'est enregistré. Le partenaire est fictif.</p></section>`:''}
  ${view==='control'?`<section class="dlfr112-panel"><div class="dlfr112-section-head"><h2>Console de test · Pouvoirs admin</h2><p>Pour tester la progression. Le catalogue n’est pas modifié.</p></div>
   <div class="dlfr112-admin-actions"><button class="btn" type="button" data-v112-act="all">✦ Recevoir toutes les cartes</button><button class="btn subtle" type="button" data-v112-act="holo-all">✧ Tout passer en Holo</button><button class="btn subtle" type="button" data-v112-act="cheat" data-what="shards">+1 000 ◆</button><button class="btn subtle" type="button" data-v112-act="cheat" data-what="dust">+500 ✧</button><button class="btn subtle" type="button" data-v112-act="cheat" data-what="keys">+5 🔑</button><button class="btn subtle" type="button" data-v112-act="cheat" data-what="levels">+5 niveaux</button><button class="btn subtle" type="button" data-v112-act="cooldown-skip">Terminer les expéditions</button><button class="btn subtle" type="button" data-v112-act="skills-reset">Réinitialiser les talents (remboursement)</button><button class="btn danger" type="button" data-v112-act="reset">Réinitialiser la progression de test</button></div>
   ${current?`<div class="dlfr112-admin-edit"><label>Carte à modifier<select id="dlfr112CardPick">${CARDS.map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${idString(c.id)} · ${esc(c.name)}</option>`).join('')}</select></label><label>Rareté fictive (test, non enregistrée)<select id="dlfr112Rarity">${rarities.map(r=>`<option value="${esc(r)}" ${r===rarity(current)?'selected':''}>${esc(r)}</option>`).join('')}</select></label><button class="btn subtle" type="button" data-v112-act="rarity">Tester la rareté</button></div>`:''}
   <div class="dlfr112-admin-edit"><label>Simulateur d'équilibrage (rien n'est donné)<select id="dlfr117SimPack">${allPacks().map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label><button class="btn subtle" type="button" data-v112-act="simulate">Simuler 1 000 paquets</button></div>
   <p class="dlfr117-sim" id="dlfr117SimOut"></p></section>`:''}
  ${journal.length?`<section class="dlfr112-panel dlfr112-log"><div class="dlfr112-section-head"><h2>Historique de cette session</h2><span class="muted small">Effacé au rechargement</span></div>${journal.slice(-6).reverse().map(x=>`<p>• ${esc(x)}</p>`).join('')}</section>`:''}
 </section>`;
}
async function loadSave(){
 if(!DB||!userId)return;
 const uid=userId;
 try{
  if(catalog.status==='local'||catalog.status==='loading')await loadCatalog();
  const {data,error}=await DB.rpc('dlfr_adventure_load');if(error)throw error;
  if(uid!==userId)return;
  reset();SAVE.unreadable=false;
  if(data?.save){try{restoreSession(data.save,false);}catch(e){console.warn('[DLFR Cards] Sauvegarde illisible :',e);SAVE.unreadable=true;SAVE.status='⚠ Sauvegarde illisible : rien n’a été écrasé. Préviens l’équipe du site.';}} // V172 : ne jamais écraser une partie qu'on n'arrive pas à lire
  else{ensureQuests();}
  SAVE.version=Number(data?.version)||0;
  // V138 — collection unique : import unique de l'ancienne collection Aventure, puis le serveur fait foi.
  const st=await DB.rpc('dlfr_cards_status');if(st.error)throw st.error;if(uid!==userId)return;
  let inv=st.data?.inventory||{};
  if(!st.data?.adv_imported){const delta={};for(const [id,v] of owned)if(v.count>0)delta[id]=v.count;
   const im=await DB.rpc('dlfr_adventure_sync',{p_delta:delta,p_import:true});if(im.error)throw im.error;inv=im.data?.inventory||inv;
   if(Object.keys(delta).length)toast('DLFR Cards','Ta collection Aventure a rejoint ta collection unique.','info');}
  else{const dr=await DB.rpc('dlfr_adventure_sync',{p_delta:{},p_import:false}); // V141 : livre les cartes mises de côté
   if(!dr.error&&uid===userId){inv=dr.data?.inventory||inv;queueTotal=Number(dr.data?.queue_total)||0;if(Number(dr.data?.delivered)>0)toast('DLFR Cards',`${dr.data.delivered} carte(s) mises de côté ont rejoint ta collection.`,'info');}}
  setServerInventory(inv,true);
  SAVE.loaded=true;SAVE.conflict=!!SAVE.unreadable;SAVE.status=SAVE.status||'✓ Sauvegardé';
  if(!ANTI.status)setTimeout(antiStatus,0);
 }catch(e){SAVE.status='Sauvegarde indisponible : ta progression ne sera pas enregistrée.';console.warn('[DLFR Cards] Chargement :',e);}
 repaint();
}
function setServerInventory(inv,replace){
 const next=new Map(Object.entries(inv||{}).map(([k,v])=>[Number(k),Number(v)||0]));
 const ids=new Set([...next.keys(),...(serverCounts?serverCounts.keys():[]),...(replace?owned.keys():[])]);
 for(const id of ids){
  const nv=next.get(id)||0,ov=serverCounts?.get(id)||0;
  const cur=owned.get(id);
  const count=replace?nv:Math.max(0,(cur?.count||0)+(nv-ov)); // garde les changements locaux en attente
  if(count>0){if(get(id)){const x=cur||{count:0,finish:0,stars:0};x.count=count;owned.set(id,x);}}else owned.delete(id);
 }
 serverCounts=next;
}
async function syncCards(){
 if(!serverCounts||!DB)return;
 if(catalog.status!=='ready')return; // V164 : jamais de synchronisation sans catalogue complet
 const delta={};const ids=new Set([...owned.keys(),...serverCounts.keys()]);
 for(const id of ids){if(!get(id))continue; /* carte inconnue du navigateur (collection en préparation…) : on n'y touche pas */const d=(owned.get(id)?.count||0)-(serverCounts.get(id)||0);if(d)delta[id]=d;}
 if(!Object.keys(delta).length)return;
 const {data,error}=await DB.rpc('dlfr_adventure_sync',{p_delta:delta,p_import:false});if(error)throw error;
 const sent=new Map(Object.entries(delta).map(([k,v])=>[Number(k),v]));
 // Le serveur fait foi pour ce qui a été envoyé ; on conserve ce qui a changé pendant l'envoi.
 const next=new Map(Object.entries(data?.inventory||{}).map(([k,v])=>[Number(k),Number(v)||0]));
 for(const id of new Set([...next.keys(),...sent.keys(),...serverCounts.keys()])){
  const expected=(serverCounts.get(id)||0)+(sent.get(id)||0),pendingLocal=(owned.get(id)?.count||0)-expected,count=Math.max(0,(next.get(id)||0)+pendingLocal);
  const cur=owned.get(id);if(count>0){if(get(id)){const x=cur||{count:0,finish:0,stars:0};x.count=count;owned.set(id,x);}}else owned.delete(id);
 }
 serverCounts=next;
 if(Number(data?.capped)>0)toast('DLFR Cards',`Limite de cartes atteinte pour aujourd’hui : ${data.capped} carte(s) non ajoutée(s). Reviens demain !`,'info');
 if(Number(data?.delivered)>0)toast('DLFR Cards',`${data.delivered} carte(s) mises de côté ont rejoint ta collection.`,'info');
 queueTotal=Number(data?.queue_total)||0;
 for(const b of data?.bonuses||[])toast('Collection complète !',`${b.collection} : +${b.coins} Wayllings dorés`,'achievement');
 if(Number(data?.capped)>0||Number(data?.delivered)>0||(data?.bonuses||[]).length)setTimeout(repaint,0);
 window.DLFR_CARDS?.invalidate?.();
}
function scheduleSave(){
 if(!SAVE.loaded||SAVE.tainted||SAVE.conflict||!DB||!userId)return;
 const d=SAVE.urgent?60:1200;SAVE.urgent=false;
 clearTimeout(SAVE.timer);SAVE.timer=setTimeout(flushSave,d);setSaveLabel('Sauvegarde…');
}
async function flushSave(){
 SAVE.timer=0;if(SAVE.tainted||SAVE.conflict||!SAVE.loaded){setSaveLabel(saveLabel());return;}
 if(SAVE.saving){SAVE.pending=true;return;}
 SAVE.saving=true;
 try{await syncCards();const {data,error}=await DB.rpc('dlfr_adventure_save',{p_save:sessionObject(),p_version:SAVE.version});
  if(error){if(/conflict/.test(error.message||'')){SAVE.conflict=true;SAVE.status='⚠ Progression modifiée ailleurs : recharge la page.';antiStatus();}else throw error;}
  else if(Number(data)===0){SAVE.conflict=true;SAVE.status='⚠ Progression remise à zéro : recharge la page.';antiStatus();}
  else{SAVE.version=Number(data)||SAVE.version+1;SAVE.status='✓ Sauvegardé';}
 }catch(e){if(/suspendu/i.test(e?.message||'')){SAVE.conflict=true;SAVE.status='⛔ Compte suspendu du jeu de cartes';antiStatus();}else{SAVE.status='⚠ Échec de la sauvegarde, nouvel essai bientôt.';setTimeout(scheduleSave,8000);}}
 finally{SAVE.saving=false;setSaveLabel(saveLabel());if(SAVE.pending){SAVE.pending=false;scheduleSave();}}
}
function setSaveLabel(t){const el=document.getElementById('dlfr129Save');if(el){el.textContent=t;el.classList.toggle('is-warn',SAVE.tainted||SAVE.conflict);}}
function saveLabel(){return SAVE.tainted?'SESSION DE TEST · NON SAUVEGARDÉE':!SAVE.loaded?(userId?'Chargement de ta partie…':'Connecte-toi pour sauvegarder'):SAVE.status||'✓ Sauvegardé';}
window.addEventListener('beforeunload',e=>{if(SAVE.timer&&SAVE.loaded&&!SAVE.tainted&&!SAVE.conflict&&!SAVE.saving&&document.getElementById('dlfr112Lab')){clearTimeout(SAVE.timer);flushSave();}});
function repaint(){scheduleSave();const p=document.getElementById('dlfr112Lab');if(p){const y=window.scrollY;p.outerHTML=viewPage(srcData());window.scrollTo(0,y);if(document.getElementById('dlfr127Cards'))window.DLFR_CARDS?.refresh?.();if(document.getElementById('dlfr139Advent'))window.DLFR_ADVENT?.refresh?.();if(document.getElementById('dlfr160Boss')||document.getElementById('dlfr160Season'))window.DLFR_SEASON?.refresh?.();if(document.getElementById('dlfr163Trades'))window.DLFR_TRADES?.refresh?.();}}
function reset(){owned.clear();overrides.clear();journal.length=0;selected=CARDS[0]?.id||0;query='';filter='all';Object.assign(progress,freshProgress());forgeSel=0;if(OPEN.st){OPEN.st=null;unmountOpening(true);}}
// V165 — anti-autoclicker / macros. 3 alertes en 24 h = cartes Ultra et Secrètes retirées (côté serveur).
const ANTI_ZONE='#dlfr112Lab,#dlfr117Open,#dlfr160Boss,#dlfr160Season,#dlfr163Trades,#dlfr139Advent';
function antiBlock(e){e.preventDefault();e.stopImmediatePropagation();}
function antiClick(e){
 const zone=e.target?.closest?.(ANTI_ZONE);if(!zone||!gate)return;
 if(ANTI.status?.banned){if(e.target.closest('button,[data-v112-act]')){antiBlock(e);toast('DLFR Cards',ANTI.status.banned,'info');}return;}
 if(!e.isTrusted){if(e.target.closest('input,label,a[download]')||!e.target.closest('button,[data-v112-act],[data-mode]'))return;antiBlock(e);antiFlag('synthetic','clic généré par un script');return;}
 const now=performance.now();
 if(now<ANTI.lock){antiBlock(e);return;}
 if(e.detail===0){ // clic au clavier (Entrée / Espace) : touche maintenue = répétition automatique, on la freine
  if(now-ANTI.kb<180){antiBlock(e);return;}ANTI.kb=now;return;}
 const t=ANTI.t;t.push(now);if(t.length>40)t.shift();
 if(t.length>=25){const iv=[];for(let i=t.length-24;i<t.length;i++)iv.push(t[i]-t[i-1]);
  const m=iv.reduce((a,b)=>a+b,0)/iv.length;
  if(m<450){const sd=Math.sqrt(iv.reduce((a,b)=>a+(b-m)**2,0)/iv.length);
   if(sd<Math.max(5,m*.035)){antiFlag('regular',`intervalle ${Math.round(m)} ms, écart ${sd.toFixed(1)} ms`);antiBlock(e);return;}}}
 const n3=t.filter(x=>now-x<3000).length;
 if(n3>=48){antiFlag('burst',`${n3} clics en 3 s`);antiBlock(e);}
}
function antiFlag(kind,detail){
 ANTI.lock=performance.now()+20000;ANTI.t.length=0;
 toast('⚠ Clics automatiques détectés','Actions bloquées 20 s. Autoclicker et macros sont interdits : au bout de 3 alertes en 24 h, tes cartes Ultra et Secrètes te sont retirées.','info');
 if(!DB||!userId)return;
 DB.rpc('dlfr_cards_report',{p_kind:kind,p_detail:detail}).then(({data})=>{if(data)antiStatus();}).catch(()=>{});
}
async function antiStatus(){
 if(!DB||!userId)return;
 try{DB.rpc('dlfr_cards_gifts_open').then(({data})=>{const l=Array.isArray(data)?data:[];if(l.length!==GIFT.list.length){GIFT.list=l;repaint();}}).catch(()=>{});
  const {data,error}=await DB.rpc('dlfr_cards_my_status');if(error)return;ANTI.status=data||null;
  const rs=data?.reset;
  if(rs?.at&&rs.at!==ANTI.seenReset){
   ANTI.seenReset=rs.at;try{localStorage.setItem('dlfr-cards-reset-seen',rs.at);}catch(e){}
   toast('Sanction anti-triche',rs.reason,'info');
   if(SAVE.loaded){clearTimeout(SAVE.timer);SAVE.timer=0;SAVE.loaded=false;serverCounts=null;await loadSave();return;}
  }
  repaint();
 }catch(e){}
}
function giftPanel(){
 const RO=['Ultra','Mythique','Légendaire','Épique','Rare','Commun'],data=srcData();
 if(GIFT.result){const all=GIFT.result.flat().map(x=>({x,c:get(Number(x.id))})).sort((a,b)=>RO.indexOf(a.x.rarity)-RO.indexOf(b.x.rarity));
  const counts=RO.map(r=>[r,all.filter(a=>a.x.rarity===r).length]).filter(([,n])=>n);
  return `<section class="dlfr166-gift is-open"><div><b>🎁 Tes ${GIFT.result.length} packs sont ouverts !</b><p>${counts.map(([r,n])=>`${n} ${esc(r)}`).join(' · ')} · tout est déjà dans ta collection.</p></div>
   <div class="dlfr166-cards">${all.map(({x,c})=>c?`<div class="dlfr166-card">${figure(c,data,true)}</div>`:`<div class="dlfr166-card is-txt">${esc(x.name)} <small>${esc(x.rarity)}</small></div>`).join('')}</div>
   <button type="button" class="btn small subtle" data-v112-act="gift-close">Fermer</button></section>`;}
 const g=GIFT.list[0];if(!g)return '';
 return `<section class="dlfr166-gift"><div><b>🎁 ${esc(g.title)} : ${g.packs} packs de ${g.per_pack} cartes</b><p>${esc(g.message)} À récupérer avant le ${new Date(g.expires).toLocaleDateString('fr-FR',{day:'numeric',month:'long'})}.</p></div>
  <button type="button" class="btn" data-v112-act="gift-claim" data-id="${g.id}" ${GIFT.busy?'disabled':''}>${GIFT.busy?'Ouverture…':'Ouvrir mes packs'}</button></section>`;
}
async function giftClaim(id){
 if(GIFT.busy||!DB||!userId)return;GIFT.busy=true;repaint();
 try{const {data,error}=await DB.rpc('dlfr_cards_gift_claim',{p_gift:id});if(error)throw error;
  GIFT.result=data?.packs||[];GIFT.list=GIFT.list.filter(g=>g.id!==id);
  if(data?.inventory)setServerInventory(data.inventory,false);window.DLFR_CARDS?.invalidate?.();
  toast('🎁 Packs ouverts',`${GIFT.result.flat().length} cartes ajoutées à ta collection.`,'achievement');
  if(data?.badge==='crise-tcg')toast('🃏 Nouveau badge','« A traversé la grande crise du TCG » est sur ta fiche joueur.','achievement');
 }catch(e){toast('Packs offerts',e?.message||'Impossible pour le moment.','info');}
 finally{GIFT.busy=false;repaint();}
}
function antiBanner(){
 return giftPanel(); // V169 : jeu solo, plus de bandeaux de sanction
 const st=ANTI.status;if(!st)return giftPanel();
 if(st.banned)return `<div class="dlfr165-ban">⛔ ${esc(st.banned)}</div>`;
 const gp=giftPanel()+(st.shadow?`<div class="dlfr165-ban is-shadow">👁 Compte restreint (${esc(st.shadow)}) : tu peux continuer à jouer, mais tu n’apparais plus dans les classements et ta vitrine est masquée.</div>`:'');
 const rs=st.reset;if(rs?.at&&Date.now()-Date.parse(rs.at)<72*3600000)return gp+`<div class="dlfr165-ban is-reset">⚠ ${new Date(rs.at).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} · ${esc(rs.reason)}.</div>`;
 if(st.strikes>0)return gp+`<div class="dlfr165-ban is-warn">⚠ ${st.strikes} alerte${st.strikes>1?'s':''} pour clics automatiques ou rythme impossible ces dernières 24 h. À 3, tes cartes Ultra et Secrètes te sont retirées.</div>`;
 return gp;
}
// V169 : jeu solo, plus de détection d'autoclicker (les quotas serveur restent).
// V165 — panneau Sanctions (équipe)
const SANC={data:null,busy:false,err:''};
function sancWhen(t){return t?new Date(t).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';}
function sanctionsPanel(){
 const d=SANC.data,row=(x,extra)=>`<li><b>${esc(x.name||x.player_key||'?')}</b> ${extra}</li>`;
 return `<section class="dlfr112-panel dlfr165-sanc"><div class="dlfr112-section-head"><h2>Anti-triche · Sanctions</h2><p>Détection automatique : clics générés par script, autoclicker, rafales, plus de 1 200 boosters ou 20 chapitres en une heure, cartes ajoutées au-delà des quotas du serveur. 3 alertes en 24 h = cartes Ultra et Secrètes retirées ; à la 2e sanction = soft ban automatique.</p></div>
  <div class="dlfr112-admin-edit"><label>Pseudo de la fiche joueur<input id="dlfr165SancKey" type="text" maxlength="60" placeholder="ex. zuperxivi"></label><label>Raison<input id="dlfr165SancReason" type="text" maxlength="120" placeholder="autoclicker"></label><label>Durée du ban (jours, vide = définitif)<input id="dlfr165SancDays" type="number" min="1" max="3650"></label></div>
  <div class="dlfr112-admin-actions"><button class="btn subtle" type="button" data-v112-act="sanc-do" data-what="soft">Retirer Ultra + Secrètes</button><button class="btn subtle" type="button" data-v112-act="sanc-do" data-what="reset">Remise à zéro totale</button><button class="btn subtle" type="button" data-v112-act="sanc-do" data-what="shadow">Soft ban (masqué)</button><button class="btn subtle" type="button" data-v112-act="sanc-do" data-what="unshadow">Lever le soft ban</button><button class="btn subtle" type="button" data-v112-act="sanc-do" data-what="ban">Bannir du jeu</button><button class="btn subtle" type="button" data-v112-act="sanc-do" data-what="unban">Lever le ban / effacer les alertes</button><button class="btn" type="button" data-v112-act="sanc-load">${d?'↻ Actualiser':'Afficher les alertes'}</button></div>
  ${SANC.err?`<p class="dlfr165-err">${esc(SANC.err)}</p>`:''}
  ${d?`<div class="dlfr165-cols">
   <div><h3>Soft ban (masqués du classement)</h3><ul>${(d.shadows||[]).map(x=>row(x,`· ${sancWhen(x.at)} · ${esc(x.reason)}`)).join('')||'<li class="muted">Aucun</li>'}</ul></div>
   <div><h3>Bans en cours</h3><ul>${d.bans.map(x=>row(x,`· ${x.until?'jusqu’au '+sancWhen(x.until):'définitif'} · ${esc(x.reason)}`)).join('')||'<li class="muted">Aucun</li>'}</ul></div>
   <div><h3>Sanctions récentes</h3><ul>${d.resets.map(x=>row(x,`· ${sancWhen(x.at)} · ${esc(x.reason)}`)).join('')||'<li class="muted">Aucune</li>'}</ul></div>
   <div><h3>Alertes (7 jours)</h3><ul>${d.strikes.map(x=>row(x,`· ${sancWhen(x.at)} · ${esc(String(x.kind).replace(':sanctionné',' (sanctionné)'))} · ${esc(x.detail||'')}`)).join('')||'<li class="muted">Aucune</li>'}</ul></div>
   <div><h3>Plus gros rythmes (48 h, par heure)</h3><ul>${d.top_rate.map(x=>row(x,`· ${fmt(x.packs)} boosters · ${fmt(x.chapters||0)} chapitres`)).join('')||'<li class="muted">Rien</li>'}</ul></div></div>`:''}</section>`;
}
async function sancLoad(){if(!DB)return;SANC.err='';const {data,error}=await DB.rpc('dlfr_cards_sanctions');if(error){SANC.err=error.message;}else SANC.data=data;repaint();}
async function sancDo(what){
 const key=(document.getElementById('dlfr165SancKey')?.value||'').trim(),reason=(document.getElementById('dlfr165SancReason')?.value||'').trim(),days=Number(document.getElementById('dlfr165SancDays')?.value)||null;
 if(!key){SANC.err='Indique le pseudo de la fiche joueur.';repaint();return;}
 const label={shadow:'le passer en soft ban (il joue mais disparaît des classements, vitrine masquée)',unshadow:'lever son soft ban',soft:'retirer ses cartes Ultra et Secrètes',reset:'REMETTRE À ZÉRO toute sa partie Aventure (irréversible)',ban:`le bannir du jeu de cartes ${days?days+' jour(s)':'DÉFINITIVEMENT'}`,unban:'lever son ban et effacer ses alertes'}[what];
 if(!label||!confirm(`${key} : ${label} ?`))return;
 const {error}=await DB.rpc('dlfr_cards_sanction_set',{p_player_key:key,p_action:what,p_days:what==='ban'?days:null,p_reason:reason||null});
 if(error){SANC.err=error.message;repaint();return;}
 toast('Sanctions',`${key} : fait.`,'info');await sancLoad();
}
function handleClick(event){
 const b=event.target.closest?.('[data-v112-act]');if(!b||!gate)return;
 if(!document.getElementById('dlfr112Lab')||b.closest('#dlfr117Open'))return;
 event.preventDefault();
 const act=b.dataset.v112Act;
 const TEST=['give','take','holo','all','holo-all','cheat','cooldown-skip','skills-reset','reset','rarity','trade','open-session-import'];
 if(TEST.includes(act)||act.startsWith('cat-')){if(!editor)return;if(TEST.includes(act)&&act!=='open-session-import'){if(!SAVE.tainted&&SAVE.loaded&&!window.confirm('Outil de test : à partir de maintenant, ta partie Aventure ne sera plus sauvegardée (tout ce que tu feras sera perdu au rechargement).\n\nTa vraie partie reste intacte : tu pourras la récupérer avec « Revenir à ma partie ».\n\nContinuer ?'))return;SAVE.tainted=true;clearTimeout(SAVE.timer);SAVE.timer=0;repaint();}}
 if(act==='gift-claim'){giftClaim(Number(b.dataset.id));return;}
 if(act==='gift-close'){GIFT.result=null;repaint();return;}
 if(act==='sanc-load'||act==='sanc-do'){if(!editor)return;if(act==='sanc-load')sancLoad();else sancDo(b.dataset.what);return;}
 if(act==='leave-test'){SAVE.tainted=false;SAVE.loaded=false;serverCounts=null;setSaveLabel(saveLabel());loadSave().then(()=>toast('DLFR Cards','Ta partie sauvegardée est de retour.','info'));return;}
 if(act.startsWith('cat-')){
  if(act==='cat-reload'){loadCatalog();return;}
  if(act==='cat-export'){exportCatalog();return;}
  if(act==='cat-import'){document.getElementById('dlfr118ImportFile')?.click();return;}
  if(catalog.busy)return;
  if(act==='cat-col'){catalog.selCol=Number(b.dataset.id);catalog.editCol=null;catalog.colDraft=null;if(catalog.editCard==='new'&&catalog.draft)catalog.draft.collection=catalog.selCol;}
  else if(act==='cat-col-new')openColEditor('new');
  else if(act==='cat-col-edit')openColEditor(catalog.selCol);
  else if(act==='cat-col-cancel'){catalog.editCol=null;catalog.colDraft=null;}
  else if(act==='cat-col-delete'){deleteCollection();return;}
  else if(act==='cat-sugg-toggle'){SUGG.open=!SUGG.open;}
  else if(act==='cat-sugg-src'){SUGG.src=b.dataset.src;SUGG.sel.clear();}
  else if(act==='cat-sugg-all'){for(const x of suggestions())if(!x.dup)SUGG.sel.add(x.id);}
  else if(act==='cat-sugg-none'){SUGG.sel.clear();}
  else if(act==='cat-sugg-create'){createSuggestions();return;}
  else if(act==='cat-col-publish'){const c=colOf(catalog.selCol),on=b.dataset.on==='1';if(!c)return;
   if(!confirm(on?`Publier « ${c.name} » ?\n\nSes ${cardsOf(c.id).length} carte(s) deviennent visibles pour tous les joueurs et peuvent sortir des boosters.`:`Repasser « ${c.name} » en préparation ?\n\nElle disparaîtra pour les joueurs (les cartes déjà obtenues restent dans leur inventaire).`))return;
   withBusy(on?'Publication…':'Mise en préparation…',async()=>{const {error}=await DB.rpc('dlfr_cards_admin_publish_collection',{p_id:c.id,p_published:on});if(error)throw error;log(`${c.name} : ${on?'publiée':'en préparation'}`);await loadCatalog();setMsg(on?'Collection publiée ✓':'Collection repassée en préparation','ok');});return;}
  else if(act==='cat-card-new')openCardEditor('new');
  else if(act==='cat-card'){openCardEditor(Number(b.dataset.id));}
  else if(act==='cat-card-open'){const c=get(b.dataset.id);if(!c)return;view='catalog';catalog.selCol=c.collectionId;openCardEditor(c.id);}
  else if(act==='cat-card-cancel'){catalog.editCard=null;catalog.draft=null;catalog.pendingFile=null;}
  else if(act==='cat-card-delete'){deleteCard();return;}
  else if(act==='cat-clear-image'){if(catalog.draft){catalog.draft.imageUrl='';catalog.draft.preview='';}catalog.pendingFile=null;}
  else return;
  repaint();return;
 }
 if(act==='mode'){view=b.dataset.mode;filter='all';query='';if(view==='catalog'&&DB&&catalog.status==='local')loadCatalog();}
 else if(act==='select'){selected=Number(b.dataset.id);}
 else if(act==='start-exp'){startExpedition(b.dataset.dest);}
 else if(act==='claim-exp'){claimExpedition(Number(b.dataset.index));}
 else if(act==='claim-all'){claimAllExpeditions();}
 else if(act==='skill'){buySkill(b.dataset.skill);}
 else if(act==='open-pack'){openPack(b.dataset.pack);return;}
 else if(act==='forge-select'){forgeSel=Number(b.dataset.id);}
 else if(act==='forge-open'){forgeSel=Number(b.dataset.id);view='forge';}
 else if(act==='upgrade'){upgradeCard(b.dataset.id);}
 else if(act==='recycle'){const n=recycleSpare();if(!n)toast('Forge','Aucun doublon à recycler (seulement les cartes ★10).','info');}
 else if(act==='goals-tab'){goalsTab=b.dataset.tab;}
 else if(act==='ch-team'){const id=Number(b.dataset.id);if(chTeam.includes(id))chTeam=chTeam.filter(x=>x!==id);else if(chTeam.length<3)chTeam.push(id);}
 else if(act==='ch-start'){startChapter(b.dataset.id);}
 else if(act==='ch-choose'){chChoose(Number(b.dataset.k));}
 else if(act==='ch-arm'){chArm(Number(b.dataset.id));}
 else if(act==='ch-abandon'){chAbandon();}
 else if(act==='contract-claim'){claimContract(b.dataset.id);}
 else if(act==='spec-pick'){pickSpec(b.dataset.spec);}
 else if(act==='quest-claim'){claimQuest(b.dataset.id);}
 else if(act==='quest-reroll'){rerollQuest(b.dataset.id);}
 else if(act==='set-claim'){claimSet(b.dataset.id);}
 else if(act==='renaissance'){doRenaissance();}
 else if(act==='cooldown-skip'){for(const c of progress.camps)c.end=Date.now();log('Expéditions terminées depuis la console de test.');}
 else if(act==='skills-reset'){if(confirm('Réinitialiser uniquement l’arbre de talents ? Les éclats investis seront restitués.')){const back=refundSkills();log(`Arbre réinitialisé, ${back} ◆ remboursés.`);}}
 else if(act==='cheat'){const w=b.dataset.what;if(w==='shards')addShards(1000);else if(w==='dust')progress.dust+=500;else if(w==='keys')progress.keys+=5;else if(w==='levels'){for(let i=0;i<5&&progress.level<MAX_LEVEL;i++)addXP(levelTarget(progress.level)-progress.xp);}log('Console : '+b.textContent);}
 else if(act==='simulate'){const id=document.getElementById('dlfr117SimPack')?.value,c=simulate(id,1000),tot=Math.max(1,c.reduce((a,x)=>a+x,0));const out=document.getElementById('dlfr117SimOut');if(out)out.textContent=`${PACKS.find(p=>p.id===id)?.name} × 1 000 : `+rarities.map((r,i)=>`${r} ${fmtPercent(c[i]/tot)}`).join(' · ');return;}
 else if(act==='export-session'){exportSession();return;}
 else if(act==='import-own'){document.getElementById('dlfr173OwnFile')?.click();return;}
 else if(act==='open-session-import'){document.getElementById('dlfr114SessionFile')?.click();return;}
 else if(act==='give'){give(b.dataset.id);log(`+1 ${get(b.dataset.id)?.name}`);}
 else if(act==='take'){if(take(b.dataset.id))log(`−1 ${get(b.dataset.id)?.name}`);}
 else if(act==='holo'){const card=owned.get(Number(b.dataset.id));if(card){card.finish=((card.finish||0)+1)%5;card.holo=card.finish>0;log(`Finition modifiée : ${get(b.dataset.id)?.name} → ${FIN_NAME[card.finish]}`);}}
 else if(act==='all'){for(const c of CARDS)if(!has(c.id))give(c.id);log('Collection complète ajoutée pour ce test.');}
 else if(act==='holo-all'){for(const v of owned.values()){v.finish=Math.max(1,v.finish||0);v.holo=true;}log('Toutes les cartes possédées passent en Holo.');}
 else if(act==='reset'){if(!confirm('Réinitialiser toute la progression de test ? Le catalogue n’est pas modifié.'))return;reset();}
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
 if(e.dataset?.v158Sel!==undefined){if(e.checked)SUGG.sel.add(e.dataset.v158Sel);else SUGG.sel.delete(e.dataset.v158Sel);repaint();return;}
 if(e.dataset?.v158Rar!==undefined){SUGG.rar[e.dataset.v158Rar]=e.value;return;}
 if(e.dataset?.v158==='col'){SUGG.col=Number(e.value);return;}
 if(e.matches('[data-v112-field="filter"]')){filter=e.value;repaint();}
 else if(e.matches('[data-v117-field="title"]')){progress.title=titles().includes(e.value)?e.value:'';repaint();}
}
function handleInput(event){
 if(!gate||!document.getElementById('dlfr112Lab'))return;
 const e=event.target;
 if(e.dataset?.v158==='q'){SUGG.q=e.value;clearTimeout(SUGG.t);SUGG.t=setTimeout(()=>{repaint();const i=document.querySelector('[data-v158="q"]');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}},250);return;}
 if(e.dataset?.v118Card&&catalog.draft){const k=e.dataset.v118Card;catalog.draft[k]=e.type==='checkbox'?e.checked:e.value;if(k==='imageUrl'&&e.value){catalog.pendingFile=null;catalog.draft.preview='';}if(k==='name')dupHint();refreshCatPreview();return;}
 if(e.dataset?.v118Col&&catalog.colDraft){const k=e.dataset.v118Col,cd=catalog.colDraft;cd[k]=e.type==='checkbox'?e.checked:e.value;if(k==='slug')cd.slugTouched=true;if(k==='name'&&!cd.slugTouched){cd.slug=slugify(e.value);const s=document.querySelector('[data-v118-col="slug"]');if(s)s.value=cd.slug;}return;}
 if(!e.matches('[data-v112-field="search"]'))return;
 query=e.value;
 const grid=document.querySelector('#dlfr112Lab .dlfr112-grid');if(!grid)return;
 grid.innerHTML=filtered().map(c=>cardItem(c,srcData())).join('')||'<p class="muted">Aucune carte pour ce filtre.</p>';
}
document.addEventListener('submit',event=>{
 if(!gate||!document.getElementById('dlfr112Lab'))return;
 if(event.target.id==='dlfr118CardForm'){event.preventDefault();saveCard();}
 else if(event.target.id==='dlfr118ColForm'){event.preventDefault();saveCollection();}
});
document.addEventListener('change',async event=>{
 if(!gate||!document.getElementById('dlfr112Lab'))return;
 const el=event.target;
 if(el.id==='dlfr173OwnFile'){const file=el.files?.[0];el.value='';if(file)await importOwnSave(file);return;}
 if(el.id==='dlfr114SessionFile'){const file=el.files?.[0];el.value='';if(file)await importSession(file);return;}
 if(el.id==='dlfr118ImportFile'){const file=el.files?.[0];el.value='';if(file)await importCreations(file);return;}
 if(el.id==='dlfr118ImageFile'){
  const file=el.files?.[0];if(!file||!catalog.draft)return;
  if(file.size>IMG_MAX||!IMG_TYPES.includes(file.type)){setMsg('Image refusée : PNG, JPEG, WebP ou GIF, 2 Mo maximum.','error');el.value='';return;}
  const reader=new FileReader();reader.onload=()=>{if(!catalog.draft)return;catalog.pendingFile=file;catalog.draft.preview=validImage(reader.result);catalog.draft.imageUrl='';const u=document.querySelector('[data-v118-card="imageUrl"]');if(u)u.value='';refreshCatPreview();setMsg('Image prête : elle sera envoyée à l’enregistrement.','');};reader.readAsDataURL(file);
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
// V131 — inclinaison 3D + reflet au survol des cartes (souris uniquement).
let tiltEl=null;
const untilt=c=>{c.classList.remove('is-tilt');c.style.removeProperty('--rx');c.style.removeProperty('--ry');};
document.addEventListener('pointermove',e=>{
 if(e.pointerType==='touch'||reducedMotion())return;
 const c=e.target.closest?.('.dlfr131-card[data-tilt]');
 if(c!==tiltEl){if(tiltEl)untilt(tiltEl);tiltEl=c;}
 if(!c||c.closest('.o-card,.o-tray'))return;
 const r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
 c.classList.add('is-tilt');c.style.setProperty('--rx',`${((.5-y)*14).toFixed(1)}deg`);c.style.setProperty('--ry',`${((x-.5)*16).toFixed(1)}deg`);
 c.style.setProperty('--mx',`${(x*100).toFixed(0)}%`);c.style.setProperty('--my',`${(y*100).toFixed(0)}%`);
},{passive:true});
// Minuterie : met à jour les camps sans redessiner la page ; ferme l'ouverture si on quitte le labo.
setInterval(()=>{
 if(OPEN.el&&!OPEN.st?.meta?.real&&!document.getElementById('dlfr112Lab')){OPEN.st=null;unmountOpening(true);}
 const lab=document.getElementById('dlfr112Lab');if(!lab)return;
 lab.querySelectorAll('[data-v117-camp]').forEach(row=>{const c=progress.camps[Number(row.dataset.v117Camp)];if(!c)return;const left=Math.max(0,c.end-Date.now());
  const bar=row.querySelector('[data-v117-bar]');if(bar)bar.style.width=Math.min(100,(Date.now()-c.start)/(c.end-c.start)*100)+'%';
  const t=row.querySelector('[data-v117-left]');if(t)t.textContent=left?'Retour dans '+duration(left):'De retour !';
  const btn=row.querySelector('button');if(btn&&!left&&btn.disabled){btn.disabled=false;btn.textContent='Récupérer';}});
 let rq=false;lab.querySelectorAll('[data-quest-at]').forEach(el=>{const left=Number(el.dataset.questAt)-Date.now();if(left<=0)rq=true;else{const b=el.querySelector('b');if(b)b.textContent=duration(left);}});if(rq)repaint();
},1000);
document.addEventListener('click',handleClick);
document.addEventListener('input',handleInput);
document.addEventListener('change',handleChange);
window.DLFR_CARDS_LAB={
 // Appelé par app.js juste après la création du client Supabase (même session que le site).
 setClient(client){DB=client||null;},
 setGate(value,uid=null){
  if(!value){if(gate||catalog.status!=='local'){gate=false;userId=null;serverCounts=null;Object.assign(SAVE,{loaded:false,version:0,status:'',tainted:false,conflict:false});clearTimeout(SAVE.timer);reset();view='album';useFallback();setMsg('');}return;}
  gate=true;
  if(uid&&uid!==userId){userId=uid;serverCounts=null;Object.assign(SAVE,{loaded:false,version:0,status:'',tainted:false,conflict:false});loadSave();}
  else if(DB&&catalog.status==='local')loadCatalog();
 },
 setEditor(value){const v=!!value;if(v!==editor){editor=v;if(!editor&&['catalog','exchanges','control'].includes(view))view='album';}},
 view(data){this.__sourceData=data;return viewPage(data);},
 // V127 — ouverture réelle (tirage fait par Supabase) : on ne rejoue que la mise en scène.
 mkCard,
 ladder:(rates)=>ladder(rates),
 advCount:id=>owned.get(Number(id))?.count||0,
 applyServerInventory(inv){if(serverCounts&&!SAVE.tainted){setServerInventory(inv,false);}},
 figure:(card,data,compact=false,opts={})=>figure(card,data,compact,opts),
 playReal(pack,draws,meta={}){
  const T={'Commun':0,'Rare':1,'Épique':2,'Légendaire':3,'Mythique':4,'Ultra':5,'Festive':3};
  startOpening({id:'real',theme:'violet',emblem:'✦',count:draws.length,...pack,real:true},draws.map(d=>({id:d.card.id,card:d.card,tier:T[d.card.rarity]??0,finish:0,isNew:!!d.isNew,value:Number(d.value)||0,shards:0,dust:0})),{...meta,real:true});
 },
 get stats(){return {unique:inventoryUnique(),total:shownCards().length,level:progress.level,power:collectionPower(),catalog:catalog.status,volatile:true};}
};
})();

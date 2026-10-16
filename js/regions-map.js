/* DLFR 2.2 — Carte régionale. Aucun accès Supabase et aucune écriture. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DLFR_REGIONS_MAP = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const regionIds = Object.freeze({
    '84':'ARA','27':'BFC','53':'BRE','24':'CVL','94':'COR',
    '44':'GES','32':'HDF','11':'IDF','28':'NOR','75':'NAQ',
    '76':'OCC','52':'PDL','93':'PAC'
  });
  const mainland = Object.values(regionIds);
  const overseas = ['GP','MQ','GF','RE','YT'];
  const sources = [
    'https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions-version-simplifiee.geojson',
    'https://cdn.jsdelivr.net/gh/gregoiredavid/france-geojson@master/regions-version-simplifiee.geojson'
  ];
  let boundaries = null;
  let geometryAttempted = false;
  let promise = null;
  const safeNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const escape = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const playerName = player => String(player?.display_name || player?.username || player?.player_key || 'Joueur');
  const bestCompleted = player => {
    const levels = [...(player.main || []), ...(player.extended || []), ...(player.beyond || [])];
    return levels.filter(d => Number(d.position) > 0).sort((a,b) => Number(a.position)-Number(b.position))[0] || null;
  };
  // "Actif" ici signifie ayant au moins un résultat public, PAS connecté récemment.
  function hasPublicActivity(player) {
    return safeNumber(player?.score)>0 || safeNumber(player?.nlwScore)>0 || safeNumber(player?.total_completions)>0 || (player?.verified || []).length>0;
  }
  function summarize(players, profiles, regions) {
    const valid = new Set((regions||[]).map(r=>r.code));
    const regionByPlayer = new Map((profiles||[]).map(p=>[p.player_key,p.region_code]));
    const result = Object.fromEntries([...valid].map(code=>[code,{code,players:[],points:0,nlwPoints:0,active:0,top:null,hardest:null}]));
    for(const p of players || []) {
      if (p.hidden_from_stats || p.country_code !== 'FR') continue;
      const code=regionByPlayer.get(p.player_key);
      if (!valid.has(code)) continue;
      const item=result[code];
      item.players.push(p);
      item.points+=safeNumber(p.score);
      item.nlwPoints+=safeNumber(p.nlwScore);
      if(hasPublicActivity(p)) item.active++;
      const completed=bestCompleted(p);
      if(completed && (!item.hardest || Number(completed.position)<Number(item.hardest.level.position))) item.hardest={level:completed,player:p};
    }
    for(const item of Object.values(result)) {
      item.players.sort((a,b)=>safeNumber(b.score)-safeNumber(a.score)||safeNumber(b.nlwScore)-safeNumber(a.nlwScore)||playerName(a).localeCompare(playerName(b),'fr'));
      item.top=item.players[0]||null;
      item.points=Math.round(item.points*100)/100;
      item.nlwPoints=Math.round(item.nlwPoints*100)/100;
    }
    return result;
  }
  function safeCoords(coords){ return Array.isArray(coords)&&coords.length>=2&&Number.isFinite(coords[0])&&Number.isFinite(coords[1])&&coords[0]>-6.5&&coords[0]<11&&coords[1]>40&&coords[1]<52; }
  function project(coord) {return [18+(coord[0]+5.6)/15.7*680, 16+(51.5-coord[1])/10.4*563];}
  function renderPolygon(rings) {
    if(!Array.isArray(rings))return '';
    return rings.map(ring=>{
      if(!Array.isArray(ring)||ring.length<3)return '';
      const coords=ring.filter(safeCoords);
      if(coords.length<3)return '';
      return coords.map((xy,i)=>{const [x,y]=project(xy);return `${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`;}).join(' ')+'Z';
    }).join(' ');
  }
  function featurePath(feature) {
    const geo=feature?.geometry;if(!geo)return '';
    const polygons=geo.type==='Polygon'?[geo.coordinates]:geo.type==='MultiPolygon'?geo.coordinates:[];
    return polygons.map(renderPolygon).filter(Boolean).join(' ');
  }
  function validateGeojson(data) {
    if(data?.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('Contours invalides');
    const listed=data.features.filter(x=>regionIds[String(x?.properties?.code)]);
    if(listed.length!==13)throw Error('La carte ne contient pas les 13 régions métropolitaines');
    return listed;
  }
  function ensureGeometry(fetcher) {
    if(promise)return promise;
    if(geometryAttempted)return Promise.resolve(boundaries);
    geometryAttempted=true;
    const get=fetcher||((u)=>fetch(u));
    promise=(async()=>{
      for(const uri of sources){
        try{
          const response=await get(uri);
          if(!response.ok)continue;
          boundaries=validateGeojson(await response.json());
          return boundaries;
        }catch(e){/* le plan de secours reste disponible */}
      }
      return null;
    })();
    return promise;
  }
  const tiles = [
    ['HDF',3,0],['NOR',1,1],['IDF',3,1],['GES',5,1],['BRE',0,2],
    ['PDL',1.5,2.5],['CVL',3,2.5],['BFC',4.5,3],['NAQ',1.5,4],
    ['ARA',4.5,4.5],['OCC',2.6,6],['PAC',5,6],['COR',6.7,7.3]
  ];
  function fallbackShapes(selected) {
    return tiles.map(([code,x,y])=>`<g role="button" tabindex="0" data-region-code="${code}" aria-label="Choisir ${code}"><rect x="${38+x*93}" y="${19+y*68}" width="91" height="65" rx="9" class="dlfr22-shape ${selected===code?'selected':''}"></rect><text class="dlfr22-tile-label" x="${38+x*93+45}" y="${19+y*68+38}">${code}</text></g>`).join('');
  }
  function draw(selected, labelFor) {
    if(!boundaries)return `<svg viewBox="0 0 760 640" role="group" aria-label="Carte schématique interactive des régions françaises">${fallbackShapes(selected)}</svg>`;
    return `<svg viewBox="0 0 730 625" role="group" aria-label="Carte géographique interactive des régions françaises">${boundaries.map(feature=>{
      const code=regionIds[String(feature.properties.code)];
      const name=typeof labelFor==='function'?labelFor(code):code;
      return `<path tabindex="0" role="button" data-region-code="${code}" aria-label="${escape(name)}" class="dlfr22-shape ${selected===code?'selected':''}" d="${featurePath(feature)}"><title>${escape(name)}</title></path>`;
    }).join('')}</svg>`;
  }
  return {regionIds, mainland, overseas, sources, summarize, hasPublicActivity, bestCompleted, ensureGeometry, draw, featurePath, validateGeojson, get hasGeometry(){return !!boundaries;}};
});

/* Catalogue AREDL : accepte les colonnes originales Column1.* et le modèle français.
   Aucune vérification communautaire n'est inventée quand la colonne est absente. */
(function(root, factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.DLFR_UNVERIFIED=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const normalize=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');
  const text=v=>String(v??'').trim();
  const truthy=v=>v===true || v===1 || ['oui','yes','true','1','verifie','verified','fait','termine','done'].includes(normalize(v));
  const falsy=v=>v===false || v===0 || ['non','no','false','0','nonverifie','notverified','pending','enattente'].includes(normalize(v));
  // Un export AREDL utilise Column1.name / Column1.position : retirer le préfixe.
  const normalizedHeader=k=>normalize(k).replace(/^column[0-9]+(?=[a-z])/, '');
  const columns=row=>Object.entries(row).map(([k,v])=>[normalizedHeader(k),v]);
  function get(row, names){
    const pairs=columns(row);
    for(const name of names){const found=pairs.find(([k])=>k===normalize(name));if(found)return found[1];}
    return '';
  }
  function fromSheet(rows){
    if(!Array.isArray(rows))throw Error('Feuille Excel invalide.');
    if(rows.length){
      const names=Object.keys(rows[0]).map(normalizedHeader);
      if(!['nom','name','niveau','level','levelname'].some(x=>names.includes(x)))
        throw Error('Colonne de nom introuvable. Le fichier doit contenir Column1.name, Name ou Nom.');
    }
    const found=new Map();
    for(const row of rows){
      const name=text(get(row,['Nom','Niveau','Name','Level','Level Name']));
      if(!name)continue;
      const status=get(row,['Vérifié communauté','Verifie communaute','Verifie','Vérifié','Verified','Verification','Statut','Status','État','Etat']);
      const statusKnown=truthy(status)||falsy(status);
      const item={
        name,
        aredl_rank:text(get(row,['Rang AREDL','AREDL Position','AREDL Rank','ARED L','Rank','Position'])),
        aredl_points:text(get(row,['Points AREDL','AREDL points','Points'])),
        level_id:text(get(row,['ID du niveau','Level ID','Level_ID','Levelid','ID'])),
        nlw_tier:text(get(row,['NLW tier','NLW_tier'])),
        difficulty:text(get(row,['Difficulte','Difficulté','Difficulty'])),
        video_url:text(get(row,['Video','Vidéo','Video URL','Lien','Lien video'])),
        verified:truthy(status),
        verification_known:statusKnown,
        notes:text(get(row,['Commentaire','Commentaires','Notes','Note']))
      };
      const nameKey=normalize(name), existing=found.get(nameKey);
      if(!existing)found.set(nameKey,item);
      else if(item.verified){existing.verified=true;existing.verification_known=true;}
      else if(item.verification_known && !existing.verification_known){existing.verified=false;existing.verification_known=true;}
    }
    return [...found.values()].sort((a,b)=>(Number(a.aredl_rank)||1e9)-(Number(b.aredl_rank)||1e9));
  }
  function verifiedOnSite(row,demons=[]){
    const levelName=normalize(row.name), levelId=text(row.level_id);
    return demons.some(d=>{
      const demonId=text(d.level_id);
      const same=levelId && demonId ? levelId===demonId : normalize(d.name)===levelName;
      if(!same)return false;
      const verifier=text(d.verifier);
      return truthy(d.verified)||Boolean(d.verified_at)||
        (verifier!=='' && !['inconnu','unknown','nonverifie','nonverified','enattente','pending','aucun','none','?','-'].includes(normalize(verifier)));
    });
  }
  function classify(rows, demons=[]){
    const available=[],verified=[];
    let unknownCount=0, explicitUnverifiedCount=0;
    for(const row of rows){
      if(row.verified || verifiedOnSite(row,demons)){verified.push(row);continue;}
      available.push(row);
      if(!row.verification_known)unknownCount++;
      else explicitUnverifiedCount++;
    }
    return {available,verified,unknownCount,explicitUnverifiedCount};
  }
  const OFFLINE_EXAMPLES=[
    {name:'DÉMO — Crystal Mirage',aredl_rank:'521',aredl_points:'',level_id:'',nlw_tier:'',difficulty:'',video_url:'',verified:false,verification_known:false,notes:'Exemple fictif'},
    {name:'DÉMO — Silent Twilight',aredl_rank:'840',aredl_points:'',level_id:'',nlw_tier:'',difficulty:'',video_url:'',verified:false,verification_known:false,notes:'Exemple fictif'}
  ];
  return {normalize,fromSheet,verifiedOnSite,classify,OFFLINE_EXAMPLES};
});

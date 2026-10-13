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
  // Priorité à l'ID Geometry Dash. Le nom est un recours lorsque l'un des ID manque.
  // Être présent dans AREDL ne prouve PAS une complétion francophone.
  function findOnDemonlist(row, demons=[]){
    const name=normalize(row.name), id=text(row.level_id);
    return demons.find(d=>{
      const listId=text(d.level_id);
      if(id && listId)return id===listId;
      return name && normalize(d.name)===name;
    })||null;
  }
  function hasVerifier(demon){
    if(!demon)return false;
    const verifier=text(demon.verifier);
    return truthy(demon.verified) || Boolean(demon.verified_at) ||
      (normalize(verifier)!=='' && !['inconnu','unknown','nonverifie','nonverified','enattente','pending','aucun','none'].includes(normalize(verifier)));
  }
  function completedOnSite(demon,completions=[]){
    if(!demon)return false;
    return completions.some(c=>String(c.demon_id)===String(demon.id) && Number(c.progress)>=100);
  }
  function verificationOnSite(row,demons=[],completions=[]){
    const demon=findOnDemonlist(row,demons);
    if(!demon)return {verified:false,reason:'',demon:null};
    if(hasVerifier(demon))return {verified:true,reason:'Vérificateur sur la Demonlist',demon};
    if(completedOnSite(demon,completions))return {verified:true,reason:'Complétion 100 % sur la Demonlist',demon};
    return {verified:false,reason:'Présent sur la Demonlist, sans preuve de complétion',demon};
  }
  function verifiedOnSite(row,demons=[],completions=[]){
    return verificationOnSite(row,demons,completions).verified;
  }
  function classify(rows,demons=[],completions=[]){
    const available=[],verified=[];
    let unknownCount=0,explicitUnverifiedCount=0,confirmedOnSite=0,confirmedManual=0;
    for(const row of rows){
      const detection=verificationOnSite(row,demons,completions);
      if(row.verified || detection.verified){
        const reason=detection.verified?detection.reason:'Marqué vérifié dans Excel';
        verified.push({...row,verification_source:reason,demonlist_id:detection.demon?.id??null});
        if(detection.verified)confirmedOnSite++;else confirmedManual++;
        continue;
      }
      available.push(row);
      if(!row.verification_known)unknownCount++;
      else explicitUnverifiedCount++;
    }
    return {available,verified,unknownCount,explicitUnverifiedCount,confirmedOnSite,confirmedManual};
  }
  const OFFLINE_EXAMPLES=[
    {name:'DÉMO — Crystal Mirage',aredl_rank:'521',aredl_points:'',level_id:'',nlw_tier:'',difficulty:'',video_url:'',verified:false,verification_known:false,notes:'Exemple fictif'},
    {name:'DÉMO — Silent Twilight',aredl_rank:'840',aredl_points:'',level_id:'',nlw_tier:'',difficulty:'',video_url:'',verified:false,verification_known:false,notes:'Exemple fictif'}
  ];
  return {normalize,fromSheet,findOnDemonlist,verificationOnSite,verifiedOnSite,classify,OFFLINE_EXAMPLES};
});

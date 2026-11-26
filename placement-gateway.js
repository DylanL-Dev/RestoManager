'use strict';
/* RM-OPS ENGINE — façade connectée « RestoPlacement » (contrat v1, GitHub #265).
 * Toutes les dépendances sont injectées : testable sans navigateur ni Supabase.
 * Règles :
 *  - aucune écriture sans aperçu préalable recalculé sur un instantané rafraîchi ;
 *  - empreinte différente => STALE, jamais d'écriture ;
 *  - un seul envoi en cours par réservation (double appui => même promesse) ;
 *  - après un échec ou un résultat incertain, on relit l'état : si l'installation
 *    demandée est déjà enregistrée, on le dit (alreadyApplied) sans réécrire ;
 *  - jamais de nouvel essai automatique.
 */
(function(root){
 const MESSAGES={
  OFFLINE:'Connexion interrompue : aucune installation ne peut être enregistrée.',
  NOT_SYNCED:'Service en cours de synchronisation. Réessayez dans un instant.',
  FORBIDDEN:'Action réservée à l’équipe du restaurant.',
  STALE:'Les réservations ont changé depuis l’aperçu. Vérifiez la nouvelle proposition.',
  CONFLICT:'La table vient d’être prise. Vérifiez la nouvelle proposition.',
  RPC_MISSING:'Le service doit être mis à jour par le responsable avant cette action.',
  RESULT_UNKNOWN:'Confirmation non reçue. Vérifiez la fiche avant toute nouvelle action.',
  INVALID_INPUT:'Demande invalide. Actualisez puis réessayez.',
  CAPABILITY_REQUIRED:'Le service de réservation doit être mis à jour par le responsable.'
 };
 class RestoEngineError extends Error{
  constructor(code,message,extra={}){
   super(message||MESSAGES[code]||code);
   this.name='RestoEngineError';this.code=code;
   this.retryable=['STALE','CONFLICT','NOT_SYNCED','OFFLINE'].includes(code);
   Object.assign(this,extra);
  }
 }
 const sameTables=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every(n=>b.map(Number).includes(Number(n)));

 // Traduction des erreurs serveur (PostgREST / PostgreSQL) en codes du contrat.
 function classify(error){
  if(!error)return 'RESULT_UNKNOWN';
  if(error instanceof RestoEngineError)return error.code;
  const code=String(error.code||''),detail=String(error.details||error.detail||''),msg=String(error.message||'');
  if(detail==='FORBIDDEN'||code==='42501')return 'FORBIDDEN';
  if(code==='PGRST202'||code==='42883')return 'RPC_MISSING';
  if(code==='40001'||code==='RM001'||detail==='STALE_VERSION')return 'STALE';
  if(code==='23P01'||detail==='TABLE_CONFLICT')return /maintenue/i.test(msg)?'TARGET_HELD':'CONFLICT';
  if(detail==='HOLD_CONFLICT')return 'TARGET_HELD';
  if(/encore occupée/i.test(msg))return 'TARGET_OCCUPIED';
  if(code==='22023'||detail==='INVALID_INPUT')return 'INVALID_INPUT';
  if(code==='CAPABILITY_REQUIRED')return 'CAPABILITY_REQUIRED';
  if(error.name==='TypeError'||/fetch|network|Failed to fetch|NetworkError/i.test(msg))return 'RESULT_UNKNOWN';
  return 'RESULT_UNKNOWN';
 }

 function createPlacementGateway(deps){
  const {engine,getState,rpc,refresh,requireWrite=()=>{},getRole=async()=>null,isOnline=()=>true,tableId,now=()=>Date.now()}=deps;
  const inflight=new Map();

  function input(extra){
   const state=getState();
   if(!state||!Array.isArray(state.reservations))return null;
   return {reservations:state.reservations,tablePlan:state.tablePlan||[],holds:state.holds||[],now:now(),...extra};
  }
  function findRecord(id){return (getState()?.reservations||[]).find(r=>String(r.id)===String(id))||null}
  function seatedAsRequested(id,tables){const r=findRecord(id);return !!r&&r.status==='seated'&&sameTables(r.tables,tables)}

  function preview(reservationId,targetTables,opts={}){
   const data=input({reservationId,targetTables,allowRoomChange:!!opts.allowRoomChange,guests:opts.guests});
   if(!data)return {ok:false,code:'NOT_SYNCED',message:MESSAGES.NOT_SYNCED,changes:[]};
   const result=engine.preview(data);
   return result.ok?{...result,allowRoomChange:!!opts.allowRoomChange,offline:!isOnline()}:result;
  }
  function suggest(reservationId,opts={}){
   const data=input({reservationId,limit:opts.limit||2});
   if(!data)return {ok:false,code:'NOT_SYNCED',message:MESSAGES.NOT_SYNCED,choices:[]};
   return engine.suggest(data);
  }
  function tableStates(opts={}){
   const data=input(opts);
   return data?engine.tableStates(data):[];
  }

  async function write(fresh,current){
   if(sameTables(current.tables,fresh.targetTables)&&!fresh.changes.length){
    // Installation sur la table déjà affectée : RPC de statut existante.
    return rpc('change_reservation_status_v3',{p_reservation_id:current.id,p_expected:current.status,p_status:'seated'});
   }
   if(current.tables.length!==1||fresh.targetTables.length!==1)throw new RestoEngineError('FUSION_UNSUPPORTED','Fusion : réorganisation automatique non disponible.');
   const uuid=n=>{const v=tableId(Number(n));if(!v)throw new RestoEngineError('NOT_SYNCED','Plan de salle non synchronisé.');return v};
   const p_changes=[{id:current.id,from_table:uuid(current.tables[0]),to_table:uuid(fresh.targetTables[0]),expected_status:current.status},
    ...fresh.changes.map(c=>({id:c.id,from_table:uuid(c.from[0]),to_table:uuid(c.to[0]),expected_status:c.status}))];
   return rpc('apply_smart_placement_v3',{p_target_reservation_id:current.id,p_changes});
  }

  async function run(prev){
   if(!prev||prev.ok!==true||!Array.isArray(prev.targetTables))throw new RestoEngineError('INVALID_INPUT','Aperçu requis avant l’installation.');
   if(!isOnline())throw new RestoEngineError('OFFLINE');
   try{requireWrite()}catch(error){throw new RestoEngineError(classify(error)==='CAPABILITY_REQUIRED'?'CAPABILITY_REQUIRED':'NOT_SYNCED',null,{cause:error})}
   const role=await getRole();
   if(role!=='fb_admin')throw new RestoEngineError('FORBIDDEN');
   await refresh();
   const fresh=preview(prev.reservationId,prev.targetTables,{allowRoomChange:prev.allowRoomChange});
   if(!fresh.ok){
    if(seatedAsRequested(prev.reservationId,prev.targetTables))return done(prev,true);
    throw new RestoEngineError(fresh.code,fresh.message,{refreshed:true,preview:fresh});
   }
   if(fresh.fingerprint!==prev.fingerprint||fresh.kind!==prev.kind||JSON.stringify(fresh.changes.map(c=>[c.id,c.to]))!==JSON.stringify((prev.changes||[]).map(c=>[c.id,c.to])))
    throw new RestoEngineError('STALE',null,{refreshed:true,preview:fresh});
   const current=findRecord(prev.reservationId);
   try{
    await write(fresh,current);
   }catch(error){
    if(error instanceof RestoEngineError)throw error;
    let refreshed=false;
    try{await refresh();refreshed=true}catch(_){}
    if(refreshed&&seatedAsRequested(prev.reservationId,prev.targetTables))return done(fresh,true);
    const code=classify(error);
    throw new RestoEngineError(code,null,{refreshed,cause:error});
   }
   try{await refresh()}catch(_){return {...done(fresh,false),verified:false}}
   if(!seatedAsRequested(prev.reservationId,prev.targetTables))throw new RestoEngineError('RESULT_UNKNOWN',null,{refreshed:true});
   return done(fresh,false);
  }
  function done(p,alreadyApplied){
   const r=findRecord(p.reservationId);
   return {ok:true,reservationId:p.reservationId,targetTables:p.targetTables.slice(),changes:(p.changes||[]).slice(),seatedAt:r?.seatedAt||null,alreadyApplied,verified:true};
  }
  function seat(prev){
   const key=String(prev?.reservationId);
   if(inflight.has(key))return inflight.get(key);
   const promise=run(prev).finally(()=>inflight.delete(key));
   inflight.set(key,promise);
   return promise;
  }
  function capabilities(){
   return {version:1,seat:true,swapAndSeat:true,swapWithoutSeat:false,releaseThenSeat:false,moveSeated:false,escortHold:false};
  }
  return {preview,suggest,seat,tableStates,capabilities,classify};
 }
 const api={createPlacementGateway,RestoEngineError,classify,MESSAGES};
 root.RestoPlacementGateway=api;
 root.RestoEngineError=RestoEngineError;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

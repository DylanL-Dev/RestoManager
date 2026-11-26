'use strict';
/* RM-OPS ENGINE — placement, permutation et états de table.
 * Fonctions pures : aucune écriture, aucun réseau, aucun changement de statut.
 * Le serveur (apply_smart_placement_v3 / change_reservation_status_v3) reste
 * l'autorité finale ; ce moteur ne fait que préparer une proposition sûre et
 * expliquer un refus. Contrat publié dans GitHub #265.
 *
 * Règles alignées sur le serveur DEV :
 *  - un client `seated` bloque sa table quelle que soit la date (aucune libération déduite) ;
 *  - seules les réservations `reserved` / `confirmed` / `late` sur une table unique peuvent être déplacées ;
 *  - `arrived`, fusions et passages ne sont jamais déplacés automatiquement ;
 *  - au plus 8 réservations modifiées, cible comprise (limite de la RPC).
 */
(function(root){
 const BLOCKING=new Set(['reserved','confirmed','late','arrived','seated']);
 const MOVABLE=new Set(['reserved','confirmed','late']);
 const SEATABLE=new Set(['reserved','confirmed','late','arrived']);
 const MAX_CHANGES=8; // cible comprise, comme la RPC
 const SERVICE_WINDOW=360; // minutes : au-delà, la réservation n'appartient pas au service en cours
 const displayName=r=>r.hotelRoom?'Ch. '+r.hotelRoom:String(r.client||'Client');
 const MESSAGES={
  NOT_FOUND:'Réservation introuvable ou déjà terminée.',
  ALREADY_SEATED:'Client déjà installé : déplacement interdit dans ce parcours.',
  INVALID_INPUT:'Table inconnue, inactive ou demande invalide.',
  CAPACITY:'Capacité de la table incompatible avec le nombre de couverts.',
  TARGET_HELD:'Table momentanément gardée par un autre collaborateur.',
  TARGET_OCCUPIED:'Table occupée par un client installé. Confirmez d’abord son départ.',
  FUSION_UNSUPPORTED:'Fusion de tables : réorganisation automatique non disponible, utilisez le mode complet.',
  ROOM_CHANGE_REQUIRED:'La seule solution déplace un client dans une autre salle.',
  NO_SAFE_PLAN:'Aucune réorganisation sûre pour les réservations concernées.',
  PARTY_SIZE_CHANGED:'Le nombre de couverts diffère de la réservation : modifiez-la d’abord.',
  OUT_OF_SERVICE:'Réservation d’un autre service ou d’une autre date : vérifiez le dossier.'
 };
 const fail=(code,detail={})=>({ok:false,code,message:MESSAGES[code]||code,reason:MESSAGES[code]||code,detail,changes:[]});

 const dayIndex=date=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date||''));return m?Date.UTC(+m[1],+m[2]-1,+m[3])/86400000:NaN};
 const clockMinutes=time=>{const m=/^(\d{2}):(\d{2})$/.exec(String(time||''));return m?+m[1]*60+ +m[2]:NaN};
 // Intervalle absolu en minutes : gère les services qui passent minuit.
 function interval(r){
  const start=dayIndex(r.date)*1440+clockMinutes(r.time);
  return [start,start+Math.max(1,Number(r.duration)||90)];
 }
 const overlaps=(a,b)=>Number.isFinite(a[0])&&Number.isFinite(b[0])&&a[0]<b[1]&&b[0]<a[1];

 function normalize(list){
  return (list||[]).filter(r=>r&&BLOCKING.has(r.status)).map(r=>({...r,id:String(r.id),guests:Math.max(1,Number(r.guests)||1),tables:[...new Set((r.tables||[]).map(Number).filter(Number.isInteger))]}));
 }
 function planIndex(tablePlan){
  const plan=(tablePlan||[]).filter(t=>t&&Number(t.capacity)>0).map(t=>({...t,number:Number(t.number),capacity:Number(t.capacity),capacityMin:Number(t.capacityMin||1),roomId:t.roomId==null?'main':String(t.roomId)}));
  return {plan,byNum:new Map(plan.map(t=>[t.number,t]))};
 }
 const fits=(t,guests)=>!!t&&t.capacity>=guests&&t.capacityMin<=guests;
 function holdOn(holds,num,span,now){
  // Les maintiens sont en millisecondes absolues ; on les compare à l'horloge de Paris.
  return (holds||[]).find(h=>Number(h.number)===num&&Number(h.expiry)>now&&overlaps(span,[parisMinutes(h.start),parisMinutes(h.end)]))||null;
 }
 const parisFmt=typeof Intl!=='undefined'?new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}):null;
 function parisMinutes(ms){
  if(!Number.isFinite(Number(ms))||!parisFmt)return NaN;
  const p=Object.fromEntries(parisFmt.formatToParts(new Date(Number(ms))).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return dayIndex(p.year+'-'+p.month+'-'+p.day)*1440+Number(p.hour)*60+Number(p.minute);
 }
 // Empreinte stable de l'état utilisé par une simulation (détection STALE).
 function fingerprint(parts){
  const text=JSON.stringify(parts);let h=0x811c9dc5;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}
  return h.toString(16).padStart(8,'0');
 }
 const roomOf=(byNum,num)=>byNum.get(Number(num))?.roomId??null;

 /* Cœur : calcule la réorganisation nécessaire pour installer `reservationId` sur `targetTables`. */
 function preview(input){
  const {reservationId,targetTables,holds=[],allowRoomChange=false,guests,now=Date.now(),budget=4000,maxDepth=MAX_CHANGES,explainRoomChange=true,enforceService=true}=input||{};
  const all=normalize(input?.reservations);
  const {plan,byNum}=planIndex(input?.tablePlan);
  const target=all.find(r=>r.id===String(reservationId));
  if(!target){
   const raw=(input?.reservations||[]).find(r=>r&&String(r.id)===String(reservationId));
   return fail(raw&&raw.status==='seated'?'ALREADY_SEATED':'NOT_FOUND');
  }
  if(target.status==='seated')return fail('ALREADY_SEATED');
  if(!SEATABLE.has(target.status))return fail('NOT_FOUND');
  if(target.walkIn)return fail('INVALID_INPUT',{reason:'walk-in'});
  if(guests!=null&&Number(guests)!==target.guests)return fail('PARTY_SIZE_CHANGED',{booked:target.guests,requested:Number(guests)});
  const wanted=[...new Set((Array.isArray(targetTables)?targetTables:[targetTables]).map(Number))];
  if(!wanted.length||wanted.some(n=>!Number.isInteger(n)))return fail('INVALID_INPUT');
  const sameSet=wanted.length===target.tables.length&&wanted.every(n=>target.tables.includes(n));
  if(wanted.length!==1&&!sameSet)return fail('FUSION_UNSUPPORTED',{reason:'target-tables'});
  if(target.tables.length!==1&&!sameSet)return fail('FUSION_UNSUPPORTED',{reason:'target-is-fusion'});
  for(const n of wanted)if(!byNum.has(n))return fail('INVALID_INPUT',{table:n});
  const capacity=wanted.reduce((s,n)=>s+byNum.get(n).capacity,0);
  if(capacity<target.guests||(wanted.length===1&&byNum.get(wanted[0]).capacityMin>target.guests))return fail('CAPACITY',{table:wanted[0],capacity});
  // Installer maintenant occupe la table dès maintenant : en cas d'installation anticipée ou
  // tardive, l'intervalle réel part de l'heure actuelle (fenêtre de 12 h autour du créneau).
  const planned=interval(target),nowMin=parisMinutes(now);
  // Réservation d'un autre service ou d'une autre date (recherche élargie) : jamais installée par erreur.
  if(enforceService&&Number.isFinite(nowMin)&&Number.isFinite(planned[0])&&Math.abs(nowMin-planned[0])>SERVICE_WINDOW)return fail('OUT_OF_SERVICE',{plannedAt:target.date+' '+target.time});
  const span=Number.isFinite(nowMin)&&Math.abs(nowMin-planned[0])<=720
   ?[Math.min(planned[0],nowMin),Math.max(planned[0],nowMin)+(planned[1]-planned[0])]:planned;
  for(const n of wanted){
   const h=holdOn(holds,n,span,now);
   if(h&&!sameSet)return fail('TARGET_HELD',{table:n,team:h.team||null});
  }
  // Un client installé bloque sa table quelle que soit la date (comme le serveur).
  const seated=all.find(r=>r.id!==target.id&&r.status==='seated'&&r.tables.some(n=>wanted.includes(n)));
  if(seated)return fail('TARGET_OCCUPIED',{table:seated.tables.find(n=>wanted.includes(n)),client:seated.client,seatedAt:seated.seatedAt||null,since:seated.date!==target.date?'previous-date':'same-date'});
  const occupying=(r,num,s)=>r.tables.includes(num)&&(r.status==='seated'||overlaps(interval(r),s));
  // Toute donnée qui peut changer la décision : statut, tables, couverts, horaire, durée, version.
  const sig=r=>[r.id,r.status,r.tables,r.guests,r.date,r.time,Number(r.duration)||90,r.editVersion||null];
  const fp=()=>fingerprint([sig(target),
   ...all.filter(r=>r.id!==target.id&&r.tables.some(n=>wanted.includes(n)||target.tables.includes(n))).map(sig).sort()]);
  const warnings=[];
  if(Number.isFinite(planned[0])&&Number.isFinite(nowMin)&&planned[0]-nowMin>30)warnings.push({code:'EARLY_SEATING',minutesEarly:planned[0]-nowMin,message:'Installation '+(planned[0]-nowMin)+' min avant l’heure prévue.'});
  const targetRoomChange=target.tables.length===1&&wanted.length===1&&roomOf(byNum,target.tables[0])!==roomOf(byNum,wanted[0]);
  const base={ok:true,reservationId:target.id,client:target.client,label:displayName(target),guests:target.guests,targetTables:wanted,from:target.tables.slice(),targetRoomChange,requiresConfirmation:true,
   notice:'Simulation uniquement : les tables réelles peuvent avoir changé depuis la synchronisation.'};
  if(sameSet){
   const blocker=all.find(r=>r.id!==target.id&&wanted.some(n=>occupying(r,n,span)));
   if(blocker)return fail('NO_SAFE_PLAN',{blocking:blocker.id});
   return {...base,kind:'direct',changes:[],warnings,fingerprint:fp()};
  }
  const dest=wanted[0];
  const displaced=all.filter(r=>r.id!==target.id&&occupying(r,dest,span));
  if(displaced.some(r=>r.tables.length!==1||r.walkIn))return fail('FUSION_UNSUPPORTED',{reason:'displaced-is-fusion'});
  if(displaced.some(r=>!MOVABLE.has(r.status)))return fail('NO_SAFE_PLAN',{reason:'protected',ids:displaced.filter(r=>!MOVABLE.has(r.status)).map(r=>r.id)});
  if(!displaced.length)return {...base,kind:'direct',changes:[],warnings,fingerprint:fp()};

  const byId=new Map(all.map(r=>[r.id,r]));
  const spans=new Map(all.map(r=>[r.id,r.id===target.id?span:interval(r)]));
  const solve=roomChangeAllowed=>{
   const assignment=new Map(all.map(r=>[r.id,r.tables.slice()]));
   assignment.set(target.id,[dest]);
   // Index table -> réservations affectées (mis à jour pendant la recherche).
   const atTable=new Map();
   for(const [id,tables] of assignment)for(const n of tables){if(!atTable.has(n))atTable.set(n,new Set());atTable.get(n).add(id)}
   const move=(id,from,to)=>{atTable.get(from)?.delete(id);if(!atTable.has(to))atTable.set(to,new Set());atTable.get(to).add(id);assignment.set(id,[to])};
   const changed=new Set([target.id]);
   const work=new Set(displaced.map(r=>r.id));
   const visited=new Set();
   let steps=0; // borne de calcul : une proposition doit rester instantanée au pupitre
   const occupantsAt=(r,num)=>[...(atTable.get(num)||[])].filter(id=>id!==r.id).map(id=>byId.get(id)).filter(o=>o.status==='seated'||overlaps(spans.get(o.id),spans.get(r.id)));
   const orders=new Map();
   const order=r=>{
    if(orders.has(r.id))return orders.get(r.id);
    const home=roomOf(byNum,r.tables[0]);
    const list=plan.filter(t=>fits(t,r.guests)&&t.number!==r.tables[0]&&t.number!==dest&&(roomChangeAllowed||t.roomId===home))
     .sort((a,b)=>(b.number===target.tables[0])-(a.number===target.tables[0])||(a.roomId===home?0:1)-(b.roomId===home?0:1)||a.capacity-b.capacity||a.number-b.number);
    orders.set(r.id,list);return list;
   };
   const step=depth=>{
    if(!work.size)return true;
    if(depth>=maxDepth||changed.size>=MAX_CHANGES)return false;
    const id=[...work].sort((a,b)=>byId.get(b).guests-byId.get(a).guests||a.localeCompare(b))[0];
    const r=byId.get(id),home=assignment.get(id)[0];
    work.delete(id);
    for(const t of order(r)){
     if(++steps>budget)break;
     if(holdOn(holds,t.number,spans.get(id),now))continue;
     const collide=occupantsAt(r,t.number);
     if(collide.some(o=>o.id===target.id||o.status==='seated'||o.walkIn||!MOVABLE.has(o.status)||(assignment.get(o.id)||[]).length!==1||changed.has(o.id)))continue;
     if(changed.size+1+collide.length>MAX_CHANGES)continue;
     if(depth+1>=maxDepth&&collide.length)continue;
     const key=id+'>'+t.number+'|'+[...work].sort().join(',');
     if(visited.has(key))continue;visited.add(key);
     const prevWork=new Set(work);
     move(id,home,t.number);changed.add(id);
     collide.forEach(o=>work.add(o.id));
     if(step(depth+1))return true;
     move(id,t.number,home);changed.delete(id);
     work.clear();prevWork.forEach(x=>work.add(x));
    }
    work.add(id);
    return false;
   };
   if(!step(0))return null;
   return [...changed].filter(id=>id!==target.id).map(id=>{
    const r=byId.get(id),to=assignment.get(id);
    const fromRoom=roomOf(byNum,r.tables[0]),toRoom=roomOf(byNum,to[0]);
    return {id,client:r.client,label:displayName(r),hotelRoom:r.hotelRoom||'',guests:r.guests,status:r.status,editVersion:r.editVersion||null,from:r.tables.slice(),to:to.slice(),fromRoom,toRoom,roomChange:fromRoom!==toRoom};
   });
  };
  let changes=solve(false);
  if(!changes){
   if(!allowRoomChange&&!explainRoomChange)return fail('NO_SAFE_PLAN');
   const withRoom=solve(true);
   if(!withRoom)return fail('NO_SAFE_PLAN');
   if(!allowRoomChange)return fail('ROOM_CHANGE_REQUIRED',{changes:withRoom});
   changes=withRoom;
  }
  if(changes.some(c=>c.roomChange))warnings.push({code:'ROOM_CHANGE',ids:changes.filter(c=>c.roomChange).map(c=>c.id),message:'Changement de salle pour '+changes.filter(c=>c.roomChange).map(c=>c.label).join(', ')+'.'});
  const kind=changes.length===1&&changes[0].to[0]===target.tables[0]&&changes[0].from[0]===dest?'swap':'chain';
  return {...base,kind,changes,warnings,fingerprint:fp()};
 }

 /* Deux (ou `limit`) choix ordonnés pour l'accueil : prévue, directe, échange simple, chaîne. */
 function suggest(input){
  const {reservationId,limit=2}=input||{};
  const all=normalize(input?.reservations);
  const target=all.find(r=>r.id===String(reservationId));
  if(!target)return fail(((input?.reservations||[]).find(r=>r&&String(r.id)===String(reservationId))||{}).status==='seated'?'ALREADY_SEATED':'NOT_FOUND');
  const {plan,byNum}=planIndex(input?.tablePlan);
  const home=target.tables.length===1?roomOf(byNum,target.tables[0]):null;
  const guard=preview({...input,targetTables:target.tables.length?target.tables:[plan[0]?.number]});
  if(!guard.ok&&['OUT_OF_SERVICE','ALREADY_SEATED','NOT_FOUND','PARTY_SIZE_CHANGED'].includes(guard.code))return guard;
  const rank={planned:0,direct:1,swap:2,chain:3};
  const choices=[];
  if(target.tables.length){
   const p=preview({...input,targetTables:target.tables});
   if(p.ok)choices.push({...p,kind:'planned',label:'Prévue'});
  }
  const want=Math.max(1,Number(limit)||2);
  const candidates=plan.filter(t=>fits(t,target.guests)&&!(target.tables.length===1&&t.number===target.tables[0]));
  const tried=new Set();
  // 1er passage : installations directes et échanges simples (coût faible) ; 2e : chaînes si nécessaire.
  for(const pass of [{maxDepth:1,budget:60},{maxDepth:MAX_CHANGES,budget:300}]){
   if(pass.maxDepth>1&&choices.length>=want+1)break;
   for(const t of candidates){
    if(tried.has(t.number))continue;
    const p=preview({...input,targetTables:[t.number],allowRoomChange:false,explainRoomChange:false,...pass});
    if(!p.ok){if(!['NO_SAFE_PLAN'].includes(p.code))tried.add(t.number);continue}
    tried.add(t.number);
    const swapWith=p.kind==='swap'?p.changes[0]:null;
    choices.push({...p,label:p.kind==='direct'?'Sans réservation sur ce créneau':swapWith?'Échange avec '+swapWith.client:p.changes.length+' déplacements',sameRoom:t.roomId===home,waste:t.capacity-target.guests});
   }
  }
  choices.sort((a,b)=>rank[a.kind]-rank[b.kind]||(b.sameRoom?1:0)-(a.sameRoom?1:0)||(a.waste||0)-(b.waste||0)||a.targetTables[0]-b.targetTables[0]);
  return {ok:true,reservationId:target.id,choices:choices.slice(0,want),total:choices.length};
 }

 /* État honnête de chaque table pour l'affichage (aucune déduction de départ). */
 function tableStates(input){
  const {now=Date.now(),overdueGraceMinutes=15,unknownAfterMinutes=20,date}=input||{};
  const all=normalize(input?.reservations);
  const {plan}=planIndex(input?.tablePlan);
  const nowMin=parisMinutes(now);
  return plan.map(t=>{
   const seated=all.filter(r=>r.status==='seated'&&r.tables.includes(t.number));
   if(seated.length){
    const r=seated[0],start=Number.isFinite(Date.parse(r.seatedAt))?parisMinutes(Date.parse(r.seatedAt)):interval(r)[0];
    const end=start+Math.max(1,Number(r.duration)||90);
    return {number:t.number,roomId:t.roomId,state:nowMin>end+overdueGraceMinutes?'overdue':'seated',reservationId:r.id,client:r.client,since:r.seatedAt||null,previousDate:!!date&&r.date!==date,overdueMinutes:Math.max(0,nowMin-end)};
   }
   const upcoming=all.filter(r=>r.status!=='seated'&&r.tables.includes(t.number)&&(!date||r.date===date)&&interval(r)[1]>nowMin).sort((a,b)=>interval(a)[0]-interval(b)[0]);
   const next=upcoming[0];
   if(next&&nowMin>interval(next)[0]+unknownAfterMinutes)return {number:t.number,roomId:t.roomId,state:'unknown',reservationId:next.id,client:next.client,plannedAt:next.time,lateMinutes:nowMin-interval(next)[0]};
   if(next)return {number:t.number,roomId:t.roomId,state:'planned',reservationId:next.id,client:next.client,plannedAt:next.time,startsInMinutes:interval(next)[0]-nowMin};
   return {number:t.number,roomId:t.roomId,state:'none'}; // « Aucun client enregistré », jamais « libre »
  });
 }

 /* Tables proposables pour un passage maintenant : même règle que la RPC install_walkin_group_v3
  * (aucun installé, aucune réservation sur [maintenant, maintenant + durée], aucun maintien actif). */
 function walkInTables(input){
  const {guests,duration=90,holds=[],now=Date.now()}=input||{};
  const n=Number(guests);
  if(!Number.isInteger(n)||n<1)return [];
  const all=normalize(input?.reservations);
  const {plan}=planIndex(input?.tablePlan);
  const start=parisMinutes(now);
  if(!Number.isFinite(start))return [];
  const span=[start,start+Math.max(1,Number(duration)||90)];
  return plan.filter(t=>fits(t,n))
   .filter(t=>!all.some(r=>r.tables.includes(t.number)&&(r.status==='seated'||overlaps(interval(r),span))))
   .filter(t=>!holdOn(holds,t.number,span,now))
   .sort((a,b)=>a.capacity-b.capacity||a.number-b.number)
   .map(t=>({number:t.number,capacity:t.capacity,roomId:t.roomId}));
 }

 /* Ancienne API conservée (même forme de retour), désormais alignée sur preview(). */
 function simulate(input){
  const p=preview({...input,targetTables:[Number(input?.targetTable)],enforceService:false});
  if(!p.ok)return {ok:false,reason:p.reason,code:p.code,detail:p.detail,changes:[]};
  const target=normalize(input.reservations).find(r=>r.id===String(input.reservationId));
  // Historique : la réservation cible figure dans `changes` dès que sa table change.
  const changes=[{id:target.id,client:target.client,from:target.tables.slice(),to:p.targetTables.slice(),status:target.status,guests:target.guests},
   ...p.changes.map(c=>({id:c.id,client:c.client,from:c.from,to:c.to,status:c.status,guests:c.guests}))];
  return {ok:true,changes:changes.filter(x=>x.from.join()!==x.to.join()),kind:p.kind,requiresConfirmation:true,notice:p.notice,fingerprint:p.fingerprint};
 }

 const api={simulate,preview,suggest,tableStates,walkInTables,fingerprint,MAX_CHANGES,MESSAGES};
 root.RestoSmartPlacement=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

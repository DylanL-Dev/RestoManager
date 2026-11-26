import {assignedRoom,belongsToService,isWaiting,minute,normalize,parisTime} from './service-v3-express-data.mjs?v=20261126-rmops-integration1';

const date='2032-11-08';
const initialClock=Date.parse(`${date}T18:44:00Z`);
const coversFor=number=>[18,19,20].includes(number)?6:2;
const timeFor=minuteOfDay=>`${String(Math.floor(minuteOfDay/60)).padStart(2,'0')}:${String(minuteOfDay%60).padStart(2,'0')}`;

export function makeSimulation(){
 const tables=Array.from({length:21},(_,i)=>({number:i+1,capacity:coversFor(i+1),roomId:i<11||i===20?'main':'salon'}));
 const rooms=[{id:'main',name:'Salle principale'},{id:'salon',name:'Salon'},{id:'verriere',name:'Verrière'}];
 const assigned=tables.filter(({number})=>![16,17].includes(number));
 const groups=[1080,1185,1290,1395].flatMap((start,wave)=>assigned.map(({number,capacity},index)=>{
  const hotelRoom=wave===1&&number===21?'214':wave===1&&number===4?'215':String(300+wave*30+number);
  const client=hotelRoom==='214'?'Dupont':hotelRoom==='215'?'Martin':`Groupe fictif ${wave+1}-${number}`;
  const time=wave===1&&[21,4].includes(number)?'19:48':timeFor(start+index%15);
  const walkIn=wave<3&&number>=6&&number<=10;
  const status=wave===0?(number===12?'seated':number===11?'reserved':'released'):'reserved';
  return {id:hotelRoom,hotelRoom,client,date,time,duration:90,tables:[number],guests:capacity,walkIn,status,
   allergies:hotelRoom==='214'?'Arachide':'',seatedAt:status==='seated'?`${date}T17:05:00Z`:null};
 }));
 const reservations=groups.filter(row=>!row.walkIn);
 return {revision:0,clock:initialClock,rooms,tables,reservations,holds:[],duration:90,threshold:70,
  fixture:{groups:groups.length,covers:groups.reduce((sum,row)=>sum+row.guests,0),unreportedWalkInCovers:groups.filter(row=>row.walkIn).reduce((sum,row)=>sum+row.guests,0)}};
}

function interval(row){const start=minute(row.date,row.time);return {start,end:start+row.duration};}
function overlaps(first,second){return first.start<second.end&&second.start<first.end;}
function blockers(snapshot,number,window,excluded=[]){
 return snapshot.reservations.filter(row=>!excluded.includes(row.id)&&row.tables.includes(number)&&
  (row.status==='seated'||isWaiting(row)&&overlaps(interval(row),window)));
}
function held(snapshot,number,window){return snapshot.holds.some(hold=>hold.number===number&&overlaps(hold,window));}
function fits(table,guests){return table.capacity>=guests;}
function activeTable(snapshot,table){return table?.active!==false&&snapshot.rooms.some(room=>room.id===table?.roomId&&room.active!==false);}
const refusal=(code,message)=>({ok:false,code,message});
const failure=(code,message)=>Object.assign(Error(message),{code});
const versionOf=row=>[row.id,row.status,row.guests,row.date,row.time,row.duration,row.tables];

// This fixture only models direct moves and two-party swaps. The production solver belongs to #265.
export function previewPlacement(snapshot,reservationId,number){
 const row=snapshot.reservations.find(item=>item.id===reservationId);
 const table=snapshot.tables.find(item=>item.number===number);
 if(!row||!isWaiting(row)||!belongsToService(snapshot,row))
  return refusal('NOT_FOUND','Ce dossier ne peut pas être installé dans le service en cours.');
 if(!table)return refusal('CAPACITY','Capacité insuffisante');
 if(!activeTable(snapshot,table))return refusal('INACTIVE','Table hors du plan actif');
 if(!fits(table,row.guests))return refusal('CAPACITY','Capacité insuffisante');
 if(row.tables.length!==1)return refusal('FUSION_UNSUPPORTED','Fusion à traiter en mode complet');
 const now=minute(snapshot.now.date,snapshot.now.time),reserved=interval(row);
 const window={start:Math.min(now,reserved.start),end:Math.max(now+row.duration,reserved.end)};
 const used=blockers(snapshot,number,window,[row.id]);
 if(used.some(item=>item.status==='seated'))return refusal('TARGET_OCCUPIED','Installation déclarée sur cette table');
 if(held(snapshot,number,window))return refusal('TARGET_HELD','Table maintenue');
 const origin=snapshot.tables.find(item=>item.number===row.tables[0]);
 const [other]=used;
 if(other&&(used.length!==1||!['reserved','confirmed','late'].includes(other.status)||other.tables.length!==1||!origin||
   origin.number===number||origin.roomId!==table.roomId||!fits(origin,other.guests)||
   blockers(snapshot,origin.number,interval(other),[row.id,other.id]).length||held(snapshot,origin.number,interval(other)))){
  return refusal('NO_SAFE_PLAN','Réservation ou fusion protégée');
 }
 const roomChange=Boolean(origin&&origin.roomId!==table.roomId),earlyMinutes=reserved.start-now;
 const warnings=[];
 if(roomChange)warnings.push({code:'ROOM_CHANGE',message:'Changement de salle pour le client.'});
 if(earlyMinutes>30)warnings.push({code:'EARLY_SEATING',message:`Installation ${earlyMinutes} min avant l’heure prévue.`});
 const changes=other?[{id:other.id,client:other.hotelRoom?`Ch. ${other.hotelRoom}`:other.client,guests:other.guests,status:other.status,
  from:[number],to:[origin.number],fromRoom:table.roomId,toRoom:origin.roomId,roomChange:false}]:[];
 return {ok:true,kind:other?'swap':'direct',reservationId,targetTables:[number],changes,warnings,
  fingerprint:JSON.stringify([number,table.roomId,table.capacity,versionOf(row),other?versionOf(other):null,warnings])};
}

export function suggestions(snapshot,row,roomId=null){
 const origin=assignedRoom(snapshot,row);
 const entries=snapshot.tables.filter(table=>activeTable(snapshot,table)&&(!roomId||table.roomId===roomId))
  .map(table=>({table,plan:previewPlacement(snapshot,row.id,table.number)}));
 const preferred=entries.filter(entry=>entry.plan.ok).sort((a,b)=>{
  const order=entry=>row.tables.includes(entry.table.number)?0:entry.table.roomId===origin?1:2;
  return order(a)-order(b)||a.plan.changes.length-b.plan.changes.length||a.table.capacity-b.table.capacity||a.table.number-b.table.number;
 });
 // Give the crew a chance to exercise the known 214/215 exchange when it remains compatible.
 const trainingSwap=row.id==='214'?preferred.find(entry=>entry.table.number===4):null;
 const primary=preferred.slice(0,2);
 if(trainingSwap&&primary.length===2&&primary[0]!==trainingSwap)primary[1]=trainingSwap;
 return {primary,entries};
}

export function suggestWalkIn(snapshot,guests){
 if(!Number.isInteger(guests)||guests<1)return [];
 const start=minute(snapshot.now.date,snapshot.now.time),window={start,end:start+snapshot.duration};
 return snapshot.tables.filter(table=>activeTable(snapshot,table)&&fits(table,guests)&&!blockers(snapshot,table.number,window).length&&!held(snapshot,table.number,window))
  .sort((a,b)=>a.capacity-b.capacity||a.number-b.number);
}

export function simulationSnapshot(state){
 const now=parisTime(state.clock),start=minute(now.date,now.time.slice(0,2)+':00');
 const counted=state.reservations.filter(row=>{
  if(!isWaiting(row)&&row.status!=='seated')return false;
  const time=row.seatedAt?parisTime(Date.parse(row.seatedAt)):row;
  const at=minute(time.date,time.time);
  return at>=start&&at<start+60;
 }).reduce((sum,row)=>sum+row.guests,0);
 const capacity=state.tables.filter(table=>activeTable(state,table)).reduce((sum,table)=>sum+table.capacity,0);
 const limit=Math.ceil(capacity*state.threshold/100);
 return {...state,now,service:{start:'18:00',end:'23:59'},loaded:true,fresh:true,updatedAt:state.clock,
  charge:limit?{current:counted,limit,blocked:counted>limit}:null};
}

export function createSimulation(source=window,scope='demo'){
 const key=`restomanager-express-fiction-v1:${scope}`;
 const fallback=makeSimulation();
 let state=fallback;
 let shared=false;
 let closed=false;
 try{shared=typeof source.navigator.locks?.request==='function'&&!!source.localStorage;}catch{}
 const listeners=new Set();
 function read(){
  if(shared){
   try{const saved=JSON.parse(source.localStorage.getItem(key));if(saved)state=saved;}
   catch{shared=false;}
  }
  return simulationSnapshot(state);
 }
 function notify(){for(const listener of listeners)listener();}
 function sync(event){if(event.key===key)notify();}
 source.addEventListener('storage',sync);
 function write(next){
  if(shared){try{source.localStorage.setItem(key,JSON.stringify(next));}
   catch{shared=false;}}
  state=next;notify();
 }
 function update(apply){
  function perform(){
   if(closed)throw failure('CONTEXT_CHANGED','La simulation appartient à un autre contexte de service.');
   if(source.navigator.onLine===false)throw failure('OFFLINE','Simulation en consultation : connexion interrompue.');
   const {reservations,value}=apply(read());
   if(reservations)write({...state,reservations,revision:state.revision+1});
   return value;
  }
  return shared?source.navigator.locks.request(key,perform):Promise.resolve().then(perform);
 }
 return {read,subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
  close(){closed=true;listeners.clear();source.removeEventListener('storage',sync);},
  preview:previewPlacement,suggestions,suggestWalkIn,
  seat(plan){return update(snapshot=>{
   const row=snapshot.reservations.find(item=>item.id===plan.reservationId);
   if(row?.status==='seated'&&row.tables.length===1&&row.tables[0]===plan.targetTables[0]){
    return {value:{ok:true,reservationId:row.id,targetTables:row.tables,seatedAt:row.seatedAt,changes:[],alreadyApplied:true}};
   }
   const current=previewPlacement(snapshot,plan.reservationId,plan.targetTables[0]);
   if(!current.ok||current.fingerprint!==plan.fingerprint)throw failure('STALE','Le service a changé. Vérifiez les nouvelles propositions.');
   const seatedAt=new Date(snapshot.clock).toISOString();
   const reservations=snapshot.reservations.map(item=>{
    if(item.id===current.reservationId)return {...item,tables:current.targetTables,status:'seated',seatedAt};
    const move=current.changes.find(change=>change.id===item.id);
    return move?{...item,tables:move.to}:item;
   });
   return {reservations,value:{ok:true,reservationId:current.reservationId,targetTables:current.targetTables,seatedAt,changes:current.changes,alreadyApplied:false}};
  });},
  walkIn(draft){return update(snapshot=>{
   if(snapshot.revision!==draft.revision)throw failure('STALE','Le service a changé. Vérifiez les nouvelles propositions.');
   if(!suggestWalkIn(snapshot,draft.guests).some(table=>table.number===draft.table))throw Error('Cette table ne peut plus accueillir le passage.');
   const hotelRoom=draft.type==='hotel'?draft.room.trim():'';
   if(hotelRoom&&snapshot.reservations.some(row=>normalize(row.hotelRoom)===normalize(hotelRoom)&&
      (row.status==='seated'||isWaiting(row)&&row.date===snapshot.now.date)))throw Error('Une réservation utilise déjà cette chambre. Vérifiez le dossier.');
   return {reservations:[...snapshot.reservations,{id:`passage-${snapshot.revision+1}`,client:hotelRoom?`Chambre ${hotelRoom}`:'Client extérieur',hotelRoom,
    date:snapshot.now.date,time:snapshot.now.time,duration:snapshot.duration,guests:draft.guests,tables:[draft.table],walkIn:true,
    status:'seated',seatedAt:new Date(snapshot.clock).toISOString()}]};
  });}
 };
}

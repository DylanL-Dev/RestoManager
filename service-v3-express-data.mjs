const parisClock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const waitingStatuses=new Set(['reserved','confirmed','late','arrived']);

export function parisTime(stamp){
 const parts=Object.fromEntries(parisClock.formatToParts(stamp).map(({type,value})=>[type,value]));
 return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
}

export function minute(date,time){return Date.parse(`${date}T${time}:00Z`)/60000;}
export function isWaiting(row){return waitingStatuses.has(row.status);}
export function normalize(value){return String(value??'').trim().normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('fr-FR');}

export function currentService(shifts,now){
 const enabled=Object.values(shifts??{}).filter(shift=>shift.enabled&&shift.end>=now.time).sort((a,b)=>a.start.localeCompare(b.start));
 return enabled[0]??null;
}

export function findArrivals(snapshot,query='',otherDates=false){
 const words=normalize(query).split(/\s+/).filter(Boolean);
 return snapshot.reservations.filter(row=>{
  if(!isWaiting(row))return false;
  const inService=row.date===snapshot.now.date&&snapshot.service&&row.time>=snapshot.service.start&&row.time<=snapshot.service.end;
  if(!inService&&(!otherDates||!words.length))return false;
  const label=normalize(`${row.hotelRoom??''} ${row.client??''} ${row.time}`);
  return words.every(word=>label.includes(word));
 }).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
}

export function elapsedMinutes(snapshot,row){
 if(row.status==='seated'&&row.seatedAt&&Number.isFinite(Date.parse(row.seatedAt))){
  const seated=parisTime(Date.parse(row.seatedAt));
  return minute(snapshot.now.date,snapshot.now.time)-minute(seated.date,seated.time);
 }
 return minute(snapshot.now.date,snapshot.now.time)-minute(row.date,row.time);
}

export function tableStatus(snapshot,number){
 const attached=snapshot.reservations.filter(row=>row.tables.includes(number));
 const seated=attached.find(row=>row.status==='seated');
 if(seated)return elapsedMinutes(snapshot,seated)>=seated.duration
  ?{kind:'check',label:'Départ à vérifier'}:{kind:'occupied',label:'Installé déclaré'};
 const waiting=attached.filter(isWaiting).filter(row=>row.date===snapshot.now.date&&elapsedMinutes(snapshot,row)<row.duration)
  .sort((a,b)=>a.time.localeCompare(b.time))[0];
 if(waiting)return elapsedMinutes(snapshot,waiting)>=20
  ?{kind:'check',label:'Présence à vérifier'}:{kind:'planned',label:`Prévue · ${waiting.time}`};
 return {kind:'unknown',label:'Aucun client enregistré'};
}

export function serviceIndicators(snapshot){
 const arrivals=findArrivals(snapshot);
 const next=arrivals.filter(row=>elapsedMinutes(snapshot,row)<=0&&elapsedMinutes(snapshot,row)>-15);
 const roomsToCheck=new Set(snapshot.reservations.filter(row=>
  (row.status==='seated'&&elapsedMinutes(snapshot,row)>=row.duration)||
  (isWaiting(row)&&row.date===snapshot.now.date&&elapsedMinutes(snapshot,row)>=20))
  .map(row=>row.id));
 return {covers:next.reduce((sum,row)=>sum+row.guests,0),groups:next.length,toCheck:roomsToCheck.size};
}

export function liveSnapshot(source,readPlan,stamp=Date.now()){
 const now=parisTime(stamp);
 const loaded=source.RestoSharedDataLoaded===true;
 const fresh=loaded&&source.navigator.onLine!==false&&['ok','readonly'].includes(source.RestoSyncState);
 const reservations=loaded?source.RestoSharedReservations:[];
 const {rooms,tables}=loaded?readPlan():{rooms:[],tables:[]};
 const service=currentService(source.ReservationEngine?.getShiftsForDate(now.date),now);
 const charge=fresh&&service?source.RestoRush?.evaluate({date:now.date,time:now.time,guests:0},reservations):null;
 return {now,service,reservations,tables,rooms,loaded,fresh,updatedAt:source.RestoLastSyncAt??null,
  charge:charge?.limit?charge:null};
}

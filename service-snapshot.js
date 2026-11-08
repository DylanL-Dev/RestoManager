// Pure preparation: a malformed collection cannot partially replace live state.
export function prepareServiceSnapshot(snapshot,decodeBookingDetails){
 const hours=snapshot.hours,shifts={};
 for(const key of ['lunch','dinner']){
  if(typeof hours?.[key+'_start']!=='string'||typeof hours?.[key+'_end']!=='string')throw Error('Horaires invalides.');
  shifts[key]={enabled:hours[key+'_enabled'],start:hours[key+'_start'].slice(0,5),end:hours[key+'_end'].slice(0,5)};
 }
 const byTable=new Map(snapshot.tables.map(t=>[t.id,t.label]));
 const number=id=>Number(String(byTable.get(id)||'').trim().replace(/^table\s*/i,''));
 const activeRooms=snapshot.rooms.filter(r=>r.active);
 if(!activeRooms.length)throw Error('Salle principale absente.');
 const rooms=activeRooms.map((r,i)=>({id:i===0?'main':r.id,name:r.name}));
 const roomIds=new Map(activeRooms.map((r,i)=>[r.id,i===0?'main':r.id]));
 const tables=snapshot.tables.filter(t=>t.active&&roomIds.has(t.room_id)).map(t=>({id:t.id,number:number(t.id),capacityMin:1,capacity:t.seats,roomId:roomIds.get(t.room_id)}));
 const assigned=new Map();
 for(const a of snapshot.assignments){
  if(!assigned.has(a.reservation_id))assigned.set(a.reservation_id,[]);
  if(Number.isInteger(number(a.table_id))&&number(a.table_id)>0)assigned.get(a.reservation_id).push(number(a.table_id));
 }
 const reservations=snapshot.reservations.map(r=>{
  const dt=new Date(r.starts_at);
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(dt).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const time=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(dt);
  const details=decodeBookingDetails(r.notes,r.hotel_room);
  return {id:r.id,client:r.guest_name||r.hotel_room||'Client',date:parts.year+'-'+parts.month+'-'+parts.day,time,guests:r.party_size,tables:assigned.get(r.id)||[],status:r.status==='departed'?'released':r.status,
   walkIn:!!r.walkin_type,type:r.walkin_type||details.type,confirmedAt:r.confirmed_at,arrivedAt:r.arrived_at,seatedAt:r.seated_at,releasedAt:r.released_at,
   duration:Math.round((new Date(r.ends_at)-dt)/60000),notes:details.notes,allergies:details.allergies,hotelRoom:r.hotel_room||'',editVersion:r.edit_version||null};
 });
 return {plan:{version:1,rooms,tables},values:{
  RestoSharedHours:{shifts,duration:hours.duration},RestoSharedReservations:reservations,
  RestoSmartPlacementTableIds:new Map(tables.map(t=>[t.number,t.id])),
  RestoDraftHolds:snapshot.holds.map(h=>({id:h.id,number:number(h.table_id),start:Date.parse(h.starts_at),end:Date.parse(h.ends_at),expiry:Date.parse(h.expires_at),team:h.draft_role==='reception'?'Réception':'Restaurant'})),
  RestoInactiveRestaurantTables:snapshot.tables.filter(t=>!t.active),
  RestoSharedRoomIds:new Map(activeRooms.map((r,i)=>[i===0?'main':r.id,r.id])),
  RestoFusionLinks:snapshot.fusionLinks.map(l=>[number(l.table_a),number(l.table_b)]).filter(p=>p.every(n=>Number.isInteger(n)&&tables.some(t=>t.number===n))),
  RestoServiceRevision:snapshot.revision,RestoServiceCapabilities:snapshot.capabilities
 }};
}

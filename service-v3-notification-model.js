'use strict';
/* Pure notification projection. No database access, mutation, or confidential preview. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RestoNotificationModel=api})(typeof window==='undefined'?globalThis:window,function(){
 const finalStates=new Set(['completed','released','departed','cancelled','no_show']);
 const paris=value=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 const day=value=>{const p=paris(value);return p.year+'-'+p.month+'-'+p.day};
 const dateTime=value=>{const d=new Date(value);return Number.isFinite(+d)?d.toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Horaire à vérifier'};
 const clock=value=>new Date(value).toLocaleTimeString('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});
 const scope=ctx=>ctx?.userId&&ctx?.restaurantId&&['fb_admin','reception'].includes(ctx.role)?[ctx.restaurantId,ctx.userId,ctx.role].map(encodeURIComponent).join(':'):null;
 const dismissible=item=>item.dismissible!==false&&item.source!=='sync'&&item.type!=='sync'&&!item.pending&&!item.update;
 // A new grouped event, changed estimate or increased priority must be seen again.
 const dismissalRevision=item=>JSON.stringify([item.revision||'',item.createdAt||0,item.type||'',item.priority||'normal']);
 const who=r=>r.hotelRoom?'Chambre '+r.hotelRoom:(r.client||'Client');
 function reminders({reservations=[],role,now=Date.now(),interval}){
  if(role!=='fb_admin')return [];
  const result=[],start=r=>{try{return Number(interval(r.date,r.time,r.duration||90)[0])}catch{return NaN}};
  for(const r of reservations){
   const expected=start(r);if(!Number.isFinite(expected))continue;
   const common={group:'service',reservationId:r.id,source:'reminder',context:'Service',action:'reservation',snoozable:true,read:false};
   if(['reserved','confirmed','late'].includes(r.status)&&r.date===day(now)){
    const delay=Math.floor((now-expected)/60000);if(delay<10)continue;
    result.push({...common,id:'late:'+r.id,type:'late',priority:delay>=20?'high':'normal',icon:'clock-3',title:'Arrivée à vérifier',body:who(r)+' · '+r.guests+' couvert'+(r.guests>1?'s':'')+(r.tables?.length?' · Table '+r.tables.join(' + '):'')+'. Attendu à '+r.time+', il y a '+delay+' min.',createdAt:expected+600000});
   }
   // Occupancy is physical: a seated table from yesterday is still occupied today.
   if(r.status==='seated'){
    const seated=r.seatedAt?Date.parse(r.seatedAt):expected;if(!Number.isFinite(seated))continue;
    const end=seated+(Number(r.duration)||90)*60000,remaining=Math.ceil((end-now)/60000);if(remaining>15)continue;
    const next=reservations.filter(x=>x.id!==r.id&&!finalStates.has(x.status)&&x.tables?.some(t=>r.tables?.includes(t))).map(x=>start(x)).filter(t=>Number.isFinite(t)&&t>=now).sort((a,b)=>a-b)[0];
    result.push({...common,id:'departure:'+r.id,type:'departure',priority:remaining<=-15||next&&next-now<=3600000?'high':'normal',icon:'utensils-crossed',title:'Fin de repas estimée',body:'Table '+(r.tables?.join(' + ')||'à vérifier')+' · '+who(r)+'. '+(remaining>0?'Fin estimée dans '+remaining+' min':remaining===0?'Fin estimée maintenant':'Fin estimée dépassée de '+Math.abs(remaining)+' min')+' (prévue à '+clock(end)+'). Vérifiez si les clients sont partis.'+(next?' Prochaine réservation à '+clock(next)+'.':''),createdAt:end-900000});
   }
  }
  return result;
 }
 function events({bookings=[],changes=[],reservations=[],role,now=Date.now()}){
  if(role!=='fb_admin')return [];
  const current=new Map(reservations.map(r=>[r.id,r])),groups=new Map();
  const rows=[...bookings.map(a=>({...a,source:'booking',event_type:'created'})),...changes.map(a=>({...a,source:'change'}))];
  const seen=new Set();
  for(const a of rows){
   const identity=a.source+':'+a.id;if(seen.has(identity)||!a.reservation_id)continue;seen.add(identity);
   const created=Date.parse(a.created_at)||0,readAt=Date.parse(a.read_at)||0;
   if(created&&now-created>7*86400000||readAt&&now-readAt>2*86400000)continue;
   const r=current.get(a.reservation_id);
   if(a.event_type==='created'&&r&&finalStates.has(r.status))continue;
   if(!groups.has(a.reservation_id))groups.set(a.reservation_id,[]);groups.get(a.reservation_id).push(a);
  }
  const result=[];
  for(const [id,rows] of groups){
   rows.sort((a,b)=>(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0)||(a.event_type==='cancelled'?-1:1));
   const a=rows[0],r=current.get(id),cancel=a.event_type==='cancelled',modified=a.event_type==='modified';
   const room=r?.hotelRoom||a.hotel_room,name=r?.client||a.guest_name||'Client';
   const fields=Array.isArray(a.changed_fields)?a.changed_fields:[];
   const details=[];if(modified){
    if(fields.includes('horaire'))details.push('Horaire : '+dateTime(a.previous_starts_at)+' → '+dateTime(a.starts_at));
    if(fields.includes('couverts'))details.push('Couverts : '+a.previous_party_size+' → '+a.party_size);
    if(fields.includes('chambre'))details.push('Chambre : '+(a.previous_hotel_room||'—')+' → '+(a.hotel_room||'—'));
    if(fields.includes('client'))details.push('Nom du client modifié');
    if(fields.includes('consignes'))details.push('Consignes ou allergies modifiées : consultez la réservation');
   }
   result.push({id:'event:'+id,type:a.event_type,source:'event',group:'service',priority:cancel?'high':'normal',icon:cancel?'calendar-x':modified?'calendar-clock':'calendar-plus',title:cancel?'Réservation annulée':modified?'Réservation modifiée':'Nouvelle réservation',body:(room?'Chambre '+room:name)+' · '+(r?.guests||a.party_size)+' couvert'+((r?.guests||a.party_size)>1?'s':'')+' · '+(r?r.date.split('-').reverse().join('/')+' '+r.time:dateTime(a.starts_at))+(details.length?'. '+details.join('. '):''),createdAt:Date.parse(a.created_at)||0,read:rows.every(r=>Boolean(r.read_at)),revision:rows.map(r=>r.source+':'+r.id).sort().join('|'),refs:rows.map(r=>({source:r.source,id:r.id})),reservationId:id,action:'reservation',context:'Réception',event:a,groupedCount:rows.length,snoozable:false});
  }
  return result;
 }
 function project(items,state={},now=Date.now()){
  const unique=new Map();for(const item of items){if(!item?.id)continue;const prev=unique.get(item.id);if(!prev||item.createdAt>prev.createdAt)unique.set(item.id,item)}
  const order={high:0,normal:1,low:2};
  return [...unique.values()].filter(n=>!dismissible(n)||state[n.id]?.dismissedRevision!==dismissalRevision(n)).map(n=>{const local=state[n.id]||{};return {...n,read:n.source==='event'?n.read:Boolean(local.readAt)||Boolean(n.read),snoozed:n.snoozable&&Number(local.snoozedUntil)>now}}).sort((a,b)=>(order[a.priority]??1)-(order[b.priority]??1)||Number(a.read)-Number(b.read)||b.createdAt-a.createdAt||a.id.localeCompare(b.id));
 }
 return {scope,paris,day,dateTime,reminders,events,project,dismissible,dismissalRevision};
});

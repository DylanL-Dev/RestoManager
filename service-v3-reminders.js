'use strict';
(function(){
 const KEY='restomanager_reservations',SNOOZE='restomanager_v3_reminder_snoozes';
 const bell=document.createElement('button');bell.type='button';bell.className='serviceBell';bell.setAttribute('aria-label','Rappels de service');bell.innerHTML='<i data-lucide="bell"></i><span class="serviceBellCount" hidden>0</span>';
 const panel=document.createElement('section');panel.className='serviceReminderPanel';panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-label','Notifications de service');
 (document.querySelector('.headerQuickActions')||document.querySelector('.top'))?.append(bell);document.body.append(panel);
 const connected=()=>Boolean(window.RestoSharedReservations);
 const read=()=>{if(connected())return ReservationEngine.normalizeReservations(window.RestoSharedReservations);try{return ReservationEngine.normalizeReservations(JSON.parse(localStorage.getItem(KEY)||'[]'))}catch{return []}};
 const snoozes=()=>{try{return JSON.parse(localStorage.getItem(SNOOZE)||'{}')}catch{return {}}};
 const sameDay=(d,now)=>d===now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
 const clock=d=>d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
 const button=(label,fn,kind)=>{const b=document.createElement('button');b.type='button';b.textContent=label;if(kind)b.className=kind;b.addEventListener('click',fn);return b};
 function collect(){
  if(window.RestoReception===true)return [];
  if(window.RestoSharedReservations && window.RestoReception!==false)return [];
  const now=new Date(),all=read(),sleep=snoozes(),alerts=[];
  for(const r of all){
   if(!sameDay(r.date,now)||!['reserved','confirmed','late'].includes(r.status))continue;
   const expected=new Date(r.date+'T'+r.time+':00');
   if(!Number.isFinite(expected.getTime()))continue;
   const delay=Math.floor((now.getTime()-expected.getTime())/60000);
   if(delay<10||Number(sleep['late:'+r.id])>now.getTime())continue;
   alerts.push({kind:'late',r,delay,priority:delay>=20});
  }
  for(const r of all){
   if(r.status!=='seated'||!sameDay(r.date,now))continue;
   const start=r.seatedAt?new Date(r.seatedAt):new Date(r.date+'T'+r.time+':00');
   if(!Number.isFinite(start.getTime()))continue;
   const end=new Date(start.getTime()+(Number(r.duration)||90)*60000);
   const remaining=Math.ceil((end.getTime()-now.getTime())/60000);
   if(remaining>15)continue;
   const next=all.filter(x=>x.id!==r.id&&x.date===r.date&&ReservationEngine.isBlocking(x)&&x.tables.some(t=>r.tables.includes(t))).map(x=>x.time).sort()[0];
   const priority=remaining<=-15||Boolean(next);
   if(Number(sleep[r.id])>now.getTime())continue;
   alerts.push({kind:'departure',r,end,remaining,next,priority});
  }
  return alerts.sort((a,b)=>Number(b.priority)-Number(a.priority)||(a.kind==='late'?-a.delay:a.remaining)-(b.kind==='late'?-b.delay:b.remaining));
 }
 function capacityAlert(){
  if(!window.RestoSupabaseReady||!window.RestoTablePressure?.availability||typeof TableStore==='undefined')return null;
  const all=read(),now=new Date();
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const today=parts.year+'-'+parts.month+'-'+parts.day;
  const current=Number(parts.hour)*60+Number(parts.minute);
  const future=all.filter(r=>r.date===today&&['reserved','confirmed','late','arrived'].includes(r.status)&&r.time&&Number(r.time.slice(0,2))*60+Number(r.time.slice(3,5))>=current-15);
  if(!future.length)return null;
  const slots=[...new Set(future.map(r=>r.time))].sort();
  const tablePlan=TableStore.get().tables;
  const results=slots.map(time=>({time,info:window.RestoTablePressure.availability({date:today,time,guests:2,tables:tablePlan,reservations:all,holds:window.RestoDraftHolds||[]})}))
    .filter(x=>x.info.valid&&x.info.total>0&&x.info.remaining<=3)
    .sort((a,b)=>a.info.remaining-b.info.remaining||a.time.localeCompare(b.time));
  return results[0]||null;
 }
 function openReservationFromAlert(a,view){
  const current=read().find(r=>r.id===a.reservation_id);
  const when=new Date(a.starts_at);
  const search=document.getElementById('reservationQuery');
  if(search){search.value=current?(current.hotelRoom||current.client):(a.hotel_room||a.guest_name||'');search.dispatchEvent(new Event('input',{bubbles:true}))}
  const date=document.getElementById('reservationDate');
  if(date&&current){
   date.value=current.date;date.dispatchEvent(new Event('change',{bubbles:true}));
  }else if(date&&Number.isFinite(when.getTime())){
   const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(when);
   const d=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
   date.value=d.year+'-'+d.month+'-'+d.day;
   date.dispatchEvent(new Event('change',{bubbles:true}));
  }
  window.dispatchEvent(new CustomEvent('restomanager:open-reservation',{
   detail:{view:current&&['completed','released','cancelled','no_show'].includes(current.status)?'departed':view,reservationId:a.reservation_id}
  }));
  window.RestoScreens?.show('reservations');
  panel.hidden=true;
 }
 function update(){
  const reception=window.RestoReception===true;
  const ready=window.RestoSupabaseReady&&typeof window.RestoReception==='boolean';
  const activeRestaurant=window.RestoReception===false&&ready;
  const bookingAlerts=activeRestaurant?(window.RestoFbReservationAlerts||[]).filter(a=>!a.read_at):[];
  const changeAlerts=activeRestaurant?(window.RestoFbChangeAlerts||[]).filter(a=>!a.read_at):[];
  const currentReservations=new Map(read().map(r=>[r.id,r]));
  const alerts=ready&&!reception?collect():[];
  const pressure=ready?capacityAlert():null;
  const total=alerts.length+bookingAlerts.length+changeAlerts.length+(pressure?1:0);
  bell.hidden=!ready;
  if(!ready){panel.hidden=true;return}
  const count=bell.querySelector('span');count.textContent=String(total);count.hidden=!total;
  bell.setAttribute('aria-label',total+' notification(s) '+(reception?'Réception':'Restaurant'));
  panel.replaceChildren();
  const head=document.createElement('div');head.className='serviceReminderHead';const h=document.createElement('strong');h.textContent=reception?'Notifications · Réception':'Notifications · Restaurant';head.append(h,button('Fermer',()=>{panel.hidden=true},'serviceReminderClose'));panel.append(head);
  if(!total){const p=document.createElement('p');p.textContent='Aucune nouvelle notification.';panel.append(p);return}
  if(pressure){
   const item=document.createElement('article');item.className='serviceReminderItem serviceCapacityWarning';
   const title=document.createElement('strong');title.textContent=pressure.info.remaining===0?'Créneau complet · '+pressure.time:'Peu de tables disponibles · '+pressure.time;
   const detail=document.createElement('p');detail.textContent=pressure.info.remaining===0?'Aucune table compatible libre pour 2 couverts à cet horaire.':'Seulement '+pressure.info.remaining+' table(s) encore compatible(s) pour 2 couverts à cet horaire. Vérifiez les disponibilités avant de proposer ce créneau.';
   const actions=document.createElement('div');actions.className='serviceReminderActions';
   actions.append(button('Voir les disponibilités',()=>{window.RestoScreens?.show('reservationForm');panel.hidden=true},'serviceReminderPrimary'));
   item.append(title,detail,actions);panel.append(item);
  }
  for(const a of changeAlerts){
   const item=document.createElement('article');item.className='serviceReminderItem serviceReceptionChangeAlert'+(a.event_type==='cancelled'?' isCancellation':'');
   const title=document.createElement('strong');
   title.textContent=a.event_type==='cancelled'?'Réservation annulée · Réception':'Réservation modifiée · Réception';
   const who=a.hotel_room?'Chambre '+a.hotel_room:(a.guest_name||'Client');
   const when=new Date(a.starts_at);
   const displayDate=value=>Number.isFinite(new Date(value).getTime())?new Date(value).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Horaire à vérifier';
   const detail=document.createElement('p');
   detail.textContent=who+' · '+a.party_size+' couvert(s) · '+displayDate(a.starts_at);
   item.append(title,detail);
   if(a.event_type==='modified'){
    const changes=[];
    const fields=Array.isArray(a.changed_fields)?a.changed_fields:[];
    if(fields.includes('horaire'))changes.push('Horaire : '+displayDate(a.previous_starts_at)+' → '+displayDate(a.starts_at));
    if(fields.includes('couverts'))changes.push('Couverts : '+a.previous_party_size+' → '+a.party_size);
    if(fields.includes('chambre'))changes.push('Chambre : '+(a.previous_hotel_room||'—')+' → '+(a.hotel_room||'—'));
    if(fields.includes('client'))changes.push('Nom du client modifié');
    if(fields.includes('consignes'))changes.push('Consignes ou allergies modifiées');
    if(changes.length){
     const summary=document.createElement('ul');summary.className='serviceChangeDetails';
     for(const text of changes){const line=document.createElement('li');line.textContent=text;summary.append(line)}
     item.append(summary);
    }
   }
   const actions=document.createElement('div');actions.className='serviceReminderActions';
   actions.append(button('Voir la réservation',async()=>{
    try{
     await window.RestoMarkFbChangeRead?.(a.id);
     openReservationFromAlert(a,a.event_type==='cancelled'?'departed':'active');
    }catch(err){await window.RestoDialog?.alert(err.message||'Ouverture impossible',{title:'Notification'});}
   },'serviceReminderPrimary'));
   actions.append(button('Marquer comme lue',async()=>{
    try{await window.RestoMarkFbChangeRead?.(a.id)}
    catch(err){await window.RestoDialog?.alert(err.message||'Action impossible',{title:'Notification'})}
   }));
   item.append(actions);panel.append(item);
  }
  for(const a of bookingAlerts){
   const current=currentReservations.get(a.reservation_id);
   const item=document.createElement('article');item.className='serviceReminderItem serviceReceptionBookingAlert';
   const title=document.createElement('strong');title.textContent='Nouvelle réservation · Réception';
   const when=new Date(a.starts_at);
   const time=current?current.date.split('-').reverse().join('/')+' '+current.time:Number.isFinite(when.getTime())?when.toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Horaire à vérifier';
   const room=current?current.hotelRoom:a.hotel_room,guest=current?current.client:a.guest_name;
   const detail=document.createElement('p');detail.textContent=(room?'Chambre '+room:guest)+' · '+(current?current.guests:a.party_size)+' couvert(s) · '+time;
   const actions=document.createElement('div');actions.className='serviceReminderActions';
   actions.append(button('Voir la réservation',async()=>{
    try{
     await window.RestoMarkFbAlertRead?.(a.id);
     openReservationFromAlert(a,'active');
    }catch(err){await window.RestoDialog?.alert(err.message||'Lecture impossible',{title:'Notification'});}
   },'serviceReminderPrimary'));
   actions.append(button('Marquer comme lue',async()=>{try{await window.RestoMarkFbAlertRead?.(a.id)}catch(err){await window.RestoDialog?.alert(err.message||'Action impossible',{title:'Notification'})}}));
   item.append(title,detail,actions);panel.append(item);
  }
  for(const a of alerts){
   const item=document.createElement('article');item.className='serviceReminderItem';
   if(a.kind==='late'){
    const title=document.createElement('strong');title.textContent='Client en retard · '+a.r.client+' · Table'+(a.r.tables.length>1?'s ':' ')+a.r.tables.join(' + ');
    const desc=document.createElement('p');desc.textContent='Attendu à '+a.r.time+' · '+a.delay+' min de retard. Vérifiez si le client est installé avant de modifier son statut.';
    const actions=document.createElement('div');actions.className='serviceReminderActions';
    const changeStatus=async(status)=>{const all=read(),idx=all.findIndex(r=>r.id===a.r.id);if(idx<0||!['reserved','confirmed','late'].includes(all[idx].status)){update();return}if(status==='late'&&all[idx].status==='late'){update();return}if(connected()){try{await window.RestoChangeSharedStatus(all[idx],status)}catch(error){await window.RestoDialog.alert(error.message||'Action impossible.',{title:'Action impossible'})}update();return}const result=ReservationEngine.transition(all[idx],status,undefined,all);if(!result.valid){window.RestoDialog.alert(result.error||'Action impossible.',{title:'Action impossible'});return}all[idx]=result.reservation;localStorage.setItem(KEY,JSON.stringify(all));window.dispatchEvent(new Event('restomanager:v3-change'));update()};
    if(a.r.status!=='late')actions.append(button('Signaler le retard',()=>changeStatus('late')));
    actions.append(button('Rappeler dans 10 min',()=>{const data=snoozes();data['late:'+a.r.id]=Date.now()+600000;localStorage.setItem(SNOOZE,JSON.stringify(data));update()}));
    item.append(title,desc,actions);panel.append(item);continue;
   }
   const title=document.createElement('strong');title.textContent=(a.priority?'⚠ ':'')+'Table'+(a.r.tables.length>1?'s ':' ')+a.r.tables.join(' + ')+' · '+a.r.client;
   const desc=document.createElement('p');desc.textContent=(a.remaining>0?'Départ estimé dans '+a.remaining+' min':a.remaining===0?'Fin estimée maintenant':'Fin estimée dépassée de '+Math.abs(a.remaining)+' min')+' (prévue à '+clock(a.end)+'). Vérifier si les clients sont partis.'+(a.next?' Prochaine réservation : '+a.next+'.':'');
   const actions=document.createElement('div');actions.className='serviceReminderActions';
   actions.append(button('Libérer la table',async()=>{
    if(!await window.RestoConfirmRelease(a.r))return;
    const all=read(),idx=all.findIndex(r=>r.id===a.r.id);if(idx<0||all[idx].status!=='seated'){update();return}
    if(connected()){try{await window.RestoChangeSharedStatus(all[idx],'released')}catch(error){await window.RestoDialog.alert(error.message||'Impossible de libérer cette table.',{title:'Libération impossible'})}update();return}
    const result=ReservationEngine.transition(all[idx],'released',undefined,all);
    if(!result.valid){window.RestoDialog.alert(result.error||'Impossible de libérer cette table.',{title:'Libération impossible'});return}
    all[idx]=result.reservation;localStorage.setItem(KEY,JSON.stringify(all));window.dispatchEvent(new Event('restomanager:v3-change'));update();
   },'serviceReminderPrimary'));
   actions.append(button('Toujours occupée · 10 min',()=>{const s=snoozes();s[a.r.id]=Date.now()+600000;localStorage.setItem(SNOOZE,JSON.stringify(s));update()}));
   item.append(title,desc,actions);panel.append(item);
  }
 }
 bell.addEventListener('click',()=>{panel.hidden=!panel.hidden;update()});
 window.addEventListener('restomanager:v3-change',update);
 window.addEventListener('restomanager:supabase-snapshot',update);
 window.addEventListener('restomanager:fb-alerts',update);
 window.addEventListener('storage',update);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)update()});
 setInterval(update,60000);update();
})();

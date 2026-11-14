'use strict';
/* RM-JOHN-07 — immediate arrival-pressure preview for reservations and walk-ins.
 * The advisory limit must be visible BEFORE the party size is chosen.
 * It is not a table-capacity measurement and never bypasses the large
 * confirmation in RestoRush.confirm for actual reservations.
 */
(function(){
 const bookings=document.getElementById('bookingForm');
 const passages=document.getElementById('walkinForm');
 if(!bookings&&!passages)return;
 function parisToday(){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const p=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return p.year+'-'+p.month+'-'+p.day;
 }
 function create(form,id,target,kind){
  if(!form||document.getElementById(id))return null;
  const section=document.createElement('section');
  section.id=id;section.className='rmArrivalPreview';
  section.setAttribute('role','status');section.setAttribute('aria-live','polite');
  const head=document.createElement('div');head.className='rmArrivalPreviewHead';
  const icon=document.createElement('i');icon.dataset.lucide='activity';icon.setAttribute('aria-hidden','true');
  const title=document.createElement('strong');title.textContent='Affluence des arrivées · en direct';
  head.append(icon,title);section.append(head);
  const body=document.createElement('p');body.className='rmArrivalPreviewText';section.append(body);
  const help=document.createElement('small');help.textContent='Indicateur du suivi des arrivées, indépendant des tables libres et du nombre de couverts que vous choisirez.';section.append(help);
  const place=form.querySelector(target);
  if(place)place.insertAdjacentElement(kind||'beforebegin',section);
  else form.prepend(section);
  return {section,body};
 }
 const booking=create(bookings,'rmBookingArrivalPreview','#rmDirectorTimeChoices','beforebegin');
 const walkin=create(passages,'rmWalkinArrivalPreview','.walkinGuestsField','beforebegin');
 function statusBox(target,date,time){
  if(!target)return;
  // A missing date or time cannot be interpreted as an empty service.
  if(!date||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(time||''))){
   target.section.dataset.level='unknown';
   target.body.textContent='Choisissez un créneau pour consulter les arrivées.';
   return;
  }
  const engine=window.ReservationEngine;
  if(engine&&typeof engine.isServiceOpen==='function'&&!engine.isServiceOpen(date,time)){
   target.section.dataset.level='closed';
   target.body.textContent='Service fermé à '+time+' : choisissez un créneau ouvert pour consulter les arrivées.';
   return;
  }
  const rush=window.RestoRush;
  const list=window.RestoSharedReservations;
  if(!rush||!Array.isArray(list)||!window.RestoSharedDataLoaded||navigator.onLine===false||window.RestoSyncState==='error'){
   target.section.dataset.level='unknown';target.body.textContent='Synchronisation des arrivées : informations à vérifier.';return;
  }
  let data;
  try {
   const normalized=window.ReservationEngine?.normalizeReservations?.(list)||list;
   if(typeof rush.evaluate!=='function')throw new Error('rush evaluator unavailable');
   data=rush.evaluate({date,time,guests:0},normalized);
  } catch(_){
   target.section.dataset.level='unknown';
   target.body.textContent='Synchronisation des arrivées : informations à vérifier.';
   return;
  }
  if(!data||data.invalid||!Number.isFinite(data.limit)||!Number.isFinite(data.current)){
   target.section.dataset.level='unknown';
   target.body.textContent='Aucun service ouvert à cette heure : le suivi des arrivées ne peut pas être calculé.';return;
  }
  const high=data.current>=Math.max(1,Math.ceil(data.limit*.8));
  const saturated=data.current>=data.limit;
  target.section.dataset.level=saturated?'saturated':high?'busy':'normal';
  const label=saturated?'Seuil conseillé atteint':high?'Arrivées nombreuses':'Arrivées fluides';
  target.body.textContent=time+' · '+data.current+'/'+data.limit+' couverts attendus sur cette heure — '+label+'.';
 }
 function parisNowTime(){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const p=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return p.hour+':'+p.minute;
 }
 function refresh(){
  const d=document.getElementById('bookingDate')?.value;
  const t=document.getElementById('bookingTime')?.value;
  if(booking)statusBox(booking,d,t);
  // Walk-in has no walkinTime input in MAIN: use actual Paris time instead of
  // showing a false "service closed" result for an empty time string.
  if(walkin)statusBox(walkin,parisToday(),document.getElementById('walkinTime')?.value||parisNowTime());
 }
 for(const id of ['bookingDate','bookingTime','walkinTime']){
  const input=document.getElementById(id);
  for(const ev of ['change','input'])input?.addEventListener(ev,refresh);
 }
 for(const name of ['restomanager:supabase-snapshot','restomanager:v3-change','restomanager:hours','restomanager:connection-state','restomanager:screen'])
  window.addEventListener(name,refresh);
 window.addEventListener('focus',refresh);
 window.RestoArrivalPreviewRefresh=refresh;
 refresh();
 window.lucide?.createIcons?.();
})();

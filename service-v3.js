'use strict';
(function(){
const $=id=>document.getElementById(id);
const today=()=>{const d=new Date();if(d.getHours()<1)d.setDate(d.getDate()-1);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const date=today();$('serviceDate').textContent=new Date(date+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
let plan,bookings;try{plan=FloorPlan.get();const raw=JSON.parse(localStorage.getItem('restomanager_reservations')||'[]');bookings=ReservationEngine.normalizeReservations(raw).filter(r=>r.date===date)}catch(e){$('tableGrid').textContent='Données indisponibles : '+e.message;return}
const rooms=plan.rooms||[];rooms.forEach(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.name;$('roomFilter').append(o)});
let filter='all',selected=null;
const detailNode=$('detail');
const modal=document.createElement('div');modal.className='tableDetailModal';modal.hidden=true;
modal.innerHTML='<div class="tableDetailBackdrop"></div><section class="tableDetailSheet" role="dialog" aria-modal="true" aria-labelledby="tableDetailHeading" tabindex="-1"><div class="tableDetailSheetHeader"><div><small>GESTION DU SERVICE</small><h2 id="tableDetailHeading">Détails de la table</h2></div><button class="tableDetailClose" type="button" aria-label="Fermer les détails">✕</button></div><div class="tableDetailSheetBody"></div></section>';
document.body.append(modal);modal.querySelector('.tableDetailSheetBody').append(detailNode);
let returnFocus=null;
function closeTable(){if(modal.hidden)return;modal.hidden=true;document.body.classList.remove('tableDetailOpen');returnFocus?.focus();returnFocus=null}
function openTable(t,s,trigger){selected=t.number;detail(t,s);returnFocus=trigger;modal.querySelector('#tableDetailHeading').textContent=s.booking&&s.booking.tables.length>1?'Tables '+s.booking.tables.join(' + '):'Table '+t.number;modal.hidden=false;document.body.classList.add('tableDetailOpen');modal.querySelector('.tableDetailClose').focus()}
modal.querySelector('.tableDetailClose').addEventListener('click',closeTable);
modal.querySelector('.tableDetailBackdrop').addEventListener('click',closeTable);
document.addEventListener('keydown',e=>{if(modal.hidden)return;if(e.key==='Escape'){e.preventDefault();closeTable()}if(e.key==='Tab'){const controls=[...modal.querySelectorAll('button:not([disabled])')];if(!controls.length)return;const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});

const active=r=>ReservationEngine.isBlocking(r);
const priority={seated:4,arrived:3,late:2,confirmed:2,reserved:2};
function state(table){const related=bookings.filter(r=>r.tables.includes(table.number)&&active(r));const top=related.slice().sort((a,b)=>(priority[b.status]||0)-(priority[a.status]||0)||a.time.localeCompare(b.time))[0];if(!top)return {key:'free',label:'LIBRE',detail:'Disponible',booking:null};const key=top.status==='seated'?'present':top.status==='arrived'?'arrived':'expected';return {key,label:{present:'PRÉSENTS',arrived:'ARRIVÉS',expected:'ATTENDUS'}[key],detail:key==='expected'?top.time:top.guests+' personne'+(top.guests>1?'s':''),booking:top}}
function node(tag,className,content){const e=document.createElement(tag);if(className)e.className=className;if(content!==undefined)e.textContent=String(content);return e}
function render(){const visible=plan.tables.filter(t=>t.roomId===$('roomFilter').value);const states=visible.map(t=>({t,s:state(t)}));const shown=states.filter(x=>filter==='all'||x.s.key===filter);const seen=new Set();const cards=[];for(const {t,s} of shown){const r=s.booking;const fused=r&&r.tables.length>1;if(fused){if(seen.has(r.id))continue;seen.add(r.id)}const numbers=fused?r.tables:[t.number];const total=fused?numbers.reduce((sum,n)=>sum+(plan.tables.find(x=>x.number===n)?.capacity||0),0):t.capacity;const b=node('button','tableCard '+s.key+(fused?' groupedFusionCard':''));b.type='button';b.append(node('span','num',fused?'Tables '+numbers.join(' + '):'Table '+t.number),node('span','status',s.label),node('span','info',fused?r.time+' · '+r.guests+' couvert(s)':s.detail),node('span','capacity',fused?total+' places réunies':(t.capacityMin||1)+' – '+t.capacity+' places'));if(fused&&total>r.guests)b.append(node('span','fusionCoverHint','Retirer '+(total-r.guests)+' couvert(s)'));b.addEventListener('click',()=>openTable(t,s,b));cards.push(b)}$('tableGrid').replaceChildren(...cards);if(!cards.length)$('tableGrid').append(node('p','muted','Aucune table pour ce filtre.'));
const all=plan.tables.map(t=>({t,s:state(t)}));const seated=bookings.filter(r=>r.status==='seated');const arrived=bookings.filter(r=>r.status==='arrived');const waiting=bookings.filter(r=>['reserved','confirmed','late'].includes(r.status));const occupiedNumbers=new Set(bookings.filter(r=>['seated','arrived'].includes(r.status)).flatMap(r=>r.tables));const free=all.filter(x=>!occupiedNumbers.has(x.t.number)).reduce((n,x)=>n+(x.t.capacity||0),0);const kpis=[['Clients présents',seated.reduce((n,r)=>n+r.guests,0)],['Clients arrivés',arrived.reduce((n,r)=>n+r.guests,0)],['Clients attendus',waiting.reduce((n,r)=>n+r.guests,0)],['Capacité non occupée',free]];$('kpis').replaceChildren(...kpis.map(([label,value])=>{const c=node('div','kpi');c.append(node('span','',label),node('strong','',value));return c}));
$('upcoming').replaceChildren(...waiting.sort((a,b)=>a.time.localeCompare(b.time)).slice(0,8).map(r=>{const c=node('div','arrival');c.append(node('b','',r.time+' · '+r.client),node('small','',r.guests+' pers. · Table'+(r.tables.length>1?'s ':' ')+r.tables.join(' + ')));return c}));if(!waiting.length)$('upcoming').textContent='Aucune arrivée en attente.';if(selected){const t=plan.tables.find(t=>t.number===selected);if(t)detail(t,state(t))}}
function occupationProgress(r){
 const scheduled=new Date(r.date+'T'+r.time+':00').getTime();
 const actual=r.seatedAt?new Date(r.seatedAt).getTime():NaN;
 const start=Number.isFinite(actual)&&r.status==='seated'?actual:scheduled;
 const duration=(Number(r.duration)||ReservationEngine.DEFAULT_DURATION)*60000;
 const now=Date.now(),remaining=Math.ceil((start+duration-now)/60000);
 const percent=Math.max(0,Math.min(100,(now-start)/duration*100));
 const card=node('div','tableTimeProgress');
 const head=node('div','tableTimeProgressHead');
 head.append(node('strong','',r.status==='seated'?'Temps de présence prévu':'Créneau théorique'));
 head.append(node('span','',now<start?'Installation prévue à '+r.time:remaining>0?remaining+' min restantes':remaining===0?'Fin théorique atteinte':Math.abs(remaining)+' min de dépassement'));
 const track=node('div','tableTimeProgressTrack'),fill=node('div','tableTimeProgressFill'+(remaining<0?' overdue':''));fill.style.width=percent+'%';track.setAttribute('role','progressbar');track.setAttribute('aria-label','Progression du temps de réservation prévu');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');track.setAttribute('aria-valuenow',String(Math.round(percent)));track.append(fill);
 const foot=node('div','tableTimeProgressFoot');const end=new Date(start+duration);const endLabel=String(end.getHours()).padStart(2,'0')+':'+String(end.getMinutes()).padStart(2,'0');const startDate=new Date(start);const startLabel=String(startDate.getHours()).padStart(2,'0')+':'+String(startDate.getMinutes()).padStart(2,'0');foot.append(node('span','',startLabel+(Number.isFinite(actual)?' · Installation réelle':' · Début prévu')),node('span','',endLabel+' · Fin estimée'));
 card.append(head,track,foot);
 if(r.status==='seated')card.append(node('small','tableTimeProgressHint',now<start?'Le créneau n’a pas encore commencé.':'Estimation : les clients restent installés jusqu’à validation de leur départ.'));
 return card;
}
function detail(t,s){const box=$('detail');const fusion=s.booking&&s.booking.tables.length>1?s.booking:null;const capacity=fusion?fusion.tables.reduce((sum,n)=>sum+(plan.tables.find(x=>x.number===n)?.capacity||0),0):t.capacity;box.replaceChildren(node('strong','',fusion?'Tables '+fusion.tables.join(' + ')+' · '+s.label:'Table '+t.number+' · '+s.label),node('p','muted',fusion?'Capacité totale : '+capacity+' places · '+fusion.guests+' couvert(s) réservé(s)':'Capacité : '+(t.capacityMin||1)+' à '+t.capacity+' places'));const list=bookings.filter(r=>r.tables.includes(t.number)).sort((a,b)=>a.time.localeCompare(b.time));if(!list.length){box.append(node('p','muted','Aucune réservation pour ce service.'))}
const actions=node('div','tableDetailActions');
function shortcut(label,id,tableId){
 const button=node('button','tableDetailAction',label);button.type='button';button.addEventListener('click',()=>{
 closeTable();window.RestoScreens?.show(id);const panel=$(id);if(!panel)return;panel.open=true;
 const select=$(tableId);if(select){select.value=String(t.number);select.dispatchEvent(new Event('change',{bubbles:true}))}
 panel.scrollIntoView({behavior:'smooth',block:'start'});
 const chosen=$(tableId);if(chosen&&!Array.from(chosen.options).some(o=>o.value===String(t.number))){$('bookingFeedback').textContent='Cette table n’est pas disponible pour le créneau sélectionné.'}
 });actions.append(button);
}
if(s.key==='free'){shortcut('＋ Réserver cette table','reservationForm','bookingTable');shortcut('＋ Installer un passage','passages','walkinTable');box.append(actions)}else{box.append(node('p','tableAlreadyReserved','Table attribuée : utilisez les actions de la réservation ci-dessous. Pour un autre créneau, passez par Ajouter.'))}
if(!list.length)return;
const labels={reserved:'Attendu',confirmed:'Confirmé',late:'En retard',arrived:'Arrivé',seated:'Installé',completed:'Terminé',released:'Libéré',cancelled:'Annulé',no_show:'Absent'};
const choices={reserved:[['arrived','✓ Client arrivé'],['seated','Installer'],['late','Signaler un retard'],['no_show','Absent']],confirmed:[['arrived','✓ Client arrivé'],['seated','Installer'],['late','Signaler un retard'],['no_show','Absent']],late:[['arrived','✓ Client arrivé'],['seated','Installer'],['no_show','Absent']],arrived:[['seated','Installer à table']],seated:[['completed','Terminer le passage'],['released','Libérer la table']]};
list.forEach(r=>{
 const row=node('div','detailLine');
 row.append(node('strong','',r.time+' · '+r.guests+' personne(s)'),node('span','',r.client+' · '+(labels[r.status]||r.status)));
 if(r.status==='seated')row.append(occupationProgress(r));
 if(r.tables.length>1){const total=r.tables.reduce((sum,n)=>sum+(plan.tables.find(x=>x.number===n)?.capacity||0),0);row.append(node('span','fusionDetailNote','Tables fusionnées : '+r.tables.join(' + ')));if(total>r.guests)row.append(node('span','fusionCoverHint','Préparation : retirer '+(total-r.guests)+' couvert(s)'))}const controls=node('div','tableStatusActions');
 (choices[r.status]||[]).forEach(([kind,label])=>{
 const button=node('button','tableStatusAction',label);button.type='button';
 button.addEventListener('click',()=>{
 if(['completed','released','no_show'].includes(kind)&&!confirm('Confirmer : '+label.toLowerCase()+' pour '+r.client+' ?'))return;
 try{
 const all=readReservations(),index=all.findIndex(x=>x.id===r.id);if(index<0)throw Error('Réservation introuvable.');
 const result=ReservationEngine.transition(all[index],kind);if(!result.valid)throw Error(result.error);
 all[index]=result.reservation;localStorage.setItem('restomanager_reservations',JSON.stringify(all));
 window.dispatchEvent(new Event('restomanager:v3-change'));
 const table=plan.tables.find(x=>x.number===t.number);if(table)detail(table,state(table));
 }catch(error){const warning=node('p','tableActionError',error.message);row.append(warning)}
 });controls.append(button);
 });
 row.append(controls);box.append(row);
 });
}
function refreshAvailability(){
 const dateValue=$('bookingDate').value,time=$('bookingTime').value,guests=Number($('bookingGuests').value),select=$('bookingTable'),previous=select.value;
 const insight=$('availabilityInsight'),fusionPanel=$('fusionSuggestions');
 if(insight)insight.replaceChildren();
 if(fusionPanel)fusionPanel.replaceChildren();
 select.replaceChildren();window.RestoFusionSelected=null;select.required=true;
 if(!dateValue||!time||!Number.isInteger(guests)||guests<1)return;
 const reservationsAll=readReservations(),duration=ReservationEngine.DEFAULT_DURATION;
 const suitable=plan.tables.filter(t=>t.capacity>=guests&&(t.capacityMin||1)<=guests).sort((a,b)=>a.capacity-b.capacity||a.number-b.number);
 const pairs=window.RestoFusion?window.RestoFusion.pairs():[];
 const configured=pairs.map(pair=>{
  const tables=pair.map(n=>plan.tables.find(t=>t.number===n));
  if(tables.some(t=>!t))return null;
  return {pair,capacity:tables.reduce((sum,t)=>sum+t.capacity,0)};
 }).filter(x=>x&&x.capacity>=guests);
 function candidate(at,tables){return {id:'availability-preview',type:$('bookingType').value,client:$('bookingClient').value.trim()||'Simulation',date:dateValue,time:at,guests,duration,tables,status:'reserved'};}
 function matches(at){
  const singles=suitable.filter(t=>ReservationEngine.validate(candidate(at,[t.number]),reservationsAll).valid);
  const fusions=configured.filter(x=>ReservationEngine.validate(candidate(at,x.pair),reservationsAll).valid);
  return {singles,fusions};
 }
 const available=matches(time),options=available.singles,fusions=available.fusions;
 options.forEach((t,i)=>{const option=document.createElement('option');option.value=t.number;option.textContent='Table '+t.number+' · '+(t.capacityMin||1)+'–'+t.capacity+' places'+(i===0?' · Recommandée':'');select.append(option)});
 if(options.some(t=>String(t.number)===previous))select.value=previous;
 if(!options.length){const o=document.createElement('option');o.value='';o.textContent=fusions.length?'Choisir une fusion ci-dessous':'Aucune table disponible';select.append(o)}
 if(fusionPanel){
  if(fusions.length){
   fusionPanel.append(node('strong','','Fusions autorisées disponibles'));
   // Smaller groups first: do not waste four tables on a party of two.
   fusions.sort((a,b)=>a.capacity-b.capacity||a.pair.length-b.pair.length);
   fusions.forEach(({pair,capacity})=>{
    const button=node('button','fusionSuggestion','Tables '+pair.join(' + ')+' · '+capacity+' places'+(capacity>guests?' · Retirer '+(capacity-guests)+' couvert(s)':''));
    button.type='button';
    button.addEventListener('click',()=>{window.RestoFusionSelected=pair.slice();select.required=false;fusionPanel.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===button));$('bookingFeedback').textContent='Fusion sélectionnée : tables '+pair.join(' + ')+'. Confirmez avec Ajouter la réservation.'});
    fusionPanel.append(button);
   });
  }else fusionPanel.append(node('p','muted','Aucune fusion configurée disponible pour ce créneau.'));
 }
 window.RestoTableChoices?.refresh('bookingTable');
 if(!insight)return;
 const total=options.length+fusions.length;
 insight.append(node('p','availabilitySummary',total?options.length+' table(s) individuelle(s) et '+fusions.length+' fusion(s) compatibles à '+time+'.':'Aucune configuration compatible à '+time+'.'));
 if(!total){
  insight.append(node('p','availabilityWarning','Aucune table ou fusion autorisée disponible pour '+guests+' couvert(s) à cet horaire.'));
  const current=Number(time.slice(0,2))*60+Number(time.slice(3,5)),alternatives=[];
  for(const delta of [-60,-30,30,60,90]){
   const mins=current+delta;if(mins<0||mins>=24*60)continue;
   const at=String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');
   const found=matches(at),count=found.singles.length+found.fusions.length;
   if(count)alternatives.push({at,count});
  }
  if(alternatives.length){
   insight.append(node('p','availabilityAlternativesTitle','Autres horaires disponibles :'));
   const choices=node('div','availabilityAlternatives');
   alternatives.forEach(({at,count})=>{const button=node('button','availabilityTimeOption',at+' · '+count+' possibilité(s)');button.type='button';button.addEventListener('click',()=>{$('bookingTime').value=at;refreshAvailability()});choices.append(button)});
   insight.append(choices);
  }else insight.append(node('p','muted','Aucune configuration compatible dans les créneaux proches testés. Essayez une autre date.'));
 }
}
function readReservations(){const raw=JSON.parse(localStorage.getItem('restomanager_reservations')||'[]');return ReservationEngine.normalizeReservations(raw)}
$('bookingDate').value=date;
$('bookingTime').value='19:00';
['bookingDate','bookingTime','bookingGuests','bookingType','bookingClient'].forEach(id=>$(id).addEventListener('change',refreshAvailability));
$('bookingForm').addEventListener('submit',async event=>{
 event.preventDefault();const feedback=$('bookingFeedback');feedback.textContent='';
 try{
 const existing=readReservations(),table=Number($('bookingTable').value),guests=Number($('bookingGuests').value);
 if($('bookingDate').value<today())throw Error('Impossible de créer une réservation à une date passée.');
 const fusion=window.RestoFusionSelected;const candidate={id:'v3-'+Date.now()+'-'+Math.random().toString(36).slice(2),type:$('bookingType').value,client:$('bookingClient').value.trim(),date:$('bookingDate').value,time:$('bookingTime').value,guests,duration:ReservationEngine.DEFAULT_DURATION,tables:Array.isArray(fusion)&&fusion.length>=2?fusion:[table],status:'reserved'};
 if(fusion&&(!window.RestoFusion||!window.RestoFusion.pairs().some(p=>p.slice().sort().join(':')===fusion.slice().sort().join(':'))))throw Error('Fusion non autorisée.');
 const result=ReservationEngine.validate(candidate,existing);
 if(!result.valid){feedback.textContent=result.errors.join(' ');refreshAvailability();return}
 const latest=readReservations(),again=ReservationEngine.validate(candidate,latest);
 if(!again.valid){feedback.textContent=again.errors.join(' ');refreshAvailability();return}
 const warnings=ReservationEngine.seatingWarnings(candidate,latest);
 if(warnings.length){
  const accepted=await window.RestoConfirmSeating(warnings,candidate.client,candidate.time);
  if(!accepted){feedback.textContent='Attribution annulée : aucune réservation créée.';return}
  const current=readReservations(),recheck=ReservationEngine.validate(candidate,current);
  if(!recheck.valid){feedback.textContent=recheck.errors.join(' ');refreshAvailability();return}
  if(JSON.stringify(ReservationEngine.seatingWarnings(candidate,current))!==JSON.stringify(warnings)){feedback.textContent='La situation des tables a changé. Recommencez la confirmation.';refreshAvailability();return}
  candidate.seatingOverride={confirmedAt:new Date().toISOString(),warnings:warnings.map(w=>({id:w.id,client:w.client,plannedEnd:w.plannedEnd,gapMinutes:w.gapMinutes}))};
  localStorage.setItem('restomanager_reservations',JSON.stringify(current.concat(candidate)));
  bookings=readReservations().filter(r=>r.date===date);window.dispatchEvent(new Event('restomanager:v3-change'));feedback.textContent='Réservation enregistrée avec confirmation : table(s) '+candidate.tables.join(' + ')+' à '+candidate.time+'.';window.RestoFusionSelected=null;refreshAvailability();render();return;
 }
 localStorage.setItem('restomanager_reservations',JSON.stringify(latest.concat(candidate)));
 bookings=readReservations().filter(r=>r.date===date);window.dispatchEvent(new Event('restomanager:v3-change'));feedback.textContent='Réservation enregistrée : table(s) '+candidate.tables.join(' + ')+' à '+candidate.time+'.';window.RestoFusionSelected=null;refreshAvailability();render();
 }catch(error){feedback.textContent='Enregistrement impossible : '+error.message}
});
refreshAvailability();
window.addEventListener('restomanager:v3-tables',()=>{plan=FloorPlan.get();refreshAvailability();render()});
window.addEventListener('restomanager:v3-change',()=>{try{bookings=readReservations().filter(r=>r.date===date);refreshAvailability();render()}catch(e){$('bookingFeedback').textContent=e.message}});
$('roomFilter').addEventListener('change',render);$('filters').addEventListener('click',e=>{const b=e.target.closest('button[data-filter]');if(!b)return;filter=b.dataset.filter;$('filters').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));render()});window.addEventListener('storage',e=>{if(e.key==='restomanager_reservations'||e.key==='restomanager_floor_plan_v1')location.reload()});
setInterval(()=>{if(!modal.hidden&&selected){const t=plan.tables.find(x=>x.number===selected);if(t)detail(t,state(t))}},60000);
render();
})();
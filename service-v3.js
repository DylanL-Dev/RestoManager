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
function openTable(t,s,trigger){selected=t.number;detail(t,s);returnFocus=trigger;modal.querySelector('#tableDetailHeading').textContent='Table '+t.number;modal.hidden=false;document.body.classList.add('tableDetailOpen');modal.querySelector('.tableDetailClose').focus()}
modal.querySelector('.tableDetailClose').addEventListener('click',closeTable);
modal.querySelector('.tableDetailBackdrop').addEventListener('click',closeTable);
document.addEventListener('keydown',e=>{if(modal.hidden)return;if(e.key==='Escape'){e.preventDefault();closeTable()}if(e.key==='Tab'){const controls=[...modal.querySelectorAll('button:not([disabled])')];if(!controls.length)return;const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});

const active=r=>ReservationEngine.isBlocking(r);
const priority={seated:4,arrived:3,late:2,confirmed:2,reserved:2};
function state(table){const related=bookings.filter(r=>r.tables.includes(table.number)&&active(r));const top=related.slice().sort((a,b)=>(priority[b.status]||0)-(priority[a.status]||0)||a.time.localeCompare(b.time))[0];if(!top)return {key:'free',label:'LIBRE',detail:'Disponible',booking:null};const key=top.status==='seated'?'present':top.status==='arrived'?'arrived':'expected';return {key,label:{present:'PRÉSENTS',arrived:'ARRIVÉS',expected:'ATTENDUS'}[key],detail:key==='expected'?top.time:top.guests+' personne'+(top.guests>1?'s':''),booking:top}}
function node(tag,className,content){const e=document.createElement(tag);if(className)e.className=className;if(content!==undefined)e.textContent=String(content);return e}
function render(){const visible=plan.tables.filter(t=>t.roomId===$('roomFilter').value);const states=visible.map(t=>({t,s:state(t)}));const shown=states.filter(x=>filter==='all'||x.s.key===filter);$('tableGrid').replaceChildren(...shown.map(({t,s})=>{const b=node('button','tableCard '+s.key);b.type='button';b.append(node('span','num','Table '+t.number),node('span','status',s.label),node('span','info',s.detail),node('span','capacity',(t.capacityMin||1)+' – '+t.capacity+' places'));b.addEventListener('click',()=>openTable(t,s,b));return b}));if(!shown.length)$('tableGrid').append(node('p','muted','Aucune table pour ce filtre.'));
const all=plan.tables.map(t=>({t,s:state(t)}));const seated=bookings.filter(r=>r.status==='seated');const arrived=bookings.filter(r=>r.status==='arrived');const waiting=bookings.filter(r=>['reserved','confirmed','late'].includes(r.status));const occupiedNumbers=new Set(bookings.filter(r=>['seated','arrived'].includes(r.status)).flatMap(r=>r.tables));const free=all.filter(x=>!occupiedNumbers.has(x.t.number)).reduce((n,x)=>n+(x.t.capacity||0),0);const kpis=[['Clients présents',seated.reduce((n,r)=>n+r.guests,0)],['Clients arrivés',arrived.reduce((n,r)=>n+r.guests,0)],['Clients attendus',waiting.reduce((n,r)=>n+r.guests,0)],['Capacité non occupée',free]];$('kpis').replaceChildren(...kpis.map(([label,value])=>{const c=node('div','kpi');c.append(node('span','',label),node('strong','',value));return c}));
$('upcoming').replaceChildren(...waiting.sort((a,b)=>a.time.localeCompare(b.time)).slice(0,8).map(r=>{const c=node('div','arrival');c.append(node('b','',r.time+' · '+r.client),node('small','',r.guests+' pers. · Table'+(r.tables.length>1?'s ':' ')+r.tables.join(' + ')));return c}));if(!waiting.length)$('upcoming').textContent='Aucune arrivée en attente.';if(selected){const t=plan.tables.find(t=>t.number===selected);if(t)detail(t,state(t))}}
function detail(t,s){const box=$('detail');box.replaceChildren(node('strong','','Table '+t.number+' · '+s.label),node('p','muted','Capacité : '+(t.capacityMin||1)+' à '+t.capacity+' places'));const list=bookings.filter(r=>r.tables.includes(t.number)).sort((a,b)=>a.time.localeCompare(b.time));if(!list.length){box.append(node('p','muted','Aucune réservation pour ce service.'))}
const actions=node('div','tableDetailActions');
function shortcut(label,id,tableId){
 const button=node('button','tableDetailAction',label);button.type='button';button.addEventListener('click',()=>{
 closeTable();window.RestoScreens?.show(id);const panel=$(id);if(!panel)return;panel.open=true;
 const select=$(tableId);if(select){select.value=String(t.number);select.dispatchEvent(new Event('change',{bubbles:true}))}
 panel.scrollIntoView({behavior:'smooth',block:'start'});
 const chosen=$(tableId);if(chosen&&!Array.from(chosen.options).some(o=>o.value===String(t.number))){$('bookingFeedback').textContent='Cette table n’est pas disponible pour le créneau sélectionné.'}
 });actions.append(button);
}
shortcut('＋ Réserver cette table','reservationForm','bookingTable');
shortcut('＋ Installer un passage','passages','walkinTable');
box.append(actions);
if(!list.length)return;
const labels={reserved:'Attendu',confirmed:'Confirmé',late:'En retard',arrived:'Arrivé',seated:'Installé',completed:'Terminé',released:'Libéré',cancelled:'Annulé',no_show:'Absent'};
const choices={reserved:[['arrived','✓ Client arrivé'],['seated','Installer'],['late','Signaler un retard'],['no_show','Absent']],confirmed:[['arrived','✓ Client arrivé'],['seated','Installer'],['late','Signaler un retard'],['no_show','Absent']],late:[['arrived','✓ Client arrivé'],['seated','Installer'],['no_show','Absent']],arrived:[['seated','Installer à table']],seated:[['completed','Terminer le passage'],['released','Libérer la table']]};
list.forEach(r=>{
 const row=node('div','detailLine');
 row.append(node('strong','',r.time+' · '+r.guests+' personne(s)'),node('span','',r.client+' · '+(labels[r.status]||r.status)));
 const controls=node('div','tableStatusActions');
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
 const insight=$('availabilityInsight');if(insight)insight.replaceChildren();
 select.replaceChildren();
 if(!dateValue||!time||!Number.isInteger(guests)||guests<1)return;
 const reservationsAll=readReservations(),duration=ReservationEngine.DEFAULT_DURATION;
 const suitable=plan.tables.filter(t=>t.capacity>=guests&&(t.capacityMin||1)<=guests).sort((a,b)=>a.capacity-b.capacity||a.number-b.number);
 function matches(at){
  return suitable.filter(t=>{
   const candidate={id:'candidate',type:$('bookingType').value,client:$('bookingClient').value.trim()||'Simulation',date:dateValue,time:at,guests,duration,tables:[t.number],status:'reserved'};
   return ReservationEngine.validate(candidate,reservationsAll).valid;
  });
 }
 const options=matches(time);
 options.forEach((t,i)=>{const option=document.createElement('option');option.value=t.number;option.textContent='Table '+t.number+' · '+(t.capacityMin||1)+'–'+t.capacity+' places'+(i===0?' · Recommandée':'');select.append(option)});
 if(options.some(t=>String(t.number)===previous))select.value=previous;
 if(!options.length){const o=document.createElement('option');o.value='';o.textContent='Aucune table disponible';select.append(o)}
 window.RestoTableChoices?.refresh('bookingTable');
 if(!insight)return;
 const summary=node('p','availabilitySummary',options.length?options.length+' table(s) compatible(s) à '+time+' · Meilleure capacité proposée en premier.':'Aucune table compatible à '+time+'.');
 insight.append(summary);
 if(suitable.length&&options.length<=Math.max(1,Math.floor(suitable.length*.2))){insight.append(node('p','availabilityWarning',options.length?'Créneau presque complet pour '+guests+' couvert(s).':'Créneau complet pour '+guests+' couvert(s).'))}
 if(options.length===0){
  const current=Number(time.slice(0,2))*60+Number(time.slice(3,5)),alternatives=[];
  for(const delta of [-60,-30,30,60,90]){const mins=current+delta;if(mins<0||mins>=24*60)continue;const at=String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');const available=matches(at);if(available.length)alternatives.push({at,count:available.length})}
  if(alternatives.length){insight.append(node('p','availabilityAlternativesTitle','Autres horaires disponibles :'));const choices=node('div','availabilityAlternatives');alternatives.forEach(({at,count})=>{const b=node('button','availabilityTimeOption',at+' · '+count+' table(s)');b.type='button';b.addEventListener('click',()=>{$('bookingTime').value=at;refreshAvailability()});choices.append(b)});insight.append(choices)}
  else insight.append(node('p','muted','Aucun horaire compatible dans les créneaux proches testés. Essayez une autre date.'));
 }
}
function readReservations(){const raw=JSON.parse(localStorage.getItem('restomanager_reservations')||'[]');return ReservationEngine.normalizeReservations(raw)}
$('bookingDate').value=date;
$('bookingTime').value='19:00';
['bookingDate','bookingTime','bookingGuests','bookingType','bookingClient'].forEach(id=>$(id).addEventListener('change',refreshAvailability));
$('bookingForm').addEventListener('submit',event=>{
 event.preventDefault();const feedback=$('bookingFeedback');feedback.textContent='';
 try{
 const existing=readReservations(),table=Number($('bookingTable').value),guests=Number($('bookingGuests').value);
 const candidate={id:'v3-'+Date.now()+'-'+Math.random().toString(36).slice(2),type:$('bookingType').value,client:$('bookingClient').value.trim(),date:$('bookingDate').value,time:$('bookingTime').value,guests,duration:ReservationEngine.DEFAULT_DURATION,tables:[table],status:'reserved'};
 const result=ReservationEngine.validate(candidate,existing);
 if(!result.valid){feedback.textContent=result.errors.join(' ');refreshAvailability();return}
 const latest=readReservations(),again=ReservationEngine.validate(candidate,latest);
 if(!again.valid){feedback.textContent=again.errors.join(' ');refreshAvailability();return}
 localStorage.setItem('restomanager_reservations',JSON.stringify(latest.concat(candidate)));
 bookings=readReservations().filter(r=>r.date===date);window.dispatchEvent(new Event('restomanager:v3-change'));feedback.textContent='Réservation enregistrée : table '+table+' à '+candidate.time+'.';refreshAvailability();render();
 }catch(error){feedback.textContent='Enregistrement impossible : '+error.message}
});
refreshAvailability();
window.addEventListener('restomanager:v3-tables',()=>{plan=FloorPlan.get();refreshAvailability();render()});
window.addEventListener('restomanager:v3-change',()=>{try{bookings=readReservations().filter(r=>r.date===date);refreshAvailability();render()}catch(e){$('bookingFeedback').textContent=e.message}});
$('roomFilter').addEventListener('change',render);$('filters').addEventListener('click',e=>{const b=e.target.closest('button[data-filter]');if(!b)return;filter=b.dataset.filter;$('filters').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));render()});window.addEventListener('storage',e=>{if(e.key==='restomanager_reservations'||e.key==='restomanager_floor_plan_v1')location.reload()});render();
})();
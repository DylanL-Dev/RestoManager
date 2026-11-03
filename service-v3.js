'use strict';
(function(){
const $=id=>document.getElementById(id);
const today=()=>{const d=new Date();if(d.getHours()<1)d.setDate(d.getDate()-1);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const date=today();$('serviceDate').textContent=new Date(date+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
let plan,bookings;try{plan=FloorPlan.get();const raw=JSON.parse(localStorage.getItem('restomanager_reservations')||'[]');bookings=ReservationEngine.normalizeReservations(raw).filter(r=>r.date===date)}catch(e){$('tableGrid').textContent='Données indisponibles : '+e.message;return}
const rooms=plan.rooms||[];rooms.forEach(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.name;$('roomFilter').append(o)});
let filter='all',selected=null;
const active=r=>ReservationEngine.isBlocking(r);
const priority={seated:4,arrived:3,late:2,confirmed:2,reserved:2};
function state(table){const related=bookings.filter(r=>r.tables.includes(table.number)&&active(r));const top=related.slice().sort((a,b)=>(priority[b.status]||0)-(priority[a.status]||0)||a.time.localeCompare(b.time))[0];if(!top)return {key:'free',label:'LIBRE',detail:'Disponible',booking:null};const key=top.status==='seated'?'present':top.status==='arrived'?'arrived':'expected';return {key,label:{present:'PRÉSENTS',arrived:'ARRIVÉS',expected:'ATTENDUS'}[key],detail:key==='expected'?top.time:top.guests+' personne'+(top.guests>1?'s':''),booking:top}}
function node(tag,className,content){const e=document.createElement(tag);if(className)e.className=className;if(content!==undefined)e.textContent=String(content);return e}
function render(){const visible=plan.tables.filter(t=>t.roomId===$('roomFilter').value);const states=visible.map(t=>({t,s:state(t)}));const shown=states.filter(x=>filter==='all'||x.s.key===filter);$('tableGrid').replaceChildren(...shown.map(({t,s})=>{const b=node('button','tableCard '+s.key);b.type='button';b.append(node('span','num','Table '+t.number),node('span','status',s.label),node('span','info',s.detail),node('span','capacity',(t.capacityMin||1)+' – '+t.capacity+' places'));b.addEventListener('click',()=>{selected=t.number;detail(t,s)});return b}));if(!shown.length)$('tableGrid').append(node('p','muted','Aucune table pour ce filtre.'));
const all=plan.tables.map(t=>({t,s:state(t)}));const seated=bookings.filter(r=>r.status==='seated');const arrived=bookings.filter(r=>r.status==='arrived');const waiting=bookings.filter(r=>['reserved','confirmed','late'].includes(r.status));const occupiedNumbers=new Set(bookings.filter(r=>['seated','arrived'].includes(r.status)).flatMap(r=>r.tables));const free=all.filter(x=>!occupiedNumbers.has(x.t.number)).reduce((n,x)=>n+(x.t.capacity||0),0);const kpis=[['Clients présents',seated.reduce((n,r)=>n+r.guests,0)],['Clients arrivés',arrived.reduce((n,r)=>n+r.guests,0)],['Clients attendus',waiting.reduce((n,r)=>n+r.guests,0)],['Capacité non occupée',free]];$('kpis').replaceChildren(...kpis.map(([label,value])=>{const c=node('div','kpi');c.append(node('span','',label),node('strong','',value));return c}));
$('upcoming').replaceChildren(...waiting.sort((a,b)=>a.time.localeCompare(b.time)).slice(0,8).map(r=>{const c=node('div','arrival');c.append(node('b','',r.time+' · '+r.client),node('small','',r.guests+' pers. · Table'+(r.tables.length>1?'s ':' ')+r.tables.join(' + ')));return c}));if(!waiting.length)$('upcoming').textContent='Aucune arrivée en attente.';if(selected){const t=plan.tables.find(t=>t.number===selected);if(t)detail(t,state(t))}}
function detail(t,s){const box=$('detail');box.replaceChildren(node('strong','','Table '+t.number+' · '+s.label),node('p','muted','Capacité : '+(t.capacityMin||1)+' à '+t.capacity+' places'));const list=bookings.filter(r=>r.tables.includes(t.number)).sort((a,b)=>a.time.localeCompare(b.time));if(!list.length){box.append(node('p','muted','Aucune réservation pour ce service.'));return}list.forEach(r=>{const row=node('div','detailLine');row.append(node('strong','',r.time+' · '+r.guests+' personne(s)'),node('span','',r.client+' · '+r.status));box.append(row)})}
function refreshAvailability(){
 const dateValue=$('bookingDate').value,time=$('bookingTime').value,guests=Number($('bookingGuests').value),select=$('bookingTable'),previous=select.value;
 select.replaceChildren();
 if(!dateValue||!time||!Number.isInteger(guests)||guests<1)return;
 const reservationsAll=readReservations();
 const options=plan.tables.filter(t=>t.capacity>=guests&&(t.capacityMin||1)<=guests).filter(t=>{
 const candidate={id:'candidate',type:$('bookingType').value,client:$('bookingClient').value.trim()||'Simulation',date:dateValue,time,guests,duration:ReservationEngine.DEFAULT_DURATION,tables:[t.number],status:'reserved'};
 return ReservationEngine.validate(candidate,reservationsAll).valid;
 });
 options.forEach(t=>{const option=document.createElement('option');option.value=t.number;option.textContent='Table '+t.number+' · '+(t.capacityMin||1)+'–'+t.capacity+' places';select.append(option)});
 if(options.some(t=>String(t.number)===previous))select.value=previous;
 if(!options.length){const o=document.createElement('option');o.value='';o.textContent='Aucune table disponible';select.append(o)}
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
 bookings=readReservations().filter(r=>r.date===date);feedback.textContent='Réservation enregistrée : table '+table+' à '+candidate.time+'.';refreshAvailability();render();
 }catch(error){feedback.textContent='Enregistrement impossible : '+error.message}
});
refreshAvailability();
$('roomFilter').addEventListener('change',render);$('filters').addEventListener('click',e=>{const b=e.target.closest('button[data-filter]');if(!b)return;filter=b.dataset.filter;$('filters').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));render()});window.addEventListener('storage',e=>{if(e.key==='restomanager_reservations'||e.key==='restomanager_floor_plan_v1')location.reload()});render();
})();
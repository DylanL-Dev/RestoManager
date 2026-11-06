'use strict';
(function(){
const KEY='restomanager_rush_v1',RES='restomanager_reservations',DEFAULT={percent:60,window:60,step:15};
const $=id=>document.getElementById(id);
const mins=s=>Number(String(s).slice(0,2))*60+Number(String(s).slice(3,5));
const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
function settings(){try{const v=JSON.parse(localStorage.getItem(KEY)||'{}');return {percent:[40,50,55,60,65,70,75,80,85,90].includes(Number(v.percent))?Number(v.percent):60,window:60,step:15}}catch(_){return {...DEFAULT}}}
function capacity(){return TableStore.get().tables.reduce((sum,t)=>sum+Number(t.capacity||0),0)}
function service(time){const m=mins(time);return Object.values(ReservationEngine.getShifts()).find(s=>s.enabled&&m>=mins(s.start)&&m<=mins(s.end))||null}
function relevant(r,date){return r.date===date&&ReservationEngine.isBlocking(r)&&!r.walkIn&&typeof r.time==='string'}
function windowFor(time){const shift=service(time);if(!shift)return null;const start=Math.max(mins(shift.start),Math.floor(mins(time)/60)*60),end=Math.min(mins(shift.end)+1,start+settings().window);return {start,end,shift}}
function count(date,start,end,all,ignoreId){return all.filter(r=>r.id!==ignoreId&&relevant(r,date)&&mins(r.time)>=start&&mins(r.time)<end).reduce((n,r)=>n+Number(r.guests||0),0)}
function evaluate(candidate,all,ignoreId){const win=windowFor(candidate.time);if(!win)return {blocked:false,invalid:true};const max=capacity(),limit=Math.max(1,Math.ceil(max*settings().percent/100));const current=count(candidate.date,win.start,win.end,all,ignoreId),after=current+Number(candidate.guests||0);return {blocked:after>limit,current,after,limit,max,start:win.start,end:win.end,range:clock(win.start)+' – '+clock(win.end),percent:max?Math.round(after/max*100):0}}
function suggestions(candidate,all,ignoreId){const shift=service(candidate.time);if(!shift)return [];const low=mins(shift.start),high=mins(shift.end),base=mins(candidate.time),list=[];for(let delta=15;delta<=120;delta+=15){for(const at of [base+delta,base-delta]){if(at<low||at>high||list.some(x=>x.at===clock(at)))continue;const time=clock(at),next={...candidate,time},valid=ReservationEngine.validate(next,all,ignoreId);if(!valid.valid)continue;const load=evaluate(next,all,ignoreId);if(load.blocked)continue;list.push({at:time,covers:load.current,range:load.range,delta:Math.abs(delta)})}}return list.sort((a,b)=>a.covers-b.covers||a.delta-b.delta).slice(0,3)}
function progress(data){const bar=document.createElement('div');bar.className='rushProgress';bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(data.max));bar.setAttribute('aria-valuenow',String(Math.min(data.after,data.max)));bar.setAttribute('aria-label','Couverts attendus sur la période');const fill=document.createElement('div');fill.className='rushProgressFill'+(data.after>=data.max?' full':data.blocked?' busy':'');fill.style.width=Math.min(100,data.max?data.after/data.max*100:0)+'%';bar.append(fill);return bar}
function dashboard(date,all){const target=$('rushDashboard');if(!target)return;target.replaceChildren();const shifts=Object.entries(ReservationEngine.getShifts()).filter(([,s])=>s.enabled);const heading=document.createElement('div');heading.className='rushDashHead';heading.innerHTML='<div><h2>Affluence des réservations</h2><p>Arrivées prévues par période · Cliquez sur un horaire pour voir la charge</p></div>';target.append(heading);
 const select=document.createElement('select');select.setAttribute('aria-label','Choisir une plage horaire');const windows=[];for(const [name,s] of shifts){for(let at=mins(s.start);at<=mins(s.end);at+=60){const end=Math.min(at+60,mins(s.end)+1);if(end<=at)continue;windows.push({start:at,end,name});const option=document.createElement('option');option.value=String(windows.length-1);option.textContent=(name==='lunch'?'Midi':'Soir')+' · '+clock(at)+' – '+clock(end);select.append(option)}}if(!windows.length){target.append('Aucun service ouvert.');return}
 const current=mins(new Date().toTimeString().slice(0,5));let preferred=windows.findIndex(w=>current>=w.start&&current<w.end);if(preferred<0)preferred=windows.findIndex(w=>w.start>=current);select.value=String(preferred>=0?preferred:0);target.append(select);
 const result=document.createElement('div');result.className='rushDashContent';target.append(result);
 function update(){const w=windows[Number(select.value)]||windows[0],max=capacity(),limit=Math.max(1,Math.ceil(max*settings().percent/100)),covers=count(date,w.start,w.end,all),data={max,limit,after:covers,blocked:covers>=limit};result.replaceChildren();const figures=document.createElement('div');figures.className='rushFigures';const a=document.createElement('div'),b=document.createElement('div');a.innerHTML='<strong>'+covers+'</strong><span>Couverts attendus de '+clock(w.start)+' à '+clock(w.end)+'</span>';b.innerHTML='<strong>'+limit+'</strong><span>Couverts conseillés au maximum</span>';figures.append(a,b);result.append(figures,progress(data));const hint=document.createElement('p');hint.className='rushHint';hint.textContent=covers>=limit?'Période très chargée : les nouvelles réservations peuvent nécessiter une confirmation.':'Arrivées réparties : la période reste sous la limite conseillée.';result.append(hint)}select.addEventListener('change',update);update()}
function confirm(candidate,all,ignoreId){const data=evaluate(candidate,all,ignoreId);if(!data.blocked)return Promise.resolve(true);return new Promise(resolve=>{const overlay=document.createElement('div');overlay.className='rushOverlay';const card=document.createElement('section');card.className='rushModal';card.setAttribute('role','alertdialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-label','Confirmation du créneau chargé');const title=document.createElement('h2');title.textContent='Forte affluence à '+candidate.time;const intro=document.createElement('p');intro.textContent='De nombreux clients sont attendus sur cette période. Proposez si possible un autre horaire.';const figures=document.createElement('div');figures.className='rushFigures';const first=document.createElement('div'),second=document.createElement('div');first.innerHTML='<strong>'+data.current+'</strong><span>Couverts déjà attendus entre '+data.range+'</span>';second.innerHTML='<strong>'+data.limit+'</strong><span>Couverts conseillés au maximum</span>';figures.append(first,second);const next=document.createElement('p');next.className='rushAfter';next.textContent='Avec cette réservation : '+data.after+' couverts sur cette période.';const alternatives=document.createElement('div');alternatives.className='rushAlternatives';const heading=document.createElement('strong');heading.textContent='Horaires moins chargés à proposer';alternatives.append(heading);const list=suggestions(candidate,all,ignoreId);if(list.length){for(const item of list){const p=document.createElement('p');p.textContent=item.at+' · '+item.covers+' couverts déjà attendus ('+item.range+')';alternatives.append(p)}}else{const p=document.createElement('p');p.textContent='Aucun horaire moins chargé disponible à proximité pour cette table.';alternatives.append(p)}const question=document.createElement('p');question.textContent='Voulez-vous vraiment conserver '+candidate.time+' malgré cette forte affluence ?';const actions=document.createElement('div');actions.className='rushActions';const cancel=document.createElement('button'),accept=document.createElement('button');cancel.type=accept.type='button';cancel.textContent='Retour';accept.textContent='Confirmer exceptionnellement';accept.className='rushAccept';actions.append(cancel,accept);card.append(title,intro,figures,progress(data),next,alternatives,question,actions);overlay.append(card);document.body.append(overlay);const prior=document.activeElement;function done(value){document.removeEventListener('keydown',key,true);overlay.remove();prior?.focus?.();resolve(value)}function key(e){if(e.key==='Escape'){e.preventDefault();done(false)}else if(e.key==='Tab'){if(e.shiftKey&&document.activeElement===cancel){e.preventDefault();accept.focus()}else if(!e.shiftKey&&document.activeElement===accept){e.preventDefault();cancel.focus()}}}document.addEventListener('keydown',key,true);cancel.addEventListener('click',()=>done(false));accept.addEventListener('click',()=>done(true));cancel.focus()})}
function setup(){const section=$('restaurantShifts');if(!section)return;const box=document.createElement('div');box.className='rushSettings';const h=document.createElement('h3');h.textContent='Répartition des arrivées';const p=document.createElement('p');p.textContent='Quand trop de clients sont attendus sur une heure, RestoManager demande une confirmation manuelle et propose des horaires moins chargés.';const label=document.createElement('label');label.textContent='Limite conseillée de clients arrivant sur une heure';const select=document.createElement('select');for(const value of [40,50,55,60,65,70,75,80,85,90]){const o=document.createElement('option');o.value=value;o.textContent=value+' % de la capacité';select.append(o)}select.value=String(settings().percent);label.append(select);const hint=document.createElement('p');hint.className='rushHint';function show(){hint.textContent='Seuil configuré : '+Math.ceil(capacity()*Number(select.value)/100)+' arrivées prévues sur une heure ('+select.value+' % de '+capacity()+' places). Si une nouvelle réservation dépasse ce seuil, une confirmation sera demandée et des horaires moins chargés seront proposés.'}select.addEventListener('change',()=>{localStorage.setItem(KEY,JSON.stringify({percent:Number(select.value)}));show();window.dispatchEvent(new Event('restomanager:v3-change'))});show();box.append(h,p,label,hint);section.append(box)}
window.RestoRush={evaluate,suggestions,confirm,dashboard,settings,capacity,count,windowFor};setup();
})();
(function(){const k=document.getElementById('kpis');if(k&&!document.getElementById('rushDashboard')){const section=document.createElement('section');section.id='rushDashboard';section.className='rushDashboard';section.setAttribute('aria-label','Affluence des réservations');k.after(section)}})();
'use strict';
(function(){
const $=id=>document.getElementById(id);
const today=()=>{const d=new Date();if(d.getHours()<1)d.setDate(d.getDate()-1);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const date=today();$('serviceDate').textContent=new Date(date+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
let plan,bookings;try{plan=TableStore.get();const raw=JSON.parse(localStorage.getItem('restomanager_reservations')||'[]');bookings=ReservationEngine.normalizeReservations(raw).filter(r=>r.date===date)}catch(e){$('tableGrid').textContent='Données indisponibles : '+e.message;return}
const rooms=plan.rooms||[];rooms.forEach(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.name==='Salle principale'?'Principale':r.name;o.title=r.name;$('roomFilter').append(o)});
let filter='all',selected=null;
const tableSort=document.createElement('select');tableSort.id='tableSort';tableSort.setAttribute('aria-label','Trier les tables');for(const [value,label] of [['number-asc','N° croissant'],['number-desc','N° décroissant'],['capacity-asc','Places croissantes'],['capacity-desc','Places décroissantes'],['status','Statut']]){const option=document.createElement('option');option.value=value;option.textContent=label;tableSort.append(option)}
const sortLabel=document.createElement('label');sortLabel.className='tableSortLabel';const sortText=document.createElement('span');sortText.textContent='Trier';sortLabel.append(sortText,tableSort);$('filters').classList.add('tableFiltersToolbar');const toolsRow=document.createElement('div');toolsRow.className='tableToolbar';const roomControl=document.querySelector('#tables .roomFilterLabel');if(roomControl)toolsRow.append(roomControl);toolsRow.append(sortLabel);$('filters').parentNode.insertBefore(toolsRow,$('filters'));tableSort.addEventListener('change',render);

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
function render(){const visible=plan.tables.filter(t=>t.roomId===$('roomFilter').value);const states=visible.map(t=>({t,s:state(t)}));const shown=states.filter(x=>filter==='all'||x.s.key===filter);const order={present:0,arrived:1,expected:2,free:3};shown.sort((a,b)=>{switch(tableSort.value){case 'number-desc':return b.t.number-a.t.number;case 'capacity-asc':return a.t.capacity-b.t.capacity||a.t.number-b.t.number;case 'capacity-desc':return b.t.capacity-a.t.capacity||a.t.number-b.t.number;case 'status':return (order[a.s.key]??9)-(order[b.s.key]??9)||a.t.number-b.t.number;default:return a.t.number-b.t.number}});const seen=new Set();const cards=[];for(const {t,s} of shown){const r=s.booking;const fused=r&&r.tables.length>1;if(fused){if(seen.has(r.id))continue;seen.add(r.id)}const numbers=fused?r.tables:[t.number];const total=fused?numbers.reduce((sum,n)=>sum+(plan.tables.find(x=>x.number===n)?.capacity||0),0):t.capacity;const b=node('button','tableCard '+s.key+(fused?' groupedFusionCard':''));b.type='button';b.append(node('span','num',fused?'Tables '+numbers.join(' + '):'Table '+t.number),node('span','status',s.label),node('span','info',fused?r.time+' · '+r.guests+' couvert(s)':s.detail),node('span','capacity',fused?total+' places réunies':(t.capacityMin||1)+' – '+t.capacity+' places'));if(fused&&total>r.guests)b.append(node('span','fusionCoverHint','Retirer '+(total-r.guests)+' couvert(s)'));b.addEventListener('click',()=>openTable(t,s,b));cards.push(b)}$('tableGrid').replaceChildren(...cards);if(!cards.length)$('tableGrid').append(node('p','muted','Aucune table pour ce filtre.'));
const all=plan.tables.map(t=>({t,s:state(t)}));const seated=bookings.filter(r=>r.status==='seated');const arrived=bookings.filter(r=>r.status==='arrived');const waiting=bookings.filter(r=>['reserved','confirmed','late'].includes(r.status));const occupiedNumbers=new Set(bookings.filter(r=>['seated','arrived'].includes(r.status)).flatMap(r=>r.tables));const free=all.filter(x=>!occupiedNumbers.has(x.t.number)).reduce((n,x)=>n+(x.t.capacity||0),0);window.RestoRush?.dashboard(date,bookings);const kpis=[['Clients présents',seated.reduce((n,r)=>n+r.guests,0)],['Clients arrivés',arrived.reduce((n,r)=>n+r.guests,0)],['Clients attendus',waiting.reduce((n,r)=>n+r.guests,0)],['Capacité non occupée',free]];$('kpis').replaceChildren(...kpis.map(([label,value])=>{const c=node('div','kpi');c.append(node('span','',label),node('strong','',value));return c}));
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
 const button=node('button','tableDetailAction',label);button.type='button';button.addEventListener('click',async()=>{
 closeTable();window.RestoScreens?.show(id);const panel=$(id);if(!panel)return;panel.open=true;
 const select=$(tableId);if(select){select.value=String(t.number);select.dispatchEvent(new Event('change',{bubbles:true}))}
 panel.scrollIntoView({behavior:'smooth',block:'start'});
 const chosen=$(tableId);if(chosen&&!Array.from(chosen.options).some(o=>o.value===String(t.number))){$('bookingFeedback').textContent='Cette table n’est pas disponible pour le créneau sélectionné.'}
 });actions.append(button);
}
if(s.key==='free'){shortcut('Réserver cette table','reservationForm','bookingTable');shortcut('Installer un passage','passages','walkinTable');box.append(actions)}else if(!window.RestoReception){box.append(node('p','tableAlreadyReserved','Cette table est réservée. Retrouvez le client ci-dessous, puis choisissez « Installer à table ».'))}
if(!list.length)return;
const labels={reserved:'Attendu',confirmed:'Confirmé',late:'En retard',arrived:'Arrivé',seated:'Installé',completed:'Terminé',released:'Libéré',cancelled:'Annulé',no_show:'Absent'};
const choices={reserved:[['seated','Installer à table'],['arrived','Signaler l’arrivée'],['late','Signaler un retard'],['no_show','Absent']],confirmed:[['seated','Installer à table'],['arrived','Signaler l’arrivée'],['late','Signaler un retard'],['no_show','Absent']],late:[['seated','Installer à table'],['arrived','Signaler l’arrivée'],['no_show','Absent']],arrived:[['seated','Installer à table']],seated:[['released','Libérer la table']]};
list.forEach(r=>{
 const row=node('div','detailLine');
 row.append(node('strong','',r.time+' · '+r.guests+' personne(s)'),node('span','',r.client+' · '+(labels[r.status]||r.status)));
 if(r.status==='seated')row.append(occupationProgress(r));
 if(r.tables.length>1){const total=r.tables.reduce((sum,n)=>sum+(plan.tables.find(x=>x.number===n)?.capacity||0),0);row.append(node('span','fusionDetailNote','Tables fusionnées : '+r.tables.join(' + ')));if(total>r.guests)row.append(node('span','fusionCoverHint','Préparation : retirer '+(total-r.guests)+' couvert(s)'))}const controls=node('div','tableStatusActions');
 const secondary=node('details','tableSecondaryActions');const secondaryTitle=node('summary','','Autres actions');secondary.append(secondaryTitle);
 (choices[r.status]||[]).forEach(([kind,label])=>{
 const button=node('button','tableStatusAction',label);button.type='button';
 button.addEventListener('click',async()=>{
 if(['completed','released','no_show'].includes(kind)&&!(await confirmTableDeparture(kind,r)))return;
 try{
 const all=readReservations(),index=all.findIndex(x=>x.id===r.id);if(index<0)throw Error('Réservation introuvable.');
 if(kind==='seated'&&window.RestoCheckOccupiedTables?.(all[index],all))return;
 if(kind==='seated'&&!(await window.RestoConfirmEarlySeating(all[index])))return;
 const result=ReservationEngine.transition(all[index],kind,undefined,all);if(!result.valid)throw Error(result.error);
 if(window.RestoSharedReservations){
  await window.RestoChangeSharedStatus(all[index],kind);
  return;
 }
 all[index]=result.reservation;localStorage.setItem('restomanager_reservations',JSON.stringify(all));
 window.dispatchEvent(new Event('restomanager:v3-change'));
 const table=plan.tables.find(x=>x.number===t.number);if(table)detail(table,state(table));
 }catch(error){const warning=node('p','tableActionError',error.message);row.append(warning)}
 });if(kind==='seated'||kind==='released')controls.append(button);else secondary.append(button);
 });
 if(secondary.children.length>1)controls.append(secondary);
 row.append(controls);box.append(row);
 });
}
function confirmTableDeparture(kind,r){
 return new Promise(resolve=>{
  const existing=document.getElementById('restoDepartureConfirm');if(existing)existing.remove();
  const overlay=document.createElement('div');overlay.id='restoDepartureConfirm';overlay.className='restoDepartureOverlay';
  const dialog=document.createElement('section');dialog.className='restoDepartureDialog';dialog.setAttribute('role','alertdialog');dialog.setAttribute('aria-modal','true');
  dialog.setAttribute('aria-labelledby','restoDepartureTitle');
  const icon=document.createElement('div');icon.className='restoDepartureIcon';icon.innerHTML='<i data-lucide="'+(kind==='no_show'?'alert-circle':'check')+'"></i>';
  const eyebrow=document.createElement('div');eyebrow.className='restoDepartureEyebrow';eyebrow.textContent='GESTION DU SERVICE';
  const title=document.createElement('h2');title.id='restoDepartureTitle';title.textContent=kind==='completed'?'Terminer le passage ?':kind==='released'?'Libérer la table ?':'Signaler le client absent ?';
  const description=document.createElement('p');description.textContent=kind==='completed'?'Le passage sera marqué comme terminé dans le suivi des réservations.':kind==='released'?'Confirmez que les clients sont partis. Les tables seront libérées pour une nouvelle attribution.':'La réservation sera marquée comme absente.';
  const info=document.createElement('div');info.className='restoDepartureInfo';info.textContent=r.client+' · '+(r.tables.length>1?'Tables '+r.tables.join(' + '):'Table '+r.tables[0]);
  const actions=document.createElement('div');actions.className='restoDepartureActions';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Annuler';cancel.className='restoDepartureCancel';
  const accept=document.createElement('button');accept.type='button';accept.textContent=kind==='completed'?'Terminer le passage':kind==='released'?'Confirmer la libération':'Confirmer l’absence';accept.className='restoDepartureAccept';
  actions.append(cancel,accept);dialog.append(icon,eyebrow,title,description,info,actions);overlay.append(dialog);document.body.append(overlay);
  const previous=document.activeElement;
  function finish(ok){document.removeEventListener('keydown',onKey,true);overlay.remove();previous?.focus?.();resolve(ok)}
  function onKey(e){if(e.key==='Escape'){e.preventDefault();finish(false)}else if(e.key==='Tab'){const target=e.shiftKey?accept:cancel;if(document.activeElement===(e.shiftKey?cancel:accept)){e.preventDefault();target.focus()}}}
  cancel.addEventListener('click',()=>finish(false));accept.addEventListener('click',()=>finish(true));overlay.addEventListener('click',e=>{if(e.target===overlay)finish(false)});
  document.addEventListener('keydown',onKey,true);cancel.focus();
 });
}
function refreshAvailability(){
 const dateValue=$('bookingDate').value,time=$('bookingTime').value,guests=Number($('bookingGuests').value),select=$('bookingTable'),previous=select.value;
 const insight=$('availabilityInsight'),fusionPanel=$('fusionSuggestions');
 if(insight)insight.replaceChildren();
 if(fusionPanel)fusionPanel.replaceChildren();
 select.replaceChildren();window.RestoFusionSelected=null;select.required=!window.RestoReception;
 if(!dateValue||!time||!Number.isInteger(guests)||guests<1)return;
 const reservationsAll=readReservations(),duration=ReservationEngine.getDefaultDuration();
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
 const previewTables=options.length?[options[0].number]:fusions.length?fusions[0].pair:[];
 if(window.RestoReception&&options.length)insight.append(node('p','availabilitySummary','Table proposée : '+options[0].number+' · Attribution confirmée à l’enregistrement.'));
 if(previewTables.length&&window.RestoRush){const preview=candidate(time,previewTables),rush=window.RestoRush.evaluate(preview,reservationsAll);insight.append(node('p','rushAvailabilityHint',rush.current+' couverts attendus entre '+rush.range+' · '+rush.limit+' conseillés au maximum.'));if(rush.blocked){insight.append(node('p','availabilityWarning','Forte affluence : confirmation manuelle nécessaire.'));const times=window.RestoRush.suggestions(preview,reservationsAll);const buttons=node('div','availabilityAlternatives');times.forEach(item=>{const button=node('button','availabilityTimeOption',item.at+' · '+item.covers+' couverts');button.type='button';button.addEventListener('click',()=>{$('bookingTime').value=item.at;refreshAvailability()});buttons.append(button)});if(times.length)insight.append(buttons)}}
 if(!window.RestoReception)insight.append(node('p','availabilitySummary',total?options.length+' table(s) individuelle(s) et '+fusions.length+' fusion(s) compatibles à '+time+'.':'Aucune configuration compatible à '+time+'.'));
 if(!total&&!window.RestoReception){
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
function showBookingSuccess(reservation){
 const old=document.getElementById('bookingSuccessDialog');if(old)old.remove();
 const overlay=document.createElement('div');overlay.id='bookingSuccessDialog';overlay.className='bookingSuccessOverlay';
 const dialog=document.createElement('section');dialog.className='bookingSuccessCard';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','bookingSuccessTitle');
 const mark=document.createElement('div');mark.className='bookingSuccessIcon';mark.innerHTML='<i data-lucide="check"></i>';
 const heading=document.createElement('h2');heading.id='bookingSuccessTitle';heading.textContent='Réservation enregistrée !';
 const summary=document.createElement('p');summary.textContent=reservation.client+' · '+reservation.guests+' couvert(s) · '+reservation.time+' · '+(reservation.tables.length>1?'Tables ':'Table ')+reservation.tables.join(' + ');
 const note=document.createElement('p');note.className='bookingSuccessSub';note.textContent='La réservation a bien été ajoutée au service.';if(reservation.allergies||reservation.notes){const extra=document.createElement('p');extra.className='bookingSuccessSub';extra.textContent=(reservation.allergies?'⚠ Allergies : '+reservation.allergies+'  ':'')+(reservation.notes?'Notes : '+reservation.notes:'');dialog.append(extra)}
 const actions=document.createElement('div');actions.className='bookingSuccessActions';
 const view=document.createElement('button');view.type='button';view.textContent='Voir la réservation';
 const again=document.createElement('button');again.type='button';again.className='bookingSuccessSecondary';again.textContent='Ajouter une autre';
 function close(){overlay.remove();document.removeEventListener('keydown',escape)}
 function escape(e){if(e.key==='Escape')close()}
 view.addEventListener('click',()=>{close();window.RestoScreens?.show('reservations');const dateField=$('reservationDate'),query=$('reservationQuery');if(dateField)dateField.value=reservation.date;if(query){query.value=reservation.client;query.dispatchEvent(new Event('input',{bubbles:true}))}document.getElementById('reservations')?.scrollIntoView({block:'start'})});
 again.addEventListener('click',()=>{close();$('bookingClient').value='';$('bookingAllergies').value='';$('bookingNotes').value='';$('bookingClient').focus();refreshAvailability()});
 actions.append(view,again);dialog.append(mark,heading,summary,note,actions);overlay.append(dialog);document.body.append(overlay);document.addEventListener('keydown',escape);view.focus();
}
function readReservations(){const raw=window.RestoSharedReservations||JSON.parse(localStorage.getItem('restomanager_reservations')||'[]');return ReservationEngine.normalizeReservations(raw)}
$('bookingDate').value=date;
$('bookingTime').value='19:00';
['bookingDate','bookingTime','bookingGuests','bookingType','bookingClient'].forEach(id=>$(id).addEventListener('change',refreshAvailability));
$('bookingForm').addEventListener('submit',async event=>{
 event.preventDefault();const feedback=$('bookingFeedback');feedback.textContent='';
 try{
 const existing=readReservations(),table=Number($('bookingTable').value),guests=Number($('bookingGuests').value);
 if($('bookingDate').value<today())throw Error('Impossible de créer une réservation à une date passée.');
 const fusion=window.RestoFusionSelected;const candidate={id:'v3-'+Date.now()+'-'+Math.random().toString(36).slice(2),type:$('bookingType').value,client:$('bookingClient').value.trim(),date:$('bookingDate').value,time:$('bookingTime').value,guests,notes:$('bookingNotes').value.trim().slice(0,1000),allergies:$('bookingAllergies').value.trim().slice(0,500),duration:ReservationEngine.getDefaultDuration(),tables:Array.isArray(fusion)&&fusion.length>=2?fusion:[table],status:'reserved'};
 if(fusion&&(!window.RestoFusion||!window.RestoFusion.pairs().some(p=>p.slice().sort().join(':')===fusion.slice().sort().join(':'))))throw Error('Fusion non autorisée.');
 const result=ReservationEngine.validate(candidate,existing);
 if(!window.RestoReception&&!result.valid){feedback.textContent=result.errors.join(' ');refreshAvailability();return}
 const latest=readReservations(),again=ReservationEngine.validate(candidate,latest);
 if(!window.RestoReception&&!again.valid){feedback.textContent=again.errors.join(' ');refreshAvailability();return}
 const loadState=window.RestoRush.evaluate(candidate,latest);
 if(loadState.blocked){const ok=await window.RestoRush.confirm(candidate,latest);if(!ok){feedback.textContent='Créneau refusé.';return}const fresh=readReservations();if((!window.RestoReception&&!ReservationEngine.validate(candidate,fresh).valid)||window.RestoRush.evaluate(candidate,fresh).current!==loadState.current){feedback.textContent='Situation modifiée : réessayez.';return}candidate.rushOverride={confirmedAt:new Date().toISOString(),range:loadState.range}}
 if(window.RestoSharedReservations){
  if(typeof window.RestoCreateSharedBooking!=='function')throw Error('Connexion en cours. Réessayez dans un instant.');
  feedback.textContent='Enregistrement en cours…';
  await window.RestoCreateSharedBooking(candidate);
  feedback.textContent='✓ Réservation enregistrée · '+candidate.client+' · '+candidate.time+'.';
  try{if(typeof window.RestoRefreshSharedService==='function')await window.RestoRefreshSharedService();}
  catch(syncError){feedback.textContent+=' Actualisation en attente : '+syncError.message;}
  window.RestoFusionSelected=null;
  refreshAvailability();
  showBookingSuccess(candidate);
  return;
 }
 const warnings=ReservationEngine.seatingWarnings(candidate,latest);
 if(warnings.length){
  const accepted=await window.RestoConfirmSeating(warnings,candidate.client,candidate.time);
  if(!accepted){feedback.textContent='Attribution annulée : aucune réservation créée.';return}
  const current=readReservations(),recheck=ReservationEngine.validate(candidate,current);
  if(!recheck.valid){feedback.textContent=recheck.errors.join(' ');refreshAvailability();return}
  if(JSON.stringify(ReservationEngine.seatingWarnings(candidate,current))!==JSON.stringify(warnings)){feedback.textContent='La situation des tables a changé. Recommencez la confirmation.';refreshAvailability();return}
  candidate.seatingOverride={confirmedAt:new Date().toISOString(),warnings:warnings.map(w=>({id:w.id,client:w.client,plannedEnd:w.plannedEnd,gapMinutes:w.gapMinutes}))};
  localStorage.setItem('restomanager_reservations',JSON.stringify(current.concat(candidate)));
  bookings=readReservations().filter(r=>r.date===date);window.dispatchEvent(new Event('restomanager:v3-change'));feedback.textContent='✓ Réservation enregistrée : '+candidate.client+' · '+candidate.time+'.';window.RestoFusionSelected=null;refreshAvailability();render();showBookingSuccess(candidate);return;
 }
 const current=readReservations();if(!ReservationEngine.validate(candidate,current).valid){feedback.textContent='La disponibilité a changé. Réessayez.';refreshAvailability();return}
 localStorage.setItem('restomanager_reservations',JSON.stringify(current.concat(candidate)));
 bookings=readReservations().filter(r=>r.date===date);window.dispatchEvent(new Event('restomanager:v3-change'));feedback.textContent='✓ Réservation enregistrée : '+candidate.client+' · '+candidate.time+'.';window.RestoFusionSelected=null;refreshAvailability();render();showBookingSuccess(candidate);
 }catch(error){feedback.textContent='Enregistrement impossible : '+error.message}
});
refreshAvailability();
window.addEventListener('restomanager:v3-tables',()=>{plan=TableStore.get();const select=$('roomFilter'),previous=select.value;select.replaceChildren();plan.rooms.forEach(room=>{const option=document.createElement('option');option.value=room.id;option.textContent=room.name==='Salle principale'?'Principale':room.name;option.title=room.name;select.append(option)});if(plan.rooms.some(room=>room.id===previous))select.value=previous;refreshAvailability();render()});
window.addEventListener('restomanager:v3-change',()=>{try{bookings=readReservations().filter(r=>r.date===date);refreshAvailability();render()}catch(e){$('bookingFeedback').textContent=e.message}});
$('roomFilter').addEventListener('change',render);$('filters').addEventListener('click',e=>{const b=e.target.closest('button[data-filter]');if(!b)return;filter=b.dataset.filter;$('filters').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));render()});window.addEventListener('storage',e=>{if(e.key==='restomanager_reservations'||e.key==='restomanager_floor_plan_v1')location.reload()});
setInterval(()=>{if(!modal.hidden&&selected){const t=plan.tables.find(x=>x.number===selected);if(t)detail(t,state(t))}},60000);
render();
})();
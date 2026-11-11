'use strict';
(function(){
const $=id=>document.getElementById(id),KEY='restomanager_reservations',E=ReservationEngine;
const statuses={reserved:'Attendu',confirmed:'Confirmé',late:'En retard',arrived:'Arrivé',seated:'Installé',completed:'Terminé',released:'Libéré',cancelled:'Annulé',no_show:'Absent'};
let editing=null,chosenTables=[],expanded=null,reservationView='upcoming',reservationSort='time',reservationSortDesc=false;
const departedStatuses=new Set(['completed','released','cancelled','no_show']);
function sameTables(a,b){return a.length===b.length&&a.every(n=>b.includes(n))}
function editAvailability(tables){
 const previous=load().find(r=>r.id===editing);
 if(!previous)return {available:false,reason:'Réservation introuvable'};
 const plan=TableStore.get(),guests=Number($('editGuests').value),total=tables.reduce((n,id)=>n+(plan.tables.find(t=>t.number===id)?.capacity||0),0);
 if(!Number.isInteger(guests)||guests<1)return {available:false,reason:'Nombre de couverts invalide'};
 if(total<guests)return {available:false,reason:'Capacité insuffisante'};
 if(tables.length===1&&guests<(plan.tables.find(t=>t.number===tables[0])?.capacityMin||1))return {available:false,reason:'Capacité minimale non respectée'};
 const candidate={...previous,client:$('editClient').value.trim(),date:$('editDate').value,time:$('editTime').value,guests,tables};
 const result=E.validate(candidate,load(),editing);
 if(!result.valid)return {available:false,reason:result.conflict?'Occupée à '+result.conflict.time+' · '+result.conflict.client:result.errors[0]};
 const warnings=E.seatingWarnings(candidate,load(),editing);
 return warnings.length?{available:true,caution:true,reason:'À confirmer · départ prévu '+warnings[0].plannedEnd}:{available:true,reason:'Disponible'};
}
function updateEditChoiceAvailability(){
 if(!editing)return;
 const select=$('editTable');
 for(const option of select.options){
  const tables=option._tables;
  if(!tables)continue;
  const state=editAvailability(tables);
  option.disabled=!state.available;
  option.dataset.availability=state.available?(state.caution?'caution':'available'):'unavailable';
  option.dataset.reason=state.reason;
 }
 window.RestoTableChoices?.refresh('editTable');
}
function editChoices(){
 const selector=$('editTable'),current=chosenTables.slice(),plan=TableStore.get();
 const options=plan.tables.map(t=>({tables:[t.number],label:'Table '+t.number+' · '+t.capacity+' places'}));
 for(const pair of window.RestoFusion?.pairs()||[]){
  options.push({tables:pair,label:'Fusion '+pair.join(' + ')+' · '+pair.reduce((sum,n)=>sum+(plan.tables.find(t=>t.number===n)?.capacity||0),0)+' places'});
 }
 if(current.length>1&&!options.some(o=>sameTables(o.tables,current)))options.push({tables:current,label:'Fusion actuelle '+current.join(' + ')});
 selector.replaceChildren();
 options.forEach((option,i)=>{const elOption=el('option',option.label);elOption.value=String(i);elOption._tables=option.tables.slice();selector.append(elOption)});
 selector.value=String(Math.max(0,options.findIndex(o=>sameTables(o.tables,current))));
 updateEditChoiceAvailability();
 selector.onchange=()=>{chosenTables=(options[Number(selector.value)]?.tables||[]).slice();const notice=$('editFusionNotice');if(notice){notice.hidden=chosenTables.length<2;notice.textContent=chosenTables.length>1?'Fusion sélectionnée : '+chosenTables.join(' + '):''}};
 const notice=$('editFusionNotice');if(notice){notice.hidden=current.length<2;notice.textContent=current.length>1?'Fusion sélectionnée : '+current.join(' + '):''}
}

function load(){return E.normalizeReservations(JSON.parse(localStorage.getItem(KEY)||'[]'))}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n}
function notify(msg){$('reservationMessage').textContent=msg}
function save(all){localStorage.setItem(KEY,JSON.stringify(all));window.dispatchEvent(new Event('restomanager:v3-change'));render()}
async function action(id,kind){
 try{
 const all=load(),i=all.findIndex(r=>r.id===id);if(i<0)return notify('Réservation introuvable.');
 const r=all[i];
 if(kind==='confirm'){if(!['reserved','late'].includes(r.status))return notify('Cette réservation ne peut pas être confirmée.');all[i]={...r,status:'confirmed',confirmedAt:new Date().toISOString()};save(all);notify('Réservation confirmée.');return}
 if(kind==='edit'){
 editing=id;chosenTables=r.tables.slice();
 $('editClient').value=r.client;$('editDate').value=r.date;$('editTime').value=r.time;$('editGuests').value=r.guests;$('editNotes').value=r.notes||'';$('editAllergies').value=r.allergies||'';
 editChoices();$('editForm').hidden=false;$('editForm').scrollIntoView({behavior:'smooth',block:'nearest'});return
 }
 if(kind==='delete'){if(!await window.RestoDialog.confirm('Supprimer définitivement la réservation de '+r.client+' ? Cette opération est irréversible.',{title:'Supprimer la réservation',danger:true,acceptLabel:'Supprimer'}))return;all.splice(i,1);save(all);notify('Réservation supprimée.');return}
 if(kind==='cancel'&&!await window.RestoDialog.confirm('Annuler la réservation de '+r.client+' ?',{title:'Annuler la réservation',danger:true,acceptLabel:'Annuler la réservation'}))return;
 if(kind==='seated'&&window.RestoCheckOccupiedTables?.(r,all))return;
 if(kind==='seated'&&!(await window.RestoConfirmEarlySeating(r)))return;
 const next=E.transition(r,kind==='cancel'?'cancelled':kind,undefined,all);
 if(!next.valid)return notify(next.error);
 all[i]=next.reservation;save(all);notify('Statut mis à jour : '+statuses[all[i].status]+'.');
 }catch(e){notify('Erreur : '+e.message)}
}
function showReservationActions(reservation,items,trigger){
 document.querySelector('.reservationMenuOverlay')?.remove();
 const previousFocus=trigger;
 const overlay=el('div',undefined,'reservationMenuOverlay');
 const dialog=el('section',undefined,'reservationMenuDialog');
 dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Actions de la réservation');
 dialog.setAttribute('tabindex','-1');
 const grabber=el('div',undefined,'reservationMenuGrabber');grabber.setAttribute('aria-hidden','true');
 const head=el('div',undefined,'reservationMenuHead');
 const text=el('div');text.append(el('span','OPTIONS DE RÉSERVATION','reservationMenuEyebrow'),el('h2',reservation.client+' · '+reservation.guests+' couvert(s)'));
 const close=el('button',undefined,'reservationMenuClose');close.type='button';close.setAttribute('aria-label','Fermer les actions');
 const closeIcon=document.createElement('i');closeIcon.dataset.lucide='x';closeIcon.setAttribute('aria-hidden','true');close.append(closeIcon);
 head.append(text,close);
 const choices=el('div',undefined,'reservationMenuChoices');
 let closing=false;
 const originalScroll=document.body.style.overflow;
 function dismiss(callback){
  if(closing)return;closing=true;
  overlay.classList.add('isClosing');
  document.body.style.overflow=originalScroll;
  window.setTimeout(()=>{overlay.remove();if(typeof callback==='function')callback();else if(previousFocus.isConnected)previousFocus.focus()},180);
 }
 close.addEventListener('click',()=>dismiss());
 for(const item of items){
  const btn=el('button',undefined,'reservationMenuOption'+(item.danger?' reservationMenuDanger':''));
  btn.type='button';
  const ico=document.createElement('i');ico.dataset.lucide=item.danger?'trash-2':item.label==='Installer à table'?'armchair':item.label==='Confirmer'?'check-circle-2':item.label==='Retard'?'clock-3':item.label==='Changer la table'?'arrow-left-right':'user-x';ico.setAttribute('aria-hidden','true');
  const words=el('span',item.label);
  const arrow=document.createElement('i');arrow.dataset.lucide='chevron-right';arrow.setAttribute('aria-hidden','true');
  btn.append(ico,words,arrow);btn.addEventListener('click',()=>dismiss(item.run));choices.append(btn);
 }
 dialog.append(grabber,head,choices);overlay.append(dialog);document.body.append(overlay);
 document.body.style.overflow='hidden';
 overlay.addEventListener('click',e=>{if(e.target===overlay)dismiss()});
 overlay.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();dismiss();return}
  if(e.key==='Tab'){
   const focusable=[...dialog.querySelectorAll('button:not([disabled])')];
   if(!focusable.length)return;
   const first=focusable[0],last=focusable[focusable.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
 });
 window.lucide?.createIcons?.();
 close.focus();
}
function render(){
 const date=$('reservationDate').value,query=$('reservationQuery').value.trim().toLocaleLowerCase('fr-FR');
 let list;try{list=load()}catch(e){return notify(errorMessage(e,'Impossible de lire les réservations. Réessayez après synchronisation.'))}
 list=list.filter(r=>(!date||r.date===date)&&(!query||[r.client,r.hotelRoom||'',...r.tables.map(String)].join(' ').toLocaleLowerCase('fr-FR').includes(query)));
 const sortValue=r=>reservationSort==='client'?(r.client||''):reservationSort==='guests'?Number(r.guests||0):reservationSort==='table'?Number(r.tables[0]||0):(r.date+'T'+r.time);
 list.sort((a,b)=>{const va=sortValue(a),vb=sortValue(b);const cmp=typeof va==='number'?va-vb:String(va).localeCompare(String(vb),'fr',{numeric:true,sensitivity:'base'});return (reservationSortDesc?-1:1)*cmp||a.date.localeCompare(b.date)||a.time.localeCompare(b.time)});
 const root=$('reservationList');root.replaceChildren();
 const upcoming=list.filter(r=>!departedStatuses.has(r.status)&&r.status!=='seated');
 const seated=list.filter(r=>r.status==='seated');
 const departed=list.filter(r=>departedStatuses.has(r.status));
 const tabs=el('div',undefined,'reservationViewTabs rmViewTabs');
 tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Filtrer les réservations par suivi');
 const icon=name=>{const i=document.createElement('i');i.dataset.lucide=name;i.setAttribute('aria-hidden','true');return i};
 for(const [key,label,count,iconName] of [
  ['upcoming','À venir',upcoming.length,'calendar-clock'],
  ['seated','Installés / présents',seated.length,'users-round'],
  ['departed','Terminés / sorties',departed.length,'check-circle-2'],
  ['all','Toutes',list.length,'layers']
 ]){
  const btn=el('button',undefined,'reservationViewTab'+(reservationView===key?' isActive':''));
  btn.type='button';btn.setAttribute('aria-pressed',String(reservationView===key));
  btn.append(icon(iconName),el('span',label),el('strong',String(count),'rmViewCount'));
  btn.addEventListener('click',()=>{reservationView=key;expanded=null;render()});tabs.append(btn);
 }
 const tabsHost=$('rmReservationFilters')||root;
 tabsHost.replaceChildren(tabs);
 const shown=reservationView==='upcoming'?upcoming:reservationView==='seated'?seated:reservationView==='departed'?departed:list;
 if(!shown.length){root.append(el('p',list.length?'Aucune réservation dans cette catégorie.':'Aucune réservation pour cette recherche.','reservationViewEmpty'));window.lucide?.createIcons?.();return}
 const headings=el('div',undefined,'rmBookingGrid rmBookingColumns');
 for(const [label,sortKey] of [
  ['Heure','time'],['Client / Chambre','client'],['Couverts','guests'],
  ['Table(s)','table'],['Origine',null],['Statut',null],['Indicateurs',null],['Actions',null]
 ]){
  const cell=el('span',undefined,'rmBookingColumn');
  if(sortKey){
   const sortButton=el('button',undefined,'rmBookingSort');sortButton.type='button';
   sortButton.setAttribute('aria-label','Trier par '+label);sortButton.setAttribute('aria-pressed',String(reservationSort===sortKey));
   sortButton.append(el('span',label),icon(reservationSort===sortKey?(reservationSortDesc?'arrow-down':'arrow-up'):'arrow-up-down'));
   sortButton.addEventListener('click',()=>{reservationSortDesc=reservationSort===sortKey?!reservationSortDesc:false;reservationSort=sortKey;render()});
   cell.append(sortButton);
  }else cell.textContent=label;
  headings.append(cell);
 }
 root.append(headings);
 shown.forEach(r=>{
 const card=el('article',undefined,'reservationItem rmBookingCard');
 card.dataset.status=r.status;card.dataset.type=r.type;
 const line=el('div',undefined,'rmBookingGrid');
 const time=el('strong',undefined,'rmBookingTime');time.append(icon('clock-3'),el('span',r.time));line.append(time);
 const client=el('div',undefined,'rmBookingClient');
 client.append(icon(r.type==='hotel'?'hotel':'user-round'));
 const clientText=el('div',undefined,'rmBookingClientText');
 const room=String(r.type==='hotel'&&/^\d+$/.test(String(r.client||''))?r.client:'').trim();
 const rawClient=String(r.client||'').trim();
 const roomMention=!!room&&(rawClient===room||['chambre '+room,'ch. '+room,'ch '+room].includes(rawClient.toLocaleLowerCase('fr-FR').replace(/\s+/g,' ')));
 const label=roomMention?'Ch. '+room:rawClient||'Client';
 const detailButton=el('button',label,'rmBookingOpen');detailButton.type='button';
 detailButton.setAttribute('aria-expanded',String(expanded===r.id));
 detailButton.setAttribute('aria-label',(expanded===r.id?'Fermer':'Ouvrir')+' la fiche de '+label);
 const toggleDetails=()=>{expanded=expanded===r.id?null:r.id;render()};
 detailButton.addEventListener('click',toggleDetails);
 clientText.append(detailButton);
 clientText.append(el('small',r.type==='hotel'?(roomMention?'Client de l’hôtel':room?'Chambre '+room:'Client de l’hôtel'):'Client extérieur','rmBookingSub'));
 client.append(clientText);
 // The phone reference includes a separate, accessible detail chevron.
 // It is visually hidden outside of narrow cards; the original name
 // button remains fully functional on all devices.
 const detailChevron=el('button',undefined,'rmBookingMobileChevron');detailChevron.type='button';
 detailChevron.setAttribute('aria-label',(expanded===r.id?'Fermer':'Ouvrir')+' la fiche de '+label);
 detailChevron.setAttribute('aria-expanded',String(expanded===r.id));
 detailChevron.append(icon('chevron-right'));detailChevron.addEventListener('click',toggleDetails);
 client.append(detailChevron);
 line.append(client);
 const guestCount=el('span',undefined,'rmBookingGuests');guestCount.append(icon('users-round'),el('b',String(r.guests)));
 guestCount.setAttribute('aria-label',String(r.guests)+' couvert'+(Number(r.guests)>1?'s':''));line.append(guestCount);
 const tableLabel=r.tables.length>1?'Fusion '+r.tables.join(' + '):'Table '+(r.tables[0]??'—');
 const tableCell=el('span',undefined,'rmBookingTable');tableCell.append(icon('armchair'),el('span',tableLabel));line.append(tableCell);
 const origin=el('span',undefined,'rmBookingOrigin');origin.append(icon(r.type==='hotel'?'hotel':'user-round'),el('span',r.type==='hotel'?'Hôtel':'Extérieur'));line.append(origin);
 const status=el('span',undefined,'rmBookingStatus');status.dataset.status=r.status;
 const fullStatus=statuses[r.status]||r.status;
 // List badges stay concise on PC/tablet/phone. The full operational
 // status is preserved in the accessible label, tooltip and detail view.
 const shortStatus=r.status==='reserved'?'À confirmer':r.status==='confirmed'?'Confirmée':fullStatus;
 status.title=fullStatus;status.setAttribute('aria-label','Statut : '+fullStatus);
 status.append(icon(['completed','released'].includes(r.status)?'check-circle-2':r.status==='seated'?'users-round':r.status==='late'?'clock-alert':r.status==='cancelled'?'x-circle':'clock-3'),
  el('span',shortStatus));line.append(status);
 const flags=el('div',undefined,'rmBookingFlags');
 if(r.notes){
  const note=el('button',undefined,'rmBookingFlag rmBookingFlagNote');note.type='button';
  note.setAttribute('title','Consulter la note');note.setAttribute('aria-label','Note présente : ouvrir la fiche');
  note.append(icon('notebook-pen'),el('span','Note','rmBookingNoteLabel'));
  note.addEventListener('click',()=>{expanded=expanded===r.id?null:r.id;render()});flags.append(note);
 }
 if(r.allergies){
  const allergy=el('button',undefined,'rmBookingFlag rmBookingFlagAllergy');allergy.type='button';
  allergy.title='Allergies signalées : '+r.allergies;
  allergy.setAttribute('aria-label','Allergies signalées : '+r.allergies+'. Ouvrir la fiche');
  allergy.append(icon('triangle-alert'),el('span','Allergie · '+r.allergies,'rmBookingFlagText'));
  allergy.addEventListener('click',()=>{expanded=expanded===r.id?null:r.id;render()});flags.append(allergy);
 }
 if(!flags.children.length)flags.append(el('span','—','rmBookingNoFlag'));
 line.append(flags);card.append(line);
 const total=r.tables.reduce((sum,n)=>sum+(TableStore.get().tables.find(t=>t.number===n)?.capacity||0),0);
 if(r.tables.length>1&&total>r.guests)card.append(el('p','Préparation : retirer '+(total-r.guests)+' couvert(s)','fusionCoverHint'));
 if(expanded===r.id){
 const details=el('section',undefined,'reservationExpanded');
 details.append(el('h3','Suivi de la réservation'));
 details.append(el('p','Statut : '+(statuses[r.status]||r.status)));
 if(r.allergies)details.append(el('p','Allergies signalées : '+r.allergies,'reservationAllergy'));
 if(r.notes)details.append(el('p','Note : '+r.notes,'reservationNotes'));
 if(r.confirmedAt)details.append(el('p','Confirmée le '+new Date(r.confirmedAt).toLocaleString('fr-FR')));
 if(r.seatedAt){const start=new Date(r.seatedAt);const end=new Date(start.getTime()+(Number(r.duration)||90)*60000);details.append(el('p','Installation réelle : '+start.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+' · Fin estimée : '+end.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})));const remaining=Math.ceil((end-Date.now())/60000);details.append(el('p',remaining>0?remaining+' min restantes (estimation)':'Fin estimée dépassée de '+Math.abs(remaining)+' min'));const track=el('progress');track.max=100;track.value=Math.min(100,Math.max(0,100-(remaining/(Number(r.duration)||90))*100));details.append(track)}
 card.append(details);
 }

 const actions=el('div',undefined,'reservationActions reservationActionsModern');
 const opts=[['edit','Modifier'],['confirm','Confirmer'],['arrived','Arrivé'],['seated','Installer à table'],['completed','Terminer'],['late','Retard'],['no_show','Absent'],['cancel','Annuler'],['delete','Supprimer']];
 const available=opts.filter(([k])=>k==='edit'||k==='delete'||(k==='confirm'&&['reserved','late'].includes(r.status))||(k==='cancel'&&E.isBlocking(r))||(k==='arrived'&&['reserved','confirmed','late'].includes(r.status))||(k==='seated'&&['reserved','confirmed','late','arrived'].includes(r.status))||(k==='completed'&&r.status==='seated')||(k==='late'&&['reserved','confirmed'].includes(r.status))||(k==='no_show'&&['reserved','confirmed','late'].includes(r.status)));
 const mainActions=el('div',undefined,'reservationPrimaryActions');
 const secondary=el('div',undefined,'reservationSecondaryActions');
 const extra=[];
 const makeAction=(kind,label,cls)=>{const btn=el('button',undefined,cls);btn.type='button';btn.setAttribute('aria-label',label);btn.append(icon(kind==='edit'?'pencil':kind==='confirm'?'check-circle-2':'circle-dot'),el('span',label,'rmBookingActionText'));btn.dataset.reservationAction=kind;btn.addEventListener('click',()=>action(r.id,kind));return btn};
 for(const [kind,label] of available){
  if(kind==='completed'||kind==='confirm')mainActions.append(makeAction(kind,label,'reservationActionMain'+(kind==='confirm'?' reservationActionConfirm':'')));
  else if(kind==='edit')secondary.append(makeAction(kind,label,'reservationActionSecondary'));
  else extra.push({label,run:()=>action(r.id,kind),danger:kind==='cancel'||kind==='delete'});
 }
 if(mainActions.children.length)actions.append(mainActions);
 const tools=el('div',undefined,'reservationActionTools');
 if(secondary.children.length)tools.append(secondary);
 if(extra.length){
  const btn=el('button',undefined,'reservationMoreTrigger');
  btn.type='button';btn.setAttribute('aria-label','Plus d’actions pour '+r.client);btn.title='Plus d’actions';
  btn.append(icon('ellipsis'));btn.addEventListener('click',()=>showReservationActions(r,extra,btn));tools.append(btn);
 }
 if(tools.children.length)actions.append(tools);
 line.append(actions);root.append(card);
 });
 window.lucide?.createIcons?.();
}
$('reservationDate').value=new Date().toLocaleDateString('en-CA');
$('reservationDate').addEventListener('change',render);$('reservationQuery').addEventListener('input',()=>{if($('reservationQuery').value.trim())$('reservationDate').value='';render()});
$('reservationShowAll').addEventListener('click',()=>{$('reservationDate').value='';render()});
$('editCancel').addEventListener('click',()=>{editing=null;chosenTables=[];$('editForm').hidden=true});
$('editForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!editing)return;
 try{
 const all=load(),i=all.findIndex(r=>r.id===editing);if(i<0)throw Error('Réservation introuvable');
 const previous=all[i];if($('editDate').value<new Date().toLocaleDateString('en-CA')&&$('editDate').value!==previous.date)throw Error('Impossible de déplacer une réservation vers une date passée.');if(!E.isBlocking(previous))throw Error('Une réservation terminée ou annulée ne peut pas être réactivée par modification.');
 const guests=Number($('editGuests').value),plan=TableStore.get(),tables=chosenTables.slice();
 if(!tables.length||tables.some(n=>!plan.tables.some(t=>t.number===n)))throw Error('Table inconnue.');
 if(tables.length>1&&!sameTables(tables,previous.tables)&&!(window.RestoFusion?.pairs()||[]).some(p=>sameTables(p,tables)))throw Error('Fusion non autorisée.');
 if(tables.length>1&&new Set(tables.map(n=>plan.tables.find(t=>t.number===n).roomId)).size>1)throw Error('Fusion entre salles différentes interdite.');
 if(tables.length===1&&guests<(plan.tables.find(t=>t.number===tables[0]).capacityMin||1))throw Error('Capacité minimale non respectée.');
 const updated={...previous,notes:$('editNotes').value.trim().slice(0,1000),allergies:$('editAllergies').value.trim().slice(0,500),client:$('editClient').value.trim(),date:$('editDate').value,time:$('editTime').value,guests,tables};
 const check=E.validate(updated,all,editing);if(!check.valid)throw Error(check.errors.join(' '));
 const rushCheck=window.RestoRush.evaluate(updated,all,editing);
 if(rushCheck.blocked&&!await window.RestoRush.confirm(updated,all,editing))return;
 const warnings=E.seatingWarnings(updated,all,editing);
 if(warnings.length){
  const accepted=await window.RestoConfirmSeating(warnings,updated.client,updated.time);
  if(!accepted){notify('Attribution annulée : aucune modification enregistrée.');return}
  const latest=load(),latestIndex=latest.findIndex(r=>r.id===editing);
  if(latestIndex<0)throw Error('Réservation introuvable après confirmation.');
  const recheck=E.validate(updated,latest,editing);
  if(!recheck.valid)throw Error(recheck.errors.join(' '));
  const currentWarnings=E.seatingWarnings(updated,latest,editing);
  if(JSON.stringify(currentWarnings)!==JSON.stringify(warnings))throw Error('La situation des tables a changé. Vérifiez et confirmez à nouveau.');
  updated.seatingOverride={confirmedAt:new Date().toISOString(),warnings:warnings.map(w=>({id:w.id,client:w.client,plannedEnd:w.plannedEnd,gapMinutes:w.gapMinutes}))};
  latest[latestIndex]=updated;save(latest);editing=null;chosenTables=[];$('editForm').hidden=true;notify('Réservation modifiée avec confirmation.');return;
 }else delete updated.seatingOverride;
 all[i]=updated;save(all);editing=null;chosenTables=[];$('editForm').hidden=true;notify('Réservation modifiée.');
 }catch(err){notify('Modification impossible : '+err.message)}
});
['editGuests','editDate','editTime','editClient'].forEach(id=>$(id).addEventListener('input',updateEditChoiceAvailability));
window.addEventListener('restomanager:v3-change',()=>{render();updateEditChoiceAvailability()});
window.addEventListener('storage',e=>{if(e.key===KEY)render()});
render();
})();
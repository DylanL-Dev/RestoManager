'use strict';
(function(){
const $=id=>document.getElementById(id),KEY='restomanager_reservations',E=ReservationEngine;
const statuses={reserved:'Attendu',confirmed:'Confirmé',late:'En retard',arrived:'Attendu',seated:'Installé',completed:'Terminé',released:'Libéré',cancelled:'Annulé',no_show:'Absent'};
let editing=null,editingBase=null,reviewedVersion=null,savingEdit=false,chosenTables=[],expanded=null,reservationView='active';
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
 if(window.RestoSharedReservations)candidate.hotelRoom=previous.type==='hotel'?$('editHotelRoom').value.trim():'';
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

function load(){if(window.RestoSharedReservations)return E.normalizeReservations(window.RestoSharedReservations);return E.normalizeReservations(JSON.parse(localStorage.getItem(KEY)||'[]'))}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n}
function notify(msg){$('reservationMessage').textContent=msg}
const business=message=>window.RestoErrors?.business(message)||Error(message);
function errorMessage(error,fallback='Cette action ne peut pas être confirmée. Votre saisie est conservée ; réessayez après synchronisation.'){
 window.RestoErrors?.diagnostic('reservation-action',error);
 return window.RestoErrors?.message(error,fallback)||fallback;
}
function updateEditDetailLimits(){
 const base=editingBase||load().find(r=>r.id===editing)||{};
 for(const field of ['notes','allergies']){
  const input=$(field==='notes'?'editNotes':'editAllergies'),hint=$(field==='notes'?'editNotesLimit':'editAllergiesLimit');
  const limit=window.ReservationEdit.limits[field],unchanged=input.value===String(base[field]||'');
  let message='';try{window.ReservationEdit.detail(base,field,input.value)}catch(error){message=error.message}
  input.setCustomValidity(message);input.setAttribute('aria-invalid',String(Boolean(message)));
  if(hint)hint.textContent=input.value.length+' / '+limit+' caractères'+(unchanged&&input.value.length>limit?' · Texte historique conservé tant qu’il reste inchangé.':message?' · Raccourcissez le texte avant d’enregistrer.':'.');
 }
}
function openSharedEditor(r){
 editing=r.id;editingBase=window.ReservationEdit.capture(r);reviewedVersion=null;chosenTables=r.tables.slice();
 $('editClient').value=r.client;$('editDate').value=r.date;$('editTime').value=r.time;$('editGuests').value=r.guests;
 $('editNotes').value=r.notes||'';$('editAllergies').value=r.allergies||'';
 $('editHotelRoomField').hidden=r.type!=='hotel';$('editHotelRoom').disabled=r.type!=='hotel';
 $('editHotelRoom').value=r.type==='hotel'?(r.hotelRoom||''):'';
 $('editConflict').hidden=true;$('editCurrentValues').textContent='';$('editReloadCurrent').hidden=true;
 editChoices();
 ['editDate','editTime'].forEach(id=>$(id).dispatchEvent(new Event('change',{bubbles:true})));
 $('editForm').hidden=false;updateEditDetailLimits();$('editForm').scrollIntoView({behavior:'smooth',block:'nearest'});
 $('editClient').focus({preventScroll:true});
}
function showEditConflict(uncertain=false){
 $('editConflict').hidden=false;
 $('editConflict').querySelector('strong').textContent=uncertain?'Enregistrement à vérifier':'La réservation a changé';
 notify(uncertain?'Enregistrement non confirmé. Votre saisie est conservée. Consultez la version actuelle avant de réessayer.':
  'Cette réservation a été modifiée par un autre collaborateur. Aucune modification enregistrée ; votre saisie est conservée.');
}
function checkEditingVersion(){
 if(!editingBase||savingEdit)return;
 const current=load().find(r=>r.id===editing);
 if(!current||current.editVersion!==editingBase.editVersion)showEditConflict();
 if(reviewedVersion&&(!current||current.editVersion!==reviewedVersion)){
  reviewedVersion=null;$('editReloadCurrent').hidden=true;
  $('editCurrentValues').textContent='La fiche a encore changé. Consultez à nouveau la version actuelle ; votre saisie est conservée.';
 }
}
async function reviewCurrentEdit(){
 if(!editing||savingEdit)return null;
 if(navigator.onLine===false||!window.RestoSupabaseReady)throw business('Connexion interrompue. Réessayez après synchronisation ; votre saisie est conservée.');
 await window.RestoRefreshSharedService();
 const current=load().find(r=>r.id===editing);
 if(!current)throw business('La réservation n’est plus disponible. Votre saisie est conservée.');
 $('editCurrentValues').textContent=[
  'Version actuellement enregistrée', 'Client : '+current.client,
  'Chambre : '+(current.hotelRoom||'—'), 'Date / heure : '+current.date+' à '+current.time,
  'Couverts : '+current.guests, 'Tables : '+current.tables.join(' + '),
  'Statut : '+(statuses[current.status]||current.status),
  'Allergies : '+(current.allergies||'Aucune signalée'), 'Notes : '+(current.notes||'Aucune')
 ].join('\n');
 reviewedVersion=current.editVersion;
 $('editReloadCurrent').hidden=false;
 $('editCurrentValues').focus({preventScroll:true});
 return current;
}
function save(all){if(window.RestoSharedReservations)throw business('La modification sur cet appareil est désactivée.');localStorage.setItem(KEY,JSON.stringify(all));window.dispatchEvent(new Event('restomanager:v3-change'));render()}
async function action(id,kind){
 if(window.RestoSharedReservations){
  if(kind==='edit'){
   const r=load().find(item=>item.id===id);
   if(!r)return notify('Réservation introuvable.');
   openSharedEditor(r);return;
  }
  if(kind==='cancel'){
   const current=load().find(r=>r.id===id);
   if(!current)return notify('Réservation introuvable.');
   let accepted=false;
   try{accepted=typeof window.RestoDialog?.confirm==='function'?await window.RestoDialog.confirm('Annuler la réservation de '+current.client+' ?',{title:'Annuler la réservation',danger:true,acceptLabel:'Annuler la réservation'}):window.confirm('Annuler la réservation de '+current.client+' ?');}
   catch(dialogError){notify(errorMessage(dialogError,'La confirmation ne peut pas être ouverte. Aucune annulation enregistrée.'));return;}
   if(!accepted){notify('Annulation abandonnée.');return;}
   try{
    if(typeof window.RestoCancelSharedBooking!=='function')throw business('Service indisponible. Réessayez dans un instant.');
    notify('Annulation en cours…');await window.RestoCancelSharedBooking(id);
    await window.RestoRefreshSharedService?.();notify('Réservation annulée.');
   }catch(e){notify(errorMessage(e,'Annulation non confirmée. Vérifiez la réservation après synchronisation.'))}
   return;
  }
  const all=load(),current=all.find(r=>r.id===id);
  if(!current)return notify('Réservation introuvable.');
  if(kind==='seated'&&window.RestoCheckOccupiedTables?.(current,all))return;
  if(kind==='seated'&&!(await window.RestoConfirmEarlySeating(current)))return;
  const status=kind==='confirm'?'confirmed':kind;
  try{
   await window.RestoChangeSharedStatus(current,status);
   notify('Statut mis à jour : '+statuses[status]+'.');
  }catch(error){notify(errorMessage(error))}
  return;
 }
 try{
 const all=load(),i=all.findIndex(r=>r.id===id);if(i<0)return notify('Réservation introuvable.');
 const r=all[i];
 if(kind==='confirm'){if(!['reserved','late'].includes(r.status))return notify('Cette réservation ne peut pas être confirmée.');all[i]={...r,status:'confirmed',confirmedAt:new Date().toISOString()};save(all);notify('Réservation confirmée.');return}
 if(kind==='edit'){
 editing=id;editingBase=window.ReservationEdit.capture(r);chosenTables=r.tables.slice();
 $('editClient').value=r.client;$('editDate').value=r.date;$('editTime').value=r.time;$('editGuests').value=r.guests;$('editNotes').value=r.notes||'';$('editAllergies').value=r.allergies||'';
 editChoices();$('editForm').hidden=false;updateEditDetailLimits();$('editForm').scrollIntoView({behavior:'smooth',block:'nearest'});return
 }
 if(kind==='cancel'&&!await window.RestoDialog.confirm('Annuler la réservation de '+r.client+' ?',{title:'Annuler la réservation',danger:true,acceptLabel:'Annuler la réservation'}))return;
 if(kind==='seated'&&window.RestoCheckOccupiedTables?.(r,all))return;
 if(kind==='seated'&&!(await window.RestoConfirmEarlySeating(r)))return;
 const next=E.transition(r,kind==='cancel'?'cancelled':kind,undefined,all);
 if(!next.valid)return notify(next.error);
 all[i]=next.reservation;save(all);notify('Statut mis à jour : '+statuses[all[i].status]+'.');
 }catch(e){notify(errorMessage(e))}
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
  const ico=document.createElement('i');ico.dataset.lucide=item.danger?'trash-2':item.label==='Confirmer'?'check-circle-2':item.label==='Retard'?'clock-3':'user-x';ico.setAttribute('aria-hidden','true');
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
function showSmartPlacement(id){
 if(window.RestoReception||!window.RestoSharedReservations||!window.RestoSupabaseReady){notify('Le placement intelligent nécessite le compte Restaurant connecté.');return;}
 const target=load().find(r=>r.id===id);
 if(!target){notify('Réservation introuvable.');return;}
 if(!['reserved','confirmed','late','arrived'].includes(target.status)){notify('Le client est déjà installé ou la réservation est terminée.');return;}
 const plan=TableStore.get().tables||[];
 const dialog=document.createElement('div');dialog.className='smartPlacementOverlay';
 dialog.setAttribute('role','presentation');
 const panel=document.createElement('section');panel.className='smartPlacementDialog';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Placement intelligent');
 const heading=el('h2','Changer la table du client');
 const subtitle=el('p',target.client+' · '+target.guests+' couvert(s) · Table prévue '+target.tables.join(' + '),'muted');
 const hint=el('p','Choisissez sa table réelle. RestoManager vérifie les réservations à réorganiser avant la confirmation.','muted');
 const select=el('select');select.setAttribute('aria-label','Table réellement choisie');
 const option=el('option','Sélectionner une autre table');option.value='';select.append(option);
 plan.filter(t=>t.capacity>=target.guests&&(t.capacityMin||1)<=target.guests).forEach(t=>{const o=el('option','Table '+t.number+' · '+t.capacity+' places');o.value=String(t.number);select.append(o)});
 const result=el('div',undefined,'smartPlacementResult');result.setAttribute('aria-live','polite');
 const buttons=el('div',undefined,'smartPlacementButtons');const close=el('button','Fermer');close.type='button';
 const simulate=el('button','Vérifier le placement');simulate.type='button';
 const apply=el('button','Confirmer et installer');apply.type='button';apply.className='smartPlacementApply';apply.hidden=true;
 let preview=null,busy=false;const previousFocus=document.activeElement,previousOverflow=document.body.style.overflow;
 function clearPreview(){preview=null;apply.hidden=true;result.replaceChildren();result.classList.remove('smartPlacementError')}
 function dismiss(){if(!busy){dialog.remove();document.body.style.overflow=previousOverflow;previousFocus?.focus?.()}}
 close.addEventListener('click',dismiss);
 select.addEventListener('change',clearPreview);
 function simulatePlan(){
  clearPreview();
  if(!select.value){result.textContent='Choisissez une table avant la simulation.';result.classList.add('smartPlacementError');return null}
  const data=window.RestoSmartPlacement?.simulate({reservations:load(),tablePlan:TableStore.get().tables,reservationId:id,targetTable:Number(select.value),holds:window.RestoDraftHolds||[]});
  if(!data){result.textContent='Moteur de simulation indisponible.';result.classList.add('smartPlacementError');return null}
  if(!data.ok){result.textContent='Placement impossible : '+data.reason;result.classList.add('smartPlacementError');return null}
  if(!data.changes.length){result.textContent='Aucune modification nécessaire : utilisez le bouton Installer à table habituel.';return null}
  const ul=el('ul');
  data.changes.forEach(change=>{const li=el('li',change.client+' : table '+change.from.join(' + ')+' → table '+change.to.join(' + '));ul.append(li)});
  result.append(el('strong','Réorganisation proposée :'),ul,el('p','Attention : vérifiez que la table choisie est réellement libre et que les autres clients ne sont pas déjà installés.'));
  preview=data;apply.hidden=false;return data;
 }
 simulate.addEventListener('click',simulatePlan);
 apply.addEventListener('click',async()=>{
  if(busy||!preview)return;
  busy=true;apply.disabled=true;simulate.disabled=true;select.disabled=true;close.disabled=true;
  try{
   // Re-read server state before confirming. If assignments changed, require a fresh simulation.
   await window.RestoRefreshSharedService?.();
   const fresh=window.RestoSmartPlacement?.simulate({reservations:load(),tablePlan:TableStore.get().tables,reservationId:id,targetTable:Number(select.value),holds:window.RestoDraftHolds||[]});
   if(!fresh?.ok||JSON.stringify(fresh.changes)!==JSON.stringify(preview.changes))throw business('Les disponibilités ont changé. Relancez la simulation.');
   const current=load().find(r=>r.id===id);
   if(!current)throw business('Réservation introuvable après synchronisation.');
   if(!(await window.RestoConfirmEarlySeating(current)))return;
   const summary=fresh.changes.map(x=>x.client+' : table '+x.from.join(' + ')+' → '+x.to.join(' + ')).join('\n');
   const accepted=await window.RestoDialog.confirm('Confirmer le placement réel et réattribuer les réservations suivantes ?\n'+summary,{title:'Installer et réorganiser',acceptLabel:'Confirmer et installer'});
   if(!accepted)return;
   await window.RestoApplySmartPlacement(id,fresh);
   busy=false;dismiss();notify('✓ Installation enregistrée et tables réattribuées.');
  }catch(error){
   clearPreview();result.textContent=errorMessage(error,'Enregistrement non confirmé. Vérifiez les réservations après synchronisation avant de réessayer.');result.classList.add('smartPlacementError');
  }finally{
   busy=false;apply.disabled=false;simulate.disabled=false;select.disabled=false;close.disabled=false;
  }
 });
 buttons.append(close,simulate,apply);panel.append(heading,subtitle,hint,select,result,buttons);dialog.append(panel);document.body.append(dialog);
 dialog.addEventListener('click',e=>{if(e.target===dialog)dismiss()});
 document.body.style.overflow='hidden';
 dialog.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();dismiss()}
  if(e.key==='Tab'){
   const controls=[...panel.querySelectorAll('button:not([disabled]),select:not([disabled])')].filter(control=>!control.hidden);
   if(!controls.length){e.preventDefault();return}
   const first=controls[0],last=controls[controls.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
 });select.focus();
}

function render(){
 const date=$('reservationDate').value,query=$('reservationQuery').value.trim().toLocaleLowerCase('fr-FR');
 let list;try{list=load()}catch(e){return notify(errorMessage(e,'Impossible de lire les réservations. Réessayez après synchronisation.'))}
 list=list.filter(r=>(!date||r.date===date)&&(!query||[r.client,r.hotelRoom||'',...r.tables.map(String)].join(' ').toLocaleLowerCase('fr-FR').includes(query))).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
 const root=$('reservationList');root.replaceChildren();
 const active=list.filter(r=>!departedStatuses.has(r.status));
 const departed=list.filter(r=>departedStatuses.has(r.status));
 const tabs=el('div',undefined,'reservationViewTabs');
 tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Filtrer les réservations par suivi');
 for(const [key,label,count] of [['active','En cours et à venir',active.length],['departed','Terminées et sorties',departed.length],['all','Toutes',list.length]]){
  const btn=el('button',label+' ('+count+')','reservationViewTab'+(reservationView===key?' isActive':''));
  btn.type='button';btn.setAttribute('aria-pressed',String(reservationView===key));
  btn.addEventListener('click',()=>{reservationView=key;render()});tabs.append(btn);
 }
 root.append(tabs);
 const shown=reservationView==='active'?active:reservationView==='departed'?departed:list;
 if(!shown.length){root.append(el('p',list.length?'Aucune réservation dans cette catégorie.':'Aucune réservation pour cette recherche.','reservationViewEmpty'));return}
 shown.forEach(r=>{
 const card=el('article',undefined,'reservationItem');
 const head=el('div',undefined,'reservationHead');head.append(el('strong',r.time+' · '+r.client),el('span',statuses[r.status]||r.status,'reservationStatus'));card.append(head);const detailButton=el('button',expanded===r.id?'Masquer la fiche':'Voir la fiche et le suivi','reservationOpenDetail');detailButton.type='button';detailButton.setAttribute('aria-expanded',String(expanded===r.id));detailButton.addEventListener('click',()=>{expanded=expanded===r.id?null:r.id;render()});card.append(detailButton);
 const total=r.tables.reduce((sum,n)=>sum+(TableStore.get().tables.find(t=>t.number===n)?.capacity||0),0);card.append(el('p',r.date+' · '+r.guests+' couvert(s) · '+(r.tables.length>1?'Fusion '+r.tables.join(' + '):'Table '+r.tables[0])+(r.type==='hotel'?' · Hôtel'+(r.hotelRoom?' · Chambre '+r.hotelRoom:''):'')));if(r.tables.length>1&&total>r.guests)card.append(el('p','Préparation : retirer '+(total-r.guests)+' couvert(s)','fusionCoverHint'));
 if(r.allergies)card.append(el('p','⚠ Allergies signalées : '+r.allergies,'reservationAllergy'));
 if(r.notes)card.append(el('p','📝 '+r.notes,'reservationNotes'));
 if(expanded===r.id){
 const details=el('section',undefined,'reservationExpanded');
 details.append(el('h3','Suivi de la réservation'));
 details.append(el('p','Statut : '+(statuses[r.status]||r.status)));
 if(r.confirmedAt)details.append(el('p','Confirmée le '+new Date(r.confirmedAt).toLocaleString('fr-FR')));
 if(r.seatedAt){const start=new Date(r.seatedAt);const end=new Date(start.getTime()+(Number(r.duration)||90)*60000);details.append(el('p','Installation réelle : '+start.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+' · Fin estimée : '+end.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})));const remaining=Math.ceil((end-Date.now())/60000);details.append(el('p',remaining>0?remaining+' min restantes (estimation)':'Fin estimée dépassée de '+Math.abs(remaining)+' min'));const track=el('progress');track.max=100;track.value=Math.min(100,Math.max(0,100-(remaining/(Number(r.duration)||90))*100));details.append(track)}
 card.append(details);
 }
 const actions=el('div',undefined,'reservationActions reservationActionsModern');
 const opts=[['edit','Modifier'],['confirm','Confirmer'],['seated','Installer à table'],['completed','Terminer'],['late','Retard'],['no_show','Absent'],['cancel','Annuler']];
 const available=opts.filter(([k])=>!window.RestoReception||(['reserved','confirmed','late','arrived'].includes(r.status)&&['edit','confirm','late','cancel'].includes(k))).filter(([k])=>k==='edit'||(k==='confirm'&&['reserved','late'].includes(r.status))||(k==='cancel'&&E.isBlocking(r))||(k==='seated'&&['reserved','confirmed','late','arrived'].includes(r.status))||(k==='completed'&&r.status==='seated')||(k==='late'&&['reserved','confirmed'].includes(r.status))||(k==='no_show'&&['reserved','confirmed','late'].includes(r.status)));
 const mainActions=el('div',undefined,'reservationPrimaryActions');
 const secondary=el('div',undefined,'reservationSecondaryActions');
 const extra=[];
 const makeAction=(kind,label,cls)=>{const btn=el('button',label,cls);btn.type='button';btn.dataset.reservationAction=kind;btn.addEventListener('click',()=>action(r.id,kind));return btn};
 for(const [kind,label] of available){
  if(kind==='seated'||kind==='completed')mainActions.append(makeAction(kind,label,'reservationActionMain'));
  else if(kind==='edit')secondary.append(makeAction(kind,label,'reservationActionSecondary'));
  else extra.push({label,run:()=>action(r.id,kind),danger:kind==='cancel'});
 }
 if(window.RestoSharedReservations&&!window.RestoReception&&['reserved','confirmed','late','arrived'].includes(r.status)){
  const change=el('button','Changer la table du client','reservationActionSecondary reservationChangeTable');
  change.type='button';change.addEventListener('click',()=>showSmartPlacement(r.id));
  secondary.append(change);
 }
 actions.append(mainActions);
 const tools=el('div',undefined,'reservationActionTools');
 if(secondary.children.length)tools.append(secondary);
 if(extra.length){
  const btn=el('button',undefined,'reservationMoreTrigger');
  btn.type='button';btn.setAttribute('aria-label','Plus d’actions pour '+r.client);
  btn.setAttribute('title','Plus d’actions');
  const icon=document.createElement('i');icon.dataset.lucide='ellipsis';icon.setAttribute('aria-hidden','true');btn.append(icon);
  btn.addEventListener('click',()=>showReservationActions(r,extra,btn));
  tools.append(btn);
 }
 if(tools.children.length)actions.append(tools);
 card.append(actions);root.append(card);
 });
 window.lucide?.createIcons?.();
}
$('reservationDate').value=new Date().toLocaleDateString('en-CA');
$('reservationDate').addEventListener('change',render);$('reservationQuery').addEventListener('input',()=>{if($('reservationQuery').value.trim()){$('reservationDate').value='';$('reservationDate').dispatchEvent(new Event('change',{bubbles:true}))}else render()});
$('reservationShowAll').addEventListener('click',()=>{$('reservationDate').value='';$('reservationDate').dispatchEvent(new Event('change',{bubbles:true}))});
$('editCancel').addEventListener('click',()=>{if(savingEdit)return;editing=null;editingBase=null;reviewedVersion=null;chosenTables=[];$('editForm').hidden=true});
$('editReviewCurrent')?.addEventListener('click',async()=>{try{await reviewCurrentEdit()}catch(error){notify(errorMessage(error))}});
$('editReloadCurrent')?.addEventListener('click',async()=>{
 if(!editing||savingEdit||!reviewedVersion)return;
 try{
  const acceptedVersion=reviewedVersion;
  if(!await window.RestoDialog.confirm('Recharger remplacera votre saisie non enregistrée par la fiche actuelle. Continuer ?',
   {title:'Recharger la réservation',acceptLabel:'Remplacer ma saisie'}))return;
  const current=await reviewCurrentEdit();
  if(!current)return;
  if(current.editVersion!==acceptedVersion){notify('La fiche a encore changé. Vérifiez les informations affichées puis confirmez à nouveau le rechargement ; votre saisie est conservée.');return;}
  if(departedStatuses.has(current.status))throw business('Cette réservation est terminée ou annulée. Votre saisie est conservée mais ne peut plus être enregistrée.');
  openSharedEditor(current);notify('Fiche actualisée. Vous pouvez préparer une nouvelle modification.');
 }catch(error){notify(errorMessage(error))}
});
$('editForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!editing||savingEdit)return;
 if(window.RestoSharedReservations){
  const controls=[...$('editForm').elements].map(control=>({control,disabled:control.disabled}));
  savingEdit=true;controls.forEach(({control})=>{control.disabled=true});
  try{
   if(!editingBase||editingBase.id!==editing)throw business('Rouvrez la fiche avant de la modifier.');
   const updated=window.ReservationEdit.candidate(editingBase,{client:$('editClient').value,hotelRoom:$('editHotelRoom').value,
    date:$('editDate').value,time:$('editTime').value,guests:$('editGuests').value,tables:chosenTables,
    notes:$('editNotes').value,allergies:$('editAllergies').value});
   if(!window.RestoReception&&!updated.tables.length)throw business('Choisissez une table');
   if(!updated.client)throw business('Le nom du client est obligatoire.');
   if(!Number.isInteger(updated.guests)||updated.guests<1||updated.guests>50)throw business('Nombre de couverts invalide.');
   const availability=window.RestoReception?{available:true}:editAvailability(updated.tables);
   if(!availability.available)throw business(availability.reason||'Table indisponible');
   if(availability.caution&&!await window.RestoDialog.confirm('Attention : '+availability.reason+'. Confirmer la modification ?', {title:'Disponibilité à confirmer',acceptLabel:'Confirmer'}))return;
   notify('Enregistrement en cours…');
   await window.RestoUpdateSharedBooking(updated);
   editing=null;editingBase=null;reviewedVersion=null;chosenTables=[];$('editForm').hidden=true;notify('Réservation modifiée.');
   try{await window.RestoRefreshSharedService?.()}
   catch(_error){notify('Réservation modifiée. La mise à jour de l’affichage attend le retour de la connexion.');}
  }catch(err){
   if(window.ReservationEdit.isConflict(err))showEditConflict();
   else if(err instanceof TypeError||err.code==='NETWORK'||err.code===''||navigator.onLine===false)showEditConflict(true);
   else notify(errorMessage(err));
  }finally{
   savingEdit=false;controls.forEach(({control,disabled})=>{control.disabled=disabled});
  }
  return;
 }
 try{
 const all=load(),i=all.findIndex(r=>r.id===editing);if(i<0)throw business('Réservation introuvable');
 const previous=all[i];if($('editDate').value<new Date().toLocaleDateString('en-CA')&&$('editDate').value!==previous.date)throw business('Impossible de déplacer une réservation vers une date passée.');if(!E.isBlocking(previous))throw business('Une réservation terminée ou annulée ne peut pas être réactivée par modification.');
 const guests=Number($('editGuests').value),plan=TableStore.get(),tables=chosenTables.slice();
 if(!tables.length||tables.some(n=>!plan.tables.some(t=>t.number===n)))throw business('Table inconnue.');
 if(tables.length>1&&!sameTables(tables,previous.tables)&&!(window.RestoFusion?.pairs()||[]).some(p=>sameTables(p,tables)))throw business('Fusion non autorisée.');
 if(tables.length>1&&new Set(tables.map(n=>plan.tables.find(t=>t.number===n).roomId)).size>1)throw business('Fusion entre salles différentes interdite.');
 if(tables.length===1&&guests<(plan.tables.find(t=>t.number===tables[0]).capacityMin||1))throw business('Capacité minimale non respectée.');
 const updated=window.ReservationEdit.candidate(previous,{hotelRoom:previous.hotelRoom,notes:$('editNotes').value,allergies:$('editAllergies').value,client:$('editClient').value,date:$('editDate').value,time:$('editTime').value,guests,tables});
 const check=E.validate(updated,all,editing);if(!check.valid)throw business(check.errors.join(' '));
 const rushCheck=window.RestoRush.evaluate(updated,all,editing);
 if(rushCheck.blocked&&!await window.RestoRush.confirm(updated,all,editing))return;
 const warnings=E.seatingWarnings(updated,all,editing);
 if(warnings.length){
  const accepted=await window.RestoConfirmSeating(warnings,updated.client,updated.time);
  if(!accepted){notify('Attribution annulée : aucune modification enregistrée.');return}
  const latest=load(),latestIndex=latest.findIndex(r=>r.id===editing);
  if(latestIndex<0)throw business('Réservation introuvable après confirmation.');
  const recheck=E.validate(updated,latest,editing);
  if(!recheck.valid)throw business(recheck.errors.join(' '));
  const currentWarnings=E.seatingWarnings(updated,latest,editing);
  if(JSON.stringify(currentWarnings)!==JSON.stringify(warnings))throw business('La situation des tables a changé. Vérifiez et confirmez à nouveau.');
  updated.seatingOverride={confirmedAt:new Date().toISOString(),warnings:warnings.map(w=>({id:w.id,client:w.client,plannedEnd:w.plannedEnd,gapMinutes:w.gapMinutes}))};
  latest[latestIndex]=updated;save(latest);editing=null;chosenTables=[];$('editForm').hidden=true;notify('Réservation modifiée avec confirmation.');return;
 }else delete updated.seatingOverride;
 all[i]=updated;save(all);editing=null;chosenTables=[];$('editForm').hidden=true;notify('Réservation modifiée.');
 }catch(err){notify(errorMessage(err))}
});
['editNotes','editAllergies'].forEach(id=>$(id).addEventListener('input',updateEditDetailLimits));
['editGuests','editDate','editTime','editClient','editHotelRoom'].forEach(id=>$(id)?.addEventListener('input',updateEditChoiceAvailability));
// Notifications navigate to the appropriate status tab and expand the exact booking.
window.addEventListener('restomanager:open-reservation',event=>{
 const data=event.detail||{};
 if(!['active','departed','all'].includes(data.view))return;
 reservationView=data.view;
 expanded=typeof data.reservationId==='string'?data.reservationId:null;
 render();
 const card=$('reservationList')?.querySelector('.reservationExpanded');
 if(card)card.scrollIntoView({block:'nearest',behavior:'smooth'});
});
window.addEventListener('restomanager:v3-change',()=>{render();updateEditChoiceAvailability();checkEditingVersion()});
window.addEventListener('storage',e=>{if(e.key===KEY)render()});
render();
window.addEventListener('restomanager:supabase-snapshot',()=>{if(window.RestoSharedReservations){render();updateEditChoiceAvailability();checkEditingVersion()}});
})();

'use strict';
(function(){
const $=id=>document.getElementById(id),KEY='restomanager_reservations',E=ReservationEngine;
const statuses={reserved:'Attendu',confirmed:'Confirmé',late:'En retard',arrived:'Arrivé',seated:'Installé',completed:'Terminé',released:'Libéré',cancelled:'Annulé',no_show:'Absent'};
let editing=null,chosenTables=[],expanded=null,reservationView='active';
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

function load(){if(window.RestoSharedReservations)return E.normalizeReservations(window.RestoSharedReservations);return E.normalizeReservations(JSON.parse(localStorage.getItem(KEY)||'[]'))}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n}
function notify(msg){$('reservationMessage').textContent=msg}
function save(all){if(window.RestoSharedReservations)throw Error('Mode Supabase : modifications locales désactivées.');localStorage.setItem(KEY,JSON.stringify(all));window.dispatchEvent(new Event('restomanager:v3-change'));render()}
async function action(id,kind){
 if(window.RestoSharedReservations){
  if(kind==='cancel'){
   const current=load().find(r=>r.id===id);
   if(!current)return notify('Réservation introuvable.');
   let accepted=false;
   try{accepted=typeof window.RestoDialog?.confirm==='function'?await window.RestoDialog.confirm('Annuler la réservation de '+current.client+' ?',{title:'Annuler la réservation',danger:true,acceptLabel:'Annuler la réservation'}):window.confirm('Annuler la réservation de '+current.client+' ?');}
   catch(dialogError){notify('Confirmation impossible : '+dialogError.message);return;}
   if(!accepted){notify('Annulation abandonnée.');return;}
   try{
    if(typeof window.RestoCancelSharedBooking!=='function')throw Error('Module Supabase indisponible');
    notify('Annulation en cours…');await window.RestoCancelSharedBooking(id);
    await window.RestoRefreshSharedService?.();notify('Réservation annulée dans Supabase.');
   }catch(e){notify('Annulation impossible : '+e.message)}
   return;
  }
  notify('Action '+kind+' indisponible : raccordement Supabase en cours.');return;
 }
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
function render(){
 const date=$('reservationDate').value,query=$('reservationQuery').value.trim().toLocaleLowerCase('fr-FR');
 let list;try{list=load()}catch(e){return notify('Lecture impossible : '+e.message)}
 list=list.filter(r=>(!date||r.date===date)&&(!query||[r.client,...r.tables.map(String)].join(' ').toLocaleLowerCase('fr-FR').includes(query))).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
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
 const total=r.tables.reduce((sum,n)=>sum+(TableStore.get().tables.find(t=>t.number===n)?.capacity||0),0);card.append(el('p',r.date+' · '+r.guests+' couvert(s) · '+(r.tables.length>1?'Fusion '+r.tables.join(' + '):'Table '+r.tables[0])+(r.type==='hotel'?' · Hôtel':'')));if(r.tables.length>1&&total>r.guests)card.append(el('p','Préparation : retirer '+(total-r.guests)+' couvert(s)','fusionCoverHint'));
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
 const actions=el('div',undefined,'reservationActions');
 const opts=[['edit','Modifier'],['confirm','Confirmer'],['arrived','Arrivé'],['seated','Installer à table'],['completed','Terminer'],['late','Retard'],['no_show','Absent'],['cancel','Annuler'],['delete','Supprimer']];
 const primary=el('div',undefined,'reservationPrimaryActions'),more=el('details',undefined,'reservationMoreActions'),summary=el('summary','Plus d’actions');more.append(summary);opts.filter(([k])=>k==='edit'||(k==='confirm'&&['reserved','late'].includes(r.status))||k==='delete'||(k==='cancel'&&E.isBlocking(r))||(k==='arrived'&&['reserved','confirmed','late'].includes(r.status))||(k==='seated'&&['reserved','confirmed','late','arrived'].includes(r.status))||(k==='completed'&&r.status==='seated')||(k==='late'&&['reserved','confirmed'].includes(r.status))||(k==='no_show'&&['reserved','confirmed','late'].includes(r.status))).forEach(([k,label])=>{const b=el('button',label);b.type='button';b.dataset.reservationAction=k;b.addEventListener('click',()=>action(r.id,k));(k==='edit'||k==='seated'||k==='completed'?primary:more).append(b)});actions.append(primary);if(more.children.length>1)actions.append(more);
 card.append(actions);root.append(card);
 });
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
window.addEventListener('restomanager:supabase-snapshot',()=>{if(window.RestoSharedReservations)render()});
})();
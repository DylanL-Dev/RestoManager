'use strict';
(function(){
const $=id=>document.getElementById(id),KEY='restomanager_reservations',E=ReservationEngine;
const statuses={reserved:'Attendu',confirmed:'Confirmé',late:'En retard',arrived:'Arrivé',seated:'Installé',completed:'Terminé',released:'Libéré',cancelled:'Annulé',no_show:'Absent'};
let editing=null,chosenTables=[];
function sameTables(a,b){return a.length===b.length&&a.every(n=>b.includes(n))}
function editAvailability(tables){
 const previous=load().find(r=>r.id===editing);
 if(!previous)return {available:false,reason:'Réservation introuvable'};
 const plan=FloorPlan.get(),guests=Number($('editGuests').value),total=tables.reduce((n,id)=>n+(plan.tables.find(t=>t.number===id)?.capacity||0),0);
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
 const selector=$('editTable'),current=chosenTables.slice(),plan=FloorPlan.get();
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
function action(id,kind){
 try{
 const all=load(),i=all.findIndex(r=>r.id===id);if(i<0)return notify('Réservation introuvable.');
 const r=all[i];
 if(kind==='edit'){
 editing=id;chosenTables=r.tables.slice();
 $('editClient').value=r.client;$('editDate').value=r.date;$('editTime').value=r.time;$('editGuests').value=r.guests;
 editChoices();$('editForm').hidden=false;$('editForm').scrollIntoView({behavior:'smooth',block:'nearest'});return
 }
 if(kind==='delete'){if(!confirm('Supprimer définitivement la réservation de '+r.client+' ? Cette opération est irréversible.'))return;all.splice(i,1);save(all);notify('Réservation supprimée.');return}
 if(kind==='cancel'&&!confirm('Annuler la réservation de '+r.client+' ?'))return;
 const next=E.transition(r,kind==='cancel'?'cancelled':kind);
 if(!next.valid)return notify(next.error);
 all[i]=next.reservation;save(all);notify('Statut mis à jour : '+statuses[all[i].status]+'.');
 }catch(e){notify('Erreur : '+e.message)}
}
function render(){
 const date=$('reservationDate').value,query=$('reservationQuery').value.trim().toLocaleLowerCase('fr-FR');
 let list;try{list=load()}catch(e){return notify('Lecture impossible : '+e.message)}
 list=list.filter(r=>(!date||r.date===date)&&(!query||[r.client,...r.tables.map(String)].join(' ').toLocaleLowerCase('fr-FR').includes(query))).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
 const root=$('reservationList');root.replaceChildren();
 if(!list.length){root.append(el('p','Aucune réservation pour cette recherche.'));return}
 list.forEach(r=>{
 const card=el('article',undefined,'reservationItem');
 const head=el('div',undefined,'reservationHead');head.append(el('strong',r.time+' · '+r.client),el('span',statuses[r.status]||r.status,'reservationStatus'));card.append(head);
 const total=r.tables.reduce((sum,n)=>sum+(FloorPlan.get().tables.find(t=>t.number===n)?.capacity||0),0);card.append(el('p',r.date+' · '+r.guests+' couvert(s) · '+(r.tables.length>1?'Fusion '+r.tables.join(' + '):'Table '+r.tables[0])+(r.type==='hotel'?' · Hôtel':'')));if(r.tables.length>1&&total>r.guests)card.append(el('p','Préparation : retirer '+(total-r.guests)+' couvert(s)','fusionCoverHint'));
 const actions=el('div',undefined,'reservationActions');
 const opts=[['edit','Modifier'],['arrived','Arrivé'],['seated','Installer'],['completed','Terminer'],['late','Retard'],['no_show','Absent'],['cancel','Annuler'],['delete','Supprimer']];
 const primary=el('div',undefined,'reservationPrimaryActions'),more=el('details',undefined,'reservationMoreActions'),summary=el('summary','Plus d’actions');more.append(summary);opts.filter(([k])=>k==='edit'||k==='delete'||(k==='cancel'&&E.isBlocking(r))||(k==='arrived'&&['reserved','confirmed','late'].includes(r.status))||(k==='seated'&&['reserved','confirmed','late','arrived'].includes(r.status))||(k==='completed'&&r.status==='seated')||(k==='late'&&['reserved','confirmed'].includes(r.status))||(k==='no_show'&&['reserved','confirmed','late'].includes(r.status))).forEach(([k,label])=>{const b=el('button',label);b.type='button';b.addEventListener('click',()=>action(r.id,k));(k==='edit'||k==='arrived'||k==='seated'||k==='completed'?primary:more).append(b)});actions.append(primary);if(more.children.length>1)actions.append(more);
 card.append(actions);root.append(card);
 });
}
$('reservationDate').value=new Date().toLocaleDateString('en-CA');
$('reservationDate').addEventListener('change',render);$('reservationQuery').addEventListener('input',render);
$('reservationShowAll').addEventListener('click',()=>{$('reservationDate').value='';render()});
$('editCancel').addEventListener('click',()=>{editing=null;chosenTables=[];$('editForm').hidden=true});
$('editForm').addEventListener('submit',e=>{
 e.preventDefault();if(!editing)return;
 try{
 const all=load(),i=all.findIndex(r=>r.id===editing);if(i<0)throw Error('Réservation introuvable');
 const previous=all[i];if($('editDate').value<new Date().toLocaleDateString('en-CA')&&$('editDate').value!==previous.date)throw Error('Impossible de déplacer une réservation vers une date passée.');if(!E.isBlocking(previous))throw Error('Une réservation terminée ou annulée ne peut pas être réactivée par modification.');
 const guests=Number($('editGuests').value),plan=FloorPlan.get(),tables=chosenTables.slice();
 if(!tables.length||tables.some(n=>!plan.tables.some(t=>t.number===n)))throw Error('Table inconnue.');
 if(tables.length>1&&!sameTables(tables,previous.tables)&&!(window.RestoFusion?.pairs()||[]).some(p=>sameTables(p,tables)))throw Error('Fusion non autorisée.');
 if(tables.length>1&&new Set(tables.map(n=>plan.tables.find(t=>t.number===n).roomId)).size>1)throw Error('Fusion entre salles différentes interdite.');
 if(tables.length===1&&guests<(plan.tables.find(t=>t.number===tables[0]).capacityMin||1))throw Error('Capacité minimale non respectée.');
 const updated={...previous,client:$('editClient').value.trim(),date:$('editDate').value,time:$('editTime').value,guests,tables};
 const check=E.validate(updated,all,editing);if(!check.valid)throw Error(check.errors.join(' '));
 const warnings=E.seatingWarnings(updated,all,editing);
 if(warnings.length){const message='Attention : '+warnings.map(w=>'la réservation '+w.client+' est toujours marquée « Installé » sur '+w.tables.join(' + ')+'. Fin théorique '+w.plannedEnd+', marge '+w.gapMinutes+' min').join(' ; ')+'.\\n\\nConfirmer cette attribution malgré l’absence de départ confirmé ?';if(!confirm(message))return;updated.seatingOverride={confirmedAt:new Date().toISOString(),warnings:warnings.map(w=>({id:w.id,client:w.client,plannedEnd:w.plannedEnd,gapMinutes:w.gapMinutes}))};}else delete updated.seatingOverride;
 all[i]=updated;save(all);editing=null;chosenTables=[];$('editForm').hidden=true;notify('Réservation modifiée.');
 }catch(err){notify('Modification impossible : '+err.message)}
});
['editGuests','editDate','editTime','editClient'].forEach(id=>$(id).addEventListener('input',updateEditChoiceAvailability));
window.addEventListener('restomanager:v3-change',()=>{render();updateEditChoiceAvailability()});
window.addEventListener('storage',e=>{if(e.key===KEY)render()});
render();
})();
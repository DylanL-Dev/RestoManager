'use strict';
(function(){
const $=id=>document.getElementById(id),KEY='restomanager_reservations',E=ReservationEngine;
const statuses={reserved:'Attendu',confirmed:'Confirmé',late:'En retard',arrived:'Arrivé',seated:'Installé',completed:'Terminé',released:'Libéré',cancelled:'Annulé',no_show:'Absent'};
let editing=null;
function load(){return E.normalizeReservations(JSON.parse(localStorage.getItem(KEY)||'[]'))}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n}
function notify(msg){$('reservationMessage').textContent=msg}
function save(all){localStorage.setItem(KEY,JSON.stringify(all));window.dispatchEvent(new Event('restomanager:v3-change'));render()}
function action(id,kind){
 try{
 const all=load(),i=all.findIndex(r=>r.id===id);if(i<0)return notify('Réservation introuvable.');
 const r=all[i];
 if(kind==='edit'){editing=id;$('editClient').value=r.client;$('editDate').value=r.date;$('editTime').value=r.time;$('editGuests').value=r.guests;$('editTable').replaceChildren(...FloorPlan.get().tables.map(t=>{const o=el('option','Table '+t.number+' · '+t.capacity+' places');o.value=t.number;return o}));$('editTable').value=r.tables[0];$('editTable').disabled=r.tables.length>1;const notice=$('editFusionNotice');if(notice){notice.hidden=r.tables.length<=1;notice.textContent=r.tables.length>1?'Fusion conservée : tables '+r.tables.join(' + ')+'. Modifiez les autres champs sans perdre la fusion.':''}$('editForm').hidden=false;$('editForm').scrollIntoView({behavior:'smooth',block:'nearest'});return}
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
$('editCancel').addEventListener('click',()=>{editing=null;$('editTable').disabled=false;$('editForm').hidden=true});
$('editForm').addEventListener('submit',e=>{
 e.preventDefault();if(!editing)return;
 try{
 const all=load(),i=all.findIndex(r=>r.id===editing);if(i<0)throw Error('Réservation introuvable');
 const previous=all[i];if(!E.isBlocking(previous))throw Error('Une réservation terminée ou annulée ne peut pas être réactivée par modification.');
 const table=Number($('editTable').value),guests=Number($('editGuests').value);
 const t=FloorPlan.get().tables.find(x=>x.number===table);const fusion=previous.tables.length>1;
 if(!fusion&&(!t||guests<(t.capacityMin||1)))throw Error('Capacité minimale non respectée.');
 const updated={...previous,client:$('editClient').value.trim(),date:$('editDate').value,time:$('editTime').value,guests,tables:fusion?previous.tables.slice():[table]};
 const check=E.validate(updated,all,editing);if(!check.valid)throw Error(check.errors.join(' '));
 all[i]=updated;save(all);editing=null;$('editForm').hidden=true;notify('Réservation modifiée.');
 }catch(err){notify('Modification impossible : '+err.message)}
});
window.addEventListener('restomanager:v3-change',render);
window.addEventListener('storage',e=>{if(e.key===KEY)render()});
render();
})();
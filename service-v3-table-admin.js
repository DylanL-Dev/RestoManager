'use strict';
(function(){
const $=id=>document.getElementById(id),E=ReservationEngine,KEY='restomanager_reservations';
const form=$('tableAdminForm'),list=$('tableAdminList'),feedback=$('tableAdminFeedback');if(!form)return;
let editId=null;
function bookings(){return E.normalizeReservations(JSON.parse(localStorage.getItem(KEY)||'[]'))}
function refresh(){
 const plan=FloorPlan.get();list.replaceChildren();const rooms=$('tableAdminRoom');rooms.replaceChildren();
 plan.rooms.forEach(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.name;rooms.append(o)});
 plan.tables.slice().sort((a,b)=>a.number-b.number).forEach(t=>{
 const row=document.createElement('div');row.className='tableAdminItem';
 const info=document.createElement('span');info.textContent='Table '+t.number+' · '+(t.capacityMin||1)+'–'+t.capacity+' places · '+(plan.rooms.find(r=>r.id===t.roomId)?.name||'Salle');
 const edit=document.createElement('button');edit.type='button';edit.textContent='Modifier';edit.onclick=()=>{editId=t.id;$('tableAdminNumber').value=t.number;$('tableAdminMin').value=t.capacityMin||1;$('tableAdminMax').value=t.capacity;$('tableAdminRoom').value=t.roomId;$('tableAdminSubmit').textContent='Enregistrer les modifications';form.scrollIntoView({behavior:'smooth',block:'center'})};
 const remove=document.createElement('button');remove.type='button';remove.textContent='Supprimer';remove.onclick=()=>{try{
 const refs=bookings().filter(r=>r.tables.includes(t.number));
 if(refs.length)throw Error('Cette table figure dans '+refs.length+' réservation(s), y compris l’historique. Suppression bloquée pour préserver les données.');
 if(!confirm('Supprimer définitivement la table '+t.number+' ?'))return;
 const next=FloorPlan.get();next.tables=next.tables.filter(x=>x.id!==t.id);FloorPlan.save(next);refresh();window.dispatchEvent(new Event('restomanager:v3-tables'));feedback.textContent='Table supprimée.';
 }catch(e){feedback.textContent=e.message}};
 row.append(info,edit,remove);list.append(row);
 });
}
$('tableAdminNew').addEventListener('click',()=>{editId=null;form.reset();$('tableAdminSubmit').textContent='Ajouter la table';$('tableAdminMin').value=1;$('tableAdminMax').value=2});
form.addEventListener('submit',e=>{e.preventDefault();try{
 const next=FloorPlan.get(),number=Number($('tableAdminNumber').value),min=Number($('tableAdminMin').value),max=Number($('tableAdminMax').value),roomId=$('tableAdminRoom').value;
 if(!Number.isInteger(number)||number<1||!Number.isInteger(min)||min<1||!Number.isInteger(max)||max<min)throw Error('Vérifiez le numéro et les capacités.');
 if(next.tables.some(t=>t.number===number&&t.id!==editId))throw Error('Ce numéro de table existe déjà.');
 if(editId){const t=next.tables.find(x=>x.id===editId);if(!t)throw Error('Table introuvable');
 if(t.number!==number&&bookings().some(r=>r.tables.includes(t.number)))throw Error('Renumérotation impossible : des réservations référencent cette table.');
 if(bookings().some(r=>r.tables.includes(t.number)&&E.isBlocking(r)&&r.guests>r.tables.reduce((sum,n)=>sum+(n===t.number?max:(next.tables.find(x=>x.number===n)?.capacity||0)),0)))throw Error('La nouvelle capacité est inférieure aux couverts d’une réservation active, y compris fusionnée.');
 Object.assign(t,{number,capacityMin:min,capacity:max,roomId});
 }else{
 const base={id:'table-v3-'+Date.now(),number,capacityMin:min,capacity:max,roomId,shape:'rect',width:1.2,depth:.8,angle:0,x:1,y:1};
 const spot=FloorPlan.freeSpot(next,base);if(!spot)throw Error('Impossible de placer la table dans la salle enregistrée.');next.tables.push({...base,...spot});
 }
 FloorPlan.save(next);editId=null;form.reset();$('tableAdminSubmit').textContent='Ajouter la table';feedback.textContent='Table enregistrée.';refresh();window.dispatchEvent(new Event('restomanager:v3-tables'));
 }catch(err){feedback.textContent='Enregistrement impossible : '+err.message}});
refresh();
})();
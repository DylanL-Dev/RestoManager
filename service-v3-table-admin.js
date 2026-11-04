'use strict';
(function(){
const $=id=>document.getElementById(id),E=ReservationEngine,KEY='restomanager_reservations';
const form=$('tableAdminForm'),list=$('tableAdminList'),feedback=$('tableAdminFeedback');if(!form)return;
let editId=null;
function bookings(){return E.normalizeReservations(JSON.parse(localStorage.getItem(KEY)||'[]'))}
function refresh(){
 const plan=FloorPlan.get();list.replaceChildren();list.lastRoom=null;const rooms=$('tableAdminRoom');rooms.replaceChildren();
 const selectedRoom=rooms.value;plan.rooms.forEach(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.name;rooms.append(o)});if(plan.rooms.some(r=>r.id===selectedRoom))rooms.value=selectedRoom;
 plan.tables.slice().sort((a,b)=>a.roomId.localeCompare(b.roomId)||a.number-b.number).forEach(t=>{
 if(!list.lastRoom||list.lastRoom!==t.roomId){const heading=document.createElement('h4');heading.textContent=plan.rooms.find(r=>r.id===t.roomId)?.name||'Salle';list.append(heading);list.lastRoom=t.roomId}
 const row=document.createElement('div');row.className='tableAdminItem';
 const info=document.createElement('span');info.textContent='Table '+t.number+' · '+(t.capacityMin||1)+'–'+t.capacity+' places · '+(plan.rooms.find(r=>r.id===t.roomId)?.name||'Salle');
 const edit=document.createElement('button');edit.type='button';edit.textContent='Modifier';edit.onclick=()=>{editId=t.id;$('tableAdminNumber').value=t.number;$('tableAdminMin').value=t.capacityMin||1;$('tableAdminMax').value=t.capacity;$('tableAdminRoom').value=t.roomId;$('tableAdminSubmit').textContent='Enregistrer les modifications';form.scrollIntoView({behavior:'smooth',block:'center'})};
 const remove=document.createElement('button');remove.type='button';remove.textContent='Supprimer';remove.onclick=async()=>{try{
 const refs=bookings().filter(r=>r.tables.includes(t.number));
 if(refs.length)throw Error('Cette table figure dans '+refs.length+' réservation(s), y compris l’historique. Suppression bloquée pour préserver les données.');
 if(!await window.RestoDialog.confirm('Supprimer définitivement la table '+t.number+' ?',{title:'Supprimer la table',danger:true,acceptLabel:'Supprimer'}))return;
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
 const base=FloorPlan.tableOptions({id:'table-v3-'+Date.now(),number,capacityMin:min,capacity:max,roomId,shape:'rectangle',width:1.2,depth:.8,angle:0,x:1,y:1});
 const spot=FloorPlan.freeSpot(next,base);if(!spot)throw Error('Impossible de placer la table dans la salle enregistrée.');next.tables.push({...base,...spot});
 }
 FloorPlan.save(next);editId=null;form.reset();$('tableAdminSubmit').textContent='Ajouter la table';feedback.textContent='Table enregistrée.';refresh();window.dispatchEvent(new Event('restomanager:v3-tables'));
 }catch(err){feedback.textContent='Enregistrement impossible : '+err.message}});
window.addEventListener('restomanager:v3-tables',refresh);refresh();
})();

(function(){
const form=document.getElementById('tableAdminForm');if(!form)return;
const box=document.createElement('section');box.className='roomManager';
box.innerHTML='<h3>Gestion des salles</h3><p class="muted">Ajoutez des salles et affectez-leur des tables.</p><div id="roomManagerList"></div><form id="roomManagerForm"><label>Nom de la nouvelle salle <input id="roomManagerName" maxlength="60" required placeholder="Ex. Salon privé"></label><button type="submit">Ajouter une salle</button></form><p id="roomManagerFeedback" role="status"></p>';
form.parentElement.insertBefore(box,form);
const list=box.querySelector('#roomManagerList'),feedback=box.querySelector('#roomManagerFeedback');
function refresh(){const plan=FloorPlan.get();list.replaceChildren();for(const room of plan.rooms){const row=document.createElement('div');row.className='roomManagerItem';const tables=plan.tables.filter(t=>t.roomId===room.id);const label=document.createElement('span');label.textContent=room.name+' · '+tables.length+' tables · '+tables.reduce((n,t)=>n+t.capacity,0)+' places';row.append(label);if(room.id!=='main'){const remove=document.createElement('button');remove.type='button';remove.textContent='Supprimer';remove.addEventListener('click',async()=>{try{const next=FloorPlan.get();if(next.tables.some(t=>t.roomId===room.id)||next.elements.some(e=>e.roomId===room.id))throw Error('Cette salle contient encore des tables ou du mobilier.');if(!await window.RestoDialog.confirm('Supprimer la salle '+room.name+' ?',{title:'Supprimer la salle',danger:true,acceptLabel:'Supprimer'}))return;next.rooms=next.rooms.filter(r=>r.id!==room.id);FloorPlan.save(next);window.dispatchEvent(new Event('restomanager:v3-tables'));feedback.textContent='Salle supprimée.'}catch(e){feedback.textContent=e.message}});row.append(remove)}list.append(row)}}
box.querySelector('#roomManagerForm').addEventListener('submit',e=>{e.preventDefault();try{const name=box.querySelector('#roomManagerName').value.trim(),next=FloorPlan.get();if(!name||next.rooms.some(r=>r.name.toLowerCase()===name.toLowerCase()))throw Error('Nom vide ou déjà utilisé.');next.rooms.push({id:'room-'+Date.now(),name,width:12,depth:12,floor:'plain'});FloorPlan.save(next);box.querySelector('#roomManagerName').value='';window.dispatchEvent(new Event('restomanager:v3-tables'));feedback.textContent='Salle ajoutée : '+name}catch(err){feedback.textContent=err.message}});
window.addEventListener('restomanager:v3-tables',refresh);refresh();
})();
'use strict';
(function(){
const $=id=>document.getElementById(id),E=ReservationEngine,KEY='restomanager_reservations';
const form=$('tableAdminForm'),list=$('tableAdminList'),feedback=$('tableAdminFeedback');if(!form)return;
form.noValidate=true;
const submitButton=$('tableAdminSubmit');
submitButton.addEventListener('click',()=>{if(editId&&window.RestoSharedReservations)feedback.textContent='Enregistrement des modifications…';});
let editId=null;
function bookings(){return E.normalizeReservations(window.RestoSharedReservations||JSON.parse(localStorage.getItem(KEY)||'[]'))}
function refresh(){
 const plan=TableStore.get();list.replaceChildren();list.lastRoom=null;const rooms=$('tableAdminRoom');const selectedRoom=rooms.value;rooms.replaceChildren();plan.rooms.forEach(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.id==='main'&&['Salle à configurer','Salle principale'].includes(r.name)?'Salle principale':r.name;rooms.append(o)});if(plan.rooms.some(r=>r.id===selectedRoom))rooms.value=selectedRoom;
 plan.tables.slice().sort((a,b)=>a.roomId.localeCompare(b.roomId)||a.number-b.number).forEach(t=>{
 if(!list.lastRoom||list.lastRoom!==t.roomId){const heading=document.createElement('h4');heading.textContent=plan.rooms.find(r=>r.id===t.roomId)?.name||'Salle';list.append(heading);list.lastRoom=t.roomId}
 const row=document.createElement('div');row.className='tableAdminItem';
 const info=document.createElement('span');info.textContent='Table '+t.number+' · '+(t.capacityMin||1)+'–'+t.capacity+' places · '+(plan.rooms.find(r=>r.id===t.roomId)?.name||'Salle');
 const edit=document.createElement('button');edit.type='button';edit.textContent='Modifier';edit.onclick=()=>{editId=t.id;feedback.textContent='Modification de la table '+t.number+' : vérifiez les champs puis enregistrez.';$('tableAdminNumber').value=t.number;$('tableAdminMin').value=t.capacityMin||1;$('tableAdminMax').value=t.capacity;$('tableAdminRoom').value=t.roomId;$('tableAdminSubmit').textContent='Enregistrer les modifications';form.scrollIntoView({behavior:'smooth',block:'center'})};
 const remove=document.createElement('button');remove.type='button';remove.textContent='Supprimer';if(window.RestoSharedReservations)remove.textContent='Désactiver';remove.onclick=async()=>{try{
 if(window.RestoSharedReservations){
  if(!await window.RestoDialog.confirm('Désactiver la table '+t.number+' ? Elle ne sera plus proposée pour les nouvelles réservations. Son historique sera conservé.',{title:'Désactiver la table',danger:true,acceptLabel:'Désactiver'}))return;
  if(typeof window.RestoSetRestaurantTableActive!=='function')throw Error('Service temporairement indisponible.');
  await window.RestoSetRestaurantTableActive(t.id,false);await window.RestoRefreshSharedService();feedback.textContent='✓ Table '+t.number+' désactivée.';return;
 }

 const refs=bookings().filter(r=>r.tables.includes(t.number));
 if(refs.length)throw Error('Cette table figure dans '+refs.length+' réservation(s), y compris l’historique. Suppression bloquée pour préserver les données.');
 if(!await window.RestoDialog.confirm('Supprimer définitivement la table '+t.number+' ?',{title:'Supprimer la table',danger:true,acceptLabel:'Supprimer'}))return;
 const next=TableStore.get();next.tables=next.tables.filter(x=>x.id!==t.id);TableStore.save(next);refresh();window.dispatchEvent(new Event('restomanager:v3-tables'));feedback.textContent='Table supprimée.';
 }catch(e){feedback.textContent=e.message}};
 row.append(info,edit,remove);list.append(row);
 });
 if(window.RestoSharedReservations&&window.RestoInactiveRestaurantTables?.length){
  const heading=document.createElement('h4');heading.textContent='Tables désactivées';list.append(heading);
  for(const t of window.RestoInactiveRestaurantTables){
   const row=document.createElement('div');row.className='tableAdminItem';
   const info=document.createElement('span');info.textContent=t.label+' · '+t.seats+' places · désactivée';
   const restore=document.createElement('button');restore.type='button';restore.textContent='Réactiver';
   restore.addEventListener('click',async()=>{try{
    if(!await window.RestoDialog.confirm('Réactiver '+t.label+' ?', {title:'Réactiver une table',acceptLabel:'Réactiver'}))return;
    await window.RestoSetRestaurantTableActive(t.id,true);await window.RestoRefreshSharedService();feedback.textContent='✓ '+t.label+' réactivée.';
   }catch(err){feedback.textContent='Réactivation impossible : '+err.message}});
   row.append(info,restore);list.append(row);
  }
 }
}
$('tableAdminNew').textContent='Réinitialiser le formulaire';
$('tableAdminNew').addEventListener('click',()=>{editId=null;form.reset();$('tableAdminSubmit').textContent='Ajouter la table';$('tableAdminMin').value=1;$('tableAdminMax').value=2;feedback.textContent='Formulaire prêt pour une nouvelle table.';$('tableAdminNumber').focus()});
form.addEventListener('submit',async e=>{e.preventDefault();try{
 const next=TableStore.get(),number=Number($('tableAdminNumber').value),min=Number($('tableAdminMin').value),max=Number($('tableAdminMax').value),roomId=$('tableAdminRoom').value;
 if(!Number.isInteger(number)||number<1)throw Error('Indiquez un numéro de table entier supérieur à zéro.');
 if(!Number.isInteger(min)||min<1||!Number.isInteger(max)||max<min)throw Error('Vérifiez les capacités : le maximum doit être supérieur ou égal au minimum.');
 if(!next.rooms.some(r=>r.id===roomId))throw Error('Sélectionnez une salle valide.');
 if(next.tables.some(t=>t.number===number&&t.id!==editId))throw Error('Ce numéro de table existe déjà.');
 if(window.RestoSharedReservations){
  if(!window.RestoSupabaseReady)throw Error('Chargement des données en cours.');
  
  if(editId&&!next.tables.some(t=>t.id===editId))throw Error('Table introuvable.');
  if(min!==1)throw Error('La capacité minimale doit être de 1 place pour le moment.');
  const sharedRooms=window.RestoSharedRoomIds;
  const sharedRoomId=sharedRooms?.get(roomId);
  if(!sharedRoomId)throw Error('Salle introuvable.');
  if(typeof window.RestoUpdateRestaurantTable!=='function'||typeof window.RestoCreateRestaurantTable!=='function')throw Error('Service temporairement indisponible.');
  feedback.textContent='Enregistrement des modifications…';
  submitButton.disabled=true;
  try{if(editId)await window.RestoUpdateRestaurantTable({id:editId,label:'Table '+number,seats:max,roomId:sharedRoomId});
  else await window.RestoCreateRestaurantTable({label:'Table '+number,seats:max,roomId:sharedRoomId});
  await window.RestoRefreshSharedService();}
  finally{submitButton.disabled=false;}
  const wasEditing=Boolean(editId);editId=null;form.reset();$('tableAdminSubmit').textContent='Ajouter la table';
  feedback.textContent='✓ Table '+number+(wasEditing?' modifiée':' ajoutée')+' avec succès — '+max+' places.';
  refresh();return;
 }

 if(editId){const t=next.tables.find(x=>x.id===editId);if(!t)throw Error('Table introuvable');
 if(t.number!==number&&bookings().some(r=>r.tables.includes(t.number)))throw Error('Renumérotation impossible : des réservations référencent cette table.');
 if(bookings().some(r=>r.tables.includes(t.number)&&E.isBlocking(r)&&r.guests>r.tables.reduce((sum,n)=>sum+(n===t.number?max:(next.tables.find(x=>x.number===n)?.capacity||0)),0)))throw Error('La nouvelle capacité est inférieure aux couverts d’une réservation active, y compris fusionnée.');
 Object.assign(t,{number,capacityMin:min,capacity:max,roomId});
 }else{
 next.tables.push({id:'table-v3-'+Date.now(),number,capacityMin:min,capacity:max,roomId});
 }
 TableStore.save(next);editId=null;form.reset();$('tableAdminSubmit').textContent='Ajouter la table';feedback.textContent='Table enregistrée.';refresh();window.dispatchEvent(new Event('restomanager:v3-tables'));
 }catch(err){feedback.textContent='Enregistrement impossible : '+err.message}});
window.addEventListener('restomanager:v3-tables',refresh);refresh();
})();

(function(){
const form=document.getElementById('tableAdminForm');if(!form)return;
const box=document.createElement('section');box.className='roomManager';
const style=document.createElement('style');style.textContent='.roomManager{padding:16px;border:1px solid #dce8e0;border-radius:16px;margin-bottom:18px}.roomManagerItem{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #dce8e0}.roomManagerForm{display:flex;gap:12px;align-items:end;margin-top:14px}.roomManagerForm label{flex:1}.roomManagerForm input{width:100%;box-sizing:border-box;min-height:44px}@media(max-width:600px){.roomManagerForm{flex-direction:column;align-items:stretch}.roomManagerForm button{min-height:46px}}';document.head.append(style);const styleExtra=document.createElement('style');styleExtra.textContent='.roomManager{padding:16px;margin:0 0 18px;border:1px solid #dbe7df;border-radius:16px;background:#f7faf8}.roomManager h3{margin:0 0 8px}.roomManagerItem{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #dbe7df}.roomManagerItem span{overflow-wrap:anywhere}.roomManagerItem button{min-height:42px}.roomManagerForm{display:flex;gap:10px;align-items:end;margin-top:15px}.roomManagerForm label{flex:1;min-width:0}.roomManagerForm input{width:100%;min-height:44px;box-sizing:border-box}@media(max-width:600px){.roomManagerForm{flex-direction:column;align-items:stretch}.roomManagerForm button{min-height:46px}}';document.head.append(styleExtra);
box.innerHTML='<div class="roomManagerHeader"><div><h3>Gestion des salles</h3><p class="muted">Organisez vos espaces et leur capacité.</p></div></div><div id="roomManagerList"></div><form id="roomManagerForm"><label for="roomManagerName">Nouvelle salle<input id="roomManagerName" maxlength="60" required placeholder="Ex. Salon privé" autocomplete="off"></label><button type="submit"><span aria-hidden="true">＋</span> Ajouter la salle</button></form><p id="roomManagerFeedback" role="status" aria-live="polite"></p>';
form.parentElement.insertBefore(box,form);
const list=box.querySelector('#roomManagerList'),feedback=box.querySelector('#roomManagerFeedback');
function refresh(){const plan=TableStore.get();list.replaceChildren();for(const room of plan.rooms){const row=document.createElement('div');row.className='roomManagerItem';const tables=plan.tables.filter(t=>t.roomId===room.id);const label=document.createElement('span');label.textContent=(room.id==='main'&&['Salle à configurer','Salle principale'].includes(room.name)?'Salle principale':room.name)+' · '+tables.length+' tables · '+tables.reduce((n,t)=>n+t.capacity,0)+' places';row.append(label);if(room.id!=='main'){const remove=document.createElement('button');remove.type='button';remove.textContent='Supprimer';remove.addEventListener('click',async()=>{try{const next=TableStore.get();if(next.tables.some(t=>t.roomId===room.id))throw Error('Cette salle contient encore des tables ou du mobilier.');if(!await window.RestoDialog.confirm('Supprimer la salle '+room.name+' ?',{title:'Supprimer la salle',danger:true,acceptLabel:'Supprimer'}))return;next.rooms=next.rooms.filter(r=>r.id!==room.id);TableStore.save(next);window.dispatchEvent(new Event('restomanager:v3-tables'));feedback.textContent='Salle supprimée.'}catch(e){feedback.textContent=e.message}});row.append(remove)}list.append(row)}}
box.querySelector('#roomManagerForm').addEventListener('submit',e=>{e.preventDefault();try{const name=box.querySelector('#roomManagerName').value.trim(),next=TableStore.get();if(!name||next.rooms.some(r=>r.name.toLowerCase()===name.toLowerCase()))throw Error('Nom vide ou déjà utilisé.');next.rooms.push({id:'room-'+Date.now(),name});TableStore.save(next);box.querySelector('#roomManagerName').value='';window.dispatchEvent(new Event('restomanager:v3-tables'));feedback.textContent='Salle ajoutée : '+name}catch(err){feedback.textContent=err.message}});
window.addEventListener('restomanager:v3-tables',refresh);refresh();
})();
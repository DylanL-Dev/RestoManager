'use strict';
(function(){
const $=id=>document.getElementById(id),E=ReservationEngine,KEY='restomanager_reservations';
const business=message=>window.RestoErrors?.business(message)||Error(message);
const errorMessage=error=>{window.RestoErrors?.diagnostic('table-action',error);return window.RestoErrors?.message(error,'Cette modification n’est pas confirmée. Vérifiez le plan après synchronisation.')||'Cette modification n’est pas confirmée. Vérifiez le plan après synchronisation.'};
const form=$('tableAdminForm'),list=$('tableAdminList'),feedback=$('tableAdminFeedback');if(!form)return;
form.noValidate=true;
const submitButton=$('tableAdminSubmit');
submitButton.addEventListener('click',()=>{if(editId&&window.RestoSharedReservations)feedback.textContent='Enregistrement des modifications…';});
let editId=null;
function bookings(){return E.normalizeReservations(window.RestoSharedReservations||JSON.parse(localStorage.getItem(KEY)||'[]'))}
function refresh(){
 const plan=TableStore.get();list.replaceChildren();list.lastRoom=null;const rooms=$('tableAdminRoom');const selectedRoom=rooms.value;rooms.replaceChildren();plan.rooms.forEach(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.id==='main'&&['Salle à configurer','Salle principale'].includes(r.name)?'Salle principale':r.name;rooms.append(o)});if(plan.rooms.some(r=>r.id===selectedRoom))rooms.value=selectedRoom;
 const activeRoom=plan.rooms.find(r=>r.id===rooms.value);
 const roomHeader=document.createElement('div');roomHeader.className='rmTableRoomListHeading';
 const title=document.createElement('strong');title.textContent='Tables · '+(activeRoom?.name||'Salle');
 const count=document.createElement('span'),selectedTables=plan.tables.filter(t=>t.roomId===rooms.value);
 count.textContent=selectedTables.length+' table'+(selectedTables.length>1?'s':'');
 roomHeader.append(title,count);list.append(roomHeader);
 if(!selectedTables.length){
  const empty=document.createElement('p');empty.className='rmTableRoomEmpty';
  empty.textContent='Aucune table dans '+(activeRoom?.name||'cette salle')+'. Choisissez son numéro et sa capacité puis cliquez sur « Ajouter la table ».';
  list.append(empty);
 }
 selectedTables.sort((a,b)=>a.number-b.number).forEach(t=>{
 if(!list.lastRoom||list.lastRoom!==t.roomId){const heading=document.createElement('h4');heading.textContent=plan.rooms.find(r=>r.id===t.roomId)?.name||'Salle';list.append(heading);list.lastRoom=t.roomId}
 const row=document.createElement('div');row.className='tableAdminItem';
 const info=document.createElement('span');info.textContent='Table '+t.number+' · '+(t.capacityMin||1)+'–'+t.capacity+' places · '+(plan.rooms.find(r=>r.id===t.roomId)?.name||'Salle');
 const edit=document.createElement('button');edit.type='button';edit.textContent='Modifier';edit.onclick=()=>{editId=t.id;feedback.textContent='Modification de la table '+t.number+' : vérifiez les champs puis enregistrez.';$('tableAdminNumber').value=t.number;$('tableAdminMin').value=t.capacityMin||1;$('tableAdminMax').value=t.capacity;$('tableAdminRoom').value=t.roomId;$('tableAdminSubmit').textContent='Enregistrer les modifications';form.scrollIntoView({behavior:'smooth',block:'center'})};
 const remove=document.createElement('button');remove.type='button';remove.textContent='Supprimer';if(window.RestoSharedReservations)remove.textContent='Retirer';remove.onclick=async()=>{try{
 if(window.RestoSharedReservations){
  if(!await window.RestoDialog.confirm('Retirer la table '+t.number+' de cette salle ? Elle ne sera plus proposée, mais son historique sera conservé. Vous pourrez la réactiver.',{title:'Retirer la table',danger:true,acceptLabel:'Retirer'}))return;
  if(typeof window.RestoSetRestaurantTableActive!=='function')throw business('Service temporairement indisponible.');
  await window.RestoSetRestaurantTableActive(t.id,false);await window.RestoRefreshSharedService();feedback.textContent='✓ Table '+t.number+' désactivée.';return;
 }

 const refs=bookings().filter(r=>r.tables.includes(t.number));
 if(refs.length)throw business('Cette table figure dans '+refs.length+' réservation(s), y compris l’historique. Suppression bloquée pour préserver les données.');
 if(!await window.RestoDialog.confirm('Supprimer définitivement la table '+t.number+' ?',{title:'Supprimer la table',danger:true,acceptLabel:'Supprimer'}))return;
 const next=TableStore.get();next.tables=next.tables.filter(x=>x.id!==t.id);TableStore.save(next);refresh();window.dispatchEvent(new Event('restomanager:v3-tables'));feedback.textContent='Table supprimée.';
 }catch(e){feedback.textContent=errorMessage(e)}};
 row.append(info,edit,remove);list.append(row);
 });
 const selectedInactive=(window.RestoInactiveRestaurantTables||[]).filter(t=>t.room_id===window.RestoSharedRoomIds?.get(rooms.value));
 if(window.RestoSharedReservations&&selectedInactive.length){
  const heading=document.createElement('h4');heading.textContent='Tables retirées · '+(activeRoom?.name||'Salle');list.append(heading);
  for(const t of selectedInactive){
   const row=document.createElement('div');row.className='tableAdminItem';
   const info=document.createElement('span');info.textContent=t.label+' · '+t.seats+' places · désactivée';
   const restore=document.createElement('button');restore.type='button';restore.textContent='Réactiver';
   restore.addEventListener('click',async()=>{try{
    if(!await window.RestoDialog.confirm('Réactiver '+t.label+' ?', {title:'Réactiver une table',acceptLabel:'Réactiver'}))return;
    await window.RestoSetRestaurantTableActive(t.id,true);await window.RestoRefreshSharedService();feedback.textContent='✓ '+t.label+' réactivée.';
   }catch(err){feedback.textContent=errorMessage(err)}});
   row.append(info,restore);list.append(row);
  }
 }
}
$('tableAdminNew').textContent='Réinitialiser le formulaire';
$('tableAdminNew').addEventListener('click',()=>{editId=null;form.reset();$('tableAdminSubmit').textContent='Ajouter la table';$('tableAdminMin').value=1;$('tableAdminMax').value=2;feedback.textContent='Formulaire prêt pour une nouvelle table.';$('tableAdminNumber').focus()});
form.addEventListener('submit',async e=>{e.preventDefault();try{
 const next=TableStore.get(),number=Number($('tableAdminNumber').value),min=Number($('tableAdminMin').value),max=Number($('tableAdminMax').value),roomId=$('tableAdminRoom').value;
 if(!Number.isInteger(number)||number<1)throw business('Indiquez un numéro de table entier supérieur à zéro.');
 if(!Number.isInteger(min)||min<1||!Number.isInteger(max)||max<min)throw business('Vérifiez les capacités : le maximum doit être supérieur ou égal au minimum.');
 if(!next.rooms.some(r=>r.id===roomId))throw business('Sélectionnez une salle valide.');
 if(next.tables.some(t=>t.number===number&&t.id!==editId))throw business('Ce numéro de table existe déjà.');
 if(window.RestoSharedReservations){
  if(!window.RestoSupabaseReady)throw business('Chargement des données en cours.');
  
  if(editId&&!next.tables.some(t=>t.id===editId))throw business('Table introuvable.');
  if(min!==1)throw business('La capacité minimale doit être de 1 place pour le moment.');
  const sharedRooms=window.RestoSharedRoomIds;
  const sharedRoomId=sharedRooms?.get(roomId);
  if(!sharedRoomId)throw business('Salle introuvable.');
  if(typeof window.RestoUpdateRestaurantTable!=='function'||typeof window.RestoCreateRestaurantTable!=='function')throw business('Service temporairement indisponible.');
  feedback.textContent='Enregistrement des modifications…';
  submitButton.disabled=true;
  try{if(editId)await window.RestoUpdateRestaurantTable({id:editId,label:'Table '+number,seats:max,roomId:sharedRoomId});
  else await window.RestoCreateRestaurantTable({label:'Table '+number,seats:max,roomId:sharedRoomId});
  await window.RestoRefreshSharedService();}
  finally{submitButton.disabled=false;}
  const wasEditing=Boolean(editId);editId=null;form.reset();$('tableAdminRoom').value=roomId;$('tableAdminSubmit').textContent='Ajouter la table';
  feedback.textContent='✓ Table '+number+(wasEditing?' modifiée':' ajoutée')+' avec succès — '+max+' places.';
  refresh();return;
 }

 if(editId){const t=next.tables.find(x=>x.id===editId);if(!t)throw business('Table introuvable');
 if(t.number!==number&&bookings().some(r=>r.tables.includes(t.number)))throw business('Renumérotation impossible : des réservations référencent cette table.');
 if(bookings().some(r=>r.tables.includes(t.number)&&E.isBlocking(r)&&r.guests>r.tables.reduce((sum,n)=>sum+(n===t.number?max:(next.tables.find(x=>x.number===n)?.capacity||0)),0)))throw business('La nouvelle capacité est inférieure aux couverts d’une réservation active, y compris fusionnée.');
 Object.assign(t,{number,capacityMin:min,capacity:max,roomId});
 }else{
 next.tables.push({id:'table-v3-'+Date.now(),number,capacityMin:min,capacity:max,roomId});
 }
 TableStore.save(next);editId=null;form.reset();$('tableAdminSubmit').textContent='Ajouter la table';feedback.textContent='Table enregistrée.';refresh();window.dispatchEvent(new Event('restomanager:v3-tables'));
 }catch(err){feedback.textContent=errorMessage(err)}});
window.addEventListener('restomanager:v3-tables',refresh);window.addEventListener('restomanager:supabase-snapshot',refresh);
$('tableAdminRoom').addEventListener('change',()=>{editId=null;$('tableAdminSubmit').textContent='Ajouter la table';feedback.textContent='Affichage des tables de la salle sélectionnée.';refresh()});refresh();
})();

(function(){
const business=message=>window.RestoErrors?.business(message)||Error(message);
const errorMessage=error=>{window.RestoErrors?.diagnostic('room-action',error);return window.RestoErrors?.message(error,'Cette modification de salle n’est pas confirmée.')||'Cette modification de salle n’est pas confirmée.'};
const form=document.getElementById('tableAdminForm');if(!form)return;
const box=document.createElement('section');box.className='roomManager';
const style=document.createElement('style');style.textContent='.roomManager{padding:16px;border:1px solid #dce8e0;border-radius:16px;margin-bottom:18px}.roomManagerItem{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #dce8e0}.roomManagerForm{display:flex;gap:12px;align-items:end;margin-top:14px}.roomManagerForm label{flex:1}.roomManagerForm input{width:100%;box-sizing:border-box;min-height:44px}@media(max-width:600px){.roomManagerForm{flex-direction:column;align-items:stretch}.roomManagerForm button{min-height:46px}}';document.head.append(style);const styleExtra=document.createElement('style');styleExtra.textContent='.roomManager{padding:16px;margin:0 0 18px;border:1px solid #dbe7df;border-radius:16px;background:#f7faf8}.roomManager h3{margin:0 0 8px}.roomManagerItem{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #dbe7df}.roomManagerItem span{overflow-wrap:anywhere}.roomManagerItem button{min-height:42px}.roomManagerForm{display:flex;gap:10px;align-items:end;margin-top:15px}.roomManagerForm label{flex:1;min-width:0}.roomManagerForm input{width:100%;min-height:44px;box-sizing:border-box}@media(max-width:600px){.roomManagerForm{flex-direction:column;align-items:stretch}.roomManagerForm button{min-height:46px}}';document.head.append(styleExtra);
const renameStyle=document.createElement('style');
renameStyle.textContent='.roomManagerItem{flex-wrap:wrap}.roomManagerItem>span{flex:1 1 160px}.roomManagerRenameToggle,.roomManagerRenameCancel{border:1px solid #b9d9c8;border-radius:9px;background:#e8f5ed;color:#176347;padding:9px 12px;font-weight:700}.roomManagerRenameForm{order:5;flex:1 0 100%;display:flex;flex-wrap:wrap;align-items:end;gap:9px;padding:11px 0 2px}.roomManagerRenameForm[hidden]{display:none!important}.roomManagerRenameForm label{flex:1 1 220px;display:grid;gap:6px;font-size:13px}.roomManagerRenameForm input{width:100%;box-sizing:border-box;min-height:44px;padding:8px;border:1px solid #abc8b9;border-radius:9px}.roomManagerRenameForm button{min-height:44px}.roomManagerRenameForm button:focus-visible,.roomManagerRenameToggle:focus-visible{outline:3px solid #17805a;outline-offset:2px}@media(max-width:600px){.roomManagerRenameForm label{flex-basis:100%}.roomManagerRenameForm button{flex:1 1 125px}}';
document.head.append(renameStyle);
box.innerHTML='<div class="roomManagerHeader"><div><h3>Gestion des salles</h3><p class="muted">Organisez vos espaces et leur capacité.</p></div></div><div id="roomManagerList"></div><form id="roomManagerForm"><label for="roomManagerName">Nouvelle salle<input id="roomManagerName" maxlength="60" required placeholder="Ex. Salon privé" autocomplete="off"></label><button type="submit"><span aria-hidden="true">＋</span> Ajouter la salle</button></form><p id="roomManagerFeedback" role="status" aria-live="polite"></p>';
form.parentElement.insertBefore(box,form);
const list=box.querySelector('#roomManagerList'),feedback=box.querySelector('#roomManagerFeedback');

const roomName=room=>room.id==='main'&&['Salle à configurer','Salle principale'].includes(room.name)?'Salle principale':room.name;
function addRoomRenameControls(row,room){
 const toggle=document.createElement('button');toggle.type='button';toggle.className='roomManagerRenameToggle';
 toggle.textContent='Renommer';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Renommer '+roomName(room));
 const editor=document.createElement('form');editor.className='roomManagerRenameForm';editor.hidden=true;editor.noValidate=true;
 const label=document.createElement('label');label.textContent='Nouveau nom de la salle';
 const input=document.createElement('input');input.type='text';input.required=true;input.maxLength=60;input.value=roomName(room);
 label.append(input);
 const save=document.createElement('button');save.type='submit';save.textContent='Enregistrer';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Annuler';cancel.className='roomManagerRenameCancel';
 editor.append(label,save,cancel);row.append(toggle,editor);
 const close=()=>{editor.hidden=true;toggle.setAttribute('aria-expanded','false')};
 toggle.addEventListener('click',()=>{const open=editor.hidden;editor.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open){input.focus();input.select()}});
 cancel.addEventListener('click',()=>{input.value=roomName(room);close()});
 editor.addEventListener('submit',async event=>{
  event.preventDefault();if(save.disabled)return;
  save.disabled=true;cancel.disabled=true;toggle.disabled=true;
  try{
   const name=input.value.trim(),plan=TableStore.get();
   if(!name||name.length>60)throw business('Indiquez un nom de salle de 1 à 60 caractères.');
   if(plan.rooms.some(other=>other.id!==room.id&&other.name.trim().toLocaleLowerCase('fr')===name.toLocaleLowerCase('fr')))
    throw business('Une autre salle porte déjà ce nom.');
   if(name===room.name){feedback.textContent='Nom inchangé.';close();return}
   if(window.RestoSharedReservations){
    if(!window.RestoSupabaseReady||typeof window.RestoRenameRestaurantRoom!=='function')throw business('Synchronisation indisponible : salle non renommée.');
    const roomId=window.RestoSharedRoomIds?.get(room.id);
    if(!roomId)throw business('Salle introuvable. Actualisez les données.');
    feedback.textContent='Renommage et synchronisation de la salle…';
    await window.RestoRenameRestaurantRoom(roomId,name);
    await window.RestoRefreshSharedService();
   }else{
    const next=TableStore.get(),target=next.rooms.find(item=>item.id===room.id);
    if(!target)throw business('Salle introuvable.');
    target.name=name;TableStore.save(next);window.dispatchEvent(new Event('restomanager:v3-tables'));
   }
   feedback.textContent='✓ Salle « '+name+' » renommée et synchronisée.';close();
  }catch(error){feedback.textContent=errorMessage(error)}
  finally{save.disabled=false;cancel.disabled=false;toggle.disabled=false}
 });
}
function refresh(){const plan=TableStore.get();list.replaceChildren();for(const room of plan.rooms){const row=document.createElement('div');row.className='roomManagerItem';const tables=plan.tables.filter(t=>t.roomId===room.id);const label=document.createElement('span');label.textContent=(room.id==='main'&&['Salle à configurer','Salle principale'].includes(room.name)?'Salle principale':room.name)+' · '+tables.length+' tables · '+tables.reduce((n,t)=>n+t.capacity,0)+' places';row.append(label);addRoomRenameControls(row,room);if(room.id!=='main'){const remove=document.createElement('button');remove.type='button';remove.textContent='Supprimer';remove.addEventListener('click',async()=>{try{const next=TableStore.get();if(next.tables.some(t=>t.roomId===room.id))throw business('Cette salle contient encore des tables ou du mobilier.');if(!await window.RestoDialog.confirm('Supprimer la salle vide « '+room.name+' » de la liste active ? Les données historiques seront conservées.',{title:'Supprimer la salle',danger:true,acceptLabel:'Supprimer'}))return;if(window.RestoSharedReservations){if(!window.RestoSupabaseReady||typeof window.RestoDeactivateRestaurantRoom!=='function')throw business('Synchronisation indisponible : suppression impossible.');await window.RestoDeactivateRestaurantRoom(window.RestoSharedRoomIds?.get(room.id));await window.RestoRefreshSharedService();feedback.textContent='Salle désactivée et synchronisée.'}else{next.rooms=next.rooms.filter(r=>r.id!==room.id);TableStore.save(next);window.dispatchEvent(new Event('restomanager:v3-tables'));feedback.textContent='Salle supprimée.'}}catch(e){feedback.textContent=errorMessage(e)}});row.append(remove)}list.append(row)}}
box.querySelector('#roomManagerForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const input=box.querySelector('#roomManagerName'),button=box.querySelector('#roomManagerForm button');
 if(button.disabled)return;
 button.disabled=true;
 try{
  const name=input.value.trim(),next=TableStore.get();
  if(!name||next.rooms.some(r=>r.name.toLocaleLowerCase('fr')===name.toLocaleLowerCase('fr')))throw business('Nom vide ou déjà utilisé.');
  if(window.RestoSharedReservations){
   if(!window.RestoSupabaseReady||typeof window.RestoCreateRestaurantRoom!=='function')throw business('Synchronisation indisponible : salle non créée.');
   feedback.textContent='Création et synchronisation de la salle…';
   await window.RestoCreateRestaurantRoom(name);
   await window.RestoRefreshSharedService();
   feedback.textContent='✓ Salle '+name+' créée et synchronisée.';
  }else{
   next.rooms.push({id:'room-'+Date.now(),name});
   TableStore.save(next);window.dispatchEvent(new Event('restomanager:v3-tables'));
   feedback.textContent='Salle ajoutée : '+name;
  }
  input.value='';
 }catch(err){feedback.textContent=errorMessage(err)}
 finally{button.disabled=false}
});
window.addEventListener('restomanager:v3-tables',refresh);window.addEventListener('restomanager:supabase-snapshot',refresh);refresh();
})();
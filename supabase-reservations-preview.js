import {requireStaff,loadSharedService,subscribeSharedService} from './supabase-service-bridge.js';
import {acquireHold,releaseHold,confirmReservation} from './supabase-reservation-actions.js';
const $=id=>document.getElementById(id);
let held=null,holdExpiry=0,selectSeq=0,submitting=false;
const isoLocal=id=>{const v=$(id).value;return v?new Date(v).toISOString():null;};
function bookingMessage(s){$('bookingStatus').textContent=s;}
function resetHoldState(){held=null;holdExpiry=0;$('confirmBooking').disabled=true;$('cancelHold').disabled=true;}
async function abandonHold(){const old=held;resetHoldState();if(old){try{await releaseHold(old.id);}catch(e){bookingMessage('Impossible de libérer le verrouillage : '+e.message);}}}
async function selectTable(){const seq=++selectSeq;await abandonHold();const tableId=$('tableId').value;if(!tableId)return;
 let start,end;try{start=isoLocal('startsAt');end=isoLocal('endsAt');if(!start||!end||new Date(end)<=new Date(start))throw Error('Vérifiez les horaires');}catch(e){bookingMessage(e.message);return;}
 bookingMessage('Verrouillage de la table…');try{const id=await acquireHold({tableId,startsAt:start,endsAt:end});if(seq!==selectSeq){await releaseHold(id);return;}held={id,tableId,start,end};holdExpiry=Date.now()+170000;$('confirmBooking').disabled=false;$('cancelHold').disabled=false;bookingMessage('Table bloquée temporairement. Confirmez dans les 3 minutes.');}catch(e){bookingMessage('Table indisponible : '+e.message);}}

let stop=null,loading=false;
function showError(error){$('connection').textContent='Connexion aux données indisponible';$('detail').textContent=error?.message||'Erreur de synchronisation';$('detail').classList.add('error');}
function showSnapshot(data){
 $('content').classList.remove('hidden');$('connection').textContent='Données Supabase chargées';
 $('detail').textContent='Synchronisation active · Dernière mise à jour : '+new Date().toLocaleTimeString('fr-FR');
 $('detail').classList.remove('error');
 $('reservationsCount').textContent=data.reservations.length;
 $('tablesCount').textContent=data.tables.length;
 $('roomsCount').textContent=data.rooms.length;
 $('holdsCount').textContent=data.holds.filter(h=>Date.parse(h.expires_at)>Date.now()).length;
 const names=new Map(data.tables.map(t=>[t.id,t.label]));
 const assigned=new Map();
 for(const row of data.assignments){const values=assigned.get(row.reservation_id)||[];values.push(names.get(row.table_id)||'—');assigned.set(row.reservation_id,values);}
 const select=$('tableId'),selected=select.value;select.replaceChildren(new Option('Choisir une table',''));
 for(const table of data.tables.filter(t=>t.active)){const option=new Option(table.label+' ('+table.seats+' places)',table.id);select.append(option);}select.value=selected;
 const tbody=$('reservationRows');tbody.replaceChildren();
 for(const reservation of data.reservations){
  const tr=document.createElement('tr');
  const cells=[reservation.guest_name,reservation.hotel_room||'—',reservation.party_size,
   new Date(reservation.starts_at).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}),
   reservation.status,(assigned.get(reservation.id)||[]).join(', ')||'—'];
  for(const value of cells){const td=document.createElement('td');td.textContent=String(value??'—');tr.append(td);}
  tbody.append(tr);
 }
 $('empty').classList.toggle('hidden',data.reservations.length!==0);
}
async function refresh(){
 if(loading)return;loading=true;
 try{showSnapshot(await loadSharedService());}catch(error){showError(error);}finally{loading=false;}
}
async function start(){
 try{
  const {profile}=await requireStaff();
  $('connection').textContent='Connecté : '+(profile.role==='fb_admin'?'F&B':'Réception');
  $('refresh').disabled=false;
  stop=await subscribeSharedService(showSnapshot,showError);
 }catch(error){showError(error);$('detail').textContent='Connectez-vous avec un compte autorisé pour accéder aux réservations.';}
}
$('refresh').addEventListener('click',refresh);
window.addEventListener('pagehide',()=>{if(stop)stop();});
start();

for(const id of ['tableId','startsAt','endsAt'])$(id).addEventListener('change',selectTable);
$('cancelHold').addEventListener('click',async()=>{++selectSeq;await abandonHold();$('tableId').value='';bookingMessage('Sélection annulée.');});
$('bookingForm').addEventListener('submit',async e=>{
 e.preventDefault();if(submitting)return;
 if(!held||Date.now()>holdExpiry){bookingMessage('Le verrouillage a expiré : sélectionnez à nouveau la table.');resetHoldState();return;}
 const start=isoLocal('startsAt'),end=isoLocal('endsAt');
 if(held.tableId!==$('tableId').value||held.start!==start||held.end!==end){bookingMessage('Les horaires ont changé : sélectionnez à nouveau la table.');return;}
 submitting=true;$('confirmBooking').disabled=true;
 try{const id=await confirmReservation({guestName:$('guest').value.trim(),hotelRoom:$('hotelRoom').value.trim(),partySize:Number($('partySize').value),startsAt:start,endsAt:end,tableIds:[held.tableId],notes:$('notes').value.trim()});
  resetHoldState();$('bookingForm').reset();bookingMessage('Réservation enregistrée : '+id);await refresh();
 }catch(error){bookingMessage('Confirmation refusée : '+error.message+'. Vérifiez la disponibilité et sélectionnez à nouveau la table.');resetHoldState();}
 finally{submitting=false;}
});

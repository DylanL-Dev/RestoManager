import {requireStaff,loadSharedService,subscribeSharedService} from './supabase-service-bridge.js';
import {acquireHold,releaseHold,confirmReservation} from './supabase-reservation-actions.js';
const $=id=>document.getElementById(id);
let held=[],holdExpiry=0,selectSeq=0,submitting=false,tableCapacity=new Map();
const selectedIds=()=>Array.from($('tableId').selectedOptions,option=>option.value);
const isoLocal=id=>{const v=$(id).value;return v?new Date(v).toISOString():null;};
function bookingMessage(s){$('bookingStatus').textContent=s;}
function resetHoldState(){held=[];holdExpiry=0;$('confirmBooking').disabled=true;$('cancelHold').disabled=true;}
async function abandonHold(){
 const previous=held;resetHoldState();
 await Promise.allSettled(previous.map(h=>releaseHold(h.id)));
}
async function selectTable(){
 const seq=++selectSeq;
 await abandonHold();
 if(seq!==selectSeq)return;
 const ids=selectedIds();
 if(!ids.length)return;
 let start,end;
 try{
  start=isoLocal('startsAt');end=isoLocal('endsAt');
  if(!start||!end||new Date(end)<=new Date(start))throw Error('Vérifiez les horaires');
  if(ids.reduce((sum,id)=>sum+(tableCapacity.get(id)||0),0)<Number($('partySize').value))throw Error('Capacité des tables insuffisante');
 }catch(e){bookingMessage(e.message);return;}
 bookingMessage('Verrouillage des '+ids.length+' tables…');
 const acquired=[];
 try{
  for(const tableId of [...ids].sort()){
   const id=await acquireHold({tableId,startsAt:start,endsAt:end});
   acquired.push({id,tableId,start,end});
   if(seq!==selectSeq)throw Error('Sélection modifiée');
  }
  held=acquired;holdExpiry=Date.now()+165000;
  $('confirmBooking').disabled=false;$('cancelHold').disabled=false;
  bookingMessage(ids.length+' table(s) bloquée(s). Confirmez rapidement.');
 }catch(error){
  await Promise.allSettled(acquired.map(h=>releaseHold(h.id)));
  if(seq===selectSeq)bookingMessage('Tables indisponibles : '+error.message);
 }
}

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
 const select=$('tableId'),selected=new Set(selectedIds());select.replaceChildren();tableCapacity=new Map(data.tables.map(t=>[t.id,Number(t.seats)||0]));
 for(const table of data.tables.filter(t=>t.active)){const option=new Option(table.label+' ('+table.seats+' places)',table.id);option.selected=selected.has(table.id);select.append(option);}
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

for(const id of ['tableId','startsAt','endsAt','partySize'])$(id).addEventListener('change',()=>{void selectTable();});
$('cancelHold').addEventListener('click',async()=>{++selectSeq;await abandonHold();for(const option of $('tableId').options)option.selected=false;bookingMessage('Sélection annulée.');});
$('bookingForm').addEventListener('submit',async e=>{
 e.preventDefault();if(submitting)return;
 const ids=selectedIds(),start=isoLocal('startsAt'),end=isoLocal('endsAt');
 if(!held.length||Date.now()>holdExpiry||held.length!==ids.length||held.some(h=>!ids.includes(h.tableId)||h.start!==start||h.end!==end)){
  bookingMessage('Verrouillage absent ou expiré. Sélectionnez à nouveau les tables.');await abandonHold();return;
 }
 submitting=true;$('confirmBooking').disabled=true;
 try{
  const id=await confirmReservation({guestName:$('guest').value.trim(),hotelRoom:$('hotelRoom').value.trim(),partySize:Number($('partySize').value),startsAt:start,endsAt:end,tableIds:ids,notes:$('notes').value.trim()});
  resetHoldState();$('bookingForm').reset();bookingMessage('Réservation enregistrée : '+id);await refresh();
 }catch(error){bookingMessage('Confirmation refusée : '+error.message);await abandonHold();}
 finally{submitting=false;}
});

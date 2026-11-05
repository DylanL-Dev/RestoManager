import {supabase,requireStaff,loadSharedService,subscribeSharedService} from './supabase-service-bridge.js';
import {acquireHold,releaseHold,confirmReservation} from './supabase-reservation-actions.js';
const $=id=>document.getElementById(id);
let held=[],holdExpiry=0,selectSeq=0,submitting=false,renewing=false,tableCapacity=new Map(),latestSnapshot=null;
const selectedIds=()=>Array.from($('tableId').selectedOptions,option=>option.value);
const isoLocal=id=>{const v=$(id).value;return v?new Date(v).toISOString():null;};
function bookingMessage(s){$('bookingStatus').textContent=s;}
function resetHoldState(){held=[];holdExpiry=0;$('confirmBooking').disabled=true;$('cancelHold').disabled=true;}
async function abandonHold(){
 const previous=held;resetHoldState();
 await Promise.allSettled(previous.map(h=>releaseHold(h.id)));
}
async function selectTable(){
 if(submitting)return;
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

// Refresh the server's three-minute hold lease while the booking form stays open.
// Renewal is serialized and guarded by the current selection generation.
async function renewSelectedHolds(){
 if(renewing||submitting||!held.length)return;
 const generation=selectSeq;
 const current=held.slice();
 const ids=selectedIds();
 const start=isoLocal('startsAt'),end=isoLocal('endsAt');
 if(current.some(h=>!ids.includes(h.tableId)||h.start!==start||h.end!==end))return;
 renewing=true;
 try{
  const renewed=[];
  for(const h of current){
   if(generation!==selectSeq)return;
   const id=await acquireHold({tableId:h.tableId,startsAt:start,endsAt:end});
   renewed.push({...h,id});
  }
  if(generation!==selectSeq){
   await Promise.allSettled(renewed.filter(h=>!current.some(old=>old.id===h.id)).map(h=>releaseHold(h.id)));
   return;
  }
  held=renewed;
  holdExpiry=Date.now()+165000;
  bookingMessage('Tables maintenues disponibles pendant votre saisie.');
 }catch(error){
  if(generation===selectSeq){
   ++selectSeq;
   await abandonHold();
   bookingMessage('Le verrouillage a expiré ou a été refusé : sélectionnez à nouveau les tables.');
  }
 }finally{renewing=false;}
}
const holdRenewalTimer=setInterval(()=>{void renewSelectedHolds();},60000);
let stop=null,loading=false,authRedirecting=false;
function leaveProtectedScreen(){
 if(authRedirecting)return;
 authRedirecting=true;
 ++selectSeq;
 resetHoldState();
 $('content').classList.add('hidden');
 $('refresh').disabled=true;
 if(stop)stop();
 if(stopAlerts)stopAlerts();
 window.location.replace('login.html');
}
supabase.auth.onAuthStateChange((event,session)=>{
 if(event==='SIGNED_OUT'||(event==='USER_DELETED')||(!session&&event==='INITIAL_SESSION'))leaveProtectedScreen();
});
function showError(error){$('connection').textContent='Connexion aux données indisponible';$('detail').textContent=error?.message||'Erreur de synchronisation';$('detail').classList.add('error');}
function showSnapshot(data){
 latestSnapshot=data;
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
async function startFbAlerts(){
 let stopped=false;
 const panel=$('fbAlertItems');
 async function reload(){
  if(stopped)return;
  const {data,error}=await supabase.from('fb_reservation_alerts')
   .select('id,guest_name,hotel_room,party_size,starts_at,created_at,read_at')
   .is('read_at',null).order('created_at',{ascending:false}).limit(30);
  if(error){panel.textContent='Notifications indisponibles : '+error.message;return;}
  if(stopped)return;
  $('fbAlertCount').textContent=String(data.length);
  panel.replaceChildren();
  if(!data.length){panel.textContent='Aucune nouvelle réservation de la Réception.';return;}
  for(const alert of data){
   const line=document.createElement('div');
   line.style.cssText='padding:12px 0;border-bottom:1px solid #e6eee8';
   const details=document.createElement('span');
   details.textContent=alert.guest_name+' · '+alert.party_size+' couvert(s) · '+new Date(alert.starts_at).toLocaleString('fr-FR')+(alert.hotel_room?' · Chambre '+alert.hotel_room:'');
   const button=document.createElement('button');
   button.type='button';button.className='secondary';button.textContent='Marquer comme lu';
   button.style.marginLeft='12px';
   button.addEventListener('click',async()=>{
    button.disabled=true;
    const {error}=await supabase.from('fb_reservation_alerts').update({read_at:new Date().toISOString()}).eq('id',alert.id);
    if(error){button.disabled=false;panel.textContent='Impossible de marquer comme lu : '+error.message;return;}
    await reload();
   });
   line.append(details,button);panel.append(line);
  }
 }
 const channel=supabase.channel('restomanager-v3-fb-alerts')
  .on('postgres_changes',{event:'*',schema:'public',table:'fb_reservation_alerts'},()=>{void reload();});
 channel.subscribe(status=>{if(status==='SUBSCRIBED')void reload();});
 await reload();
 return ()=>{stopped=true;void supabase.removeChannel(channel);};
}
async function start(){
 try{
  const {profile}=await requireStaff();
  $('connection').textContent='Connecté : '+(profile.role==='fb_admin'?'F&B':'Réception');
  $('adminLink').hidden=profile.role!=='fb_admin';
  if(profile.role==='fb_admin'){
   $('fbAlerts').classList.remove('hidden');
   stopAlerts=await startFbAlerts();
  }
  $('refresh').disabled=false;
  stop=await subscribeSharedService(showSnapshot,showError);
 }catch(error){showError(error);$('content').classList.add('hidden');$('refresh').disabled=true;$('detail').textContent='Accès réservé au personnel autorisé. Redirection vers la connexion…';leaveProtectedScreen();}
}
$('refresh').addEventListener('click',refresh);
$('logout').addEventListener('click',async()=>{++selectSeq;$('content').classList.add('hidden');$('refresh').disabled=true;await abandonHold();if(stop)stop();if(stopAlerts)stopAlerts();const {error}=await supabase.auth.signOut();if(error){showError(error);return;}window.location.replace('login.html');});
window.addEventListener('pagehide',()=>{clearInterval(holdRenewalTimer);if(stop)stop();if(stopAlerts)stopAlerts();});
start();

for(const id of ['tableId','startsAt','endsAt','partySize'])$(id).addEventListener('change',()=>{void selectTable();});
$('cancelHold').addEventListener('click',async()=>{++selectSeq;await abandonHold();for(const option of $('tableId').options)option.selected=false;bookingMessage('Sélection annulée.');});
$('bookingForm').addEventListener('submit',async e=>{
 e.preventDefault();if(submitting||renewing){bookingMessage('Patientez pendant la vérification des tables.');return;}
 const ids=selectedIds(),start=isoLocal('startsAt'),end=isoLocal('endsAt');
 if(!held.length||Date.now()>holdExpiry||held.length!==ids.length||held.some(h=>!ids.includes(h.tableId)||h.start!==start||h.end!==end)){
  bookingMessage('Verrouillage absent ou expiré. Sélectionnez à nouveau les tables.');await abandonHold();return;
 }
 submitting=true;$('confirmBooking').disabled=true;
 try{
  const id=await confirmReservation({guestName:$('guest').value.trim(),hotelRoom:$('hotelRoom').value.trim(),partySize:Number($('partySize').value),startsAt:start,endsAt:end,tableIds:ids,notes:$('notes').value.trim()});
  ++selectSeq;resetHoldState();$('bookingForm').reset();bookingMessage('Réservation enregistrée : '+id);await refresh();
 }catch(error){bookingMessage('Confirmation refusée : '+error.message);await abandonHold();}
 finally{submitting=false;}
});

function fusionAllowed(data,ids){
 if(ids.length<=1)return true;
 const rooms=new Set(ids.map(id=>data.tables.find(t=>t.id===id)?.room_id));
 if(rooms.size!==1)return false;
 const seen=new Set([ids[0]]);
 let changed=true;
 while(changed){
  changed=false;
  for(const edge of data.fusionLinks||[]){
   if(seen.has(edge.table_a)&&ids.includes(edge.table_b)&&!seen.has(edge.table_b)){seen.add(edge.table_b);changed=true;}
   if(seen.has(edge.table_b)&&ids.includes(edge.table_a)&&!seen.has(edge.table_a)){seen.add(edge.table_a);changed=true;}
  }
 }
 return seen.size===ids.length;
}
function suggestTables(data,partySize,start,end){
 const conflicts=new Set();
 for(const r of data.reservations){
  if(!['reserved','arrived','seated'].includes(r.status))continue;
  if(Date.parse(r.starts_at)<end&&Date.parse(r.ends_at)>start){
   for(const a of data.assignments)if(a.reservation_id===r.id)conflicts.add(a.table_id);
  }
 }
 for(const hold of data.holds){
  if(Date.parse(hold.expires_at)>Date.now()&&Date.parse(hold.starts_at)<end&&Date.parse(hold.ends_at)>start)
   conflicts.add(hold.table_id);
 }
 const tables=data.tables.filter(t=>t.active&&!conflicts.has(t.id)&&Number(t.seats)>0);
 let best=null;
 // Bounded combination search: avoid blocking mobile browsers with large floor plans.
 const candidates=tables.sort((a,b)=>Number(b.seats)-Number(a.seats)).slice(0,32);
 function walk(index,chosen,seats){
  if(seats>=partySize){
   if(!fusionAllowed(data,chosen.map(t=>t.id)))return;
   const score=[chosen.length,seats-partySize];
   if(!best||score[0]<best.score[0]||(score[0]===best.score[0]&&score[1]<best.score[1]))
    best={ids:chosen.map(t=>t.id),score};
   return;
  }
  if(chosen.length>=4||index>=candidates.length||(best&&chosen.length>=best.score[0]))return;
  for(let i=index;i<candidates.length;i++)walk(i+1,[...chosen,candidates[i]],seats+Number(candidates[i].seats));
 }
 walk(0,[],0);
 return best;
}
$('suggestTables').addEventListener('click',async()=>{
 const status=$('suggestion');
 try{
  const start=Date.parse(isoLocal('startsAt')),end=Date.parse(isoLocal('endsAt')),party=Number($('partySize').value);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!Number.isInteger(party)||party<1)throw Error('Renseignez les horaires et le nombre de personnes.');
  status.textContent='Recherche de tables…';
  // Fresh server snapshot is necessary; suggestions are advisory, never a guarantee.
  const snapshot=await loadSharedService();latestSnapshot=snapshot;
  const choice=suggestTables(snapshot,party,start,end);
  if(!choice){status.textContent='Aucune combinaison trouvée parmi les tables disponibles (4 tables maximum).';return;}
  for(const option of $('tableId').options)option.selected=choice.ids.includes(option.value);
  status.textContent='Suggestion : '+choice.ids.map(id=>snapshot.tables.find(t=>t.id===id)?.label||'?').join(' + ')+'. Vérification et verrouillage en cours.';
  await selectTable();
 }catch(error){status.textContent=error.message;}
});

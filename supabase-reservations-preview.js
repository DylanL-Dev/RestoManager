import {requireStaff,loadSharedService,subscribeSharedService} from './supabase-service-bridge.js';
const $=id=>document.getElementById(id);
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

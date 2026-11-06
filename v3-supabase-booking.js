// Native V3 -> Supabase reservation creation. No direct table inserts or local writes.
import {setupBookingDraft} from './booking-draft.js?v=hold1';
import {supabase,loadSharedService} from './supabase-service-bridge.js?v=hold1';

function parisDateTime(date,time){
 const value=date+'T'+time+':00';
 const guess=Date.parse(value+'Z');
 if(!Number.isFinite(guess))throw Error('Date ou heure incorrecte');
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',timeZoneName:'shortOffset',hour:'2-digit'}).formatToParts(new Date(guess));
 const zone=parts.find(p=>p.type==='timeZoneName')?.value||'';
 const m=/GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(zone);
 if(!m)throw Error('Fuseau horaire de Paris indisponible');
 const offset=(m[1]==='+'?1:-1)*(Number(m[2])*60+Number(m[3]||0));
 const utc=new Date(guess-offset*60000);
 const actual=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(utc).replace(' ','T');
 if(actual!==date+'T'+time)throw Error('Horaire inexistant lors du changement d’heure');
 return utc.toISOString();
}
async function saveReceptionBooking(candidate,id){
 const {supabase}=await import('./supabase-service-bridge.js?v=hold1');
 const start=parisDateTime(candidate.date,candidate.time);
 const name=candidate.client.trim();
 const notes=[candidate.notes,candidate.allergies?'ALLERGIES À VÉRIFIER : '+candidate.allergies:''].filter(Boolean).join('\n');
 const {data,error}=await supabase.rpc('reception_booking_v3',{
  p_reservation:id,p_name:name,p_room:candidate.type==='hotel'&&/^\d{1,6}[A-Za-z]?$/.test(name)?name:null,
  p_guests:Number(candidate.guests),p_start:start,p_end:new Date(Date.parse(start)+candidate.duration*60000).toISOString(),p_notes:notes
 });
 if(error)throw error;
 const tables=TableStore.get().tables;
 candidate.tables=data.map(id=>tables.find(t=>t.id===id)?.number).filter(n=>n!=null);
}
window.RestoBookingDraft=setupBookingDraft(supabase,parisDateTime);
window.RestoBookingInterval=(date,time,duration)=>{
 const start=Date.parse(parisDateTime(date,time));
 return [start,start+duration*60000];
};
window.RestoCreateSharedBooking=candidate=>window.RestoBookingDraft.confirm(candidate);

export async function cancelSharedBooking(id){
 const {supabase,requireStaff}=await import('./supabase-service-bridge.js?v=hold1');
 await requireStaff();
 const {data,error}=await supabase.rpc('cancel_reservation_v3',{p_reservation_id:id});
 if(error)throw error;
 return data;
}
window.RestoCancelSharedBooking=cancelSharedBooking;

export async function deleteCancelledSharedBooking(id){
 const {supabase,requireStaff}=await import('./supabase-service-bridge.js?v=hold1');
 const {profile}=await requireStaff();
 if(profile.role!=='fb_admin')throw Error('Suppression réservée aux administrateurs');
 const {data,error}=await supabase.rpc('delete_cancelled_reservation_v3',{p_reservation_id:id});
 if(error)throw error;
 return data;
}
window.RestoDeleteCancelledSharedBooking=deleteCancelledSharedBooking;

export async function updateSharedBooking(candidate){
 if(window.RestoReception)return saveReceptionBooking(candidate,candidate.id);
 const {supabase,requireStaff,loadSharedService}=await import('./supabase-service-bridge.js?v=hold1');
 await requireStaff();
 const snapshot=await loadSharedService();
 const byNumber=new Map(snapshot.tables.filter(t=>t.active).map(t=>[Number(String(t.label).trim().replace(/^table\s*/i,'')),t.id]));
 const ids=candidate.tables.map(n=>{const id=byNumber.get(Number(n));if(!id)throw Error('Table '+n+' introuvable. Vérifiez les tables disponibles.');return id;});
 const start=parisDateTime(candidate.date,candidate.time);
 const end=new Date(Date.parse(start)+(Number(candidate.duration)||90)*60000).toISOString();
 const {data,error}=await supabase.rpc('update_reservation_v3',{p_reservation_id:candidate.id,p_guest_name:candidate.client,p_party_size:Number(candidate.guests),p_starts_at:start,p_ends_at:end,p_table_ids:ids,p_notes:candidate.notes||null});
 if(error)throw error;
 return data;
}
window.RestoUpdateSharedBooking=updateSharedBooking;

export async function updateRestaurantTableShared({id,label,seats,roomId}){
 const {supabase,requireStaff}=await import('./supabase-service-bridge.js?v=hold1');
 const {profile}=await requireStaff();
 if(profile.role!=='fb_admin')throw Error('Modification réservée aux administrateurs.');
 const {data,error}=await supabase.rpc('update_restaurant_table_v3',{
  p_table_id:id,p_label:label,p_seats:Number(seats),p_room_id:roomId
 });
 if(error)throw error;
 return data;
}
window.RestoUpdateRestaurantTable=updateRestaurantTableShared;

export async function createRestaurantTableShared({label,seats,roomId}){
 const {supabase,requireStaff}=await import('./supabase-service-bridge.js?v=hold1');
 const {profile}=await requireStaff();
 if(profile.role!=='fb_admin')throw Error('Action réservée aux administrateurs.');
 const {data,error}=await supabase.rpc('create_restaurant_table_v3',{p_label:label,p_seats:Number(seats),p_room_id:roomId});
 if(error)throw error;
 return data;
}
export async function setRestaurantTableActiveShared(id,active){
 const {supabase,requireStaff}=await import('./supabase-service-bridge.js?v=hold1');
 const {profile}=await requireStaff();
 if(profile.role!=='fb_admin')throw Error('Action réservée aux administrateurs.');
 const {data,error}=await supabase.rpc('set_restaurant_table_active_v3',{p_table_id:id,p_active:active});
 if(error)throw error;
 return data;
}
window.RestoCreateRestaurantTable=createRestaurantTableShared;
window.RestoSetRestaurantTableActive=setRestaurantTableActiveShared;

window.RestoChangeSharedStatus=async function(reservation,status){
 if(!window.RestoSupabaseReady)throw Error('Connexion en cours. Réessayez dans un instant.');
 const {supabase}=await import('./supabase-service-bridge.js?v=hold1');
 const {error}=await supabase.rpc('change_reservation_status_v3',{
  p_reservation_id:reservation.id,p_expected:reservation.status,p_status:status
 });
 if(error)throw error;
 await window.RestoRefreshSharedService();
};

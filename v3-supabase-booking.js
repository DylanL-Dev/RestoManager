import {canWrite} from './service-sync.js?v=20261108-tables-display';
// Native V3 -> Supabase reservation creation. No direct table inserts or local writes.
import {setupBookingDraft} from './booking-draft.js?v=20261109-optional-guest1';
import {encodeBookingDetails} from './reservation-details.js?v=20261108-tables-display';
import {supabase,loadSharedService} from './supabase-service-bridge.js?v=20261109-twins1';

function requireWrite(){
 if(navigator.onLine===false||!window.RestoSupabaseReady)throw window.RestoErrors?.business('Connexion interrompue. Votre saisie est conservée ; attendez la synchronisation avant d’enregistrer.')||Error('Connexion interrompue.');
 if(!canWrite(window.RestoServiceCapabilities))throw Object.assign(Error('Mise à jour requise.'),{code:'CAPABILITY_REQUIRED'});
}
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
async function saveReceptionBooking(candidate,id,{explicitTableChoice=false}={}){
 if(explicitTableChoice)throw Error('Seule l’équipe Restaurant peut choisir ou modifier une table.');
 requireWrite();
 const {supabase}=await import('./supabase-service-bridge.js?v=20261109-supabase119');
 const start=parisDateTime(candidate.date,candidate.time);
 const name=String(candidate.client||'').trim()||(candidate.type==='hotel'?'Chambre '+String(candidate.hotelRoom||'').trim():'Client extérieur');
 const notes=encodeBookingDetails(candidate);
 const args={
  p_reservation_id:id,p_expected_version:window.ReservationEdit.requireVersion(candidate.editVersion),
  p_guest_name:name,p_hotel_room:candidate.type==='hotel'?(candidate.hotelRoom?.trim()||null):null,
  p_party_size:Number(candidate.guests),p_starts_at:start,
  p_ends_at:new Date(Date.parse(start)+candidate.duration*60000).toISOString(),
  p_notes:notes
 };
 // Reception keeps automatic table assignment unless the user explicitly
 // selected another table during an edit. This endpoint validates the same
 // version, tenant, status, capacity and conflicts as the F&B editor.
 if(explicitTableChoice){
  const snapshot=await loadSharedService();
  const byNumber=new Map(snapshot.tables.filter(t=>t.active)
   .map(t=>[Number(String(t.label).trim().replace(/^table\s*/i,'')),t.id]));
  args.p_table_ids=candidate.tables.map(number=>{
   const tableId=byNumber.get(Number(number));
   if(!tableId)throw window.RestoErrors?.business('Table non disponible. Actualisez les propositions.')||Error('Table indisponible');
   return tableId;
  });
 }
 const {data,error}=await supabase.rpc(explicitTableChoice
  ?'reception_update_reservation_with_table_v1'
  :'reception_update_reservation_v4',args);
 if(error)throw editError(error);
 const tables=TableStore.get().tables;
 candidate.tables=data.tables.map(id=>tables.find(t=>t.id===id)?.number).filter(n=>n!=null);
 return data;
}
function editError(error){
 if(error.code==='PGRST202')return Object.assign(Error('Le service de modification n’est pas encore disponible. Contactez le responsable.'),{code:error.code});
 return error;
}
window.RestoBookingDraft=setupBookingDraft(supabase,parisDateTime);
window.RestoBookingInterval=(date,time,duration)=>{
 const start=Date.parse(parisDateTime(date,time));
 return [start,start+duration*60000];
};
window.RestoCreateSharedBooking=candidate=>{requireWrite();return window.RestoBookingDraft.confirm(candidate)};

export async function cancelSharedBooking(id){
 requireWrite();
 const {supabase,requireStaff}=await import('./supabase-service-bridge.js?v=20261109-supabase119');
 await requireStaff();
 const {data,error}=await supabase.rpc('cancel_reservation_v3',{p_reservation_id:id});
 if(error)throw error;
 return data;
}
window.RestoCancelSharedBooking=cancelSharedBooking;

export async function deleteCancelledSharedBooking(id){
 requireWrite();
 const {supabase,requireStaff}=await import('./supabase-service-bridge.js?v=20261109-supabase119');
 const {profile}=await requireStaff();
 if(profile.role!=='fb_admin')throw Error('Suppression réservée aux administrateurs');
 const {data,error}=await supabase.rpc('delete_cancelled_reservation_v3',{p_reservation_id:id});
 if(error)throw error;
 return data;
}
window.RestoDeleteCancelledSharedBooking=deleteCancelledSharedBooking;

export async function updateSharedBooking(candidate,{explicitTableChoice=false}={}){
 requireWrite();
 if(navigator.onLine===false||!window.RestoSupabaseReady)throw Error('Connexion interrompue. Votre saisie est conservée ; attendez la synchronisation avant d’enregistrer.');
 window.ReservationEdit.requireVersion(candidate.editVersion);
 if(window.RestoReception)return saveReceptionBooking(candidate,candidate.id,{explicitTableChoice:false});
 const {supabase,requireStaff,loadSharedService}=await import('./supabase-service-bridge.js?v=20261109-supabase119');
 await requireStaff();
 const snapshot=await loadSharedService();
 const byNumber=new Map(snapshot.tables.filter(t=>t.active).map(t=>[Number(String(t.label).trim().replace(/^table\s*/i,'')),t.id]));
 const ids=candidate.tables.map(n=>{const id=byNumber.get(Number(n));if(!id)throw Error('Table '+n+' introuvable. Vérifiez les tables disponibles.');return id;});
 const start=parisDateTime(candidate.date,candidate.time);
 const end=new Date(Date.parse(start)+(Number(candidate.duration)||90)*60000).toISOString();
 const {data,error}=await supabase.rpc('update_reservation_v4',{p_reservation_id:candidate.id,
  p_expected_version:candidate.editVersion,p_guest_name:candidate.client,
  p_hotel_room:candidate.type==='hotel'?(candidate.hotelRoom?.trim()||null):null,
  p_party_size:Number(candidate.guests),p_starts_at:start,p_ends_at:end,p_table_ids:ids,p_notes:encodeBookingDetails(candidate)||null});
 if(error)throw editError(error);
 return data;
}
window.RestoUpdateSharedBooking=updateSharedBooking;

export async function updateRestaurantTableShared({id,label,seats,roomId}){
 requireWrite();
 const {supabase,requireStaff}=await import('./supabase-service-bridge.js?v=20261109-supabase119');
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
 requireWrite();
 const {supabase,requireStaff}=await import('./supabase-service-bridge.js?v=20261109-supabase119');
 const {profile}=await requireStaff();
 if(profile.role!=='fb_admin')throw Error('Action réservée aux administrateurs.');
 const {data,error}=await supabase.rpc('create_restaurant_table_v3',{p_label:label,p_seats:Number(seats),p_room_id:roomId});
 if(error)throw error;
 return data;
}
export async function setRestaurantTableActiveShared(id,active){
 requireWrite();
 const {supabase,requireStaff}=await import('./supabase-service-bridge.js?v=20261109-supabase119');
 const {profile}=await requireStaff();
 if(profile.role!=='fb_admin')throw Error('Action réservée aux administrateurs.');
 const {data,error}=await supabase.rpc('set_restaurant_table_active_v3',{p_table_id:id,p_active:active});
 if(error)throw error;
 return data;
}
window.RestoCreateRestaurantTable=createRestaurantTableShared;
window.RestoSetRestaurantTableActive=setRestaurantTableActiveShared;

window.RestoApplySmartPlacement=async function(reservationId,plan){
 requireWrite();
 if(!window.RestoSupabaseReady||window.RestoReception)throw Error('Compte Restaurant connecté requis.');
 if(!plan?.ok||!plan.changes?.length)throw Error('Aucune réorganisation à confirmer.');
 const {supabase,requireStaff}=await import('./supabase-service-bridge.js?v=20261109-supabase119');
 const {profile}=await requireStaff();
 if(profile.role!=='fb_admin')throw Error('Action réservée à l’équipe du restaurant.');
 const tableIds=window.RestoSmartPlacementTableIds;
 if(!(tableIds instanceof Map))throw Error('Plan de salle non synchronisé.');
 const p_changes=plan.changes.map(item=>{
  if(item.from.length!==1||item.to.length!==1)throw Error('Les fusions ne sont pas encore prises en charge.');
  const from_table=tableIds.get(Number(item.from[0])),to_table=tableIds.get(Number(item.to[0]));
  if(!from_table||!to_table)throw Error('Une table est introuvable. Actualisez le plan de salle.');
  return {id:item.id,from_table,to_table,expected_status:item.status};
 });
 const {data,error}=await supabase.rpc('apply_smart_placement_v3',{
  p_target_reservation_id:reservationId,p_changes
 });
 if(error)throw error;
 await window.RestoRefreshSharedService?.();
 return data;
};
window.RestoChangeSharedStatus=async function(reservation,status){
 requireWrite();
 if(!window.RestoSupabaseReady)throw Error('Connexion en cours. Réessayez dans un instant.');
 const {supabase}=await import('./supabase-service-bridge.js?v=20261109-supabase119');
 const {error}=await supabase.rpc('change_reservation_status_v3',{
  p_reservation_id:reservation.id,p_expected:reservation.status,p_status:status
 });
 if(error)throw error;
 await window.RestoRefreshSharedService();
};

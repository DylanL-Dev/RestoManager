// Reservation creation uses only secured PostgreSQL RPCs.
// Never insert directly into reservations or reservation_tables.
import {supabase,requireStaff} from './supabase-service-bridge.js';
const ownerToken=crypto.randomUUID();
export async function acquireHold({tableId,startsAt,endsAt}){
 await requireStaff();
 const {data,error}=await supabase.rpc('acquire_table_hold_v2',{
  p_table_id:tableId,p_starts_at:startsAt,p_ends_at:endsAt,p_owner_token:ownerToken
 });
 if(error)throw error;
 return data;
}
export async function releaseHold(holdId){
 await requireStaff();
 const {data,error}=await supabase.rpc('release_table_hold_v2',{p_hold_id:holdId,p_owner_token:ownerToken});
 if(error)throw error;
 return data;
}
export async function confirmReservation({guestName,hotelRoom,partySize,startsAt,endsAt,tableIds,notes}){
 await requireStaff();
 if(!Array.isArray(tableIds)||tableIds.length===0)throw new Error('Sélectionnez une table');
 const {data,error}=await supabase.rpc('confirm_reservation_v3',{
  p_guest_name:guestName,p_hotel_room:hotelRoom||null,
  p_party_size:partySize,p_starts_at:startsAt,p_ends_at:endsAt,
  p_table_ids:tableIds,p_owner_token:ownerToken,p_notes:notes||null
 });
 if(error)throw error;
 return data;
}

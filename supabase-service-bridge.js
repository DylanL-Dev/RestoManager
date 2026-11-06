// RestoManager V3 — read-only Supabase bridge, staged for integration.
// Import only on the authenticated development preview; never on published V3.
// No localStorage fallback and no direct reservation writes.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm';
export const supabase=createClient(
 'https://tnsrkargogckgtsxipwd.supabase.co',
 'sb_publishable_7OHPvnA-iJWZAvVsg6tNwg_6YwtX7i7',
 {auth:{persistSession:true,autoRefreshToken:true}}
);
const tables=['reservations','reservation_tables','restaurant_rooms','restaurant_tables','table_holds','table_fusion_links','restaurant_hours'];
export async function requireStaff(){
 const {data:{user},error}=await supabase.auth.getUser();
 if(error||!user)throw new Error('Connexion requise');
 const {data:profile,error:profileError}=await supabase.from('staff_profiles')
  .select('role,active,display_name').eq('user_id',user.id).single();
 if(profileError||!profile?.active||!['reception','fb_admin'].includes(profile.role))
  throw new Error('Compte non autorisé');
 return {user,profile};
}
export async function loadSharedService(){
 await requireStaff();
 const [reservations,assignments,rooms,restaurantTables,holds,fusionLinks,hours]=await Promise.all([
  supabase.from('reservations').select('*').order('starts_at'),
  supabase.from('reservation_tables').select('*'),
  supabase.from('restaurant_rooms').select('*').order('sort_order'),
  supabase.from('restaurant_tables').select('*'),
  supabase.from('table_holds').select('id,table_id,held_by,starts_at,ends_at,expires_at,created_at'),
  supabase.from('table_fusion_links').select('table_a,table_b'),
  supabase.from('restaurant_hours').select('*').eq('id',1).single()
 ]);
 const results=[reservations,assignments,rooms,restaurantTables,holds,fusionLinks,hours];
 for(const result of results)if(result.error)throw result.error;
 return {hours:hours.data,reservations:reservations.data,assignments:assignments.data,rooms:rooms.data,tables:restaurantTables.data,holds:holds.data,fusionLinks:fusionLinks.data};
}
// Postgres Changes events can arrive out of order. Reload the full authorized
// snapshot after each event instead of applying unsafe partial state mutations.
export async function subscribeSharedService(onSnapshot,onError=console.error){
 await requireStaff();
 let stopped=false,busy=false,dirty=false;
 let connectionState='connecting';
 async function refresh(){
  if(stopped)return;
  if(busy){dirty=true;return;}
  busy=true;
  try{
   do{
    dirty=false;
    const snapshot=await loadSharedService();
    if(!stopped)onSnapshot(snapshot);
   }while(dirty&&!stopped);
  }catch(error){if(!stopped)onError(error);}
  finally{busy=false;}
 }
 const channel=supabase.channel('restomanager-v3-shared-service');
 for(const table of tables)channel.on('postgres_changes',{event:'*',schema:'public',table},refresh);
 channel.subscribe(status=>{
  if(stopped)return;
  if(status==='SUBSCRIBED'){
   connectionState='connected';
   void refresh();
  }
  if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
   connectionState='disconnected';
   onError(new Error('Synchronisation temps réel interrompue ('+status+'). Actualisez après reconnexion.'));
  }
 });
 // On browser resume, refresh even when the websocket silently missed changes.
 const resume=()=>{if(!stopped&&document.visibilityState==='visible')void refresh();};
 document.addEventListener('visibilitychange',resume);
 return ()=>{stopped=true;document.removeEventListener('visibilitychange',resume);void supabase.removeChannel(channel);};
}

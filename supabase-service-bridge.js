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
let snapshotSequence=0;
export async function loadSharedService(){
 const sequence=++snapshotSequence;
 await requireStaff();
 const [reservations,assignments,rooms,restaurantTables,holds,fusionLinks,hours]=await Promise.all([
  supabase.from('reservations').select('*').order('starts_at'),
  supabase.from('reservation_tables').select('*'),
  supabase.from('restaurant_rooms').select('*').order('sort_order'),
  supabase.from('restaurant_tables').select('*'),
  supabase.from('table_holds').select('id,table_id,draft_role,held_by,starts_at,ends_at,expires_at,created_at'),
  supabase.from('table_fusion_links').select('table_a,table_b'),
  supabase.from('restaurant_hours').select('*').eq('id',1).single()
 ]);
 const results=[reservations,assignments,rooms,restaurantTables,holds,fusionLinks,hours];
 for(const result of results)if(result.error)throw result.error;
 return {syncSequence:sequence,hours:hours.data,reservations:reservations.data,assignments:assignments.data,rooms:rooms.data,tables:restaurantTables.data,holds:holds.data,fusionLinks:fusionLinks.data};
}
// Postgres Changes events can arrive out of order. Reload the full authorized
// snapshot after each event instead of applying unsafe partial state mutations.
// Reconnect when a phone resumes after sleeping, and never apply snapshots from
// a disconnected/replaced realtime channel. No local reservation writes.
export async function subscribeSharedService(onSnapshot,onError=console.error,onConnection=()=>{}){
 await requireStaff();
 let stopped=false,busy=false,dirty=false,generation=0,connectionState='connecting';
 let channel=null;
 async function refresh(){
  if(stopped||!navigator.onLine||connectionState!=='connected')return;
  if(busy){dirty=true;return}
  busy=true;
  const requestGeneration=generation;
  try{
   do{
    dirty=false;
    const snapshot=await loadSharedService();
    if(!stopped&&navigator.onLine&&connectionState==='connected'&&requestGeneration===generation)onSnapshot(snapshot);
   }while(dirty&&!stopped&&requestGeneration===generation);
  }catch(error){if(!stopped&&requestGeneration===generation)onError(error)}
  finally{busy=false}
 }
 function startChannel(){
  if(stopped||!navigator.onLine)return;
  const old=channel;
  generation++;
  connectionState='connecting';
  onConnection(false);
  if(old)void supabase.removeChannel(old);
  const currentGeneration=generation;
  channel=supabase.channel('restomanager-v3-shared-service-'+currentGeneration);
  for(const table of tables)channel.on('postgres_changes',{event:'*',schema:'public',table},()=>void refresh());
  channel.subscribe(status=>{
   if(stopped||currentGeneration!==generation)return;
   if(status==='SUBSCRIBED'){
    connectionState='connected';onConnection(true);void refresh();
   }else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){
    connectionState='disconnected';onConnection(false);
    onError(Object.assign(new Error('Connexion en direct interrompue'),{code:status}));
   }
  });
 }
 function resume(){
  if(stopped||!navigator.onLine)return;
  if(connectionState!=='connected')startChannel();
  else void refresh();
 }
 function offline(){
  if(stopped)return;
  connectionState='disconnected';generation++;onConnection(false);
  if(channel){const old=channel;channel=null;void supabase.removeChannel(old)}
 }
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')resume();
 });
 window.addEventListener('online',resume);
 window.addEventListener('offline',offline);
 const timer=setInterval(()=>{
  if(!stopped&&navigator.onLine&&connectionState!=='connected')startChannel();
 },15000);
 startChannel();
 return ()=>{
  stopped=true;generation++;clearInterval(timer);
  window.removeEventListener('online',resume);window.removeEventListener('offline',offline);
  if(channel)void supabase.removeChannel(channel);
 };
}

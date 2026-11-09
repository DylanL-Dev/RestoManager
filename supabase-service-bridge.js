// RestoManager V3 — read-only Supabase bridge, staged for integration.
// Import only on the authenticated development preview; never on published V3.
// No localStorage fallback and no direct reservation writes.
import {readRevisionSnapshot} from './service-sync.js?v=20261108-tables-display';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm';
export const supabase=createClient(
 'https://tnsrkargogckgtsxipwd.supabase.co',
 'sb_publishable_7OHPvnA-iJWZAvVsg6tNwg_6YwtX7i7',
 {auth:{persistSession:true,autoRefreshToken:true,...(location.hostname.endsWith('.github.io')?{storageKey:'restomanager-ghpages-auth-v2'}:{})}}
);
const tables=['reservations','reservation_tables','restaurant_rooms','restaurant_tables','table_holds','table_fusion_links','restaurant_hours'];
export async function requireStaff(){
 const {data:{user},error}=await supabase.auth.getUser();
 if(error||!user)throw new Error('Connexion requise');
 const {data:profile,error:profileError}=await supabase.from('staff_profiles')
  .select('role,active,display_name,restaurant_id').eq('user_id',user.id).single();
 if(profileError||!profile?.active||!['reception','fb_admin'].includes(profile.role))
  throw new Error('Compte non autorisé');
 return {user,profile};
}
let snapshotSequence=0;
export async function loadSharedService(){
 const sequence=++snapshotSequence;
 await requireStaff();
 const snapshot=await readRevisionSnapshot(supabase);
 return {...snapshot,syncSequence:sequence};
}
// Postgres Changes events can arrive out of order. Reload the full authorized
// snapshot after each event instead of applying unsafe partial state mutations.
// Reconnect when a phone resumes after sleeping, and never apply snapshots from
// a disconnected/replaced realtime channel. No local reservation writes.
export async function subscribeSharedService(onSnapshot,onError=console.error,onConnection=()=>{}){
 await requireStaff();
 let stopped=false,busy=false,dirty=false,generation=0,connectionState='connecting';
 let channel=null,retryTimer=null,retryAttempt=0,snapshotFailed=false;
 const retryDelays=[1000,2000,4000];
 function clearRetry(){if(retryTimer!==null){clearTimeout(retryTimer);retryTimer=null}}
 function queueRetry(requestGeneration){
  if(retryTimer!==null||retryAttempt>=retryDelays.length)return;
  const delay=retryDelays[retryAttempt++];
  retryTimer=setTimeout(()=>{
   retryTimer=null;
   if(!stopped&&navigator.onLine&&connectionState==='connected'&&requestGeneration===generation)void refresh();
  },delay);
 }
 async function refresh(){
  if(stopped||!navigator.onLine||connectionState!=='connected')return;
  if(busy||retryTimer!==null){dirty=true;return}
  busy=true;
  const requestGeneration=generation;
  try{
   do{
    dirty=false;
    const snapshot=await loadSharedService();
    if(!stopped&&navigator.onLine&&connectionState==='connected'&&requestGeneration===generation){
     onSnapshot(snapshot);snapshotFailed=false;retryAttempt=0;clearRetry();
    }
   }while(dirty&&!stopped&&requestGeneration===generation);
  }catch(error){
   if(!stopped&&requestGeneration===generation){
    onError(error);dirty=false;
    snapshotFailed=!['42501','PGRST301','SYNC_CONTRACT'].includes(String(error?.code||''));
    if(snapshotFailed)queueRetry(requestGeneration);
   }
  }
  finally{busy=false;if(dirty&&!snapshotFailed&&!stopped&&navigator.onLine&&connectionState==='connected')void refresh()}
 }
 function startChannel(){
  if(stopped||!navigator.onLine)return;
  const old=channel;
  clearRetry();retryAttempt=0;snapshotFailed=false;
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
    connectionState='disconnected';clearRetry();onConnection(false);
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
  connectionState='disconnected';generation++;clearRetry();snapshotFailed=false;onConnection(false);
  if(channel){const old=channel;channel=null;void supabase.removeChannel(old)}
 }
 const visible=()=>{if(document.visibilityState==='visible')resume()};
 document.addEventListener('visibilitychange',visible);
 window.addEventListener('online',resume);
 window.addEventListener('offline',offline);
 const timer=setInterval(()=>{
  if(stopped||!navigator.onLine)return;
  if(connectionState!=='connected')startChannel();
  else if(snapshotFailed&&!busy&&retryTimer===null){retryAttempt=0;void refresh()}
 },15000);
 startChannel();
 return ()=>{
  stopped=true;generation++;clearRetry();clearInterval(timer);
  window.removeEventListener('online',resume);window.removeEventListener('offline',offline);
  document.removeEventListener('visibilitychange',visible);
  if(channel)void supabase.removeChannel(channel);
 };
}

'use strict';
/* Existing Restaurant-only alert stores. RLS remains authoritative; all operations
   additionally filter restaurant_id and validate the authenticated staff profile. */
(function(){
 const emit=()=>window.dispatchEvent(new Event('restomanager:fb-alerts'));
 let loading=false,again=false,lastFetch=0,activeScope='';
 window.RestoFbReservationAlerts=[];window.RestoFbChangeAlerts=[];
 window.RestoFbAlertsStatus='pending';window.RestoFbAlertsError=null;
 const context=()=>window.RestoNotificationContext;
 const scope=()=>window.RestoNotificationModel?.scope(context());
 const permitted=()=>context()?.role==='fb_admin'&&window.RestoReception===false&&window.RestoSharedDataLoaded;
 function clear(){window.RestoFbReservationAlerts=[];window.RestoFbChangeAlerts=[];window.RestoFbAlertsError=null;window.RestoFbAlertsStatus='pending';lastFetch=0}
 async function client(){
  const bridge=await import('./supabase-service-bridge.js?v=20261108-tables-display');
  const {user,profile}=await bridge.requireStaff(),ctx=context();
  if(!ctx||user.id!==ctx.userId||profile.role!=='fb_admin'||profile.restaurant_id!==ctx.restaurantId)throw Error('Accès réservé au Restaurant de cet établissement.');
  return bridge.supabase;
 }
 async function refresh(force=false){
  if(!permitted())return;
  const key=scope();if(!key)return;
  if(key!==activeScope){clear();activeScope=key}
  if(!force&&Date.now()-lastFetch<2000)return;
  if(loading){again=true;return}loading=true;
  try{
   const supabase=await client(),venue=context().restaurantId;
   const [bookings,changes]=await Promise.all([
    supabase.from('fb_reservation_alerts').select('id,reservation_id,guest_name,hotel_room,party_size,starts_at,created_at,read_at').eq('restaurant_id',venue).order('created_at',{ascending:false}).limit(80),
    supabase.from('reservation_change_alerts').select('id,reservation_id,event_type,guest_name,hotel_room,party_size,starts_at,previous_guest_name,previous_hotel_room,previous_party_size,previous_starts_at,changed_fields,created_at,read_at').eq('restaurant_id',venue).order('created_at',{ascending:false}).limit(100)
   ]);
   if(key!==scope()||!permitted())return;
   if(bookings.error)throw bookings.error;if(changes.error)throw changes.error;
   window.RestoFbReservationAlerts=bookings.data||[];window.RestoFbChangeAlerts=changes.data||[];
   window.RestoFbAlertsError=null;window.RestoFbAlertsStatus='ready';lastFetch=Date.now();emit();
  }catch(error){
   if(key===scope()){window.RestoErrors?.diagnostic('notification-sync',error);window.RestoFbAlertsError='Les notifications de la Réception ne sont pas synchronisées.';window.RestoFbAlertsStatus='error';emit()}
  }finally{loading=false;if(again){again=false;void refresh(true)}}
 }
 async function mark(refs){
  if(!permitted())throw Error('Accès réservé au Restaurant.');
  const key=scope(),supabase=await client(),venue=context().restaurantId;
  for(const source of ['booking','change']){
   const ids=[...new Set(refs.filter(ref=>ref.source===source).map(ref=>String(ref.id)))];if(!ids.length)continue;
   const table=source==='booking'?'fb_reservation_alerts':'reservation_change_alerts';
   const {error}=await supabase.from(table).update({read_at:new Date().toISOString()}).eq('restaurant_id',venue).in('id',ids).is('read_at',null);
   if(error)throw error;
   if(key!==scope())throw Error('Le compte connecté a changé.');
   const list=source==='booking'?window.RestoFbReservationAlerts:window.RestoFbChangeAlerts;
   for(const a of list)if(ids.includes(String(a.id)))a.read_at=new Date().toISOString();
   emit();
  }
  await refresh(true);
 }
 window.RestoMarkFbNotificationsRead=mark;
 window.RestoMarkFbAlertRead=id=>mark([{source:'booking',id}]);
 window.RestoMarkFbChangeRead=id=>mark([{source:'change',id}]);
 window.RestoRefreshFbAlerts=()=>refresh(true);
 window.addEventListener('restomanager:notification-context',()=>{if(activeScope!==scope()){clear();activeScope=scope()||'';emit()}void refresh(true)});
 window.addEventListener('restomanager:supabase-snapshot',()=>void refresh());
 window.addEventListener('online',()=>void refresh(true));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh(true)});
 setInterval(()=>{if(!document.hidden)void refresh()},30000);void refresh(true);
})();

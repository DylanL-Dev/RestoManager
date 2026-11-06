'use strict';
/* Integration only. Server RLS keeps reception staff out of restaurant alerts. */
(async function(){
  const onEvent=()=>window.dispatchEvent(new Event('restomanager:fb-alerts'));
  let loading=false,again=false,lastFetch=0;
  window.RestoFbReservationAlerts=[];
  window.RestoFbChangeAlerts=[];
  async function refresh(force=false){
    if(window.RestoReception!==false || !window.RestoSupabaseReady)return;
    if(!force&&Date.now()-lastFetch<2000)return;
    if(loading){again=true;return;}
    loading=true;
    try{
      const {supabase,requireStaff}=await import('./supabase-service-bridge.js?v=20261106-reconnect2');
      const {profile}=await requireStaff();
      if(profile.role!=='fb_admin')return;
      const [bookings,changes]=await Promise.all([
       supabase.from('fb_reservation_alerts').select('id,reservation_id,guest_name,hotel_room,party_size,starts_at,created_at,read_at').order('created_at',{ascending:false}).limit(80),
       supabase.from('reservation_change_alerts').select('id,reservation_id,event_type,guest_name,hotel_room,party_size,starts_at,previous_guest_name,previous_hotel_room,previous_party_size,previous_starts_at,changed_fields,created_at,read_at').order('created_at',{ascending:false}).limit(100)
      ]);
      if(bookings.error)throw bookings.error;
      if(changes.error)throw changes.error;
      window.RestoFbReservationAlerts=bookings.data||[];
      window.RestoFbChangeAlerts=changes.data||[];
      lastFetch=Date.now();onEvent();
    }catch(err){console.warn('Notifications restaurant non chargées',err);window.RestoFbAlertsError=err.message;onEvent()}
    finally{loading=false;if(again){again=false;void refresh(true)}}
  }
  window.RestoMarkFbChangeRead=async id=>{
    if(window.RestoReception!==false)throw Error('Accès réservé au Restaurant.');
    const {supabase,requireStaff}=await import('./supabase-service-bridge.js?v=20261106-reconnect2');
    const {profile}=await requireStaff();
    if(profile.role!=='fb_admin')throw Error('Accès refusé.');
    const {error}=await supabase.from('reservation_change_alerts')
      .update({read_at:new Date().toISOString()}).eq('id',id).is('read_at',null);
    if(error)throw error;
    await refresh(true);
  };
  window.RestoMarkFbAlertRead=async id=>{
    if(window.RestoReception!==false)throw Error('Accès réservé au Restaurant.');
    const {supabase,requireStaff}=await import('./supabase-service-bridge.js?v=20261106-reconnect2');
    const {profile}=await requireStaff();
    if(profile.role!=='fb_admin')throw Error('Accès refusé.');
    const {data,error}=await supabase.from('fb_reservation_alerts').update({read_at:new Date().toISOString()})
      .eq('id',id).is('read_at',null).select('id');
    if(error)throw error;
    await refresh(true);
    return data;
  };
  window.addEventListener('restomanager:supabase-snapshot',()=>void refresh());
  window.addEventListener('online',()=>void refresh(true));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh(true)});
  setInterval(()=>void refresh(),30000);
  void refresh(true);
})();

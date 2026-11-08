'use strict';
/* Supabase is authoritative. Legacy browser-only closure remains disabled in integration. */
(async function(){
 if(!location.pathname.endsWith('/v3-connected.html'))return;
 const root=document.getElementById('serviceClosure');
 if(!root)return;
 const status=document.getElementById('closureStatus');
 const button=document.getElementById('closureManual');
 const archive=document.getElementById('closureArchive');
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 function clock(){
  const parts=Object.fromEntries(fmt.formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return {date:parts.year+'-'+parts.month+'-'+parts.day,minutes:Number(parts.hour)*60+Number(parts.minute)};
 }
 function previous(date){
  const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);
  return d.toISOString().slice(0,10);
 }
 const container=document.createElement('div');container.className='sharedClosureControls';
 const label=document.createElement('label');label.textContent='Date du service à clôturer';
 const date=document.createElement('input');date.type='date';
 const now=clock();date.value=now.minutes>=1410?now.date:previous(now.date);
 date.max=now.date;label.append(date);root.insertBefore(container,status);
 container.append(label);
 button.disabled=false;
 let loading=false,history=[],lastAuto='',closedDates=new Set(),lastError='';
 function pendingCount(value){
  return (window.RestoSharedReservations||[]).filter(r=>r.date===value&&!['completed','released','cancelled','no_show'].includes(r.status)).length;
 }
 function eligible(day){
  const at=clock();return day<at.date||(day===at.date&&at.minutes>=1410);
 }
 function display(){
  if(window.RestoReception===true){root.hidden=true;return}
  root.hidden=false;
  const selected=date.value;
  const prior=history.find(x=>x.service_date===selected);
  const pending=pendingCount(selected);
  if(!window.RestoSupabaseReady){
   status.textContent='Connexion indisponible : aucune clôture ne peut être enregistrée.';
  }else if(lastError){
   status.textContent=lastError;
  }else if(prior){
   status.textContent='Service du '+selected+' clôturé et archivé dans Supabase ('+(prior.close_mode==='automatic'?'automatiquement':'manuellement')+').';
  }else if(!eligible(selected)){
   status.textContent='Clôture possible à partir de 23 h 30, heure de Paris.';
  }else if(pending){
   status.textContent=pending+' réservation(s) encore non finalisée(s). Terminez ou annulez leur suivi avant clôture.';
  }else{
   status.textContent='Service du '+selected+' prêt à clôturer dans Supabase.';
  }
  button.disabled=loading||!window.RestoSupabaseReady||!!prior||!eligible(selected)||pending>0;
  archive.replaceChildren();
  for(const entry of history.slice(0,35)){
   const p=document.createElement('p');
   p.textContent=entry.service_date+' · '+entry.served_covers+' couverts · '+entry.served_groups+' installations · '+(entry.close_mode==='automatic'?'automatique':'manuel');
   archive.append(p);
  }
  if(!history.length)archive.textContent='Aucune clôture partagée enregistrée.';
 }
 async function getDb(){
  const {supabase,requireStaff}=await import('./supabase-service-bridge.js?v=20261107-mission3');
  const {profile}=await requireStaff();
  if(profile.role!=='fb_admin')throw Error('Action réservée au Restaurant.');
  return supabase;
 }
 async function refresh(){
  if(!window.RestoSupabaseReady||window.RestoReception!==false){display();return}
  try{
   const db=await getDb();
   const {data,error}=await db.from('service_closures').select('service_date,close_mode,closed_at,served_covers,served_groups,walkin_covers,hotel_covers,no_show_groups,cancelled_groups').order('service_date',{ascending:false}).limit(60);
   if(error)throw error;
   history=data||[];closedDates=new Set(history.map(x=>x.service_date));lastError='';
  }catch(error){lastError='Archive partagée non accessible : '+error.message;display();return}
  display();
 }
 async function close(day,mode){
  if(loading||!window.RestoSupabaseReady||!eligible(day)||closedDates.has(day)||pendingCount(day)>0)return;
  loading=true;display();
  try{
   const db=await getDb();
   const {error}=await db.rpc('close_service_v3',{p_date:day,p_mode:mode});
   if(error)throw error;
   await refresh();
  }catch(error){lastError='Clôture refusée par Supabase : '+error.message}
  finally{loading=false;display()}
 }
 button.addEventListener('click',async()=>{
  const day=date.value;
  if(!window.RestoSupabaseReady||!eligible(day)||pendingCount(day)>0||closedDates.has(day))return;
  const confirmed=await window.RestoDialog.confirm('Clôturer et archiver le service du '+day+' dans Supabase ?', {title:'Clôture du service',acceptLabel:'Clôturer'});
  if(confirmed)await close(day,'manual');
 });
 date.addEventListener('change',display);
 window.addEventListener('restomanager:supabase-snapshot',()=>{void refresh()});
 window.addEventListener('online',()=>void refresh());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh()});
 // Automatic closeout is best-effort when a Restaurant device is open.
 // A server scheduler is required for truly unattended closeouts.
 async function tick(){
  const at=clock();
  if(!window.RestoSupabaseReady||window.RestoReception!==false){display();return}
  if(at.minutes>=1410&&lastAuto!==at.date&&!closedDates.has(at.date)&&!pendingCount(at.date)){
   lastAuto=at.date;
   await close(at.date,'automatic');
  }else display();
 }
 setInterval(()=>void tick(),60000);
 setInterval(()=>void refresh(),30000);
 await refresh();
 void tick();
})();

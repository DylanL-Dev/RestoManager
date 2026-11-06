import {supabase,requireStaff,subscribeSharedService,loadSharedService} from './supabase-service-bridge.js?v=hold1';
const style=document.getElementById('integrationGate');
const banner=document.createElement('section');banner.id='integrationBanner';
const label=document.createElement('span');label.textContent='Connexion en cours…';
const logout=document.createElement('button');logout.type='button';logout.textContent='Déconnexion';
logout.addEventListener('click',async()=>{
 logout.disabled=true;
 try{
  const {error}=await supabase.auth.signOut({scope:'local'});
  if(error)throw error;
  location.replace('login.html');
 }catch(error){
  logout.disabled=false;
  label.textContent='Déconnexion impossible. Vérifiez le réseau et réessayez.';
 }
});
banner.append(label,logout);
try{
 const {profile}=await requireStaff();
 window.RestoReception=profile.role==='reception';
 document.getElementById('teamSpace').textContent=window.RestoReception?'Espace Réception':'Espace Restaurant';
 const hourInParis=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',hourCycle:'h23'});
 function greet(){
  const hour=Number(hourInParis.formatToParts(new Date()).find(part=>part.type==='hour').value);
  const greeting=hour>=18||hour<5?'Bonsoir':'Bonjour';
  document.getElementById('teamGreeting').textContent=greeting+' l’équipe '+(window.RestoReception?'de réception':'du restaurant')+' !';
 }
 greet();
 setInterval(greet,60000);
 if(window.RestoReception){
  document.documentElement.classList.add('reception');
  document.querySelector('#editTable').required=false;
  const text=document.createElement('p');
  text.textContent='RestoManager attribue une table disponible à l’enregistrement.';
  document.querySelector('#bookingTable').closest('label').after(text);
  document.querySelector('.managementIntro').textContent='Gestion · Réception';
  if(location.hash==='#passages')window.RestoScreens.show('tables');
 }
 window.RestoSharedReservations=[];
 window.RestoSupabaseReady=false;
 const management=document.querySelector('[data-screen="administration"]')||document.getElementById('administration');
 if(!management)throw new Error('Espace Gestion introuvable');
 const network=document.createElement('details');network.className='managementGroup';network.id='manageNetwork';
 const summary=document.createElement('summary');summary.className='managementGroupHead';summary.innerHTML='<span class="managementGroupIcon" aria-hidden="true"><i data-lucide="wifi"></i></span><span class="managementGroupWords"><strong>Réseau et synchronisation</strong><small>Connexion, compte et données partagées</small></span><span class="managementChevron" aria-hidden="true"><i data-lucide="chevron-down"></i></span>';
 const content=document.createElement('div');content.className='managementGroupBody';
 const description=document.createElement('p');description.setAttribute('role','status');description.textContent='Connexion au service en cours…';
 const lastSync=document.createElement('p');lastSync.className='muted';lastSync.textContent='Dernière synchronisation : en attente';content.append(description,banner,lastSync);network.append(summary,content);management.append(network);
 const badge=document.getElementById('syncBadge');
 badge.addEventListener('click',()=>{
  window.RestoScreens.show('administration');
  network.open=true;
  summary.focus();
  network.scrollIntoView({block:'center'});
 });
 if(window.lucide?.createIcons)window.lucide.createIcons();
 style.textContent=style.textContent.replace('body{visibility:hidden}','');
 label.textContent='Compte connecté · '+(profile.display_name||profile.role)+' · Lecture seule des données partagées';
 // Preserve all original navigation and view rendering. Prevent mutations on the
 // legacy localStorage-backed UI until they are replaced by server-side RPC calls.
 const allowedForms=window.RestoReception?['bookingForm','editForm']:['bookingForm','editForm','tableAdminForm','walkinForm','restaurantShiftForm','fusionForm'];
 const forbidden=e=>{
  const target=e.target;
  const form=target.closest?.('form');
  if(e.type==='submit' && form && (!allowedForms.includes(form.id)||!window.RestoSupabaseReady)){e.preventDefault();e.stopImmediatePropagation();const message=form.id==='bookingForm'?'Connexion en cours. Patientez avant d’enregistrer.':'Cette fonction de gestion est temporairement indisponible.';const feedback=document.getElementById(form.id==='bookingForm'?'bookingFeedback':form.id==='tableAdminForm'?'tableAdminFeedback':form.id==='fusionForm'?'fusionMessage':'reservationMessage');if(feedback)feedback.textContent=message;label.textContent=message;return;}
  if(e.type==='click'){
   const btn=target.closest?.('button');
   if(!btn||btn===logout)return;
   const id=btn.id||'';
   if(['tableAdminSubmit','fusionSubmit'].includes(id)&&!window.RestoReception&&window.RestoSupabaseReady)return;
   // Let view navigation, date selection, search and tabs work; block mutation buttons.
   if(/(?:save|submit|delete|remove|release|cancelReservation|confirmReservation|install|arrive|seated|noShow|complete|closure)/i.test(id)){
    e.preventDefault();e.stopImmediatePropagation();label.textContent='Modification indisponible.';const feedback=document.getElementById('bookingFeedback');if(feedback)feedback.textContent='Cette action est temporairement indisponible.';
   }
  }
 };
 // Native HTML validation can prevent submit events entirely (e.g. an empty table select).
 // Explain the blocked action directly beside the reservation form.
 const bookingForm=document.getElementById('bookingForm');
 const bookingButton=bookingForm?.querySelector('button[type="submit"]');
 bookingButton?.addEventListener('click',()=>{
  const feedback=document.getElementById('bookingFeedback');
  if(!feedback)return;
  if(!window.RestoSupabaseReady){feedback.textContent='Synchronisation en cours. Vérifiez Réseau et synchronisation dans Gestion.';return;}
  const invalid=[...bookingForm.elements].find(field=>field.willValidate&&!field.checkValidity());
  if(invalid){feedback.textContent=invalid.id==='bookingTable'?'Aucune table disponible sélectionnée : impossible de créer la réservation.':'Champ obligatoire ou invalide : '+(invalid.closest('label')?.textContent?.trim()||invalid.name||invalid.id);return;}
  feedback.textContent='Vérification et enregistrement de la réservation…';
 });
 document.addEventListener('submit',forbidden,true);
 document.addEventListener('click',forbidden,true);
 // The native reservation list now consumes the shared snapshot directly.
 // No duplicate prototype panel or independent local reservation list.
 window.RestoSaveSharedHours=async(shifts,duration)=>{
  if(profile.role!=='fb_admin')throw Error('La modification des horaires est réservée au responsable.');
  const values={duration};
  for(const key of ['lunch','dinner']){
   for(const field of ['enabled','start','end'])values[key+'_'+field]=shifts[key][field];
  }
  const {error}=await supabase.from('restaurant_hours').update(values).eq('id',1).select('id').single();
  if(error)throw Error('Impossible d’enregistrer les horaires. Vérifiez votre connexion et réessayez.');
  await window.RestoRefreshSharedService();
 };
 const idsFor=numbers=>numbers.map(n=>{
  const t=TableStore.get().tables.find(t=>t.number===n);
  if(!t)throw Error('Table introuvable.');
  return t.id;
 });
 window.RestoChangeFusion=async(oldPair,newPair)=>{
  const {error}=await supabase.rpc('change_fusion_link_v3',{p_old:oldPair?idsFor(oldPair):null,p_new:newPair?idsFor(newPair):null});
  if(error)throw Error(error.code==='23505'?'Cette association existe déjà.':error.message);
  await window.RestoRefreshSharedService();
 };
 window.RestoInstallWalkin=async r=>{
  const {error}=await supabase.rpc('install_walkin_group_v3',{p_tables:idsFor(r.tables),p_guests:r.guests,p_name:r.client,p_type:r.type});
  if(error)throw Error(error.message);
  await window.RestoRefreshSharedService();
 };
 let channelReady=false;
 function showState(state,title,detail){
  badge.dataset.state=state;
  badge.textContent=title;
  description.textContent=detail;
  window.RestoSupabaseReady=state==='ok';
 }
 function showError(error){
  const code=navigator.onLine===false?'HORS_LIGNE':String(error?.code||'LECTURE_DONNEES');
  const messages={
   HORS_LIGNE:'Cet appareil a perdu sa connexion Internet.',
   CHANNEL_ERROR:'La connexion en direct au service a échoué.',
   TIMED_OUT:'Le service a mis trop de temps à répondre.',
   CLOSED:'La connexion en direct a été fermée.',
   '42501':'Le compte connecté ne dispose pas des droits nécessaires pour lire ces données.',
   PGRST301:'La session a expiré ou a été refusée. Reconnectez-vous.',
   PLAN_TABLES:'Le plan de salle reçu ne peut pas être affiché.'
  };
  const detail=messages[code]||'La lecture des données partagées a échoué.';
  showState('error','Synchronisation interrompue',detail+' Code : '+code+'. Vérifiez la connexion puis actualisez si nécessaire.');
 }
 window.addEventListener('offline',()=>showError({code:'HORS_LIGNE'}));
 const applySharedSnapshot=snapshot=>{
  const hours=snapshot.hours, shifts={};
  for(const key of ['lunch','dinner'])shifts[key]={enabled:hours[key+'_enabled'],start:hours[key+'_start'].slice(0,5),end:hours[key+'_end'].slice(0,5)};
  const settings={shifts,duration:hours.duration};
  if(JSON.stringify(settings)!==JSON.stringify(window.RestoSharedHours)){
   window.RestoSharedHours=settings;
   window.dispatchEvent(new Event('restomanager:hours'));
  }
  const byTable=new Map(snapshot.tables.map(t=>[t.id,t.label]));
  window.RestoDraftHolds=snapshot.holds.map(h=>({id:h.id,number:Number(String(byTable.get(h.table_id)||'').replace(/^table\s*/i,'')),
   start:Date.parse(h.starts_at),end:Date.parse(h.ends_at),expiry:Date.parse(h.expires_at),team:h.draft_role==='reception'?'Réception':'Restaurant'}));
  // Supabase is the authoritative table configuration on the connected preview.
  // Keep localStorage intact as a backup; do not persist this shared snapshot locally.
  window.RestoInactiveRestaurantTables=snapshot.tables.filter(t=>!t.active);
  const activeRooms=snapshot.rooms.filter(r=>r.active);
  const primary=activeRooms[0];
  if(primary){
   const rooms=activeRooms.map((r,i)=>({id:i===0?'main':r.id,name:r.name}));
   const roomIds=new Map(activeRooms.map((r,i)=>[r.id,i===0?'main':r.id]));
   window.RestoSharedRoomIds=new Map(activeRooms.map((r,i)=>[i===0?'main':r.id,r.id]));
   const tables=snapshot.tables.filter(t=>t.active&&roomIds.has(t.room_id)).map(t=>({
    id:t.id,number:Number(String(t.label).trim().replace(/^table\s*/i,'')),
    capacityMin:1,capacity:t.seats,roomId:roomIds.get(t.room_id)
   }));
   if(tables.every(t=>Number.isInteger(t.number)&&t.number>0)&&new Set(tables.map(t=>t.number)).size===tables.length){
    const numbers=new Map(tables.map(t=>[t.id,t.number]));
    window.RestoFusionLinks=snapshot.fusionLinks.map(l=>[numbers.get(l.table_a),numbers.get(l.table_b)]).filter(p=>p.every(Number.isInteger));
    try{TableStore.setShared({version:1,rooms,tables});window.dispatchEvent(new Event('restomanager:v3-tables'));}
    catch(err){throw Object.assign(new Error('Plan de salle invalide',{cause:err}),{code:'PLAN_TABLES'});}
   }else throw Object.assign(new Error('Numérotation incompatible'),{code:'PLAN_TABLES'});
  }
  const assigned=new Map();
  for(const a of snapshot.assignments){
   if(!assigned.has(a.reservation_id))assigned.set(a.reservation_id,[]);
   const label=byTable.get(a.table_id);
   const tableNumber=Number(String(label||'').trim().replace(/^table\s*/i,''));
   if(Number.isInteger(tableNumber)&&tableNumber>0)assigned.get(a.reservation_id).push(tableNumber);
  }
  window.RestoSharedReservations=snapshot.reservations.map(r=>{
   const dt=new Date(r.starts_at);
   const dateParts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(dt).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
   const parts=dateParts.year+'-'+dateParts.month+'-'+dateParts.day;
   const time=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hour12:false}).format(dt);
   return {id:r.id,client:r.guest_name||r.hotel_room||'Client',date:parts,time,guests:r.party_size,tables:assigned.get(r.id)||[],status:r.status==='departed'?'released':r.status,
    walkIn:!!r.walkin_type,type:r.walkin_type||undefined,confirmedAt:r.confirmed_at,arrivedAt:r.arrived_at,seatedAt:r.seated_at,releasedAt:r.released_at,
    duration:Math.round((new Date(r.ends_at)-dt)/60000),notes:r.notes||'',hotelRoom:r.hotel_room||''};
  });
  if(navigator.onLine===false)showError({code:'HORS_LIGNE'});
  else if(channelReady)showState('ok','Synchronisation active','Les données de cet appareil sont synchronisées en direct.');
  window.dispatchEvent(new Event('restomanager:supabase-snapshot'));
  window.dispatchEvent(new Event('restomanager:v3-change'));
  lastSync.textContent='Dernière synchronisation : '+new Date().toLocaleString('fr-FR',{timeZone:'Europe/Paris'});
  label.textContent='Compte connecté · '+(profile.display_name||profile.role)+' · '+snapshot.reservations.length+' réservations · '+snapshot.tables.length+' tables';
 };
 window.RestoRefreshSharedService=async()=>{
  try{const snapshot=await loadSharedService();applySharedSnapshot(snapshot);return snapshot;}
  catch(error){showError(error);throw error;}
 };
 try{
  await subscribeSharedService(applySharedSnapshot,showError,connected=>{
   channelReady=connected;
   if(connected)showState('pending','Synchronisation en cours','Connexion établie. Lecture des données en cours…');
  });
 }catch(error){showError(error);}

}catch(error){
 location.replace('login.html');
}

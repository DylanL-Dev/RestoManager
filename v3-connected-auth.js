import {supabase,requireStaff,subscribeSharedService,loadSharedService} from './supabase-service-bridge.js?v=hours1';
const style=document.getElementById('integrationGate');
const banner=document.createElement('section');banner.id='integrationBanner';
const label=document.createElement('span');label.textContent='Connexion en cours…';
const logout=document.createElement('button');logout.type='button';logout.textContent='Déconnexion';
logout.addEventListener('click',async()=>{await supabase.auth.signOut();location.replace('login.html')});
banner.append(label,logout);
try{
 const {profile}=await requireStaff();
 window.RestoReception=profile.role==='reception';
 if(window.RestoReception){
  document.documentElement.classList.add('reception');
  document.querySelector('#editTable').required=false;
  const text=document.createElement('p');
  text.textContent='RestoManager attribue une table disponible à l’enregistrement.';
  document.querySelector('#bookingTable').closest('label').after(text);
  for(const link of document.querySelectorAll('a[href="#administration"]')){
   const caption=link.querySelector('span:last-child');
   if(caption)caption.textContent='Compte';
  }
  document.querySelector('.managementIntro').textContent='Compte réception';
  if(location.hash==='#passages')window.RestoScreens.show('tables');
 }
 window.RestoSharedReservations=[];
 window.RestoSupabaseReady=false;
 const management=document.querySelector('[data-screen="administration"]')||document.getElementById('administration');
 if(!management)throw new Error('Espace Gestion introuvable');
 const network=document.createElement('details');network.className='managementGroup';network.id='manageNetwork';
 const summary=document.createElement('summary');summary.className='managementGroupHead';summary.innerHTML='<span class="managementGroupIcon" aria-hidden="true"><i data-lucide="wifi"></i></span><span class="managementGroupWords"><strong>Réseau et synchronisation</strong><small>Connexion, compte et données partagées</small></span><span class="managementChevron" aria-hidden="true"><i data-lucide="chevron-down"></i></span>';
 const content=document.createElement('div');content.className='managementGroupBody';
 const description=document.createElement('p');description.textContent='État de la synchronisation et compte connecté.';
 const lastSync=document.createElement('p');lastSync.className='muted';lastSync.textContent='Dernière synchronisation : en attente';content.append(description,banner,lastSync);network.append(summary,content);management.append(network);
 if(window.lucide?.createIcons)window.lucide.createIcons();
 style.textContent=style.textContent.replace('body{visibility:hidden}','');
 label.textContent='Compte connecté · '+(profile.display_name||profile.role)+' · Lecture seule des données partagées';
 // Preserve all original navigation and view rendering. Prevent mutations on the
 // legacy localStorage-backed UI until they are replaced by server-side RPC calls.
 const allowedForms=window.RestoReception?['bookingForm','editForm']:['bookingForm','editForm','tableAdminForm','walkinForm','restaurantShiftForm'];
 const forbidden=e=>{
  const target=e.target;
  const form=target.closest?.('form');
  if(e.type==='submit' && form && (!allowedForms.includes(form.id)||!window.RestoSupabaseReady)){e.preventDefault();e.stopImmediatePropagation();const message=form.id==='bookingForm'?'Connexion en cours. Patientez avant d’enregistrer.':'Cette fonction de gestion est temporairement indisponible.';const feedback=document.getElementById(form.id==='bookingForm'?'bookingFeedback':form.id==='tableAdminForm'?'tableAdminFeedback':form.id==='fusionForm'?'fusionMessage':'reservationMessage');if(feedback)feedback.textContent=message;label.textContent=message;return;}
  if(e.type==='click'){
   const btn=target.closest?.('button');
   if(!btn||btn===logout)return;
   const id=btn.id||'';
   if(id==='tableAdminSubmit'&&window.RestoSupabaseReady)return;
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
 window.RestoInstallWalkin=async r=>{
  const table=TableStore.get().tables.find(t=>t.number===r.tables[0]);
  if(!table)throw Error('Table introuvable.');
  const {error}=await supabase.rpc('install_walkin_v3',{p_table:table.id,p_guests:r.guests,p_name:r.client,p_type:r.type});
  if(error)throw Error(error.message);
  await window.RestoRefreshSharedService();
 };
 const applySharedSnapshot=snapshot=>{
  const hours=snapshot.hours, shifts={};
  for(const key of ['lunch','dinner'])shifts[key]={enabled:hours[key+'_enabled'],start:hours[key+'_start'].slice(0,5),end:hours[key+'_end'].slice(0,5)};
  const settings={shifts,duration:hours.duration};
  if(JSON.stringify(settings)!==JSON.stringify(window.RestoSharedHours)){
   window.RestoSharedHours=settings;
   window.dispatchEvent(new Event('restomanager:hours'));
  }
  const byTable=new Map(snapshot.tables.map(t=>[t.id,t.label]));
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
    try{TableStore.setShared({version:1,rooms,tables});window.dispatchEvent(new Event('restomanager:v3-tables'));}
    catch(err){console.error('Synchronisation des tables refusée',err);}
   }else console.error('Numérotation des tables Supabase incompatible avec le plan V3.');
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
  window.RestoSupabaseReady=true;
  window.dispatchEvent(new Event('restomanager:supabase-snapshot'));
  window.dispatchEvent(new Event('restomanager:v3-change'));
  lastSync.textContent='Dernière synchronisation : '+new Date().toLocaleTimeString('fr-FR');
  label.textContent='Compte connecté · '+(profile.display_name||profile.role)+' · '+snapshot.reservations.length+' réservations · '+snapshot.tables.length+' tables · création de réservations active';
 };
 window.RestoRefreshSharedService=async()=>{const snapshot=await loadSharedService();applySharedSnapshot(snapshot);return snapshot;};
 await subscribeSharedService(applySharedSnapshot,err=>{window.RestoSupabaseReady=false;label.textContent='Connexion interrompue · Ne pas utiliser pour le service';lastSync.textContent='Synchronisation interrompue · données potentiellement périmées';console.error(err)});
}catch(error){
 location.replace('login.html');
}

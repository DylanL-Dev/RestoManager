import {supabase,requireStaff,subscribeSharedService,loadSharedService} from './supabase-service-bridge.js?v=20261108-establishment1';
import {prepareServiceSnapshot} from './service-snapshot.js?v=20261108-tables-display';
import {canWrite} from './service-sync.js?v=20261108-tables-display';
import {decodeBookingDetails} from './reservation-details.js?v=20261108-tables-display';
const style=document.getElementById('integrationGate');
const banner=document.createElement('section');banner.id='integrationBanner';
const label=document.createElement('span');label.textContent='Connexion en cours…';
const logout=document.createElement('button');logout.type='button';logout.textContent='Déconnexion';
logout.addEventListener('click',async()=>{
 logout.disabled=true;
 try{
  await window.RestoBookingDraft?.close();
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
 const roleLabel=document.querySelector('#teamSpace span');
 if(roleLabel)roleLabel.textContent=window.RestoReception?'Espace Réception':'Espace Restaurant';
 const sidebarRole=document.getElementById('sidebarRole');
 if(sidebarRole)sidebarRole.textContent=window.RestoReception?'Espace Réception':'Espace Restaurant';
 const roleIcon=document.querySelector('#teamSpace i[data-lucide]');
 if(roleIcon)roleIcon.dataset.lucide=window.RestoReception?'clock-3':'utensils-crossed';
 const introDate=document.getElementById('introDateText');
 const dateInParis=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long',year:'numeric'});
 function updateIntroDate(){
  if(introDate){
   const label=dateInParis.format(new Date());
   introDate.textContent=label.charAt(0).toUpperCase()+label.slice(1);
  }
 }
 updateIntroDate();
 setInterval(updateIntroDate,60000);
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
  // The five menu destinations keep the same hierarchy on both staff roles.
  // Reception sees the read-only service overview, never restaurant passage actions.
  const reservationHeading=document.querySelector('#reservationForm .actionPanelBody h2');
  if(reservationHeading)reservationHeading.textContent='Nouvelle réservation';
  const serviceLink=document.querySelector('.sidebar a[href="#passages"]');
  const serviceSidebar=serviceLink?.querySelector('span');
  if(serviceSidebar)serviceSidebar.textContent='Suivi du service';
  const serviceMobile=document.querySelector('.mobileNavItem[data-nav="passages"]');
  const serviceMobileLabel=serviceMobile?.querySelector('span:last-child');
  if(serviceMobileLabel)serviceMobileLabel.textContent='Suivi';
  if(serviceMobile)serviceMobile.setAttribute('aria-label','Suivi du service');
  for(const link of [serviceLink,serviceMobile]){
   const existingIcon=link?.querySelector('svg, i[data-lucide]');
   if(!existingIcon)continue;
   const icon=document.createElement('i');
   icon.dataset.lucide='clock-3';
   icon.className='navSvgIcon';
   icon.setAttribute('aria-hidden','true');
   existingIcon.replaceWith(icon);
  }
  const serviceShortcut=document.querySelector('.quickAction[href="#passages"] span');
  if(serviceShortcut)serviceShortcut.textContent='Suivi du service';
 }
 window.RestoSharedReservations=[];
 window.RestoSupabaseReady=false;
 window.RestoSharedDataLoaded=false;
 const management=document.querySelector('[data-screen="administration"]')||document.getElementById('administration');
 if(!management)throw new Error('Espace Gestion introuvable');
 // Establishment identity is read from the RLS-protected restaurants table.
 // Never accept a restaurant identifier chosen by the browser's user.
 const establishment=document.createElement('details');
 establishment.className='managementGroup';
 establishment.id='manageEstablishment';
 establishment.open=true;
 const establishmentHead=document.createElement('summary');
 establishmentHead.className='managementGroupHead';
 establishmentHead.innerHTML='<span class="managementGroupIcon" aria-hidden="true"><i data-lucide="building-2"></i></span><span class="managementGroupWords"><strong>Mon établissement</strong><small>Restaurant ou hôtel associé à ce compte</small></span><span class="managementChevron" aria-hidden="true"><i data-lucide="chevron-down"></i></span>';
 const establishmentBody=document.createElement('div');
 establishmentBody.className='managementGroupBody';
 const establishmentName=document.createElement('p');
 establishmentName.id='currentEstablishmentName';
 establishmentName.setAttribute('role','status');
 establishmentName.setAttribute('aria-live','polite');
 establishmentName.textContent='Identification de l’établissement…';
 const establishmentHint=document.createElement('p');
 establishmentHint.className='muted';
 establishmentHint.textContent='Ce nom permettra d’identifier votre établissement dans les futurs signalements de problèmes. Seul un administrateur autorisé pourra le modifier.';
 establishmentBody.append(establishmentName,establishmentHint);
 establishment.append(establishmentHead,establishmentBody);
 management.prepend(establishment);
 if(profile.restaurant_id){
  try{
   const {data:restaurant,error:restaurantError}=await supabase.from('restaurants')
    .select('name').eq('id',profile.restaurant_id).single();
   if(restaurantError)throw restaurantError;
   const name=String(restaurant?.name||'').trim();
   if(!name)throw new Error('Nom non renseigné');
   establishmentName.textContent=name;
   window.RestoEstablishment={id:profile.restaurant_id,name};
   const venue=document.getElementById('teamVenue');
   if(venue){
    venue.textContent=name.split(/\s+[—–]\s+/)[0].trim()||name;
    venue.title=name;
    venue.setAttribute('aria-label',name);
   }
   const sidebarVenue=document.getElementById('sidebarVenue');
   if(sidebarVenue){sidebarVenue.textContent=name.split(/\s+[—–]\s+/)[0].trim()||name;sidebarVenue.title=name;}
  }catch(_error){
   establishmentName.textContent='Nom de l’établissement indisponible';
   const venue=document.getElementById('teamVenue');
   if(venue)venue.textContent='Établissement indisponible';
   const sidebarVenue=document.getElementById('sidebarVenue');
   if(sidebarVenue)sidebarVenue.textContent='Établissement indisponible';
  }
 }else{
  establishmentName.textContent='Établissement non identifié';
  const venue=document.getElementById('teamVenue');
  if(venue)venue.textContent='Établissement non identifié';
  const sidebarVenue=document.getElementById('sidebarVenue');
  if(sidebarVenue)sidebarVenue.textContent='Établissement non identifié';
 }
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
  if(!window.RestoSupabaseReady){feedback.textContent=navigator.onLine===false?'Connexion interrompue · Réservation impossible hors ligne.':'Reconnexion en cours · Patientez jusqu’à la synchronisation des réservations.';return;}
  const invalid=[...bookingForm.elements].find(field=>field.willValidate&&!field.checkValidity());
  if(invalid){feedback.textContent=invalid.id==='bookingTable'?'Aucune table disponible sélectionnée : impossible de créer la réservation.':'Champ obligatoire ou invalide : '+(invalid.closest('label')?.textContent?.trim()||invalid.name||invalid.id);return;}
  feedback.textContent='Vérification et enregistrement de la réservation…';
 });
 document.addEventListener('submit',forbidden,true);
 document.addEventListener('click',forbidden,true);
 // The native reservation list now consumes the shared snapshot directly.
 // No duplicate prototype panel or independent local reservation list.
 window.RestoSaveSharedHours=async(shifts,duration)=>{
  if(!window.RestoSupabaseReady||!canWrite(window.RestoServiceCapabilities))throw Object.assign(Error('Mise à jour ou synchronisation requise.'),{code:'CAPABILITY_REQUIRED'});
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
  if(!window.RestoSupabaseReady||!canWrite(window.RestoServiceCapabilities))throw Object.assign(Error('Mise à jour ou synchronisation requise.'),{code:'CAPABILITY_REQUIRED'});
  const {error}=await supabase.rpc('change_fusion_link_v3',{p_old:oldPair?idsFor(oldPair):null,p_new:newPair?idsFor(newPair):null});
  if(error)throw window.RestoErrors?.business(error.code==='23505'?'Cette association existe déjà.':window.RestoErrors.message(error))||error;
  await window.RestoRefreshSharedService();
 };
 window.RestoInstallWalkin=async r=>{
  if(!window.RestoSupabaseReady||!canWrite(window.RestoServiceCapabilities))throw Object.assign(Error('Mise à jour ou synchronisation requise.'),{code:'CAPABILITY_REQUIRED'});
  const {error}=await supabase.rpc('install_walkin_group_v3',{p_tables:idsFor(r.tables),p_guests:r.guests,p_name:r.client,p_type:r.type});
  if(error)throw error;
  await window.RestoRefreshSharedService();
 };
 let channelReady=false,lastAppliedSequence=0,everConnected=false;
 function showState(state,title,detail){
  const previous=badge.dataset.state;
  badge.dataset.state=state;
  badge.textContent=title;
  description.textContent=detail;
  window.RestoSupabaseReady=state==='ok'&&canWrite(window.RestoServiceCapabilities);
  window.RestoSyncState=state;
  window.dispatchEvent(new Event('restomanager:connection-state'));
  const feedback=document.getElementById('bookingFeedback');
  if(!feedback)return;
  const text=feedback.textContent.trim();
  const stale=/^(Connexion en cours|Synchronisation en cours|Connexion interrompue|Reconnexion en cours|Connexion rétablie|Synchronisation interrompue)/i.test(text);
  if(state==='ok'&&previous!=='ok'){
   if(stale||!text)feedback.textContent='Connexion rétablie · Réservations synchronisées. Vous pouvez poursuivre votre saisie.';
  }else if(state==='error'&&stale){
   feedback.textContent='Connexion interrompue · Réservation impossible. Les données affichées peuvent être anciennes.';
  }else if(state==='pending'&&stale){
   feedback.textContent='Reconnexion en cours · Synchronisation des réservations…';
  }
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
  window.RestoErrors?.diagnostic('service-sync',error);
  showState('error','Synchronisation interrompue',detail+' Vérifiez la connexion puis actualisez si nécessaire.');
 }
 window.addEventListener('offline',()=>showError({code:'HORS_LIGNE'}));
 window.addEventListener('online',()=>showState('pending','Reconnexion en cours','Mise à jour des réservations partagées…'));
 const applySharedSnapshot=snapshot=>{
  // Ignore responses started before a newer service snapshot request.
  if(Number(snapshot.syncSequence||0)<lastAppliedSequence)return;
  if(!navigator.onLine){showError({code:'HORS_LIGNE'});return}
  const prepared=prepareServiceSnapshot(snapshot,decodeBookingDetails);
  if(!TableStore.valid(prepared.plan))throw Object.assign(Error('Plan de salle invalide.'),{code:'PLAN_TABLES'});
  // All decoding and validation precede publication. No listener sees a half snapshot.
  TableStore.setShared(prepared.plan);
  Object.assign(window,prepared.values);
  window.RestoSharedDataLoaded=true;
  lastAppliedSequence=Number(snapshot.syncSequence||0);
  if(navigator.onLine===false)showError({code:'HORS_LIGNE'});
  else if(channelReady&&canWrite(snapshot.capabilities))showState('ok','Synchronisation active','Les données de cet appareil sont synchronisées en direct.');
  else if(channelReady)showState('readonly','Consultation seule','Les données sont consultables. Le responsable doit finaliser la mise à jour du service avant de permettre les modifications.');
  lastSync.textContent='Dernière synchronisation : '+new Date().toLocaleString('fr-FR',{timeZone:'Europe/Paris'});
  window.RestoLastSyncAt=Date.now();
  label.textContent='Compte connecté · '+(profile.display_name||profile.role)+' · '+snapshot.reservations.length+' réservations · '+snapshot.tables.length+' tables';
  window.dispatchEvent(new Event('restomanager:supabase-snapshot'));
 };
 window.RestoRefreshSharedService=async()=>{
  try{const snapshot=await loadSharedService();applySharedSnapshot(snapshot);return snapshot;}
  catch(error){showError(error);throw error;}
 };
 try{
  await subscribeSharedService(applySharedSnapshot,showError,connected=>{
   channelReady=connected;
   if(connected){
    everConnected=true;
    showState('pending','Synchronisation en cours','Connexion établie. Lecture des données en cours…');
   }else if(everConnected){
    showState('error','Synchronisation interrompue','Les réservations affichées peuvent être anciennes. Les modifications sont bloquées jusqu’à reconnexion.');
   }else{
    showState('pending','Connexion en cours','Connexion au service en cours…');
   }
  });
 }catch(error){showError(error);}

}catch(error){
 location.replace('login.html');
}

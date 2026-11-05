import {supabase,requireStaff,subscribeSharedService} from './supabase-service-bridge.js';
const style=document.getElementById('integrationGate');
const banner=document.createElement('section');banner.id='integrationBanner';
const label=document.createElement('span');label.textContent='V3 · Connexion Supabase en cours';
const logout=document.createElement('button');logout.type='button';logout.textContent='Déconnexion';
logout.addEventListener('click',async()=>{await supabase.auth.signOut();location.replace('login.html')});
banner.append(label,logout);
try{
 const {profile}=await requireStaff();
 window.RestoSharedReservations=[];
 window.RestoSupabaseReady=false;
 const management=document.querySelector('[data-screen="administration"]')||document.getElementById('administration');
 if(!management)throw new Error('Espace Gestion introuvable');
 const network=document.createElement('details');network.className='managementGroup';network.id='manageNetwork';
 const summary=document.createElement('summary');summary.className='managementGroupHead';summary.innerHTML='<span class="managementGroupIcon" aria-hidden="true"><i data-lucide="wifi"></i></span><span class="managementGroupWords"><strong>Réseau et synchronisation</strong><small>Connexion, compte et données partagées</small></span><span class="managementChevron" aria-hidden="true"><i data-lucide="chevron-down"></i></span>';
 const content=document.createElement('div');content.className='managementGroupBody';
 const description=document.createElement('p');description.textContent='État de Supabase et compte actuellement connecté.';
 const lastSync=document.createElement('p');lastSync.className='muted';lastSync.textContent='Dernière synchronisation : en attente';content.append(description,banner,lastSync);network.append(summary,content);management.append(network);
 if(window.lucide?.createIcons)window.lucide.createIcons();
 style.textContent=style.textContent.replace('body{visibility:hidden}','');
 label.textContent='Supabase · '+(profile.display_name||profile.role)+' · Lecture seule des données partagées';
 // Preserve all original navigation and view rendering. Prevent mutations on the
 // legacy localStorage-backed UI until they are replaced by server-side RPC calls.
 const protectedForms=new Set(['bookingForm','editForm','walkinForm','tableAdminForm','fusionForm']);
 const forbidden=e=>{
  const target=e.target;
  const form=target.closest?.('form');
  if(e.type==='submit' && form && (form.id!=='bookingForm'||!window.RestoSupabaseReady)){e.preventDefault();e.stopImmediatePropagation();label.textContent='Action désactivée : raccordement Supabase en cours';return;}
  if(e.type==='click'){
   const btn=target.closest?.('button');
   if(!btn||btn===logout)return;
   const id=btn.id||'';
   // Let view navigation, date selection, search and tabs work; block mutation buttons.
   if(/(?:save|submit|delete|remove|release|cancelReservation|confirmReservation|install|arrive|seated|noShow|complete|closure)/i.test(id)){
    e.preventDefault();e.stopImmediatePropagation();label.textContent='Modification bloquée · Supabase reste la source officielle';
   }
  }
 };
 document.addEventListener('submit',forbidden,true);
 document.addEventListener('click',forbidden,true);
 // The native reservation list now consumes the shared snapshot directly.
 // No duplicate prototype panel or independent local reservation list.
 await subscribeSharedService(snapshot=>{
  const byTable=new Map(snapshot.tables.map(t=>[t.id,t.label]));
  const assigned=new Map();
  for(const a of snapshot.assignments){
   if(!assigned.has(a.reservation_id))assigned.set(a.reservation_id,[]);
   const label=byTable.get(a.table_id);
   if(label && /^\d+$/.test(label))assigned.get(a.reservation_id).push(Number(label));
  }
  window.RestoSharedReservations=snapshot.reservations.map(r=>{
   const dt=new Date(r.starts_at);
   const dateParts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(dt).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
   const parts=dateParts.year+'-'+dateParts.month+'-'+dateParts.day;
   const time=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hour12:false}).format(dt);
   return {id:r.id,client:r.guest_name||r.hotel_room||'Client',date:parts,time,guests:r.party_size,tables:assigned.get(r.id)||[],status:r.status||'reserved',notes:r.notes||'',hotelRoom:r.hotel_room||''};
  });
  window.RestoSupabaseReady=true;
  window.dispatchEvent(new Event('restomanager:supabase-snapshot'));
  window.dispatchEvent(new Event('restomanager:v3-change'));
  lastSync.textContent='Dernière synchronisation : '+new Date().toLocaleTimeString('fr-FR');
  label.textContent='Supabase · '+(profile.display_name||profile.role)+' · '+snapshot.reservations.length+' réservations · '+snapshot.tables.length+' tables · création de réservations active';
 },err=>{window.RestoSupabaseReady=false;label.textContent='Supabase indisponible · Ne pas utiliser pour le service';lastSync.textContent='Synchronisation interrompue · données potentiellement périmées';console.error(err)});
}catch(error){
 location.replace('login.html');
}

import {supabase,requireStaff,subscribeSharedService} from './supabase-service-bridge.js';
const boot=document.getElementById('boot');
try{
 const {profile}=await requireStaff();
 const response=await fetch('./index.html',{cache:'no-store'});
 if(!response.ok)throw new Error('Interface V3 indisponible');
 const parsed=new DOMParser().parseFromString(await response.text(),'text/html');
 // Render the complete original V3, including its initialization scripts, after staff validation.
 // Booking changes remain disabled until their atomic Supabase RPC migration is finished.
 for(const node of [...parsed.head.querySelectorAll('link[rel="stylesheet"],link[rel="icon"]')]){
  document.head.appendChild(document.importNode(node,true));
 }
 for(const node of [...parsed.body.children]){
  if(node.tagName==='SCRIPT')continue;
  document.body.appendChild(document.importNode(node,true));
 }
 boot.remove();
 const bar=document.createElement('aside');bar.id='connectionBar';
 const summary=document.createElement('div');summary.textContent='Supabase · '+(profile.display_name||profile.role);
 const sub=document.createElement('small');sub.textContent='Connexion en cours · aperçu en lecture seule';summary.appendChild(sub);
 const logout=document.createElement('button');logout.textContent='Déconnexion';logout.addEventListener('click',async()=>{await supabase.auth.signOut();location.replace('login.html')});
 bar.append(summary,logout);document.body.appendChild(bar);
 // Read-only gate: no legacy writes, submits or controls while data adapters are incomplete.
 const block=e=>{if(e.target.closest('#connectionBar'))return;e.preventDefault();e.stopImmediatePropagation();};
 for(const type of ['click','submit','change','input','keydown','pointerdown','touchstart'])document.addEventListener(type,block,true);
 for(const el of document.querySelectorAll('input,select,textarea,button,[contenteditable]'))el.disabled=true;
 // Replay all original scripts in their original order, preserving UI rendering.
 // External classic scripts must load sequentially (async=false).
 for(const original of parsed.querySelectorAll('script')){
  // Do not register the production service worker in the integration preview.
  if(!original.src && original.textContent.includes('serviceWorker.register'))continue;
  const script=document.createElement('script');
  if(original.src){
   script.src=original.getAttribute('src');
   script.async=false;
   await new Promise((resolve,reject)=>{
    script.onload=resolve;script.onerror=()=>reject(new Error('Script V3 manquant : '+script.src));
    document.body.appendChild(script);
   });
  }else{
   script.textContent=original.textContent;
   document.body.appendChild(script);
  }
 }
 // Show a separate, explicit Supabase read-only view inside the actual reservation screen.
 const section=document.getElementById('reservations');
 const shared=document.createElement('section');shared.id='supabaseReadOnlyReservations';
 shared.style.cssText='padding:14px;margin:12px 0;border:1px solid #a6d8bc;border-radius:14px;background:#eef8f1';
 const heading=document.createElement('h3');heading.textContent='Réservations partagées · Supabase';
 const list=document.createElement('div');list.textContent='Chargement des réservations partagées…';
 shared.append(heading,list);section?.insertBefore(shared,section.querySelector('.reservationSearch'));
 window.renderSupabaseBookings=(snapshot)=>{
  list.replaceChildren();
  if(!snapshot.reservations.length){list.textContent='Aucune réservation enregistrée dans Supabase.';return;}
  for(const booking of snapshot.reservations){
   const line=document.createElement('p');
   const date=booking.starts_at?new Date(booking.starts_at).toLocaleString('fr-FR'):'Date à confirmer';
   line.textContent=date+' · '+(booking.client_name||booking.guest_name||'Client')+' · '+(booking.guest_count||booking.party_size||'?')+' couverts';
   list.appendChild(line);
  }
 };
 await subscribeSharedService(snapshot=>{
  sub.textContent='À jour · '+snapshot.reservations.length+' réservations · '+snapshot.tables.length+' tables · lecture seule';
  window.renderSupabaseBookings?.(snapshot);
 },err=>{sub.textContent='Synchronisation interrompue · lecture seule';console.warn(err)});
}catch(err){boot.textContent='Connexion requise ou chargement impossible. Retour à la connexion…';setTimeout(()=>location.replace('login.html'),2200);}

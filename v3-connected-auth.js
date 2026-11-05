import {supabase,requireStaff,subscribeSharedService} from './supabase-service-bridge.js';
const style=document.getElementById('integrationGate');
const banner=document.createElement('aside');banner.id='integrationBanner';
const label=document.createElement('span');label.textContent='V3 · Connexion Supabase en cours';
const logout=document.createElement('button');logout.type='button';logout.textContent='Déconnexion';
logout.addEventListener('click',async()=>{await supabase.auth.signOut();location.replace('login.html')});
banner.append(label,logout);
try{
 const {profile}=await requireStaff();
 document.body.appendChild(banner);
 style.textContent=style.textContent.replace('body{visibility:hidden}','');
 label.textContent='Supabase · '+(profile.display_name||profile.role)+' · Lecture seule des données partagées';
 // Preserve all original navigation and view rendering. Prevent mutations on the
 // legacy localStorage-backed UI until they are replaced by server-side RPC calls.
 const protectedForms=new Set(['bookingForm','editForm','walkinForm','tableAdminForm','fusionForm']);
 const forbidden=e=>{
  const target=e.target;
  const form=target.closest?.('form');
  if(e.type==='submit' && form){e.preventDefault();e.stopImmediatePropagation();label.textContent='Action désactivée : raccordement Supabase en cours';return;}
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
 const shared=document.createElement('section');
 shared.id='supabaseReadOnlyReservations';
 shared.style.cssText='margin:12px 0;padding:14px;border:1px solid #a6d8bc;border-radius:14px;background:#eef8f1';
 const heading=document.createElement('h3');heading.textContent='Réservations Supabase · Lecture seule';
 const body=document.createElement('div');body.textContent='Chargement…';shared.append(heading,body);
 document.getElementById('reservations')?.prepend(shared);
 await subscribeSharedService(snapshot=>{
  label.textContent='Supabase · '+(profile.display_name||profile.role)+' · '+snapshot.reservations.length+' réservations · '+snapshot.tables.length+' tables';
  body.replaceChildren();
  if(!snapshot.reservations.length){body.textContent='Aucune réservation dans la base Supabase.';return;}
  for(const r of snapshot.reservations){
   const p=document.createElement('p');
   p.textContent=[r.starts_at?new Date(r.starts_at).toLocaleString('fr-FR'):'',r.client_name||r.guest_name||'Client',String(r.guest_count||r.party_size||'?')+' couverts'].filter(Boolean).join(' · ');
   body.append(p);
  }
 },err=>{label.textContent='Supabase indisponible · Ne pas utiliser pour le service';console.error(err)});
}catch(error){
 location.replace('login.html');
}

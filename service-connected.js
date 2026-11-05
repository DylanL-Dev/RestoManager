import {supabase,requireStaff,subscribeSharedService} from './supabase-service-bridge.js';
const status=document.getElementById('status'),error=document.getElementById('error'),metrics=document.getElementById('metrics');
const logout=document.getElementById('logout');
logout.addEventListener('click',async()=>{await supabase.auth.signOut();location.replace('login.html')});
try{
 const {profile}=await requireStaff();
 status.textContent='Connecté : '+(profile.display_name||profile.role)+' · Synchronisation en cours…';
 await subscribeSharedService(snapshot=>{
  status.textContent='Connecté : '+(profile.display_name||profile.role)+' · Données Supabase actualisées';
  error.textContent='';
  const values=[['Réservations',snapshot.reservations.length],['Tables',snapshot.tables.length],['Salles',snapshot.rooms.length],['Occupations temporaires',snapshot.holds.length]];
  metrics.replaceChildren(...values.map(([name,value])=>{const el=document.createElement('span');el.textContent=name+' : '+value;return el;}));
 },err=>{error.textContent='Synchronisation indisponible : '+err.message;});
}catch(err){status.textContent='Accès non autorisé';error.textContent='Connectez-vous avec un compte Réception ou F&B actif.';document.querySelector('iframe').remove();setTimeout(()=>location.replace('login.html'),1800);}

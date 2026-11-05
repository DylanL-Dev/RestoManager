import {supabase,requireStaff,subscribeSharedService} from './supabase-service-bridge.js';
const boot=document.getElementById('boot');
try{
 const {profile}=await requireStaff();
 const response=await fetch('./index.html',{cache:'no-store'});
 if(!response.ok)throw new Error('Interface V3 indisponible');
 const parsed=new DOMParser().parseFromString(await response.text(),'text/html');
 // The original service scripts use localStorage for booking writes. They are NOT executed.
 // Render the real V3 markup/styles at top level until each action is migrated to Supabase.
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
 // Icons are a presentation-only enhancement; do not run the legacy app scripts.
 for(const src of ['lucide-local.js','service-v3-lucide.js']){
  const script=document.createElement('script');script.src=src;document.head.appendChild(script);
 }
 await subscribeSharedService(snapshot=>{
  sub.textContent='À jour · '+snapshot.reservations.length+' réservations · '+snapshot.tables.length+' tables · lecture seule';
 },err=>{sub.textContent='Synchronisation interrompue · lecture seule';console.warn(err)});
}catch(err){boot.textContent='Connexion requise ou chargement impossible. Retour à la connexion…';setTimeout(()=>location.replace('login.html'),2200);}

import {encodeBookingDetails} from './reservation-details.js';
// A key belongs to this form instance. Tabs sharing a login still have separate holds.
export function setupBookingDraft(supabase, parisDateTime){
 const el=id=>document.getElementById(id);
 const form=el('bookingForm');
 const panel=el('bookingDraft');
 const message=el('draftMessage');
 const extend=el('draftExtend');
 const abandon=el('draftAbandon');
 const submit=form.querySelector('[type=submit]');
 let draft=null, active=false, debounce, queue=Promise.resolve(), submitting=false;
 let nextExpiry=Infinity,holdGeneration=0;
 const pendingReleases=new Set();
 let releasingPending=false;
 // A late snapshot can still contain a hold that the server has just released.
 const released=new Map();
 let checking=false,lastCheck=0;
 const onlineReady=()=>navigator.onLine!==false&&window.RestoSupabaseReady===true;
 const offlineMessage='Connexion interrompue : aucune réservation ne peut être confirmée. Le maintien devra être revérifié après reconnexion.';
 function retire(ids,until){
  for(const id of ids||[])released.set(id,Math.max(until||0,Date.now()+180000));
 }
 async function reconcile(){
  if(checking||!window.RestoSupabaseReady||Date.now()-lastCheck<5000||
     window.RestoScreens?.current()!=='reservationForm')return;
  const ids=(window.RestoDraftHolds||[]).filter(h=>h.expiry>Date.now()&&!released.has(h.id)&&!draft?.holdIds?.includes(h.id)).map(h=>h.id);
  if(!ids.length)return;
  checking=true;lastCheck=Date.now();
  try{
   const {data,error}=await supabase.from('table_holds').select('id').in('id',ids);
   if(error)return;
   const present=new Set(data.map(row=>row.id));
   const gone=ids.filter(id=>!present.has(id));
   if(gone.length){retire(gone);redraw()}
  }catch{/* Realtime and the server expiry remain authoritative while offline. */}
  finally{checking=false}
 }
 function deferRelease(key){if(key)pendingReleases.add(key)}
 async function flushPendingReleases(){
  if(releasingPending||!onlineReady()||!pendingReleases.size)return;
  releasingPending=true;
  try{
   for(const key of [...pendingReleases]){
    if(!onlineReady())break;
    try{
     const {error}=await supabase.rpc('booking_draft_v3',{p_key:key,p_action:'release'});
     if(!error)pendingReleases.delete(key);
    }catch{/* Retry after the next confirmed synchronization. */}
   }
   if(!pendingReleases.size)window.RestoRefreshSharedService?.().catch(()=>{});
  }finally{releasingPending=false}
 }
 function serial(task){
  const result=queue.then(task);
  queue=result.catch(()=>{});
  return result;
 }
 function show(text,canExtend=false){
  panel.hidden=false;
  message.textContent=text;
  extend.hidden=!canExtend;
 }
 function remaining(){return draft?Math.max(0,Math.ceil((draft.until-Date.now())/1000)):0}
 function tick(){
  if(!active)return;
  if(!onlineReady()){show(offlineMessage,false);return}
  if(!draft?.numbers)return;
  const seconds=remaining();
  extend.textContent=seconds?'Prolonger':'Revérifier';
  const tables=(draft.numbers.length===1?'Table ':'Tables ')+draft.numbers.join(' + ');
  show(seconds?tables+' · Maintien pour vous · '+Math.floor(seconds/60)+' min '+String(seconds%60).padStart(2,'0')+' s':
   'Le maintien a expiré. Revérifiez la disponibilité avant de valider.',true);
 }
 function redraw(){window.dispatchEvent(new Event('restomanager:v3-change'))}
 function refreshExpiredHolds(){
  if(nextExpiry<=Date.now()){
   nextExpiry=Infinity;
   redraw();
  }
 }
 setInterval(()=>{
  for(const [id,until] of released)if(until<=Date.now())released.delete(id);
  tick();refreshExpiredHolds();void reconcile();
 },1000);
 function idsToNumbers(ids){
  return ids.map(id=>TableStore.get().tables.find(t=>t.id===id)?.number).sort((a,b)=>a-b);
 }
 async function rpc(key,action,args={}){
  if(!onlineReady())throw Error(offlineMessage);
  const {data,error}=await supabase.rpc('booking_draft_v3',{p_key:key,p_action:action,...args});
  if(error)throw Error(error.message);
  return data;
 }
 function fields(){
  const guests=Number(el('bookingGuests').value);
  const start=parisDateTime(el('bookingDate').value,el('bookingTime').value);
  const end=new Date(Date.parse(start)+ReservationEngine.getDefaultDuration()*60000).toISOString();
  if(!Number.isInteger(guests)||guests<1)throw Error('Indiquez le nombre de couverts.');
  const selected=el('bookingTable').value;
  const numbers=selected?selected.split(',').map(Number):[];
  const ids=window.RestoReception?null:numbers.map(n=>TableStore.get().tables.find(t=>t.number===n)?.id);
  if(ids&&(!ids.length||ids.includes(undefined)))throw Error('Choisissez une table disponible.');
  return {start,end,guests,numbers,ids,signature:JSON.stringify([start,end,guests,ids])};
 }
 async function release(){
  if(!draft)return;
  const current=draft;
  try{await rpc(current.key,'release')}
  catch(error){deferRelease(current.key);throw error}
  retire(current.holdIds,current.until);
  if(draft?.key===current.key)draft=null;
 }
 async function ensure(force=false){
  if(!onlineReady())throw Error(offlineMessage);
  const generation=holdGeneration;
  let f;
  try{f=fields()}catch(error){await release();throw error}
  if(draft?.signature===f.signature&&remaining()>0)return draft;
  if(draft?.signature===f.signature&&draft.numbers&&!force){tick();throw Error('Le maintien a expiré. Appuyez sur Revérifier.')}
  await release();
  const key=crypto.randomUUID();
  draft={key,signature:f.signature,start:f.start,guests:f.guests,until:0};
  if(active)show('Vérification de la disponibilité…');
  const sent=Date.now();
  const result=await rpc(key,'hold',{p_start:f.start,p_end:f.end,p_guests:f.guests,p_tables:f.ids});
  if(generation!==holdGeneration||!onlineReady()||draft?.key!==key){
   deferRelease(key);
   if(onlineReady())void flushPendingReleases();
   throw Error('Connexion interrompue pendant le maintien. Revérifiez la disponibilité.');
  }
  Object.assign(draft,{numbers:idsToNumbers(result.tables),holdIds:result.holds,until:sent+result.seconds*1000});
  redraw();tick();
  return draft;
 }
 function inputChanged(event){
  if(submitting||!window.RestoSupabaseReady||window.RestoScreens?.current()!=='reservationForm')return;
  active=true;
  clearTimeout(debounce);
  debounce=setTimeout(()=>serial(async()=>{
   if(!active||submitting)return;
   try{await ensure()}catch(error){if(active)show(error.message,true)}
  }),250);
 }
 form.addEventListener('input',inputChanged);
 form.addEventListener('change',inputChanged);
 extend.addEventListener('click',()=>serial(async()=>{
  clearTimeout(debounce);
  if(!onlineReady()){show(offlineMessage,false);return}
  if(!active||submitting)return;
  try{
   if(!remaining()||draft.signature!==fields().signature){await ensure(true);return}
   const sent=Date.now(),result=await rpc(draft.key,'extend');
   draft.until=sent+result.seconds*1000;
   tick();
  }catch(error){show(error.message,true)}
 }));
 function leave(reset){
  active=false;clearTimeout(debounce);panel.hidden=true;
  // A disconnected browser cannot release a server hold. Forget it locally;
  // the server-side expiry remains authoritative and blocks unsafe re-use.
  if(!onlineReady()){
   holdGeneration++;
   if(draft){deferRelease(draft.key);retire(draft.holdIds,draft.until);}
   draft=null;panel.hidden=true;
   if(reset){
    const date=el('bookingDate').value,time=el('bookingTime').value;
    form.reset();el('bookingDate').value=date;el('bookingTime').value=time;
    delete el('bookingTable').dataset.manual;
    el('bookingFeedback').textContent='Saisie abandonnée hors ligne. Le maintien expire automatiquement côté serveur.';
   }
   redraw();return Promise.resolve();
  }
  return serial(async()=>{
   try{
    await release();panel.hidden=true;
    if(reset){
     const date=el('bookingDate').value,time=el('bookingTime').value;
     form.reset();el('bookingDate').value=date;el('bookingTime').value=time;
     delete el('bookingTable').dataset.manual;
     el('bookingFeedback').textContent='Saisie abandonnée.';
    }
    redraw();
   }catch(error){
    if(!active){panel.hidden=true;return}
    show('Libération non confirmée. Le maintien expirera automatiquement.',false);
   }
  });
 }
 abandon.addEventListener('click',()=>leave(true));
 const close=()=>(active||draft)?leave(false):Promise.resolve();
 el('reservationForm').addEventListener('toggle',event=>{if(!event.currentTarget.open)void close()});
 // Discard the previous hold after a network interruption: it may have expired
 // or been released by Supabase while this device was disconnected.
 window.addEventListener('offline',()=>{
  holdGeneration++;
  clearTimeout(debounce);
  if(draft){deferRelease(draft.key);retire(draft.holdIds,draft.until);}
  draft=null;
  if(active){show(offlineMessage,false);submit.disabled=true}
  redraw();
 });
 window.addEventListener('online',()=>{
  submit.disabled=false;
  if(active)show('Reconnexion en cours. Les maintiens seront revérifiés dès la synchronisation.',false);
 });
 window.addEventListener('restomanager:supabase-snapshot',()=>{
  if(onlineReady()){
   void flushPendingReleases();
   if(active&&!draft){show('Connexion rétablie · Réservations synchronisées. Revérifiez la disponibilité avant de confirmer.',true)}
  }
 });
 window.addEventListener('pagehide',()=>{void close()});
 window.addEventListener('restomanager:screen',e=>{if(e.detail!=='reservationForm'&&(active||draft))leave(false)});
 return {
  close,
  occupied(numbers,start,end){
   const rows=window.RestoDraftHolds||[];
   return rows.filter(h=>{
    if(h.expiry<=Date.now()||released.has(h.id))return false;
    nextExpiry=Math.min(nextExpiry,h.expiry);
    return !draft?.holdIds?.includes(h.id)&&numbers.includes(h.number)&&h.start<end&&start<h.end;
   });
  },
  pinned(date,time,guests){return remaining()>0&&draft.guests===guests&&draft.start===parisDateTime(date,time)?draft.numbers:null},
  async confirm(candidate){
   if(submitting)throw Error('Enregistrement déjà en cours.');
   if(!onlineReady())throw Error(offlineMessage);
   submitting=true;submit.disabled=true;extend.disabled=true;abandon.disabled=true;
   active=true;clearTimeout(debounce);
   try{
    await serial(async()=>{
     const current=await ensure();
     if(!active||fields().signature!==current.signature)throw Error('La saisie a changé. Vérifiez la table avant de valider.');
     if(candidate.guests!==Number(el('bookingGuests').value)||candidate.date!==el('bookingDate').value||candidate.time!==el('bookingTime').value)throw Error('Le créneau a changé. Vérifiez la réservation.');
     const name=candidate.client.trim();
     const room=candidate.type==='hotel'&&/^\d{1,6}[A-Za-z]?$/.test(name)?name:null;
     const notes=encodeBookingDetails(candidate);
     await rpc(current.key,'confirm',{p_name:name,p_room:room,p_notes:notes});
     candidate.tables=current.numbers;
     retire(current.holdIds,current.until);
     draft=null;active=false;panel.hidden=true;
    });
   }finally{submitting=false;submit.disabled=false;extend.disabled=false;abandon.disabled=false}
  }
 };
}

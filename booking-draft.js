import {encodeBookingDetails} from './reservation-details.js?v=20261108-tables-display';
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
 let nextExpiry=Infinity,holdGeneration=0,holding=false;
 const recoveryStorage='restomanager_pending_booking_v1';
 let recovery=null,recovering=false,committedRecovered=false;
 try{const saved=JSON.parse(window.sessionStorage?.getItem(recoveryStorage)||'null');if(saved&&typeof saved.key==='string'&&['confirming','committed'].includes(saved.phase))recovery=saved;}catch{/* An inaccessible store is checked before sending a confirmation. */}
 function persistRecovery(value){
  if(value){
   if(!window.sessionStorage)throw safe('Le navigateur ne permet pas de sécuriser cette confirmation. Activez le stockage de session avant de réessayer.');
   window.sessionStorage.setItem(recoveryStorage,JSON.stringify(value));
  }else window.sessionStorage?.removeItem(recoveryStorage);
  recovery=value;
 }
 const safe=(text,code)=>window.RestoErrors?.business(text,code)||Object.assign(Error(text),{business:true,code});
 const errorMessage=error=>window.RestoErrors?.message(error)|| (error?.business?error.message:'La disponibilité n’a pas pu être vérifiée. Vérifiez votre connexion puis réessayez.');
 function setSubmit(){submit.disabled=submitting||!onlineReady()||!!recovery||recovering}
 function rememberCommitted(key){
  recovery={key,phase:'committed'};committedRecovered=true;
  try{persistRecovery(recovery)}catch(error){window.RestoErrors?.diagnostic('booking-recovery-store',error)}
  show('Cette réservation a déjà été enregistrée. Consultez les réservations actualisées avant de commencer une nouvelle saisie.',false);
  abandon.textContent='Commencer une nouvelle réservation';setSubmit();
  window.RestoRefreshSharedService?.().catch(()=>{});
 }
 async function recover(){
  if(!recovery||recovering||committedRecovered||!onlineReady())return;
  recovering=true;setSubmit();
  try{
   const key=recovery.key;
   const {data,error}=await supabase.rpc('booking_draft_status_v1',{p_key:key});
   if(error)throw error;
   if(!['pending','committed','expired','missing'].includes(data?.state))throw Error('Invalid recovery state');
   if(data.state==='committed'){rememberCommitted(key);return}
   if(data.state==='pending'){
    // Confirmation may win after the status read. Release decides atomically
    // under its server lock and must report that winner before forgetting a key.
    const result=await supabase.rpc('booking_draft_v3',{p_key:key,p_action:'release'});
    if(result.error)throw result.error;
    if(result.data?.state==='committed'){rememberCommitted(key);return}
    if(result.data?.state!=='released')throw Error('Unconfirmed recovery release');
   }
   if(draft?.key===key){retire(draft.holdIds,draft.until);draft=null}
   persistRecovery(null);
   show('Aucune réservation confirmée pour cette saisie. Vérifiez les informations conservées, puis confirmez à nouveau.',true);
   redraw();
  }catch(error){window.RestoErrors?.diagnostic('booking-recovery',error);show('La confirmation reste à vérifier. Votre saisie est conservée ; patientez avant toute nouvelle réservation.',false)}
  finally{recovering=false;setSubmit()}
 }
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
     const {data,error}=await supabase.rpc('booking_draft_v3',{p_key:key,p_action:'release'});
     if(!error&&data?.state==='committed'){pendingReleases.delete(key);rememberCommitted(key);break}
     if(!error&&data?.state==='released')pendingReleases.delete(key);
    }catch{/* Retry after the next confirmed synchronization. */}
   }
   if(!pendingReleases.size&&typeof window.RestoRefreshSharedService==='function')void window.RestoRefreshSharedService().catch(()=>{});
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
  if(recovery||recovering)return;
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
  if(!onlineReady())throw safe(offlineMessage);
  const {data,error}=await supabase.rpc('booking_draft_v3',{p_key:key,p_action:action,...args});
  if(error)throw error;
  return data;
 }
 function fields(){
  const guests=Number(el('bookingGuests').value);
  const start=parisDateTime(el('bookingDate').value,el('bookingTime').value);
  const end=new Date(Date.parse(start)+ReservationEngine.getDefaultDuration()*60000).toISOString();
  if(!Number.isInteger(guests)||guests<1)throw safe('Indiquez le nombre de couverts.');
  const selected=el('bookingTable').value;
  const numbers=selected?selected.split(',').map(Number):[];
  const ids=window.RestoReception?null:numbers.map(n=>TableStore.get().tables.find(t=>t.number===n)?.id);
  if(ids&&(!ids.length||ids.includes(undefined)))throw safe('Choisissez une table disponible.');
  return {start,end,guests,numbers,ids,signature:JSON.stringify([start,end,guests,ids])};
 }
 async function release(){
  if(!draft||recovery)return;
  const current=draft;
  try{
   const result=await rpc(current.key,'release');
   if(result?.state==='committed'){rememberCommitted(current.key);throw safe('Cette réservation a déjà été enregistrée. Consultez les réservations avant de commencer une nouvelle saisie.')}
   if(result?.state!=='released')throw safe('La libération n’a pas pu être vérifiée. Patientez puis réessayez.');
  }
  catch(error){deferRelease(current.key);throw error}
  retire(current.holdIds,current.until);
  if(draft?.key===current.key)draft=null;
 }
 async function ensure(force=false){
  if(!onlineReady())throw safe(offlineMessage);
  if(recovery)throw safe('Une confirmation précédente doit être vérifiée avant de continuer.','RESULT_UNKNOWN');
  const generation=holdGeneration;
  let f;
  try{f=fields()}catch(error){await release();throw error}
  if(draft?.signature===f.signature&&remaining()>0)return draft;
  if(draft?.signature===f.signature&&draft.numbers&&!force){tick();throw safe('Le maintien a expiré. Appuyez sur Revérifier.')}
  await release();
  const key=crypto.randomUUID();
  draft={key,signature:f.signature,start:f.start,guests:f.guests,until:0};
  if(active)show('Vérification de la disponibilité…');
  const sent=Date.now();
  holding=true;redraw();
  let result;
  try{result=await rpc(key,'hold',{p_start:f.start,p_end:f.end,p_guests:f.guests,p_tables:f.ids})}
  catch(error){if(draft?.key===key)draft=null;holding=false;redraw();throw error}
  finally{holding=false}
  const unchanged=(()=>{try{return fields().signature===f.signature}catch{return false}})();
  if(!unchanged||generation!==holdGeneration||!active||window.RestoScreens?.current()!=='reservationForm'||!onlineReady()||draft?.key!==key){
   deferRelease(key);
   if(draft?.key===key)draft=null;
   if(onlineReady())void flushPendingReleases();
   throw safe('Saisie quittée ou connexion interrompue. Table libérée dès que possible.');
  }
  Object.assign(draft,{numbers:idsToNumbers(result.tables),holdIds:result.holds,until:sent+result.seconds*1000});
  clearPreviousAbandonMessage();
  redraw();tick();
  return draft;
 }
 function clearPreviousAbandonMessage(){
  const feedback=el('bookingFeedback');
  // A prior abandonment is informational, not an error for the next booking.
  // Keep actual validation/connection errors visible until they are resolved.
  if(feedback&&/^Saisie abandonnée(?:\.| hors ligne\.)/.test(feedback.textContent.trim()))feedback.textContent='';
 }
 function inputChanged(event){
  if(submitting||!window.RestoSupabaseReady||window.RestoScreens?.current()!=='reservationForm')return;
  clearPreviousAbandonMessage();
  active=true;
  if(['bookingDate','bookingTime','bookingGuests','bookingTable'].includes(event?.target?.id))holdGeneration++;
  clearTimeout(debounce);
  debounce=setTimeout(()=>serial(async()=>{
   if(!active||submitting)return;
   try{window.RestoRefreshBookingAvailability?.();await ensure()}catch(error){if(active){window.RestoErrors?.diagnostic('booking-hold',error);show(errorMessage(error),true);redraw()}}
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
  }catch(error){show(errorMessage(error),true);redraw()}
 }));
 function leave(reset){
  if(recovery){active=false;clearTimeout(debounce);show('Une confirmation reste à vérifier. La saisie et son identifiant sont conservés.',false);return Promise.resolve()}
  // Stop considering the old hold available immediately, even if a hold RPC
  // is still in flight. Its server-side cleanup is queued after that RPC.
  holdGeneration++;
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
    await release();
    if(onlineReady())await flushPendingReleases();
    panel.hidden=true;
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
 abandon.addEventListener('click',async()=>{
  if(committedRecovered){
   const ok=window.RestoDialog?await window.RestoDialog.confirm('La réservation a déjà été enregistrée. Commencer une nouvelle saisie ?',{title:'Nouvelle réservation',acceptLabel:'Commencer'}):window.confirm?.('La réservation a déjà été enregistrée. Commencer une nouvelle saisie ?');
   if(!ok)return;
   committedRecovered=false;persistRecovery(null);draft=null;abandon.textContent='Abandonner';
   window.RestoPrepareNewReservation?.();setSubmit();return;
  }
  if(recovery){void recover();return}
  return leave(true);
 });
 const close=()=>(active||draft)?leave(false):Promise.resolve();
 el('reservationForm').addEventListener('toggle',event=>{if(!event.currentTarget.open)void close()});
 // Discard the previous hold after a network interruption: it may have expired
 // or been released by Supabase while this device was disconnected.
 window.addEventListener('offline',()=>{
  holdGeneration++;
  clearTimeout(debounce);
  if(draft&&!recovery){deferRelease(draft.key);retire(draft.holdIds,draft.until);draft=null}
  if(active){show(offlineMessage,false);submit.disabled=true}
  redraw();
 });
 window.addEventListener('online',()=>{
  setSubmit();
  if(active)show('Reconnexion en cours. Les maintiens seront revérifiés dès la synchronisation.',false);
 });
 window.addEventListener('restomanager:supabase-snapshot',()=>{
  setSubmit();
  if(onlineReady()){
   void flushPendingReleases();
   if(recovery)void recover();
   if(active&&!draft&&!recovery){show('Connexion rétablie · Réservations synchronisées. Revérifiez la disponibilité avant de confirmer.',true)}
  }
 });
 // Leaving the in-app reservation screen or putting the browser in the
 // background releases the hold rather than occupying a table for 3 minutes.
 // pagehide is best-effort; a killed browser can only rely on server expiry.
 const closeOnBackground=()=>{if(document.visibilityState==='hidden'&&(active||draft))void leave(false);else if(document.visibilityState==='visible'){redraw();if(recovery)void recover()}};
 document.addEventListener('visibilitychange',closeOnBackground);
 window.addEventListener('pagehide',()=>{if(active||draft)void leave(false)});
 window.addEventListener('restomanager:screen',e=>{
  if(e.detail!=='reservationForm'&&(active||draft))void leave(false);
 });
 setSubmit();
 if(recovery){active=true;show('Vérification d’une confirmation précédente…',false);setSubmit();if(onlineReady())void recover()}
 return {
  close,
  checking:()=>holding||recovering||!!recovery,
  recoveryState:()=>recovery?.phase||null,
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
   if(submitting)throw safe('Enregistrement déjà en cours.');
   if(recovery){await recover();throw safe(committedRecovered?'Cette réservation a déjà été enregistrée. Consultez les réservations avant de commencer une nouvelle saisie.':'La confirmation précédente reste à vérifier. Votre saisie est conservée.','RESULT_UNKNOWN')}
   if(!onlineReady())throw safe(offlineMessage);
   submitting=true;submit.disabled=true;extend.disabled=true;abandon.disabled=true;
   const previousInert=form.inert;form.inert=true;form.setAttribute?.('aria-busy','true');
   active=true;clearTimeout(debounce);
   try{
    await serial(async()=>{
     const current=await ensure();
     if(!active||fields().signature!==current.signature)throw safe('La saisie a changé. Vérifiez la table avant de valider.');
     if(candidate.guests!==Number(el('bookingGuests').value)||candidate.date!==el('bookingDate').value||candidate.time!==el('bookingTime').value)throw safe('Le créneau a changé. Vérifiez la réservation.');
     const room=candidate.type==='hotel'?String(candidate.hotelRoom||'').trim().toUpperCase():null;
     const name=String(candidate.client||'').trim()||(candidate.type==='hotel'?'Chambre '+(room||'non renseignée'):'');
     if(candidate.type==='exterieur'&&(!name||/^(client[ ]+ext[eé]rieur|sans[ ]+nom|anonyme)$/i.test(name)))throw safe('Le nom du client extérieur est obligatoire.','EXTERNAL_NAME_REQUIRED');
     if(candidate.type==='hotel'&&!/^\d{1,6}[A-Z]?$/.test(room||''))throw safe('Indiquez un numéro de chambre valide (ex. : 225).','ROOM_REQUIRED');
     if(String(candidate.notes||'').length>1000||String(candidate.allergies||'').length>500)throw safe('Les notes ou allergies dépassent la longueur autorisée. Raccourcissez votre saisie.');
     const notes=encodeBookingDetails(candidate);
     try{persistRecovery({key:current.key,phase:'confirming'})}catch{throw safe('La confirmation ne peut pas être sécurisée sur ce navigateur. Vérifiez le stockage de session.')}
     try{await rpc(current.key,'confirm',{p_name:name,p_room:room,p_notes:notes})}
     catch(error){
      window.RestoErrors?.diagnostic('booking-confirm',error);
      // Never issue a new operation key until the original result is known.
      await recover();
      if(!committedRecovered)throw (recovery?safe('La confirmation reste à vérifier. Votre saisie est conservée.','RESULT_UNKNOWN'):error);
     }
     persistRecovery(null);committedRecovered=false;abandon.textContent='Abandonner';
     candidate.tables=current.numbers;
     retire(current.holdIds,current.until);
     draft=null;active=false;panel.hidden=true;
    });
   }finally{submitting=false;form.inert=previousInert;form.removeAttribute?.('aria-busy');setSubmit();extend.disabled=false;abandon.disabled=false}
  }
 };
}

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
 let nextExpiry=Infinity;
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
 setInterval(()=>{tick();refreshExpiredHolds()},1000);
 function idsToNumbers(ids){
  return ids.map(id=>TableStore.get().tables.find(t=>t.id===id)?.number).sort((a,b)=>a-b);
 }
 async function rpc(key,action,args={}){
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
  await rpc(draft.key,'release');
  draft=null;
 }
 async function ensure(force=false){
  let f;
  try{f=fields()}catch(error){await release();throw error}
  if(draft?.signature===f.signature&&remaining()>0)return draft;
  if(draft?.signature===f.signature&&draft.numbers&&!force){tick();throw Error('Le maintien a expiré. Appuyez sur Revérifier.')}
  await release();
  const key=crypto.randomUUID();
  draft={key,signature:f.signature,start:f.start,guests:f.guests,until:0};
  show('Vérification de la disponibilité…');
  const sent=Date.now();
  const result=await rpc(key,'hold',{p_start:f.start,p_end:f.end,p_guests:f.guests,p_tables:f.ids});
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
   try{await ensure()}catch(error){show(error.message,true)}
  }),250);
 }
 form.addEventListener('input',inputChanged);
 form.addEventListener('change',inputChanged);
 extend.addEventListener('click',()=>serial(async()=>{
  clearTimeout(debounce);
  if(!active||submitting)return;
  try{
   if(!remaining()||draft.signature!==fields().signature){await ensure(true);return}
   const sent=Date.now(),result=await rpc(draft.key,'extend');
   draft.until=sent+result.seconds*1000;
   tick();
  }catch(error){show(error.message,true)}
 }));
 function leave(reset){
  active=false;clearTimeout(debounce);
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
   }catch(error){show('Libération non confirmée. Le maintien expirera automatiquement.',false)}
  });
 }
 abandon.addEventListener('click',()=>leave(true));
 window.addEventListener('restomanager:screen',e=>{if(e.detail!=='reservationForm'&&(active||draft))leave(false)});
 return {
  occupied(numbers,start,end){
   const rows=window.RestoDraftHolds||[];
   return rows.filter(h=>{
    if(h.expiry<=Date.now())return false;
    nextExpiry=Math.min(nextExpiry,h.expiry);
    return !draft?.holdIds?.includes(h.id)&&numbers.includes(h.number)&&h.start<end&&start<h.end;
   });
  },
  pinned(date,time,guests){return remaining()>0&&draft.guests===guests&&draft.start===parisDateTime(date,time)?draft.numbers:null},
  async confirm(candidate){
   if(submitting)throw Error('Enregistrement déjà en cours.');
   submitting=true;submit.disabled=true;extend.disabled=true;abandon.disabled=true;
   active=true;clearTimeout(debounce);
   try{
    await serial(async()=>{
     const current=await ensure();
     if(!active||fields().signature!==current.signature)throw Error('La saisie a changé. Vérifiez la table avant de valider.');
     if(candidate.guests!==Number(el('bookingGuests').value)||candidate.date!==el('bookingDate').value||candidate.time!==el('bookingTime').value)throw Error('Le créneau a changé. Vérifiez la réservation.');
     const name=candidate.client.trim();
     const room=candidate.type==='hotel'&&/^\d{1,6}[A-Za-z]?$/.test(name)?name:null;
     const notes=[candidate.notes,candidate.allergies?'ALLERGIES À VÉRIFIER : '+candidate.allergies:''].filter(Boolean).join('\n');
     await rpc(current.key,'confirm',{p_name:name,p_room:room,p_notes:notes});
     candidate.tables=current.numbers;
     draft=null;active=false;panel.hidden=true;
    });
   }finally{submitting=false;submit.disabled=false;extend.disabled=false;abandon.disabled=false}
  }
 };
}

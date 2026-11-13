'use strict';
/* John JAYET feedback — quick arrival slots and cover-count choices. DEV only.
   Existing reservation inputs and ReservationEngine remain the single source of truth. */
(function(){
 const date=document.getElementById('bookingDate'),time=document.getElementById('bookingTime'),guests=document.getElementById('bookingGuests');
 if(!date||!time||!guests||!document.getElementById('bookingForm'))return;
 const style=document.createElement('style');style.id='rmDirectorBookingChoicesStyles';
 style.textContent=`.rmDirectorChoices{grid-column:1/-1;min-width:0;margin:4px 0 10px}
 .rmDirectorChoicesTitle{display:block;margin-bottom:8px;font:650 13px system-ui;color:inherit}
 .rmDirectorChoiceGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:7px;max-width:660px}
 .rmDirectorChoiceGrid button{min-height:43px;padding:8px 7px;border:1px solid #b8d1c5;border-radius:10px;background:transparent;color:inherit;font:650 13px system-ui;cursor:pointer}
 .rmDirectorChoiceGrid button[aria-pressed="true"]{background:#087f5b!important;border-color:#087f5b!important;color:#fff!important}
 .rmDirectorChoiceGrid button:focus-visible{outline:3px solid #48ac8b;outline-offset:2px}
 .rmDirectorChoiceGrid.rmSlotAvailabilityGrid{grid-template-columns:repeat(auto-fill,minmax(104px,1fr));max-width:none;gap:9px}
 .rmDirectorChoiceGrid .rmSlotCard{display:flex!important;flex-direction:column;justify-content:center;align-items:center;gap:3px;min-height:66px!important;padding:8px 7px!important;border:1.5px solid #cbdad2!important;border-radius:12px!important;line-height:1.25!important}
 .rmSlotCard strong{font:800 16px/1.2 system-ui}
 .rmSlotCard small{display:flex;align-items:center;gap:4px;font:700 11px/1.2 system-ui;text-align:center}
 .rmSlotCard[data-level="open"]{background:#edf9f2!important;border-color:#79c99f!important;color:#086742!important}
 .rmSlotCard[data-level="limited"]{background:#fff6e5!important;border-color:#ecae46!important;color:#9a5d0e!important}
 .rmSlotCard[data-level="last"]{background:#fff0f0!important;border-color:#ee888d!important;color:#b62f39!important}
 .rmSlotCard[data-level="full"]{background:#f1f3f2!important;border-color:#d7e0db!important;color:#768078!important;opacity:.8}
 .rmSlotCard[data-level="unknown"]{background:#f5f8fa!important;border-color:#cedadf!important;color:#526671!important}
 .rmDirectorChoiceGrid .rmSlotCard[aria-pressed="true"]{outline:3px solid #087f5b!important;outline-offset:2px}
 .rmDirectorChoiceGrid .rmSlotCard:disabled{cursor:not-allowed}
 .rmDirectorSlotLegend{display:flex;flex-wrap:wrap;gap:6px 16px;margin:9px 0 4px;font:650 11px/1.5 system-ui;color:#526960}
 .rmDirectorSlotLegend span{white-space:nowrap}
 .rmSlotCard svg{width:13px!important;height:13px!important;flex:0 0 13px}
 @media(max-width:520px){.rmDirectorChoiceGrid.rmSlotAvailabilityGrid{grid-template-columns:repeat(3,minmax(0,1fr))}.rmDirectorChoiceGrid .rmSlotCard{min-height:62px!important}.rmSlotCard strong{font-size:14px}}
 .rmDirectorChoicesHint{font:12px/1.5 system-ui;opacity:.8;margin:5px 0 0}\n .rmDirectorFieldError{font:600 12px/1.4 system-ui;color:#a92727;margin:5px 0 0}\n .rmDirectorFieldError[hidden],.rmDirectorFeedbackMoved{display:none!important}
 @media(max-width:520px){.rmDirectorChoiceGrid{grid-template-columns:repeat(4,minmax(0,1fr))}.rmDirectorChoiceGrid button{min-height:44px}}`;
 document.head.append(style);
 const make=(label,id,input)=>{const wrap=document.createElement('div');wrap.id=id;wrap.className='rmDirectorChoices';const title=document.createElement('strong');title.className='rmDirectorChoicesTitle';title.textContent=label;const grid=document.createElement('div');grid.className='rmDirectorChoiceGrid';grid.setAttribute('role','group');grid.setAttribute('aria-label',label);const hint=document.createElement('p');hint.className='rmDirectorChoicesHint';wrap.append(title,grid,hint);input.closest('label')?.insertAdjacentElement('afterend',wrap);return {grid,hint}};
 const slot=make('Créneaux de réservation disponibles','rmDirectorTimeChoices',time);
 const pax=make('Choisir le nombre de couverts','rmDirectorGuestChoices',guests);
 slot.grid.classList.add('rmSlotAvailabilityGrid');
 const legend=document.createElement('div');legend.className='rmDirectorSlotLegend';
 legend.textContent='🟢 5+ places · 🟠 2–4 places · 🔴 1 place · ⚪ Complet / à vérifier';
 slot.grid.insertAdjacentElement('afterend',legend);

 let allSlots=false,allGuests=false;
 const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
 const mins=s=>{const m=/^(\d{2}):(\d{2})$/.exec(String(s||''));return m?Number(m[1])*60+Number(m[2]):NaN};
 const parisNow=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return {date:p.year+'-'+p.month+'-'+p.day,minute:Number(p.hour)*60+Number(p.minute)}};
 const button=(text,pressed,click)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-pressed',String(pressed));b.addEventListener('click',click);return b};
 const change=(input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))};
 function slotCapacity(at){
  const ready=Array.isArray(window.RestoSharedReservations)?Boolean(window.RestoSupabaseReady&&navigator.onLine!==false&&window.RestoSharedDataLoaded):true;
  const plan=window.TableStore?.get?.();
  const tables=plan?.tables||[];
  const duration=Number(window.ReservationEngine?.getDefaultDuration?.()||90);
  const interval=window.RestoBookingInterval?.(date.value,at,duration);
  const held=interval&&window.RestoBookingDraft?.occupied?.(tables.map(t=>t.number),...interval)||[];
  return window.RestoSlotCapacity?.evaluate({date:date.value,time:at,guests:Number(guests.value),duration,
   tables,reservations:window.RestoSharedReservations||[],groups:window.RestoFusion?.pairs?.()||[],
   heldNumbers:held.map(h=>h.number),ready:ready&&Boolean(tables.length)})||{state:'unknown',remaining:null,compatible:false};
 }
 function slotButton(at){
  const result=slotCapacity(at);
  const display=button('',time.value===at,()=>change(time,at));
  display.className='rmSlotCard';display.dataset.level=result.state;
  const hour=document.createElement('strong');hour.textContent=at;
  const capacity=document.createElement('small');
  if(result.state==='unknown')capacity.textContent='À vérifier';
  else if(result.remaining===0)capacity.textContent='Complet';
  else if(!result.compatible)capacity.textContent='Pas de table pour '+guests.value;
  else capacity.textContent=result.remaining+' place'+(result.remaining>1?'s':'')+' libre'+(result.remaining>1?'s':'');
  display.append(hour,capacity);
  // The chosen party must be accommodated on a compatible real table or fusion.
  // Do not forbid "unknown": the existing server-side booking path stays authoritative.
  display.disabled=result.state!=='unknown'&&!result.compatible;
  display.title=result.state==='unknown'?'Disponibilité à confirmer par le serveur':
   result.compatible?result.remaining+' places physiques indicatives — attribution confirmée à la validation':
   'Aucune table ou fusion disponible pour '+guests.value+' couverts';
  return display;
 }
 function drawSlots(){
  slot.grid.replaceChildren();
  const today=parisNow(),selected=date.value,shifts=Object.values(window.ReservationEngine?.getShiftsForDate?.(selected)||window.ReservationEngine?.getShifts?.()||{}).filter(x=>x.enabled);
  if(!selected){slot.hint.textContent='Choisissez d’abord une date.';return}
  const first=selected===today.date?Math.ceil(today.minute/15)*15:0,values=[];
  if(selected>=today.date)for(const shift of shifts){
   const start=mins(shift.start),end=mins(shift.end);
   if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)continue;
   for(let at=Math.ceil(Math.max(first,start)/15)*15;at<=end&&at<1440;at+=15){if(window.ReservationEngine?.isServiceOpen?.(selected,clock(at))!==false)values.push(clock(at));}
  }
  const unique=[...new Set(values)].sort();
  const visible=allSlots?unique:unique.slice(0,12);
  for(const at of visible)slot.grid.append(slotButton(at));
  if(unique.length>12)slot.grid.append(button(allSlots?'Réduire':`Voir les ${unique.length} créneaux`,false,()=>{allSlots=!allSlots;drawSlots()}));
  if(!unique.length)slot.hint.textContent='Aucun créneau ouvert pour cette date. Vérifiez les horaires du restaurant.';
  else slot.hint.textContent='Places physiques indicatives selon les tables, fusions et réservations. La disponibilité définitive est vérifiée lors de l’enregistrement.';
  if(time.value&&unique.includes(time.value)&&!visible.includes(time.value)&&!allSlots){slot.grid.prepend(slotButton(time.value))}
 }
 function drawGuests(){
  pax.grid.replaceChildren();
  const max=Math.max(1,Math.floor(window.TableStore?.get?.()?.tables?.reduce((sum,t)=>sum+Number(t.capacity||0),0)||54));
  const upto=allGuests?Math.min(max,20):Math.min(max,8);
  for(let n=1;n<=upto;n++)pax.grid.append(button(String(n),Number(guests.value)===n,()=>change(guests,String(n))));
  if(max>8)pax.grid.append(button(allGuests?'Moins':`9 à ${Math.min(max,20)}`,false,()=>{allGuests=!allGuests;drawGuests()}));
  pax.hint.textContent='Pour un groupe plus grand, saisissez directement le nombre dans le champ Couverts. La capacité des tables reste vérifiée.';
 }
 for(const event of ['input','change']){date.addEventListener(event,()=>{allSlots=false;drawSlots()});time.addEventListener(event,drawSlots);guests.addEventListener(event,()=>{drawGuests();drawSlots()})}
 for(const name of ['restomanager:hours','restomanager:supabase-snapshot','restomanager:v3-tables','restomanager:screen','restomanager:v3-change','restomanager:connection-state'])window.addEventListener(name,()=>{drawSlots();drawGuests()});

 // Inline, accessible validation: never move the guest's focus to a remote footer.
 const hotelRoom=document.getElementById('bookingHotelRoom');
 if(hotelRoom){hotelRoom.inputMode='numeric';hotelRoom.pattern='[0-9]+';hotelRoom.title='Numéro de chambre en chiffres uniquement (ex. 225)';}
 function inlineError(input,message){
  if(!input)return;
  let box=document.getElementById('rmDirectorError-'+input.id);
  if(!box){box=document.createElement('p');box.id='rmDirectorError-'+input.id;box.className='rmDirectorFieldError';box.setAttribute('role','alert');input.closest('label')?.append(box);}
  box.textContent=message||'';box.hidden=!message;
  if(message){input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',box.id)}
  else{input.removeAttribute('aria-invalid');if(input.getAttribute('aria-describedby')===box.id)input.removeAttribute('aria-describedby')}
 }
 const roomError='Numéro de chambre invalide : utilisez uniquement des chiffres (ex. 225).';
 for(const input of [date,time,guests,hotelRoom].filter(Boolean)){
  input.addEventListener('invalid',event=>{
   event.preventDefault();
   const message=input===hotelRoom?roomError:input===date?'Choisissez une date valide.':input===time?'Choisissez un créneau de réservation.':'Indiquez un nombre de couverts valide.';
   inlineError(input,message);
  });
  for(const ev of ['input','change'])input.addEventListener(ev,()=>inlineError(input,''));
 }
 if(hotelRoom)hotelRoom.addEventListener('input',()=>{if(hotelRoom.value&&!/^[0-9]+$/.test(hotelRoom.value))inlineError(hotelRoom,roomError)});
 const feedback=document.getElementById('bookingFeedback');
 if(feedback){
  const moveError=()=>{
   const msg=feedback.textContent.trim();
   feedback.classList.remove('rmDirectorFeedbackMoved');
   if(!msg||!/(invalide|incorrect|requis|hors service|impossible|refusée|doit contenir)/i.test(msg))return;
   const input=/(chambre)/i.test(msg)?hotelRoom:/(couvert|personne)/i.test(msg)?guests:/(date)/i.test(msg)?date:/(heure|horaire|créneau)/i.test(msg)?time:null;
   if(input){inlineError(input,msg);feedback.classList.add('rmDirectorFeedbackMoved')}
  };
  new MutationObserver(moveError).observe(feedback,{childList:true,characterData:true,subtree:true});
 }
 setInterval(drawSlots,60000);
 drawSlots();drawGuests();
})();

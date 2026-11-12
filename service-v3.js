'use strict';
(function(){
const KEY='restomanager_rush_v1',RES='restomanager_reservations',DEFAULT={percent:60,window:60,step:15};
const $=id=>document.getElementById(id);
const rushNode=(tag,className,content)=>{const element=document.createElement(tag);if(className)element.className=className;if(content!==undefined)element.textContent=String(content);return element};
const rushStatuses={waiting:new Set(['reserved','confirmed','late','arrived']),arrived:new Set(['seated'])};
function isActualArrival(r,date){
 return !!r&&r.date===date&&typeof r.time==='string'&&
  ReservationEngine.isBlocking(r);
}
const actualParisParts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function arrivalMinute(r,date){
 if(r&&rushStatuses.arrived.has(r.status)&&r.seatedAt){
  const value=new Date(r.seatedAt);
  if(Number.isFinite(value.getTime())){
   const parts=Object.fromEntries(actualParisParts.formatToParts(value).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
   if(parts.year+'-'+parts.month+'-'+parts.day===date)return Number(parts.hour)*60+Number(parts.minute);
  }
 }
 return mins(r?.time);
}
function rushLocalDate(){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const values=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 return values.year+'-'+values.month+'-'+values.day;
}
function rushArrivalBreakdown(date,start,end,all,nowMinutes=currentMinutes(),today=rushLocalDate()){
 const tally={planned:0,upcoming:0,late:0,arrived:0};
 for(const r of all){
  const scheduled=arrivalMinute(r,date);
  if(!relevant(r,date)||!Number.isFinite(scheduled)||scheduled<start||scheduled>=end)continue;
  const guests=Math.max(0,Number(r.guests)||0);
  if(rushStatuses.arrived.has(r.status))tally.arrived+=guests;
  else if(rushStatuses.waiting.has(r.status)){
   if(r.status==='late'||date<today||(date===today&&scheduled<nowMinutes))tally.late+=guests;
   else tally.upcoming+=guests;
  }
 }
 tally.waiting=tally.upcoming+tally.late;
 tally.planned=tally.waiting+tally.arrived;
 return tally;
}
const mins=s=>Number(String(s).slice(0,2))*60+Number(String(s).slice(3,5));
const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
function settings(){try{const v=JSON.parse(localStorage.getItem(KEY)||'{}');return {percent:Number.isInteger(Number(v.percent))&&Number(v.percent)>=40&&Number(v.percent)<=90&&Number(v.percent)%5===0?Number(v.percent):60,window:60,step:15}}catch(_){return {...DEFAULT}}}
function capacity(){return TableStore.get().tables.reduce((sum,t)=>sum+Number(t.capacity||0),0)}
function service(time){const m=mins(time);return Object.values(ReservationEngine.getShifts()).find(s=>s.enabled&&m>=mins(s.start)&&m<=mins(s.end))||null}
function relevant(r,date){return isActualArrival(r,date)}
function windowFor(time){const shift=service(time);if(!shift)return null;const start=Math.max(mins(shift.start),Math.floor(mins(time)/60)*60),end=Math.min(mins(shift.end)+1,start+settings().window);return {start,end,shift}}
function count(date,start,end,all,ignoreId){return all.filter(r=>r.id!==ignoreId&&relevant(r,date)&&arrivalMinute(r,date)>=start&&arrivalMinute(r,date)<end).reduce((n,r)=>n+Math.max(0,Number(r.guests)||0),0)}
function evaluate(candidate,all,ignoreId){const win=windowFor(candidate.time);if(!win)return {blocked:false,invalid:true};const max=capacity(),limit=Math.max(1,Math.ceil(max*settings().percent/100));const current=count(candidate.date,win.start,win.end,all,ignoreId),after=current+Number(candidate.guests||0);return {blocked:after>limit,current,after,limit,max,start:win.start,end:win.end,range:clock(win.start)+' – '+clock(win.end),percent:max?Math.round(after/max*100):0}}
function suggestions(candidate,all,ignoreId){
 const shift=service(candidate.time);if(!shift)return [];
 const low=mins(shift.start),high=mins(shift.end),base=mins(candidate.time),list=[];
 // Exclude past alternatives only for the current restaurant-local date.
 // Future dates can legitimately include earlier clock times.
 const nowParts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
 const now=Object.fromEntries(nowParts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 const localToday=now.year+'-'+now.month+'-'+now.day;
 const floor=candidate.date===localToday?Number(now.hour)*60+Number(now.minute):-1;
 // Check actual eligible tables, including supported fusions, instead of
 // suggesting a "less busy" time that has no bookable table.
 const choices=ReservationEngine.rankedTableChoices(TableStore.get().tables,window.RestoFusion?.pairs()||[],Number(candidate.guests)||1);
 for(let delta=30;delta<=120;delta+=30){
  for(const at of [base+delta,base-delta]){
   if(at<low||at>high||at<=floor||list.some(x=>x.at===clock(at)))continue;
   const time=clock(at),load=evaluate({...candidate,time},all,ignoreId);
   if(load.blocked||load.invalid)continue;
   const interval=window.RestoBookingInterval?.(candidate.date,time,candidate.duration||ReservationEngine.getDefaultDuration());
   const free=choices.find(choice=>{
    if(interval&&window.RestoBookingDraft?.occupied(choice.numbers,...interval).length)return false;
    return ReservationEngine.validate({...candidate,time,tables:choice.numbers},all,ignoreId).valid;
   });
   if(!free)continue;
   list.push({at:time,covers:load.current,range:load.range,delta:Math.abs(delta),tables:free.numbers,remaining:Math.max(0,load.limit-load.current-Number(candidate.guests||0))});
  }
 }
 return list.sort((a,b)=>a.delta-b.delta||a.covers-b.covers).slice(0,3);
}
function progress(data){
 const bar=document.createElement('div');bar.className='rushProgress';
 const limit=Math.max(1,Number(data.limit)||1),covers=Math.max(0,Number(data.after)||0),ratio=covers/limit;
 bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(limit));
 bar.setAttribute('aria-valuenow',String(Math.min(covers,limit)));
 bar.setAttribute('aria-valuetext',covers+' arrivées prévues pour une limite conseillée de '+limit);
 bar.setAttribute('aria-label','Charge des arrivées par rapport à la limite conseillée');
 const fill=document.createElement('div');fill.className='rushProgressFill'+(ratio>1?' full':ratio>=.8?' busy':'');
 fill.style.width=Math.min(100,ratio*100)+'%';
 bar.append(fill);return bar;
}
// The service dashboard follows the actual configured service hours without a manual selector.
const parisClock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const currentMinutes=()=>{const parts=parisClock.formatToParts(new Date());const h=parts.find(p=>p.type==='hour')?.value||'0';const m=parts.find(p=>p.type==='minute')?.value||'0';return Number(h)*60+Number(m)};
let lastRushDashboard=null;
let rushHelpExpanded=false;
function dashboard(date,all){
 const target=$('rushDashboard');if(!target)return;
 lastRushDashboard={date,all};
 target.replaceChildren();
 const shifts=Object.entries(ReservationEngine.getShifts()).filter(([,s])=>s.enabled);
 const heading=document.createElement('div');heading.className='rushDashHead';
 heading.innerHTML='<div><span class="rushSectionEyebrow">EN DIRECT · RESTAURANT</span><h2 class="serviceIconHeading"><i data-lucide="activity" aria-hidden="true"></i><span>Suivi des arrivées</span></h2></div>';
 const help=rushNode('button','rmArrivalHelpButton');help.type='button';help.setAttribute('aria-label','Comprendre le suivi des arrivées');
 help.setAttribute('aria-expanded',String(rushHelpExpanded));help.title='À quoi sert le suivi des arrivées ?';
 const helpIcon=rushNode('i');helpIcon.dataset.lucide='info';helpIcon.setAttribute('aria-hidden','true');
 help.append(helpIcon);heading.append(help);
 help.addEventListener('click',()=>{rushHelpExpanded=!rushHelpExpanded;dashboard(date,all)});
 if(!window.RestoReception){
  const gear=rushNode('button','rushSettingsShortcut');gear.type='button';
  gear.setAttribute('aria-label','Régler la limite des arrivées');
  gear.title='Régler la limite des arrivées';
  const icon=rushNode('i');icon.dataset.lucide='settings';icon.setAttribute('aria-hidden','true');
  gear.append(icon);
  gear.addEventListener('click',async()=>{
   await window.RestoScreens?.request?.('administration');
   if(window.RestoScreens?.current?.()!=='administration')return;
   const group=$('manageHours');if(group)group.open=true;
   const target=$('rushArrivalSettings');if(!target)return;
   target.scrollIntoView({behavior:'smooth',block:'center'});
   const slider=$('rushArrivalPercent');if(slider)slider.focus({preventScroll:true});
  });
  heading.append(gear);
 }
 target.append(heading);
 if(rushHelpExpanded){
  const explanation=rushNode('div','rmArrivalHelpText');explanation.setAttribute('role','note');
  explanation.append(
   rushNode('strong','','À quoi sert le suivi des arrivées ?'),
   rushNode('p','','Anticipez les arrivées et pilotez votre service en temps réel. Cet outil compare les clients attendus aux clients déjà installés pour faciliter l’organisation de l’accueil et de la salle.')
  );
  const benefits=rushNode('div','rmArrivalHelpBenefits');
  const items=[
   ['calendar-clock','Anticiper les arrivées','Préparer l’accueil et le placement des clients.'],
   ['activity','Suivre l’affluence','Identifier les périodes de forte activité.'],
   ['users','Adapter le service','Organiser les équipes selon les réservations et l’occupation réelle.'],
   ['clock-alert','Repérer les retards','Garder une vue sur les clients encore attendus.']
  ];
  for(const [iconName,label,description] of items){
   const line=rushNode('p','rmArrivalHelpBenefit');
   const icon=rushNode('i','rmArrivalHelpIcon');icon.dataset.lucide=iconName;icon.setAttribute('aria-hidden','true');
   const content=rushNode('span');content.append(rushNode('strong','',label+' — '),document.createTextNode(description));
   line.append(icon,content);benefits.append(line);
  }
  explanation.append(benefits,
   rushNode('p','','Les informations évoluent avec les réservations, les installations et les départs enregistrés.'),
   rushNode('p','','Objectif : mieux coordonner la réception et le restaurant, fluidifier l’accueil et améliorer la qualité du service.'));
  target.append(explanation);
  window.lucide?.createIcons?.({nodes:[explanation]});
  // Local Lucide replaces <i> with <svg>; enforce fixed dimensions after rendering.
  explanation.querySelectorAll('.rmArrivalHelpIcon').forEach(svg=>{
   svg.setAttribute('width','18');svg.setAttribute('height','18');
   svg.style.cssText='width:18px!important;height:18px!important;min-width:18px;max-width:18px;flex:0 0 18px;display:block;align-self:flex-start;margin-top:2px;color:#20765b';
  });
 }
 if(window.lucide?.createIcons)window.lucide.createIcons({nodes:[heading]});
 const windows=[];
 for(const [name,s] of shifts){
  for(let at=mins(s.start);at<=mins(s.end);at+=60){
   const end=Math.min(at+60,mins(s.end)+1);
   if(end>at)windows.push({start:at,end,name});
  }
 }
 if(!windows.length){target.append('Aucun service ouvert.');return}
 windows.sort((a,b)=>a.start-b.start);
 const current=currentMinutes();
 let preferred=windows.findIndex(w=>current>=w.start&&current<w.end);
 if(preferred<0)preferred=windows.findIndex(w=>w.start>=current);
 const currentWindow=windows[preferred>=0?preferred:windows.length-1];
 const label=document.createElement('div');
 label.className='rushAutomaticSlot';
 label.setAttribute('aria-label','Créneau horaire sélectionné automatiquement');
 const serviceName=currentWindow.name==='lunch'?'Midi':currentWindow.name==='dinner'?'Soir':currentWindow.name;
 label.textContent=serviceName+' · '+clock(currentWindow.start)+' – '+clock(currentWindow.end);
 const automatic=document.createElement('span');automatic.className='rushAutomaticTag';automatic.textContent='Automatique';
 label.append(automatic);target.append(label);
 const result=document.createElement('div');result.className='rushDashContent';target.append(result);
 function update(){const w=currentWindow,max=capacity(),limit=Math.max(1,Math.ceil(max*settings().percent/100)),breakdown=rushArrivalBreakdown(date,w.start,w.end,all),covers=breakdown.planned,data={max,limit,after:covers,blocked:covers>=limit};result.replaceChildren();const summary=document.createElement('div');summary.className='rushLoadSummary';
 const numbers=document.createElement('div');numbers.className='rushLoadNumbers';
 const loadLabel=rushNode('span','rushLoadLabel');const loadIcon=rushNode('i','serviceInlineIcon');loadIcon.dataset.lucide='activity';loadIcon.setAttribute('aria-hidden','true');loadLabel.append(loadIcon,rushNode('span','', 'Arrivées actives '+clock(w.start)+' – '+clock(w.end)+' · Seuil conseillé : '+limit+' couverts'));numbers.append(rushNode('strong','rmSlotArrivalsValue',covers+' / '+limit),loadLabel);
 const level=covers>limit?'Pic d’arrivées · vigilance':covers===limit?'Seuil d’arrivées atteint':covers>=limit*.8?'Arrivées nombreuses':covers===0?'Aucune arrivée active sur ce créneau':'Arrivées sous le seuil';
 const status=rushNode('span','rushLoadStatus'+(covers>=limit?' full':covers>=limit*.8?' busy':''),level);
 summary.append(numbers,status);
 function rushBreakdownLabel(iconName,label){const line=rushNode('span','rushBreakdownLabel');const icon=rushNode('i','serviceInlineIcon');icon.dataset.lucide=iconName;icon.setAttribute('aria-hidden','true');line.append(icon,rushNode('span','',label));return line;}
 const arrivalDetails=document.createElement('div');arrivalDetails.className='rushArrivalBreakdown rmForecastTwoStatuses';
 function metric(value,label,iconName){
  const item=rushNode('div','rushArrivalBreakdownItem');
  const icon=rushNode('i','rmMetricIcon');icon.dataset.lucide=iconName;icon.setAttribute('aria-hidden','true');
  const words=rushNode('div','rmForecastMetricText');
  words.append(rushNode('strong','',value),rushNode('span','',label));
  item.append(icon,words);return item;
 }
 arrivalDetails.append(metric(breakdown.waiting,'Encore attendus sur ce créneau','calendar-clock'),metric(breakdown.arrived,'Encore installés de ce créneau (passages inclus)','armchair'));
 result.append(summary,arrivalDetails,progress(data));window.lucide?.createIcons?.({nodes:[result]});
  // Clarify the distinction between the selected hour and all reservations for the day.
  const daily=all.filter(r=>relevant(r,date));
  const dailyGuests=daily.reduce((total,r)=>total+Math.max(0,Number(r.guests)||0),0);
  const periodLabel=rushNode('p','rushHint rushArrivalsHint',
   'Arrivées actives '+clock(w.start)+' – '+clock(w.end)+' : '+covers+' couvert(s), passages inclus, clients déjà partis exclus. Total des couverts encore attendus ou installés du jour : '+dailyGuests+'.');
  result.append(periodLabel);
  // Live service load includes walk-ins and reservations installed at other times.
  const installedNow=all.filter(r=>r.date===date&&r.status==='seated');
  const installedCovers=installedNow.reduce((total,r)=>total+Math.max(0,Number(r.guests)||0),0);
  const installedTables=new Set(installedNow.flatMap(r=>Array.isArray(r.tables)?r.tables:[]));
  const waitingNow=all.filter(r=>r.date===date&&rushStatuses.waiting.has(r.status)).reduce((total,r)=>total+Math.max(0,Number(r.guests)||0),0);
  const isToday=date===rushLocalDate(),nowMinute=currentMinutes();
  const waitingSoon=all.filter(r=>r.date===date&&rushStatuses.waiting.has(r.status)&&
   (isToday?mins(r.time)<=nowMinute+60:mins(r.time)>=w.start&&mins(r.time)<w.end))
   .reduce((total,r)=>total+Math.max(0,Number(r.guests)||0),0);
  const toHandle=installedCovers+waitingSoon;
 const hint=rushNode('p','rushHint rushArrivalsHint',breakdown.late
  ?breakdown.late+' couvert(s) en retard, déjà inclus dans les attendus. '+(covers>=limit?'Le seuil d’arrivées de cette heure est atteint.':'Vérifiez leur statut avec l’équipe.')
  :covers>=limit?'Limite conseillée atteinte : privilégiez un autre horaire, même si des tables restent libres.'
  :covers>=limit*.8?'Les arrivées approchent de la limite conseillée. Surveillez les nouvelles réservations.'
  :'Les passages encore installés sur ce créneau sont inclus. Une table libérée retire immédiatement ses couverts ; le seuil conseillé n’est pas la capacité du restaurant.');
 result.append(hint);
 // An hour change must not hide guests who are still awaiting arrival.
 // Keep this operational warning separate from the current hour's forecast.
 if(date===rushLocalDate()){
  const overdue=all.filter(r=>relevant(r,date)&&rushStatuses.waiting.has(r.status)&&mins(r.time)<currentMinutes()&&mins(r.time)<w.start);
  const overdueCovers=overdue.reduce((total,r)=>total+Math.max(0,Number(r.guests)||0),0);
  if(overdueCovers){
   const carried=rushNode('div','rmArrivalOverdueAlert');carried.setAttribute('role','alert');
   const warnIcon=rushNode('i');warnIcon.dataset.lucide='alert-triangle';warnIcon.setAttribute('aria-hidden','true');
   const words=rushNode('div','rmArrivalOverdueWords');
   words.append(rushNode('strong','','Retards à traiter · '+overdueCovers+' couvert'+(overdueCovers>1?'s':'')),
    rushNode('p','','Des réservations des créneaux précédents restent attendues. Vérifiez leur statut avant de nouvelles arrivées.'));
   carried.append(warnIcon,words);
   const action=rushNode('button','rmArrivalOverdueAction','Voir les réservations');
   action.type='button';action.addEventListener('click',()=>{window.RestoScreens?.request?.('reservations');});
   carried.append(action);
   result.append(carried);
   window.lucide?.createIcons?.({nodes:[carried]});
  }
 }
 const isCurrentDay=date===rushLocalDate(),nowClock=currentMinutes();
 const queryMinutes=isCurrentDay?Math.max(w.start,nowClock+1):w.start;
 const canQuoteAvailability=!isCurrentDay||queryMinutes<w.end;
 const queryTime=clock(queryMinutes);
 // This simulation is a separate operational block, not part of arrival forecasts.
 const occupancy=$('currentOccupancy');
 if(occupancy){
  let panel=$('rmImmediateAvailability');
  if(!panel){
   panel=rushNode('section','rmImmediateAvailability');
   panel.id='rmImmediateAvailability';
   panel.setAttribute('aria-label','Disponibilité calculée pour une nouvelle réservation');
   occupancy.insertAdjacentElement('afterend',panel);
  }
  const heading=rushNode('div','rmImmediateHeading'),title=rushNode('h2','serviceIconHeading');
  const icon=rushNode('i');icon.dataset.lucide='zap';icon.setAttribute('aria-hidden','true');
  title.append(icon,rushNode('span','','Disponibilité immédiate'));
  heading.append(rushNode('span','rushSectionEyebrow','DISPONIBILITÉ · NOUVELLE RÉSERVATION'),title,
    rushNode('p','','Tables compatibles pour une nouvelle réservation, indépendamment des indicateurs d’activité.'));
  const state=canQuoteAvailability?window.RestoTablePressure?.availability({date,time:queryTime,guests:2,duration:90,tables:TableStore.get().tables,reservations:all,holds:window.RestoDraftHolds||[]}):null;
  const answer=rushNode('div','rmImmediateResult'),question=rushNode('div','rmImmediateQuestion');
  const people=rushNode('i');people.dataset.lucide='users';people.setAttribute('aria-hidden','true');
  question.append(people,rushNode('span','','Pour 2 couverts à '+(canQuoteAvailability?queryTime:'un prochain créneau')));
  const remaining=state?.valid?state.remaining:null;
  const count=remaining===null?'Disponibilités à vérifier sur un créneau ouvert':remaining===0?'Aucune table compatible disponible':remaining+' table'+(remaining>1?'s':'')+' compatible'+(remaining>1?'s':'')+' disponible'+(remaining>1?'s':'');
  const resultBox=rushNode('div','rmImmediateAnswer'+(remaining===0?' rmImmediateFull':''));
  const grid=rushNode('i');grid.dataset.lucide='layout-grid';grid.setAttribute('aria-hidden','true');
  resultBox.append(grid,rushNode('strong','rmImmediateCount',count));
  answer.append(question,resultBox);
  panel.replaceChildren(heading,answer);
  window.lucide?.createIcons?.({nodes:[panel]});
 }

 }update()}
setInterval(()=>{if(lastRushDashboard&&document.visibilityState!=='hidden')dashboard(lastRushDashboard.date,lastRushDashboard.all)},60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&lastRushDashboard)dashboard(lastRushDashboard.date,lastRushDashboard.all)});
function confirm(candidate,all,ignoreId){const data=evaluate(candidate,all,ignoreId);if(!data.blocked)return Promise.resolve(true);return new Promise(resolve=>{const overlay=document.createElement('div');overlay.className='rushOverlay';const card=document.createElement('section');card.className='rushModal';card.setAttribute('role','alertdialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-label','Confirmation du créneau chargé');const title=document.createElement('h2');title.textContent='Forte affluence à '+candidate.time;const intro=document.createElement('p');intro.textContent='Le seuil conseillé des arrivées est dépassé sur ce créneau. Ce seuil aide à répartir l’accueil, mais ce n’est pas la capacité maximale de la salle. Proposez si possible un autre horaire ; une confirmation exceptionnelle est possible si une table compatible reste libre.';const figures=document.createElement('div');figures.className='rushFigures';const first=document.createElement('div'),second=document.createElement('div');first.innerHTML='<strong>'+data.current+'</strong><span>Couverts déjà attendus entre '+data.range+'</span>';second.innerHTML='<strong>'+data.limit+'</strong><span>Seuil conseillé d’arrivées sur une heure</span>';figures.append(first,second);const next=document.createElement('p');next.className='rushAfter';next.textContent='Avec cette réservation : '+data.after+' couverts sur cette période.';const alternatives=document.createElement('div');alternatives.className='rushAlternatives';const heading=document.createElement('strong');heading.textContent='Horaires moins chargés à proposer';alternatives.append(heading);const list=suggestions(candidate,all,ignoreId);if(list.length){for(const item of list){
 const button=document.createElement('button');
 button.type='button';button.className='rushAlternativeChoice';
 const time=document.createElement('strong');time.textContent=item.at;
 const detail=document.createElement('span');detail.textContent=item.covers+' arrivée(s) déjà prévues · table compatible à vérifier';
 const arrow=document.createElement('span');arrow.className='rushAlternativeArrow';arrow.textContent='Choisir cette heure →';
 button.append(time,detail,arrow);
 button.addEventListener('click',()=>done({suggestedTime:item.at}));
 alternatives.append(button);
}}else{const p=document.createElement('p');p.textContent='Aucun horaire moins chargé disponible à proximité pour cette table.';alternatives.append(p)}const question=document.createElement('p');question.textContent='Voulez-vous vraiment conserver '+candidate.time+' malgré cette forte affluence ?';const actions=document.createElement('div');actions.className='rushActions';const cancel=document.createElement('button'),accept=document.createElement('button');cancel.type=accept.type='button';cancel.textContent='Retour';accept.textContent='Confirmer exceptionnellement';accept.className='rushAccept';actions.append(cancel,accept);card.append(title,intro,figures,progress(data),next,alternatives,question,actions);overlay.append(card);document.body.append(overlay);const prior=document.activeElement;function done(value){document.removeEventListener('keydown',key,true);overlay.remove();prior?.focus?.();resolve(value)}function key(e){if(e.key==='Escape'){e.preventDefault();done(false)}else if(e.key==='Tab'){if(e.shiftKey&&document.activeElement===cancel){e.preventDefault();accept.focus()}else if(!e.shiftKey&&document.activeElement===accept){e.preventDefault();cancel.focus()}}}document.addEventListener('keydown',key,true);cancel.addEventListener('click',()=>done(false));accept.addEventListener('click',()=>done(true));cancel.focus()})}
function setup(){
 const section=$('restaurantShifts');if(!section)return;
 const box=rushNode('div','rushSettings');box.id='rushArrivalSettings';
 const header=rushNode('div','rushSettingsHeader');
 const h=rushNode('h3','','Répartition des arrivées');
 const current=rushNode('output','rushSettingsValue');current.id='rushArrivalValue';current.htmlFor='rushArrivalPercent';
 header.append(h,current);
 const p=rushNode('p','','Définissez le nombre d’arrivées conseillé sur une heure. Au-delà, RestoManager demande une confirmation et suggère des horaires moins chargés.');
 const label=rushNode('label','rushSettingsLabel','Limite conseillée par heure');label.htmlFor='rushArrivalPercent';
 const slider=rushNode('input','rushPercentSlider');slider.id='rushArrivalPercent';slider.type='range';
 slider.min='40';slider.max='90';slider.step='5';slider.value=String(settings().percent);
 slider.setAttribute('aria-describedby','rushArrivalHint');
 const markers=rushNode('div','rushSliderMarkers');
 markers.append(rushNode('span','','40 %'),rushNode('span','','90 %'));
 const hint=rushNode('p','rushHint rushSettingsHint');hint.id='rushArrivalHint';
 function show(){
  const percent=Number(slider.value),max=capacity(),limit=Math.max(1,Math.ceil(max*percent/100));
  current.value=percent+' %';current.textContent=percent+' %';
  slider.style.setProperty('--rush-slider-progress',((percent-40)/50*100)+'%');
  hint.textContent='Jusqu’à '+limit+' arrivées conseillées sur une heure, pour '+max+' places. Au-delà, confirmation manuelle et suggestions de créneaux.';
 }
 slider.addEventListener('input',show);
 slider.addEventListener('change',()=>{
  localStorage.setItem(KEY,JSON.stringify({percent:Number(slider.value)}));
  show();window.dispatchEvent(new Event('restomanager:v3-change'));
 });
 show();box.append(header,p,label,slider,markers,hint);section.append(box);
}
window.RestoRush={evaluate,suggestions,confirm,dashboard,settings,capacity,count,windowFor};setup();
})();
(function(){const k=document.getElementById('kpis');if(k&&!document.getElementById('rushDashboard')){const section=document.createElement('section');section.id='rushDashboard';section.className='rushDashboard';section.setAttribute('aria-label','Affluence des réservations');k.after(section)}})();
'use strict';
(function(){
const $=id=>document.getElementById(id);
// Restaurant-local service date: tables and reservations use the same Paris
// calendar day from midnight. Do not reintroduce the previous-day 01:00 offset.
const bookingToday=()=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const p=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day};
const today=()=>bookingToday();
const bookingNowTime=()=>new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).replace(/\s/g,'');
const bookingMinuteOf=time=>{const match=/^(\d{2}):(\d{2})$/.exec(String(time||''));return match?Number(match[1])*60+Number(match[2]):NaN};
const bookingClock=minute=>String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
const nextBookingDate=date=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)};
// Booking forms may be opened at ANY time; the selected time is the guest's arrival,
// never the clock time at which staff are entering the reservation.
function bookingArrivalDefault(date=bookingToday()){
 const nowDate=bookingToday(),nowMinute=bookingMinuteOf(bookingNowTime());
// Find the next arrival in a genuinely open service, including weekend rules.
 let target=date<nowDate?nowDate:date;
 for(let attempt=0;attempt<8;attempt++,target=nextBookingDate(target)){
  const shifts=Object.values(ReservationEngine.getShiftsForDate(target))
   .filter(shift=>shift.enabled&&Number.isFinite(bookingMinuteOf(shift.start))&&Number.isFinite(bookingMinuteOf(shift.end)))
   .map(shift=>({start:bookingMinuteOf(shift.start),end:bookingMinuteOf(shift.end)}))
   .filter(shift=>shift.end>=shift.start).sort((a,b)=>a.start-b.start);
  const earliest=target===nowDate?Math.ceil(nowMinute/15)*15:0;
  for(const shift of shifts){
   const candidate=Math.ceil(Math.max(shift.start,earliest)/15)*15;
   if(candidate<=shift.end&&candidate<24*60&&ReservationEngine.isServiceOpen(target,bookingClock(candidate)))
    return {date:target,time:bookingClock(candidate)};
  }
 }
 return {date:target,time:'19:00'};
}

let date=today();
function refreshHeaderDate(){
 const heading=$('serviceDate');
 if(heading)heading.textContent=new Date(date+'T12:00:00Z').toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long',year:'numeric'});
}
// Re-evaluate after midnight, focus return, and snapshots. Never leave the
// header on one day while the tables and counters remain on the previous day.
function syncServiceDay(){
 const next=today(),changed=next!==date;
 if(changed){date=next;bookings=readReservations().filter(r=>r.date===date);}
 refreshHeaderDate();
 if(changed)render();
}
refreshHeaderDate();
setInterval(syncServiceDay,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncServiceDay()});
let plan,bookings;try{plan=TableStore.get();const raw=JSON.parse(localStorage.getItem('restomanager_reservations')||'[]');bookings=ReservationEngine.normalizeReservations(raw).filter(r=>r.date===date)}catch(e){$('tableGrid').textContent='Données indisponibles : '+e.message;return}
const rooms=plan.rooms||[];rooms.forEach(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.id==='main'&&['Salle à configurer','Salle principale'].includes(r.name)?'Salle principale':r.name;o.title=r.name;$('roomFilter').append(o)});
let filter='all',selected=null;
const tableSort=document.createElement('select');tableSort.id='tableSort';tableSort.setAttribute('aria-label','Trier les tables');for(const [value,label] of [['number-asc','N° croissant'],['number-desc','N° décroissant'],['capacity-asc','Places croissantes'],['capacity-desc','Places décroissantes'],['status','Statut']]){const option=document.createElement('option');option.value=value;option.textContent=label;tableSort.append(option)}
// Keep the native selection as source of truth; use a compact, accessible sort menu.
tableSort.hidden=true;
const sortMenu=document.createElement('details');sortMenu.className='tableSortMenu';
const sortTrigger=document.createElement('summary');sortTrigger.className='tableSortTrigger';
sortTrigger.setAttribute('aria-label','Trier les tables');
const sortIcon=document.createElement('i');sortIcon.setAttribute('data-lucide','arrow-up-down');
const sortText=document.createElement('span');sortText.textContent='Trier';
sortTrigger.append(sortIcon,sortText);
const sortPopover=document.createElement('div');sortPopover.className='tableSortPopover';
const sortBackdrop=document.createElement('button');sortBackdrop.type='button';sortBackdrop.className='tableSortBackdrop';
sortBackdrop.setAttribute('aria-label','Fermer les options de tri');
sortBackdrop.addEventListener('click',()=>{sortMenu.open=false;sortTrigger.focus()});
const sortOptions=document.createElement('div');sortOptions.className='tableSortOptions';
sortOptions.setAttribute('role','group');sortOptions.setAttribute('aria-label','Options de tri');
const sortTitle=document.createElement('div');sortTitle.className='tableSortOptionsHeader';
sortTitle.append(node('strong','','Trier les tables'));
const sortClose=document.createElement('button');sortClose.type='button';sortClose.className='tableSortClose';
sortClose.textContent='✕';sortClose.setAttribute('aria-label','Fermer les options de tri');
sortClose.addEventListener('click',()=>{sortMenu.open=false;sortTrigger.focus()});
sortTitle.append(sortClose);sortOptions.append(sortTitle);
const sortButtons=[];
for(const option of Array.from(tableSort.options)){
 const choice=document.createElement('button');choice.type='button';choice.className='tableSortOption';
 choice.textContent=option.textContent;choice.dataset.value=option.value;
 choice.addEventListener('click',()=>{
  tableSort.value=option.value;
  tableSort.dispatchEvent(new Event('change',{bubbles:true}));
  sortMenu.open=false;
  sortTrigger.focus();
 });
 sortButtons.push(choice);sortOptions.append(choice);
}
function syncSortButtons(){
 for(const button of sortButtons){const selected=button.dataset.value===tableSort.value;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected))}
 sortTrigger.title='Tri actuel : '+tableSort.options[tableSort.selectedIndex]?.textContent;
}
sortPopover.append(sortBackdrop,sortOptions);
sortPopover.hidden=true;
sortPopover.setAttribute('role','dialog');
sortPopover.setAttribute('aria-label','Trier les tables');
sortMenu.append(sortTrigger);
// This layer must live under <body>, not inside the transformed tables screen.
// Otherwise mobile fixed positioning is clipped and moves when the page scrolls.
document.body.append(sortPopover);
const toolsRow=document.createElement('div');toolsRow.className='tableToolbar';
const roomControl=document.querySelector('#tables .roomFilterLabel');
if(roomControl)toolsRow.append(roomControl);
toolsRow.append(sortMenu);$('filters').classList.add('tableFiltersToolbar');
$('filters').parentNode.insertBefore(toolsRow,$('filters'));
tableSort.addEventListener('change',()=>{syncSortButtons();render()});
function closeSortMenu(){
 sortMenu.open=false;
 sortPopover.hidden=true;
 document.body.classList.remove('restoSortOpen');
}
function positionSortPopover(){
 const rect=sortTrigger.getBoundingClientRect();
 sortPopover.style.setProperty('--sort-anchor-top',Math.round(rect.bottom+8)+'px');
 sortPopover.style.setProperty('--sort-anchor-right',Math.max(12,Math.round(innerWidth-rect.right))+'px');
}
sortMenu.addEventListener('toggle',()=>{
 const isOpen=sortMenu.open;
 sortPopover.hidden=!isOpen;
 document.body.classList.toggle('restoSortOpen',isOpen);
 if(isOpen){positionSortPopover();sortOptions.querySelector('.tableSortOption.selected')?.focus({preventScroll:true})}
});
window.addEventListener('resize',()=>{if(sortMenu.open)positionSortPopover()});
window.addEventListener('restomanager:screen',event=>{if(event.detail!=='tables')closeSortMenu()});
document.addEventListener('click',event=>{
 if(sortMenu.open&&!sortMenu.contains(event.target)&&!sortPopover.contains(event.target))closeSortMenu();
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&sortMenu.open){event.preventDefault();closeSortMenu();sortTrigger.focus()}
});
syncSortButtons();

const detailNode=$('detail');
const modal=document.createElement('div');modal.className='tableDetailModal';modal.hidden=true;
modal.innerHTML='<div class="tableDetailBackdrop"></div><section class="tableDetailSheet" role="dialog" aria-modal="true" aria-labelledby="tableDetailHeading" tabindex="-1"><div class="tableDetailSheetHeader"><div><small>GESTION DU SERVICE</small><h2 id="tableDetailHeading">Détails de la table</h2></div><button class="tableDetailClose" type="button" aria-label="Fermer les détails">✕</button></div><div class="tableDetailSheetBody"></div></section>';
document.body.append(modal);modal.querySelector('.tableDetailSheetBody').append(detailNode);
let returnFocus=null;
function closeTable(){if(modal.hidden)return;modal.querySelectorAll('.tableCompactMoreOverlay').forEach(overlay=>{overlay.hidden=true});modal.querySelectorAll('.tableCompactMore[open]').forEach(menu=>{menu.open=false});modal.hidden=true;document.body.classList.remove('tableDetailOpen');returnFocus?.focus();returnFocus=null}
function openTable(t,s,trigger){selected=t.number;detail(t,s);returnFocus=trigger;modal.querySelector('#tableDetailHeading').textContent=s.booking&&s.booking.tables.length>1?'Tables '+s.booking.tables.join(' + '):'Table '+t.number;modal.hidden=false;document.body.classList.add('tableDetailOpen');modal.querySelector('.tableDetailClose').focus()}
modal.querySelector('.tableDetailClose').addEventListener('click',closeTable);
modal.querySelector('.tableDetailBackdrop').addEventListener('click',closeTable);
document.addEventListener('keydown',e=>{if(modal.hidden)return;if(e.key==='Escape'){const menu=modal.querySelector('.tableCompactMore[open]');if(menu){e.preventDefault();menu.open=false;menu.querySelector('summary')?.focus();return}e.preventDefault();closeTable()}if(e.key==='Tab'){const controls=[...modal.querySelectorAll('button:not([disabled])')];if(!controls.length)return;const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});

const active=r=>ReservationEngine.isBlocking(r);
const priority={seated:4,arrived:2,late:2,confirmed:2,reserved:2};
function state(table){const related=bookings.filter(r=>r.tables.includes(table.number)&&active(r));const top=related.slice().sort((a,b)=>(priority[b.status]||0)-(priority[a.status]||0)||a.time.localeCompare(b.time))[0];if(!top)return {key:'free',label:'LIBRE',detail:'Disponible',booking:null};const key=top.status==='seated'?'present':'expected';return {key,label:{present:'PRÉSENTS',expected:'ATTENDUS'}[key],detail:key==='expected'?top.time:top.guests+' personne'+(top.guests>1?'s':''),booking:top}}
function node(tag,className,content){const e=document.createElement(tag);if(className)e.className=className;if(content!==undefined)e.textContent=String(content);return e}
function serviceDisplayReady(){
 if(!$('integrationGate'))return true;
 const loaded=window.RestoSharedDataLoaded===true,state=window.RestoSyncState||'pending';
 let status=$('serviceDataStatus');
 if(!status){status=node('section','serviceDataStatus');status.id='serviceDataStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');$('tables').querySelector('.panelHead').after(status)}
 const kind=state==='readonly'?'readonly':state==='ok'?'ready':state==='error'?'error':'loading';
 status.dataset.state=kind;status.hidden=kind==='ready';status.replaceChildren();
 const text=kind==='readonly'?'Consultation disponible. Les enregistrements restent suspendus jusqu’à la mise à jour du service.':
  kind==='error'?(loaded?'Connexion interrompue. Les informations affichées peuvent être anciennes ; les modifications sont suspendues.':'Impossible de charger les tables. Vérifiez la connexion puis réessayez.'):
  loaded?'Actualisation en cours. Les informations affichées sont celles de la dernière synchronisation.':'Chargement des salles et des tables…';
 if(kind!=='ready')status.append(node('p','',text));
 if(kind==='error'){
  const retry=node('button','','Réessayer');retry.id='serviceDataRetry';retry.type='button';
  retry.addEventListener('click',async()=>{retry.disabled=true;try{await window.RestoRefreshSharedService?.()}catch{/* The synchronization state explains the failure. */}finally{retry.disabled=false}});status.append(retry);
 }
 $('tableGrid').setAttribute('aria-busy',String(!loaded&&kind==='loading'));
 if(loaded)return true;
 const placeholder=kind==='error'?'Les données ne sont pas disponibles pour le moment. Réessayez après vérification de la connexion.':'Chargement des informations du service…';
 $('tableGrid').replaceChildren(node('p','muted',text));$('upcoming').textContent=placeholder;
 $('kpis').replaceChildren(node('p','muted',placeholder));$('currentOccupancy')?.replaceChildren(node('p','muted',placeholder));$('rushDashboard')?.replaceChildren(node('p','muted',placeholder));
 return false;
}
function render(){if(!serviceDisplayReady())return;const visible=plan.tables.filter(t=>t.roomId===$('roomFilter').value);const states=visible.map(t=>({t,s:state(t)}));const shown=states.filter(x=>filter==='all'||x.s.key===filter);const order={present:0,expected:1,free:2};shown.sort((a,b)=>{switch(tableSort.value){case 'number-desc':return b.t.number-a.t.number;case 'capacity-asc':return a.t.capacity-b.t.capacity||a.t.number-b.t.number;case 'capacity-desc':return b.t.capacity-a.t.capacity||a.t.number-b.t.number;case 'status':return (order[a.s.key]??9)-(order[b.s.key]??9)||a.t.number-b.t.number;default:return a.t.number-b.t.number}});const seen=new Set();const cards=[];for(const {t,s} of shown){const r=s.booking;const fused=r&&r.tables.length>1;if(fused){if(seen.has(r.id))continue;seen.add(r.id)}const numbers=fused?r.tables:[t.number];const total=fused?numbers.reduce((sum,n)=>sum+(plan.tables.find(x=>x.number===n)?.capacity||0),0):t.capacity;const b=node('button','tableCard '+s.key+(fused?' groupedFusionCard':''));b.type='button';const statusBadge=node('span','status');const statusIcon=node('i','rmTableStateIcon');statusIcon.dataset.lucide=s.key==='free'?'check-circle-2':s.key==='expected'?'calendar-clock':'armchair';statusIcon.setAttribute('aria-hidden','true');statusBadge.append(statusIcon,document.createTextNode(s.label));b.append(node('span','num',fused?'Tables '+numbers.join(' + '):'Table '+t.number),statusBadge,node('span','info',fused?r.time+' · '+r.guests+' couvert(s)':s.detail),node('span','capacity',fused?total+' places réunies':(t.capacityMin||1)+' – '+t.capacity+' places'));if(fused&&total>r.guests)b.append(node('span','fusionCoverHint','Retirer '+(total-r.guests)+' couvert(s)'));b.addEventListener('click',()=>openTable(t,s,b));cards.push(b)}$('tableGrid').replaceChildren(...cards);window.lucide?.createIcons?.({nodes:[$('tableGrid')]});if(!cards.length)$('tableGrid').append(node('p','muted',visible.length?'Aucune table pour ce filtre.':'Aucune table active dans cette salle.'));
const all=plan.tables.map(t=>({t,s:state(t)}));const seated=bookings.filter(r=>r.status==='seated');const waiting=bookings.filter(r=>['reserved','confirmed','late','arrived'].includes(r.status));const occupiedNumbers=new Set(seated.flatMap(r=>r.tables));const free=all.filter(x=>!occupiedNumbers.has(x.t.number)).reduce((n,x)=>n+(x.t.capacity||0),0);window.RestoRush?.dashboard(date,bookings);const kpis=[['Clients installés',seated.reduce((n,r)=>n+r.guests,0),'users'],['Clients attendus',waiting.reduce((n,r)=>n+r.guests,0),'calendar-clock'],['Tables occupées',occupiedNumbers.size,'armchair'],['Places sur tables libres',free,'layout-grid']];const reservationLine=r=>(r.time||'—')+' · '+(r.client||'Client')+' · '+Number(r.guests||0)+' couvert(s)'+(r.tables?.length?' · Table '+r.tables.join(' + '):'')+(r.status==='confirmed'?' · Confirmé, non installé':'');
const kpiLists=[
 seated.map(reservationLine),
 waiting.map(reservationLine),
 seated.flatMap(r=>(r.tables||[]).map(number=>'Table '+number+' · '+(r.client||'Client')+' · '+Number(r.guests||0)+' couvert(s)')),
 all.filter(({t})=>!occupiedNumbers.has(t.number)).map(({t})=>'Table '+t.number+' · '+Number(t.capacity||0)+' place(s)')
];
$('kpis').replaceChildren(...kpis.map(([label,value,iconName],index)=>{const c=node('button','kpi kpiInteractive');c.type='button';c.setAttribute('aria-label','Voir le détail : '+label);const head=node('div','kpiHead');const icon=node('i','kpiIcon');icon.dataset.lucide=iconName;icon.setAttribute('aria-hidden','true');head.append(icon,node('span','kpiLabel',label));c.append(head,node('strong','',value));c.addEventListener('click',()=>window.RestoKpiDetails?.open(label,kpiLists[index]));return c}));
const totalTables=plan.tables.length;
const totalSeats=plan.tables.reduce((n,t)=>n+Math.max(0,Number(t.capacity)||0),0);
const guestsPresent=seated.reduce((n,r)=>n+(Number(r.guests)||0),0);
const occupiedTables=occupiedNumbers.size;
const tablesPercent=totalTables?Math.round(100*occupiedTables/totalTables):0;
const seatsPercent=totalSeats?Math.round(100*guestsPresent/totalSeats):0;
const noFreeTables=totalTables>0&&occupiedTables>=totalTables;
let occupancy=$('currentOccupancy');
if(!occupancy){
 occupancy=node('section','currentOccupancy');
 occupancy.id='currentOccupancy';
 occupancy.setAttribute('aria-label','Occupation actuelle du restaurant');
 $('kpis').insertAdjacentElement('afterend',occupancy);
}
function progressRow(label,count,total,percent){
 const group=node('div','occupancyProgressGroup');
 const head=node('div','occupancyProgressLine');
 head.append(node('span','',label),node('strong','',count+' / '+total+' · '+percent+' %'));
 const rail=node('div','occupancyProgressRail');
 rail.setAttribute('role','progressbar');rail.setAttribute('aria-label',label);
 rail.setAttribute('aria-valuemin','0');rail.setAttribute('aria-valuemax','100');rail.setAttribute('aria-valuenow',String(Math.max(0,Math.min(100,percent))));
 const bar=node('div','occupancyProgressBar');
 bar.style.width=Math.max(0,Math.min(100,percent))+'%';
 rail.append(bar);group.append(head,rail);return group;
}
const occupancyTitle=node('div','occupancyHead');
const occupancyHeading=node('div','occupancyHeadingBlock');
const occupancyH2=node('h2','occupancyTitleText');
const occupancyIcon=node('i','occupancyTitleIcon');occupancyIcon.dataset.lucide='armchair';occupancyIcon.setAttribute('aria-hidden','true');
occupancyH2.append(occupancyIcon,node('span','','Occupation actuelle'));
occupancyHeading.append(node('span','occupancySectionEyebrow','EN DIRECT · SALLE'),occupancyH2,node('p','rmOccupationSubtitle','Tables réellement occupées par des clients installés maintenant, hors réservations futures.'));
occupancyTitle.append(occupancyHeading);
const occupancyState=noFreeTables?'Toutes les tables occupées':tablesPercent>=85?'Presque complet':tablesPercent>=60?'Service chargé':'Places disponibles';
occupancyTitle.append(node('span','occupancyState'+(noFreeTables?' isFull':tablesPercent>=85?' isBusy':''),occupancyState));
const occupancyMetrics=node('div','rmOccupancyMetrics');
function occupancyTile(iconName,value,label){
 const item=node('div','rmOccupancyMetric');
 const icon=node('i','rmOccupancyMetricIcon');icon.dataset.lucide=iconName;icon.setAttribute('aria-hidden','true');
 const words=node('div','rmOccupancyMetricWords');words.append(node('strong','',value),node('span','',label));
 item.append(icon,words);return item;
}
occupancyMetrics.append(
 occupancyTile('users',guestsPresent,'Couverts installés'),
 occupancyTile('armchair',occupiedTables,'Tables occupées'),
 occupancyTile('check-circle-2',totalTables-occupiedTables,'Tables libres'),
 occupancyTile('layout-grid',totalTables,'Tables au total')
);
occupancy.replaceChildren(
 occupancyTitle,occupancyMetrics,
 progressRow('Tables occupées / tables actives',occupiedTables,totalTables,tablesPercent),
 node('p','rmOccupationCapacity',guestsPresent+' couverts installés sur '+totalSeats+' places ('+seatsPercent+' % des places).'),
 node('p','occupancyHelp','Une table réservée pour plus tard reste libre tant qu’aucun client n’y est installé. Les tables fusionnées sont comptées individuellement.')
);
window.lucide?.createIcons?.({nodes:[occupancy]});

$('upcoming').replaceChildren(...waiting.sort((a,b)=>a.time.localeCompare(b.time)).slice(0,8).map(r=>{const c=node('div','arrival');c.append(node('b','',r.time+' · '+r.client),node('small','',r.guests+' pers. · Table'+(r.tables.length>1?'s ':' ')+r.tables.join(' + ')));return c}));if(!waiting.length)$('upcoming').textContent='Aucune arrivée en attente.';if(selected){const t=plan.tables.find(t=>t.number===selected);if(t)detail(t,state(t))}}
function occupationProgress(r){
 const scheduled=new Date(r.date+'T'+r.time+':00').getTime();
 const actual=r.seatedAt?new Date(r.seatedAt).getTime():NaN;
 const start=Number.isFinite(actual)&&r.status==='seated'?actual:scheduled;
 const duration=(Number(r.duration)||ReservationEngine.DEFAULT_DURATION)*60000;
 const now=Date.now(),remaining=Math.ceil((start+duration-now)/60000);
 const percent=Math.max(0,Math.min(100,(now-start)/duration*100));
 const card=node('div','tableTimeProgress');
 const head=node('div','tableTimeProgressHead');
 head.append(node('strong','',r.status==='seated'?'Temps de présence prévu':'Créneau théorique'));
 head.append(node('span','',now<start?'Installation prévue à '+r.time:remaining>0?remaining+' min restantes':remaining===0?'Fin théorique atteinte':Math.abs(remaining)+' min de dépassement'));
 const track=node('div','tableTimeProgressTrack'),fill=node('div','tableTimeProgressFill'+(remaining<0?' overdue':''));fill.style.width=percent+'%';track.setAttribute('role','progressbar');track.setAttribute('aria-label','Progression du temps de réservation prévu');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');track.setAttribute('aria-valuenow',String(Math.round(percent)));track.append(fill);
 const foot=node('div','tableTimeProgressFoot');const end=new Date(start+duration);const endLabel=String(end.getHours()).padStart(2,'0')+':'+String(end.getMinutes()).padStart(2,'0');const startDate=new Date(start);const startLabel=String(startDate.getHours()).padStart(2,'0')+':'+String(startDate.getMinutes()).padStart(2,'0');foot.append(node('span','',startLabel+(Number.isFinite(actual)?' · Installation réelle':' · Début prévu')),node('span','',endLabel+' · Fin estimée'));
 card.append(head,track,foot);
 if(r.status==='seated')card.append(node('small','tableTimeProgressHint',now<start?'Le créneau n’a pas encore commencé.':'Estimation : les clients restent installés jusqu’à validation de leur départ.'));
 return card;
}
function detail(t,s){modal.querySelectorAll('.tableCompactMoreOverlay').forEach(overlay=>overlay.remove());const box=$('detail');const fusion=s.booking&&s.booking.tables.length>1?s.booking:null;const capacity=fusion?fusion.tables.reduce((sum,n)=>sum+(plan.tables.find(x=>x.number===n)?.capacity||0),0):t.capacity;box.replaceChildren(node('p','tableCompactMeta',fusion?'Capacité totale : '+capacity+' places · '+fusion.guests+' couvert(s)':'Capacité : '+(t.capacityMin||1)+' à '+t.capacity+' places'));const isReception=window.RestoReception===true;
// The table popup is for live service actions only; archived or cancelled
// bookings belong to the reservation history, not the table's quick view.
const activeTableStatuses=new Set(['reserved','confirmed','late','arrived','seated']);
const list=bookings.filter(r=>r.tables.includes(t.number)&&activeTableStatuses.has(r.status))
 .sort((a,b)=>(a.status==='seated'?0:1)-(b.status==='seated'?0:1)||a.time.localeCompare(b.time));
if(isReception){
 const note=node('p','muted',s.key==='present'?'Consultation uniquement · Client(s) installé(s)':'Consultation uniquement · Réservations à venir');
 box.append(note);
}
if(!list.length){box.append(node('p','muted','Aucun client attendu ou installé sur cette table pour ce service.'))}
const actions=node('div','tableDetailActions');
function shortcut(label,id,tableId){
 const button=node('button','tableDetailAction',label);button.type='button';button.addEventListener('click',async()=>{
 closeTable();window.RestoScreens?.show(id);const panel=$(id);if(!panel)return;panel.open=true;
 const select=$(tableId);if(select){select.value=String(t.number);select.dispatchEvent(new Event('change',{bubbles:true}))}
 panel.scrollIntoView({behavior:'smooth',block:'start'});
 const chosen=$(tableId);if(chosen&&!Array.from(chosen.options).some(o=>o.value===String(t.number))){$('bookingFeedback').textContent='Cette table n’est pas disponible pour le créneau sélectionné.'}
 });actions.append(button);
}
if(s.key==='free'){shortcut('Réserver cette table','reservationForm','bookingTable');shortcut('Installer un passage','passages','walkinTable');box.append(actions)}else if(!window.RestoReception&&list.some(r=>r.status!=='seated')){box.append(node('p','tableCompactHint','Client attendu · choisissez une action ci-dessous.'))}
if(!list.length)return;
const labels={reserved:'Attendu',confirmed:'Confirmé',late:'En retard',arrived:'Attendu',seated:'Installé',completed:'Terminé',released:'Libéré',cancelled:'Annulé',no_show:'Absent'};
const choices={reserved:[['seated','Installer à table'],['late','Signaler un retard'],['no_show','Absent']],confirmed:[['seated','Installer à table'],['late','Signaler un retard'],['no_show','Absent']],late:[['seated','Installer à table'],['no_show','Absent']],arrived:[['seated','Installer à table']],seated:[['released','Libérer la table']]};
list.forEach(r=>{
 const row=node('div','detailLine');
 const info=node('div','tableCompactGuest');
 const details=node('div','tableCompactIdentity');
 const time=node('strong','',r.time+' · '+r.guests+' personne'+(r.guests>1?'s':''));
 const client=node('span','',r.client);
 details.append(time,client);
 const statusBadge=node('span','tableCompactBadge',labels[r.status]||r.status);
 info.append(details,statusBadge);
 row.append(info);
 if(r.status==='seated'&&!isReception)row.append(occupationProgress(r));
 if(r.tables.length>1){const total=r.tables.reduce((sum,n)=>sum+(plan.tables.find(x=>x.number===n)?.capacity||0),0);row.append(node('span','fusionDetailNote','Tables fusionnées : '+r.tables.join(' + ')));if(total>r.guests)row.append(node('span','fusionCoverHint','Préparation : retirer '+(total-r.guests)+' couvert(s)'))}if(isReception){box.append(row);return}
 const controls=node('div','tableStatusActions tableCompactActions');
 const secondary=node('details','tableSecondaryActions tableCompactMore');
 const secondaryTitle=node('summary','tableCompactMoreTrigger');
 const moreIcon=document.createElement('i');moreIcon.setAttribute('data-lucide','ellipsis');secondaryTitle.append(moreIcon);
 secondaryTitle.setAttribute('aria-label','Autres actions pour '+r.client);
 secondaryTitle.setAttribute('title','Autres actions');
 const secondaryOverlay=node('div','tableCompactMoreOverlay');
 const secondaryBackdrop=node('button','tableCompactMoreBackdrop');
 secondaryBackdrop.type='button';
 secondaryBackdrop.setAttribute('aria-label','Fermer les actions');
 secondaryBackdrop.addEventListener('click',()=>{secondary.open=false});
 const sheet=node('div','tableCompactMoreSheet');
 sheet.setAttribute('role','group');
 sheet.setAttribute('aria-label','Actions pour '+r.client);
 const sheetHeader=node('div','tableCompactMoreHeader');
 sheetHeader.append(node('strong','','Actions · '+r.client));
 const closeMore=node('button','tableCompactMoreClose','✕');
 closeMore.type='button';closeMore.setAttribute('aria-label','Fermer les actions');
 closeMore.addEventListener('click',()=>{secondary.open=false;secondaryTitle.focus()});
 sheetHeader.append(closeMore);sheet.append(sheetHeader);
 secondaryOverlay.append(secondaryBackdrop,sheet);
 secondaryOverlay.hidden=true;
 secondary.append(secondaryTitle);
 modal.append(secondaryOverlay);
 secondary.addEventListener('toggle',()=>{secondaryOverlay.hidden=!secondary.open;if(secondary.open)closeMore.focus()});
 (choices[r.status]||[]).forEach(([kind,label])=>{
 const button=node('button','tableStatusAction',label);button.type='button';
 button.addEventListener('click',async()=>{
 if(['completed','released','no_show'].includes(kind)&&!(await confirmTableDeparture(kind,r)))return;
 try{
 const all=readReservations(),index=all.findIndex(x=>x.id===r.id);if(index<0)throw Error('Réservation introuvable.');
 if(kind==='seated'&&window.RestoCheckOccupiedTables?.(all[index],all))return;
 if(kind==='seated'&&!(await window.RestoConfirmEarlySeating(all[index])))return;
 const result=ReservationEngine.transition(all[index],kind,undefined,all);if(!result.valid)throw Error(result.error);
 if(window.RestoSharedReservations){
  await window.RestoChangeSharedStatus(all[index],kind);
  return;
 }
 all[index]=result.reservation;localStorage.setItem('restomanager_reservations',JSON.stringify(all));
 window.dispatchEvent(new Event('restomanager:v3-change'));
 const table=plan.tables.find(x=>x.number===t.number);if(table)detail(table,state(table));
 }catch(error){const warning=node('p','tableActionError',error.message);row.append(warning)}
 });if(kind==='seated'||kind==='released'){button.classList.add('tableCompactPrimary');controls.append(button)}else{button.classList.add('tableCompactSecondary');button.addEventListener('click',()=>{secondary.open=false});sheet.append(button)}
 });
 // Detailed editing and smart table changes already live in the reservation card.
 // Link there rather than duplicating business logic in this quick-service sheet.
 if(!isReception&&r.status!=='seated'){
  const manage=node('button','tableStatusAction tableCompactSecondary','Modifier / changer de table');
  manage.type='button';
  manage.addEventListener('click',()=>{
   secondary.open=false;
   closeTable();
   const dateField=$('reservationDate');if(dateField){dateField.value=r.date;dateField.dispatchEvent(new Event('change',{bubbles:true}))}
   const query=$('reservationQuery');if(query){query.value='';query.dispatchEvent(new Event('input',{bubbles:true}))}
   window.RestoScreens?.show('reservations');
   window.dispatchEvent(new CustomEvent('restomanager:open-reservation',{detail:{view:'active',reservationId:r.id}}));
  });
  sheet.append(manage);
 }
 if(sheet.querySelector('.tableCompactSecondary'))controls.append(secondary);
 row.append(controls);
 // Immediate access from the table popup, under "Installer à table".
 // Reuse the existing editor and its availability/concurrency checks.
 if(!isReception&&r.status!=='seated'){
  const changeTable=node('button','tableQuickChange');
  const changeIcon=document.createElement('i');changeIcon.setAttribute('data-lucide','arrow-left-right');changeIcon.setAttribute('aria-hidden','true');
  changeTable.append(changeIcon,document.createTextNode('Changer de table'));
  changeTable.type='button';
  changeTable.setAttribute('aria-label','Changer la table de '+r.client);
  changeTable.addEventListener('click',()=>{
   closeTable();
   const dateField=$('reservationDate');if(dateField){dateField.value=r.date;dateField.dispatchEvent(new Event('change',{bubbles:true}))}
   const query=$('reservationQuery');if(query){query.value='';query.dispatchEvent(new Event('input',{bubbles:true}))}
   window.RestoScreens?.show('reservations');
   window.dispatchEvent(new CustomEvent('restomanager:quick-change-table',{detail:{reservationId:r.id}}));
  });
  row.append(changeTable);
 }
 box.append(row);
 });
}
function confirmTableDeparture(kind,r){
 return new Promise(resolve=>{
  const existing=document.getElementById('restoDepartureConfirm');if(existing)existing.remove();
  const overlay=document.createElement('div');overlay.id='restoDepartureConfirm';overlay.className='restoDepartureOverlay';
  const dialog=document.createElement('section');dialog.className='restoDepartureDialog';dialog.setAttribute('role','alertdialog');dialog.setAttribute('aria-modal','true');
  dialog.setAttribute('aria-labelledby','restoDepartureTitle');
  const icon=document.createElement('div');icon.className='restoDepartureIcon';icon.innerHTML='<i data-lucide="'+(kind==='no_show'?'alert-circle':'check')+'"></i>';
  const eyebrow=document.createElement('div');eyebrow.className='restoDepartureEyebrow';eyebrow.textContent='GESTION DU SERVICE';
  const title=document.createElement('h2');title.id='restoDepartureTitle';title.textContent=kind==='completed'?'Terminer le passage ?':kind==='released'?'Libérer la table ?':'Signaler le client absent ?';
  const description=document.createElement('p');description.textContent=kind==='completed'?'Le passage sera marqué comme terminé dans le suivi des réservations.':kind==='released'?'Confirmez que les clients sont partis. Les tables seront libérées pour une nouvelle attribution.':'La réservation sera marquée comme absente.';
  const info=document.createElement('div');info.className='restoDepartureInfo';info.textContent=r.client+' · '+(r.tables.length>1?'Tables '+r.tables.join(' + '):'Table '+r.tables[0]);
  const actions=document.createElement('div');actions.className='restoDepartureActions';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Annuler';cancel.className='restoDepartureCancel';
  const accept=document.createElement('button');accept.type='button';accept.textContent=kind==='completed'?'Terminer le passage':kind==='released'?'Confirmer la libération':'Confirmer l’absence';accept.className='restoDepartureAccept';
  actions.append(cancel,accept);dialog.append(icon,eyebrow,title,description,info,actions);overlay.append(dialog);document.body.append(overlay);
  const previous=document.activeElement;
  function finish(ok){document.removeEventListener('keydown',onKey,true);overlay.remove();previous?.focus?.();resolve(ok)}
  function onKey(e){if(e.key==='Escape'){e.preventDefault();finish(false)}else if(e.key==='Tab'){const target=e.shiftKey?accept:cancel;if(document.activeElement===(e.shiftKey?cancel:accept)){e.preventDefault();target.focus()}}}
  cancel.addEventListener('click',()=>finish(false));accept.addEventListener('click',()=>finish(true));overlay.addEventListener('click',e=>{if(e.target===overlay)finish(false)});
  document.addEventListener('keydown',onKey,true);cancel.focus();
 });
}
$('bookingTable').addEventListener('change',()=>{$('bookingTable').dataset.manual='true'});
function refreshAvailability(){
 try{
 window.RestoBookingAvailabilityError=false;
 const dateValue=$('bookingDate').value,time=$('bookingTime').value,guests=Number($('bookingGuests').value),select=$('bookingTable'),previous=select.value;
 const insight=$('availabilityInsight'),fusionPanel=$('fusionSuggestions');
 if(insight)insight.replaceChildren();
 if(fusionPanel)fusionPanel.replaceChildren();
 const applyState=(state,message)=>{select.dataset.availabilityState=state;select.dataset.availabilityMessage=message;if(insight)insight.append(node('p','availabilityWarning',message));window.RestoTableChoices?.refresh('bookingTable')};
 select.required=!window.RestoReception;
 const connected=Array.isArray(window.RestoSharedReservations);
 if(connected&&(!window.RestoSupabaseReady||navigator.onLine===false)){
  if(window.RestoSyncState==='readonly'&&navigator.onLine!==false){select.replaceChildren();applyState('readonly','Les réservations sont suspendues jusqu’à la mise à jour du service. Les données restent consultables.');return;}
  select.replaceChildren();applyState(navigator.onLine===false?'offline':window.RestoSyncState==='error'?'error':'syncing',navigator.onLine===false?'Connexion interrompue. Disponibilités à revérifier.':window.RestoSyncState==='error'?'Les disponibilités ne sont pas actualisées. Vérifiez la connexion ou contactez le responsable.':'Synchronisation des disponibilités en cours…');return;
 }
 // An own hold can arrive in realtime before its RPC response supplies its IDs.
 // Keep the selection until that response settles; never label it unavailable.
 if(window.RestoBookingDraft?.checking()){
  applyState('checking','Vérification de la disponibilité et des confirmations en cours…');return;
 }
 select.replaceChildren();window.RestoFusionSelected=null;
 if(!dateValue||!time||!Number.isInteger(guests)||guests<1){applyState('invalid','Renseignez la date, l’heure et le nombre de couverts.');return;}
 // Explain a closed booking slot instead of pretending that every table is occupied.
 const bookingMinutes=value=>Number(String(value).slice(0,2))*60+Number(String(value).slice(3,5));
 const allowedShifts=Object.values(ReservationEngine.getShifts()).filter(shift=>shift.enabled);
 const inBookingHours=ReservationEngine.isServiceOpen(dateValue,time);
 if(!inBookingHours){
  if(insight)insight.append(node('p','availabilityWarning','L’heure d’arrivée choisie ('+time+') n’est pas réservable : '+(ReservationEngine.closedWeekendLunch(dateValue,time)?'restaurant fermé le samedi et dimanche midi. ':'aucun service ouvert à cet horaire. ')+'Choisissez un horaire parmi les services réellement ouverts : '+(allowedShifts.map(shift=>shift.start+'–'+shift.end).join(' et ')||'aucun service configuré')+'. Modifiez l’heure ou les horaires dans Gestion.'));
  select.dataset.availabilityState='out_of_service';select.dataset.availabilityMessage='Horaire hors service';
  window.RestoTableChoices?.refresh('bookingTable');
  return;
 }
 const reservationsAll=readReservations(),duration=ReservationEngine.getDefaultDuration();
 const choices=ReservationEngine.rankedTableChoices(plan.tables,window.RestoFusion?.pairs()||[],guests);
 function candidate(at,tables){return {id:'availability-preview',type:$('bookingType').value,client:$('bookingClient').value.trim()||($('bookingType').value==='hotel'?('Chambre '+($('bookingHotelRoom').value.trim()||'à préciser')):'Client extérieur'),hotelRoom:$('bookingType').value==='hotel'?$('bookingHotelRoom').value.trim():'',date:dateValue,time:at,guests,duration,tables,status:'reserved'};}
 function availability(at){
  const interval=window.RestoBookingInterval?.(dateValue,at,duration);
  return window.RestoAvailability.evaluate({choices,assess:c=>{
   const result=ReservationEngine.validate(candidate(at,c.numbers),reservationsAll);
   return {valid:result.valid,roomConflict:!!result.roomConflict,held:!!(interval&&window.RestoBookingDraft?.occupied(c.numbers,...interval).length)};
  }});
 }
 function matches(at){return availability(at).available}
 const evaluated=availability(time),available=evaluated.available,best=available[0];
 select.dataset.availabilityState=evaluated.state;select.dataset.availabilityMessage=evaluated.message;
 const context=[dateValue,time,guests].join('/');
 if(select.dataset.context!==context){delete select.dataset.manual;select.dataset.context=context}
 for(const c of available){
  const option=new Option(c.label+' · '+c.capacity+' places',c.value);
  select.append(option);
 }
 const pinned=window.RestoBookingDraft?.pinned(dateValue,time,guests)?.join(',');
 if(!select.dataset.manual&&available.some(c=>c.value===pinned))select.value=pinned;
 if(select.dataset.manual&&available.some(c=>c.value===previous))select.value=previous;
 else delete select.dataset.manual;
 window.RestoTableChoices?.refresh('bookingTable');
 if(!insight)return;
 const total=available.length,previewTables=best?.numbers||[];
 const interval=window.RestoBookingInterval?.(dateValue,time,duration);
 if(interval){
  const held=window.RestoBookingDraft?.occupied(plan.tables.map(t=>t.number),...interval);
  if(held?.length)insight.append(node('p','availabilityWarning','Saisie sur un autre appareil : '+held.map(h=>'table '+h.number+' · '+h.team).join(', ')+'.'));
 }
 if(best)insight.append(node('p','availabilitySummary',best.label+' recommandée'+(best.numbers.length>1?'s':'')+' · '+best.capacity+' places pour '+guests+' couvert(s).'));
 if(previewTables.length&&window.RestoRush){const preview=candidate(time,previewTables),rush=window.RestoRush.evaluate(preview,reservationsAll);insight.append(node('p','rushAvailabilityHint','Charge des arrivées : '+rush.current+' / '+rush.limit+' déjà attendus entre '+rush.range+'.'));if(rush.blocked){insight.append(node('p','availabilityWarning','Seuil conseillé d’arrivées dépassé : ce n’est pas une fermeture du service. Une explication et des horaires alternatifs seront proposés à la validation.'))}}
 if(!total){
  insight.append(node('p','availabilityWarning',evaluated.message));
  const current=Number(time.slice(0,2))*60+Number(time.slice(3,5)),alternatives=[];
  for(const delta of [-60,-30,30,60,90]){
   const mins=current+delta;if(mins<0||mins>=24*60)continue;
   const at=String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');
   if(!window.RestoAvailability.allowedAlternative(dateValue,at,bookingToday(),bookingNowTime()))continue;
   const count=matches(at).length;
   if(count)alternatives.push({at,count});
  }
  if(alternatives.length){
   insight.append(node('p','availabilityAlternativesTitle','Autres horaires disponibles :'));
   const choices=node('div','availabilityAlternatives');
   alternatives.slice(0,3).forEach(({at,count})=>{const button=node('button','availabilityTimeOption',at+' · '+count+' possibilité(s)');button.type='button';button.addEventListener('click',()=>{$('bookingTime').value=at;$('bookingTime').dispatchEvent(new Event('change',{bubbles:true}))});choices.append(button)});
   insight.append(choices);
  }else insight.append(node('p','muted','Aucune configuration compatible dans les créneaux proches testés. Essayez une autre date.'));
 }
 }catch(error){
  window.RestoBookingAvailabilityError=true;window.RestoErrors?.diagnostic('booking-availability',error);
  $('bookingTable').replaceChildren();
  $('availabilityInsight')?.replaceChildren(node('p','availabilityWarning','Les disponibilités ne peuvent pas être vérifiées pour le moment. Les tables restent consultables ; réessayez avant d’enregistrer.'));
 }
}
function showBookingSuccess(reservation){
 const old=document.getElementById('bookingSuccessDialog');if(old)old.remove();
 const overlay=document.createElement('div');overlay.id='bookingSuccessDialog';overlay.className='bookingSuccessOverlay';
 const dialog=document.createElement('section');dialog.className='bookingSuccessCard';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','bookingSuccessTitle');
 const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='bookingSuccessDismiss';
 dismiss.setAttribute('aria-label','Fermer la confirmation de réservation');dismiss.title='Fermer';
 dismiss.textContent='×';
 const previousFocus=document.activeElement;
 dismiss.addEventListener('click',()=>close());
 const mark=document.createElement('div');mark.className='bookingSuccessIcon';mark.innerHTML='<i data-lucide="check"></i>';
 const heading=document.createElement('h2');heading.id='bookingSuccessTitle';heading.textContent='Réservation enregistrée !';
 const summary=document.createElement('p');summary.textContent=reservation.client+' · '+reservation.guests+' couvert(s) · '+reservation.time+' · '+(reservation.tables.length>1?'Tables ':'Table ')+reservation.tables.join(' + ');
 const note=document.createElement('p');note.className='bookingSuccessSub';note.textContent='La réservation a bien été ajoutée au service.';if(reservation.allergies||reservation.notes){const extra=document.createElement('p');extra.className='bookingSuccessSub';extra.textContent=(reservation.allergies?'⚠ Allergies : '+reservation.allergies+'  ':'')+(reservation.notes?'Notes : '+reservation.notes:'');dialog.append(extra)}
 const actions=document.createElement('div');actions.className='bookingSuccessActions';
 const view=document.createElement('button');view.type='button';view.textContent='Voir la réservation';
 const again=document.createElement('button');again.type='button';again.className='bookingSuccessSecondary';again.textContent='Ajouter une autre';
 function close(){overlay.remove();document.removeEventListener('keydown',escape);if(previousFocus?.isConnected)previousFocus.focus()}
 function escape(e){if(e.key==='Escape'){e.preventDefault();close();return}if(e.key==='Tab'){const controls=Array.from(dialog.querySelectorAll('button:not([disabled])'));const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}}
 view.addEventListener('click',()=>{close();window.RestoScreens?.show('reservations');const dateField=$('reservationDate'),query=$('reservationQuery');if(dateField)dateField.value=reservation.date;if(query){query.value=reservation.client;query.dispatchEvent(new Event('input',{bubbles:true}))}document.getElementById('reservations')?.scrollIntoView({block:'start'})});
 again.addEventListener('click',()=>{close();prepareNewReservation();$('bookingClient').focus()});
 actions.append(view,again);dialog.append(dismiss,mark,heading,summary,note,actions);overlay.append(dialog);document.body.append(overlay);document.addEventListener('keydown',escape);dismiss.focus();
}
function prepareNewReservation(){
 // An unresolved or recovered confirmation must survive navigation until an explicit decision.
 if(window.RestoBookingDraft?.recoveryState()){refreshAvailability();return;}
 // Roll an expired booking date forward, while preserving future dates chosen by staff.
 const bookingDateField=$('bookingDate');
 if(bookingDateField&&(!bookingDateField.value||bookingDateField.value<bookingToday()))bookingDateField.value=bookingToday();
 // The form can be used outside service hours; default to the next valid guest arrival.
 const bookingTimeField=$('bookingTime');
 if(bookingDateField&&bookingTimeField){const arrival=bookingArrivalDefault(bookingDateField.value);bookingDateField.value=arrival.date;bookingTimeField.value=arrival.time;}
 // Only clear fields belonging to the previous guest.
 for(const id of ['bookingClient','bookingHotelRoom','bookingAllergies','bookingNotes']){
  const field=$(id);if(field)field.value='';
 }
 const guests=$('bookingGuests');if(guests)guests.value='1';
 // Every fresh reservation defaults to a hotel guest, for Reception and Restaurant.
 // Keep the native select, visual radio cards and hotel-room field in sync.
 const type=$('bookingType');
 if(type){
  type.value='hotel';
  const hotelChoice=document.querySelector('input[name="bookingTypeVisual"][value="hotel"]');
  if(hotelChoice)hotelChoice.checked=true;
  type.dispatchEvent(new Event('change',{bubbles:true}));
 }
 const feedback=$('bookingFeedback');if(feedback)feedback.textContent='';
 refreshAvailability();
}
window.RestoPrepareNewReservation=prepareNewReservation;
window.RestoRefreshBookingAvailability=refreshAvailability;
window.addEventListener('restomanager:screen',e=>{
 if(e.detail==='reservationForm')prepareNewReservation();
});
function readReservations(){const raw=window.RestoSharedReservations||JSON.parse(localStorage.getItem('restomanager_reservations')||'[]');return ReservationEngine.normalizeReservations(raw)}
{const arrival=bookingArrivalDefault();$('bookingDate').value=arrival.date;$('bookingTime').value=arrival.time;}
function syncHotelRoomField(){
 const isHotel=$('bookingType').value==='hotel';
 const label=$('bookingHotelRoomField'),input=$('bookingHotelRoom');
 if(!label||!input)return;
 label.hidden=!isHotel;
 input.disabled=!isHotel;
 input.required=isHotel;
 if(!isHotel)input.value='';
}
$('bookingType').addEventListener('change',syncHotelRoomField);
syncHotelRoomField();
['bookingDate','bookingTime','bookingGuests','bookingType','bookingClient','bookingHotelRoom'].forEach(id=>{for(const type of ['input','change'])$(id).addEventListener(type,refreshAvailability)});
$('bookingForm').addEventListener('submit',async event=>{
 event.preventDefault();const feedback=$('bookingFeedback');feedback.textContent='';
 try{
 if(window.RestoBookingAvailabilityError)throw (window.RestoErrors?.business||Error)('Les disponibilités ne peuvent pas être vérifiées. Réessayez avant d’enregistrer.');
 if(window.RestoSharedReservations&&!window.RestoSupabaseReady)throw (window.RestoErrors?.business||Error)('Synchronisation en cours. Réessayez dans un instant.');
 const existing=readReservations(),numbers=$('bookingTable').value.split(',').map(Number),guests=Number($('bookingGuests').value);
 if($('bookingDate').value<bookingToday())throw (window.RestoErrors?.business||Error)('Impossible de créer une réservation à une date passée.');
 if($('bookingDate').value===bookingToday()&&$('bookingTime').value<bookingNowTime())throw (window.RestoErrors?.business||Error)('Impossible de réserver une heure déjà passée aujourd’hui. Choisissez un créneau futur.');
 const fusion=numbers.length>1?numbers:null;const candidate={id:'v3-'+Date.now()+'-'+Math.random().toString(36).slice(2),type:$('bookingType').value,client:$('bookingClient').value.trim()||($('bookingType').value==='hotel'?('Chambre '+$('bookingHotelRoom').value.trim()):'Client extérieur'),hotelRoom:$('bookingType').value==='hotel'?$('bookingHotelRoom').value.trim():'',date:$('bookingDate').value,time:$('bookingTime').value,guests,notes:$('bookingNotes').value.trim(),allergies:$('bookingAllergies').value.trim(),duration:ReservationEngine.getDefaultDuration(),tables:numbers,status:'reserved'};
 if(candidate.notes.length>1000||candidate.allergies.length>500)throw (window.RestoErrors?.business||Error)('Les notes ou allergies dépassent la longueur autorisée. Raccourcissez votre saisie.');
 if(fusion&&(!window.RestoFusion||!window.RestoFusion.pairs().some(p=>p.slice().sort().join(':')===fusion.slice().sort().join(':'))))throw (window.RestoErrors?.business||Error)('Fusion non autorisée.');
 const result=ReservationEngine.validate(candidate,existing);
 if(!window.RestoReception&&!result.valid){feedback.textContent=result.errors.join(' ');refreshAvailability();return}
 const latest=readReservations(),again=ReservationEngine.validate(candidate,latest);
 if(!window.RestoReception&&!again.valid){feedback.textContent=again.errors.join(' ');refreshAvailability();return}
 const loadState=window.RestoRush.evaluate(candidate,latest);
 if(loadState.blocked){const ok=await window.RestoRush.confirm(candidate,latest);
 if(ok&&typeof ok==='object'&&ok.suggestedTime){
  const newTime=ok.suggestedTime;
  const timeField=$('bookingTime');
  timeField.value=newTime;
  timeField.dispatchEvent(new Event('change',{bubbles:true}));
  refreshAvailability();
  feedback.textContent='Nouvel horaire sélectionné : '+newTime+'. Vérifiez la table proposée, puis confirmez la réservation.';
  return;
 }
 if(!ok){feedback.textContent='Réservation non enregistrée. Choisissez un autre horaire ou revenez au formulaire.';return}
 const fresh=readReservations();if((!window.RestoReception&&!ReservationEngine.validate(candidate,fresh).valid)||window.RestoRush.evaluate(candidate,fresh).current!==loadState.current){feedback.textContent='Situation modifiée : réessayez.';return}candidate.rushOverride={confirmedAt:new Date().toISOString(),range:loadState.range}}
 if(window.RestoSharedReservations){
  if(typeof window.RestoCreateSharedBooking!=='function')throw (window.RestoErrors?.business||Error)('Connexion en cours. Réessayez dans un instant.');
  feedback.textContent='Enregistrement en cours…';
  await window.RestoCreateSharedBooking(candidate);
  feedback.textContent='✓ Réservation enregistrée · '+candidate.client+' · '+candidate.time+'.';
  try{if(typeof window.RestoRefreshSharedService==='function')await window.RestoRefreshSharedService();}
  catch(syncError){feedback.textContent+=' Actualisation des réservations en attente.';window.RestoErrors?.diagnostic('booking-refresh',syncError);}
  window.RestoFusionSelected=null;
  prepareNewReservation();
  showBookingSuccess(candidate);
  return;
 }
 const warnings=ReservationEngine.seatingWarnings(candidate,latest);
 if(warnings.length){
  const accepted=await window.RestoConfirmSeating(warnings,candidate.client,candidate.time);
  if(!accepted){feedback.textContent='Attribution annulée : aucune réservation créée.';return}
  const current=readReservations(),recheck=ReservationEngine.validate(candidate,current);
  if(!recheck.valid){feedback.textContent=recheck.errors.join(' ');refreshAvailability();return}
  if(JSON.stringify(ReservationEngine.seatingWarnings(candidate,current))!==JSON.stringify(warnings)){feedback.textContent='La situation des tables a changé. Recommencez la confirmation.';refreshAvailability();return}
  candidate.seatingOverride={confirmedAt:new Date().toISOString(),warnings:warnings.map(w=>({id:w.id,client:w.client,plannedEnd:w.plannedEnd,gapMinutes:w.gapMinutes}))};
  localStorage.setItem('restomanager_reservations',JSON.stringify(current.concat(candidate)));
  bookings=readReservations().filter(r=>r.date===date);window.dispatchEvent(new Event('restomanager:v3-change'));feedback.textContent='✓ Réservation enregistrée : '+candidate.client+' · '+candidate.time+'.';window.RestoFusionSelected=null;prepareNewReservation();render();showBookingSuccess(candidate);return;
 }
 const current=readReservations();if(!ReservationEngine.validate(candidate,current).valid){feedback.textContent='La disponibilité a changé. Réessayez.';refreshAvailability();return}
 localStorage.setItem('restomanager_reservations',JSON.stringify(current.concat(candidate)));
 bookings=readReservations().filter(r=>r.date===date);window.dispatchEvent(new Event('restomanager:v3-change'));feedback.textContent='✓ Réservation enregistrée : '+candidate.client+' · '+candidate.time+'.';window.RestoFusionSelected=null;prepareNewReservation();render();showBookingSuccess(candidate);
 }catch(error){window.RestoErrors?.diagnostic('booking-save',error);feedback.textContent=window.RestoErrors?.message(error,'Enregistrement non confirmé. Votre saisie est conservée ; vérifiez les informations et la connexion.')||error.message}
});
function applyTableSnapshot(){plan=TableStore.get();syncServiceDay();bookings=readReservations().filter(r=>r.date===date);const select=$('roomFilter'),previous=select.value;select.replaceChildren();plan.rooms.forEach(room=>{const option=document.createElement('option');option.value=room.id;option.textContent=room.id==='main'&&['Salle à configurer','Salle principale'].includes(room.name)?'Salle principale':room.name;option.title=option.textContent;select.append(option)});if(plan.rooms.some(room=>room.id===previous))select.value=previous;render();refreshAvailability()}
window.addEventListener('restomanager:v3-tables',applyTableSnapshot);
window.addEventListener('restomanager:supabase-snapshot',applyTableSnapshot);
window.addEventListener('restomanager:connection-state',()=>{if(window.RestoSharedDataLoaded)applyTableSnapshot();else{render();refreshAvailability()}});
window.addEventListener('restomanager:v3-change',()=>{try{syncServiceDay();bookings=readReservations().filter(r=>r.date===date);render();refreshAvailability()}catch(e){$('bookingFeedback').textContent=e.message}});
$('roomFilter').addEventListener('change',render);$('filters').addEventListener('click',e=>{const b=e.target.closest('button[data-filter]');if(!b)return;filter=b.dataset.filter;$('filters').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));render()});window.addEventListener('storage',e=>{if(e.key==='restomanager_reservations'||e.key==='restomanager_floor_plan_v1')location.reload()});
setInterval(()=>{if(!modal.hidden&&selected){const t=plan.tables.find(x=>x.number===selected);if(t)detail(t,state(t))}},60000);
render();
refreshAvailability();
})();

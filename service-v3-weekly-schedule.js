'use strict';
/* RM-JOHN-02: responsive weekly schedule editor, DEV only.
   No direct Supabase access: saves through the existing guarded Restaurant
   administration action. The shared snapshot remains authoritative. */
(function(){
 const form=document.getElementById('restaurantShiftForm');
 if(!form)return;
 const days=[['monday','Lundi'],['tuesday','Mardi'],['wednesday','Mercredi'],['thursday','Jeudi'],['friday','Vendredi'],['saturday','Samedi'],['sunday','Dimanche']];
 const defaults={lunch:{enabled:true,start:'12:00',end:'14:30'},dinner:{enabled:true,start:'19:00',end:'21:30'}};
 const root=document.createElement('section');root.id='rmWeeklySchedule';root.className='rmWeeklySchedule';root.hidden=true;
 const title=document.createElement('header');title.className='rmWeeklyHeader';
 title.innerHTML='<div><span class="rmWeeklyEyebrow">GESTION DU RESTAURANT</span><h3><i data-lucide="calendar-clock" aria-hidden="true"></i> Horaires par jour</h3><p>Choisissez les services ouverts et les dernières réservations, jour par jour.</p></div>';
 const legend=document.createElement('div');legend.className='rmWeeklyLegend';legend.innerHTML='<span><i data-lucide="sun" aria-hidden="true"></i> Midi</span><span><i data-lucide="moon" aria-hidden="true"></i> Soir</span>';
 title.append(legend);root.append(title);
 const rows=document.createElement('div');rows.className='rmWeeklyRows';root.append(rows);
 const footer=document.createElement('div');footer.className='rmWeeklyFooter';
 const note=document.createElement('p');note.innerHTML='<i data-lucide="info" aria-hidden="true"></i> Une case désactivée signifie <strong>service fermé</strong>. Les réservations sont refusées côté Réception et côté serveur.';
 footer.append(note);
 const copyAll=document.createElement('button');copyAll.type='button';copyAll.className='rmWeeklyCopyAll';copyAll.textContent='Copier le lundi vers mardi–vendredi';footer.append(copyAll);
 root.append(footer);
 const grid=form.querySelector('.shiftSettingsGrid');
 if(grid)grid.insertAdjacentElement('afterend',root);else form.prepend(root);
 const controls={};
 const hm=s=>/^([01]\\d|2[0-3]):[0-5]\\d$/.test(String(s||''));
 function setState(day,key,model){
  const el=controls[day][key];el.enabled.checked=model.enabled===true;
  el.start.value=model.start;el.end.value=model.end;
  refreshRow(day);
 }
 function refreshRow(day){
  const c=controls[day],row=c.row;
  for(const service of ['lunch','dinner']){
   const section=c[service].section,opened=c[service].enabled.checked;
   section.classList.toggle('rmWeeklyClosed',!opened);
   c[service].start.disabled=!opened;
   c[service].end.disabled=!opened;
   c[service].status.textContent=opened?'Ouvert':'Fermé';
  }
  const lunch=c.lunch.enabled.checked,dinner=c.dinner.enabled.checked;
  c.dayStatus.textContent=lunch&&dinner?'Midi et soir ouverts':lunch?'Midi ouvert · soir fermé':dinner?'Midi fermé · soir ouvert':'Fermé toute la journée';
  row.classList.toggle('rmWeeklyDayClosed',!lunch&&!dinner);
 }
 const icons={lunch:'sun',dinner:'moon'};
 function createService(day,key,label){
  const section=document.createElement('div');section.className='rmWeeklyService rmWeekly'+key;
  const heading=document.createElement('div');heading.className='rmWeeklyServiceHeading';
  const toggleLabel=document.createElement('label');toggleLabel.className='rmWeeklyToggle';
  const enabled=document.createElement('input');enabled.type='checkbox';enabled.setAttribute('aria-label',label+' : '+days.find(d=>d[0]===day)[1]);
  const text=document.createElement('span');text.className='rmWeeklyServiceTitle';text.textContent=label;
  toggleLabel.append(enabled,text);
  const status=document.createElement('small');status.className='rmWeeklyServiceStatus';
  heading.append(toggleLabel,status);section.append(heading);
  const times=document.createElement('div');times.className='rmWeeklyTimes';
  const mk=(what)=>{const item=document.createElement('label');item.className='rmWeeklyTimeField';
   const cap=document.createElement('span');cap.textContent=what==='start'?'Début':'Dernière réservation';
   const input=document.createElement('input');input.type='time';input.required=false;input.setAttribute('aria-label',label+' '+what+' '+days.find(d=>d[0]===day)[1]);
   item.append(cap,input);times.append(item);return input};
  const start=mk('start'),end=mk('end');section.append(times);
  enabled.addEventListener('change',()=>refreshRow(day));
  return {section,enabled,start,end,status};
 }
 for(const [day,label] of days){
  const row=document.createElement('details');row.className='rmWeeklyRow';row.dataset.day=day;
  const summary=document.createElement('summary');summary.className='rmWeeklyDayHead';
  const dayTitle=document.createElement('strong');dayTitle.textContent=label;
  const dayStatus=document.createElement('small');dayStatus.className='rmWeeklyDayStatus';
  const arrow=document.createElement('span');arrow.className='rmWeeklyChevron';arrow.innerHTML='<i data-lucide="chevron-down" aria-hidden="true"></i>';
  summary.append(dayTitle,dayStatus,arrow);
  row.append(summary);
  const body=document.createElement('div');body.className='rmWeeklyRowBody';
  const lunch=createService(day,'lunch','Midi'),dinner=createService(day,'dinner','Soir');
  body.append(lunch.section,dinner.section);
  const actions=document.createElement('div');actions.className='rmWeeklyActions';
  const copy=document.createElement('button');copy.type='button';copy.className='rmWeeklyCopy';
  copy.innerHTML='<i data-lucide="copy" aria-hidden="true"></i> Copier vers…';
  const target=document.createElement('select');target.className='rmWeeklyCopyTarget';target.setAttribute('aria-label','Copier les horaires de '+label+' vers');
  target.innerHTML='<option value="">Choisir un jour</option>';
  for(const [other,name] of days)if(other!==day){const option=document.createElement('option');option.value=other;option.textContent=name;target.append(option)}
  target.hidden=true;
  copy.addEventListener('click',()=>{target.hidden=!target.hidden;if(!target.hidden)target.focus()});
  target.addEventListener('change',()=>{
   if(target.value){for(const service of ['lunch','dinner'])setState(target.value,service,{
     enabled:controls[day][service].enabled.checked,
     start:controls[day][service].start.value,
     end:controls[day][service].end.value
   });target.value='';target.hidden=true;}
  });
  actions.append(copy,target);body.append(actions);
  row.append(body);rows.append(row);controls[day]={row,dayStatus,lunch,dinner};
  row.open=day==='monday';
  for(const key of ['lunch','dinner'])setState(day,key,defaults[key]);
 }
 // A table layout for desktop/tablet is styled via CSS; details stay open there
 // while mobile shows compact accordion cards.
 function adjustLayout(){
  const wide=window.matchMedia('(min-width: 701px)').matches;
  for(const [day] of days){if(wide)controls[day].row.open=true}
 }
 window.addEventListener('resize',adjustLayout,{passive:true});adjustLayout();
 copyAll.addEventListener('click',()=>{
  for(const [day] of days.slice(1,5))for(const key of ['lunch','dinner'])
   setState(day,key,{enabled:controls.monday[key].enabled.checked,start:controls.monday[key].start.value,end:controls.monday[key].end.value});
  copyAll.textContent='✓ Mardi à vendredi mis à jour';
  setTimeout(()=>{copyAll.textContent='Copier le lundi vers mardi–vendredi'},2200);
 });
 let lastSignature='';
 function refresh(){
  const schedule=window.RestoSharedHours?.weeklySchedule;
  if(!schedule||typeof schedule!=='object')return;
  const signature=JSON.stringify(schedule);
  if(signature===lastSignature)return;
  lastSignature=signature;root.hidden=false;form.classList.add('rmWeeklyMode');
  for(const [day] of days)for(const key of ['lunch','dinner'])setState(day,key,schedule[day]?.[key]||defaults[key]);
  window.lucide?.createIcons?.({nodes:[root]});
 }
 window.RestoWeeklyScheduleDraft=()=>{
  if(root.hidden)return null;
  const schedule={};
  for(const [day,label] of days){
   const entry={};
   for(const key of ['lunch','dinner']){
    const c=controls[day][key];
    const start=c.start.value,end=c.end.value;
    if(!hm(start)||!hm(end)||start>=end)throw new Error(label+' : horaires '+(key==='lunch'?'du midi':'du soir')+' invalides.');
    entry[key]={enabled:c.enabled.checked,start,end};
   }
   if(entry.lunch.enabled&&entry.dinner.enabled&&entry.lunch.end>=entry.dinner.start)throw new Error(label+' : les services midi et soir se chevauchent.');
   schedule[day]=entry;
  }
  return schedule;
 };
 window.addEventListener('restomanager:hours',refresh);
 window.addEventListener('restomanager:supabase-snapshot',refresh);
 refresh();
})();

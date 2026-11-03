'use strict';
(function(){
 const KEY='restomanager_reservations',SNOOZE='restomanager_v3_reminder_snoozes';
 const bell=document.createElement('button');bell.type='button';bell.className='serviceBell';bell.setAttribute('aria-label','Rappels de service');bell.innerHTML='<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span class="serviceBellCount" hidden>0</span>';
 const panel=document.createElement('section');panel.className='serviceReminderPanel';panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-label','Notifications de service');
 document.querySelector('.top')?.append(bell);document.body.append(panel);
 const read=()=>{try{return ReservationEngine.normalizeReservations(JSON.parse(localStorage.getItem(KEY)||'[]'))}catch{return []}};
 const snoozes=()=>{try{return JSON.parse(localStorage.getItem(SNOOZE)||'{}')}catch{return {}}};
 const sameDay=(d,now)=>d===now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
 const clock=d=>d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
 const button=(label,fn,kind)=>{const b=document.createElement('button');b.type='button';b.textContent=label;if(kind)b.className=kind;b.addEventListener('click',fn);return b};
 function collect(){
  const now=new Date(),all=read(),sleep=snoozes(),alerts=[];
  for(const r of all){
   if(r.status!=='seated'||!sameDay(r.date,now))continue;
   const start=r.seatedAt?new Date(r.seatedAt):new Date(r.date+'T'+r.time+':00');
   if(!Number.isFinite(start.getTime()))continue;
   const end=new Date(start.getTime()+(Number(r.duration)||90)*60000);
   const remaining=Math.ceil((end.getTime()-now.getTime())/60000);
   if(remaining>15)continue;
   const next=all.filter(x=>x.id!==r.id&&x.date===r.date&&ReservationEngine.isBlocking(x)&&x.tables.some(t=>r.tables.includes(t))).map(x=>x.time).sort()[0];
   const priority=remaining<=-15||Boolean(next);
   if(Number(sleep[r.id])>now.getTime())continue;
   alerts.push({r,end,remaining,next,priority});
  }
  return alerts.sort((a,b)=>Number(b.priority)-Number(a.priority)||a.remaining-b.remaining);
 }
 function update(){
  const alerts=collect();const count=bell.querySelector('span');count.textContent=String(alerts.length);count.hidden=!alerts.length;
  bell.setAttribute('aria-label',alerts.length+' rappel(s) de service');
  panel.replaceChildren();
  const head=document.createElement('div');head.className='serviceReminderHead';const h=document.createElement('strong');h.textContent='Rappels de service';head.append(h,button('✕',()=>{panel.hidden=true},'serviceReminderClose'));panel.append(head);
  if(!alerts.length){const p=document.createElement('p');p.textContent='Aucun départ à vérifier pour le moment.';panel.append(p);return}
  for(const a of alerts){
   const item=document.createElement('article');item.className='serviceReminderItem';
   const title=document.createElement('strong');title.textContent=(a.priority?'⚠ ':'')+'Table'+(a.r.tables.length>1?'s ':' ')+a.r.tables.join(' + ')+' · '+a.r.client;
   const desc=document.createElement('p');desc.textContent=(a.remaining>0?'Départ estimé dans '+a.remaining+' min':a.remaining===0?'Fin estimée maintenant':'Fin estimée dépassée de '+Math.abs(a.remaining)+' min')+' (prévue à '+clock(a.end)+'). Vérifier si les clients sont partis.'+(a.next?' Prochaine réservation : '+a.next+'.':'');
   const actions=document.createElement('div');actions.className='serviceReminderActions';
   actions.append(button('Libérer la table',()=>{
    if(!confirm('Les clients de '+a.r.client+' sont-ils réellement partis ? Confirmer la libération des tables '+a.r.tables.join(' + ')+' ?'))return;
    const all=read(),idx=all.findIndex(r=>r.id===a.r.id);if(idx<0||all[idx].status!=='seated'){update();return}
    const result=ReservationEngine.transition(all[idx],'released',undefined,all);
    if(!result.valid){alert(result.error||'Impossible de libérer cette table.');return}
    all[idx]=result.reservation;localStorage.setItem(KEY,JSON.stringify(all));window.dispatchEvent(new Event('restomanager:v3-change'));update();
   },'serviceReminderPrimary'));
   actions.append(button('Toujours occupée · 10 min',()=>{const s=snoozes();s[a.r.id]=Date.now()+600000;localStorage.setItem(SNOOZE,JSON.stringify(s));update()}));
   item.append(title,desc,actions);panel.append(item);
  }
 }
 bell.addEventListener('click',()=>{panel.hidden=!panel.hidden;update()});
 window.addEventListener('restomanager:v3-change',update);
 window.addEventListener('storage',update);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)update()});
 setInterval(update,60000);update();
})();

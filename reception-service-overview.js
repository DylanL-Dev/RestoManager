'use strict';
(function(){
 const root=document.getElementById('receptionServiceOverview');
 if(!root)return;
 const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'});
 const day=()=>{const p=Object.fromEntries(dateFormat.formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day};
 const clock=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});
 const statusNames={reserved:'Attendu',confirmed:'Confirmé',late:'En retard',arrived:'Attendu',seated:'Installé'};
 const node=(tag,cls,value)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=String(value);return el};
 function render(){
  if(!window.RestoReception)return;
  const info=window.RestoSharedReservations;
  root.replaceChildren();
  const intro=node('header','receptionServiceIntro');
  intro.append(node('p','eyebrow','SUIVI EN TEMPS RÉEL'),node('h2',null,'Service du restaurant'),node('p','muted','Consultation uniquement · Les installations et libérations restent réservées à l’équipe en salle.'));
  root.append(intro);
  if(!Array.isArray(info)||!window.RestoSupabaseReady){
   root.append(node('p','receptionServiceEmpty','Synchronisation en cours ou indisponible. Vérifiez la connexion dans Gestion.'));
   return;
  }
  const today=day();
  const list=info.filter(r=>r.date===today);
  const pending=list.filter(r=>['reserved','confirmed','late','arrived'].includes(r.status));
  const seated=list.filter(r=>r.status==='seated');
  const expected=pending.reduce((n,r)=>n+Number(r.guests||0),0);
  const inRoom=seated.reduce((n,r)=>n+Number(r.guests||0),0);
  // TableStore is a top-level lexical const, not a property of window.
  const tables=(typeof TableStore!=='undefined'?TableStore.get().tables:[]).filter(t=>t.capacity>0);
  const occupied=new Set(seated.flatMap(r=>r.tables||[]).map(Number));
  const free=tables.filter(t=>!occupied.has(Number(t.number))).length;
  const cards=node('div','receptionServiceMetrics');
  for(const [value,label] of [[expected,'Couverts encore attendus'],[inRoom,'Couverts installés'],[pending.length,'Réservations à venir'],[free,'Tables non occupées']]){
   const c=node('div','receptionServiceMetric');c.append(node('strong',null,value),node('span',null,label));cards.append(c);
  }
  root.append(cards);
  const totalSeats=tables.reduce((n,t)=>n+Number(t.capacity||0),0);
  const demand=expected+inRoom;
  const pressure=node('section','receptionServicePressure');
  pressure.append(node('h3',null,'Affluence du service'));
  const desc=node('p',null,totalSeats?demand+' couverts installés ou encore attendus pour '+totalSeats+' places configurées.':'Capacité du restaurant non disponible.');
  pressure.append(desc);
  if(totalSeats){
   const meter=node('progress');meter.max=totalSeats;meter.value=Math.min(demand,totalSeats);meter.setAttribute('aria-label','Couverts installés ou attendus par rapport aux places configurées');pressure.append(meter);
   if(demand/totalSeats>=.8)pressure.append(node('p','receptionServiceWarning','Forte affluence prévue. Vérifiez les créneaux disponibles avant de proposer une réservation.'));
  }
  root.append(pressure);
  const section=node('section','receptionServiceArrivals');section.append(node('h3',null,'Prochaines arrivées'));
  const ordered=pending.slice().sort((a,b)=>String(a.time).localeCompare(String(b.time))).slice(0,12);
  if(!ordered.length)section.append(node('p','muted','Aucune arrivée en attente pour aujourd’hui.'));
  for(const r of ordered){
   const row=node('article','receptionServiceArrival');
   const time=node('strong','receptionServiceTime',r.time||'—');
   const details=node('div','receptionServiceDetails');
   details.append(node('strong',null,r.hotelRoom?'Chambre '+r.hotelRoom:r.client||'Client'));
   details.append(node('small',null,Number(r.guests||0)+' couvert(s) · '+((r.tables||[]).length?'Table'+(r.tables.length>1?'s ':' ')+r.tables.join(' + '):'Attribution en cours')));
   const status=node('span','receptionServiceStatus',statusNames[r.status]||r.status);
   row.append(time,details,status);section.append(row);
  }
  root.append(section);
  root.append(node('p','receptionServiceFoot','État partagé · actualisé à '+clock.format(new Date())+'. La capacité indique les places configurées, pas les disponibilités garanties à un horaire donné.'));
 }
 window.addEventListener('restomanager:supabase-snapshot',render);
 window.addEventListener('restomanager:screen',render);
 window.addEventListener('online',render);
 window.addEventListener('offline',render);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
 setInterval(render,60000);
 render();
})();

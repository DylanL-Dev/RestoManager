import {paris,addDays} from './dates.mjs?v=20261120-rm0159';
export function serverDay(stamp){const time=Date.parse(stamp);if(!Number.isFinite(time))throw Error('Les horaires du restaurant sont momentanément indisponibles.');return paris(new Date(time));}
export function currentSlots(date,stamp,slots){const now=serverDay(stamp);return slots.map(s=>({...s,available:s.available===true&&(date>now.date||date===now.date&&s.time>now.time)}));}
const services=['lunch','dinner'];
function pick(results,date,stamp){
 const choices=results.flatMap((r,i)=>currentSlots(date,stamp,r.slots||[]).filter(s=>s.available).map(s=>({service:services[i],time:s.time})));
 choices.sort((a,b)=>a.time.localeCompare(b.time));return choices[0]?.service;
}
// Discover only today and tomorrow. Neither a hold nor a booking is created here.
export async function initialVisit(profile,party,read){
 let stamp=profile.serverTime,today=serverDay(stamp).date;
 for(let attempt=0;attempt<2;attempt++){
  const load=async date=>{const responses=await Promise.all(services.map(service=>read({party,date,service})));for(const r of responses){serverDay(r.serverTime);if(Date.parse(r.serverTime)>Date.parse(stamp))stamp=r.serverTime;}return responses;};
  let date=today,results=await load(date);if(serverDay(stamp).date!==today){today=serverDay(stamp).date;continue;}
  let service=pick(results,date,stamp),tomorrow=false;
  if(!service){date=addDays(today,1);results=await load(date);if(serverDay(stamp).date!==today){today=serverDay(stamp).date;continue;}service=pick(results,date,stamp)||services[results.findIndex(r=>r.slots?.length)]||'dinner';tomorrow=true;}
  return {date,service,time:'',slots:currentSlots(date,stamp,results[services.indexOf(service)].slots||[]),today,serverTime:stamp,tomorrow};
 }
 throw Error('La journée vient de changer. Actualisez les horaires pour continuer.');
}

const dayKeys=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
export function slotText(slot,date,stamp,lead=0){
 if(slot.available)return slot.level==='limited'?'Dernières disponibilités':'Disponible';
 const now=serverDay(stamp),visit=date+'T'+slot.time;
 if(visit<=now.date+'T'+now.time)return 'Horaire passé';
 const cutoff=Date.parse(stamp)+Math.max(0,Number(lead)||0)*60000,earliest=serverDay(new Date(cutoff).toISOString()),limit=earliest.date+'T'+earliest.time;
 if(visit<limit||visit===limit&&cutoff%60000!==0)return 'Trop proche';
 return 'Indisponible';
}
export function availabilityNote(profile,draft,slots){
 if(!slots.length){
  const key=dayKeys[new Date(draft.date+'T12:00Z').getUTCDay()],hours=profile.openingHours?.find(day=>day.day===key)?.[draft.service];
  return hours?.enabled===false?'Le restaurant ne propose pas ce service à cette date. Choisissez un autre service ou une autre date.':'Aucun horaire proposé pour ce service. Essayez une autre date ou l’autre service.';
 }
 if(slots.some(slot=>slot.available))return '';
 const labels=slots.map(slot=>slotText(slot,draft.date,profile.serverTime,profile.leadMinutes));
 if(labels.every(label=>label==='Horaire passé'))return 'Tous les horaires de ce service sont passés. Choisissez un autre service ou une autre date.';
 if(labels.every(label=>label==='Horaire passé'||label==='Trop proche'))return 'Il ne reste pas de créneau pour ce service respectant le délai de réservation de '+profile.leadMinutes+' minutes prévu par le restaurant. Choisissez un autre service ou une autre date.';
 return 'Aucun créneau n’est disponible pour '+draft.party+' personne'+(draft.party>1?'s':'')+' sur ce service. Essayez un autre service ou une autre date.';
}

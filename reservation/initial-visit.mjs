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

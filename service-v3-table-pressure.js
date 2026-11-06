'use strict';
/* Read-only, per-time-slot availability. Never writes reservation assignments. */
(function(root){
 function availability({date,time,guests=2,duration=90,tables=[],reservations=[],holds=[],now=Date.now()}){
  const minutes=s=>{const m=/^(\d\d):(\d\d)$/.exec(String(s));return m?Number(m[1])*60+Number(m[2]):NaN};
  const begin=minutes(time);
  if(!date||!Number.isInteger(begin)||begin<0||begin>=1440||!Number.isFinite(Number(duration))||duration<=0||!Number.isInteger(Number(guests))||guests<1)return {valid:false,remaining:0,total:0,reason:'Horaire ou nombre de couverts invalide'};
  const end=begin+Number(duration);
  const compatible=t=>Number(t.capacity)>=guests&&Number(t.capacityMin||1)<=guests;
  const potential=tables.filter(t=>t&&compatible(t));
  const busy=new Set();
  for(const r of reservations){
   if(!r||!['reserved','confirmed','late','arrived','seated'].includes(r.status))continue;
   // An installed guest occupies the table until released, even if the planned slot has passed.
   if(r.status==='seated'){
    for(const n of r.tables||[])busy.add(Number(n));
    continue;
   }
   if(r.date!==date)continue;
   const start=minutes(r.time),rEnd=start+Number(r.duration||90);
   if(Number.isFinite(start)&&start<end&&rEnd>begin)for(const n of r.tables||[])busy.add(Number(n));
  }
  for(const h of holds){
   if(!h||Number(h.expiry)<=now)continue;
   // Compare hold timestamps in the restaurant's local wall-clock calendar.
   const paris=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
   const local=ms=>{const p=Object.fromEntries(paris.formatToParts(new Date(ms)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute))/60000};
   const planned=Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7))-1,Number(date.slice(8,10)))/60000+begin;
   if(local(h.start)<planned+Number(duration)&&local(h.end)>planned)busy.add(Number(h.number));
  }
  const remaining=potential.filter(t=>!busy.has(Number(t.number))).length;
  return {valid:true,total:potential.length,remaining,occupied:potential.length-remaining,level:remaining===0?'full':remaining<=3?'critical':remaining<=5?'busy':'normal'};
 }
 root.RestoTablePressure={availability};
 if(typeof module==='object'&&module.exports)module.exports={availability};
})(typeof globalThis!=='undefined'?globalThis:this);

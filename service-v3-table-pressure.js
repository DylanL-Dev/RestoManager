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
   // Server holds are absolute UTC timestamps; compare using the time zone of the planned restaurant date.
   const start=Date.parse(date+'T'+time+':00+01:00'); // fallback below uses Europe/Paris formatter
   const endTimestamp=start+Number(duration)*60000;
   if(Number(h.start)<endTimestamp&&Number(h.end)>start)busy.add(Number(h.number));
  }
  const remaining=potential.filter(t=>!busy.has(Number(t.number))).length;
  return {valid:true,total:potential.length,remaining,occupied:potential.length-remaining,level:remaining===0?'full':remaining<=3?'critical':remaining<=5?'busy':'normal'};
 }
 root.RestoTablePressure={availability};
 if(typeof module==='object'&&module.exports)module.exports={availability};
})(typeof globalThis!=='undefined'?globalThis:this);

'use strict';
/* DEV: conservative, read-only per-slot remaining-seats indicator.
   Never allocate tables and never treat an estimate as a confirmed booking.
   Fusion links are allowed only to check if the requested party fits; they
   NEVER create additional physical seats. */
(function(root,factory){
 const api=factory();
 root.RestoSlotCapacity=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis,function(){
 const active=new Set(['reserved','confirmed','late','arrived','seated']);
 const minute=s=>{const m=/^(\d{2}):(\d{2})$/.exec(String(s||''));if(!m)return NaN;const h=+m[1],n=+m[2];return h<24&&n<60?h*60+n:NaN};
 function evaluate({date,time,guests=2,duration=90,tables=[],reservations=[],groups=[],heldNumbers=[],ready=true}){
  const start=minute(time),party=Number(guests),length=Number(duration);
  if(!ready||!date||!Number.isFinite(start)||!Number.isInteger(party)||party<1||!Number.isFinite(length)||length<=0)
   return {state:'unknown',remaining:null,compatible:false,reason:'Disponibilités à vérifier'};
  const end=start+length,busy=new Set(heldNumbers.map(Number)),physical=tables.filter(t=>t&&Number(t.capacity)>0&&t.active!==false);
  let unassigned=false;
  for(const r of reservations){
   if(!r||!active.has(r.status))continue;
   // Seated guests still block their tables on the service date until release;
   // for other days, the reservation's ordinary time range applies.
   if(r.date!==date)continue;
   const a=minute(r.time),b=a+Number(r.duration||duration);
   if(r.status!=='seated'&&(!Number.isFinite(a)||a>=end||b<=start))continue;
   const numbers=Array.isArray(r.tables)?r.tables:[];
   if(!numbers.length){unassigned=true;continue}
   for(const n of numbers)busy.add(Number(n));
  }
  // A reservation without an assigned table makes a precise remaining seat count
  // unsafe: display "à confirmer" instead of misleading the Reception.
  if(unassigned)return {state:'unknown',remaining:null,compatible:false,reason:'Attribution de tables en attente'};
  const free=physical.filter(t=>!busy.has(Number(t.number)));
  const remaining=free.reduce((total,t)=>total+Number(t.capacity),0);
  const freeNumbers=new Set(free.map(t=>Number(t.number)));
  const singles=free.some(t=>Number(t.capacity)>=party&&Number(t.capacityMin||1)<=party);
  const fusionFits=groups.some(group=>Array.isArray(group)&&group.length>=2&&group.every(n=>freeNumbers.has(Number(n)))
    &&group.reduce((total,n)=>total+Number(free.find(t=>Number(t.number)===Number(n))?.capacity||0),0)>=party);
  const compatible=singles||fusionFits;
  const state=remaining===0?'full':remaining===1?'last':remaining<=4?'limited':'open';
  return {state,remaining,compatible,freeTables:free.length,
   reason:compatible?'Sous réserve de confirmation':'Aucune table ou fusion compatible avec '+party+' couverts'};
 }
 return {evaluate};
});

'use strict';
/* Placement intelligent — simulation sans écriture ni changement de statut. */
(function(root){
const smartPlan=function smartPlan(input){
 const {reservations,tablePlan,reservationId,targetTable,holds=[]}=input;
 const blocked=new Set(['reserved','confirmed','late','arrived','seated']);
 const movable=new Set(['reserved','confirmed','late']);
 const all=(reservations||[]).filter(r=>blocked.has(r.status)).map(r=>({...r,tables:(r.tables||[]).map(Number)}));
 const target=all.find(r=>String(r.id)===String(reservationId));
 const fail=reason=>({ok:false,reason,changes:[]});
 if(!target)return fail('Réservation introuvable ou déjà terminée.');
 if(!movable.has(target.status)&&target.status!=='arrived')return fail('Client déjà installé : déplacement interdit.');
 if(target.walkIn)return fail('Cette simulation concerne uniquement les réservations.');
 const plan=(tablePlan||[]).filter(t=>Number(t.capacity)>0);
 const byNum=new Map(plan.map(t=>[Number(t.number),t]));
 const desired=Number(targetTable),dest=byNum.get(desired);
 if(!dest)return fail('Table inconnue ou inactive.');
 if(Number(dest.capacity)<target.guests||Number(dest.capacityMin||1)>target.guests)return fail('Capacité de la table incompatible.');
 if(target.tables.length!==1)return fail('Fusion : réorganisation automatique désactivée pour cette réservation.');
 const when=r=>{
  const [h,m]=String(r.time||'').split(':').map(Number), start=h*60+m;
  return [start,start+Number(r.duration||90)];
 };
 const overlap=(a,b)=>{
  if(a.date!==b.date)return false;
  if(a.status==='seated'||b.status==='seated')return true; // never displace a physically occupied table
  const [a0,a1]=when(a),[b0,b1]=when(b);
  return Number.isFinite(a0)&&Number.isFinite(b0)&&a0<b1&&b0<a1;
 };
 const holdBlocked=(r,num)=>holds.some(h=>Number(h.number)===num&&h.expiry>Date.now()&&(()=>{const start=Date.parse(r.date+'T'+r.time+':00'),end=start+Number(r.duration||90)*60000;return start<h.end&&end>h.start})());
 if(holdBlocked(target,desired))return fail('Table momentanément bloquée pendant une réservation.');
 const sameDate=all.filter(r=>r.date===target.date);
 const assignment=new Map(sameDate.map(r=>[String(r.id),r.tables.slice()]));
 assignment.set(String(target.id),[desired]);
 const changed=new Set([String(target.id)]);
 const fixed=sameDate.filter(r=>r.status==='seated'||r.walkIn||r.tables.length!==1);
 // Any fixed occupant sharing target table makes this an impossible move.
 if(fixed.some(r=>r.id!==target.id&&r.tables.includes(desired)&&overlap(r,target)))return fail('Table déjà occupée par un client installé ou une fusion non déplaçable.');
 const candidates=plan.filter(t=>t.capacity>=1).sort((a,b)=>Number(a.capacity)-Number(b.capacity)||Number(a.number)-Number(b.number));
 const displaced=sameDate.filter(r=>r.id!==target.id&&r.tables.includes(desired)&&overlap(r,target));
 if(displaced.some(r=>!movable.has(r.status)))return fail('La table demandée est protégée.');
 const work=new Set(displaced.map(r=>String(r.id)));
 const visited=new Set();
 const compatible=(r,num)=>{const t=byNum.get(num);return t&&t.capacity>=r.guests&&(t.capacityMin||1)<=r.guests&&!holdBlocked(r,num)};
 const solve=(depth)=>{
  if(depth>8||changed.size>8)return false;
  if(!work.size)return true;
  const id=[...work].sort((a,b)=>{
   const x=sameDate.find(r=>String(r.id)===a),y=sameDate.find(r=>String(r.id)===b);
   return (y?.guests||0)-(x?.guests||0);
  })[0];
  work.delete(id);
  const r=sameDate.find(r=>String(r.id)===id);
  const previous=assignment.get(id);
  if(!r||!movable.has(r.status))return false;
  const sorted=candidates.filter(t=>compatible(r,Number(t.number))&&Number(t.number)!==desired&&Number(t.number)!==r.tables[0]);
  for(const t of sorted){
   const num=Number(t.number);
   const collide=sameDate.filter(other=>other.id!==r.id&&overlap(r,other)&&(assignment.get(String(other.id))||[]).includes(num));
   if(collide.some(other=>other.status==='seated'||other.walkIn||other.tables.length!==1||!movable.has(other.status)||String(other.id)===String(target.id)))continue;
   const key=[id,num,[...work].sort().join(','),[...changed].sort().join(',')].join('|');
   if(visited.has(key))continue;
   visited.add(key);
   const prevWork=new Set(work);
   const wasChanged=changed.has(id);
   assignment.set(id,[num]);changed.add(id);
   collide.forEach(other=>work.add(String(other.id)));
   if(solve(depth+1))return true;
   assignment.set(id,previous);if(!wasChanged)changed.delete(id);
   work.clear();prevWork.forEach(x=>work.add(x));
  }
  work.add(id);
  return false;
 };
 if(!solve(0))return fail('Aucune réattribution sûre pour les réservations concernées.');
 const changes=[...changed].map(id=>{const r=sameDate.find(x=>String(x.id)===id);return {id,client:r.client,from:r.tables.slice(),to:assignment.get(id).slice(),status:r.status,guests:r.guests}}).filter(x=>x.from.join()!==x.to.join());
 return {ok:true,changes,requiresConfirmation:true,notice:'Simulation uniquement : les tables réelles peuvent avoir changé depuis la synchronisation.'};
};
root.RestoSmartPlacement={simulate:smartPlan};
if(typeof module==='object'&&module.exports)module.exports={simulate:smartPlan};
})(typeof globalThis!=='undefined'?globalThis:this);

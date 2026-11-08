'use strict';
/* Pure report metrics shared by history and PDF. No database or browser writes. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.RestoReportMetrics=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const done=new Set(['completed','released']);
 const hotelTypes=new Set(['hotel','chambre','interne']);
 function calculate(records,shifts){
  const entries=Array.isArray(records)?records:[];
  const served=entries.filter(r=>done.has(r.status));
  const seated=entries.filter(r=>r.status==='seated');
  const sum=items=>items.reduce((n,r)=>n+Number(r.guests||0),0);
  const hotel=served.filter(r=>hotelTypes.has(r.type));
  const walkins=served.filter(r=>r.walkIn);
  const noShow=entries.filter(r=>r.status==='no_show');
  const cancelled=entries.filter(r=>r.status==='cancelled');
  const expected=entries.filter(r=>['reserved','confirmed','late','arrived'].includes(r.status));
  const serviceOf=r=>{
   const time=r.time||'';
   for(const key of ['lunch','dinner']){
    const shift=shifts?.[key];
    if(shift?.enabled&&time>=shift.start&&time<=shift.end)return key;
   }
   return 'other';
  };
  const lunch=served.filter(r=>serviceOf(r)==='lunch');
  const dinner=served.filter(r=>serviceOf(r)==='dinner');
  const other=served.filter(r=>serviceOf(r)==='other');
  const covers=sum(served),inRoomCovers=sum(seated);
  const serviceDays=new Set(served.map(r=>r.date)).size;
  return {entries,served,seated,hotel,walkins,noShow,cancelled,expected,
   covers,inRoomCovers,welcomedCovers:covers+inRoomCovers,
   hotelCovers:sum(hotel),walkinCovers:sum(walkins),walkinPassages:walkins.length,
   completedInstallations:served.length,noShowCount:noShow.length,cancelledCount:cancelled.length,
   pendingCount:expected.length+seated.length,serviceDays,
   averagePerServiceDay:serviceDays?covers/serviceDays:0,
   lunch,dinner,other,lunchCovers:sum(lunch),dinnerCovers:sum(dinner),otherCovers:sum(other)};
 }
 return {calculate};
});

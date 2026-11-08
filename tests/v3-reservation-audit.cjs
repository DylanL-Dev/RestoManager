'use strict';
const assert=require('node:assert/strict');
const E=require('../reservation-engine.js');
let count=0;
const check=(condition,message)=>{assert.ok(condition,message);count++};
const date='2026-11-04';
const base=(i,table=1,time='19:00')=>({id:'r'+i,type:'exterieur',client:'Client '+i,date,time,guests:2,duration:90,tables:[table],status:'reserved'});
for(let i=0;i<500;i++){
 const table=E.TABLES[i%E.TABLES.length],b=base(i,table,'19:00');
 check(E.validate(b,[]).valid,'Valid reservation '+i);
 check(!E.validate({...b,guests:E.CAPACITY[table]+1},[]).valid,'Capacity overflow '+i);
 check(!E.validate({...b,time:'18:00'},[]).valid,'Outside shifts '+i);
 check(!E.validate({...b,id:'next'+i,time:'19:30'},[b]).valid,'Overlap '+i);
}
for(let i=0;i<200;i++){
 const a=base(i,1,'19:00'),b=base(i+500,1,'20:30');
 check(E.validate(b,[a]).valid,'Adjacent bookings '+i);
 check(E.transition(a,'seated','2026-11-04T19:00:00',[]).valid,'Seating '+i);
 check(!E.transition(a,'released').valid,'Forbidden transition '+i);
 check(E.transition({...a,status:'seated'},'released').valid,'Release '+i);
}
console.log('PASS '+count+' reservation-engine assertions (2000 baseline + 800 transitions/boundaries)');

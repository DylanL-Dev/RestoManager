'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../service-v3.js'),'utf8');
const begin=source.indexOf('const rushStatuses='),end=source.indexOf('function settings()',begin);
assert.ok(begin>=0&&end>begin);
const build=new Function('currentMinutes','rushLocalDate','relevant',source.slice(begin,end)+'\nreturn rushArrivalBreakdown;');
const split=build(()=>236,()=> '2026-11-07',(r,date)=>r.date===date&&['reserved','confirmed','late','arrived','seated'].includes(r.status));
const rows=[
 {date:'2026-11-07',time:'03:10',guests:10,status:'reserved'},
 {date:'2026-11-07',time:'03:30',guests:12,status:'confirmed'},
 {date:'2026-11-07',time:'03:20',guests:2,status:'seated'},
 {date:'2026-11-07',time:'03:45',guests:3,status:'cancelled'}
];
test('at 03:56 distinguish 22 overdue from 2 seated',()=>{
 const result=split('2026-11-07',180,240,rows,236,'2026-11-07');
 assert.deepEqual(result,{planned:24,upcoming:0,late:22,arrived:2,waiting:22});
});
test('future-day reservations are upcoming, not overdue',()=>{
 const result=split('2026-11-08',180,240,rows.map(r=>({...r,date:'2026-11-08'})),236,'2026-11-07');
 assert.equal(result.upcoming,22);
 assert.equal(result.late,0);
});
test('availability check no longer quotes window start for an active slot',()=>{
 assert.match(source,/queryMinutes=isCurrentDay\?Math\.max\(w\.start,nowClock\+1\):w\.start/);
 assert.match(source,/canQuoteAvailability=\(!isCurrentDay\|\|queryMinutes<w\.end\)&&ReservationEngine\.isServiceOpen\(date,queryTime\)/);
 assert.match(source,/time:queryTime,guests:2/);
});

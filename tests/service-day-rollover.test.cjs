'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../service-v3.js'),'utf8');
const start=source.indexOf('const bookingToday=()=>{');
const end=source.indexOf('const bookingNowTime=()=>',start);
assert.ok(start>=0&&end>start,'Paris service date helpers are present');
const helpers=source.slice(start,end);
function getServiceDay(iso){
 class FakeDate extends Date{constructor(...args){super(...(args.length?args:[iso]))}}
 return new Function('Date',helpers+'return {today,bookingToday};')(FakeDate);
}
test('Paris date is authoritative even if browser timezone differs',()=>{
 const p=getServiceDay('2026-11-07T01:20:00Z');
 assert.equal(p.today(),'2026-11-07');
 assert.equal(p.bookingToday(),'2026-11-07');
});
test('from midnight Paris, tables and reservations use the same day',()=>{
 const p=getServiceDay('2026-11-06T23:30:00Z');
 assert.equal(p.bookingToday(),'2026-11-07');
 assert.equal(p.today(),'2026-11-07');
});
test('after 01:00 Paris, service remains on the same calendar day',()=>{
 const p=getServiceDay('2026-11-07T00:01:00Z');
 assert.equal(p.today(),'2026-11-07');
});
test('New Year rolls over at Paris midnight',()=>{
 const p=getServiceDay('2026-12-31T23:30:00Z');
 assert.equal(p.bookingToday(),'2027-01-01');
 assert.equal(p.today(),'2027-01-01');
});
test('background, minute timer and realtime refresh check service day',()=>{
 assert.match(source,/setInterval\(syncServiceDay,60000\)/);
 assert.match(source,/visibilitychange[^\n]+syncServiceDay\(\)/);
 assert.match(source,/restomanager:v3-change'[^\n]+syncServiceDay\(\)/);
 assert.match(source,/if\(changed\)\{date=next;bookings=readReservations\(\)\.filter\(r=>r\.date===date\);\}/);
 assert.match(source,/if\(changed\)render\(\)/);
});

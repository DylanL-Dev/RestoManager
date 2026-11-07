'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../service-v3.js'),'utf8');
const start=source.indexOf('function suggestions(candidate,all,ignoreId){');
const end=source.indexOf('function progress(data)',start);
assert.ok(start>=0&&end>start);
const body=source.slice(start,end).replace("new Date()","new Date('2026-11-07T02:41:00Z')");
const mins=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
const engine={rankedTableChoices:()=>[{numbers:[1],capacity:2}],validate:()=>({valid:true}),getDefaultDuration:()=>90};
const app={RestoFusion:{pairs:()=>[]},RestoBookingInterval:()=>null};
const suggestions=new Function('service','mins','clock','evaluate','ReservationEngine','TableStore','window',body+'\nreturn suggestions;')(
 ()=>({start:'02:00',end:'06:00'}),mins,clock,()=>({current:0,limit:22,blocked:false}),engine,{get:()=>({tables:[{number:1,capacity:2}]})},app);
test('no past alternative for today's 03:41 local time',()=>{
 const items=suggestions({date:'2026-11-07',time:'03:45',guests:2},[]);
 assert.ok(items.length);
 assert.ok(items.every(i=>mins(i.at)>3*60+41));
 assert.equal(items[0].at,'04:15');
});
test('earlier clock time is still valid for a future reservation date',()=>{
 const items=suggestions({date:'2026-11-08',time:'03:45',guests:2},[]);
 assert.ok(items.some(i=>i.at==='03:15'));
});
test('modal choice updates time without submitting reservation',()=>{
 assert.match(source,/done\(\{suggestedTime:item\.at\}\)/);
 assert.match(source,/timeField\.value=newTime/);
 assert.match(source,/timeField\.dispatchEvent\(new Event\('change'/);
 assert.match(source,/feedback\.textContent='Nouvel horaire sélectionné/);
});

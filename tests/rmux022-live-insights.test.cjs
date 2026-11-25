'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
test('RM-UX-02.2a: PWA fixture identifies every cache naming format without weakening production SW',()=>{
 const source=read('tests/browser/rm013a-management.cjs'),worker=read('sw.js');
 assert.ok(source.includes("/const CACHE='restomanager-shell-[^']+';/"));
 for(const v of ['20261124-dev-rm0203','20261124-dev-rmux02.2a','20261124-prod-release']){
  const input=worker.replace(/const CACHE='[^']+';/,"const CACHE='restomanager-shell-"+v+"';");
  const output=input.replace(/const CACHE='restomanager-shell-[^']+';/,"const CACHE='restomanager-shell-rm-fixture2';");
  assert.match(output,/const CACHE='restomanager-shell-rm-fixture2';/);
  assert.match(output,/v3-connected\.html/);
 }
});
test('RM-UX-02.2a: gauge uses actual occupied tables, not estimated availability',()=>{
 assert.match(read('service-v3.js'),/gauge.dataset.rmGaugeValue=String\(Math.max\(0,Math.min\(100,tablesPercent\)\)\)/);
 assert.match(read('reception-service-overview.js'),/const count=tables.length-free,percent=Math.round\(count\/tables.length\*100\)/);
 assert.match(read('reception-service-overview.js'),/ne garantit pas la disponibilité/);
 assert.match(read('service-v3-motion.js'),/previous\?\.value!==value/);
 assert.match(read('service-v3.css'),/prefers-reduced-motion:reduce/);
});

test('RM-UX-02.2b: arrivals use the existing schedule, breakdown and shared threshold',()=>{
 const s=read('service-v3.js'),rec=read('reception-service-overview.js');
 assert.match(s,/function arrivalTimeline\(date,all,windows=arrivalWindows\(date\),limit\)/);
 assert.match(s,/rows=windows.slice\(index,index\+3\).map\(w=>\(\{w,\.\.\.rushArrivalBreakdown/);
 assert.match(s,/Le seuil n’est pas une garantie de disponibilité/);
 assert.match(rec,/RestoRush\?\.timeline\?\.\(today,list\)/);
});
test('RM-UX-02.2b: notification animation is keyed to new unread ids and respects reduced motion',()=>{
 const js=read('service-v3-reminders.js');
 assert.match(js,/!previousVisibleIds.has\(item.id\)&&!item.read/);
 assert.match(js,/previousUnread!==count/);
 assert.match(js,/prefers-reduced-motion: reduce/);
});

test('RM-UX-02.2c: advice is based on shared counts, prioritises overdue and fails closed on stale data',()=>{
 const s=read('service-v3.js'),start=s.indexOf('function serviceAdvice('),end=s.indexOf('function arrivalTimeline(',start);
 const advice=new Function('clock',s.slice(start,end)+'\nreturn serviceAdvice;')(n=>String(n));
 const rows=[{w:{start:1140},planned:22},{w:{start:1200},planned:10}];
 const info={rows,limit:22};
 assert.equal(advice({...info,fresh:false}).kind,'unknown');
 assert.equal(advice({...info,finished:true}).title,'Dernier créneau terminé');
 assert.equal(advice({...info,overdue:3}).title,'Arrivées en retard à vérifier');
 assert.equal(advice(info).kind,'attention');
 assert.match(advice(info).detail,/vérifier les disponibilités/);
 assert.equal(advice({rows:[{w:{start:1140},planned:18}],limit:22}).kind,'watch');
 assert.equal(advice({rows:[{w:{start:1140},planned:10}],limit:22}).kind,'neutral');
 assert.equal(advice({...info,limit:0}),null);
});
test('RM-UX-02.2c: placeholders only during actual load; no fake metrics or controls',()=>{
 const s=read('service-v3.js'),rec=read('reception-service-overview.js');
 assert.match(s,/if\(kind==='loading'\)\{const skeleton/);
 assert.match(rec,/!Array.isArray\(info\)&&window.RestoSyncState==='pending'/);
 assert.match(s,/skeleton.setAttribute\('aria-hidden','true'\)/);
 assert.match(read('service-v3.css'),/\.rmServiceSkeleton span\{animation:none!important\}/);
});

test('RM-UX-02.2d: exact service shortcut protects navigation and does not write',async()=>{
 const s=read('service-v3-reservations.js'),start=s.indexOf('window.RestoOpenServiceReservation=async function'),end=s.indexOf('// Notifications navigate',start);
 const run=new Function('window','load','$','notify','errorMessage','departedStatuses','render', 'let reservationView,expanded;'+s.slice(start,end)+'return ()=>({reservationView,expanded});');
 let allowed=false,loads=0,renders=0,focus=0,scroll=0;
 const target={id:'second',date:'2032-11-08',status:'confirmed'},fields={reservationQuery:{value:'same name'},reservationDate:{value:''},reservationList:{querySelectorAll:()=>[{dataset:{rmMotionKey:'first'}},{dataset:{rmMotionKey:'second'},querySelector:()=>({focus:()=>focus++}),scrollIntoView:()=>scroll++}]}};
 const win={RestoScreens:{request:async()=>allowed},matchMedia:()=>({matches:true})};
 const state=run(win,()=>{loads++;return [{...target,id:'first'},target]},id=>fields[id],()=>{},String,new Set(),()=>renders++);
 assert.equal(await win.RestoOpenServiceReservation('second'),false);assert.equal(loads,0);
 allowed=true;assert.equal(await win.RestoOpenServiceReservation('second'),true);
 assert.deepEqual(state(),{reservationView:'upcoming',expanded:'second'});
 assert.equal(fields.reservationQuery.value,'');assert.equal(fields.reservationDate.value,target.date);
 assert.equal(renders,1);assert.equal(focus,1);assert.equal(scroll,1);
 assert.equal(await win.RestoOpenServiceReservation('missing'),false);assert.equal(renders,1);
 assert.match(read('service-v3.js'),/RestoOpenServiceReservation\?\.\(String\(r.id\)\)/);
 assert.match(read('reception-service-overview.js'),/RestoOpenServiceReservation\?\.\(String\(r.id\)\)/);
});

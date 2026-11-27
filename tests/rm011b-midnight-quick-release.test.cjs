'use strict';
// Run the actual quick-release controller against a tiny DOM / Realtime fixture.
// No real restaurant data, network requests or Supabase mutations are involved.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../service-v3-quick-release.js'),'utf8');
function node(tag='div'){
 return {tag,children:[],listeners:{},className:'',value:'',disabled:false,hidden:false,
   style:{},textContent:'',innerHTML:'',
   append(...children){this.children.push(...children)},
   prepend(...children){this.children.unshift(...children)},
   replaceChildren(...children){this.children=[...children]},
   addEventListener(event,callback){this.listeners[event]=callback},
   setAttribute(){},remove(){},focus(){},click(){return this.listeners.click?.()}};
}
function setup(){
 const ids=new Map();
 for(const id of ['passages','quickReleaseSearch','quickReleaseSort','quickReleaseCount','quickReleaseUndo','quickReleaseList','quickReleaseFeedback'])
  ids.set(id,node());
 ids.get('passages').parentNode={insertBefore(){}};
 ids.get('quickReleaseSort').value='table';
 ids.set('integrationGate',node());
 const handlers={},docHandlers={},timers=[];
 let now='2026-11-14T22:59:00Z';
 class FakeDate extends Date{
  constructor(...args){super(...(args.length?args:[now]))}
  static now(){return Date.parse(now)}
 }
 const reservations=[
  {id:'yesterday',date:'2026-11-14',time:'20:00',status:'seated',client:'Client fictif précédent',guests:2,tables:[1],duration:90,seatedAt:'2026-11-14T19:05:00Z'},
  {id:'today',date:'2026-11-15',time:'00:15',status:'seated',client:'Client fictif nouveau',guests:2,tables:[2],duration:90,seatedAt:'2026-11-14T23:15:00Z'},
  {id:'departed',date:'2026-11-15',time:'00:05',status:'released',client:'Parti',guests:2,tables:[3],duration:90}
 ];
 const calls=[];
 const engine={
  normalizeReservations:list=>list,getDefaultDuration:()=>90,
  transition:(r,status,at)=>({valid:true,reservation:{...r,status,updatedAt:at}})
 };
 const window={
  ReservationEngine:engine,RestoSharedReservations:reservations,
  RestoSupabaseReady:true,
  RestoChangeSharedStatus:async (previous,status)=>{
   calls.push({id:previous.id,status});
   const saved=reservations.find(r=>r.id===previous.id);
   if(saved)saved.status=status;
   window.dispatchEvent({type:'restomanager:supabase-snapshot'});
  },
  addEventListener(type,fn){(handlers[type]??=[]).push(fn)},
  dispatchEvent(event){for(const fn of handlers[event.type]||[])fn(event)}
 };
 const document={
  hidden:false,
  getElementById:id=>ids.get(id)||null,
  createElement:node,
  addEventListener(type,fn){docHandlers[type]=fn}
 };
 const context={window,document,ReservationEngine:engine,TableStore:{get:()=>({tables:[]})},
  localStorage:{getItem:()=>null,setItem(){}},
  navigator:{onLine:true},
  Intl,Date:FakeDate,console,
  setInterval(fn,ms){timers.push({fn,ms})}};
 vm.runInNewContext(source,context,{filename:'service-v3-quick-release.js'});
 function rows(){
  return ids.get('quickReleaseList').children.filter(row=>row.className==='quickReleaseRow').map(row=>({
   name:row.children[0].children[1].textContent,
   button:row.children[1].children.at(-1)
  }));
 }
 return {ids,rows,calls,reservations,timers,window,document,docHandlers,
  setTime(value){now=value;for(const timer of timers)if(timer.ms===60000)timer.fn()}};
}
test('RM-011-B: 23:59 -> 00:30 -> 01:15 Paris keeps old and new seated tables and hides departures',()=>{
 const x=setup();
 assert.equal(x.ids.get('quickReleaseCount').textContent,2);
 x.setTime('2026-11-14T23:30:00Z'); // 00:30, 15 November in Paris
 assert.equal(x.ids.get('quickReleaseCount').textContent,2);
 assert.equal(x.rows().length,2);
 assert.ok(x.rows().some(r=>r.name.includes('Client fictif précédent')));
 assert.ok(x.rows().some(r=>r.name.includes('Client fictif nouveau')));
 assert.ok(x.rows().every(r=>!r.name.includes('Parti')));
 x.setTime('2026-11-15T00:15:00Z'); // 01:15 Paris
 assert.equal(x.rows().length,2,'seated party from yesterday must not disappear at 01:00');
 assert.equal(x.ids.get('quickReleaseCount').textContent,2);
});
test('RM-011-B: both date cohorts can be released individually, including after Paris midnight',async()=>{
 const x=setup();
 x.setTime('2026-11-14T23:30:00Z');
 const first=x.rows().find(r=>r.name.includes('Client fictif nouveau'));
 await first.button.click();
 assert.deepEqual(x.calls.map(c=>c.id),['today']);
 assert.equal(x.ids.get('quickReleaseCount').textContent,1);
 const yesterday=x.rows().find(r=>r.name.includes('Client fictif précédent'));
 await yesterday.button.click();
 assert.deepEqual(x.calls.map(c=>c.id),['today','yesterday']);
 assert.equal(x.rows().length,0);
 assert.equal(x.ids.get('quickReleaseCount').textContent,0);
});
test('RM-011-B: visibility, focus and shared Supabase snapshots refresh the live release panel',()=>{
 const x=setup();
 assert.ok(x.timers.some(t=>t.ms===60000));
 x.window.RestoSharedReservations.push({id:'another',date:'2026-11-13',time:'21:00',status:'seated',client:'Fictif',guests:1,tables:[4],seatedAt:'2026-11-13T20:00:00Z'});
 x.window.dispatchEvent({type:'restomanager:supabase-snapshot'});
 assert.equal(x.rows().length,3);
 x.window.RestoSharedReservations.find(r=>r.id==='another').status='released';
 x.window.dispatchEvent({type:'focus'});
 assert.equal(x.rows().length,2);
 x.document.hidden=false;x.docHandlers.visibilitychange();
 assert.equal(x.rows().length,2);
});
test('RM-011-B: live floor includes all seated cohorts, not old cancelled or old reserved',()=>{
 const app=fs.readFileSync(require('node:path').join(__dirname,'../service-v3.js'),'utf8');
 const start=app.indexOf('function visibleServiceReservations('),end=app.indexOf('let date=today();',start);
 assert.ok(start>=0&&end>start);
 const live=new Function(app.slice(start,end)+'return visibleServiceReservations')();
 const records=[
  {id:'old-occupied',date:'2026-11-14',status:'seated'},
  {id:'new-occupied',date:'2026-11-15',status:'seated'},
  {id:'past-cancelled',date:'2026-11-14',status:'cancelled'},
  {id:'old-expected',date:'2026-11-14',status:'reserved'}];
 assert.deepEqual(live(records,'2026-11-15').map(x=>x.id),['old-occupied','new-occupied']);
 assert.deepEqual(live(records,'2026-11-16').map(x=>x.id),['old-occupied','new-occupied']);
});

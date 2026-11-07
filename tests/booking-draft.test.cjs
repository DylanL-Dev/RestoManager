const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('maintenir, prolonger, expirer, revérifier, valider et abandonner une fusion',async()=>{
 const fields=new Map();
 function element(id){
  if(!fields.has(id))fields.set(id,{
   dataset:{},listeners:{},
   addEventListener(name,fn){this.listeners[name]=fn},
   querySelector(){return element('submit')},reset(){}
  });
  return fields.get(id);
 }
 const date='2032-11-06',time='19:30',guests=3;
 Object.entries({bookingDate:date,bookingTime:time,bookingGuests:'3',bookingTable:'2,3'}).forEach(([id,value])=>element(id).value=value);
 const events={};
 const window={RestoReception:true,RestoSupabaseReady:true,RestoScreens:{current:()=>'reservationForm'},addEventListener:(name,fn)=>events[name]=fn,dispatchEvent(){}};
 let now=0,interval,debounced;
 class Clock extends Date{static now(){return now}}
 const api=vm.runInNewContext(fs.readFileSync(require.resolve('../booking-draft.js'),'utf8').replace(/^import[^\n]+\n/m,'').replace('export function','(function')+')',{
  window,document:{getElementById:element,addEventListener(){},visibilityState:'visible'},navigator:{onLine:true},Date:Clock,Event,crypto:require('node:crypto').webcrypto,
  encodeBookingDetails:()=>'',
  TableStore:{get:()=>({tables:[{id:'a',number:2},{id:'b',number:3}]})},
  ReservationEngine:{getDefaultDuration:()=>45},
  setTimeout:f=>(debounced=f),clearTimeout:()=>{},setInterval:f=>(interval=f)
 });
 const calls=[];
 let unblock;let delayRelease=false;
 const draft=api({rpc:async(_name,args)=>{
  calls.push(args.p_action);
  if(delayRelease&&args.p_action==='release')await new Promise(resolve=>unblock=resolve);
  return {data:{tables:['a','b'],holds:['h1','h2'],seconds:180}};
 }},(d,t)=>d+'T'+t+':00.000Z');
 const type=async()=>{element('bookingForm').listeners.input();await debounced()};
 await type();assert.deepEqual(calls,['hold']);assert.match(element('draftMessage').textContent,/2 \+ 3.*3 min 00/);
 await element('draftExtend').listeners.click();assert.equal(calls.at(-1),'extend');
 now+=181000;interval();assert.equal(element('draftExtend').textContent,'Revérifier');
 const candidate={client:'TEST',date,time,guests,tables:[2,3]};
 await assert.rejects(draft.confirm(candidate),/expiré/);
 await element('draftExtend').listeners.click();assert.deepEqual(calls.slice(-2),['release','hold']);
 await draft.confirm(candidate);assert.equal(calls.at(-1),'confirm');
 await type();
 window.RestoDraftHolds=[{id:'h1',number:2,expiry:now+180000,start:1,end:3},{id:'other',number:3,expiry:now+180000,start:1,end:3,team:'Réception'}];
 delayRelease=true;
 const pending=element('draftAbandon').listeners.click();
 interval();assert.equal(element('bookingDraft').hidden,true);
 await new Promise(resolve=>setImmediate(resolve));unblock();await pending;
 assert.equal(calls.at(-1),'release');
 assert.deepEqual(Array.from(draft.occupied([2,3],1,3),h=>h.id),['other']);
 delayRelease=false;await type();
 element('reservationForm').listeners.toggle({currentTarget:{open:false}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.at(-1),'release');
 await type();events['restomanager:screen']({detail:'tables'});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.at(-1),'release');assert.equal(element('bookingDraft').hidden,true);
});

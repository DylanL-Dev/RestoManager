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
 const window={RestoReception:true,RestoSupabaseReady:true,RestoScreens:{current:()=>'reservationForm'},addEventListener(){},dispatchEvent(){}};
 let now=0,interval,debounced;
 class Clock extends Date{static now(){return now}}
 const api=vm.runInNewContext(fs.readFileSync(require.resolve('../booking-draft.js'),'utf8').replace('export function','(function')+')',{
  window,document:{getElementById:element},Date:Clock,Event,crypto:require('node:crypto').webcrypto,
  TableStore:{get:()=>({tables:[{id:'a',number:2},{id:'b',number:3}]})},
  ReservationEngine:{getDefaultDuration:()=>45},
  setTimeout:f=>(debounced=f),clearTimeout:()=>{},setInterval:f=>(interval=f)
 });
 const calls=[];
 const draft=api({rpc:async(_name,args)=>{
  calls.push(args.p_action);
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
 await type();await element('draftAbandon').listeners.click();assert.equal(calls.at(-1),'release');assert.equal(element('bookingDraft').hidden,true);
});

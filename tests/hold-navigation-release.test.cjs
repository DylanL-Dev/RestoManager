'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../booking-draft.js'),'utf8')
 .replace(/^import[^\n]+\n/,'').replace('export function setupBookingDraft','function setupBookingDraft');
const factory=new Function('document','window','navigator','setInterval','setTimeout','clearTimeout','crypto','Date','TableStore','ReservationEngine','Event','encodeBookingDetails','supabase','parisDateTime',source+'\nreturn setupBookingDraft');
function setup(deferHold=false){
 const items=new Map(),calls=[],timers=[],docEvents={},winEvents={};let screen='reservationForm',resolveHold;
 const mk=id=>({id,value:'',dataset:{},hidden:false,disabled:false,textContent:'',listeners:{},addEventListener(t,f){this.listeners[t]=f},querySelector(){return submit},reset(){}});
 const submit=mk('submit');
 for(const id of ['bookingForm','bookingDraft','draftMessage','draftExtend','draftAbandon','bookingDate','bookingTime','bookingGuests','bookingTable','bookingFeedback','reservationForm'])items.set(id,mk(id));
 items.get('bookingDate').value='2027-02-10';items.get('bookingTime').value='19:00';items.get('bookingGuests').value='1';items.get('bookingTable').value='2';
 const doc={visibilityState:'visible',getElementById:id=>items.get(id),addEventListener(t,f){docEvents[t]=f}};
 const win={RestoSupabaseReady:true,RestoReception:false,RestoScreens:{current:()=>screen},RestoDraftHolds:[],addEventListener(t,f){winEvents[t]=f},dispatchEvent(){},RestoRefreshSharedService:async()=>{}};
 const supabase={rpc:async(_,a)=>{calls.push(a.p_action);if(a.p_action==='hold')return deferHold?new Promise(ok=>{resolveHold=ok}):{data:{holds:['hold1'],tables:['table2'],seconds:180},error:null};return {data:{},error:null}}};
 const api=factory(doc,win,{onLine:true},()=>0,fn=>timers.push(fn),()=>{}, {randomUUID:()=> 'test-key'},Date,{get:()=>({tables:[{id:'table2',number:2}]})},{getDefaultDuration:()=>90},class Event{},()=>'',supabase,()=>new Date('2027-02-10T18:00:00Z').toISOString())(supabase,()=>new Date('2027-02-10T18:00:00Z').toISOString());
 return {api,items,calls,timers,doc,docEvents,winEvents,depart(){screen='tables';winEvents['restomanager:screen']({detail:'tables'})},finishHold(){resolveHold({data:{holds:['hold1'],tables:['table2'],seconds:180},error:null})}};
}
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve()};
test('leaving the reservation screen releases the hold',async()=>{
 const t=setup();t.items.get('bookingForm').listeners.input({});t.timers[0]();await flush();t.depart();await flush();
 assert.deepEqual(t.calls,['hold','release']);
 assert.equal(t.items.get('bookingDraft').hidden,true);
});
test('backgrounding the browser releases the hold',async()=>{
 const t=setup();t.items.get('bookingForm').listeners.input({});t.timers[0]();await flush();
 t.doc.visibilityState='hidden';t.docEvents.visibilitychange();await flush();
 assert.deepEqual(t.calls,['hold','release']);
});
test('leaving while hold is in flight releases it on completion',async()=>{
 const t=setup(true);t.items.get('bookingForm').listeners.input({});t.timers[0]();await flush();
 t.depart();t.finishHold();await flush();
 assert.deepEqual(t.calls,['hold','release']);
 assert.equal(t.api.pinned('2027-02-10','19:00',1),null);
});

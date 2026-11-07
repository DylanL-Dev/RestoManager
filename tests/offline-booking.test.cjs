'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'../booking-draft.js'),'utf8')
 .replace(/^import[^\n]+\n/,'')
 .replace('export function setupBookingDraft','function setupBookingDraft');
const factory=new Function('document','window','navigator','setInterval','setTimeout','clearTimeout','crypto','Date',
 'TableStore','ReservationEngine','Event','encodeBookingDetails','supabase','parisDateTime',
 source+'\nreturn setupBookingDraft');

function setup(){
 const elements=new Map(),calls=[];
 const mk=id=>({id,hidden:true,value:'',dataset:{},disabled:false,textContent:'',listeners:{},
  addEventListener(type,cb){this.listeners[type]=cb},dispatchEvent(){}});
 const submit=mk('submit');
 for(const id of ['bookingForm','bookingDraft','draftMessage','draftExtend','draftAbandon','bookingDate',
  'bookingTime','bookingGuests','bookingTable','bookingFeedback','reservationForm'])elements.set(id,mk(id));
 elements.get('bookingForm').querySelector=()=>submit;
 elements.get('bookingForm').reset=()=>{};
 const app={RestoSupabaseReady:true,RestoReception:false,RestoScreens:{current:()=>'reservationForm'},
  RestoDraftHolds:[],listeners:{},addEventListener(type,cb){this.listeners[type]=cb},dispatchEvent(){}};
 const navigator={onLine:true};
 const document={getElementById:id=>elements.get(id),addEventListener(){},visibilityState:'visible'};
 const supabase={async rpc(...args){calls.push(args);return {data:{},error:null}}};
 const create=factory(document,app,navigator,()=>0,()=>1,()=>{}, {randomUUID:()=>'test-key'},Date,
  {get:()=>({tables:[]})},{getDefaultDuration:()=>90},class Event{},()=>'',supabase,
  ()=>new Date().toISOString());
 return {api:create(supabase,()=>new Date().toISOString()),app,navigator,elements,calls,submit};
}

test('offline confirm never reaches Supabase',async()=>{
 const t=setup();
 t.navigator.onLine=false;t.app.RestoSupabaseReady=false;
 await assert.rejects(t.api.confirm({}),/Connexion interrompue/);
 assert.equal(t.calls.length,0);
});

test('network loss disables booking and requires fresh confirmation',async()=>{
 const t=setup();
 t.elements.get('bookingForm').listeners.input({});
 t.navigator.onLine=false;t.app.RestoSupabaseReady=false;t.app.listeners.offline();
 assert.equal(t.submit.disabled,true);
 assert.match(t.elements.get('draftMessage').textContent,/revérifié après reconnexion/);
 assert.equal(t.calls.length,0);
 t.navigator.onLine=true;t.app.listeners.online();
 assert.equal(t.submit.disabled,false);
 await assert.rejects(t.api.confirm({}),/Connexion interrompue/);
 assert.equal(t.calls.length,0);
});

test('abandoning offline does not attempt to release a hold over a dead network',async()=>{
 const t=setup();
 t.elements.get('bookingForm').listeners.input({});
 t.navigator.onLine=false;t.app.RestoSupabaseReady=false;
 await t.elements.get('draftAbandon').listeners.click();
 assert.equal(t.calls.length,0);
 assert.match(t.elements.get('bookingFeedback').textContent,/expir(e|era)/);
});

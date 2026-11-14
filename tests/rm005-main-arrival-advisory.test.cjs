'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'service-v3-arrival-preview.js'),'utf8');
const html=fs.readFileSync(path.join(root,'v3-connected.html'),'utf8');

function init(){
 const fields=new Map();
 const makeElement=(tag)=>{
  const node={
   tag,children:[],dataset:{},attributes:{},textContent:'',value:'',
   append(...nodes){this.children.push(...nodes)},
   prepend(...nodes){this.children.unshift(...nodes)},
   setAttribute(k,v){this.attributes[k]=v},
   querySelector(){return null},
   insertAdjacentElement(_where,node){this.children.push(node)},
   addEventListener(event,callback){(this.listeners??={})[event]=callback},
  };
  return node;
 };
 const booking=makeElement('form'),walkin=makeElement('form');
 fields.set('bookingForm',booking);fields.set('walkinForm',walkin);
 for(const [id,value] of [['bookingDate','2026-11-14'],['bookingTime','19:00']])
   {const x=makeElement('input');x.value=value;fields.set(id,x)}
 const document={
  getElementById(id){return fields.get(id)||null},
  createElement:makeElement,
 };
 const calls=[],window={
  RestoSharedDataLoaded:false,RestoSharedReservations:[],
  RestoSyncState:'ok',
  RestoRush:{evaluate(query){calls.push(query);return {current:18,limit:20}}},
  ReservationEngine:{normalizeReservations(arr){return arr}},
  lucide:{createIcons(){}},
  addEventListener(event,callback){(this.listeners??={})[event]=callback},
 };
 const navigator={onLine:true};
 vm.runInNewContext(source,{document,window,navigator,Intl,Date,Number,Array,Math,Map,Object,String}, {timeout:1500});
 const bookingPreview=booking.children.find(x=>x.id==='rmBookingArrivalPreview');
 const walkinPreview=walkin.children.find(x=>x.id==='rmWalkinArrivalPreview');
 assert.ok(bookingPreview&&walkinPreview,'Both forms must receive a preview');
 const textOf=box=>box.children.find(x=>x.tag==='p')?.textContent;
 return {window,fields,calls,navigator,bookingPreview,walkinPreview,textOf};
}

test('RM-005 MAIN loads only advisory resources, not the weekly editor',()=>{
 assert.match(html,/service-v3-arrival-preview\.css\?v=20261114-main-advisory1/);
 assert.match(html,/service-v3-arrival-preview\.js\?v=20261114-(?:main-advisory1|rm008-closed1)/);
 // The complete RM-005 preview is staged after backend compatibility checks.
 if(html.includes('service-v3-weekly-schedule.js')){
  assert.match(html,/service-v3-weekly-schedule\.css/);
  assert.match(html,/service-v3-booking-director-choices\.js/);
 }
 assert.doesNotMatch(source,/supabase\.from\(|fetch\(|\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});
test('RM-005 MAIN shows unknown rather than false capacity when no fresh snapshot',()=>{
 const t=init();
 assert.equal(t.bookingPreview.dataset.level,'unknown');
 assert.match(t.textOf(t.bookingPreview),/informations à vérifier/i);
 assert.equal(t.calls.length,0);
});
test('RM-005 MAIN shows immediate arrival pressure before party-size selection',()=>{
 const t=init();t.window.RestoSharedDataLoaded=true;
 t.window.RestoArrivalPreviewRefresh();
 assert.equal(t.bookingPreview.dataset.level,'busy');
 assert.match(t.textOf(t.bookingPreview),/18\/20 couverts attendus/);
 assert.ok(!t.fields.has('bookingGuests'),'The warning is independent of cover selection');
 assert.ok(t.calls.some(c=>c.guests===0&&c.time==='19:00'));
 const walkin=t.calls.find(c=>c.date==='2026-11-14'&&c.time!=='19:00');
 assert.ok(t.walkinPreview.dataset.level!=='unknown'||t.calls.length>=2,'Walk-in uses the current Paris clock');
});
test('RM-005 MAIN falls back safely on offline, missing time, and calculation failures',()=>{
 const t=init();t.window.RestoSharedDataLoaded=true;
 t.fields.get('bookingTime').value='';
 t.window.RestoArrivalPreviewRefresh();
 assert.equal(t.bookingPreview.dataset.level,'unknown');
 assert.match(t.textOf(t.bookingPreview),/Choisissez un créneau/);
 t.fields.get('bookingTime').value='19:00';
 t.navigator.onLine=false;t.window.RestoArrivalPreviewRefresh();
 assert.equal(t.bookingPreview.dataset.level,'unknown');
 t.navigator.onLine=true;
 t.window.RestoRush.evaluate=()=>{throw new Error('test only: invalid cached snapshot')};
 assert.doesNotThrow(()=>t.window.RestoArrivalPreviewRefresh());
 assert.equal(t.bookingPreview.dataset.level,'unknown');
});

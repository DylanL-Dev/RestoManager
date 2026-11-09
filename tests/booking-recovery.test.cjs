const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const errors=require('../resto-errors.js');
const source=fs.readFileSync(require.resolve('../booking-draft.js'),'utf8').replace(/^import[^\n]+\n/,'').replace('export function','(function')+')';
function fixture({storage=new Map(),rpc=async()=>({data:{}})}={}){
 const elements=new Map(),events={},documentEvents={},calls=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{id,value:'',dataset:{},listeners:{},hidden:false,disabled:false,textContent:'',addEventListener(k,cb){this.listeners[k]=cb},querySelector(){return element('submit')},reset(){}});return elements.get(id)};
 const date='2032-11-06',time='19:30';
 for(const [id,value] of Object.entries({bookingDate:date,bookingTime:time,bookingGuests:'2',bookingTable:'2',bookingNotes:'Note fictive',bookingAllergies:'Allergie fictive'}))element(id).value=value;
 const navigator={onLine:true};let debounced,interval;
 const window={RestoSupabaseReady:true,RestoErrors:errors,RestoScreens:{current:()=>'reservationForm'},RestoDraftHolds:[],sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},addEventListener(k,cb){events[k]=cb},dispatchEvent(){},confirm:()=>true};
 let uuid=0;
 const create=vm.runInNewContext(source,{window,navigator,document:{getElementById:element,visibilityState:'visible',addEventListener(k,cb){documentEvents[k]=cb}},Date,Event,crypto:{randomUUID:()=>`operation-${++uuid}`},encodeBookingDetails:c=>JSON.stringify(c),TableStore:{get:()=>({tables:[{id:'table-a',number:2}]})},ReservationEngine:{getDefaultDuration:()=>90},setTimeout:f=>(debounced=f),clearTimeout(){},setInterval:f=>(interval=f)});
 const api=create({async rpc(name,args){calls.push({name,args});if(name==='booking_draft_v3'&&args.p_action==='hold'){const custom=await rpc(name,args);return custom||{data:{tables:['table-a'],holds:['hold-a'],seconds:180}}}if(name==='booking_draft_v3'&&args?.p_action==='release'){const result=await rpc(name,args);return result?.data?.state?result:{data:{state:'released'}}}return rpc(name,args)}},(d,t)=>d+'T'+t+':00.000Z');
 const type=async id=>{element('bookingForm').listeners.input({target:element(id||'bookingGuests')});return debounced()};
 return {api,storage,element,events,window,navigator,calls,type,interval,candidate:{client:'Invité fictif',type:'exterieur',date,time,guests:2,notes:'Note fictive',allergies:'Allergie fictive'}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('lost confirmation response retains only operation identity across offline, close and reload; committed recovery blocks a duplicate',async()=>{
 const storage=new Map();
 const first=fixture({storage,rpc:async(name,args)=>{
  if(args?.p_action==='hold')return null;
  if(args?.p_action==='confirm')throw new TypeError('Failed to fetch');
  if(name==='booking_draft_status_v1')throw new TypeError('Failed to fetch');
  return {data:{}};
 }});
 await assert.rejects(first.api.confirm(first.candidate),/reste à vérifier/);
 const saved=JSON.parse(storage.get('restomanager_pending_booking_v1'));
 assert.deepEqual(Object.keys(saved).sort(),['key','phase']);assert.equal(saved.phase,'confirming');
 assert.doesNotMatch(JSON.stringify(saved),/Invité|Note|Allergie/);
 first.navigator.onLine=false;first.window.RestoSupabaseReady=false;first.events.offline();await first.api.close();
 assert.equal(first.calls.some(c=>c.args?.p_action==='release'),false);
 const second=fixture({storage,rpc:async(name)=>{assert.equal(name,'booking_draft_status_v1');return {data:{state:'committed',reservation_id:'reservation-fiction',expires_at:null}}}});
 await settle();assert.equal(second.element('submit').disabled,true);assert.match(second.element('draftMessage').textContent,/déjà été enregistrée/);
 await assert.rejects(second.api.confirm(second.candidate),/déjà été enregistrée/);
 assert.equal(second.calls.length,1);assert.equal(second.element('bookingNotes').value,'Note fictive');
 second.events['restomanager:supabase-snapshot']();await settle();assert.equal(second.calls.length,1);
 await second.element('draftAbandon').listeners.click();assert.equal(storage.size,0);
});
test('ambiguous response resolved as committed succeeds once with the same operation and no release',async()=>{
 const t=fixture({rpc:async(name,args)=>{
  if(args?.p_action==='hold')return null;
  if(args?.p_action==='confirm')return {error:{message:'network transport'}};
  if(name==='booking_draft_status_v1')return {data:{state:'committed',reservation_id:'fiction'}};
  return {data:{}};
 }});
 await t.api.confirm(t.candidate);
 assert.equal(t.calls.filter(c=>c.args?.p_action==='confirm').length,1);
 const sent=t.calls.find(c=>c.args?.p_action==='confirm').args.p_key;
 assert.equal(t.calls.find(c=>c.name==='booking_draft_status_v1').args.p_key,sent);
 assert.equal(t.calls.some(c=>c.args?.p_action==='release'),false);assert.equal(t.storage.size,0);
 assert.deepEqual(Array.from(t.candidate.tables),[2]);
});
test('a definitively pending failed confirmation releases its original key before a fresh confirmation, preserving input',async()=>{
 let confirms=0;
 const t=fixture({rpc:async(name,args)=>{
  if(args?.p_action==='hold')return null;
  if(args?.p_action==='confirm'&&++confirms===1)return {error:{code:'23P01',details:'ROOM_CONFLICT'}};
  if(name==='booking_draft_status_v1')return {data:{state:'pending'}};
  return {data:{}};
 }});
 await assert.rejects(t.api.confirm(t.candidate),{code:'23P01'});
 assert.equal(t.storage.size,0);assert.equal(t.element('bookingAllergies').value,'Allergie fictive');
 await t.api.confirm(t.candidate);
 const confirmCalls=t.calls.filter(c=>c.args?.p_action==='confirm');assert.equal(confirmCalls.length,2);
 assert.notEqual(confirmCalls[0].args.p_key,confirmCalls[1].args.p_key);
 assert.equal(t.calls.find(c=>c.args?.p_action==='release').args.p_key,confirmCalls[0].args.p_key);
});
test('a late hold for an old form generation is released and cannot pin the new guest count',async()=>{
 let unblock,start;const started=new Promise(r=>start=r);let holds=0;
 const t=fixture({rpc:async(name,args)=>{
  if(args?.p_action==='hold'){
   if(++holds===1){start();await new Promise(r=>unblock=r)}
   return {data:{tables:['table-a'],holds:['hold-'+holds],seconds:180}};
  }
  return {data:{}};
 }});
 const pending=t.type();await started;assert.equal(t.api.checking(),true);
 t.element('bookingGuests').value='4';t.element('bookingForm').listeners.input({target:t.element('bookingGuests')});
 unblock();await pending;await settle();
 assert.equal(t.api.pinned('2032-11-06','19:30',4),null);
 assert.equal(t.calls.some(c=>c.args?.p_action==='release'),true);
 await t.type();assert.deepEqual(Array.from(t.api.pinned('2032-11-06','19:30',4)),[2]);
});
test('reconnection alone keeps confirmation disabled until an authoritative snapshot',()=>{
 const t=fixture();t.navigator.onLine=false;t.window.RestoSupabaseReady=false;t.events.offline();
 t.navigator.onLine=true;t.events.online();assert.equal(t.element('submit').disabled,true);
 t.window.RestoSupabaseReady=true;t.events['restomanager:supabase-snapshot']();assert.equal(t.element('submit').disabled,false);
});

test('a late confirmation winning between pending status and release is recovered as committed, never forgotten',async()=>{
 const t=fixture({rpc:async(name,args)=>{
  if(args?.p_action==='hold')return null;
  if(args?.p_action==='confirm')throw new TypeError('Lost response');
  if(name==='booking_draft_status_v1')return {data:{state:'pending'}};
  if(args?.p_action==='release')return {data:{state:'committed',reservation_id:'late-fiction'}};
  return {data:{}};
 }});
 await t.api.confirm(t.candidate);
 assert.equal(t.calls.filter(c=>c.args?.p_action==='confirm').length,1);
 assert.equal(t.calls.filter(c=>c.args?.p_action==='hold').length,1);
 assert.equal(t.storage.size,0);assert.deepEqual(Array.from(t.candidate.tables),[2]);
});
test('new hotel bookings require a room in the same format as the server; exterior numeric names remain exterior',async()=>{
 for(const name of ['', 'Invité hôtel', '1234567']){
  const t=fixture({rpc:async(_name,args)=>args?.p_action==='hold'?null:{data:{}}});t.candidate.type='hotel';t.candidate.client=name;
  await assert.rejects(t.api.confirm(t.candidate),/numéro de chambre/);
  assert.equal(t.calls.some(c=>c.args?.p_action==='confirm'),false);
 }
 for(const [type,name,room] of [['hotel','001a','001a'],['exterieur','402',null]]){
  const t=fixture({rpc:async(_name,args)=>args?.p_action==='hold'?null:{data:{}}});t.candidate.type=type;t.candidate.client=name;
  if(type==='hotel')t.element('bookingHotelRoom').value=room;
  await t.api.confirm(t.candidate);
  assert.equal(t.calls.find(c=>c.args?.p_action==='confirm').args.p_room,room);
 }
});
test('long notes are rejected with original input intact and never silently truncated or submitted',async()=>{
 const t=fixture({rpc:async(_name,args)=>args?.p_action==='hold'?null:{data:{}}});t.candidate.notes='n'.repeat(1001);
 await assert.rejects(t.api.confirm(t.candidate),/longueur autorisée/);assert.equal(t.candidate.notes.length,1001);
 assert.equal(t.calls.some(c=>c.args?.p_action==='confirm'),false);
});

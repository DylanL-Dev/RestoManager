const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
let source=fs.readFileSync(require.resolve('../v3-supabase-booking.js'),'utf8').replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'').replace(/await import\('[^']+'\)/g,'bridge');
const factory=new Function('window','navigator','setupBookingDraft','encodeBookingDetails','supabase','loadSharedService','canWrite','bridge','TableStore',source+';return {updateSharedBooking,cancelSharedBooking,createRestaurantTableShared};');
function fixture({ready=true,capabilities={reservation_edits:4,booking_recovery:1,snapshot:1},reception=false}={}){
 const calls=[];const window={RestoSupabaseReady:ready,RestoServiceCapabilities:capabilities,RestoReception:reception,ReservationEdit:{requireVersion:v=>{assert.equal(v,2);return v}},RestoErrors:require('../resto-errors.js')};
 const supabase={async rpc(name,args){calls.push({name,args});return {data:{tables:['table-a'],edit_version:3}}}};
 const loadSharedService=async()=>({tables:[{id:'table-a',active:true,label:'Table 2'}]});
 const bridge={supabase,loadSharedService,requireStaff:async()=>({profile:{role:reception?'reception':'fb_admin'}})};
 const api=factory(window,{onLine:true},()=>({confirm:async()=>{calls.push({name:'confirm'})}}),c=>JSON.stringify({notes:c.notes,allergies:c.allergies}),supabase,loadSharedService,c=>c?.reservation_edits===4&&c?.booking_recovery===1&&c?.snapshot===1,bridge,{get:()=>({tables:[{id:'table-a',number:2}]})});
 return {api,window,calls,candidate:{id:'res-fiction',editVersion:2,type:'hotel',hotelRoom:'402',client:'Invité fictif',date:'2032-11-06',time:'19:30',duration:90,guests:2,tables:[2],notes:'Note fictive',allergies:'Allergie fictive'}};
}
test('all mutation entry points fail closed without the complete approved SQL capability contract',async()=>{
 for(const capabilities of [undefined,{}, {reservation_edits:3,booking_recovery:1,snapshot:1},{reservation_edits:4,booking_recovery:0,snapshot:1}]){
  const t=fixture({capabilities:capabilities||{}});
  await assert.rejects(t.api.updateSharedBooking(t.candidate),{code:'CAPABILITY_REQUIRED'});
  await assert.rejects(t.api.cancelSharedBooking('res-fiction'),{code:'CAPABILITY_REQUIRED'});
  await assert.rejects(t.api.createRestaurantTableShared({label:'2',seats:4,roomId:'r'}),{code:'CAPABILITY_REQUIRED'});
  assert.throws(()=>t.window.RestoCreateSharedBooking(t.candidate),{code:'CAPABILITY_REQUIRED'});
  assert.equal(t.calls.length,0);
 }
});
test('Restaurant and Reception edits use only V4 with room, expected version, notes and allergies intact',async()=>{
 for(const reception of [false,true]){
  const t=fixture({reception});await t.api.updateSharedBooking(t.candidate);
  assert.equal(t.calls.length,1);assert.equal(t.calls[0].name,reception?'reception_update_reservation_v4':'update_reservation_v4');
  assert.equal(t.calls[0].args.p_expected_version,2);assert.equal(t.calls[0].args.p_hotel_room,'402');
  assert.match(t.calls[0].args.p_notes,/Note fictive/);assert.match(t.calls[0].args.p_notes,/Allergie fictive/);
 }
});
test('exterior edit explicitly removes hotel_room without changing the other details',async()=>{
 const t=fixture();t.candidate.type='exterieur';await t.api.updateSharedBooking(t.candidate);
 assert.equal(t.calls[0].args.p_hotel_room,null);assert.match(t.calls[0].args.p_notes,/Allergie fictive/);
});

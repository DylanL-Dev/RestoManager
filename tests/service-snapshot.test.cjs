const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=name=>import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(require.resolve('../'+name),'utf8')).toString('base64'));
const modulePromise=load('service-snapshot.js'),detailsPromise=load('reservation-details.js');
function snapshot(){return {revision:'3',capabilities:{reservation_edits:4,booking_recovery:1,snapshot:1},hours:{duration:90,lunch_enabled:true,lunch_start:'11:30:00',lunch_end:'14:00:00',dinner_enabled:true,dinner_start:'19:00:00',dinner_end:'22:00:00'},rooms:[{id:'room1',name:'Salle fictive',active:true}],tables:[{id:'table1',label:'Table 2',seats:4,room_id:'room1',active:true}],assignments:[{reservation_id:'res1',table_id:'table1'}],holds:[{id:'hold1',table_id:'table1',starts_at:'2030-05-01T10:00:00Z',ends_at:'2030-05-01T11:30:00Z',expires_at:'2030-05-01T09:02:00Z',draft_role:'reception'}],fusionLinks:[],reservations:[{id:'res1',guest_name:'Invité fictif',hotel_room:'201',notes:'[RESTOMANAGER:HOTEL]\n[ALLERGIES] Noix\nNote fictive',party_size:2,status:'reserved',starts_at:'2030-05-01T10:00:00Z',ends_at:'2030-05-01T11:30:00Z',edit_version:4}]}}
test('preparation maps an entire coherent service without mutating input or publishing globals',async()=>{
 const {prepareServiceSnapshot}=await modulePromise,{decodeBookingDetails}=await detailsPromise,input=snapshot(),before=JSON.stringify(input);
 const staged=prepareServiceSnapshot(input,decodeBookingDetails);
 assert.equal(JSON.stringify(input),before);
 assert.equal(staged.values.RestoSharedHours.shifts.lunch.start,'11:30');
 assert.equal(staged.plan.tables[0].number,2);assert.equal(staged.values.RestoDraftHolds[0].number,2);
 assert.deepEqual(staged.values.RestoSharedReservations[0].tables,[2]);
 assert.equal(staged.values.RestoSharedReservations[0].hotelRoom,'201');assert.equal(staged.values.RestoSharedReservations[0].editVersion,4);
 assert.equal(staged.values.RestoSharedReservations[0].time,'12:00');
 assert.equal(globalThis.RestoSharedReservations,undefined);
});
test('a malformed reservation fails all preparation before any hour or table publication',async()=>{
 const {prepareServiceSnapshot}=await modulePromise,{decodeBookingDetails}=await detailsPromise,input=snapshot();input.reservations[0].starts_at='bad';
 assert.throws(()=>prepareServiceSnapshot(input,decodeBookingDetails),RangeError);
 assert.equal(globalThis.RestoSharedHours,undefined);assert.equal(globalThis.RestoDraftHolds,undefined);
});
test('staging preserves FUN01 exterior marker and all details after a room removal',async()=>{
 const {prepareServiceSnapshot}=await modulePromise,{decodeBookingDetails,encodeBookingDetails}=await detailsPromise,input=snapshot();
 input.reservations[0].hotel_room=null;input.reservations[0].notes=encodeBookingDetails({type:'exterieur',allergies:'Allergie fictive',notes:'Note fictive'});
 const r=prepareServiceSnapshot(input,decodeBookingDetails).values.RestoSharedReservations[0];
 assert.equal(r.type,'exterieur');assert.equal(r.hotelRoom,'');assert.equal(r.allergies,'Allergie fictive');assert.equal(r.notes,'Note fictive');
});

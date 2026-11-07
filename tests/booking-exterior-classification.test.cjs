'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const engine=require('../reservation-engine.js');
const metrics=require('../service-v3-report-metrics.js');

const detailsSource=fs.readFileSync(path.join(__dirname,'../reservation-details.js'),'utf8');
const detailsPromise=import('data:text/javascript;base64,'+Buffer.from(detailsSource).toString('base64'));

function booking(id,details,type,room='',guests=2){
 const decoded=details.decodeBookingDetails(details.encodeBookingDetails({type,notes:'Sans gluten',allergies:'Noix'}),room);
 return engine.normalizeReservation({id,type:decoded.type,client:'Exemple',date:'2026-11-07',time:'12:00',duration:90,guests,tables:[1],status:'completed',notes:decoded.notes,allergies:decoded.allergies});
}
test('external guest stays external after encode/decode and normalization',async()=>{
 const details=await detailsPromise;
 const external=booking('external',details,'exterieur');
 assert.equal(external.type,'exterieur');
 assert.equal(external.notes,'Sans gluten');
 assert.equal(external.allergies,'Noix');
 assert.match(details.encodeBookingDetails({type:'exterieur'}),/RESTOMANAGER:EXTERIEUR/);
 assert.equal(metrics.calculate([external],{}).hotelCovers,0);
});
test('legacy exterior booking without tag stays exterior',async()=>{
 const details=await detailsPromise;
 const legacy=details.decodeBookingDetails('Ancienne note','');
 assert.equal(legacy.type,'exterieur');
 assert.equal(legacy.notes,'Ancienne note');
 assert.equal(engine.normalizeReservation({type:legacy.type}).type,'exterieur');
});
test('hotel marker or actual room keeps hotel type',async()=>{
 const details=await detailsPromise;
 assert.equal(booking('hotel',details,'hotel','755',3).type,'hotel');
 assert.equal(details.decodeBookingDetails('[RESTOMANAGER:HOTEL]','').type,'hotel');
 assert.equal(details.decodeBookingDetails('Note sans marqueur','755').type,'hotel');
 assert.equal(metrics.calculate([booking('hotel',details,'hotel','755',3)],{}).hotelCovers,3);
});
test('explicit exterior tag is removed from visible notes',async()=>{
 const details=await detailsPromise;
 const decoded=details.decodeBookingDetails('Demande client\n[RESTOMANAGER:EXTERIEUR]','');
 assert.equal(decoded.notes,'Demande client');
 assert.equal(decoded.type,'exterieur');
});

'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const edit=require('../reservation-edit.js');
const engine=require('../reservation-engine.js');
const base={id:'fictional',type:'hotel',client:'101',hotelRoom:'101',tables:[1],editVersion:'60000000-0000-4000-8000-000000000001',notes:'Note',allergies:'Noix'};
const values={client:'101',hotelRoom:'202',tables:[1],date:'2030-01-01',time:'12:00',guests:'2',notes:'Note',allergies:'Noix'};
test('capture keeps the version and table selection from editor opening',()=>{
 const input={...base,tables:[1]};const captured=edit.capture(input);input.editVersion='later';input.tables.push(2);
 assert.equal(captured.editVersion,base.editVersion);assert.deepEqual(captured.tables,[1]);assert.ok(Object.isFrozen(captured));
});
test('room edit follows legacy guest-name alias without losing notes/allergies',()=>{
 const c=edit.candidate(edit.capture(base),values);assert.equal(c.hotelRoom,'202');assert.equal(c.client,'202');
 assert.equal(c.notes,'Note');assert.equal(c.allergies,'Noix');assert.equal(c.editVersion,base.editVersion);
});
test('actual guest name stays independent of hotel room',()=>{
 const c=edit.candidate({...base,client:'Client fictif'},{...values,client:'Client fictif'});assert.equal(c.client,'Client fictif');assert.equal(c.hotelRoom,'202');
});
test('numeric exterior name never becomes a room or changes FUN-01 classification',()=>{
 const c=edit.candidate({...base,type:'exterieur',hotelRoom:''},{...values,client:'755',hotelRoom:'Injected'});
 assert.equal(c.client,'755');assert.equal(c.hotelRoom,'');assert.equal(c.type,'exterieur');
});
test('missing version fails closed and only explicit version-conflict code is a conflict',()=>{
 assert.throws(()=>edit.requireVersion(null),{code:'RM002'});assert.throws(()=>edit.requireVersion('not-a-version'),{code:'RM002'});
 assert.equal(edit.requireVersion(base.editVersion),base.editVersion);assert.equal(edit.isConflict({code:'RM001'}),true);assert.equal(edit.isConflict({code:'23P01'}),false);
});
test('room conflicts compare explicit rooms, not real guest names',()=>{
 const a={id:'a',type:'hotel',client:'Client fictif',hotelRoom:'201',date:'2030-01-01',time:'12:00',duration:90,status:'reserved',tables:[1]};
 assert.equal(engine.findRoomConflict({...a,id:'b',hotelRoom:'202',tables:[2]},[a]),null);
 assert.equal(engine.findRoomConflict({...a,id:'b',client:'Autre client',hotelRoom:' 201 ',tables:[2]},[a]).id,'a');
 assert.equal(engine.findRoomConflict({...a,id:'b',hotelRoom:'',tables:[2]},[a]),null);
 assert.equal(engine.findRoomConflict({...a,id:'b',type:'exterieur',hotelRoom:'201'},[a]),null);
});
test('historical local reservations retain client-as-room duplicate checks',()=>{
 const a={id:'a',type:'hotel',client:'201',date:'2030-01-01',time:'12:00',duration:90,status:'reserved',tables:[1]};
 assert.equal(engine.findRoomConflict({...a,id:'b',tables:[2]},[a]).id,'a');
});
test('unrelated room edits preserve unchanged historical notes and allergies without truncation',()=>{
 const historical={...base,notes:'N'.repeat(1400),allergies:'A'.repeat(750)};
 const c=edit.candidate(edit.capture(historical),{...values,notes:historical.notes,allergies:historical.allergies});
 assert.equal(c.notes,historical.notes);assert.equal(c.allergies,historical.allergies);assert.equal(c.hotelRoom,'202');
});
test('overlong new or changed details are rejected explicitly without modifying the input',()=>{
 for(const [field,length] of [['notes',1001],['allergies',501]]){
  const entered={...values,[field]:'X'.repeat(length)};
  assert.throws(()=>edit.candidate(base,entered),{code:'RM003'});
  assert.equal(entered[field].length,length);assert.equal(base.notes,'Note');assert.equal(base.allergies,'Noix');
 }
 const historical={...base,notes:'N'.repeat(1400)};
 assert.throws(()=>edit.candidate(historical,{...values,notes:'N'.repeat(1401)}),{code:'RM003'});
 assert.equal(edit.candidate(historical,{...values,notes:'Note raccourcie'}).notes,'Note raccourcie');
});
test('encoding and decoding never truncate long historical service information',async()=>{
 const fs=require('node:fs');
 const details=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(require.resolve('../reservation-details.js'))).toString('base64'));
 const input={notes:'Note fictive '.repeat(160).trim(),allergies:'Allergie fictive '.repeat(60).trim(),type:'hotel'};
 const decoded=details.decodeBookingDetails(details.encodeBookingDetails(input),'101');
 assert.deepEqual(decoded,input);
});

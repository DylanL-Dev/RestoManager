'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const calc=require('../service-v3-slot-capacity.js');
const tables=[{number:1,capacity:2},{number:2,capacity:2},{number:3,capacity:4},{number:25,capacity:10}];
const base={date:'2026-11-13',time:'19:30',duration:90,guests:2,tables,groups:[[1,2]],reservations:[],heldNumbers:[],ready:true};
const check=change=>calc.evaluate({...base,...change});
test('a fully available slot counts physical seats once',()=>{let a=check({});assert.equal(a.remaining,18);assert.equal(a.compatible,true);assert.equal(a.freeTables,4)});
test('a booked 4-seat table does not free seats until its interval ends',()=>{
 const reservations=[{date:base.date,time:'19:00',duration:90,status:'reserved',tables:[3]}];
 assert.equal(check({reservations}).remaining,14);
 assert.equal(check({time:'20:30',reservations}).remaining,18);
});
test('adjacent slots check occupancy for entire requested duration',()=>{
 const reservations=[{date:base.date,time:'20:15',duration:90,status:'confirmed',tables:[25]}];
 assert.equal(check({time:'19:30',reservations}).remaining,8);
 assert.equal(check({time:'18:30',duration:90,reservations}).remaining,18);
});
test('holds and seated guests are blocked until released',()=>{
 const reservations=[{date:base.date,time:'18:00',duration:60,status:'seated',tables:[25]}];
 assert.equal(check({reservations,heldNumbers:[3]}).remaining,4);
 assert.equal(check({reservations:[{...reservations[0],status:'released'}],heldNumbers:[]}).remaining,18);
});
test('a 4-person party fits two linked free 2-seat tables but no fictitious extra seats',()=>{
 const small=tables.slice(0,2);
 assert.deepEqual(check({tables:small,guests:4,groups:[]}).compatible,false);
 const linked=check({tables:small,guests:4,groups:[[1,2]]});assert.equal(linked.compatible,true);assert.equal(linked.remaining,4);
 const taken=check({tables:small,guests:4,groups:[[1,2]],heldNumbers:[2]});assert.equal(taken.compatible,false);assert.equal(taken.remaining,2);
});
test('one physical seat gets last-seat badge and insufficient party remains blocked',()=>{
 const one=check({tables:[{number:6,capacity:1}],guests:1});assert.equal(one.state,'last');assert.equal(one.remaining,1);
 assert.equal(check({tables:[{number:6,capacity:1}],guests:2}).compatible,false);
});
test('unassigned reservation or disconnected snapshot never displays an invented count',()=>{
 const pending=check({reservations:[{date:base.date,time:'19:15',duration:90,status:'reserved',tables:[]}]});
 assert.equal(pending.state,'unknown');assert.equal(pending.remaining,null);
 assert.equal(check({ready:false}).remaining,null);
});
test('cancellation and different dates do not consume places',()=>{
 const reservations=[{date:base.date,time:'19:30',duration:90,status:'cancelled',tables:[25]},{date:'2026-11-14',time:'19:30',duration:90,status:'reserved',tables:[3]}];
 assert.equal(check({reservations}).remaining,18);
});
test('booking UI renders availability cards for both roles and preserves server checks',()=>{
 const ui=fs.readFileSync('service-v3-booking-director-choices.js','utf8');
 const html=fs.readFileSync('v3-connected.html','utf8');
 assert.doesNotThrow(()=>new Function(ui));
 assert.match(ui,/RestoSlotCapacity\?\.evaluate/);
 assert.match(ui,/RestoSharedDataLoaded/);
 assert.match(ui,/RestoSyncState/);
 assert.match(ui,/Pas de table pour/);
 assert.match(ui,/restomanager:supabase-snapshot/);
 assert.match(html,/service-v3-slot-capacity\.js\?v=20261113-seats1/);
 assert.match(html,/service-v3-booking-director-choices\.js\?v=20261113-compact-arrival1/);
});

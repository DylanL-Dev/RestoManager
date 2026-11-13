'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const slots=require('../service-v3-slot-capacity.js');
const choices=fs.readFileSync('service-v3-booking-director-choices.js','utf8');
const html=fs.readFileSync('v3-connected.html','utf8');

test('DEV booking choices use TableStore global lexical binding, not window only',()=>{
 assert.match(choices,/typeof TableStore!=='undefined'\?TableStore\.get\(\):window\.TableStore\?\.get\?\.\(\)/);
 assert.match(html,/service-v3-booking-director-choices\.js\?v=20261113-real-tables1/);
 const context=vm.createContext({
  window:{},
  structuredClone,
  localStorage:{getItem:()=>null,setItem:()=>{}},
  ReservationEngine:{TABLES:[1,2,25],CAPACITY:{1:2,2:2,25:10}}
 });
 vm.runInContext(fs.readFileSync('service-v3-table-store.js','utf8'),context);
 assert.equal(vm.runInContext('window.TableStore',context),undefined);
 const plan=vm.runInContext("typeof TableStore!=='undefined'?TableStore.get():window.TableStore?.get?.()",context);
 assert.equal(plan.tables.length,3);
 assert.equal(plan.tables[2].capacity,10);
});

test('reserved table is subtracted, but other real tables remain available',()=>{
 const tables=[{number:1,capacity:2},{number:2,capacity:2},{number:25,capacity:10}];
 const booked=[{date:'2026-11-13',time:'14:15',duration:90,status:'reserved',tables:[1],guests:1}];
 const during=slots.evaluate({date:'2026-11-13',time:'14:30',guests:2,tables,reservations:booked,ready:true});
 assert.equal(during.state,'open');
 assert.equal(during.remaining,12);
 assert.equal(during.compatible,true);
 const dinner=slots.evaluate({date:'2026-11-13',time:'19:00',guests:2,tables,reservations:booked,ready:true});
 assert.equal(dinner.remaining,14);
 assert.equal(dinner.compatible,true);
});
test('no synchronized snapshot never invents free tables',()=>{
 const result=slots.evaluate({date:'2026-11-13',time:'19:00',guests:2,tables:[{number:1,capacity:2}],ready:false});
 assert.equal(result.state,'unknown');
 assert.equal(result.remaining,null);
});

'use strict';
/* Run with: node tests/smart-placement.test.js */
const assert=require('node:assert/strict');
const {simulate}=require('../smart-placement-engine.js');
const base={date:'2026-11-06',time:'19:30',duration:90,guests:2,status:'reserved'};
const r=(id,table,extra={})=>({...base,id,client:'Chambre '+id,tables:[table],...extra});
const tables=(...n)=>n.map(number=>({number,capacity:2,capacityMin:1}));
function plan(reservations,tablePlan,table,id='201',extra={}){return simulate({reservations,tablePlan,reservationId:id,targetTable:table,...extra})}
const original=[r('201',1),r('305',2),r('408',3)];
const swapped=plan(original,tables(1,2,3),3);
assert.equal(swapped.ok,true);
assert.deepEqual(swapped.changes.map(x=>[x.id,x.from[0],x.to[0]]),[['201',1,3],['408',3,1]]);
assert.deepEqual(original[0].tables,[1],'simulation must not mutate source');
assert.equal(plan([r('201',1),r('408',3,{status:'seated'})],tables(1,3),3).ok,false);
assert.equal(plan(original,[{number:1,capacity:1},{number:2,capacity:1},{number:3,capacity:2}],3).ok,false);
assert.equal(plan([r('201',1,{guests:3})],tables(1,3),3).ok,false);
assert.equal(plan(original,tables(1,2,3),1).changes.length,0);
assert.equal(plan([r('201',1),r('408',3,{time:'22:00'})],tables(1,3),3).changes.length,1);
assert.equal(plan([r('201',1),r('408',3,{status:'arrived'})],tables(1,3),3).ok,false);
assert.equal(plan([r('201',1),r('408',3,{date:'2026-11-07'})],tables(1,3),3).changes.length,1);
assert.equal(plan([r('201',1,{status:'seated'})],tables(1,3),3).ok,false);
assert.equal(plan([r('201',1,{tables:[1,2]})],tables(1,2,3),3).ok,false);
assert.equal(plan([r('201',1)],tables(1),999).ok,false);
assert.equal(plan([r('201',1),r('408',3,{status:'seated',time:'17:00'})],tables(1,3),3).ok,false);
console.log('Smart placement: 12 assertions passed.');

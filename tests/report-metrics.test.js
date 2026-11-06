'use strict';
const assert=require('node:assert/strict');
const {calculate}=require('../service-v3-report-metrics.js');
const shifts={lunch:{enabled:true,start:'12:00',end:'14:30'},dinner:{enabled:true,start:'19:00',end:'21:30'}};
const entry=(id,status,guests,type='hotel',walkIn=false,time='19:00',date='2026-11-06')=>({id,status,guests,type,walkIn,time,date});
const bookings=[
 entry('a','released',3),entry('b','completed',2,'exterieur'),entry('c','released',4,'exterieur',true),
 entry('d','seated',2),entry('e','reserved',5),entry('f','cancelled',6),
 entry('g','no_show',3),entry('h','confirmed',2),entry('i','late',1),
 entry('j','completed',1,'hotel',false,'12:00')
];
const result=calculate(bookings,shifts);
for(const [key,expected] of Object.entries({
 covers:10,inRoomCovers:2,welcomedCovers:12,walkinCovers:4,walkinPassages:1,
 hotelCovers:4,noShowCount:1,cancelledCount:1,pendingCount:4,
 lunchCovers:1,dinnerCovers:9,completedInstallations:4,serviceDays:1
}))assert.equal(result[key],expected,key);
assert.equal(calculate([entry('x','released',2,'hotel',false,'11:30')],shifts).otherCovers,2);
const modified={lunch:{enabled:true,start:'11:00',end:'14:00'},dinner:{enabled:false,start:'19:00',end:'21:30'}};
assert.equal(calculate([entry('x','released',2,'hotel',false,'11:30')],modified).lunchCovers,2);
assert.equal(calculate([entry('y','released',2,'hotel',false,'19:00')],modified).otherCovers,2);
const empty=calculate([],shifts);
assert.equal(empty.averagePerServiceDay,0);
assert.equal(empty.welcomedCovers,0);
console.log('Report metrics: 18 assertions passed');

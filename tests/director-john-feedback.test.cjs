'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const controls=read('service-v3-booking-director-choices.js');
const html=read('v3-connected.html');
const service=read('service-v3.js');
test('John: director booking selectors have valid JavaScript and load only in DEV screen',()=>{
 assert.doesNotThrow(()=>new Function(controls));
 assert.match(html,/service-v3-booking-director-choices\.js\?v=20261113-seats-ready1/);
 assert.match(controls,/bookingDate/);assert.match(controls,/bookingTime/);assert.match(controls,/bookingGuests/);
});
test('John: quarter-hour choices follow registered service hours and exclude past arrivals',()=>{
 assert.match(controls,/ReservationEngine\?\.getShifts/);
 assert.match(controls,/Math\.ceil\(Math\.max\(first,start\)\/15\)\*15/);
 assert.match(controls,/time\.value===at/);
 assert.match(controls,/change\(time,at\)/);
 assert.match(controls,/timeZone:'Europe\/Paris'/);
 assert.match(controls,/selected>=today\.date/);
});
test('John: covers keep original numeric input and existing availability engine',()=>{
 assert.match(controls,/change\(guests,String\(n\)\)/);
 assert.match(controls,/saisissez directement le nombre dans le champ Couverts/);
 assert.match(service,/ReservationEngine\.validate\(candidate,existing\)/);
});
test('John: invalid room number and remote errors are displayed inline beside fields',()=>{
 assert.match(controls,/hotelRoom\.pattern='\[0-9\]\+'/);
 assert.match(controls,/input\.addEventListener\('invalid'/);
 assert.match(controls,/setAttribute\('aria-invalid','true'\)/);
 assert.match(controls,/bookingFeedback/);
});
test('John: advisory pressure threshold has explicit explanation and exceptional confirmation',()=>{
 assert.match(service,/ce n’est pas la capacité maximale de la salle/);
 assert.match(service,/Confirmer exceptionnellement/);
 assert.match(service,/Seuil conseillé d’arrivées sur une heure/);
});

test('John: Saturday and Sunday lunch closed; weekdays and weekend dinner remain open',()=>{
 const Engine=require('../reservation-engine.js'),prior=globalThis.RestoSharedHours;
 globalThis.RestoSharedHours={duration:90,shifts:{lunch:{enabled:true,start:'12:00',end:'14:30'},dinner:{enabled:true,start:'19:00',end:'21:30'}},weekend:{supported:true,saturdayLunchClosed:true,sundayLunchClosed:true}};
 try{
  assert.equal(Engine.isServiceOpen('2026-11-14','12:30'),false);
  assert.equal(Engine.isServiceOpen('2026-11-15','12:30'),false);
  assert.equal(Engine.isServiceOpen('2026-11-13','12:30'),true);
  assert.equal(Engine.isServiceOpen('2026-11-14','19:15'),true);
  assert.equal(Engine.closedWeekendLunch('2026-11-14','12:30'),true);
 }finally{if(prior===undefined)delete globalThis.RestoSharedHours;else globalThis.RestoSharedHours=prior;}
});

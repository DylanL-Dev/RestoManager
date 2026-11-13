'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('v3-connected.html','utf8');
const css=fs.readFileSync('ui/booking-slot-cards.css','utf8');
const ui=fs.readFileSync('service-v3-booking-director-choices.js','utf8');
const lucide=fs.readFileSync('lucide-local.js','utf8');

test('DEV booking slot component uses a versioned reusable UI-library stylesheet',()=>{
 assert.match(html,/ui\/booking-slot-cards\.css\?v=20261113-slot-library1/);
 assert.match(html,/service-v3-booking-director-choices\.js\?v=20261113-real-tables1/);
 assert.match(html,/lucide-local\.js\?v=20261113-slot-chevron1/);
});
test('real booking form has a responsive two-column grid with no double selected outline',()=>{
 assert.match(css,/#bookingForm #rmDirectorTimeChoices \.rmSlotAvailabilityGrid/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(css,/outline:none!important/);
 assert.match(css,/\.rmSlotSelectedMark/);
 assert.match(css,/border:1\.5px solid #16805a!important/);
});
test('slot states are rendered with locally available Lucide icons and remain truthful',()=>{
 for(const icon of ['check-circle-2','alert-circle','alert-triangle','x-circle','circle-help','activity','check','chevron-up','chevron-down']){
  assert.match(lucide,new RegExp("'"+icon+"':"));
  assert.match(ui,new RegExp(icon));
 }
 assert.match(ui,/result\.state==='unknown'\?'À vérifier'/);
 assert.match(ui,/RestoSlotCapacity\?\.evaluate/);
 assert.match(ui,/RestoRush\.evaluate/);
});

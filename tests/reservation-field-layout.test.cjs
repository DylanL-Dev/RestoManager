'use strict';
/* Protect the shared field contract in booking, editing and walk-in forms.
   This is a structural guard: it does not replace real browser visual checks. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const page=fs.readFileSync(path.join(root,'v3-connected.html'),'utf8');
const css=fs.readFileSync(path.join(root,'service-v3-reservation-fields.css'),'utf8');
function form(id){
 const start=page.indexOf('<form id="'+id+'"');
 assert.ok(start>=0,id+' form must be present');
 const end=page.indexOf('</form>',start);
 assert.ok(end>start,id+' form must close');
 return page.slice(start,end+7);
}
function field(formHTML,id){
 const controlIndex=formHTML.indexOf('id="'+id+'"');
 assert.ok(controlIndex>=0,id+' input must exist');
 const open=formHTML.lastIndexOf('<label',controlIndex);
 const begin=formHTML.lastIndexOf('</label>',controlIndex);
 assert.ok(open>=0&&open>begin,id+' input must have its own label');
 const label=formHTML.slice(open,formHTML.indexOf('</label>',controlIndex));
 assert.match(label,/class="reservationField"/,id+' must use shared field geometry');
 assert.match(label,/class="reservationFieldCaption"/,id+' must have one caption wrapper');
 return label;
}
test('all eight booking fields use one caption per control',()=>{
 const html=form('bookingForm');
 for(const id of ['bookingClient','bookingHotelRoom','bookingDate','bookingTime','bookingGuests','bookingTable','bookingAllergies','bookingNotes'])field(html,id);
 assert.match(field(html,'bookingClient'),/Nom du client <small>\(facultatif\)<\/small>/);
});
test('all eight edit fields use the same caption and 2-column details grid',()=>{
 const html=form('editForm');
 for(const id of ['editClient','editHotelRoom','editDate','editTime','editGuests','editTable','editAllergies','editNotes'])field(html,id);
 assert.match(field(html,'editClient'),/Nom du client <small>\(facultatif\)<\/small>/);
 assert.match(html,/class="reservationExtraFields"/);
});
test('hotel room fields stay optional, masked when inactive',()=>{
 assert.match(field(form('bookingForm'),'bookingHotelRoom'),/hidden>/);
 assert.match(field(form('editForm'),'editHotelRoom'),/hidden>/);
 assert.match(css,/#bookingForm > \.reservationField\[hidden\]/);
 assert.match(css,/#editForm\.editFormModern > \.reservationField\[hidden\]/);
});
test('walk-in keeps dedicated one-tap control and shared captions',()=>{
 const html=form('walkinForm');
 field(html,'walkinRoom');
 assert.match(html,/class="reservationFieldCaption" for="walkinGuests"/);
 assert.match(html,/class="walkinGuestStepper"/);
});
test('booking and edit controls have the same geometry on all breakpoints',()=>{
 assert.match(page,/service-v3-reservation-fields\.css\?v=20261109-unified-roles5/);
 assert.match(css,/--rm-field-height:44px/);
 assert.match(css,/#bookingForm > \.reservationField/);
 assert.match(css,/#editForm\.editFormModern > \.reservationField/);
 assert.match(css,/@media\(max-width:960px\)/);
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(css,/html\[data-theme="dark"\]/);
});

test('Reception and Restaurant use identical icon-marked reservation fields',()=>{
 const icons=['users','building-2','calendar-days','clock-3','users','armchair','alert-triangle','clipboard-list'];
 for(const [kind,prefix] of [['booking','booking'],['edit','edit']]){
  const html=form(kind==='booking'?'bookingForm':'editForm');
  const ids=[prefix+'Client',prefix+'HotelRoom',prefix+'Date',prefix+'Time',prefix+'Guests',prefix+'Table',prefix+'Allergies',prefix+'Notes'];
  ids.forEach((id,i)=>assert.match(field(html,id),new RegExp('data-lucide="'+icons[i]+'"'),id+' has its expected Lucide icon'));
 }
 assert.match(page,/id="bookingAutoTableInfo"/);
 assert.match(css,/html\.reception #bookingForm/);
 assert.match(page,/html\.reception #editForm\.editFormModern > label:has\(#editTable\)/);
});

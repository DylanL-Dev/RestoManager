'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const page=src('v3-connected.html');
const auth=src('v3-connected-auth.js');
const edit=src('service-v3-reservations.js');
const booking=src('v3-supabase-booking.js');
const fields=src('service-v3-reservation-fields.css');
const migration=src('supabase/migrations/20261109220000_reception_explicit_table_v1.sql');
test('the client-type cards are identical and always hotel first',()=>{
 const start=page.indexOf('<form id="bookingForm"');
 const fragment=page.slice(start,page.indexOf('</form>',start));
 assert.ok(fragment.indexOf('value="hotel"')<fragment.indexOf('value="exterieur"'));
 assert.match(fragment,/data-lucide="building-2"/);
 assert.match(fragment,/data-lucide="users"/);
});
test('Reception displays a matching automatic-assignment field on new bookings',()=>{
 assert.match(page,/id="bookingAutoTableInfo"/);
 assert.match(fields,/html\.reception #bookingForm > \.reservationAutoTable/);
 assert.doesNotMatch(auth,/document\.createElement\('p'\)[\s\S]{0,160}attribue une table/);
});
test('Reception can select a table during pending reservation edits',()=>{
 assert.doesNotMatch(page,/\.reception label:has\(#editTable\)/);
 assert.doesNotMatch(auth,/#editTable'\)\.required=false/);
 assert.match(edit,/explicitTableChoice:Boolean\(window\.RestoReception&&!sameTables\(editingBase\.tables,updated\.tables\)\)/);
 assert.match(edit,/extra\.push\(\{label:'Changer la table',run:\(\)=>openChangeTablePicker\(r\.id\)\}\)/);
 assert.match(booking,/reception_update_reservation_with_table_v1/);
 assert.match(booking,/reception_update_reservation_v4/);
});
test('Reception operations remain segregated from seated service',()=>{
 assert.match(migration,/private\.current_staff_role\(\) IS DISTINCT FROM 'reception'/);
 assert.match(migration,/private\.update_reservation_v4/);
 assert.match(migration,/OWNER TO resto_service_writer/);
 assert.match(migration,/REVOKE ALL ON FUNCTION/);
 assert.match(migration,/REVOKE CREATE ON SCHEMA public/);
 assert.match(edit,/\['reserved','confirmed','late','arrived'\]/);
 assert.match(booking,/profile\.role!=='fb_admin'/);
});
test('all creation and editing forms use Lucide labels and consistent actions',()=>{
 for(const name of ['bookingClient','bookingHotelRoom','bookingDate','bookingTime','bookingGuests','bookingTable','bookingAllergies','bookingNotes','editClient','editHotelRoom','editDate','editTime','editGuests','editTable','editAllergies','editNotes']){
  const index=page.indexOf('id="'+name+'"');
  assert.ok(index>0,name+' is missing');
  const caption=page.lastIndexOf('<span class="reservationFieldCaption">',index);
  assert.ok(caption>0&&index-caption<300,name+' must have a shared caption');
  assert.match(page.slice(caption,index),/data-lucide=/,name+' needs an icon');
 }
 assert.match(page,/class="bookingSubmitPrimary"><i data-lucide="calendar-plus"/);
 assert.match(page,/class="walkinInstall"><i data-lucide="check-circle-2"/);
 assert.match(fields,/#bookingForm > \.bookingSubmitPrimary/);
});

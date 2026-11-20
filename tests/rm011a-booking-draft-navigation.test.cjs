'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=file=>fs.readFileSync(file,'utf8');
test('RM-011-A : every successful booking path resets the navigation dirty baseline',()=>{
 const s=source('service-v3.js');
 const calls=s.match(/window\.RestoScreens\?\.markBookingSaved\?\.\(\)/g)||[];
 assert.equal(calls.length,3,'connected booking, local warned booking, local normal booking');
 assert.match(s,/await window\.RestoCreateSharedBooking\(candidate\)[\s\S]*?prepareNewReservation\(\);\s*window\.RestoScreens\?\.markBookingSaved/);
 assert.match(s,/localStorage\.setItem\('restomanager_reservations',[\s\S]*?markBookingSaved/);
 const screens=source('service-v3-screens.js');
 assert.match(screens,/markBookingSaved:resetBookingBaseline/);
 assert.match(screens,/function bookingDirty\(\)/);
 assert.match(screens,/if\(editDirty\(\)\|\|bookingDirty\(\)\|\|walkinDirty\(\)\)/);
});
test('RM-011-A : refresh protection precedes hold release and page replace without deleting other tabs caches',()=>{
 const s=source('service-v3-refresh.js');
 const guard=s.indexOf('await window.RestoScreens.confirmLeaveForRefresh(');
 const close=s.indexOf('window.RestoBookingDraft?.close()');
 const reload=s.indexOf('window.location.replace(url.href)');
 assert.ok(guard>=0&&close>guard&&reload>close);
 assert.ok(!s.includes('caches.delete('),'Other open tabs retain their resources');
 assert.match(s,/if\(!await window\.RestoScreens\.confirmLeaveForRefresh\(/);
 assert.match(s,/window\.RestoBookingDraft\?\.checking\?\.\(\)/);
 assert.match(source('booking-draft.js'),/checking:\(\)=>submitting\|\|holding\|\|recovering\|\|!!recovery/);
 assert.match(source('service-v3-screens.js'),/confirmLeaveForRefresh:mayLeave/);
});
test('RM-011-A : connected PWA references versioned scripts after change',()=>{
 const html=source('v3-connected.html');
 for(const key of ['service-v3-screens.js?v=20261118-rm0152',
  'service-v3-refresh.js?v=20261118-rm0152',
  'service-v3.js?v=20261116-rm013a1',
  'v3-supabase-booking.js?v=20261117-rm016-readonly'])
  assert.ok(html.includes(key),key);
 assert.match(source('v3-supabase-booking.js'),/booking-draft.js\?v=20261117-rm016-readonly/);
 assert.match(source('sw.js'),/restomanager-shell-20261120-dev-rm015.9/);
});

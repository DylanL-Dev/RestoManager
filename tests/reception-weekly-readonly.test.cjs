'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const auth=fs.readFileSync('v3-connected-auth.js','utf8');
const css=fs.readFileSync('service-v3-weekly-schedule.css','utf8');
const html=fs.readFileSync('v3-connected.html','utf8');
test('Reception can see weekly hours without editing the restaurant schedule',()=>{
 assert.match(auth,/if\(window\.RestoReception\)/);
 assert.match(auth,/receptionWeeklyReadOnly/);
 assert.match(auth,/window\.RestoSharedHours\?\.weeklySchedule/);
 assert.match(auth,/Lecture seule/);
 assert.match(auth,/rmReceptionWeeklyDay/);
 assert.match(auth,/restomanager:supabase-snapshot/);
 assert.doesNotMatch(auth.slice(auth.indexOf('const receptionManagement='),auth.indexOf(" window.RestoSharedReservations=[]")),/RestoSaveSharedHours|supabase\.from\('restaurant_hours'\)\.update/);
 assert.match(css,/\.rmReceptionWeeklyReadonly/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(html,/v3-connected-auth\.js\?v=20261113-tablet-layout2/);
});

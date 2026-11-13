'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const room=fs.readFileSync('service-v3-table-admin.js','utf8');
const chips=fs.readFileSync('service-v3-booking-director-choices.js','utf8');
const html=fs.readFileSync('v3-connected.html','utf8');
test('choosing Salle Prestige displays ONLY tables assigned to that room',()=>{
 assert.match(room,/selectedTables=plan\.tables\.filter\(t=>t\.roomId===rooms\.value\)/);
 assert.match(room,/selectedTables\.sort\(/);
 assert.match(room,/Aucune table dans /);
 assert.match(room,/\$\('tableAdminRoom'\)\.addEventListener\('change'/);
 assert.match(room,/\$\('tableAdminRoom'\)\.value=roomId/);
 assert.match(html,/service-v3-table-admin\.js\?v=20261113-room-filter1/);
});
test('removing rooms requires an empty room, keeps historical references',()=>{
 assert.match(room,/if\(next\.tables\.some\(t=>t\.roomId===room\.id\)\)/);
 assert.match(room,/RestoDeactivateRestaurantRoom/);
 assert.match(room,/historique/);
 assert.match(room,/RestoSetRestaurantTableActive/);
});
test('synchronized slot estimates are visible even when writes are readonly',()=>{
 assert.match(chips,/RestoSharedDataLoaded/);
 assert.match(chips,/\['ok','readonly'\]/);
 assert.doesNotMatch(chips,/RestoSupabaseReady&&navigator/);
 assert.match(chips,/RestoSlotCapacity\?\.evaluate/);
 assert.match(chips,/rmSlotCard/);
 assert.match(html,/service-v3-booking-director-choices\.js\?v=20261113-seats-ready1/);
});

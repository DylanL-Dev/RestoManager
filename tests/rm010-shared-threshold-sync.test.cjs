'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const rush=read('service-v3.js');
const auth=read('v3-connected-auth.js');
const bridge=read('supabase-service-bridge.js');
const html=read('v3-connected.html');
test('RM-010 connected change is not shown as saved until Supabase confirms',()=>{
 assert.match(rush,/await window\.RestoSaveSharedArrivalLimit\(percent\)/);
 assert.match(rush,/confirmed!==percent\|\|settings\(\)\.percent!==percent/);
 assert.match(rush,/Réglage non confirmé pour l’équipe/);
 assert.match(rush,/Aperçu non encore enregistré/);
 assert.match(rush,/Seuil enregistré pour le Restaurant et la Réception/);
});
test('RM-010 server update validates returned value and refreshed snapshot',()=>{
 assert.match(auth,/\.update\(\{arrival_limit_percent:value\}\)/);
 assert.match(auth,/Number\(data\?\.arrival_limit_percent\)!==value/);
 assert.match(auth,/const snapshot=await window\.RestoRefreshSharedService\(\)/);
 assert.match(auth,/Number\(snapshot\?\.hours\?\.arrival_limit_percent\)!==value/);
 assert.match(auth,/return value;/);
});
test('RM-010 Recéption receives missed updates via visible-tab reconciliation',()=>{
 assert.match(bridge,/onSnapshot\(snapshot\);lastSnapshotAt=Date\.now\(\)/);
 assert.match(bridge,/document\.visibilityState==='visible'&&Date\.now\(\)-lastSnapshotAt>=30000/);
 assert.match(bridge,/postgres_changes/);
});
test('RM-010 JS asset refresh invalidates old code across browser and PWA',()=>{
 assert.match(html,/service-v3\.js\?v=20261116-rm013a1/);
 assert.match(html,/v3-connected-auth\.js\?v=20261117-rm012/);
 assert.match(auth,/supabase-service-bridge\.js\?v=20261117-rm012/);
});

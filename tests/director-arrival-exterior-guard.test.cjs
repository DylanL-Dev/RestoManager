'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const choices=read('service-v3-booking-director-choices.js');
const booking=read('service-v3.js'),draft=read('booking-draft.js'),edit=read('service-v3-reservations.js');
const auth=read('v3-supabase-booking.js'),migration=read('supabase/migrations/20261113015700_john_exterior_guest_required_dev.sql');
test('Arrival slot badges use the SAME surge evaluator and Lucide users/activity/info',()=>{
 assert.match(choices,/window\.RestoRush\.evaluate\(/);
 assert.match(choices,/open:'check-circle-2'/);
 assert.match(choices,/limited:'alert-circle'/);
 assert.match(choices,/last:'alert-triangle'/);
 assert.match(choices,/full:'x-circle'/);
 assert.match(choices,/unknown:'circle-help'/);
 assert.match(choices,/dataset\.lucide='activity'/);
 assert.match(choices,/dataset\.lucide='info'/);
 assert.match(choices,/Forte affluence|Arrivées nombreuses/);
 assert.match(choices,/rmSlotHelp/);
 assert.match(choices,/window\.RestoBookingSlotResult=slotCapacity/);
});
test('The large final rush alert and its exceptional confirmation are preserved',()=>{
 assert.match(booking,/Forte affluence à /);
 assert.match(booking,/Confirmer exceptionnellement/);
 assert.match(booking,/window\.RestoRush\.confirm\(candidate,latest\)/);
 assert.match(booking,/const loadState=window\.RestoRush\.evaluate\(candidate,latest\)/);
});
test('Exterior client requires a specific guest name but hotel name stays optional',()=>{
 assert.match(choices,/name\.required=external/);
 assert.match(choices,/name\.placeholder=external\?/);
 assert.match(choices,/Le nom du client extérieur est obligatoire/);
 assert.match(booking,/RestoExternalNameGuard\.validateField\(\)/);
 assert.match(draft,/EXTERNAL_NAME_REQUIRED/);
 assert.match(auth,/nom du client extérieur est obligatoire/i);
 assert.match(edit,/syncEditClientRequirement/);
 assert.match(edit,/validateEditName/);
 assert.match(migration,/require_named_exterior_guest/);
 assert.match(migration,/RESTOMANAGER:EXTERIEUR/);
});

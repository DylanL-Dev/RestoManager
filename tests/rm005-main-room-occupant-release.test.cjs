'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const walkin=fs.readFileSync(path.join(root,'service-v3-walkin-fast.js'),'utf8');
const auth=fs.readFileSync(path.join(root,'v3-connected-auth.js'),'utf8');
const reservations=fs.readFileSync(path.join(root,'service-v3-reservations.js'),'utf8');
const html=fs.readFileSync(path.join(root,'v3-connected.html'),'utf8');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261111221500_rm005_room_occupant_main_targeted.sql'),'utf8');
test('room conflict does not suppress all physically available tables',()=>{
 assert.match(walkin,/validation\.valid\|\|roomConflictOnly\(validation\)/);
 assert.match(walkin,/roomNotice\.hidden=!existingRoom/);
 assert.match(walkin,/Synchronisation en cours ou connexion interrompue/);
});
test('separate occupant has explicit, cancellable staff confirmation',()=>{
 assert.match(walkin,/RestoDialog\.confirm/);
 assert.match(walkin,/Autre occupant de la même chambre/);
 assert.match(walkin,/if\(!allowSameRoom\)/);
 assert.match(walkin,/RestoInstallWalkin\(r,\{allowSameRoom\}\)/);
 assert.match(auth,/install_walkin_group_v4/);
 assert.match(auth,/p_allow_second_occupant:true/);
 assert.match(auth,/r\.type!=='hotel'/);
});
test('production SQL preserves V3 and creates isolated, permissioned V4',()=>{
 assert.match(sql,/where id=1 and restaurant_id=private\.staff_restaurant\(\) for share/);
 assert.match(sql,/cardinality\(p_tables\) not between 1 and 3/);
 assert.match(sql,/cardinality\(p_table_ids\) not between 1 and 3/);
 assert.match(sql,/current_setting\(''restomanager\.second_occupant_confirmed'',true\)=''yes''/);
 assert.match(sql,/set_config\(''restomanager\.second_occupant_confirmed'',''yes'',true\)/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.install_walkin_group_v4/);
 assert.match(sql,/TO authenticated/);
 assert.doesNotMatch(sql,/drop table|truncate table|delete from public\.reservations/i);
});
test('technical room marker never appears as visible customer note',()=>{
 assert.match(reservations,/const publicNotes=/);
 assert.match(reservations,/if\(publicNotes\(r\)\)/);
 assert.match(reservations,/savedNotes\(\$\('editNotes'\)\.value,editingBase\|\|editing\)/);
 assert.match(html,/rm005SecondOccupantNotice/);
});

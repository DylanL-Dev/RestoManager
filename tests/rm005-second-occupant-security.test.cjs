'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path');
const root=path.join(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261111213500_rm005_second_occupant_guard_dev.sql'),'utf8');
const frontend=fs.readFileSync(path.join(root,'service-v3-walkin-fast.js'),'utf8');
const auth=fs.readFileSync(path.join(root,'v3-connected-auth.js'),'utf8');
test('RM-005: room override requires server-local confirmation, not just a caller-supplied notes marker',()=>{
 assert.match(migration,/current_setting\(''restomanager\.second_occupant_confirmed'',true\)=''yes''/);
 assert.match(migration,/set_config\(''restomanager\.second_occupant_confirmed'',''yes'',true\)/);
 assert.match(migration,/v_role=''fb_admin''/);
 assert.match(migration,/Unexpected second-occupant guard/);
});
test('RM-005: a distinct hotel occupant needs confirmation and a dedicated RPC',()=>{
 assert.match(frontend,/RestoDialog\.confirm/);
 assert.match(frontend,/allowSameRoom=await/);
 assert.match(frontend,/if\(!allowSameRoom\)/);
 assert.match(auth,/install_walkin_group_v4/);
 assert.match(auth,/p_allow_second_occupant:true/);
 assert.match(auth,/r\.type!=='hotel'/);
});

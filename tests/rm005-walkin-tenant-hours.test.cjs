'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261111220000_rm005_walkin_tenant_hours_dev.sql'),'utf8');
test('RM-005: both walk-in versions select hours by the authenticated restaurant',()=>{
 assert.match(sql,/install_walkin_group_v3/);
 assert.match(sql,/install_walkin_group_v4/);
 assert.match(sql,/restaurant_id=private\.staff_restaurant\(\)/);
 assert.match(sql,/Expected both walk-in functions/);
 assert.match(sql,/Unexpected restaurant hours lookup/);
});
test('RM-005: does not erase existing role, hold or booking logic',()=>{
 assert.match(sql,/pg_get_functiondef\(spec\.oid\)/);
 assert.match(sql,/execute replace\(definition,old_clause,new_clause\)/);
 assert.doesNotMatch(sql,/drop function|truncate table|delete from|update public\./i);
});

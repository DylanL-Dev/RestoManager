'use strict';
// Vault view is a fixture here: this tests SQL privileges, not encryption at rest.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {start}=require('./rm012-support.cjs');
(async()=>{const db=await start();let groups=0;try{
 const file=fs.readdirSync(path.resolve(__dirname,'../../supabase/migrations')).find(f=>f.endsWith('_rm015_dev_runtime_vault.sql')),body=fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',file),'utf8');
 await db.ok("create schema vault;create table vault.secrets_fixture(name text unique,secret text);create view vault.decrypted_secrets as select name,secret as decrypted_secret from vault.secrets_fixture;revoke all on schema vault from public,anon,authenticated,service_role;");
 await db.ok(body);await db.ok(body);groups++;
 for(const role of ['anon','authenticated']){const r=await db.sql(`set role ${role};select public.rm015_runtime_config_v1();`);assert.notEqual(r.code,0);assert.match(r.stderr,/permission denied/)}groups++;
 assert.notEqual((await db.sql("select public.rm015_runtime_config_v1();")).code,0);groups++;
 assert.notEqual((await db.sql("set role service_role;select public.rm015_runtime_config_v1();")).code,0);groups++;
 await db.ok("insert into vault.secrets_fixture values ('rm015_runtime_v1','{\"marker\":\"fixture\"}'),('other-secret','{\"marker\":\"never-return\"}');");
 assert.deepEqual(await db.json("set role service_role;select public.rm015_runtime_config_v1();"),{marker:'fixture'});groups++;
 assert.notEqual((await db.sql(db.ctx(1,'select public.rm015_runtime_config_v1();','service_role'))).code,0);groups++;
 assert.notEqual((await db.sql("set role service_role;select * from vault.decrypted_secrets;")).code,0);groups++;
 const meta=await db.json("select json_build_object('anon',has_function_privilege('anon','public.rm015_runtime_config_v1()','execute'),'staff',has_function_privilege('authenticated','public.rm015_runtime_config_v1()','execute'),'backend',has_function_privilege('service_role','public.rm015_runtime_config_v1()','execute'),'path',(select proconfig from pg_proc where oid='public.rm015_runtime_config_v1()'::regprocedure));");assert.equal(meta.anon,false);assert.equal(meta.staff,false);assert.equal(meta.backend,true);assert.deepEqual(meta.path,['search_path=""']);groups++;
 console.log(JSON.stringify({groups,network:'none',vault:'view fixture; encryption not simulated',result:'passed'}));
}finally{await db.stop()}})().catch(e=>{console.error(e);process.exitCode=1});

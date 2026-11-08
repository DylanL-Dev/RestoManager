'use strict';
// Uses only the existing network-disabled disposable test container.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
module.exports=async({docker,container,mission3})=>{
 const db='hosted_migrations',admin='hosted_migration_admin',results=[];
 async function sql(query,user='postgres',allowFailure=false){
  const r=await docker(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',user,'-d',db],query);
  if(!allowFailure)assert.equal(r.code,0,r.stderr);
  return r;
 }
 const pass=name=>{results.push(name);console.log('PASS '+name)};
 const root=path.resolve(__dirname,'../..');
 let r=await docker(['exec',container,'createdb','-U','postgres',db]);assert.equal(r.code,0,r.stderr);
 const fixture=fs.readFileSync(path.join(__dirname,'fixture.sql'),'utf8')
  .replace('create role anon nologin;create role authenticated nologin;create role resto_service_writer nologin nobypassrls;','');
 await sql(fixture);await sql(fs.readFileSync(path.join(__dirname,'seed.sql'),'utf8'));
 // Membership grants ownership rights, without inheriting the SUPERUSER flag.
 // This models hosted postgres: owner/member, BYPASSRLS, but not superuser.
 await sql(`grant anon,authenticated,resto_service_writer to postgres;
  create role ${admin} login nosuperuser createdb createrole bypassrls;grant postgres to ${admin};`);
 assert.equal((await sql('select not rolsuper from pg_roles where rolname=current_user;',admin)).stdout.trim(),'t');
 async function grants(expected){
  assert.equal((await sql("select has_schema_privilege('resto_service_writer','public','CREATE')::text||','||has_schema_privilege('resto_service_writer','private','CREATE')::text;",admin)).stdout.trim(),expected);
 }
 await grants('false,false');
 for(const [name,marker] of [['mission2_reservation_edits.sql','edit_version'],...(mission3?[['mission3_validation_integration.sql','service_sync_state_v1']]:[])]){
  const body=fs.readFileSync(path.join(root,'supabase/scripts',name),'utf8');
  const injected=body.replace(/commit;\s*$/i,"do $$begin raise exception 'HOSTED_ROLLBACK';end$$;commit;");
  r=await sql(injected,admin,true);assert.notEqual(r.code,0);assert.match(r.stderr,/HOSTED_ROLLBACK/);
  await grants('false,false');
  const absent=marker==='edit_version'
   ?"select not exists(select 1 from information_schema.columns where table_schema='public' and table_name='reservations' and column_name='edit_version');"
   :"select to_regprocedure('public.service_sync_state_v1()') is null;";
  assert.equal((await sql(absent,admin)).stdout.trim(),'t');
  pass(name+': non-superuser rollback preserves schema and writer privileges');
  await sql(body,admin);await grants('false,false');
  await sql(body,admin);await grants('false,false');
  pass(name+': non-superuser applies and reapplies without persistent schema CREATE');
  await sql('grant create on schema public to resto_service_writer;');
  await sql(body,admin);await grants('true,false');
  await sql('revoke create on schema public from resto_service_writer;');
  pass(name+': pre-existing schema CREATE grant is preserved');
 }
 assert.equal((await sql('select count(*)>0 and bool_and(edit_version is not null) from public.reservations;',admin)).stdout.trim(),'t');
 return results;
};

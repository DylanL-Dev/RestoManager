'use strict';
const assert=require('node:assert/strict');

// Runs ONLY against the network-isolated disposable PostgreSQL container.
// The business tables and production Supabase project are never touched.
module.exports=async({ok,sql,ctx,fails,test,user,lit})=>{
 await test('Platform role: default deny, self-read only, no employee cross-read',async()=>{
  assert.equal(await ok("select relrowsecurity::text||','||relforcerowsecurity::text from pg_class where oid='public.platform_admins'::regclass"),'true,true');
  assert.equal(await ok("select has_table_privilege('authenticated','public.platform_admins','select')"),'t');
  for(const verb of ['insert','update','delete'])
   assert.equal(await ok("select has_table_privilege('authenticated','public.platform_admins',"+lit(verb)+")"),'f');
  assert.equal((await ok(ctx(1,'select count(*) from public.platform_admins'))).split('\n').at(-1),'0');
 });
 await test('Platform admin membership: only verified signed-in owner sees own active row',async()=>{
  await ok('insert into public.platform_admins(user_id,active) values('+lit(user(6))+',true)');
  assert.equal((await ok(ctx(6,'select count(*) from public.platform_admins'))).split('\n').at(-1),'1');
  assert.equal((await ok(ctx(1,'select count(*) from public.platform_admins'))).split('\n').at(-1),'0');
  assert.equal((await ok(ctx(3,'select count(*) from public.platform_admins'))).split('\n').at(-1),'0');
  await fails(1,'insert into public.platform_admins(user_id,active) values('+lit(user(1))+',true)','42501');
  await fails(6,'update public.platform_admins set active=false where user_id='+lit(user(6)),'42501');
  await fails(6,'delete from public.platform_admins where user_id='+lit(user(6)),'42501');
  await ok('update public.platform_admins set active=false where user_id='+lit(user(6)));
  assert.equal((await ok(ctx(6,'select count(*) from public.platform_admins'))).split('\n').at(-1),'0');
  await fails(6,'select * from public.platform_admins','42501','anon');
 });
};

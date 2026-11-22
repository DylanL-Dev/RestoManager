'use strict';
/* Disposable network-disabled PostgreSQL 17, with fictional identities only. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {start,uid}=require('./rm012-support.cjs');
const migration=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261122170000_rm0172_dev_secure_signup.sql'),'utf8');
let db;
const sql=(who,query,role='authenticated')=>db.sql(db.ctx(who,query,role));
const count=(who,table)=>db.json(db.ctx(who,'select to_json((select count(*) from public.'+table+'))'));
(async()=>{
 try{
  db=await start();
  await db.ok('alter table auth.users add column if not exists email text, add column if not exists email_confirmed_at timestamptz, add column if not exists is_anonymous boolean not null default false, add column if not exists deleted_at timestamptz;');
  await db.ok(migration);
  console.log('PASS migration applies on isolated legacy schema');
  assert.equal(await db.json("select to_json((select enabled from private.rm017_signup_gate where id=1))"),false);
  assert.equal(await db.json("select to_json((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.rm017_establishment_profiles'::regclass))"),true);
  console.log('PASS registration gate closed, RLS enabled and forced');
  for(const [who,expected] of [[1,{restaurants:1,staff_profiles:1,reservations:4,reservation_tables:4,restaurant_tables:8}],
                                [4,{restaurants:1,staff_profiles:1,reservations:1,reservation_tables:1,restaurant_tables:1}]]){
   for(const [table,number] of Object.entries(expected))assert.equal(await count(who,table),number,table+' user '+who+' must only see own tenant');
  }
  console.log('PASS independent staff cannot read the other restaurant');
  const call="select public.rm017_complete_signup_v1('Le Nouveau Jardin','Rouen','independent')";
  let failed=await sql(6,call);
  assert.notEqual(failed.code,0,'Disabled signup must reject all users');
  assert.match(failed.stderr,/42501/);
  await db.ok("update private.rm017_signup_gate set enabled=true where id=1");
  failed=await sql(6,call);
  assert.notEqual(failed.code,0,'Unconfirmed email must be denied');
  assert.match(failed.stderr,/42501/);
  failed=await sql(6,call,'anon');
  assert.notEqual(failed.code,0,'Anon cannot call privileged signup function');
  assert.match(failed.stderr,/42501/);
  console.log('PASS disabled, unconfirmed and anonymous signup requests rejected');
  await db.ok("update auth.users set email='new-owner@example.test',email_confirmed_at=now() where id='"+uid(6)+"'");
  const created=await db.json(db.ctx(6,"select to_json(public.rm017_complete_signup_v1('Le Nouveau Jardin','Rouen','independent'))"));
  assert.equal(created.type,'independent');assert.equal(created.status,'configuration_required');
  assert.match(created.restaurant_id,/^[0-9a-f-]{36}$/);
  assert.equal(await count(6,'restaurants'),1);
  assert.equal(await count(1,'restaurants'),1);
  assert.equal(await count(4,'restaurants'),1);
  assert.equal(await db.json("select to_json((select not lunch_enabled and not dinner_enabled from public.restaurant_hours where restaurant_id='"+created.restaurant_id+"'))"),true);
  assert.equal(await db.json("select to_json((select count(*) from public.restaurant_rooms where restaurant_id='"+created.restaurant_id+"'))"),1);
  const repeat=await sql(6,call);
  assert.notEqual(repeat.code,0,'One account must not create two establishments');
  assert.match(repeat.stderr,/23505/);
  console.log('PASS verified email creates one tenant, closed services and single room');
  assert.equal(await count(6,'reservations'),0,'A newly registered owner must not read old reservations');
  console.log('PASS new owner cannot read either existing restaurant');
 }catch(e){console.error(e.stack||e);process.exitCode=1}
 finally{if(db)await db.stop()}
})();

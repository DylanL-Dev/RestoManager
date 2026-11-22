'use strict';
/* RM-017.2.1: disposable network-disabled PostgreSQL fixture. No hosted DB. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {start,uid}=require('./rm012-support.cjs');
const root=path.resolve(__dirname,'../..'),migration=name=>fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8');
let db;
const call=(user,kind='independent')=>db.sql(db.ctx(user,"select public.rm017_complete_signup_v1('Restaurant fictif','Rouen','"+kind+"')"));
const jsonCall=(user,kind='independent')=>db.json(db.ctx(user,"select to_json(public.rm017_complete_signup_v1('Restaurant fictif','Rouen','"+kind+"'))"));
const expectDenied=async(user,kind='independent',code='42501')=>{
 const r=await call(user,kind);assert.notEqual(r.code,0,'Expected denial');assert.match(r.stderr,new RegExp(code),r.stderr);
};
(async()=>{
 try{
  db=await start();
  await db.ok('alter table auth.users add column if not exists email text, add column if not exists email_confirmed_at timestamptz, add column if not exists is_anonymous boolean not null default false, add column if not exists deleted_at timestamptz;');
  await db.ok(migration('20261122170000_rm0172_dev_secure_signup.sql'));
  await db.ok(migration('20261122175200_rm01721_dev_email_pilot_allowlist.sql'));
  assert.equal(await db.json('select to_json((select count(*) from private.rm017_pilot_invites))'),0);
  assert.equal(await db.json('select to_json((select enabled from private.rm017_signup_gate where id=1))'),false);
  console.log('PASS DEV migrations: no invitations and global gate off');
  await db.ok("update auth.users set email='pilot-hotel@example.test',email_confirmed_at=now() where id='"+uid(6)+"';");
  await expectDenied(6,'hotel');
  await db.ok("update private.rm017_signup_gate set enabled=true where id=1;");
  await expectDenied(6,'hotel'); // confirmed but not invited.
  await db.ok("insert into private.rm017_pilot_invites(email,establishment_type,expires_at) values ('pilot-hotel@example.test','independent',now()+interval '3 days');");
  await expectDenied(6,'hotel'); // type mismatch.
  await db.ok("update private.rm017_pilot_invites set establishment_type='hotel',expires_at=now()-interval '1 minute';");
  await expectDenied(6,'hotel'); // expired.
  await db.ok("update private.rm017_pilot_invites set expires_at=now()+interval '3 days',active=false;");
  await expectDenied(6,'hotel'); // inactive.
  console.log('PASS confirmed but non-invited, wrong type, expired and inactive are refused');
  await db.ok("update private.rm017_pilot_invites set active=true;");
  let r=await db.sql(db.ctx(6,'select * from private.rm017_pilot_invites'));
  assert.notEqual(r.code,0,'Pilot list must be invisible to staff');
  assert.match(r.stderr,/permission denied/i);
  const hotel=await jsonCall(6,'hotel');
  assert.equal(hotel.type,'hotel');
  assert.equal(hotel.status,'configuration_required');
  assert.equal(await db.json("select to_json((select consumed_by='"+uid(6)+"'::uuid and consumed_at is not null from private.rm017_pilot_invites where email='pilot-hotel@example.test'))"),true);
  await expectDenied(6,'hotel','23505');
  assert.equal(await db.json("select to_json((select count(*) from public.rm017_establishment_profiles))"),1);
  assert.equal(await db.json("select to_json((select count(*) from public.restaurants))"),3);
  assert.equal(await db.json("select to_json((select count(*) from public.restaurant_rooms where restaurant_id='"+hotel.restaurant_id+"'))"),1);
  assert.equal(await db.json("select to_json((select not lunch_enabled and not dinner_enabled from public.restaurant_hours where restaurant_id='"+hotel.restaurant_id+"'))"),true);
  console.log('PASS hotel invitation consumed atomically, repeat denied, services closed');
  await db.ok("insert into auth.users(id,email,email_confirmed_at,is_anonymous) values ('"+uid(7)+"','pilot-independent@example.test',null,false)");
  await db.ok("insert into private.rm017_pilot_invites(email,establishment_type,expires_at) values ('pilot-independent@example.test','independent',now()+interval '3 days');");
  await expectDenied(7,'independent'); // no email confirmation.
  await db.ok("update auth.users set email_confirmed_at=now() where id='"+uid(7)+"';");
  const independent=await jsonCall(7,'independent');
  assert.equal(independent.type,'independent');
  assert.notEqual(independent.restaurant_id,hotel.restaurant_id);
  assert.equal(await db.json("select to_json((select count(*) from public.rm017_establishment_profiles))"),2);
  assert.equal(await db.json("select to_json((select count(*) from public.restaurants))"),4);
  const view=(user,table)=>db.json(db.ctx(user,'select to_json((select count(*) from public.'+table+'))'));
  for(const user of [1,4,6,7])assert.equal(await view(user,'restaurants'),1);
  for(const user of [6,7])assert.equal(await view(user,'reservations'),0);
  for(const user of [6,7])assert.equal(await view(user,'rm017_establishment_profiles'),1);
  console.log('PASS independent and hotel remain RLS-isolated from existing and each other');
  console.log('RM-017.2.1 isolated pilot security: PASS');
 }catch(e){console.error(e.stack||e);process.exitCode=1;}
 finally{if(db)await db.stop();}
})();

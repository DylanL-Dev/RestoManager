'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {start,uid}=require('./rm012-support.cjs');
const root=path.resolve(__dirname,'../..'),migration=n=>fs.readFileSync(path.join(root,'supabase/migrations',n),'utf8');
let db;
const users={6:{email:'pilot-independent@example.test',type:'independent',siret:'13002526500013'},7:{email:'pilot-hotel@example.test',type:'hotel',siret:'55210055400013'}};
const sqlcall=(f,params)=>'select to_json(public.'+f+'('+params.map(x=>"'"+x+"'").join(',')+'))';
const signup=id=>db.sql(db.ctx(id,"select public.rm017_complete_signup_v1('Restaurant fictif','Rouen','"+users[id].type+"')"));
const created=id=>db.json(db.ctx(id,"select to_json(public.rm017_complete_signup_v1('Restaurant fictif','Rouen','"+users[id].type+"'))"));
const denied=async(id,code='42501')=>{
 const r=await signup(id);assert.notEqual(r.code,0,'Signup must be rejected');assert.match(r.stderr,new RegExp(code),r.stderr);
};
(async()=>{
 try{
  db=await start();
  if(!await db.json("select to_json(exists(select 1 from pg_roles where rolname='supabase_auth_admin'))"))await db.ok('create role supabase_auth_admin nologin;');
  await db.ok("alter table auth.users add column if not exists email text, add column if not exists email_confirmed_at timestamptz, add column if not exists is_anonymous boolean not null default false, add column if not exists deleted_at timestamptz, add column if not exists raw_user_meta_data jsonb not null default '{}'::jsonb;");
  for(const m of ['20261122170000_rm0172_dev_secure_signup.sql','20261122175200_rm01721_dev_email_pilot_allowlist.sql','20261122180000_rm01722_dev_siret_registry.sql'])await db.ok(migration(m));
  assert.equal(await db.json("select to_json((select enabled from private.rm017_signup_gate where id=1))"),false);
  assert.equal(await db.json("select to_json((select count(*) from private.rm017_siret_prechecks))"),0);
  assert.equal(await db.json("select to_json(has_function_privilege('anon','public.rm017_record_siret_v1(text,text,text,text,text)','execute'))"),false);
  assert.equal(await db.json("select to_json(has_function_privilege('authenticated','public.rm017_record_siret_v1(text,text,text,text,text)','execute'))"),false);
  assert.equal(await db.json("select to_json(has_function_privilege('service_role','public.rm017_record_siret_v1(text,text,text,text,text)','execute'))"),true);
  console.log('PASS SIRET migration and service-only proof, signup remains closed');
  for(const [key,user] of Object.entries(users)){
   const id=Number(key);
   if(id===7)await db.ok("insert into auth.users(id) values ('"+uid(id)+"') on conflict do nothing;");
   await db.ok("insert into private.rm017_pilot_invites(email,establishment_type,expires_at) values ('"+user.email+"','"+user.type+"',now()+interval '3 days');");
   await db.ok("update auth.users set email='"+user.email+"',email_confirmed_at=now(),raw_user_meta_data=jsonb_build_object('rm017_siret','"+user.siret+"') where id='"+uid(id)+"';");
  }
  await denied(6);
  await db.ok("update private.rm017_signup_gate set enabled=true where id=1;");
  await denied(6);
  const hook=id=>"select to_json(public.rm017_before_user_created_v1('{\"user\":{\"email\":\""+users[id].email+"\",\"user_metadata\":{\"rm017_type\":\""+users[id].type+"\",\"rm017_siret\":\""+users[id].siret+"\"}}}'::jsonb))";
  assert.equal((await db.json(hook(6))).error.http_code,403);
  console.log('PASS no official proof blocks verified signup and Auth creation');
  const record=id=>sqlcall('rm017_record_siret_v1',[users[id].email,users[id].type,users[id].siret,'SOCIETE PILOTE OFFICIELLE','Rouen']);
  const bad=await db.sql(db.ctx(6,record(6)));
  assert.notEqual(bad.code,0);assert.match(bad.stderr,/permission denied/i);
  assert.equal(await db.json(sqlcall('rm017_siret_allow_lookup_v1',[users[6].email,users[6].type,users[6].siret])),true);
  assert.equal(await db.json(record(6)),true);
  assert.deepEqual(await db.json(hook(6)),{});
  assert.equal(await db.json("select to_json((select count(*) from private.rm017_siret_prechecks))"),1);
  console.log('PASS only backend can record official registry evidence');
  await db.ok("update private.rm017_siret_prechecks set expires_at=now()-interval '1 minute' where email='"+users[6].email+"';");
  await denied(6);
  await db.ok("update private.rm017_siret_prechecks set expires_at=now()+interval '1 hour' where email='"+users[6].email+"';");
  const a=await created(6);
  assert.equal(a.type,'independent');
  assert.equal(await db.json("select to_json((select siret='"+users[6].siret+"' and siren='130025265' from public.rm017_establishment_profiles where restaurant_id='"+a.restaurant_id+"'))"),true);
  await denied(6,'23505');
  assert.equal((await db.json(hook(6))).error.http_code,403);
  console.log('PASS SIRET verified, consumed atomically, repeat and expired proofs denied');
  assert.equal(await db.json(sqlcall('rm017_siret_allow_lookup_v1',[users[7].email,users[7].type,users[7].siret])),true);
  assert.equal(await db.json(record(7)),true);
  const b=await created(7);assert.equal(b.type,'hotel');assert.notEqual(b.restaurant_id,a.restaurant_id);
  assert.equal(await db.json("select to_json((select count(*) from public.rm017_establishment_profiles where siret is not null))"),2);
  for(const id of [6,7]){
   assert.equal(await db.json(db.ctx(id,'select to_json((select count(*) from public.restaurants))')),1);
   assert.equal(await db.json(db.ctx(id,'select to_json((select count(*) from public.rm017_establishment_profiles))')),1);
   assert.equal(await db.json(db.ctx(id,'select to_json((select count(*) from public.reservations))')),0);
  }
  console.log('PASS distinct SIRETs, hotel and independent remain fully RLS-isolated');
 }catch(e){console.error(e.stack||e);process.exitCode=1;}
 finally{if(db)await db.stop();}
})();

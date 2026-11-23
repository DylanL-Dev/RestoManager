'use strict';
/* RM-017.3.2: disposable PostgreSQL and fictional users only. No hosted data. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {start,uid,rid}=require('./rm012-support.cjs');
const migration=name=>fs.readFileSync(path.join(__dirname,'../../supabase/migrations',name),'utf8');
let db;
const run=(user,query,role='authenticated')=>db.sql(db.ctx(user,query,role));
const read=(user,query)=>db.json(db.ctx(user,query));
const count=table=>db.json("select to_json((select count(*) from "+table+"))");
const deny=async(user,command,code='42501',role='authenticated')=>{
 const out=await run(user,command,role);
 assert.notEqual(out.code,0,'Must refuse: '+command);
 assert.match(out.stderr,new RegExp(code),out.stderr);
};
const mfa=(sql)=>"begin;set local role authenticated;select set_config('request.jwt.claim.sub','"+uid(6)+"',true);select set_config('request.jwt.claims','{\"aal\":\"aal2\"}',true);"+sql+";commit;";
const account="select to_json(public.rm017_lifecycle_request_v1('account_deletion',null))";
const closure=id=>"select to_json(public.rm017_lifecycle_request_v1('restaurant_closure','"+id+"'))";
const review=(id,status)=>"select to_json(public.rm017_lifecycle_review_v1('"+id+"','"+status+"'))";
(async()=>{
 try{
  db=await start();
  await db.ok("alter table auth.users add column if not exists email text, add column if not exists email_confirmed_at timestamptz, add column if not exists is_anonymous boolean not null default false, add column if not exists deleted_at timestamptz;");
  await db.ok("create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;");
  await db.ok(migration('20261122170000_rm0172_dev_secure_signup.sql'));
  await db.ok(migration('20261123080000_rm01732_dev_lifecycle_requests.sql'));
  assert.equal(await db.json("select to_json((select requests_enabled or reviews_enabled from private.rm017_lifecycle_gate where id=1))"),false);
  assert.equal(await count('public.rm017_lifecycle_requests'),0);
  assert.equal(await count('private.rm017_lifecycle_events'),0);
  for(const sig of ['rm017_lifecycle_request_v1(text,uuid)','rm017_lifecycle_review_v1(uuid,text)']){
   assert.equal(await db.json("select to_json(has_function_privilege('anon','public."+sig+"','execute'))"),false);
   assert.equal(await db.json("select to_json(has_function_privilege('authenticated','public."+sig+"','execute'))"),true);
  }
  for(const verb of ['INSERT','UPDATE','DELETE'])
   assert.equal(await db.json("select to_json(has_table_privilege('authenticated','public.rm017_lifecycle_requests','"+verb+"'))"),false);
  assert.equal(await db.json("select to_json((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.rm017_lifecycle_requests'::regclass))"),true);
  console.log('PASS migration gates OFF, RLS, no public write/anonymous functions');

  const before={restaurants:await count('public.restaurants'),reservations:await count('public.reservations'),staff:await count('public.staff_profiles')};
  for(const n of [1,4,6]){
   await db.ok("insert into auth.users(id) values ('"+uid(n)+"') on conflict do nothing;");
   await db.ok("update auth.users set email='pilot"+n+"@example.test',email_confirmed_at=now() where id='"+uid(n)+"';");
  }
  await db.ok("insert into public.rm017_establishment_profiles(restaurant_id,establishment_type,city,created_by) values ('"+rid(1)+"','independent','Rouen','"+uid(1)+"'),('"+rid(2)+"','hotel','Caen','"+uid(4)+"');");
  await deny(1,account);
  await deny(1,closure(rid(1)));
  await deny(1,account,'42501','anon');
  await db.ok("update private.rm017_lifecycle_gate set requests_enabled=true where id=1;");
  await deny(4,closure(rid(1)));
  await deny(6,closure(rid(2)));
  await deny(1,"select public.rm017_lifecycle_request_v1('account_deletion','"+rid(1)+"')",'22023');
  await deny(1,"select public.rm017_lifecycle_request_v1('suspend',null)",'22023');
  const a=await read(1,account),restaurant=await read(1,closure(rid(1))),other=await read(4,account);
  assert.equal(a.kind,'account_deletion');assert.equal(a.execution,'none');
  assert.equal(restaurant.status,'requested');assert.equal(other.kind,'account_deletion');
  await deny(1,account,'23505');
  assert.equal(await read(1,"select to_json((select count(*) from public.rm017_lifecycle_requests))"),2);
  assert.equal(await read(4,"select to_json((select count(*) from public.rm017_lifecycle_requests))"),1);
  assert.equal(await read(6,"select to_json((select count(*) from public.rm017_lifecycle_requests))"),0);
  await deny(1,"insert into public.rm017_lifecycle_requests(kind,requested_by) values ('account_deletion','"+uid(4)+"')");
  await deny(1,"update public.rm017_lifecycle_requests set status='closed_reviewed' where id='"+a.request_id+"'");
  await deny(1,"delete from public.rm017_lifecycle_requests where id='"+a.request_id+"'");
  await deny(1,"select * from private.rm017_lifecycle_events");
  assert.equal(await count('private.rm017_lifecycle_events'),3);
  console.log('PASS requests, ownership and tenant RLS, denied direct mutations');

  await deny(1,review(a.request_id,'reviewing'));
  await db.ok("insert into public.platform_admins(user_id,active) values ('"+uid(6)+"',true);");
  assert.equal(await read(6,"select to_json((select count(*) from public.rm017_lifecycle_requests))"),3);
  await deny(6,review(a.request_id,'reviewing')); // Review gate remains OFF.
  await db.ok("update private.rm017_lifecycle_gate set reviews_enabled=true where id=1;");
  await deny(6,review(a.request_id,'reviewing')); // Not AAL2.
  await deny(1,review(a.request_id,'reviewing')); // Not Root.
  await db.ok("update public.platform_admins set active=false where user_id='"+uid(6)+"';");
  assert.equal(await read(6,"select to_json((select count(*) from public.rm017_lifecycle_requests))"),0);
  let result=await db.sql(mfa(review(a.request_id,'reviewing')));
  assert.notEqual(result.code,0,'Revoked Root must be denied even with AAL2');
  await db.ok("update public.platform_admins set active=true where user_id='"+uid(6)+"';");
  result=await db.sql(mfa(review(a.request_id,'closed_reviewed')));
  assert.notEqual(result.code,0,'Root cannot skip review stage');
  const reviewing=await db.json(mfa(review(a.request_id,'reviewing')));
  assert.equal(reviewing.execution,'none');
  const closed=await db.json(mfa(review(a.request_id,'closed_reviewed')));
  assert.equal(closed.status,'closed_reviewed');
  const rejected=await db.json(mfa(review(other.request_id,'closed_rejected')));
  assert.equal(rejected.execution,'none');
  result=await db.sql(mfa(review(a.request_id,'reviewing')));
  assert.notEqual(result.code,0,'Closed request cannot be reopened');
  assert.equal(await count('private.rm017_lifecycle_events'),6);
  assert.deepEqual({restaurants:await count('public.restaurants'),reservations:await count('public.reservations'),staff:await count('public.staff_profiles')},before);
  console.log('PASS active Root AAL2 only, review states and audit; restaurants/reservations/staff intact');
 }catch(e){console.error(e.stack||e);process.exitCode=1}
 finally{if(db)await db.stop()}
})();

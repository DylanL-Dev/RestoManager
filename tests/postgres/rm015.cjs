'use strict';
const {start}=require('./rm015-support.cjs'),{rid,uid}=require('./rm012-support.cjs');
const {randomUUID,createHash}=require('node:crypto'),assert=require('node:assert/strict');
const day=offset=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts().map(x=>[x.type,x.value]));const d=new Date(`${p.year}-${p.month}-${p.day}T12:00Z`);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)};
const hash=s=>createHash('sha256').update(s).digest('hex');
const contact={firstName:'Camille',lastName:'Fictif',email:'camille@example.test',phone:'',notes:'Une poussette',accepted:true};
const settings={version:0,operation:randomUUID(),slug:'restaurant-fictif-a',enabled:true,maxParty:12,pendingMinutes:60,horizonDays:60,leadMinutes:30,cancellationMinutes:0,privacyNotice:'Exercice isolé : données intégralement fictives, sans envoi réel.',privacyContact:'assistance@example.test',cancellationNotice:'Annulation possible avant le début de la réservation fictive.'};
let db,passed=0;const results=[];
async function okCall(name,action,payload,user){const r=await db.rpc(name,action,payload,user);assert.equal(r.error,null,JSON.stringify(r.error));return r.data}
async function denied(name,action,payload,detail,user){const r=await db.rpc(name,action,payload,user);assert.ok(r.error,'Expected refusal');assert.match(r.error.details+' '+r.error.code+' '+r.error.message,new RegExp(detail));return r.error}
async function reset(){
 await db.ok('delete from private.booking_drafts_v3;delete from public.table_holds;delete from public.reservation_tables;delete from public.reservations;truncate private.rm015_mail,private.rm015_operations,private.rm015_audit,private.rm015_requests,private.rm015_settings,private.rm015_rate cascade;delete from public.service_closures;update public.restaurant_tables set seats=6,active=true;update public.restaurant_hours set arrival_limit_percent=60;');
 await okCall('rm015_staff_v1','configure',settings,1);
}
async function hold(party=2,{time='19:00',date=day(2),service='dinner',ip='ip1'}={}){
 const key=randomUUID(),proof=hash('proof'+key),token=hash('token'+key),draft={party,date,service,time};
 const payload={restaurant:settings.slug,key,proof_hash:proof,token_hash:token,token_cipher:'v1.fictional.cipher',ip_hash:hash(ip),draft};
 const r=await okCall('rm015_gateway_v1','hold',payload);return {key,proof,token,draft,data:r.data,payload};
}
async function submit(h,c=contact,operation=randomUUID()){
 const p={restaurant:settings.slug,key:h.key,proof_hash:h.proof,draft:h.draft,contact:c,operation,version:h.data.version};const r=await okCall('rm015_gateway_v1','submit',p);return {...h,data:r.data,submission:p};
}
async function test(name,fn){await reset();await fn();passed++;results.push(name);console.log('PASS '+name)}
(async()=>{try{
 db=await start();await db.ok("create or replace function private.rm012_now() returns timestamptz language sql volatile security invoker set search_path='' as $$select clock_timestamp()$$;");
 await test('Isolated migration applies twice; no account or existing restaurant setting is created by activation',async()=>{
  assert.equal(await db.ok("select rolbypassrls or rolsuper or rolcanlogin from pg_roles where rolname='rm015_public_writer'"),'f');
  assert.equal(await db.ok('select count(*) from auth.users'),'6');
  assert.equal((await okCall('rm015_gateway_v1','profile',{restaurant:settings.slug})).pendingMinutes,60);
 });
 await test('Public and authenticated roles cannot call backend RPC or read private records',async()=>{
  for(const role of ['anon','authenticated']){
   const r=await db.sql(`begin;set local role ${role};select public.rm015_gateway_v1('profile','{}');commit;`);assert.notEqual(r.code,0);assert.match(r.stderr,/permission denied/);
   const q=await db.sql(`begin;set local role ${role};select * from private.rm015_requests;commit;`);assert.notEqual(q.code,0);
  }
  await denied('rm015_staff_v1','configure',settings,'42501',3);await denied('rm015_staff_v1','state',{},'42501',5);
 });
 await test('Custom tenant settings do not bypass staff tenant isolation or grant a staff role to the backend',async()=>{
  const count=await db.ok(db.ctx(3,`select set_config('rm015.restaurant','${rid(2)}',true);select count(*) from public.restaurant_tables`));assert.equal(count.split('\n').at(-1),'8');
  const backend=await db.sql(`begin;set local role service_role;select set_config('rm015.restaurant','${rid(1)}',true);select public.acquire_table_hold_v2(null,null,null,null);commit;`);assert.notEqual(backend.code,0);assert.match(backend.stderr,/permission denied|42501/);
 });
 await test('One to three people commit one confirmed Web reservation without arriving or installing',async()=>{
  const r=await submit(await hold());assert.equal(r.data.state,'confirmed');assert.match(r.data.reference,/^WEB-/);
  const row=await db.json("select to_jsonb(r) from public.reservations r where source_channel='web'");assert.equal(row.created_by,null);assert.equal(row.status,'confirmed');assert.equal(row.seated_at,null);assert.equal(row.arrived_at,null);assert.equal(row.hotel_room,null);
  assert.equal(await db.ok('select count(*) from public.table_holds'),'0');assert.equal(await db.ok('select count(*) from public.reservation_tables'),'1');
  assert.equal(JSON.stringify(r.data).includes('table_ids'),false);
 });
 await test('Same confirmation retries return one reference; changed payload under the same operation is refused',async()=>{
  const r=await submit(await hold());const again=await okCall('rm015_gateway_v1','submit',r.submission);assert.equal(again.data.reference,r.data.reference);assert.equal(await db.ok('select count(*) from public.reservations'),'1');
  await denied('rm015_gateway_v1','submit',{...r.submission,contact:{...contact,lastName:'Different'}},'IDEMPOTENCY');
 });
 await test('Group of four waits for Restaurant, holds for one hour, Reception cannot approve',async()=>{
  const r=await submit(await hold(4));assert.equal(r.data.state,'pending');assert.equal(await db.ok('select count(*) from public.reservations'),'0');
  const seconds=Number(await db.ok('select extract(epoch from(expires_at-clock_timestamp()))::int from public.table_holds limit 1'));assert.ok(seconds>3500&&seconds<=3600);
  const state=await okCall('rm015_staff_v1','state',{},1),request=state.requests[0];
  const rec=await okCall('rm015_staff_v1','state',{},3);assert.equal(rec.requests[0].contact.email,undefined);
  await denied('rm015_staff_v1','approve',{id:request.id,version:request.version},'42501',3);
  await okCall('rm015_staff_v1','approve',{id:request.id,version:request.version},1);const read=await okCall('rm015_gateway_v1','read',{restaurant:settings.slug,token_hash:r.token});assert.equal(read.data.state,'confirmed');assert.equal(await db.ok('select count(*) from public.reservations'),'1');
 });
 await test('Pending Web hold blocks the legacy employee hold API even without an employee owner',async()=>{
  await submit(await hold(4));const h=await db.json('select to_jsonb(h) from public.table_holds h limit 1');
  const r=await db.sql(db.ctx(1,`select public.acquire_table_hold_v2('${h.table_id}','${h.starts_at}','${h.ends_at}','${randomUUID()}')`));assert.notEqual(r.code,0);assert.match(r.stderr,/23P01/);
 });
 await test('Pending expiry releases its hold; a rejected request does not create a booking',async()=>{
  const r=await submit(await hold(4));await db.ok("update private.rm015_requests set expires_at=clock_timestamp()-interval '1 second';");
  const read=await okCall('rm015_gateway_v1','read',{restaurant:settings.slug,token_hash:r.token});assert.equal(read.data.state,'expired');assert.equal(await db.ok('select count(*) from public.table_holds'),'0');
 });
 await test('A seated table from yesterday remains unavailable for public bookings',async()=>{
  await db.ok("update public.restaurant_tables set active=false where label<>'Table 1';");
  const id=randomUUID();await db.ok(`insert into public.reservations(id,restaurant_id,guest_name,party_size,starts_at,ends_at,status,notes) values('${id}','${rid(1)}','Fictif installé',2,clock_timestamp()-interval '1 day',clock_timestamp()-interval '23 hours','seated','');insert into public.reservation_tables(reservation_id,table_id,restaurant_id) select '${id}',id,restaurant_id from public.restaurant_tables where restaurant_id='${rid(1)}' and active;`);
  await denied('rm015_gateway_v1','hold',{restaurant:settings.slug,key:randomUUID(),proof_hash:hash('p'),token_hash:hash('t'),token_cipher:'v1.fake.cipher',ip_hash:hash('i'),draft:{party:2,date:day(2),service:'dinner',time:'19:00'}},'FULL');
 });
 await test('Arrival percentage is authoritative for Web and uses the existing restaurant setting',async()=>{
  await db.ok('update public.restaurant_tables set seats=2;update public.restaurant_hours set arrival_limit_percent=40;');
  await submit(await hold(2,{ip:'a',time:'19:00'}),{...contact,email:'a@example.test'});await submit(await hold(2,{ip:'b',time:'19:15'}),{...contact,email:'b@example.test'});await submit(await hold(2,{ip:'c',time:'19:30'}),{...contact,email:'c@example.test'});
  const available=await okCall('rm015_gateway_v1','availability',{restaurant:settings.slug,draft:{date:day(2),party:2,service:'dinner'}});assert.equal(available.slots.find(x=>x.time==='19:45').available,false);assert.equal(available.slots.find(x=>x.time==='20:00').available,true);
 });
 await test('Unknown and foreign-restaurant tokens expose no reservation',async()=>{
  const r=await submit(await hold());await okCall('rm015_staff_v1','configure',{...settings,slug:'restaurant-fictif-b'},4);
  await denied('rm015_gateway_v1','read',{restaurant:'restaurant-fictif-b',token_hash:r.token},'TOKEN');await denied('rm015_gateway_v1','read',{restaurant:settings.slug,token_hash:hash('bad')},'TOKEN');
  await denied('rm015_gateway_v1','read',{restaurant:settings.slug,token_hash:r.token},'42501',3);
 });
 await test('Customer group change preserves original confirmed reservation until Restaurant approves',async()=>{
  const r=await submit(await hold(2));const next={party:4,date:day(3),service:'dinner',time:'20:00'};
  const p={restaurant:settings.slug,token_hash:r.token,operation:randomUUID(),version:r.data.version,draft:next,contact};
  const changed=await okCall('rm015_gateway_v1','modify',p);assert.equal(changed.data.state,'pending_change');assert.equal(changed.data.booking.party,2);assert.equal(changed.data.draft.party,4);
  const request=(await okCall('rm015_staff_v1','state',{},1)).requests[0];await okCall('rm015_staff_v1','reject',{id:request.id,version:request.version},1);
  const original=await okCall('rm015_gateway_v1','read',{restaurant:settings.slug,token_hash:r.token});assert.equal(original.data.booking.party,2);assert.equal(original.data.state,'confirmed');
 });
 await test('Expired or cancelled management link is refused; valid cancellation never seats or deletes a guest',async()=>{
  const r=await submit(await hold());const p={restaurant:settings.slug,token_hash:r.token,version:r.data.version,operation:randomUUID()};
  const cancel=await okCall('rm015_gateway_v1','cancel',p);assert.equal(cancel.data.state,'cancelled');assert.equal(await db.ok("select status from public.reservations limit 1"),'cancelled');
  await db.ok("update private.rm015_requests set token_expires_at=clock_timestamp()-interval '1 second'");await denied('rm015_gateway_v1','read',{restaurant:settings.slug,token_hash:r.token},'TOKEN');
 });
 await test('Mail is queued privately, claimed once and acknowledged with a matching lease',async()=>{
  await submit(await hold());const jobs=await okCall('rm015_mail_v1','claim',{});assert.equal(jobs.length,1);assert.match(jobs[0].email,/@example.test$/);
  assert.equal((await okCall('rm015_mail_v1','claim',{})).length,0);assert.equal((await okCall('rm015_mail_v1','ack',{id:jobs[0].id,lease:randomUUID(),providerId:'fake'})).accepted,false);
  assert.equal((await okCall('rm015_mail_v1','ack',{id:jobs[0].id,lease:jobs[0].lease,providerId:'fake'})).accepted,true);
 });
 await test('Two Web clients racing for the last table cannot both obtain a hold',async()=>{
  await db.ok("update public.restaurant_tables set active=false where label<>'Table 1';");
  const make=()=>({restaurant:settings.slug,key:randomUUID(),proof_hash:hash(randomUUID()),token_hash:hash(randomUUID()),token_cipher:'v1.fake.cipher',ip_hash:hash(randomUUID()),draft:{party:2,date:day(2),service:'dinner',time:'19:00'}});
  const values=await Promise.all([db.rpc('rm015_gateway_v1','hold',make()),db.rpc('rm015_gateway_v1','hold',make())]);assert.equal(values.filter(v=>!v.error).length,1);assert.equal(values.filter(v=>v.error?.details==='FULL').length,1);assert.equal(await db.ok('select count(*) from public.table_holds'),'1');
 });
 await test('A simultaneous staff draft and Web hold serialize on the shared restaurant mutex',async()=>{
  await db.ok("update public.restaurant_tables set active=false where label<>'Table 1';");
  const p={restaurant:settings.slug,key:randomUUID(),proof_hash:hash('p'),token_hash:hash('t'),token_cipher:'v1.fake.cipher',ip_hash:hash('i'),draft:{party:2,date:day(2),service:'dinner',time:'19:00'}};
  const staff=db.sql(db.ctx(1,`select public.booking_draft_v3('${randomUUID()}','hold',('${day(2)} 19:00'::timestamp at time zone 'Europe/Paris'),('${day(2)} 20:00'::timestamp at time zone 'Europe/Paris'),2)`));
  const [a,b]=await Promise.all([staff,db.rpc('rm015_gateway_v1','hold',p)]);assert.equal(Number(a.code===0)+Number(!b.error),1);assert.equal(await db.ok('select count(*) from public.table_holds'),'1');
 });
 await test('Restaurant double approval and stale settings saves never duplicate or overwrite a booking',async()=>{
  await submit(await hold(4));const r=(await okCall('rm015_staff_v1','state',{},1)).requests[0];const [a,b]=await Promise.all([db.rpc('rm015_staff_v1','approve',{id:r.id,version:r.version},1),db.rpc('rm015_staff_v1','approve',{id:r.id,version:r.version},2)]);assert.equal(a.error,null);assert.equal(b.error,null);assert.equal(await db.ok('select count(*) from public.reservations'),'1');
  const payload={...settings,version:1,operation:randomUUID(),maxParty:10};await okCall('rm015_staff_v1','configure',payload,1);await okCall('rm015_staff_v1','configure',payload,1);await denied('rm015_staff_v1','configure',{...payload,operation:randomUUID(),maxParty:9},'STALE',2);assert.equal((await okCall('rm015_staff_v1','state',{},1)).settings.maxParty,10);
 });
 await test('Current settings are revalidated before approval, without destroying the pending request',async()=>{
  await submit(await hold(4));const r=(await okCall('rm015_staff_v1','state',{},1)).requests[0];await okCall('rm015_staff_v1','configure',{...settings,version:1,operation:randomUUID(),maxParty:3},1);await denied('rm015_staff_v1','approve',{id:r.id,version:r.version},'FULL',1);assert.equal(await db.ok('select count(*) from public.reservations'),'0');assert.equal(await db.ok('select state from private.rm015_requests'),'pending');
 });
 await test('Expiry of a group modification restores the actual original date and keeps a system audit',async()=>{
  const r=await submit(await hold());await okCall('rm015_gateway_v1','modify',{restaurant:settings.slug,token_hash:r.token,operation:randomUUID(),version:r.data.version,draft:{party:4,date:day(3),service:'dinner',time:'20:00'},contact});await db.ok("update private.rm015_requests set expires_at=clock_timestamp()-interval '1 second'");const v=await okCall('rm015_gateway_v1','read',{restaurant:settings.slug,token_hash:r.token});assert.equal(v.data.state,'confirmed');assert.equal(v.data.draft.date,day(2));assert.equal(v.data.booking.party,2);assert.equal(await db.ok("select actor_type from private.rm015_audit where action='expire'"),'system');
 });
 await test('Employee changes supersede a pending proposal and synchronize the secure guest link',async()=>{
  const r=await submit(await hold());await okCall('rm015_gateway_v1','modify',{restaurant:settings.slug,token_hash:r.token,operation:randomUUID(),version:r.data.version,draft:{party:4,date:day(3),service:'dinner',time:'20:00'},contact});
  const row=await db.json('select to_jsonb(r) from public.reservations r limit 1');await db.ok(db.ctx(1,`select public.update_reservation_v4('${row.id}','${row.edit_version}','Camille Fictif',null,2,('${day(4)} 19:00'::timestamp at time zone 'Europe/Paris'),('${day(4)} 20:00'::timestamp at time zone 'Europe/Paris'),array(select table_id from public.reservation_tables where reservation_id='${row.id}'),'Note interne conservée')`));
  const v=await okCall('rm015_gateway_v1','read',{restaurant:settings.slug,token_hash:r.token});assert.equal(v.data.state,'confirmed');assert.equal(v.data.draft.date,day(4));assert.equal(v.data.lastResult,'superseded');assert.equal(await db.ok('select count(*) from public.table_holds'),'0');assert.ok(!JSON.stringify(v.data).includes('Note interne'));
 });
 await test('Closing the public channel stops new bookings but keeps existing guest cancellations available',async()=>{
  const r=await submit(await hold());await okCall('rm015_staff_v1','configure',{...settings,version:1,operation:randomUUID(),enabled:false},1);await denied('rm015_gateway_v1','profile',{restaurant:settings.slug},'UNAVAILABLE');assert.equal((await okCall('rm015_gateway_v1','profile',{restaurant:settings.slug,token_hash:r.token})).slug,settings.slug);await okCall('rm015_gateway_v1','cancel',{restaurant:settings.slug,token_hash:r.token,version:r.data.version,operation:randomUUID()});
 });
 await test('The persistent rate budget rejects excess attempts, including attempts whose booking fails',async()=>{
  const args={p_key:hash('rate'),p_bucket:'hold',p_limit:2,p_seconds:900};assert.equal((await db.backendRpc('rm015_rate_v1',args)).data.allowed,true);assert.equal((await db.backendRpc('rm015_rate_v1',args)).data.allowed,true);assert.equal((await db.backendRpc('rm015_rate_v1',args)).data.allowed,false);
 });
 await test('A stale email lease cannot acknowledge a retry and jobs older than deduplication retention stop',async()=>{
  await submit(await hold());const [job]=await okCall('rm015_mail_v1','claim',{});await db.ok("update private.rm015_mail set lease_until=clock_timestamp()-interval '1 second'");const [retry]=await okCall('rm015_mail_v1','claim',{});assert.equal(retry.id,job.id);assert.notEqual(retry.lease,job.lease);assert.equal((await okCall('rm015_mail_v1','ack',{id:job.id,lease:job.lease})).accepted,false);await db.ok("update private.rm015_mail set lease_until=clock_timestamp()-interval '1 second',created_at=clock_timestamp()-interval '24 hours'");assert.deepEqual(await okCall('rm015_mail_v1','claim',{}),[]);assert.equal(await db.ok('select state from private.rm015_mail where id='+db.lit(job.id)),'uncertain');
 });
 await test('Staff drafts consume the arrivals budget and Web holds appear in RM-012 blockers',async()=>{
  await db.ok("update public.restaurant_tables set active=label in ('Table 1','Table 2','Table 3');update public.restaurant_hours set arrival_limit_percent=40;");
  const r=await db.sql(db.ctx(1,`select public.booking_draft_v3('${randomUUID()}','hold',('${day(2)} 19:00'::timestamp at time zone 'Europe/Paris'),('${day(2)} 20:00'::timestamp at time zone 'Europe/Paris'),6)`));assert.equal(r.code,0,r.stderr);
  // ceil(18 * .40) = 8 covers; six employee-draft covers leave room for two only.
  const available=await okCall('rm015_gateway_v1','availability',{restaurant:settings.slug,draft:{date:day(2),party:3,service:'dinner'}});assert.equal(available.slots.find(s=>s.time==='19:15').available,false);assert.equal(available.slots.find(s=>s.time==='20:00').available,true);
  await hold(2);const closeout=await db.json("select private.rm012_day('"+rid(1)+"','"+day(2)+"',clock_timestamp())");assert.equal(closeout.active_holds,2);assert.equal(closeout.can_close,false);
 });
 await test('Paris midnight and both DST transitions reject nonexistent or ambiguous local slots',async()=>{
  const original=await db.json('select weekly_schedule from public.restaurant_hours limit 1');
  const clock=value=>db.ok(`create or replace function private.rm015_now() returns timestamptz language sql volatile security invoker set search_path='' as $$select '${value}'::timestamptz$$;`);
  try{
   await clock('2032-06-01T22:30:00Z');assert.equal((await okCall('rm015_gateway_v1','profile',{restaurant:settings.slug})).today,'2032-06-02');
   await db.ok("update public.restaurant_hours set weekly_schedule=jsonb_set(weekly_schedule,'{sunday,lunch}','{\"enabled\":true,\"start\":\"01:00\",\"end\":\"04:00\"}')");
   for(const [stamp,date]of [['2032-03-27T10:00:00Z','2032-03-28'],['2032-10-30T10:00:00Z','2032-10-31']]){
    await clock(stamp);const v=await okCall('rm015_gateway_v1','availability',{restaurant:settings.slug,draft:{party:2,date,service:'lunch'}});assert.equal(v.slots.find(s=>s.time==='02:30').available,false);assert.equal(v.slots.find(s=>s.time==='03:30').available,true);
   }
  }finally{await db.ok("create or replace function private.rm015_now() returns timestamptz language sql volatile security invoker set search_path='' as $$select clock_timestamp()$$;update public.restaurant_hours set weekly_schedule="+db.lit(JSON.stringify(original))+'::jsonb');}
 });
 const body=db.body,preservedFunctions=db.preservedFunctions;await db.stop();db=await require('./rm012-support.cjs').start();
 await db.ok('create role rm015_hosted_admin nosuperuser createrole createdb bypassrls;grant postgres to rm015_hosted_admin;');
 const injected=body.replace(/commit;\s*$/i,"do $$begin raise exception 'RM015_TEST_ROLLBACK';end$$;commit;");const rolled=await db.sql('set role rm015_hosted_admin;'+injected);assert.notEqual(rolled.code,0);assert.match(rolled.stderr,/RM015_TEST_ROLLBACK/);assert.equal(await db.ok("select to_regclass('private.rm015_requests') is null"),'t');assert.equal(await db.ok("select not exists(select 1 from information_schema.columns where table_schema='public' and table_name='reservations' and column_name='source_channel')"),'t');
 await db.ok('set role rm015_hosted_admin;'+body+'reset role;');await db.ok('set role rm015_hosted_admin;'+body+'reset role;');assert.equal(await db.ok("select has_schema_privilege('rm015_public_writer','public','CREATE') or has_schema_privilege('rm015_public_writer','private','CREATE')"),'f');passed++;results.push('Hosted-style non-superuser migration rollback, apply and reapply');console.log('PASS '+results.at(-1));
 const fs=require('node:fs'),path=require('node:path'),out=process.env.BROWSER_ARTIFACTS||path.resolve('test-results/rm0152-postgres');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed,failed:0,results,preservedFunctions,network:'none',remoteDatabaseWrites:0},null,2));
 console.log('RESULT '+passed+' isolated SQL groups passed');
}finally{await db?.stop()}})().catch(e=>{console.error(e);process.exitCode=1});

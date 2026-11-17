'use strict';
// Real PostgreSQL + pg_cron 1.6.4, fictional data, network-disabled container.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {start,uid,rid,booking,lit}=require('./rm012-support.cjs');
const out=path.resolve('test-results/rm012-policy'),results=[];
(async()=>{let db;try{
 db=await start({withPolicy:true});const {ok,sql,ctx,json,clock,reset,rpc}=db;
 const job=()=>json('select private.rm012_auto_close_job()');
 const rows=()=>json('select jsonb_agg(to_jsonb(r) order by id) from public.reservations r');
 async function ready(){await ok(`update public.reservations set status='completed' where id in (${[1,2,3].map(n=>lit(booking(n))).join(',')})`)}
 async function pass(name,fn){await reset();await fn();results.push(name);console.log('PASS '+name)}
 await pass('Start date hides old pending days and notifications but preserves exact-date access',async()=>{
  const before=await rows();await ok(`update public.service_regularization_policy set starts_on='2032-11-08' where restaurant_id=${lit(rid(1))}`);
  const r=(await rpc('rm012_services_v1',{})).data;assert.equal(r.detection_since,'2032-11-08');assert.equal(r.automatic_closure,true);assert.deepEqual(r.notification_days,[]);assert.deepEqual(r.services.map(d=>d.date),['2032-11-08']);assert.equal(r.selected.date,'2032-11-08');
  const old=(await rpc('rm012_services_v1',{p_date:'2032-11-07'})).data;assert.equal(old.selected.pending,3);assert.equal(old.selected.items.length,3);assert.deepEqual(await rows(),before);
 });
 await pass('Automatic close archives finalized past service once, with system actor and correct real timestamp',async()=>{
  await ready();const before=await rows(),assignments=await json('select jsonb_agg(to_jsonb(a) order by reservation_id,table_id) from public.reservation_tables a');assert.equal((await job()).closed,1);
  const archive=await json('select to_jsonb(c) from public.service_closures c');assert.equal(archive.service_date,'2032-11-07');assert.equal(archive.close_mode,'automatic');assert.equal(archive.closed_by,null);assert.equal(archive.served_covers,6);assert.equal(archive.served_groups,3);assert.equal(Date.parse(archive.closed_at),Date.parse('2032-11-08T10:00Z'));
  const audit=await json('select to_jsonb(a) from public.service_regularization_audit a');assert.equal(audit.actor_kind,'system');assert.equal(audit.actor_id,null);assert.equal(audit.action,'close_service');assert.match(audit.actor_label,/automatique/);assert.equal(audit.service_date,'2032-11-07');assert.equal((await job()).closed,0);assert.equal(await ok('select count(*) from public.service_regularization_audit'),'1');assert.deepEqual(await rows(),before);assert.deepEqual(await json('select jsonb_agg(to_jsonb(a) order by reservation_id,table_id) from public.reservation_tables a'),assignments);
 });
 await pass('No retrospective automatic archive, including finalized pre-start services',async()=>{
  await ready();await ok(`update public.service_regularization_policy set starts_on='2032-11-08'`);assert.equal((await job()).closed,0);assert.equal(await ok('select count(*) from public.service_closures'),'0');assert.equal(await ok('select count(*) from public.service_regularization_audit'),'0');
 });
 await pass('Every unfinished business status blocks automatic closure without status inference',async()=>{
  for(const status of ['seated','reserved','confirmed','late','arrived']){await ready();await ok(`update public.reservations set status=${lit(status)} where id=${lit(booking(1))}`);const before=await rows();assert.equal((await job()).closed,0,status);assert.deepEqual(await rows(),before);assert.equal(await ok('select count(*) from public.service_closures'),'0')}
 });
 await pass('Scheduled end and longest booking protect an ongoing day after clients are finalized',async()=>{
  await ready();await clock('2032-11-07T19:00:00Z');assert.equal((await job()).closed,0);await clock('2032-11-07T20:31:00Z');assert.equal((await job()).closed,1);
 });
 await pass('Active hold blocks automatic close; expiry never changes a booking status',async()=>{
  await ready();await ok(`insert into public.table_holds(table_id,held_by,starts_at,ends_at,expires_at,restaurant_id) values('40000000-0000-4000-8000-000000000001',${lit(uid(1))},'2032-11-07T18:00Z','2032-11-07T19:00Z','2032-11-08T10:02Z',${lit(rid(1))})`);const before=await rows();assert.equal((await job()).closed,0);await clock('2032-11-08T10:03:00Z');assert.equal((await job()).closed,1);assert.deepEqual(await rows(),before);
 });
 await pass('Only trusted background execution can call the worker; user-facing automatic RPC remains refused',async()=>{
  for(const role of ['authenticated','anon','resto_service_writer','service_role']){const r=await sql(ctx(1,'select private.rm012_auto_close_job()',role));assert.notEqual(r.code,0,role);assert.match(r.stderr,/42501/)}
  const spoof=await sql(ctx(1,'select private.rm012_auto_close_job()','postgres'));assert.notEqual(spoof.code,0);assert.match(spoof.stderr,/42501/);const r=await rpc('close_service_v3',{p_date:'2032-11-07',p_mode:'automatic'});assert.equal(r.error.code,'RM012');
 });
 await pass('Rollout policy is venue-scoped, Restaurant-only and cannot be changed by application roles',async()=>{
  assert.equal(await ok(ctx(1,'select count(*) from public.service_regularization_policy')).then(s=>s.split('\n').at(-1)),'1');assert.equal(await ok(ctx(3,'select count(*) from public.service_regularization_policy')).then(s=>s.split('\n').at(-1)),'0');
  for(const role of ['authenticated','resto_service_writer']){const r=await sql(ctx(1,"update public.service_regularization_policy set automatic_closure=false",role));assert.notEqual(r.code,0);assert.match(r.stderr,/42501/)}
  await ok(`update public.service_regularization_policy set automatic_closure=false where restaurant_id=${lit(rid(1))}`);await ready();assert.equal((await job()).closed,0);
 });
 await pass('System traces cannot be forged by the writer, and remain immutable and visible in history',async()=>{
  const fake=await sql(ctx(1,`insert into public.service_regularization_audit(restaurant_id,operation_id,service_date,actor_id,actor_kind,actor_label,action,old_status,new_status) values(${lit(rid(1))},'${randomUUID()}','2032-11-07',null,'system','FAKE','close_service','open','closed')`,'resto_service_writer'));assert.notEqual(fake.code,0);await ready();await job();
  const read=(await rpc('rm012_services_v1',{p_date:'2032-11-07'})).data;assert.equal(read.selected.audit[0].actor_kind,'system');assert.equal(read.history[0].close_mode,'automatic');assert.equal(read.notification_days.some(d=>d.date==='2032-11-07'),false);
  for(const role of ['authenticated','resto_service_writer']){const r=await sql(ctx(1,'delete from public.service_regularization_audit',role));assert.notEqual(r.code,0)}
 });
 await pass('Manual and automatic concurrent closes share one archive and one audit',async()=>{
  await ready();let signal;const locked=new Promise(r=>signal=r);const first=sql("begin;select private.rm012_auto_close_job();\n\\echo RM012_AUTO_LOCKED\nselect pg_sleep(.3);commit;",s=>{if(s.includes('RM012_AUTO_LOCKED'))signal()});await Promise.race([locked,first.then(r=>{throw Error(r.stderr)})]);
  const second=rpc('rm012_close_v1',{p_date:'2032-11-07',p_operation:randomUUID()},2);const [a,b]=await Promise.all([first,second]);assert.equal(a.code,0,a.stderr);assert.equal(b.error,null,JSON.stringify(b.error));assert.equal(await ok('select count(*) from public.service_closures'),'1');assert.equal(await ok('select count(*) from public.service_regularization_audit'),'1');
 });
 await pass('Busy service lock skips background work instead of delaying live staff actions',async()=>{
  await ready();let signal;const locked=new Promise(r=>signal=r);const hold=sql(ctx(1,"select private.lock_restaurant_mutation_v1();\n\\echo RM012_STAFF_LOCKED\nselect pg_sleep(.6)"),s=>{if(s.includes('RM012_STAFF_LOCKED'))signal()});await Promise.race([locked,hold.then(r=>{throw Error(r.stderr)})]);const r=await job();assert.equal(r.closed,0);assert.equal(r.skipped,1);await hold;assert.equal((await job()).closed,1);
 });
 await pass('Paris midnight and DST keep the selected civil day and current-day bookings independent',async()=>{
  await ready();await clock('2032-11-07T23:01:00Z');assert.equal((await job()).closed,1);assert.equal(await ok(`select status from public.reservations where id=${lit(booking(4))}`),'reserved');
  await reset();await ready();await ok("update public.reservations set starts_at='2032-03-28T18:00Z',ends_at='2032-03-28T19:00Z' where (starts_at at time zone 'Europe/Paris')::date='2032-11-07'");await clock('2032-03-28T23:01:00Z');assert.equal((await job()).closed,1);assert.equal(await ok('select service_date from public.service_closures'),'2032-03-28');
 });
 await pass('Reapplying preserves policy, business rows and the single named cron job',async()=>{
  await ok(`update public.service_regularization_policy set starts_on='2032-11-08',automatic_closure=false where restaurant_id=${lit(rid(1))}`);const before=await rows();await ok(db.policyBody);await ok(db.policyBody);assert.deepEqual(await rows(),before);assert.equal(await ok(`select starts_on from public.service_regularization_policy where restaurant_id=${lit(rid(1))}`),'2032-11-08');assert.equal(await ok("select count(*) from cron.job where jobname='rm012-safe-automatic-close'"),'1');
 });
 await pass('New venue starts on its actual Paris creation date and empty days never auto-close',async()=>{
  await ok("insert into public.restaurants(id,name) values('10000000-0000-4000-8000-000000000033','Établissement fictif nouveau')");
  assert.equal(await ok("select starts_on=(clock_timestamp() at time zone 'Europe/Paris')::date from public.service_regularization_policy where restaurant_id='10000000-0000-4000-8000-000000000033'"),'t');
  assert.equal((await job()).closed,0);assert.equal(await ok('select count(*) from public.service_closures'),'0');await ok("delete from public.restaurant_hours where restaurant_id='10000000-0000-4000-8000-000000000033';delete from public.restaurant_service_changes where restaurant_id='10000000-0000-4000-8000-000000000033';delete from public.restaurants where id='10000000-0000-4000-8000-000000000033'");assert.equal(await ok("select count(*) from public.service_regularization_policy where restaurant_id='10000000-0000-4000-8000-000000000033'"),'0');
 });
 await pass('Real pg_cron executes without an app session, records success and does not duplicate a closure',async()=>{
  await ready();await ok("select cron.alter_job((select jobid from cron.job where jobname='rm012-safe-automatic-close'),schedule:='1 second');alter system set cron.launch_active_jobs='on';select pg_reload_conf();");
  let done=false;for(let i=0;i<40;i++){if(await ok('select count(*) from public.service_closures')==='1'){done=true;break}await new Promise(r=>setTimeout(r,250))}assert.ok(done,'Real cron worker closed the finalized service');
  let logged=false;for(let i=0;i<20;i++){if(await ok("select count(*) from cron.job_run_details where status='succeeded'")!=='0'){logged=true;break}await new Promise(r=>setTimeout(r,100))}assert.ok(logged);await new Promise(r=>setTimeout(r,1100));assert.equal(await ok('select count(*) from public.service_regularization_audit'),'1');await ok("select cron.alter_job((select jobid from cron.job where jobname='rm012-safe-automatic-close'),active:=false);");
 });
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:results.length,failed:0,pgCron:'1.6.4 pinned Debian package',network:'none',results},null,2));
}finally{await db?.stop()}})().catch(e=>{console.error(e);process.exitCode=1});

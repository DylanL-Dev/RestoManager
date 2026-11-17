'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {start,uid,rid,booking,lit}=require('./rm012-support.cjs');
const out=process.env.BROWSER_ARTIFACTS||path.resolve('test-results/rm012-postgres'),results=[];
(async()=>{let db;try{
 db=await start();const {ok,sql,ctx,json,reset,rpc,clock}=db;
 const row=n=>json('select to_jsonb(r) from public.reservations r where id='+lit(booking(n)));
 const read=(args={},user=1)=>rpc('rm012_services_v1',args,user);
 const params=async(n,action,extra={})=>({p_date:'2032-11-07',p_reservation:booking(n),p_version:(await row(n)).edit_version,p_action:action,p_operation:randomUUID(),...extra});
 async function pass(name,fn){await reset();await fn();results.push(name);console.log('PASS '+name)}
 async function success(name,args,user=1){const r=await rpc(name,args,user);assert.equal(r.error,null,JSON.stringify(r.error));return r.data}
 async function rejects(name,args,code,user=1){const r=await rpc(name,args,user);assert.equal(r.error?.code,code,JSON.stringify(r));return r}
 async function finalize(){for(const [n,action,reason] of [[1,'release_table',null],[2,'mark_absent',null],[3,'mark_served','Client servi, oubli de suivi']])await success('rm012_regularize_v1',await params(n,action,{p_reason:reason}))}
 await pass('Role/tenant authorization for every RM-012 endpoint',async()=>{
  const p=await params(1,'release_table');for(const user of [3,5,6]){await rejects('rm012_services_v1',{},'42501',user);await rejects('rm012_regularize_v1',p,'42501',user);await rejects('rm012_close_v1',{p_date:'2032-11-07',p_operation:randomUUID()},'42501',user)}
  await rejects('rm012_regularize_v1',await params(9,'release_table'),'P0002');assert.ok((await read({},4)).data.services.every(d=>d.total<=1));
  const r=await sql(ctx(1,'select public.rm012_services_v1()','anon'));assert.notEqual(r.code,0);assert.match(r.stderr,/42501/);
 });
 await pass('Detect seated / expected / arrived without changing any row',async()=>{
  const before=await json('select jsonb_agg(r order by id) from public.reservations r');const r=(await read()).data;
  assert.equal(r.selected.date,'2032-11-07');assert.equal(r.selected.occupied_tables,1);assert.equal(r.selected.awaited,1);assert.equal(r.selected.arrived,1);assert.equal(r.selected.pending,3);assert.equal(r.selected.can_close,false);
  assert.deepEqual(await json('select jsonb_agg(r order by id) from public.reservations r'),before);assert.ok(!JSON.stringify(r).includes('ALLERGIES'));
 });
 await pass('Release only selected old booking and preserve current-day booking/assignments',async()=>{
  const today=await row(4),assignments=await json('select jsonb_agg(r order by reservation_id) from public.reservation_tables r');const a=await success('rm012_regularize_v1',await params(1,'release_table'));
  assert.equal(a.old_status,'seated');assert.equal(a.new_status,'released');assert.equal(a.service_date,'2032-11-07');assert.equal(a.actor_id,uid(1));assert.match(a.actor_label,/A1/);assert.equal(Date.parse(a.performed_at),Date.parse('2032-11-08T10:00:00Z'));
  assert.deepEqual(await row(4),today);assert.deepEqual(await json('select jsonb_agg(r order by reservation_id) from public.reservation_tables r'),assignments);
 });
 await pass('Wrong date and stale version are refused atomically',async()=>{
  const p=await params(1,'release_table'),before=await row(1);await rejects('rm012_regularize_v1',{...p,p_date:'2032-11-06'},'22023');await rejects('rm012_regularize_v1',{...p,p_version:randomUUID()},'RM001');assert.deepEqual(await row(1),before);
 });
 await pass('No absence inferred; arrived correction requires a reason and separate confirmation',async()=>{
  await rejects('rm012_regularize_v1',await params(3,'mark_absent'),'22023');await rejects('rm012_regularize_v1',await params(3,'correct_arrival'),'22023');assert.equal((await row(3)).status,'arrived');
  await success('rm012_regularize_v1',await params(3,'correct_arrival',{p_reason:'Arrivée cochée sur la mauvaise fiche'}));assert.equal((await row(3)).status,'confirmed');
  await success('rm012_regularize_v1',await params(3,'mark_absent'));assert.equal((await row(3)).status,'no_show');assert.equal(await ok("select count(*) from public.service_regularization_audit where reservation_id="+lit(booking(3))),'2');
 });
 await pass('Client served without tracking can be regularized with a mandatory reason',async()=>{
  await rejects('rm012_regularize_v1',await params(2,'mark_served',{p_reason:'  '}),'22023');const a=await success('rm012_regularize_v1',await params(2,'mark_served',{p_reason:'Client servi pendant le service'}));assert.equal(a.new_status,'completed');assert.equal(a.old_status,'confirmed');assert.match(a.reason,/servi/);
 });
 await pass('Lost mutation response retries the same operation exactly once',async()=>{
  const p=await params(1,'release_table');const a=await success('rm012_regularize_v1',p),b=await success('rm012_regularize_v1',p);assert.deepEqual(a,b);assert.equal(await ok('select count(*) from public.service_regularization_audit'),'1');
  await rejects('rm012_regularize_v1',{...p,p_reservation:booking(2)},'22023');await rejects('rm012_regularize_v1',p,'22023',2);
 });
 await pass('Ongoing current day and future days are protected even through legacy close',async()=>{
  const current=await row(4);await rejects('rm012_regularize_v1',await params(4,'mark_absent',{p_date:'2032-11-08'}),'RM012');
  for(const p_date of ['2032-11-08','2032-11-09'])await rejects('rm012_close_v1',{p_date,p_operation:randomUUID()},'RM012');
  await rejects('close_service_v3',{p_date:'2032-11-08',p_mode:'manual'},'RM012');await rejects('close_service_v3',{p_date:'2032-11-07',p_mode:'automatic'},'RM012');assert.deepEqual(await row(4),current);
 });
 await pass('Pending reservations prevent administrative closure',async()=>{
  await rejects('rm012_close_v1',{p_date:'2032-11-07',p_operation:randomUUID()},'RM012');assert.equal(await ok('select count(*) from public.service_closures'),'0');
 });
 await pass('Unexpired draft hold blocks closure; expiry does not imply booking absence',async()=>{
  await finalize();await ok(`insert into public.table_holds(table_id,held_by,starts_at,ends_at,expires_at,restaurant_id) values('40000000-0000-4000-8000-000000000001',${lit(uid(1))},'2032-11-07T18:00Z','2032-11-07T19:00Z','2032-11-08T10:01Z',${lit(rid(1))});`);
  assert.equal((await read()).data.selected.active_holds,1);await rejects('rm012_close_v1',{p_date:'2032-11-07',p_operation:randomUUID()},'RM012');await clock('2032-11-08T10:02:00Z');assert.equal((await read()).data.selected.can_close,true);
 });
 await pass('Finalized service closes exact date, archives totals and actual closing timestamp',async()=>{
  const today=await row(4);await finalize();const c=await success('rm012_close_v1',{p_date:'2032-11-07',p_operation:randomUUID()});assert.equal(c.service_date,'2032-11-07');assert.equal(Date.parse(c.closed_at),Date.parse('2032-11-08T10:00Z'));assert.equal(c.served_groups,2);assert.equal(c.served_covers,4);assert.equal(c.no_show_groups,1);assert.deepEqual(await row(4),today);
  const r=(await read({p_date:'2032-11-07'})).data;assert.equal(r.selected.can_close,false);assert.equal(r.selected.closure.id,c.id);assert.ok(!r.services.some(d=>d.date==='2032-11-07'));assert.equal(r.history[0].id,c.id);
  await rejects('rm012_regularize_v1',await params(1,'release_table'),'RM012');
 });
 await pass('Closing retries from two managers produce one archive and one closing trace',async()=>{
  await finalize();const date={p_date:'2032-11-07'},a=await success('rm012_close_v1',{...date,p_operation:randomUUID()}),b=await success('rm012_close_v1',{...date,p_operation:randomUUID()},2);assert.deepEqual(a,b);assert.equal(await ok('select count(*) from public.service_closures'),'1');assert.equal(await ok("select count(*) from public.service_regularization_audit where action='close_service'"),'1');
 });
 await pass('Concurrent managers cannot regularize one stale reservation twice',async()=>{
  const a=await params(1,'release_table'),b={...a,p_operation:randomUUID()};
  const query=p=>'select public.rm012_regularize_v1('+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+')';let acquired;const locked=new Promise(r=>acquired=r);
  const first=sql(ctx(1,query(a)+`;\n\\echo RM012_LOCK_HELD\nselect pg_sleep(0.3)`),s=>{if(s.includes('RM012_LOCK_HELD'))acquired()});await Promise.race([locked,first.then(r=>{throw Error(r.stderr)})]);const second=sql(ctx(2,query(b)));const [one,two]=await Promise.all([first,second]);assert.equal(one.code,0,one.stderr);assert.notEqual(two.code,0);assert.match(two.stderr,/RM001/);assert.equal(await ok('select count(*) from public.service_regularization_audit'),'1');
 });
 await pass('Concurrent closing transactions are serialized and idempotent',async()=>{
  await finalize();let acquired;const locked=new Promise(r=>acquired=r);const first=sql(ctx(1,`select public.rm012_close_v1('2032-11-07','${randomUUID()}');\n\\echo RM012_CLOSE_HELD\nselect pg_sleep(0.3)`),s=>{if(s.includes('RM012_CLOSE_HELD'))acquired()});await Promise.race([locked,first.then(r=>{throw Error(r.stderr)})]);const second=sql(ctx(2,`select public.rm012_close_v1('2032-11-07','${randomUUID()}')`));const [a,b]=await Promise.all([first,second]);assert.equal(a.code,0,a.stderr);assert.equal(b.code,0,b.stderr);assert.equal(await ok('select count(*) from public.service_closures'),'1');assert.equal(await ok("select count(*) from public.service_regularization_audit where action='close_service'"),'1');
 });
 await pass('All old dates are retrievable through cursor pagination and exact selection',async()=>{
  for(const [n,day] of [[2,'2032-11-06'],[3,'2032-11-05']])await ok(`update public.reservations set starts_at='${day}T18:00Z',ends_at='${day}T19:00Z' where id=${lit(booking(n))}`);
  const first=(await read({p_limit:2})).data;assert.equal(first.has_more,true);const next=(await read({p_limit:2,p_before:first.next_before,p_date:'2032-11-05'})).data;assert.equal(next.selected.date,'2032-11-05');assert.ok(next.services.some(d=>d.date==='2032-11-05'));assert.equal(new Set([...first.services,...next.services].map(d=>d.date)).size,4);
 });
 await pass('Weekly hours and estimated booking end override fixed 23:30',async()=>{
  await clock('2032-11-07T20:00:00Z');assert.equal((await read({p_date:'2032-11-07'})).data.selected.ended,false);await clock('2032-11-07T20:31:00Z');assert.equal((await read({p_date:'2032-11-07'})).data.selected.ended,true);
  await ok("update public.reservations set ends_at='2032-11-07T22:10Z' where status='seated'");assert.equal((await read({p_date:'2032-11-07'})).data.selected.ended,false);await clock('2032-11-07T22:11:00Z');assert.equal((await read({p_date:'2032-11-07'})).data.selected.ended,true);
 });
 await pass('Paris midnight protects the new day while keeping the previous service selected',async()=>{
  await clock('2032-11-07T23:01:00Z');const r=(await read()).data;assert.equal(r.today,'2032-11-08');assert.equal(r.selected.date,'2032-11-07');assert.equal(r.services.find(d=>d.date==='2032-11-08').ended,false);
 });
 await pass('DST conversion uses local calendar edges, including an overnight period',async()=>{
  await ok("alter table public.restaurant_hours disable trigger validate_restaurant_weekly_schedule;update public.restaurant_hours set weekly_schedule=jsonb_set(jsonb_set(weekly_schedule,'{saturday,dinner,start}','\"19:00\"'),'{saturday,dinner,end}','\"04:00\"');alter table public.restaurant_hours enable trigger validate_restaurant_weekly_schedule;");
  const edges=await json(`select jsonb_build_object('spring',private.rm012_end(${lit(rid(1))},'2032-03-27'),'fall',private.rm012_end(${lit(rid(1))},'2032-10-30'))`);assert.equal(Date.parse(edges.spring),Date.parse('2032-03-28T02:00Z'));assert.equal(Date.parse(edges.fall),Date.parse('2032-10-31T03:00Z'));
 });
 await pass('Audit is immutable, venue-scoped, and keeps a late correction’s actual timestamp',async()=>{
  await clock('2032-11-15T11:25:00Z');await success('rm012_regularize_v1',await params(1,'release_table'));
  assert.equal((await json(ctx(1,'select to_jsonb(a) from public.service_regularization_audit a limit 1'))).service_date,'2032-11-07');assert.equal(await ok('select performed_at::date from public.service_regularization_audit'),'2032-11-15');
  for(const user of [3,4])assert.equal((await ok(ctx(user,'select count(*) from public.service_regularization_audit'))).split('\n').at(-1),'0');
  for(const query of ["update public.service_regularization_audit set new_status='cancelled'",'delete from public.service_regularization_audit']){const r=await sql(ctx(1,query));assert.notEqual(r.code,0);assert.match(r.stderr,/42501/)}
 });
 await pass('Legacy historical status changes are also audited without bypassing Reception rights',async()=>{
  await ok(ctx(3,`select public.change_reservation_status_v3(${lit(booking(2))},'confirmed','late')`));const a=await json('select to_jsonb(a) from public.service_regularization_audit a limit 1');assert.equal(a.actor_id,uid(3));assert.equal(a.action,'status_change');assert.equal(a.old_status,'confirmed');assert.equal(a.new_status,'late');
 });
 await pass('Missing hours fail closed; empty old date remains explicitly selectable',async()=>{
  const empty=(await read({p_date:'2032-11-01'})).data.selected;assert.equal(empty.total,0);assert.equal(empty.can_close,true);
  await ok(`delete from public.restaurant_hours where restaurant_id=${lit(rid(1))}`);await rejects('rm012_close_v1',{p_date:'2032-11-01',p_operation:randomUUID()},'RM012');await rejects('rm012_regularize_v1',await params(1,'release_table'),'RM012');
 });
 await pass('Security catalog: invoker public wrappers, fixed search_path, no anon execution, no writer bypass',async()=>{
  assert.equal(await ok("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'rm012_%' and p.prosecdef"),'0');
  assert.equal(await ok("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.proname like 'rm012_%' and (p.proconfig is null or not ('search_path=\"\"'=any(p.proconfig)))"),'0');
  assert.equal(await ok("select has_function_privilege('anon','public.rm012_services_v1(date,date,integer)','execute')"),'f');assert.equal(await ok("select rolsuper or rolbypassrls from pg_roles where rolname='resto_service_writer'"),'f');assert.equal(await ok("select has_schema_privilege('resto_service_writer','public','CREATE') or has_schema_privilege('resto_service_writer','private','CREATE')"),'f');
 });
 await pass('Migration reapplication preserves existing rows, settings, archives and schema privileges',async()=>{
  await finalize();await success('rm012_close_v1',{p_date:'2032-11-07',p_operation:randomUUID()});const before=await json("select jsonb_build_object('r',(select jsonb_agg(r order by id) from public.reservations r),'h',(select jsonb_agg(h order by id) from public.restaurant_hours h),'c',(select jsonb_agg(c order by id) from public.service_closures c),'a',(select jsonb_agg(a order by id) from public.service_regularization_audit a))");
  await ok(db.body);const after=await json("select jsonb_build_object('r',(select jsonb_agg(r order by id) from public.reservations r),'h',(select jsonb_agg(h order by id) from public.restaurant_hours h),'c',(select jsonb_agg(c order by id) from public.service_closures c),'a',(select jsonb_agg(a order by id) from public.service_regularization_audit a))");assert.deepEqual(after,before);
 });
 await pass('Notification snapshots retain ALL unresolved dates independently of list pagination',async()=>{
  await ok(`insert into public.reservations(guest_name,party_size,starts_at,ends_at,notes,restaurant_id)
   select 'Client fictif ancien',2,(date '2032-11-07'-n+time '19:00') at time zone 'Europe/Paris',(date '2032-11-07'-n+time '20:00') at time zone 'Europe/Paris','[RESTOMANAGER:EXTERIEUR]',${lit(rid(1))} from generate_series(1,35) n;`);
  const a=(await read({p_limit:1})).data,b=(await read({p_limit:1,p_before:'2032-10-15'})).data;assert.equal(a.services.length,1);assert.equal(a.notification_days.length,36);assert.deepEqual(a.notification_days.map(d=>d.date),b.notification_days.map(d=>d.date));
 });
 await pass('Closure archive has its own cursor even when no pending-day cursor exists',async()=>{
  await ok(`insert into public.service_closures(restaurant_id,service_date,closed_by,close_mode,served_covers,served_groups,walkin_covers,hotel_covers,no_show_groups,cancelled_groups)
   select ${lit(rid(1))},date '2032-11-07'-n,${lit(uid(1))},'manual',0,0,0,0,0,0 from generate_series(1,35) n;`);
  const a=(await read({p_limit:5})).data,b=(await read({p_limit:5,p_before:a.history_next_before})).data;assert.equal(a.history_has_more,true);assert.equal(a.history.length,5);assert.equal(b.history.length,5);assert.equal(new Set([...a.history,...b.history].map(d=>d.service_date)).size,10);assert.equal(a.notification_days.length,1);
 });
 await pass('An active hold alone makes an old day discoverable and blocks its closure',async()=>{
  await ok(`insert into public.table_holds(table_id,held_by,starts_at,ends_at,expires_at,restaurant_id) values('40000000-0000-4000-8000-000000000001',${lit(uid(1))},'2032-11-06T18:00Z','2032-11-06T19:00Z','2032-11-08T10:01Z',${lit(rid(1))});`);
  const result=(await read({p_date:'2032-11-06'})).data;assert.ok(result.services.some(d=>d.date==='2032-11-06'));assert.equal(result.selected.active_holds,1);await rejects('rm012_close_v1',{p_date:'2032-11-06',p_operation:randomUUID()},'RM012');
 });
 await pass('Closing serializes with a concurrent legacy booking insert into the same day',async()=>{
  await finalize();let acquired;const locked=new Promise(r=>acquired=r);const first=sql(ctx(1,`select public.rm012_close_v1('2032-11-07','${randomUUID()}');\n\\echo RM012_CLOSE_INSERT_HELD\nselect pg_sleep(0.3)`),s=>{if(s.includes('RM012_CLOSE_INSERT_HELD'))acquired()});await Promise.race([locked,first.then(r=>{throw Error(r.stderr)})]);
  const second=sql(ctx(3,"select public.reception_booking_v3(null,'Client fictif tardif',null,2,'2032-11-07T18:00Z','2032-11-07T19:00Z','[RESTOMANAGER:EXTERIEUR]')"));const [a,b]=await Promise.all([first,second]);assert.equal(a.code,0,a.stderr);assert.notEqual(b.code,0);assert.match(b.stderr,/23514|clôturé/);assert.equal(await ok('select count(*) from public.reservations'),'5');
 });
 await pass('Even the Reception internal writer cannot add an active hold to a closed day',async()=>{
  await finalize();await success('rm012_close_v1',{p_date:'2032-11-07',p_operation:randomUUID()});const r=await sql(ctx(3,`insert into public.table_holds(table_id,held_by,starts_at,ends_at,expires_at,restaurant_id) values('40000000-0000-4000-8000-000000000001',${lit(uid(3))},'2032-11-07T18:00Z','2032-11-07T19:00Z','2032-11-08T10:01Z',${lit(rid(1))})`,'resto_service_writer'));assert.notEqual(r.code,0);assert.match(r.stderr,/23514/);
 });
 await pass('Hosted-style non-superuser rollback and apply/reapply preserve schema privileges',async()=>{
  // Release the first VFS filesystem before making a second disposable database.
  await db.stop();
  const fresh=await start({applyMigration:false});try{
   await fresh.ok('create role rm012_hosted_admin login nosuperuser createrole createdb bypassrls;grant postgres to rm012_hosted_admin;');
   const injected=fresh.body.replace(/commit;\s*$/i,"do $$begin raise exception 'RM012_TEST_ROLLBACK';end$$;commit;");
   const r=await fresh.sql('set role rm012_hosted_admin;'+injected);assert.notEqual(r.code,0);assert.match(r.stderr,/RM012_TEST_ROLLBACK/);assert.equal(await fresh.ok("select to_regclass('public.service_regularization_audit') is null"),'t');assert.equal(await fresh.ok("select has_schema_privilege('resto_service_writer','public','CREATE')"),'f');
   await fresh.ok('set role rm012_hosted_admin;'+fresh.body+'reset role;');await fresh.ok('set role rm012_hosted_admin;'+fresh.body+'reset role;');assert.equal(await fresh.ok("select has_schema_privilege('resto_service_writer','public','CREATE') or has_schema_privilege('resto_service_writer','private','CREATE')"),'f');
  }finally{await fresh.stop()}
 });
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:results.length,failed:0,image:'PostgreSQL 17 pinned digest',network:'none',remoteDatabaseWrites:0,results},null,2));
}finally{await db?.stop()}})().catch(error=>{console.error(error);process.exitCode=1});

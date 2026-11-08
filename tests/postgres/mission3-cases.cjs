'use strict';
// Called only by the disposable, network-disabled PostgreSQL runner (--mission3).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
module.exports=async({sql,ok,record,edit,ctx,fails,test,concurrent,lit,user,res,table,docker,container})=>{
 const room='30000000-0000-4000-8000-000000000001';
 const key=n=>'70000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const arr=ids=>'array['+ids.map(lit).join(',')+']::uuid[]';
 const last=result=>result.trim().split('\n').at(-1);
 const json=async(who,q)=>JSON.parse(last(await ok(ctx(who,q))));
 const draft=(k,action,args={})=>'select public.booking_draft_v3('+[
  'p_key=>'+lit(k),'p_action=>'+lit(action),...Object.entries(args).map(([n,v])=>n+'=>'+(n==='p_tables'?arr(v):lit(v)))
 ].join(',')+')';
 const status=(who,k)=>json(who,'select public.booking_draft_status_v1('+lit(k)+')');
 const fusion=ids=>'select public.change_fusion_link_v3(null,'+arr(ids)+')';
 const migration=fs.readFileSync(path.join(__dirname,'../../supabase/scripts/mission3_validation_integration.sql'),'utf8');
 async function hold(who,k,n=5){const r=await record(1);return json(who,draft(k,'hold',{
  p_start:r.starts_at,p_end:r.ends_at,p_guests:2,...(who===3?{}:{p_tables:[table(n)]})}));}

 await test('RCP-01: Reception keeps assigned table for unchanged covers, then right-sizes 2 to 10 to 2',async()=>{
  await ok('update public.restaurant_tables set seats=10 where id='+lit(table(1)));
  await ok('update public.restaurant_tables set seats=2 where id in ('+[table(5),table(6)].map(lit).join(',')+')');
  const initial=await record(1);
  assert.equal(initial.party_size,2);
  const unchanged=await json(3,edit(initial,{p_guest_name:'Client fictif corrigé'},true));
  assert.deepEqual(unchanged.tables,[table(1)],'Unrelated edits must retain the original table');
  const renamed=await record(1);
  const up=await json(3,edit(renamed,{p_party_size:10},true));
  assert.deepEqual(up.tables,[table(1)],'Ten guests use the existing ten-seat table');
  const large=await record(1);
  const down=await json(3,edit(large,{p_party_size:2},true));
  assert.deepEqual(down.tables,[table(5)],'Two guests should move to a free two-seat table');
  const shrunk=await record(1);
  assert.equal(shrunk.party_size,2);assert.equal(shrunk.hotel_room,initial.hotel_room);
  assert.equal(shrunk.notes,initial.notes);
  assert.equal(await ok('select table_id from public.reservation_tables where reservation_id='+lit(initial.id)),table(5));
  const noteOnly=await json(3,edit(shrunk,{p_notes:'Note fictive conservée après réattribution'},true));
  assert.deepEqual(noteOnly.tables,[table(5)],'A notes-only edit must not move a table');
 });

 await test('RCP-01: Reception keeps a large table if no smaller compatible table is free',async()=>{
  await ok('update public.restaurant_tables set seats=10 where id='+lit(table(1)));
  await ok('update public.restaurant_tables set seats=12 where id in ('+[5,6,7,8].map(n=>lit(table(n))).join(',')+')');
  const first=await record(1);
  const up=await json(3,edit(first,{p_party_size:10},true));
  assert.deepEqual(up.tables,[table(1)]);
  const second=await record(1);
  const down=await json(3,edit(second,{p_party_size:2},true));
  assert.deepEqual(down.tables,[table(1)],'Do not reject a valid booking when there is no better choice');
 });

 await test('RCP-01: an active hold removes the best small table from Reception recommendations',async()=>{
  await ok('update public.restaurant_tables set seats=10 where id='+lit(table(1)));
  await ok('update public.restaurant_tables set seats=2 where id in ('+[table(5),table(6)].map(lit).join(',')+')');
  await hold(1,key(98),5);
  const first=await record(1);
  await json(3,edit(first,{p_party_size:10},true));
  const second=await record(1);
  const down=await json(3,edit(second,{p_party_size:2},true));
  assert.deepEqual(down.tables,[table(6)],'Do not steal a held two-seat table');
 });

 await test('Mission3: capabilities and revision fence are tenant scoped, include server time',async()=>{
  const a=await json(1,'select public.service_sync_state_v1()'),b=await json(4,'select public.service_sync_state_v1()');
  assert.deepEqual(a.capabilities,{reservation_edits:4,booking_recovery:1,snapshot:1});
  assert.equal(typeof a.revision,'string');assert.ok(Number.isFinite(Date.parse(a.server_time)));
  const r=await record(1);await ok(ctx(1,edit(r,{p_guest_name:'Client fictif corrigé'})));
  assert.notEqual((await json(1,'select public.service_sync_state_v1()')).revision,a.revision);
  assert.equal((await json(4,'select public.service_sync_state_v1()')).revision,b.revision);
  await fails(1,'select public.service_sync_state_v1()','42501','anon');
 });

 await test('Mission3: room-only edit preserves long historical notes and allergies exactly',async()=>{
  const raw='N'.repeat(1001)+'\nALLERGIES À VÉRIFIER : '+'A'.repeat(501)+'\n[RESTOMANAGER:HOTEL]';
  await ok('update public.reservations set notes='+lit(raw)+' where id='+lit(res(1)));
  const r=await record(1);await ok(ctx(1,edit(r,{p_hotel_room:'291'})));
  assert.equal((await record(1)).notes,raw);
 });

 await test('Mission3: unchanged roomless hotel history stays editable; removing an existing hotel room is explicit error',async()=>{
  await ok('update public.reservations set hotel_room=null where id='+lit(res(1)));
  const r=await record(1);await ok(ctx(1,edit(r,{p_guest_name:'Historique fictif corrigé'})));
  assert.equal((await record(1)).hotel_room,null);
  const existing=await record(2);await fails(1,edit(existing,{p_hotel_room:null}),'ROOM_REQUIRED');
  assert.equal((await record(2)).hotel_room,'102');
 });

 await test('Mission3: new hotel requires room; exterior numeric booking remains roomless',async()=>{
  await hold(1,key(1));
  await fails(1,draft(key(1),'confirm',{p_name:'Client fictif',p_room:null,p_notes:'[RESTOMANAGER:HOTEL]'}),'ROOM_REQUIRED');
  assert.equal((await status(1,key(1))).state,'pending');
  await fails(1,draft(key(1),'confirm',{p_name:'755',p_room:'755',p_notes:'[RESTOMANAGER:EXTERIEUR]'}),'INVALID_INPUT');
  const saved=await json(1,draft(key(1),'confirm',{p_name:'755',p_room:null,p_notes:'[RESTOMANAGER:EXTERIEUR]'}));
  const r=JSON.parse(await ok('select row_to_json(r) from public.reservations r where id='+lit(saved.booking)));
  assert.equal(r.hotel_room,null);assert.match(r.notes,/EXTERIEUR/);
 });

 await test('Mission3: lost confirm response retry, expired committed key and release cannot duplicate a booking',async()=>{
  await hold(1,key(2));
  const call=draft(key(2),'confirm',{p_name:'Client fictif reprise',p_room:'490',p_notes:'[RESTOMANAGER:HOTEL]'});
  const first=await json(1,call);await ok('update private.booking_drafts_v3 set expires=clock_timestamp()-interval \'2 days\' where key='+lit(key(2)));
  const state=await status(1,key(2));assert.equal(state.state,'committed');assert.equal(state.reservation_id,first.booking);
  assert.ok(!JSON.stringify(state).includes('lock_token'));
  await ok(ctx(1,draft(key(2),'release')));assert.equal((await json(1,call)).booking,first.booking);
  assert.equal(await ok("select count(*) from public.reservations where guest_name='Client fictif reprise'"),'1');
  assert.equal((await status(2,key(2))).state,'missing');assert.equal((await status(4,key(2))).state,'missing');
 });

 await test('Mission3: status serializes behind confirmation and sees committed result',async()=>{
  await hold(1,key(3));let acquired;
  const marker=new Promise(resolve=>{acquired=resolve});
  const first=sql(ctx(1,draft(key(3),'confirm',{p_name:'Client fictif simultané',p_room:'491',p_notes:'[RESTOMANAGER:HOTEL]'})+
   ';\n\\echo MISSION3_COMMITTED_PENDING_TX\nselect pg_sleep(0.4)'),data=>{if(data.includes('MISSION3_COMMITTED_PENDING_TX'))acquired()});
  await Promise.race([marker,first.then(r=>{throw Error(r.stderr||'writer did not start')})]);
  const recovered=status(1,key(3));assert.equal((await first).code,0);assert.equal((await recovered).state,'committed');
 });

 await test('Mission3: pending status followed by late confirmation makes release return committed',async()=>{
  await hold(1,key(30));assert.equal((await status(1,key(30))).state,'pending');
  let acquired;const marker=new Promise(resolve=>{acquired=resolve});
  const call=draft(key(30),'confirm',{p_name:'Client fictif confirmation tardive',p_room:'495',p_notes:'[RESTOMANAGER:HOTEL]'});
  const first=sql(ctx(1,call+';\n\\echo MISSION3_LATE_CONFIRM\nselect pg_sleep(0.4)'),data=>{
   if(data.includes('MISSION3_LATE_CONFIRM'))acquired();
  });
  await Promise.race([marker,first.then(r=>{throw Error(r.stderr||'writer did not start')})]);
  const releasing=json(1,draft(key(30),'release'));assert.equal((await first).code,0);
  const result=await releasing;assert.equal(result.state,'committed');
  assert.equal(result.reservation_id,(await status(1,key(30))).reservation_id);
  assert.equal((await json(1,call)).booking,result.reservation_id);
  assert.equal(await ok("select count(*) from public.reservations where guest_name='Client fictif confirmation tardive'"),'1');
 });

 await test('Mission3: stale holds report expired and another account can reserve the released interval',async()=>{
  await hold(1,key(4));
  await ok('update private.booking_drafts_v3 set expires=clock_timestamp()-interval \'1 second\' where key='+lit(key(4))+';'+
   'update public.table_holds set expires_at=clock_timestamp()-interval \'1 second\' where table_id='+lit(table(5)));
  assert.equal((await status(1,key(4))).state,'expired');
  await fails(1,draft(key(4),'confirm',{p_name:'Client fictif expiré',p_room:'492',p_notes:'[RESTOMANAGER:HOTEL]'}),'HOLD_EXPIRED');
  await hold(2,key(5));assert.equal((await status(2,key(5))).state,'pending');
 });

 await test('Mission3: expiry and renewal use wall clock after a transaction has already started',async()=>{
  await hold(1,key(50));const r=await record(1);
  // Set up the brief expiry as the isolated administrator, then switch to the
  // actual second staff role in the SAME transaction before waiting 300 ms.
  const query='begin;update public.table_holds set expires_at=clock_timestamp()+interval \'0.15 seconds\' where table_id='+lit(table(5))+';'+
   'set local role authenticated;select set_config(\'request.jwt.claim.sub\','+lit(user(2))+',true);select pg_sleep(0.3);'+
   draft(key(51),'hold',{p_start:r.starts_at,p_end:r.ends_at,p_guests:2,p_tables:[table(5)]})+';'+
   'select bool_and(expires_at>clock_timestamp()+interval \'179.8 seconds\') from public.table_holds where held_by='+lit(user(2))+';commit;';
  assert.equal(last(await ok(query)),'t');assert.equal((await status(2,key(51))).state,'pending');
 });

 await test('Mission3: holding and confirming one operation twice concurrently creates only one reservation',async()=>{
  await hold(1,key(6));await hold(1,key(6));
  const call=draft(key(6),'confirm',{p_name:'Client fictif double clic',p_room:'493',p_notes:'[RESTOMANAGER:HOTEL]'});
  const results=await Promise.all([json(1,call),json(1,call)]);assert.equal(results[0].booking,results[1].booking);
  assert.equal(await ok("select count(*) from public.reservations where guest_name='Client fictif double clic'"),'1');
 });

 await test('Mission3: direct table and fusion writes, column writes and TRUNCATE are denied',async()=>{
  await fails(1,'update public.restaurant_tables set seats=1 where id='+lit(table(1)),'42501');
  await fails(1,'insert into public.table_fusion_links(table_a,table_b) values('+lit(table(5))+','+lit(table(6))+')','42501');
  for(const role of ['anon','authenticated'])for(const n of ['staff_profiles','table_fusion_links','fb_reservation_alerts']){
   assert.equal(await ok("select has_table_privilege("+lit(role)+",'public."+n+"','TRUNCATE')"),'f');
  }
  assert.equal(await ok("select has_column_privilege('authenticated','public.restaurant_tables','seats','UPDATE')"),'f');
  await ok(ctx(1,fusion([table(5),table(6)])));
  await fails(3,fusion([table(6),table(7)]),'42501');
 });

 await test('Mission3: table configuration rejects invalid/unsafe and duplicate numeric labels',async()=>{
  for(const label of ['Salon','Table 9007199254740992','Table 999999999999999999999999999999']){
   await fails(1,'select public.update_restaurant_table_v3('+lit(table(5))+','+lit(label)+',6,'+lit(room)+')','22023');
   await fails(1,'select public.create_restaurant_table_v3('+lit(label)+',6,'+lit(room)+')','22023');
  }
  // Legacy "1" and new "Table 1" are the same visible number.
  await fails(1,"select public.create_restaurant_table_v3('Table 1',6,"+lit(room)+')','23505');
  assert.equal(await ok('select label from public.restaurant_tables where id='+lit(table(5))),'5');
 });

 await test('Mission3: renumbering invalidates an open editor before another UUID reuses its table number',async()=>{
  const before=await record(2);
  await ok(ctx(1,'select public.update_restaurant_table_v3('+lit(table(2))+",'Table 20',6,"+lit(room)+')'));
  const replacement=last(await ok(ctx(1,"select public.create_restaurant_table_v3('Table 2',6,"+lit(room)+')')));
  assert.notEqual((await record(2)).edit_version,before.edit_version);
  await fails(1,edit(before,{table:replacement,p_guest_name:'Do not redirect'}),'RM001');
  assert.equal(await ok('select table_id from public.reservation_tables where reservation_id='+lit(before.id)),table(2));
  assert.equal((await record(2)).notes,before.notes);assert.equal((await record(2)).guest_name,before.guest_name);
 });

 await test('Mission3: inactive room is rejected by edits, smart placement and temporary holds',async()=>{
  await ok("insert into public.restaurant_rooms(id,name,restaurant_id,active) values('30000000-0000-4000-8000-000000000003','Salle fictive inactive','10000000-0000-4000-8000-000000000001',false);"+
   'update public.restaurant_tables set room_id=\'30000000-0000-4000-8000-000000000003\' where id='+lit(table(5)));
  const r=await record(1);await fails(1,edit(r,{table:table(5)}),'22023');
  await fails(1,'select public.acquire_table_hold_v2('+lit(table(5))+','+lit(r.starts_at)+','+lit(r.ends_at)+','+lit(key(40))+')','22023');
  const changes=[{id:r.id,from_table:table(1),to_table:table(5),expected_status:'reserved'}];
  await fails(1,'select public.apply_smart_placement_v3('+lit(r.id)+','+lit(JSON.stringify(changes))+'::jsonb)','22023');
  assert.deepEqual(await record(1),r);
 });

 await test('Mission3: hotel walk-in optional name/room and exterior numeric identity keep their existing behavior',async()=>{
  await ok(ctx(1,"update public.restaurant_hours set lunch_enabled=true,dinner_enabled=false,lunch_start='00:00',lunch_end='23:59' where id=1"));
  const hotel=last(await ok(ctx(1,'select public.install_walkin_group_v3('+arr([table(5)])+",2,'Client fictif de passage','hotel')")));
  const exterior=last(await ok(ctx(1,'select public.install_walkin_v3('+lit(table(6))+",2,'755','exterieur')")));
  for(const [id,type] of [[hotel,'hotel'],[exterior,'exterieur']]){
   const row=JSON.parse(await ok('select row_to_json(r) from public.reservations r where id='+lit(id)));
   assert.equal(row.hotel_room,null);assert.equal(row.walkin_type,type);assert.equal(row.status,'seated');
  }
  await fails(3,'select public.install_walkin_group_v3('+arr([table(7)])+",2,'Client fictif','exterieur')",'42501');
 });


 await test('Mission3: booking versus table deactivation serializes and cannot leave inactive assignment',async()=>{
  const r=await record(1);await concurrent(1,edit(r,{table:table(5)}),2,
   'select public.set_restaurant_table_active_v3('+lit(table(5))+',false)','22023|TABLE_IN_USE');
  assert.equal(await ok('select active from public.restaurant_tables where id='+lit(table(5))),'t');
  assert.equal(await ok('select table_id from public.reservation_tables where reservation_id='+lit(res(1))),table(5));
 });

 await test('Mission3: deactivation before edit is rechecked, capacity decrease cannot invalidate a reservation',async()=>{
  await ok(ctx(2,'select public.set_restaurant_table_active_v3('+lit(table(5))+',false)'));
  const r=await record(1);await fails(1,edit(r,{table:table(5)}),'22023');
  await fails(1,'select public.update_restaurant_table_v3('+lit(table(1))+",'Table 1',1,"+lit(room)+')','TABLE_IN_USE');
  assert.equal(await ok('select seats from public.restaurant_tables where id='+lit(table(1))),'6');
 });

 for(const size of [2,3])await test('Mission3: '+size+'-table fusion stays atomic and cannot be removed or moved while assigned',async()=>{
  await ok(ctx(1,fusion([table(5),table(6)])));if(size===3)await ok(ctx(1,fusion([table(6),table(7)])));
  const ids=[5,6,7].slice(0,size).map(table),r=await record(1),k=key(10+size),guests=size===2?8:14;
  await json(1,draft(k,'hold',{p_start:r.starts_at,p_end:r.ends_at,p_guests:guests,p_tables:ids}));
  const saved=await json(1,draft(k,'confirm',{p_name:'Client fictif fusion',p_room:'49'+size,p_notes:'[RESTOMANAGER:HOTEL]'}));
  assert.equal(await ok('select count(*) from public.reservation_tables where reservation_id='+lit(saved.booking)),String(size));
  await fails(1,'select public.change_fusion_link_v3('+arr([table(5),table(6)])+',null)','FUSION_IN_USE');
  await ok('insert into public.restaurant_rooms(id,name,restaurant_id) values(\'30000000-0000-4000-8000-000000000003\',\'Autre salle fictive\',\'10000000-0000-4000-8000-000000000001\')');
  await fails(1,'select public.update_restaurant_table_v3('+lit(table(5))+",'Table 5',6,'30000000-0000-4000-8000-000000000003')",'FUSION_IN_USE');
  await ok(ctx(1,'select public.cancel_reservation_v3('+lit(saved.booking)+')'));
  await ok(ctx(1,'select public.change_fusion_link_v3('+arr([table(5),table(6)])+',null)'));
 });

 await test('Mission3: rooms and service hours remain writable only to Restaurant, tenant isolated',async()=>{
  await ok(ctx(1,"update public.restaurant_hours set lunch_start='03:00' where id=1"));
  assert.equal(last(await ok(ctx(1,"select lunch_start from public.restaurant_hours where id=1"))),'03:00:00');
  // Reception UPDATE is denied by RLS with zero visible target rows, as designed.
  await ok(ctx(3,"update public.restaurant_hours set lunch_start='04:00' where id=1"));
  assert.equal(last(await ok(ctx(1,"select lunch_start from public.restaurant_hours where id=1"))),'03:00:00');
  await ok(ctx(1,"update public.restaurant_rooms set name='Salle fictive renommée' where id="+lit(room)));
  await ok(ctx(3,"update public.restaurant_rooms set name='Interdit' where id="+lit(room)));
  assert.equal(last(await ok(ctx(1,'select name from public.restaurant_rooms where id='+lit(room)))),'Salle fictive renommée');
  await fails(1,'update public.restaurant_rooms set active=false where id='+lit(room),'ROOM_IN_USE');
  for(const n of ['restaurant_rooms','restaurant_tables','reservation_tables','table_fusion_links','restaurant_hours','staff_profiles']){
   assert.equal(last(await ok(ctx(1,'select count(*) from public.'+n+" where restaurant_id='10000000-0000-4000-8000-000000000002'"))),'0');
  }
  // Holds intentionally expose only selected columns, without restaurant_id/token.
  assert.equal(last(await ok(ctx(1,'select count(*) from public.table_holds where table_id='+lit(table(9))))),'0');
 });

 await test('Mission3: separate restaurants do not share a room or mutation mutex',async()=>{
  const a=await record(1),b=await record(9);let acquired;
  const marker=new Promise(resolve=>{acquired=resolve});
  const first=sql(ctx(1,edit(a,{p_guest_name:'Fictif A'})+';\n\\echo MISSION3_TENANT_LOCK\nselect pg_sleep(0.8)'),data=>{if(data.includes('MISSION3_TENANT_LOCK'))acquired()});
  await Promise.race([marker,first.then(r=>{throw Error(r.stderr||'writer did not start')})]);
  const second=await sql(ctx(4,"set local lock_timeout='250ms';"+edit(b,{p_guest_name:'Fictif B'})));
  assert.equal(second.code,0,second.stderr);assert.equal((await first).code,0);
 });

 await test('Mission3: close service and stale edit serialize without day/row deadlock',async()=>{
  const day=await ok("select ((current_timestamp at time zone 'Europe/Paris')::date-1)::text");
  await ok('update public.reservations set starts_at=starts_at-interval \'2 days\',ends_at=ends_at-interval \'2 days\' where id='+lit(res(1)));
  const r=await record(1);
  const closing='select public.change_reservation_status_v3('+lit(r.id)+",'reserved','no_show');select public.close_service_v3("+lit(day)+",'manual')";
  await concurrent(1,closing,2,"set local lock_timeout='2s';"+edit(r,{p_guest_name:'Obsolète'}),'RM001');
  assert.equal(await ok('select count(*) from public.service_closures where service_date='+lit(day)),'1');
 });

 await test('Mission3: injected assignment failure rolls back details, versions, assignments and notifications',async()=>{
  const before=await record(1),alerts=await ok('select count(*) from public.reservation_change_alerts'),rev=await json(1,'select public.service_sync_state_v1()');
  await ok('create function private.mission3_test_failure() returns trigger language plpgsql as $$begin raise exception \'Injected isolated failure\';end$$;'+
   'create trigger mission3_test_failure before insert on public.reservation_tables for each row execute function private.mission3_test_failure()');
  try{await fails(3,edit(before,{p_hotel_room:'590',p_notes:'Do not persist'},true),'Injected isolated failure');}
  finally{await ok('drop trigger mission3_test_failure on public.reservation_tables;drop function private.mission3_test_failure()');}
  assert.deepEqual(await record(1),before);assert.equal(await ok('select table_id from public.reservation_tables where reservation_id='+lit(before.id)),table(1));
  assert.equal(await ok('select count(*) from public.reservation_change_alerts'),alerts);
  assert.equal((await json(1,'select public.service_sync_state_v1()')).revision,rev.revision);
 });

 await test('Mission3: migration preflight rejects changed tenant policy and rolls back that isolated alteration',async()=>{
  const result=await sql('begin;drop policy same_restaurant on public.reservations;'+migration);
  assert.notEqual(result.code,0);assert.match(result.stderr,/tenant policy definition drift/);
  assert.equal(await ok("select count(*) from pg_policies where schemaname='public' and tablename='reservations' and policyname='same_restaurant'"),'1');
  const own=await record(1);await fails(4,edit(own),'P0002');
 });

 await test('Mission3: injected failure at end of migration rolls back preceding DDL atomically',async()=>{
  const broken=migration.replace('begin;','begin;create table private.mission3_rollback_probe(id integer);')
   .replace("notify pgrst,'reload schema';","do $$begin raise exception 'Injected migration failure';end$$;");
  const result=await sql(broken);assert.notEqual(result.code,0);assert.match(result.stderr,/Injected migration failure/);
  assert.equal(await ok("select to_regclass('private.mission3_rollback_probe') is null"),'t');
  assert.deepEqual((await json(1,'select public.service_sync_state_v1()')).capabilities,
   {reservation_edits:4,booking_recovery:1,snapshot:1});
 });

 await test('Mission3: fictional database backup restores data, RPCs, RLS and role grants in an isolated database',async()=>{
  for(const args of [
   ['exec',container,'pg_dump','-U','postgres','-d','mission2','--format=custom','--file=/tmp/mission3-fictional.dump'],
   ['exec',container,'createdb','-U','postgres','mission3_restore'],
   ['exec',container,'pg_restore','-U','postgres','-d','mission3_restore','--clean','--if-exists','--exit-on-error','/tmp/mission3-fictional.dump']
  ]){const result=await docker(args);assert.equal(result.code,0,result.stderr);}
  const restored=await docker(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','mission3_restore'],
   ctx(1,"select jsonb_build_object('own',(select count(*) from public.reservations),'foreign',(select count(*) from public.reservations where restaurant_id='10000000-0000-4000-8000-000000000002'),'capabilities',public.service_sync_state_v1()->'capabilities','direct_write',has_table_privilege('authenticated','public.restaurant_tables','UPDATE'))"));
  assert.equal(restored.code,0,restored.stderr);const state=JSON.parse(last(restored.stdout));
  assert.equal(state.own,4);assert.equal(state.foreign,0);assert.equal(state.direct_write,false);
  assert.deepEqual(state.capabilities,{reservation_edits:4,booking_recovery:1,snapshot:1});
 });
};

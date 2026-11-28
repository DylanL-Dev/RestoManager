'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {booking,rid,uid,lit}=require('./rm012-support.cjs');
const table=n=>'40000000-0000-4000-8000-'+String(n).padStart(12,'0');

module.exports=async function expressService(db,initialSync){
 const directory=path.resolve(__dirname,'../../supabase/proposals/rm-ops-engine');
 const draft=fs.readFileSync(path.join(directory,'express-service-v1.PROPOSAL.sql'),'utf8');
 assert.match((await db.sql(draft)).stderr,/propositions placement v4 et libération/);
 const migrations=path.resolve(__dirname,'../../supabase/migrations');
 for(const name of ['20261113153000_rm005_walkin_weekly_server_dev.sql','20261113164500_rm005_weekly_helper_writer_grant_dev.sql'])
  await db.ok(fs.readFileSync(path.join(migrations,name),'utf8'));
 const {buildExpressReleaseSql,buildExpressRollbackSql}=require('../../scripts/prepare-rm-release-03b.cjs');
 const definition=signature=>db.ok(`select pg_get_functiondef(${lit(signature)}::regprocedure)`);
 const legacySignature='public.apply_smart_placement_v3(uuid,jsonb)';
 const syncSignature='public.service_sync_state_v1()';
 const initialLegacy=await definition(legacySignature);
 const catalog=fs.readFileSync(path.resolve(directory,'../../release-prep/rm-release-03b2_dev_readonly.sql'),'utf8');
 await db.ok(catalog);
 await db.ok("alter default privileges for role rm_quick_hosted_admin in schema public grant delete, truncate, trigger, maintain on tables to service_role");
 const release=buildExpressReleaseSql();
 const rollback=release.replace(/commit;\s*$/i,"do $begin raise exception 'EXPRESS_RELEASE_ROLLBACK';end$;commit;");
 assert.match((await db.sql('set role rm_quick_hosted_admin;'+rollback)).stderr,/EXPRESS_RELEASE_ROLLBACK/);
 assert.equal(await db.ok("select to_regprocedure('public.express_seat_v1(text,uuid,text,uuid,jsonb)') is null"),'t');
 assert.equal(await definition(legacySignature),initialLegacy);
 for(let attempt=0;attempt<2;attempt++)await db.ok('set role rm_quick_hosted_admin;'+release+'reset role;');
 assert.equal(await db.ok("select has_schema_privilege('resto_service_writer','public','CREATE') or has_schema_privilege('resto_service_writer','private','CREATE')"),'f');
 assert.equal(await db.ok("select has_table_privilege('service_role','public.placement_events','DELETE,TRUNCATE,TRIGGER,MAINTAIN')"),'f');
 await db.reset();
 const revision=async(user=1)=>(await db.snapshot(user)).revision;
 const capabilities=(await db.snapshot(1)).capabilities;
 assert.deepEqual([capabilities.quick_release,capabilities.express_service],[1,1]);
 const moves=[{id:booking(1),from_table:table(1),to_table:table(2),expected_status:'reserved'},
  {id:booking(2),from_table:table(2),to_table:table(1),expected_status:'confirmed'}];
 const seat=(rev,changes=[],n=1,target=1)=>`select public.express_seat_v1(${lit(rev)},${lit(booking(n))},'reserved',${lit(table(target))},${lit(JSON.stringify(changes))}::jsonb)`;
 const walk=(rev,n,type='exterieur',room=null)=>`select public.express_walkin_v1(${lit(rev)},${lit(table(n))},2,${lit(type)},${lit(room)})`;
 const reject=async(user,statement,code,role='authenticated')=>{
  const result=await db.sql(db.ctx(user,statement,role));assert.notEqual(result.code,0);assert.match(result.stderr,new RegExp(code));
 };
 const hold=async(n)=>db.ok(`insert into public.table_holds(table_id,held_by,starts_at,ends_at,expires_at,restaurant_id)
  select ${lit(table(n))},${lit(uid(2))},starts_at,ends_at,clock_timestamp()+interval '3 minutes',${lit(rid(1))}
  from public.reservations where id=${lit(booking(1))};`);
 const record=async(n,user=1)=>{
  const snapshot=await db.snapshot(user);
  return [snapshot.reservations.find(row=>row.id===booking(n))?.status,snapshot.assignments.find(row=>row.reservation_id===booking(n))?.table_id];
 };
 const race=async(statement)=>{
  let mark;
  const ready=new Promise(resolve=>{mark=resolve;});
  const first=db.sql(db.ctx(1,statement+";select 'express-locked';select pg_sleep(.5)"),out=>{if(out.includes('express-locked'))mark();});
  await Promise.race([ready,first.then(result=>{assert.equal(result.code,0,result.stderr);})]);
  const [winner,loser]=await Promise.all([first,db.sql(db.ctx(2,statement))]);
  assert.equal(winner.code,0,winner.stderr);
  assert.match(loser.stderr,/40001:.*service a changé/);
  return winner;
 };
 const schedule=Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[
  day,{lunch:{enabled:false,start:'12:00',end:'14:00'},dinner:{enabled:true,start:'00:00',end:'23:59'}}
 ]));
 const openSchedule=()=>db.ok(`update public.restaurant_hours set lunch_enabled=false,dinner_enabled=true,dinner_start='00:00',dinner_end='23:59',weekly_schedule=${lit(JSON.stringify(schedule))}::jsonb;`);
 const today=async()=>{
  await openSchedule();
  await db.ok(`update public.reservations set starts_at=now(),ends_at=now()+interval '90 minutes' where id in (${lit(booking(1))},${lit(booking(2))});`);
 };
 await db.ok(`update public.reservations set status='reserved' where id=${lit(booking(1))};`);
 await reject(1,seat(await revision()),'OUTSIDE_SERVICE');
 await today();
 const before=await revision();
 await reject(1,`select public.seat_reservation_v1(${lit(booking(1))},'reserved',${lit(table(1))})`,'42501');
 await reject(3,seat(before),'42501');
 await reject(1,seat(before),'42501','anon');
 await reject(4,seat(await revision(4)),'42501');
 await reject(1,seat(before,[...moves].reverse(),1,2),'22023');
 await hold(1);
 await reject(1,seat(before),'40001');
 await reject(1,seat(await revision()),'HOLD_CONFLICT');
 assert.deepEqual(await record(1),['reserved',table(1)]);
 await db.ok('delete from public.table_holds;');
 await race(seat(await revision(),moves,1,2));
 assert.deepEqual(await record(1,2),['seated',table(2)]);
 assert.deepEqual(await record(2,2),['confirmed',table(1)]);
 assert.equal(await db.ok('select count(*) from public.placement_events'),'2');
 await reject(1,seat(await revision(),[],1,1),'40001');
 assert.equal((await db.snapshot(4)).reservations.some(item=>item.id===booking(1)),false);
 console.log('PASS Express : permutation atomique, refus d’une seconde confirmation, droits et maintien de table');

 await db.reset();
 await db.ok(`update public.reservations set status='reserved' where id=${lit(booking(1))};`);
 await today();
 const legacy=`select public.apply_smart_placement_v3(${lit(booking(1))},${lit(JSON.stringify(moves))}::jsonb)`;
 const express=seat(await revision(),moves,1,2);
 let signal;
 const started=new Promise(resolve=>{signal=resolve;});
 const first=db.sql(db.ctx(1,"select private.lock_restaurant_mutation_v1();select 'express-venue-locked';select pg_sleep(.8);"+express),
  output=>{if(output.includes('express-venue-locked'))signal();});
 await Promise.race([started,first.then(result=>{assert.equal(result.code,0,result.stderr);})]);
 const [expressResult,legacyResult]=await Promise.all([first,db.sql(db.ctx(2,legacy))]);
 assert.equal(expressResult.code,0,expressResult.stderr);
 assert.match(legacyResult.stderr,/40001:.*réservation a changé/);
 assert.deepEqual(await record(1,2),['seated',table(2)]);
 assert.deepEqual(await record(2,2),['confirmed',table(1)]);
 console.log('PASS Express et mode complet : ordre des verrous commun, une seule confirmation');

 await db.reset();
 await db.ok(`update public.reservations set status='reserved' where id=${lit(booking(1))};`);
 await today();
 await db.ok(db.ctx(1,seat(await revision())));
 assert.deepEqual(await record(1,2),['seated',table(1)]);
 console.log('PASS Express : installation directe avec révision et table choisie');

 await db.reset();
 await openSchedule();
 await reject(3,walk(await revision(),5),'42501');
 await reject(1,walk(await revision(),9),'42501');
 const winner=await race(walk(await revision(),5));
 const created=winner.stdout.split('\n').find(line=>/^[a-f0-9-]{36}$/.test(line)&&line!==uid(1));
 const installed=(await db.snapshot(2)).reservations.filter(row=>row.walkin_type==='exterieur'&&row.status==='seated');
 assert.equal(installed.length,1);
 assert.equal(installed[0].id,created);
 assert.equal((await db.snapshot(4)).reservations.some(row=>row.id===created),false);
 await db.ok(db.ctx(1,walk(await revision(),6,'hotel','237')));
 // The hosted November 28 definition differs from the November 10 fixture:
 // its explicit second-occupant exception makes NOT(NULL) skip the guard.
 const signature='private.confirm_reservation(text,text,integer,timestamptz,timestamptz,uuid[],text)';
 const originalGuard='if v_room is not null and exists (';
 const hostedGuard="if v_room is not null and not (v_role='fb_admin' and p_notes='[RM:WALKIN_SEPARATE_OCCUPANT_V1]' and current_setting('restomanager.second_occupant_confirmed',true)='yes') and exists (";
 const legacyDefinition=await definition(signature);
 assert.ok(legacyDefinition.includes(originalGuard));
 await db.ok(legacyDefinition.replace(originalGuard,hostedGuard));
 // Prove the hosted defect with a real duplicate insertion, then roll it back.
 const repro=await db.sql(db.ctx(2,walk(await revision(),7,'hotel','237')+";do $test$begin raise exception 'ROOM_DUPLICATE_REPRODUCED';end$test$"));
 assert.match(repro.stderr,/ROOM_DUPLICATE_REPRODUCED/);
 assert.equal((await db.snapshot(1)).reservations.filter(row=>row.hotel_room==='237').length,1);
 const fix=fs.readFileSync(path.join(directory,'express-room-conflict-v1.PROPOSAL.sql'),'utf8');
 const acl=()=>db.ok("select proowner::text||':'||proacl::text||':'||prosecdef::text from pg_proc where oid="+lit(signature)+"::regprocedure");
 const beforeAcl=await acl();
 for(let attempt=0;attempt<2;attempt++)await db.ok('set role rm_quick_hosted_admin;'+fix+'reset role;');
 assert.equal(await acl(),beforeAcl);
 const fixedRevision=await revision();
 await reject(2,walk(fixedRevision,7,'hotel','237'),'23P01|chambre');
 assert.equal(await revision(),fixedRevision);
 assert.equal((await db.snapshot(1)).reservations.filter(row=>row.hotel_room==='237').length,1);
 // Same room number at an unrelated venue is not a duplicate.
 await db.ok(db.ctx(4,walk(await revision(4),9,'hotel','237')));
 assert.equal((await db.snapshot(4)).reservations.filter(row=>row.hotel_room==='237').length,1);
 // Verify the exact legacy confirmation contract (flag AND marker AND Restaurant).
 // This models the existing v4 mode-complete RPC on the older fixture without modifying production.
 const explicit=(flag,notes)=>`do $test$
 declare stamp timestamptz:=statement_timestamp(); finish timestamptz:=stamp+interval '90 minutes'; token uuid:=gen_random_uuid();
 begin
  perform public.acquire_table_hold_v2(${lit(table(7))},stamp,finish,token);
  perform set_config('restomanager.second_occupant_confirmed',${lit(flag)},true);
  perform public.confirm_reservation_v3('237','237',2,stamp,finish,array[${lit(table(7))}]::uuid[],token,${lit(notes)});
 end $test'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {booking,rid,uid,lit}=require('./rm012-support.cjs');
const table=n=>'40000000-0000-4000-8000-'+String(n).padStart(12,'0');

module.exports=async function expressService(db,initialSync){
 const directory=path.resolve(__dirname,'../../supabase/proposals/rm-ops-engine');
 const draft=fs.readFileSync(path.join(directory,'express-service-v1.PROPOSAL.sql'),'utf8');
 assert.match((await db.sql(draft)).stderr,/propositions placement v4 et libération/);
 const migrations=path.resolve(__dirname,'../../supabase/migrations');
 for(const name of ['20261113153000_rm005_walkin_weekly_server_dev.sql','20261113164500_rm005_weekly_helper_writer_grant_dev.sql'])
  await db.ok(fs.readFileSync(path.join(migrations,name),'utf8'));
 const {buildExpressReleaseSql,buildExpressRollbackSql}=require('../../scripts/prepare-rm-release-03b.cjs');
 const definition=signature=>db.ok(`select pg_get_functiondef(${lit(signature)}::regprocedure)`);
 const legacySignature='public.apply_smart_placement_v3(uuid,jsonb)';
 const syncSignature='public.service_sync_state_v1()';
 const initialLegacy=await definition(legacySignature);
 const catalog=fs.readFileSync(path.resolve(directory,'../../release-prep/rm-release-03b2_dev_readonly.sql'),'utf8');
 await db.ok(catalog);
 await db.ok("alter default privileges for role rm_quick_hosted_admin in schema public grant delete, truncate, trigger, maintain on tables to service_role");
 const release=buildExpressReleaseSql();
 const rollback=release.replace(/commit;\s*$/i,"do $begin raise exception 'EXPRESS_RELEASE_ROLLBACK';end$;commit;");
 assert.match((await db.sql('set role rm_quick_hosted_admin;'+rollback)).stderr,/EXPRESS_RELEASE_ROLLBACK/);
 assert.equal(await db.ok("select to_regprocedure('public.express_seat_v1(text,uuid,text,uuid,jsonb)') is null"),'t');
 assert.equal(await definition(legacySignature),initialLegacy);
 for(let attempt=0;attempt<2;attempt++)await db.ok('set role rm_quick_hosted_admin;'+release+'reset role;');
 assert.equal(await db.ok("select has_schema_privilege('resto_service_writer','public','CREATE') or has_schema_privilege('resto_service_writer','private','CREATE')"),'f');
 assert.equal(await db.ok("select has_table_privilege('service_role','public.placement_events','DELETE,TRUNCATE,TRIGGER,MAINTAIN')"),'f');
 await db.reset();
 const revision=async(user=1)=>(await db.snapshot(user)).revision;
 const capabilities=(await db.snapshot(1)).capabilities;
 assert.deepEqual([capabilities.quick_release,capabilities.express_service],[1,1]);
 const moves=[{id:booking(1),from_table:table(1),to_table:table(2),expected_status:'reserved'},
  {id:booking(2),from_table:table(2),to_table:table(1),expected_status:'confirmed'}];
 const seat=(rev,changes=[],n=1,target=1)=>`select public.express_seat_v1(${lit(rev)},${lit(booking(n))},'reserved',${lit(table(target))},${lit(JSON.stringify(changes))}::jsonb)`;
 const walk=(rev,n,type='exterieur',room=null)=>`select public.express_walkin_v1(${lit(rev)},${lit(table(n))},2,${lit(type)},${lit(room)})`;
 const reject=async(user,statement,code,role='authenticated')=>{
  const result=await db.sql(db.ctx(user,statement,role));assert.notEqual(result.code,0);assert.match(result.stderr,new RegExp(code));
 };
 const hold=async(n)=>db.ok(`insert into public.table_holds(table_id,held_by,starts_at,ends_at,expires_at,restaurant_id)
  select ${lit(table(n))},${lit(uid(2))},starts_at,ends_at,clock_timestamp()+interval '3 minutes',${lit(rid(1))}
  from public.reservations where id=${lit(booking(1))};`);
 const record=async(n,user=1)=>{
  const snapshot=await db.snapshot(user);
  return [snapshot.reservations.find(row=>row.id===booking(n))?.status,snapshot.assignments.find(row=>row.reservation_id===booking(n))?.table_id];
 };
 const race=async(statement)=>{
  let mark;
  const ready=new Promise(resolve=>{mark=resolve;});
  const first=db.sql(db.ctx(1,statement+";select 'express-locked';select pg_sleep(.5)"),out=>{if(out.includes('express-locked'))mark();});
  await Promise.race([ready,first.then(result=>{assert.equal(result.code,0,result.stderr);})]);
  const [winner,loser]=await Promise.all([first,db.sql(db.ctx(2,statement))]);
  assert.equal(winner.code,0,winner.stderr);
  assert.match(loser.stderr,/40001:.*service a changé/);
  return winner;
 };
 const schedule=Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[
  day,{lunch:{enabled:false,start:'12:00',end:'14:00'},dinner:{enabled:true,start:'00:00',end:'23:59'}}
 ]));
 const openSchedule=()=>db.ok(`update public.restaurant_hours set lunch_enabled=false,dinner_enabled=true,dinner_start='00:00',dinner_end='23:59',weekly_schedule=${lit(JSON.stringify(schedule))}::jsonb;`);
 const today=async()=>{
  await openSchedule();
  await db.ok(`update public.reservations set starts_at=now(),ends_at=now()+interval '90 minutes' where id in (${lit(booking(1))},${lit(booking(2))});`);
 };
 await db.ok(`update public.reservations set status='reserved' where id=${lit(booking(1))};`);
 await reject(1,seat(await revision()),'OUTSIDE_SERVICE');
 await today();
 const before=await revision();
 await reject(1,`select public.seat_reservation_v1(${lit(booking(1))},'reserved',${lit(table(1))})`,'42501');
 await reject(3,seat(before),'42501');
 await reject(1,seat(before),'42501','anon');
 await reject(4,seat(await revision(4)),'42501');
 await reject(1,seat(before,[...moves].reverse(),1,2),'22023');
 await hold(1);
 await reject(1,seat(before),'40001');
 await reject(1,seat(await revision()),'HOLD_CONFLICT');
 assert.deepEqual(await record(1),['reserved',table(1)]);
 await db.ok('delete from public.table_holds;');
 await race(seat(await revision(),moves,1,2));
 assert.deepEqual(await record(1,2),['seated',table(2)]);
 assert.deepEqual(await record(2,2),['confirmed',table(1)]);
 assert.equal(await db.ok('select count(*) from public.placement_events'),'2');
 await reject(1,seat(await revision(),[],1,1),'40001');
 assert.equal((await db.snapshot(4)).reservations.some(item=>item.id===booking(1)),false);
 console.log('PASS Express : permutation atomique, refus d’une seconde confirmation, droits et maintien de table');

 await db.reset();
 await db.ok(`update public.reservations set status='reserved' where id=${lit(booking(1))};`);
 await today();
 const legacy=`select public.apply_smart_placement_v3(${lit(booking(1))},${lit(JSON.stringify(moves))}::jsonb)`;
 const express=seat(await revision(),moves,1,2);
 let signal;
 const started=new Promise(resolve=>{signal=resolve;});
 const first=db.sql(db.ctx(1,"select private.lock_restaurant_mutation_v1();select 'express-venue-locked';select pg_sleep(.8);"+express),
  output=>{if(output.includes('express-venue-locked'))signal();});
 await Promise.race([started,first.then(result=>{assert.equal(result.code,0,result.stderr);})]);
 const [expressResult,legacyResult]=await Promise.all([first,db.sql(db.ctx(2,legacy))]);
 assert.equal(expressResult.code,0,expressResult.stderr);
 assert.match(legacyResult.stderr,/40001:.*réservation a changé/);
 assert.deepEqual(await record(1,2),['seated',table(2)]);
 assert.deepEqual(await record(2,2),['confirmed',table(1)]);
 console.log('PASS Express et mode complet : ordre des verrous commun, une seule confirmation');

 await db.reset();
 await db.ok(`update public.reservations set status='reserved' where id=${lit(booking(1))};`);
 await today();
 await db.ok(db.ctx(1,seat(await revision())));
 assert.deepEqual(await record(1,2),['seated',table(1)]);
 console.log('PASS Express : installation directe avec révision et table choisie');

 await db.reset();
 await openSchedule();
 await reject(3,walk(await revision(),5),'42501');
 await reject(1,walk(await revision(),9),'42501');
 const winner=await race(walk(await revision(),5));
 const created=winner.stdout.split('\n').find(line=>/^[a-f0-9-]{36}$/.test(line)&&line!==uid(1));
 const installed=(await db.snapshot(2)).reservations.filter(row=>row.walkin_type==='exterieur'&&row.status==='seated');
 assert.equal(installed.length,1);
 assert.equal(installed[0].id,created);
 assert.equal((await db.snapshot(4)).reservations.some(row=>row.id===created),false);
;
 await reject(1,explicit('no','[RM:WALKIN_SEPARATE_OCCUPANT_V1]'),'23P01|chambre');
 await reject(1,explicit('yes',null),'23P01|chambre');
 await db.ok(db.ctx(1,explicit('yes','[RM:WALKIN_SEPARATE_OCCUPANT_V1]')));
 assert.equal((await db.snapshot(1)).reservations.filter(row=>row.hotel_room==='237').length,2);
 console.log('PASS garde chambre hébergée : reproduction NULL, refus sans double confirmation, établissement distinct, ACL et confirmation explicite conservées');
 console.log('PASS Express : passages hôtel et extérieur, refus concurrent, identifiant serveur et chambre unique');

 const beforeRollback=await db.snapshot(1);
 const auditCounts=()=>db.ok("select (select count(*) from public.placement_events), (select count(*) from private.quick_release_audit)");
 const beforeLogs=await auditCounts();
 const back=buildExpressRollbackSql();
 for(let attempt=0;attempt<2;attempt++)await db.ok('set role rm_quick_hosted_admin;'+back+'reset role;');
 assert.equal(await definition(legacySignature),initialLegacy);
 assert.equal(await definition(syncSignature),initialSync);
 const afterRollback=await db.snapshot(1);
 assert.equal(afterRollback.capabilities.quick_release,undefined);
 assert.equal(afterRollback.capabilities.express_service,undefined);
 assert.deepEqual(afterRollback.reservations,beforeRollback.reservations);
 assert.deepEqual(afterRollback.assignments,beforeRollback.assignments);
 assert.equal(afterRollback.revision,beforeRollback.revision);
 assert.equal(await auditCounts(),beforeLogs);
 for(const schema of ['public','private']){
  await reject(1,seat(await revision()).replace('public.',schema+'.'),'42501');
  await reject(1,walk(await revision(),5).replace('public.',schema+'.'),'42501');
  await reject(1,`select ${schema}.quick_release_v1(null,null,null,false)`,'42501');
 }
 assert.equal(await db.ok("select has_function_privilege('authenticated','public.apply_smart_placement_v3(uuid,jsonb)','execute')"),'t');
 console.log('PASS Retour arrière : capacités et RPC retirées, écritures et journaux conservés');
};

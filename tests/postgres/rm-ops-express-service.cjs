'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {booking,rid,uid,lit}=require('./rm012-support.cjs');
const table=n=>'40000000-0000-4000-8000-'+String(n).padStart(12,'0');
const last=output=>output.trim().split('\n').at(-1);

module.exports=async function expressService(db){
 const directory=path.resolve(__dirname,'../../supabase/proposals/rm-ops-engine');
 const draft=fs.readFileSync(path.join(directory,'express-service-v1.PROPOSAL.sql'),'utf8');
 assert.match((await db.sql(draft)).stderr,/propositions placement v4 et libération/);
 const migrations=path.resolve(__dirname,'../../supabase/migrations');
 for(const name of ['20261113153000_rm005_walkin_weekly_server_dev.sql','20261113164500_rm005_weekly_helper_writer_grant_dev.sql'])
  await db.ok(fs.readFileSync(path.join(migrations,name),'utf8'));
 const {buildExpressReleaseSql}=require('../../scripts/prepare-rm-release-03b.cjs');
 const release=buildExpressReleaseSql();
 const rollback=release.replace(/commit;\s*$/i,"do $begin raise exception 'EXPRESS_RELEASE_ROLLBACK';end$;commit;");
 assert.match((await db.sql('set role rm_quick_hosted_admin;'+rollback)).stderr,/EXPRESS_RELEASE_ROLLBACK/);
 assert.equal(await db.ok("select to_regprocedure('public.express_seat_v1(text,uuid,text,uuid,jsonb)') is null"),'t');
 for(let attempt=0;attempt<2;attempt++)await db.ok('set role rm_quick_hosted_admin;'+release+'reset role;');
 assert.equal(await db.ok("select has_schema_privilege('resto_service_writer','public','CREATE') or has_schema_privilege('resto_service_writer','private','CREATE')"),'f');
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
 await reject(2,walk(await revision(),7,'hotel','237'),'23P01|chambre');
 assert.equal((await db.snapshot(1)).reservations.filter(row=>row.hotel_room==='237').length,1);
 console.log('PASS Express : passages hôtel et extérieur, refus concurrent, identifiant serveur et chambre unique');
};

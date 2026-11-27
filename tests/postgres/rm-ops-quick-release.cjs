'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {start,booking,lit}=require('./rm012-support.cjs');

const table=number=>'40000000-0000-4000-8000-'+String(number).padStart(12,'0');
const proposal=path.resolve(__dirname,'../../supabase/proposals/rm-ops-quick-release/quick-release-v1.PROPOSAL.sql');
const reservation=lit(booking(1));
const ids=numbers=>'array['+numbers.map(number=>lit(table(number))).join(',')+']::uuid[]';
const query=(version,tables=[1],undo=false)=>`select public.quick_release_v1(${reservation},${lit(version)},${ids(tables)},${undo})`;
const row=`from public.reservations where id=${reservation}`;
const last=output=>output.trim().split('\n').at(-1);

(async()=>{
 const db=await start();
 try{
  const source=fs.readFileSync(proposal,'utf8');
  await db.ok(source);await db.ok(source);
  assert.equal(await db.ok(db.ctx(1,"select public.service_sync_state_v1()->'capabilities'->>'quick_release'")).then(last),'1');
  const currentRevision=async()=>Number((await db.snapshot(1)).revision);
  const beforeLegacy=await currentRevision();
  await db.ok(db.ctx(1,`select public.change_reservation_status_v3(${reservation},'seated','released')`));
  const releaseDelta=await currentRevision()-beforeLegacy;
  assert.ok(releaseDelta>0);
  await db.reset();
  await db.ok(`update public.reservations set seated_at='2032-11-07T18:00:00Z',released_at='2032-11-07T17:55:00Z' where id=${reservation};`);
  const state=()=>db.json(`select jsonb_build_object('status',status,'version',edit_version,'seated',seated_at,'released',released_at) ${row}`);
  const initial=await state();
  const revision=Number((await db.snapshot(1)).revision);
  for(const [user,role,tables,code] of [[1,'authenticated',[2],'40001'],[3,'authenticated',[1],'42501'],[4,'authenticated',[1],'40001'],[5,'authenticated',[1],'42501'],[1,'anon',[1],'42501']]){
   const refused=await db.sql(db.ctx(user,query(initial.version,tables),role));
   assert.notEqual(refused.code,0);assert.match(refused.stderr,new RegExp(code));
  }
  assert.equal(Number((await db.snapshot(1)).revision),revision);

  let unlock;
  const locked=new Promise(resolve=>{unlock=resolve;});
  const first=db.sql(db.ctx(1,query(initial.version)+";select 'release-open';select pg_sleep(0.8)"),
   output=>{if(output.includes('release-open'))unlock();});
  await Promise.race([locked,first.then(result=>{assert.equal(result.code,0,result.stderr);})]);
  const second=db.sql(db.ctx(2,query(initial.version)));
  const [won,lost]=await Promise.all([first,second]);
  assert.equal(won.code,0,won.stderr);
  assert.match(lost.stderr,/40001:.*plus installé sur ces tables/);
  const released=await state();
  assert.equal(released.status,'released');
  assert.notEqual(released.version,initial.version);
  assert.equal(released.seated,initial.seated);
  assert.equal(Number((await db.snapshot(2)).revision),revision+releaseDelta);
  assert.match((await db.sql(db.ctx(2,query(released.version,[1],true)))).stderr,/40001/);
  await db.ok(db.ctx(1,query(released.version,[1],true)));
  const restored=await state();
  assert.deepEqual({...restored,version:initial.version},initial);
  assert.equal(Number((await db.snapshot(2)).revision),revision+2*releaseDelta);
  assert.match((await db.sql(db.ctx(1,query(released.version,[1],true)))).stderr,/40001/);
  console.log('PASS refus atomique avec deux comptes, isolation, journal de révision partagé et annulation');

  const releasedAgain=last(await db.ok(db.ctx(1,query(restored.version))));
  await db.ok(`update public.reservation_tables set table_id=${lit(table(1))} where reservation_id=${lit(booking(2))};`);
  await db.ok(db.ctx(2,`select public.change_reservation_status_v3(${lit(booking(2))},'confirmed','seated')`));
  assert.match((await db.sql(db.ctx(1,query(releasedAgain,[1],true)))).stderr,/23P01/);
  assert.equal((await state()).status,'released');
  await db.ok("update private.quick_release_receipts set expires_at=clock_timestamp()-interval '1 second';");
  assert.match((await db.sql(db.ctx(1,query(releasedAgain,[1],true)))).stderr,/40001/);
  assert.equal((await state()).status,'released');
  console.log('PASS refus après réoccupation ou expiration');
 }finally{await db.stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});

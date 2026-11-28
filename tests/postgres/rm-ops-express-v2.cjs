'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {booking,rid,uid,lit}=require('./rm012-support.cjs');

const id=n=>'40000000-0000-4000-8000-'+String(n).padStart(12,'0');
const uuidArray=nums=>'array['+nums.map(n=>lit(id(n))).join(',')+']::uuid[]';
const sqlFile=suffix=>fs.readFileSync(path.join(__dirname,'../../supabase/proposals/rm-ops-engine/express-service-v2.'+suffix+'.sql'),'utf8');
const openWeek=Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{
 lunch:{enabled:false,start:'12:00',end:'14:00'},dinner:{enabled:true,start:'00:00',end:'23:59'}
}]));

module.exports=async function verifyExpressV2(db){
 const runAs=sql=>db.ok('set role rm_quick_hosted_admin;'+sql+'reset role;');
 await db.ok(fs.readFileSync(path.join(__dirname,'rm-b3-dev-four-table-fixture.sql'),'utf8'));
 await runAs(sqlFile('PROPOSAL'));
 await runAs(sqlFile('PROPOSAL'));
 const snapshot=(user=1)=>db.snapshot(user);
 const revision=async(user=1)=>(await snapshot(user)).revision;
 const as=(user,sql)=>db.json(db.ctx(user,sql));
 const reject=async(user,sql,pattern,role='authenticated')=>{
  const result=await db.sql(db.ctx(user,sql,role));
  assert.notEqual(result.code,0);
  assert.match(result.stderr,pattern);
 };
 const walk=(rev,nums,guests=2,type='exterieur',room=null,confirmation=null)=>
  `select public.express_walkin_v2(${lit(rev)},${uuidArray(nums)},${guests},${lit(type)},${lit(room)},${lit(confirmation)})`;
 const records=async()=>(await snapshot()).reservations;
 const record=async n=>(await records()).find(row=>row.id===booking(n));
 const seat=(rev,target,nums,changes=[])=>`select public.express_seat_v2(${lit(rev)},${lit(target.id)},${lit(target.status)},
  ${lit(target.edit_version)},${uuidArray(nums)},${lit(JSON.stringify(changes))}::jsonb)`;
 const reset=async()=>{
  await db.reset();
  await db.ok(`update public.restaurant_hours set lunch_enabled=false,dinner_enabled=true,dinner_start='00:00',dinner_end='23:59',
   weekly_schedule=${lit(JSON.stringify(openWeek))}::jsonb;
   delete from private.express_occupant_confirmation;`);
 };
 const links=numbers=>db.ok(db.ctx(1,numbers.slice(1).map((n,i)=>
  'select public.change_fusion_link_v3(null,'+uuidArray([numbers[i],n])+')').join(';')));
 const expectedTables=async(n,user=1)=>(await snapshot(user)).assignments.filter(a=>a.reservation_id===booking(n)).map(a=>a.table_id).sort();
 const audit=()=>db.ok('select count(*) from public.placement_events').then(Number);

 assert.equal((await snapshot()).capabilities.express_service_v2,1);
 assert.equal(await db.ok(`select has_function_privilege('anon','public.express_walkin_v2(text,uuid[],integer,text,text,uuid)','EXECUTE')
  or has_function_privilege('authenticated','private.express_check_tables_v2(uuid,uuid[],integer,tstzrange,timestamptz,uuid)','EXECUTE')
  or has_function_privilege('authenticated','public.apply_smart_placement_v4(uuid,jsonb,boolean,boolean)','EXECUTE')
  or has_table_privilege('authenticated','private.express_occupant_confirmation','SELECT')
  or has_schema_privilege('resto_service_writer','private','CREATE')`),'f');
 await reset();
 const first=await as(1,walk(await revision(),[5],2,'hotel','237A'));
 assert.equal(first.status,'seated');
 const rev=(await snapshot(2)).revision;
 const request=walk(rev,[6],2,'hotel',' 237A ');
 const challenge=await as(1,request);
 assert.equal(challenge.status,'room_conflict');
 assert.equal(challenge.reservation_id,first.reservation_id);
 assert.equal(challenge.revision,rev);
 assert.equal(await revision(),rev);
 for(const user of [3,5])await reject(user,request,/42501/);
 await reject(1,request,/42501/,'anon');
 await reject(2,walk(rev,[6],2,'hotel','237a',challenge.token),/40001/);
 await reject(1,walk(rev,[7],2,'hotel','237a',challenge.token),/40001/);
 await reject(1,walk(rev,[6],3,'hotel','237a',challenge.token),/40001/);
 await reject(4,walk(await revision(4),[9],2,'hotel','237a',challenge.token),/40001/);
 const other=await as(4,walk(await revision(4),[9],2,'hotel','237a'));
 assert.equal(other.status,'seated');
 assert.equal((await snapshot(4)).reservations.some(row=>row.id===first.reservation_id),false);
 const confirm=walk(rev,[6],2,'hotel','237a',challenge.token);
 await db.ok(`update private.express_occupant_confirmation set service_date=service_date-1 where actor_id=${lit(uid(1))};`);
 await reject(1,confirm,/40001/);
 await db.ok(`update private.express_occupant_confirmation set service_date=service_date+1 where actor_id=${lit(uid(1))};`);
 const sameTap=await Promise.all([db.sql(db.ctx(1,confirm)),db.sql(db.ctx(1,confirm))]);
 assert.equal(sameTap.filter(item=>item.code===0).length,1);
 assert.match(sameTap.find(item=>item.code!==0).stderr,/40001/);
 assert.equal((await records()).filter(r=>r.hotel_room==='237a').length,2);
 await reject(2,walk(await revision(),[7],2,'hotel','237a'),/ROOM_LIMIT/);
 assert.equal(await audit(),3);
 const stale=await as(1,walk(await revision(),[8],2,'hotel','190'));
 assert.equal(stale.status,'seated');
 const staleConfirm=await as(1,walk(await revision(),[7],2,'hotel','190'));
 await as(2,walk(await revision(),[4],2,'exterieur'));
 await reject(1,walk(await revision(),[7],2,'hotel','190',staleConfirm.token),/40001/);
 console.log('PASS B3 occupant : refus explicite, confirmation liée, péremption, clic concurrent, droits et isolation');

 for(const numbers of [[5,6],[5,6,7],[5,6,7,8]]){
  await reset();
  await reject(1,walk(await revision(),numbers,7),/22023/);
  await links(numbers);
  await reject(1,walk(await revision(),numbers,25),/22023/);
  const rev=await revision();
  await db.ok(`update public.restaurant_tables set active=false where id=${lit(id(numbers.at(-1)))};`);
  await reject(1,walk(rev,numbers,7),/40001/);
  await reject(1,walk(await revision(),numbers,7),/22023/);
  await db.ok(`update public.restaurant_tables set active=true where id=${lit(id(numbers.at(-1)))};`);
  await db.ok(`insert into public.table_holds(table_id,held_by,starts_at,ends_at,expires_at,restaurant_id)
   values(${lit(id(numbers.at(-1)))},${lit(uid(2))},now(),now()+interval '90 minutes',clock_timestamp()+interval '3 minutes',${lit(rid(1))});`);
  await reject(1,walk(await revision(),numbers,7),/HOLD_CONFLICT/);
  await db.ok('delete from public.table_holds;');
  if(numbers.length===2){
   await db.ok(`update public.reservations set starts_at=now()+interval '45 minutes',ends_at=now()+interval '2 hours'
    where id=${lit(booking(4))};
    update public.reservation_tables set table_id=${lit(id(numbers.at(-1)))} where reservation_id=${lit(booking(4))};`);
   await reject(1,walk(await revision(),numbers,7),/TABLE_CONFLICT/);
   await db.ok(`update public.reservation_tables set table_id=${lit(id(4))} where reservation_id=${lit(booking(4))};`);
  }
  const installed=await as(1,walk(await revision(),numbers,7));
  assert.equal(installed.status,'seated');
  assert.equal((await snapshot(2)).assignments.filter(a=>a.reservation_id===installed.reservation_id).length,numbers.length);
  await reject(1,walk(await revision(),numbers,7),/TABLE_CONFLICT/);
  assert.equal(await audit(),1);
 }
 await reset();await links([1,5]);
 await db.ok(`update public.reservations set status='reserved',party_size=7,starts_at=now(),ends_at=now()+interval '90 minutes'
  where id=${lit(booking(1))};
  insert into public.reservation_tables(reservation_id,table_id,restaurant_id) values(${lit(booking(1))},${lit(id(5))},${lit(rid(1))});`);
 const planned=await record(1);
 await reject(1,seat(await revision(),planned,[1]),/40001/);
 const fused=await as(1,seat(await revision(),planned,[5,1]));
 assert.equal(typeof fused.seated_at,'string');
 const release=async(version,undo)=>await db.ok(db.ctx(1,`select public.quick_release_v1(${lit(booking(1))},${lit(version)},${uuidArray([1,5])},${undo})`)).then(s=>s.split('\n').at(-1));
 const receipt=await release((await record(1)).edit_version,false);
 await release(receipt,true);
 assert.equal((await record(1)).status,'seated');
 assert.deepEqual(await expectedTables(1),[id(1),id(5)]);
 console.log('PASS B3 fusions : groupes 2/3/4, lien, capacité, maintien, révision, occupation et libération/annulation existantes');

 const chain=async(size)=>{
  await reset();
  await db.ok(`update public.reservations set status='reserved',starts_at=now(),ends_at=now()+interval '90 minutes'
   where restaurant_id=${lit(rid(1))};
   insert into public.reservations(id,restaurant_id,guest_name,party_size,starts_at,ends_at)
   select ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,${lit(rid(1))},'Client fictif',2,now(),now()+interval '90 minutes'
   from generate_series(5,${size}) n;
   insert into public.reservation_tables(reservation_id,table_id,restaurant_id)
   select ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
    ('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,${lit(rid(1))}
   from generate_series(5,${size}) n;`);
  const rows=await records();
  return Array.from({length:size},(_,i)=>{
   const row=rows.find(r=>r.id===booking(i+1));
   return {id:row.id,from_table:id(i+1),to_table:id(i+1===size?1:i+2),expected_status:row.status,expected_version:row.edit_version};
  });
 };
 for(let size=3;size<=8;size++){
  const moves=await chain(size),target=await record(1),rev=await revision();
  await reject(3,seat(rev,target,[2],moves),/42501/);
  await reject(1,seat(rev,target,[2],[...moves,...Array(9-size).fill(moves.at(-1))]),/22023/);
  await reject(1,seat(rev,target,[2],moves.map((m,i)=>i===0?m:i===size-1?{...m,from_table:id(9)}:m)),/40001/);
  await reject(1,seat(rev,{...target,edit_version:'00000000-0000-4000-8000-000000000000'},[2],moves),/40001/);
  assert.equal(await audit(),0);
  assert.deepEqual(await expectedTables(1),[id(1)]);
  const result=await as(1,seat(rev,target,[2],moves));
  assert.equal(result.changed,size);
  assert.equal((await record(1)).status,'seated');
  assert.deepEqual(await expectedTables(size,2),[id(1)]);
  assert.equal(await audit(),size);
  await reject(2,seat(rev,target,[2],moves),/40001/);
 }
 for(const status of ['arrived','seated']){
  const moves=await chain(3),target=await record(1);
  await db.ok(`update public.reservations set status=${lit(status)} where id=${lit(booking(3))};`);
  moves[2]={...moves[2],expected_status:status,expected_version:(await record(3)).edit_version};
  await reject(1,seat(await revision(),target,[2],moves),/40001|23P01/);
  assert.equal(await audit(),0);
  assert.deepEqual(await expectedTables(1),[id(1)]);
 }
 let moves=await chain(3),target=await record(1);
 await db.ok(`update public.reservations set starts_at=now()+interval '2 hours',ends_at=now()+interval '3 hours'
  where id=${lit(booking(3))};`);
 moves[2].expected_version=(await record(3)).edit_version;
 await reject(1,seat(await revision(),target,[2],moves),/40001/);
 assert.equal(await audit(),0);
 moves=await chain(3);target=await record(1);
 await db.ok(`insert into public.table_holds(table_id,held_by,starts_at,ends_at,expires_at,restaurant_id)
  values(${lit(id(3))},${lit(uid(2))},now(),now()+interval '90 minutes',clock_timestamp()+interval '3 minutes',${lit(rid(1))});`);
 await reject(1,seat(await revision(),target,[2],moves),/HOLD_CONFLICT/);
 assert.equal(await audit(),0);
 await db.ok(`delete from public.table_holds;
  insert into public.restaurant_rooms(id,name,restaurant_id) values
   ('30000000-0000-4000-8000-000000000011','Autre salle fictive',${lit(rid(1))});
  insert into public.restaurant_tables(id,room_id,label,seats,restaurant_id)
   values(${lit(id(11))},'30000000-0000-4000-8000-000000000011','Table 11',6,${lit(rid(1))});`);
 await reject(1,seat(await revision(),target,[2],moves.map((m,i)=>i===2?{...m,to_table:id(11)}:m)),/ROOM_CHANGE_REQUIRED/);
 assert.equal(await audit(),0);
 const guarded=seat(await revision(),target,[2],moves);
 const legacy=`select public.apply_smart_placement_v3(${lit(target.id)},${lit(JSON.stringify(moves))}::jsonb)`;
 let mark;
 const ready=new Promise(resolve=>{mark=resolve;});
 const leader=db.sql(db.ctx(1,"select private.lock_restaurant_mutation_v1();select 'b3-venue-locked';select pg_sleep(.8);"+guarded),
  output=>{if(output.includes('b3-venue-locked'))mark();});
 await Promise.race([ready,leader.then(result=>assert.equal(result.code,0,result.stderr))]);
 const [winner,loser]=await Promise.all([leader,db.sql(db.ctx(2,legacy))]);
 assert.equal(winner.code,0,winner.stderr);
 assert.match(loser.stderr,/40001/);
 assert.equal(await audit(),3);
 console.log('PASS B3 chaîne : statuts protégés, créneaux, maintien, salle et concurrence avec le mode complet');
 const before=await snapshot();
 await runAs(sqlFile('ROLLBACK'));
 const after=await snapshot();
 assert.equal(after.capabilities.express_service_v2,undefined);
 assert.equal(after.capabilities.express_service,1);
 assert.equal(after.capabilities.quick_release,1);
 assert.deepEqual(after.assignments,before.assignments);
 await reject(1,walk(after.revision,[5]),/42501/);
 console.log('PASS B3 permutations de 3 à 8, plans indépendants et périmés refusés, audit, retour B2 sans perte');
};

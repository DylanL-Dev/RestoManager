'use strict';
// No DB URL is accepted. All mutations go through docker exec to a fresh,
// network-disabled container created by this process and removed in finally.
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const mission3=process.argv.includes('--mission3');
const container='restomanager-mission'+(mission3?'3':'2')+'-tests-'+process.pid;
const image=process.env.MISSION3_POSTGRES_IMAGE||'postgres:17-bookworm@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994';
const env={...process.env};
for(const name of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[name];
function docker(args,input='',onData){
 return new Promise((resolve,reject)=>{
  const proc=spawn('docker',['--host=unix:///var/run/docker.sock',...args],{env});let stdout='',stderr='';
  const timeout=setTimeout(()=>{proc.kill();reject(Error('Local PostgreSQL test timeout'));},30000);
  proc.stdout.on('data',b=>{stdout+=b;onData?.(stdout)});proc.stderr.on('data',b=>stderr+=b);
  proc.on('error',reject);proc.on('close',code=>{clearTimeout(timeout);resolve({code,stdout,stderr})});proc.stdin.end(input);
 });
}
async function sql(query,onData){
 const r=await docker(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U','postgres','-d','mission2'],query,onData);
 return r;
}
async function ok(query){const r=await sql(query);assert.equal(r.code,0,r.stderr);return r.stdout.trim();}
const id=(prefix,n)=>prefix+'0000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user=n=>id('2',n),res=n=>id('5',n),table=n=>id('4',n);
const lit=s=>s==null?'null':"'"+String(s).replaceAll("'","''")+"'";
const ctx=(who,query,role='authenticated')=>`begin;set local role ${role};select set_config('request.jwt.claim.sub',${lit(user(who))},true);${query};commit;`;
async function record(n){return JSON.parse(await ok(`select row_to_json(r) from public.reservations r where id=${lit(res(n))};`));}
function edit(r,changes={},reception=false){
 const {table:chosenTable,...fields}=changes;
 const v={p_reservation_id:r.id,p_expected_version:r.edit_version,p_guest_name:r.guest_name,p_hotel_room:r.hotel_room,
  p_party_size:r.party_size,p_starts_at:r.starts_at,p_ends_at:r.ends_at,p_notes:r.notes,...fields};
 const args=Object.entries(v).map(([k,value])=>k+'=>'+lit(value));
 if(!reception)args.push('p_table_ids=>array['+lit(chosenTable||table(Number(r.id.slice(-2))))+']::uuid[]');
 return 'select public.'+(reception?'reception_update_reservation_v4':'update_reservation_v4')+'('+args.join(',')+')';
}
async function fails(who,query,code,role){const r=await sql(ctx(who,query,role));assert.notEqual(r.code,0,'expected SQL rejection');assert.match(r.stderr,new RegExp(code),r.stderr);}
let tests=0;const results=[];
async function test(name,fn){await ok(fs.readFileSync(path.join(__dirname,'seed.sql'),'utf8'));await fn();tests++;results.push(name);console.log('PASS '+name);}
async function concurrent(firstWho,firstQuery,secondWho,secondQuery,expected){
 let started;const marker=new Promise(resolve=>{started=resolve});
 const first=sql(ctx(firstWho,firstQuery+`;\n\\echo MISSION2_LOCK_HELD\nselect pg_sleep(0.5)`),stdout=>{if(stdout.includes('MISSION2_LOCK_HELD'))started()});
 await Promise.race([marker,first.then(r=>{throw Error('First writer did not acquire lock: '+r.stderr)})]);
 const second=sql(ctx(secondWho,secondQuery));const [a,b]=await Promise.all([first,second]);
 assert.equal(a.code,0,a.stderr);assert.notEqual(b.code,0);assert.match(b.stderr,new RegExp(expected),b.stderr);
}
(async()=>{
 let created=false;
 try{
  const start=await docker(['run','-d','--name',container,'--network','none','--tmpfs','/var/lib/postgresql/data:rw',
   '--label','restomanager.mission=2-tests','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=mission2',image]);
  assert.equal(start.code,0,start.stderr);created=true;
  let ready=false;for(let i=0;i<100;i++){
   const logs=await docker(['logs',container]);
   if((logs.stdout+logs.stderr).includes('PostgreSQL init process complete; ready for start up.')){
    const r=await docker(['exec',container,'pg_isready','-U','postgres']);if(r.code===0){ready=true;break}
   }
   await new Promise(r=>setTimeout(r,150));
  }assert.ok(ready,'final PostgreSQL process ready');
  console.log('PostgreSQL '+await ok('show server_version;'));
  await ok(fs.readFileSync(path.join(__dirname,'fixture.sql'),'utf8'));
  const patch=fs.readFileSync(path.join(root,'supabase/scripts/mission2_reservation_edits.sql'),'utf8');await ok(patch);await ok(patch);
  if(mission3){
   const validation=fs.readFileSync(path.join(root,'supabase/scripts/mission3_validation_integration.sql'),'utf8');
   await ok(validation);await ok(validation);
   const rightSize=fs.readFileSync(path.join(root,'supabase/scripts/reception_right_size_recommendations.sql'),'utf8');
   await ok(rightSize);await ok(rightSize);
  }
  console.log('PASS script applies atomically and can be reapplied locally');
  await test('Restaurant: room persisted, previous room gone, notes/allergies preserved',async()=>{
   const before=await record(1);await ok(ctx(1,edit(before,{p_hotel_room:'201'})));const after=await record(1);
   assert.equal(after.hotel_room,'201');assert.equal(after.notes,before.notes);assert.notEqual(after.edit_version,before.edit_version);
  });
  await test('Reception: room persisted and change notification contains current/previous room',async()=>{
   const before=await record(1);await ok(ctx(3,edit(before,{p_hotel_room:'202'},true)));const after=await record(1);
   assert.equal(after.hotel_room,'202');assert.equal(after.notes,before.notes);
   const alert=JSON.parse(await ok("select row_to_json(a) from public.reservation_change_alerts a limit 1;"));
   assert.equal(alert.hotel_room,'202');assert.equal(alert.previous_hotel_room,'101');assert.ok(alert.changed_fields.includes('chambre'));
  });
  for(const who of [1,3])await test('Room conflict rolls back all fields and assignments, role '+who,async()=>{
   const before=await record(1);await fails(who,edit(before,{p_hotel_room:'102',p_notes:'Must not persist'},who===3),'23P01');assert.deepEqual(await record(1),before);
  });
  for(const who of [1,3])await test('Exterior numeric guest remains roomless with notes/allergies, role '+who,async()=>{
   const before=await record(3);await ok(ctx(who,edit(before,{p_guest_name:'755',p_hotel_room:null,p_notes:'Fictif\nALLERGIES À VÉRIFIER : Lait\n[RESTOMANAGER:EXTERIEUR]'},who===3)));
   const after=await record(3);assert.equal(after.hotel_room,null);assert.match(after.notes,/EXTERIEUR/);assert.match(after.notes,/Lait/);
  });
  for(const pair of [[1,2],[1,3],[3,1],[3,3]])await test('Concurrent edits '+pair.join(' / ')+': stale writer refused and allergy retained',async()=>{
   const before=await record(1),notes='Nouvelle note\nALLERGIES À VÉRIFIER : Arachide\n[RESTOMANAGER:HOTEL]';
   await concurrent(pair[0],edit(before,{p_notes:notes},pair[0]===3),pair[1],edit(before,{p_guest_name:'Obsolete'},pair[1]===3),'RM001');
   const after=await record(1);assert.equal(after.notes,notes);assert.equal(after.guest_name,before.guest_name);
  });
  await test('Concurrent distinct reservations cannot both take the same hotel room',async()=>{
   const a=await record(1),b=await record(2);await concurrent(1,edit(a,{p_hotel_room:'999'}),2,edit(b,{p_hotel_room:'999'}),'23P01');
   assert.equal((await record(2)).hotel_room,'102');
  });
  await test('Edit then cancellation retains room/notes and invalidates the open version',async()=>{
   const a=await record(1);await ok(ctx(1,edit(a,{p_hotel_room:'203'})));const edited=await record(1);
   await ok(ctx(3,'select public.cancel_reservation_v3('+lit(a.id)+')'));const cancelled=await record(1);
   assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.hotel_room,'203');assert.equal(cancelled.notes,a.notes);
   await fails(1,edit(edited,{p_guest_name:'Must not reactivate'}),'RM001');
  });
  await test('Existing table collision protection still rejects incompatible assignment',async()=>{
   const before=await record(1);const query=edit(before).replace(table(1),table(2));await fails(1,query,'23P01');assert.deepEqual(await record(1),before);
  });
  await test('Concurrent reservations cannot both move onto the same free table',async()=>{
   const a=await record(1),b=await record(2);
   await concurrent(1,edit(a).replace(table(1),table(5)),2,edit(b).replace(table(2),table(5)),'23P01');
   assert.equal(await ok(`select count(*) from public.reservation_tables where table_id=${lit(table(5))}`),'1');
  });
  await test('Active hold from another editor still blocks a table change',async()=>{
   const before=await record(1);
   await ok(`insert into public.table_holds(table_id,held_by,starts_at,ends_at,restaurant_id,draft_role) values(${lit(table(5))},${lit(user(2))},${lit(before.starts_at)},${lit(before.ends_at)},'10000000-0000-4000-8000-000000000001','fb_admin');`);
   await fails(1,edit(before).replace(table(1),table(5)),'23P01');assert.deepEqual(await record(1),before);
  });
  await test('Table-only reassignment invalidates an existing editor',async()=>{
   const before=await record(2);await ok(`update public.reservation_tables set table_id=${lit(table(6))} where reservation_id=${lit(before.id)};`);
   assert.notEqual((await record(2)).edit_version,before.edit_version);await fails(1,edit(before),'RM001');
  });
  await test('Smart placement invalidates non-target reservations as well',async()=>{
   const a=await record(1),b=await record(2);
   const changes=[{id:a.id,from_table:table(1),to_table:table(5),expected_status:'reserved'},
    {id:b.id,from_table:table(2),to_table:table(6),expected_status:'reserved'}];
   await ok(ctx(1,`select public.apply_smart_placement_v3(${lit(a.id)},${lit(JSON.stringify(changes))}::jsonb)`));
   assert.equal((await record(2)).status,'reserved');assert.notEqual((await record(2)).edit_version,b.edit_version);
   await fails(1,edit(b),'RM001');
  });
  await test('Role separation, inactive/no-profile users and anonymous RPC denial',async()=>{
   const before=await record(1);await fails(3,edit(before),'42501');await fails(1,edit(before,{},true),'42501');
   await fails(5,edit(before,{},true),'42501');await fails(6,edit(before),'42501');await fails(1,edit(before),'42501','anon');
  });
  await test('RLS with two populated restaurants: foreign reads and edits refused',async()=>{
   const foreign=await record(9);
   assert.equal((await ok(ctx(1,`select count(*) from public.reservations where id=${lit(foreign.id)}`))).split('\n').at(-1),'0');
   await fails(1,edit(foreign),'P0002');assert.deepEqual(await record(9),foreign);
   const own=await record(1);await fails(1,edit(own).replace(table(1),table(9)),'22023');assert.deepEqual(await record(1),own);
  });
  await test('Missing version and both legacy editing endpoints fail closed',async()=>{
   const before=await record(1);await fails(1,edit(before,{p_expected_version:null}),'RM002');
   await fails(1,`select public.update_reservation_v3(${lit(before.id)},'Old client',2,${lit(before.starts_at)},${lit(before.ends_at)},array[${lit(table(1))}]::uuid[],'Stale')`,'RM002');
   await fails(3,`select public.reception_booking_v3(${lit(before.id)},'Old client','101',2,${lit(before.starts_at)},${lit(before.ends_at)},'Stale')`,'RM002');assert.deepEqual(await record(1),before);
  });
  await test('Legacy Reception creation remains available after editing endpoint protection',async()=>{
   const before=await record(1);await ok(ctx(3,`select public.reception_booking_v3(null,'Client fictif nouveau',null,2,${lit(before.starts_at)},${lit(before.ends_at)},'[RESTOMANAGER:EXTERIEUR]')`));
   assert.equal(await ok("select count(*) from public.reservations where guest_name='Client fictif nouveau' and hotel_room is null"),'1');
  });
  await test('New private writer is subject to RLS, has fixed search_path, no public/anon execution',async()=>{
   assert.equal(await ok("select rolbypassrls or rolsuper from pg_roles where rolname='resto_service_writer'"),'f');
   assert.equal(await ok("select has_function_privilege('anon','public.update_reservation_v4(uuid,uuid,text,text,integer,timestamptz,timestamptz,uuid[],text)','execute')"),'f');
   assert.equal(await ok("select has_function_privilege('authenticated','private.update_reservation_v4(uuid,uuid,text,text,integer,timestamptz,timestamptz,uuid[],text)','execute')"),'f');
   assert.equal(await ok("select count(*) from pg_proc where proname in ('update_reservation_v4','reception_update_reservation_v4') and (proconfig is null or not ('search_path=\"\"'=any(proconfig)))"),'0');
  });
  if(mission3)await require('./mission3-cases.cjs')({sql,ok,record,edit,ctx,fails,test,concurrent,lit,user,res,table,docker,container});
  const hostedResults=await require('./hosted-migrations.cjs')({docker,container,mission3});
  tests+=hostedResults.length;results.push(...hostedResults);
  console.log(JSON.stringify({mission:mission3?3:2,passed:tests,failed:0,containerNetwork:'none',tests:results}));
 }finally{if(created)await docker(['rm','-f',container]);}
})().catch(error=>{console.error(error);process.exitCode=1});

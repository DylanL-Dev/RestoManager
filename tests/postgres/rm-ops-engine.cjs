'use strict';
/* RM-OPS ENGINE — tests PostgreSQL isolés des RPC de placement/installation.
 * Aucune URL de base distante n'est acceptée. Deux moteurs jetables possibles :
 *  - Docker (par défaut) : conteneur sans réseau, comme tests/postgres/mission2.cjs ;
 *  - --local : PostgreSQL installé localement, répertoire temporaire, socket Unix
 *    uniquement (listen_addresses=''), arrêté et supprimé à la fin.
 * Le schéma est reconstruit comme mission2 --mission3, puis l'export DEV versionné
 * (dev-snapshot-20261110.sql) remplace les fonctions : on teste les RPC telles que DEV.
 */
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const local=process.argv.includes('--local');
const useSnapshot=!process.argv.includes('--repo-functions');
const env={...process.env};
for(const name of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH','PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','DATABASE_URL'])delete env[name];
const container='restomanager-rm-ops-'+process.pid;
const image=process.env.MISSION3_POSTGRES_IMAGE||'postgres:17-bookworm@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994';
let tmp=null,bin=null;
const asRoot=typeof process.getuid==='function'&&process.getuid()===0;

function run(cmd,args,input='',onData,timeoutMs=60000){
 return new Promise((resolve,reject)=>{
  const proc=spawn(cmd,args,{env});let stdout='',stderr='';
  const timer=setTimeout(()=>{proc.kill();reject(Error('Local PostgreSQL test timeout'))},timeoutMs);
  proc.stdout.on('data',b=>{stdout+=b;onData?.(stdout)});proc.stderr.on('data',b=>stderr+=b);
  proc.stdin.on('error',()=>{});proc.on('error',reject);proc.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr})});proc.stdin.end(input);
 });
}
function sql(query,onData){
 return local
  ?run(path.join(bin,'psql'),['-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h',tmp,'-U','postgres','-d','rmops'],query,onData)
  :run('docker',['--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U','postgres','-d','rmops'],query,onData);
}
async function ok(query){const r=await sql(query);assert.equal(r.code,0,r.stderr);return r.stdout.trim()}
const id=(prefix,n)=>prefix+'0000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user=n=>id('2',n),res=n=>id('5',n),table=n=>id('4',n);
const A='10000000-0000-4000-8000-000000000001';
const lit=s=>s==null?'null':"'"+String(s).replaceAll("'","''")+"'";
const ctx=(who,query)=>`begin;set local role authenticated;select set_config('request.jwt.claim.sub',${lit(user(who))},true);${query};commit;`;
async function fails(who,query,code){const r=await sql(ctx(who,query));assert.notEqual(r.code,0,'expected SQL rejection for: '+query);assert.match(r.stderr,new RegExp(code),r.stderr);return r.stderr}
async function record(n){return JSON.parse(await ok(`select row_to_json(x) from (select r.*,(select array_agg(table_id order by table_id) from public.reservation_tables t where t.reservation_id=r.id) tables from public.reservations r where id=${lit(res(n))}) x;`))}
const place=(target,changes)=>`select public.apply_smart_placement_v3(${lit(res(target))},${lit(JSON.stringify(changes.map(([n,from,to,status])=>({id:res(n),from_table:table(from),to_table:table(to),expected_status:status||'reserved'}))))}::jsonb)`;
const seat=(n,expected='reserved')=>`select public.change_reservation_status_v3(${lit(res(n))},${lit(expected)},'seated')`;
async function concurrent(firstWho,firstQuery,secondWho,secondQuery){
 let started;const marker=new Promise(resolve=>{started=resolve});
 const first=sql(ctx(firstWho,firstQuery+`;\n\\echo RMOPS_LOCK_HELD\nselect pg_sleep(0.6)`),stdout=>{if(stdout.includes('RMOPS_LOCK_HELD'))started()});
 await Promise.race([marker,first.then(r=>{throw Error('First writer did not acquire lock: '+r.stderr)})]);
 const second=sql(ctx(secondWho,secondQuery));const [a,b]=await Promise.all([first,second]);
 return [a,b];
}
let count=0;const findings=[];
const scenarioEarly=`update public.reservations set starts_at=now()-interval '60 minutes',ends_at=now()+interval '30 minutes' where id='${res(4)}';
update public.reservation_tables set table_id='${table(8)}' where reservation_id='${res(4)}';
update public.reservations set starts_at=now()+interval '30 minutes',ends_at=now()+interval '120 minutes' where id='${res(1)}';`;
async function test(name,fn){await ok(fs.readFileSync(path.join(__dirname,'seed.sql'),'utf8'));await fn();count++;console.log('PASS '+name)}

async function startLocal(){
 const candidates=[process.env.RMOPS_PG_BIN,...['17','16','15'].map(v=>'/usr/lib/postgresql/'+v+'/bin')].filter(Boolean);
 bin=candidates.find(dir=>fs.existsSync(path.join(dir,'initdb')));
 assert.ok(bin,'PostgreSQL local introuvable (initdb)');
 tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rmops-pg-'));
 fs.chmodSync(tmp,0o777);
 const asPg=cmd=>asRoot?['su','postgres','-s','/bin/sh','-c',cmd]:['/bin/sh','-c',cmd];
 const data=path.join(tmp,'data');
 const init=spawnSync(...(([c,...a])=>[c,a])(asPg(`${bin}/initdb -D ${data} -A trust -U postgres`)),{env,encoding:'utf8'});
 assert.equal(init.status,0,init.stderr);
 const start=spawnSync(...(([c,...a])=>[c,a])(asPg(`${bin}/pg_ctl -D ${data} -l ${tmp}/log -w -o "-c listen_addresses='' -c unix_socket_directories=${tmp} -c fsync=off" start`)),{env,encoding:'utf8'});
 assert.equal(start.status,0,start.stderr+fs.readFileSync(path.join(tmp,'log'),'utf8'));
 const r=await run(path.join(bin,'psql'),['-X','-qAt','-h',tmp,'-U','postgres','-d','postgres','-c','create database rmops']);assert.equal(r.code,0,r.stderr);
}
function stopLocal(){
 if(!tmp)return;
 const cmd=`${bin}/pg_ctl -D ${tmp}/data -m immediate stop`;
 spawnSync(asRoot?'su':'/bin/sh',asRoot?['postgres','-s','/bin/sh','-c',cmd]:['-c',cmd],{env});
 fs.rmSync(tmp,{recursive:true,force:true});
}
async function startDocker(){
 const startRes=await run('docker',['--host=unix:///var/run/docker.sock','run','-d','--name',container,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=rmops',image]);
 assert.equal(startRes.code,0,startRes.stderr);
 for(let i=0;i<100;i++){
  const logs=await run('docker',['--host=unix:///var/run/docker.sock','logs',container]);
  if((logs.stdout+logs.stderr).includes('PostgreSQL init process complete; ready for start up.')){
   const r=await run('docker',['--host=unix:///var/run/docker.sock','exec',container,'pg_isready','-U','postgres']);if(r.code===0)return;
  }
  await new Promise(r=>setTimeout(r,150));
 }
 throw Error('PostgreSQL container not ready');
}

(async()=>{
 try{
  if(local)await startLocal();else await startDocker();
  console.log('PostgreSQL '+await ok('show server_version;')+(local?' (local, socket Unix temporaire)':' (Docker sans réseau)'));
  await ok(fs.readFileSync(path.join(__dirname,'fixture.sql'),'utf8'));
  for(const file of ['mission2_reservation_edits.sql','mission3_validation_integration.sql','reception_right_size_recommendations.sql','platform_owner_foundation.sql','bug01_private_reports.sql'])
   await ok(fs.readFileSync(path.join(root,'supabase/scripts',file),'utf8'));
  if(useSnapshot){
   await ok("do $$begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls;end if;end$$;");
   let snapshot=fs.readFileSync(path.join(__dirname,'dev-snapshot-20261110.sql'),'utf8');
   // PostgreSQL < 17 (mode --local uniquement) ne connaît pas le privilège MAINTAIN, sans effet sur les RPC testées.
   if(Number(await ok('show server_version_num;'))<170000){
    snapshot=snapshot.split('\n').filter(line=>!/^grant MAINTAIN on /i.test(line)).join('\n');
    console.log('INFO PostgreSQL < 17 : lignes « grant MAINTAIN » de l’export ignorées');
   }
   await ok(snapshot);
   console.log('INFO fonctions/RLS/ACL/triggers de l’export DEV 10/11 appliqués (base locale isolée uniquement)');
   if(process.argv.includes('--print-md5'))console.log('MD5\n'+await ok("select n.nspname||'.'||p.proname||' '||md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname,p.proname) in (('public','apply_smart_placement_v3'),('public','change_reservation_status_v3'),('public','install_walkin_group_v3'),('public','install_walkin_v3'),('public','update_reservation_v4'),('public','acquire_table_hold_v2'),('private','confirm_reservation_v3'),('private','lock_restaurant_mutation_v1'),('private','bump_reservation_edit_version'),('private','invalidate_reservation_edit_version')) order by 1"));
   if(process.argv.includes('--print-catalog'))console.log('CATALOG\n'+await ok(fs.readFileSync(path.join(root,'supabase/proposals/rm-ops-engine/AUDIT_DEV_READONLY.sql'),'utf8')));
  }

  await test('ENG-01 échange 1↔2 atomique + installation de la cible, edit_version invalidées',async()=>{
   const a=await record(1),b=await record(2);
   await ok(ctx(1,place(1,[[1,1,2],[2,2,1]])));
   const a2=await record(1),b2=await record(2);
   assert.equal(a2.status,'seated');assert.deepEqual(a2.tables,[table(2)]);assert.deepEqual(b2.tables,[table(1)]);assert.equal(b2.status,'reserved');
   assert.notEqual(a2.edit_version,a.edit_version);assert.notEqual(b2.edit_version,b.edit_version);
  });
  await test('ENG-02 table cible occupée par un client installé : refus, rien ne change',async()=>{
   await ok(ctx(1,seat(2)));const a=await record(1),b=await record(2);
   await fails(1,place(1,[[1,1,2],[2,2,1,'seated']]),'40001|23P01');
   await fails(1,place(1,[[1,1,2]]),'23P01');
   assert.deepEqual(await record(1),a);assert.deepEqual(await record(2),b);
  });
  await test('ENG-03 client installé hier et jamais libéré : sa table reste bloquée (placement et installation)',async()=>{
   await ok(`insert into public.reservations(id,guest_name,party_size,starts_at,ends_at,status,seated_at,restaurant_id) values(${lit(res(6))},'Installé hier',2,now()-interval '26 hours',now()-interval '24 hours 30 minutes','seated',now()-interval '26 hours',${lit(A)});insert into public.reservation_tables(reservation_id,table_id,restaurant_id) values(${lit(res(6))},${lit(table(6))},${lit(A)});`);
   await fails(1,place(1,[[1,1,6]]),'23P01');
   await ok(`update public.reservation_tables set table_id=${lit(table(6))} where reservation_id=${lit(res(3))};`);
   await fails(1,seat(3),'encore occupée');
  });
  await test('ENG-04 Réception et autre établissement : refus 42501',async()=>{
   await fails(3,place(1,[[1,1,5]]),'42501');
   await fails(4,place(1,[[1,1,5]]),'42501');
   assert.deepEqual((await record(1)).tables,[table(1)]);
  });
  await test('ENG-05 réservation « arrived » d’un autre client non déplaçable',async()=>{
   await ok(`update public.reservations set status='arrived' where id=${lit(res(2))};`);
   await fails(1,place(1,[[1,1,2],[2,2,1,'arrived']]),'40001');
  });
  await test('ENG-06 fusion refusée par la RPC',async()=>{
   await ok(`insert into public.reservation_tables(reservation_id,table_id,restaurant_id) values(${lit(res(2))},${lit(table(7))},${lit(A)});`);
   await fails(1,place(1,[[1,1,2],[2,2,1]]),'40001');
  });
  await test('ENG-07 maintien actif d’un autre collaborateur sur la table d’arrivée',async()=>{
   const a=await record(1);
   await ok(`insert into public.table_holds(table_id,held_by,starts_at,ends_at,restaurant_id,draft_role) values(${lit(table(5))},${lit(user(2))},${lit(a.starts_at)},${lit(a.ends_at)},${lit(A)},'fb_admin');`);
   await fails(1,place(1,[[1,1,5]]),'23P01');
  });
  await test('ENG-08 état attendu périmé ou table d’origine changée : 40001, rien ne change',async()=>{
   await fails(1,place(1,[[1,1,2,'confirmed'],[2,2,1]]),'40001');
   await fails(1,place(1,[[1,3,2],[2,2,1]]),'40001');
   assert.deepEqual((await record(1)).tables,[table(1)]);assert.deepEqual((await record(2)).tables,[table(2)]);
  });
  await test('ENG-09 atomicité : l’échec de la 2e entrée annule la 1re',async()=>{
   await ok(`update public.reservations set status='confirmed' where id=${lit(res(2))};`);
   await fails(1,place(1,[[1,1,2],[2,2,1,'reserved']]),'40001');
   assert.deepEqual((await record(1)).tables,[table(1)]);assert.equal((await record(1)).status,'reserved');
  });
  await test('ENG-10 entrées invalides : plus de 8, doublons, cible absente',async()=>{
   await fails(1,place(1,Array.from({length:9},(_,i)=>[1,1,2])),'22023');
   await fails(1,place(1,[[2,2,1]]),'22023');
   await fails(1,place(1,[[1,1,2],[1,1,3]]),'22023');
  });
  await test('ENG-11a concurrence : 215 installé sur T2 par un collègue pendant l’échange → l’échange échoue',async()=>{
   const [a,b]=await concurrent(2,seat(2),1,place(1,[[1,1,2],[2,2,1]]));
   assert.equal(a.code,0,a.stderr);assert.notEqual(b.code,0,'l’échange doit échouer');assert.match(b.stderr,/40001/);
   const r1=await record(1),r2=await record(2);
   assert.equal(r2.status,'seated');assert.deepEqual(r2.tables,[table(2)]);assert.equal(r1.status,'reserved');assert.deepEqual(r1.tables,[table(1)]);
  });
  await test('ENG-11b [CONSTAT] échange d’abord, puis installation de 215 → sérialisées sans double occupation, mais 215 installé sur sa NOUVELLE table',async()=>{
   const [a,b]=await concurrent(1,place(1,[[1,1,2],[2,2,1]]),2,seat(2));
   assert.equal(a.code,0,a.stderr);assert.equal(b.code,0,b.stderr);
   const r1=await record(1),r2=await record(2);
   assert.deepEqual([r1.status,r1.tables,r2.status,r2.tables],['seated',[table(2)],'seated',[table(1)]]);
   findings.push('ENG-11b : change_reservation_status_v3 n’a pas de paramètre table. Si un collègue vient d’échanger 2 vers T1, une installation demandée « sur T2 » installe 2 sur T1 sans erreur (course entre deux pupitres). La façade le détecte (SEATED_ELSEWHERE) ; correctif serveur proposé : seat_reservation_v1.');
  });
  await test('ENG-12 concurrence : deux appareils placent deux clients sur la même table libre',async()=>{
   const [a,b]=await concurrent(1,place(1,[[1,1,5]]),2,place(3,[[3,3,5]]));
   assert.equal(a.code,0,a.stderr);assert.notEqual(b.code,0);assert.match(b.stderr,/23P01/);
   assert.equal(await ok(`select count(*) from public.reservation_tables where table_id=${lit(table(5))}`),'1');
  });
  await test('ENG-13 double appui (même requête rejouée) : la seconde est refusée sans effet',async()=>{
   await ok(ctx(1,place(1,[[1,1,2],[2,2,1]])));const after=await record(2);
   await fails(1,place(1,[[1,1,2],[2,2,1]]),'40001');
   assert.deepEqual(await record(2),after);
  });
  await test('ENG-14 passage : refusé sur une table réservée dans la durée du service',async()=>{
   await ok(`update public.restaurant_hours set lunch_enabled=true,dinner_enabled=false,lunch_start='00:00',lunch_end='23:59' where restaurant_id=${lit(A)};`);
   await ok(`update public.reservations set starts_at=now()+interval '30 minutes',ends_at=now()+interval '2 hours' where id=${lit(res(4))};`);
   await fails(1,`select public.install_walkin_group_v3(array[${lit(table(4))}]::uuid[],2,'Passage fictif','exterieur')`,'23P01|disponible|conflit|Conflit');
   const okId=await ok(ctx(1,`select public.install_walkin_group_v3(array[${lit(table(8))}]::uuid[],2,'Passage fictif','exterieur')`));
   assert.match(okId,/[0-9a-f-]{36}/);
  });
  await test('ENG-15 [CONSTAT] installation anticipée : la RPC ne compare que les créneaux prévus',async()=>{
   // Cas réel : client « 19:00 » (réservation 4) en retard, toujours attendu sur T8 jusqu'à maintenant+30 min.
   // Client « 20:30 » (réservation 1) installé dès maintenant sur T8 : les créneaux prévus ne se chevauchent pas.
   await ok(scenarioEarly);
   const r=await sql(ctx(1,place(1,[[1,1,8]])));
   findings.push('ENG-15 : apply_smart_placement_v3 '+(r.code===0?'ACCEPTE':'refuse')+' d’installer maintenant un client sur une table encore promise à un client attendu maintenant (comparaison sur starts_at/ends_at prévus). Le moteur JS RM-OPS refuse ce cas ; correctif serveur proposé (v4).');
   assert.equal(r.code,0,'comportement DEV actuel documenté : '+r.stderr);
  });
  await test('ENG-16 [CONSTAT] aucun journal auteur pour les permutations',async()=>{
   await ok(ctx(1,place(1,[[1,1,2],[2,2,1]])));
   const tables=await ok(`select string_agg(table_name,',' order by table_name) from information_schema.columns where table_schema='public' and column_name in ('actor_id','changed_by','performed_by') and table_name ~ '(reservation|placement)'`);
   findings.push('ENG-16 : aucune table d’historique des placements (colonnes acteur trouvées : '+(tables||'aucune')+'). Proposition : public.placement_events (v4).');
  });
  if(process.argv.includes('--with-proposals')){
   await ok(fs.readFileSync(path.join(root,'supabase/proposals/rm-ops-engine/20261126_rm_ops_engine_v4.PROPOSAL.sql'),'utf8'));
   console.log('INFO proposition v4 appliquée (base locale isolée uniquement)');
   const v4=(target,changes,seatNow=true,allowRoom=false)=>place(target,changes).replace('apply_smart_placement_v3','apply_smart_placement_v4').replace(/::jsonb\)$/,`::jsonb,${seatNow},${allowRoom})`);
   const events=async n=>Number(await ok(`select count(*) from public.placement_events where reservation_id=${lit(res(n))}`));
   await test('V4-01 échange + installation journalisés (acteur, tables, action)',async()=>{
    await ok(ctx(1,v4(1,[[1,1,2],[2,2,1]])));
    assert.equal((await record(1)).status,'seated');assert.equal(await events(1),1);assert.equal(await events(2),1);
    const row=JSON.parse(await ok(`select row_to_json(e) from public.placement_events e where reservation_id=${lit(res(1))}`));
    assert.equal(row.actor_id,user(1));assert.equal(row.action,'swap_seat');
   });
   await test('V4-02 installation anticipée sur une table promise à un client attendu maintenant : refusée (ENG-15 corrigé)',async()=>{
    await ok(scenarioEarly);
    const stderr=await fails(1,v4(1,[[1,1,8]]),'23P01');assert.match(stderr,/TABLE_CONFLICT/);
    assert.deepEqual((await record(1)).tables,[table(1)]);
   });
   await test('V4-03 changement de salle d’une réservation déplacée : refusé sauf accord explicite',async()=>{
    await ok(`insert into public.restaurant_rooms(id,name,restaurant_id) values('30000000-0000-4000-8000-000000000003','Terrasse fictive',${lit(A)});update public.restaurant_tables set room_id='30000000-0000-4000-8000-000000000003' where id=${lit(table(7))};`);
    // 1 va sur T2 ; 2 (T2) doit partir sur T7 (autre salle).
    const stderr=await fails(1,v4(1,[[1,1,2],[2,2,7]]),'22023');assert.match(stderr,/ROOM_CHANGE_REQUIRED/);
    await ok(ctx(1,v4(1,[[1,1,2],[2,2,7]],true,true)));assert.deepEqual((await record(2)).tables,[table(7)]);
   });
   await test('V4-04 réaffecter sans installer (préparation) : statuts inchangés',async()=>{
    await ok(ctx(1,v4(1,[[1,1,2],[2,2,1]],false)));
    const r1=await record(1),r2=await record(2);
    assert.deepEqual([r1.status,r1.tables,r2.status,r2.tables],['reserved',[table(2)],'reserved',[table(1)]]);
   });
   await test('V4-05 « les clients précédents sont partis ? » : libération + installation en une transaction',async()=>{
    await ok(`insert into public.reservations(id,guest_name,party_size,starts_at,ends_at,status,seated_at,restaurant_id) values(${lit(res(6))},'Précédent',2,now()-interval '2 hours',now()-interval '30 minutes','seated',now()-interval '2 hours',${lit(A)});insert into public.reservation_tables(reservation_id,table_id,restaurant_id) values(${lit(res(6))},${lit(table(6))},${lit(A)});`);
    await fails(1,`select public.seat_with_release_v1(${lit(res(3))},'reserved',${lit(table(6))},array[${lit(res(2))}]::uuid[])`,'40001');
    await ok(ctx(1,`select public.seat_with_release_v1(${lit(res(3))},'reserved',${lit(table(6))},array[${lit(res(6))}]::uuid[])`));
    const prev=await record(6),r3=await record(3);
    assert.equal(prev.status,'released');assert.ok(prev.released_at);assert.equal(r3.status,'seated');assert.deepEqual(r3.tables,[table(6)]);
    assert.equal(await ok(`select action from public.placement_events where reservation_id=${lit(res(6))}`),'released_by_reuse');
   });
   await test('V4-06 libération : jamais d’un autre client installé non désigné ; rollback complet en cas d’échec',async()=>{
    await ok(`insert into public.reservations(id,guest_name,party_size,starts_at,ends_at,status,seated_at,restaurant_id) values(${lit(res(6))},'Précédent',2,now()-interval '2 hours',now()-interval '30 minutes','seated',now()-interval '2 hours',${lit(A)}),(${lit(res(7))},'Autre installé',2,now()-interval '1 hour',now()+interval '30 minutes','seated',now()-interval '1 hour',${lit(A)});insert into public.reservation_tables(reservation_id,table_id,restaurant_id) values(${lit(res(6))},${lit(table(6))},${lit(A)}),(${lit(res(7))},${lit(table(6))},${lit(A)});`);
    const stderr=await fails(1,`select public.seat_with_release_v1(${lit(res(3))},'reserved',${lit(table(6))},array[${lit(res(6))}]::uuid[])`,'23P01');assert.match(stderr,/TARGET_OCCUPIED/);
    assert.equal((await record(6)).status,'seated');assert.equal((await record(3)).status,'reserved');
   });
   await test('V4-07 déplacement constaté d’un client installé : autorisé vers une table sans conflit, heure d’installation conservée',async()=>{
    await ok(ctx(1,seat(1)));const before=await record(1);
    await ok(`update public.reservations set starts_at=now()+interval '30 minutes',ends_at=now()+interval '120 minutes' where id=${lit(res(2))};`);
    await fails(1,`select public.move_seated_party_v1(${lit(res(1))},${lit(table(1))},${lit(table(2))})`,'23P01'); // T2 prévue pour 2 dans 30 min
    await ok(ctx(1,`select public.move_seated_party_v1(${lit(res(1))},${lit(table(1))},${lit(table(5))})`));
    const after=await record(1);assert.deepEqual(after.tables,[table(5)]);assert.equal(after.seated_at,before.seated_at);assert.equal(after.status,'seated');
    await ok(ctx(2,seat(2)));
    const stderr=await fails(1,`select public.move_seated_party_v1(${lit(res(1))},${lit(table(5))},${lit(table(2))})`,'23P01');assert.match(stderr,/TARGET_OCCUPIED/);
   });
   await test('V4-08 Réception et autre établissement refusés sur les 3 nouvelles RPC ; journal invisible hors Restaurant de l’établissement',async()=>{
    for(const who of [3,4]){
     await fails(who,v4(1,[[1,1,5]]),'42501');
     await fails(who,`select public.seat_with_release_v1(${lit(res(1))},'reserved',${lit(table(5))},array[${lit(res(2))}]::uuid[])`,'42501');
     await fails(who,`select public.move_seated_party_v1(${lit(res(1))},${lit(table(1))},${lit(table(5))})`,'42501|40001');
    }
    await ok(ctx(1,v4(1,[[1,1,5]])));
    const visible=async who=>(await ok(ctx(who,'select count(*) from public.placement_events'))).split('\n').pop();
    assert.equal(await visible(1),'1');assert.equal(await visible(3),'0');assert.equal(await visible(4),'0');
    await fails(1,`insert into public.placement_events(restaurant_id,reservation_id,actor_id,action) values(${lit(A)},${lit(res(1))},${lit(user(1))},'seat')`,'42501');
   });
   await test('V4-09 concurrence : libération+installation et échange simultanés sur la même table, sans double occupation',async()=>{
    await ok(`insert into public.reservations(id,guest_name,party_size,starts_at,ends_at,status,seated_at,restaurant_id) values(${lit(res(6))},'Précédent',2,now()-interval '2 hours',now()-interval '30 minutes','seated',now()-interval '2 hours',${lit(A)});insert into public.reservation_tables(reservation_id,table_id,restaurant_id) values(${lit(res(6))},${lit(table(6))},${lit(A)});`);
    const [a,b]=await concurrent(1,`select public.seat_with_release_v1(${lit(res(3))},'reserved',${lit(table(6))},array[${lit(res(6))}]::uuid[])`,2,v4(1,[[1,1,6]]));
    assert.equal(a.code,0,a.stderr);assert.notEqual(b.code,0);assert.match(b.stderr,/TARGET_OCCUPIED/);
    assert.equal(await ok(`select count(*) from public.reservations r join public.reservation_tables t on t.reservation_id=r.id where t.table_id=${lit(table(6))} and r.status='seated'`),'1');
   });
   await test('V4-10 seat_reservation_v1 : la table attendue est vérifiée ; course échange/installation refusée',async()=>{
    const seatAt=(n,tbl,expected='reserved')=>`select public.seat_reservation_v1(${lit(res(n))},${lit(expected)},${lit(table(tbl))})`;
    await fails(1,seatAt(2,1),'40001'); // 2 est sur T2, pas T1
    // Course : A échange 1↔2 (2 part sur T1) pendant que B installe 2 « sur T2 » → B refusé, 2 reste à placer.
    const [a,b]=await concurrent(1,v4(1,[[1,1,2],[2,2,1]]),2,seatAt(2,2));
    assert.equal(a.code,0,a.stderr);assert.notEqual(b.code,0);assert.match(b.stderr,/40001/);
    assert.deepEqual([(await record(2)).status,(await record(2)).tables],['reserved',[table(1)]]);
    await ok(ctx(2,seatAt(2,1)));assert.equal((await record(2)).status,'seated');
    assert.equal(await ok(`select action from public.placement_events where reservation_id=${lit(res(2))} order by id desc limit 1`),'seat');
   });
   await test('V4-11 seat_reservation_v1 : installation anticipée sur une table promise à un client en retard refusée',async()=>{
    await ok(scenarioEarly);
    await ok(`update public.reservation_tables set table_id=${lit(table(8))} where reservation_id=${lit(res(1))};`);
    const stderr=await fails(1,`select public.seat_reservation_v1(${lit(res(1))},'reserved',${lit(table(8))})`,'23P01');assert.match(stderr,/TABLE_CONFLICT|TARGET_OCCUPIED/);
   });
  }
  console.log('\n'+count+' cas PostgreSQL réussis.');
  if(findings.length)console.log('CONSTATS\n- '+findings.join('\n- '));
 }catch(error){
  console.error(error);process.exitCode=1;
 }finally{
  if(local)stopLocal();else await run('docker',['--host=unix:///var/run/docker.sock','rm','-f',container]).catch(()=>{});
 }
})();

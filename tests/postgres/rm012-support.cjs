'use strict';
// All SQL runs in a network-disabled disposable PostgreSQL. No hosted credentials.
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),image='postgres:17-bookworm@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994';
const migration=fs.readdirSync(path.join(root,'supabase/migrations')).find(f=>f.endsWith('_rm012_intelligent_closeout.sql'));
const uid=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
const rid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const booking=n=>'50000000-0000-4000-8000-'+String(n).padStart(12,'0');
const lit=v=>v===null||v===undefined?'null':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
async function start({applyMigration=true,withPolicy=false}={}){
 const container='rm012-tests-'+process.pid+'-'+Math.random().toString(16).slice(2,8),env={...process.env};
 for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[key];
 async function docker(args,input='',onData){return new Promise((resolve,reject)=>{
  const p=spawn('docker',['--host=unix:///var/run/docker.sock',...args],{env});let stdout='',stderr='';
  const timeout=setTimeout(()=>{p.kill();reject(Error('RM-012 isolated database timeout'))},45000);
  p.stdout.on('data',b=>{stdout+=b;onData?.(stdout)});p.stderr.on('data',b=>stderr+=b);p.on('error',reject);p.on('close',code=>{clearTimeout(timeout);resolve({code,stdout,stderr})});p.stdin.end(input);
 })}
 async function sql(query,onData){return docker(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U','postgres','-d','rm012'],query,onData)}
 async function ok(query){const r=await sql(query);assert.equal(r.code,0,r.stderr);return r.stdout.trim()}
 const ctx=(user,query,role='authenticated')=>`begin;set local role ${role};select set_config('request.jwt.claim.sub',${lit(uid(user))},true);${query};commit;`;
 async function json(query){return JSON.parse((await ok(query)).split('\n').at(-1))}
 const stop=()=>docker(['rm','-f',container]);
 try{
  const r=await docker([withPolicy?'create':'run',...(withPolicy?[]:['-d']),'--name',container,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','--label','restomanager.mission=rm012-isolated','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=rm012',...(withPolicy?['--mount','type=bind,src='+path.join(root,'tests/postgres/rm012-cron-init.sql')+',dst=/docker-entrypoint-initdb.d/rm012-cron.sql,readonly']:[]),image,...(withPolicy?['postgres','-c','shared_preload_libraries=pg_cron','-c','cron.database_name=rm012','-c','cron.use_background_workers=on']:[])]);assert.equal(r.code,0,r.stderr);
  if(withPolicy){
   const {execFileSync}=require('node:child_process'),folder=execFileSync('bash',[path.join(root,'tests/postgres/prepare-rm012-cron.sh')],{encoding:'utf8',env}).trim();
   for(const [src,dest] of [[folder+'/usr/lib/postgresql/17/lib/pg_cron.so','/usr/lib/postgresql/17/lib/pg_cron.so'],[folder+'/usr/share/postgresql/17/extension/.','/usr/share/postgresql/17/extension/']]){const copy=await docker(['cp',src,container+':'+dest]);assert.equal(copy.code,0,copy.stderr)}
   const launched=await docker(['start',container]);assert.equal(launched.code,0,launched.stderr);
  }
  let ready=false;for(let i=0;i<100;i++){const r=await docker(['logs',container]);if((r.stdout+r.stderr).includes('PostgreSQL init process complete; ready for start up.')){ready=true;break}await new Promise(resolve=>setTimeout(resolve,100))}if(!ready){const logs=await docker(['logs',container]);throw Error('Disposable PostgreSQL did not start: '+logs.stdout+'\n'+logs.stderr)}
  const apply=file=>ok(fs.readFileSync(path.join(root,file),'utf8'));
  await apply('tests/postgres/fixture.sql');
  for(const file of ['mission2_reservation_edits.sql','mission3_validation_integration.sql','reception_right_size_recommendations.sql','platform_owner_foundation.sql','bug01_private_reports.sql'])await apply('supabase/scripts/'+file);
  await ok("create role service_role nologin bypassrls;grant anon,authenticated,resto_service_writer to postgres;");
  await apply('tests/postgres/dev-snapshot-20261110.sql');
  // Test catalog bridge for columns introduced after the read-only November 10 fixture.
  await ok('alter table public.restaurant_hours add column saturday_lunch_closed boolean not null default false,add column sunday_lunch_closed boolean not null default false,add column arrival_limit_percent integer not null default 60;');
  await apply('supabase/migrations/20261112211500_weekly_schedule_dev.sql');
  await apply('supabase/migrations/20261112212500_weekly_hours_rls_dev.sql');
  await ok('set check_function_bodies=on;');
  const body=fs.readFileSync(path.join(root,'supabase/migrations',migration),'utf8');
  if(applyMigration){await ok(body);await ok(body)}
  const policyMigration=fs.readdirSync(path.join(root,'supabase/migrations')).find(f=>f.endsWith('_rm012_activation_and_automatic_close.sql'));
  const policyBody=withPolicy?fs.readFileSync(path.join(root,'supabase/migrations',policyMigration),'utf8'):null;
  if(withPolicy){assert.ok(applyMigration);await ok(policyBody);await ok(policyBody)}
  async function clock(value='2032-11-08T10:00:00Z'){assert.ok(/^\d{4}-\d{2}-\d{2}T[\d:]+Z$/.test(value));await ok(`create or replace function private.rm012_now() returns timestamptz language sql volatile security invoker set search_path='' as $$select ${lit(value)}::timestamptz$$;`)}
  async function reset(){
   await ok('truncate public.service_closures'+(applyMigration?',public.service_regularization_audit':'')+';');
   const plan=Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{lunch:{enabled:true,start:'12:00',end:'14:30'},dinner:{enabled:true,start:'19:00',end:'21:30'}}]));
   const seed=fs.readFileSync(path.join(root,'tests/postgres/seed.sql'),'utf8').replace('update public.restaurant_hours set lunch_enabled=true,dinner_enabled=true;',`update public.restaurant_hours set lunch_enabled=true,dinner_enabled=true,weekly_schedule=${lit(JSON.stringify(plan))}::jsonb;`);
   await ok(seed);
   await ok(`update public.reservations set starts_at='2032-11-07T18:00:00Z',ends_at='2032-11-07T19:00:00Z',status=case when id=${lit(booking(1))} then 'seated' when id=${lit(booking(2))} then 'confirmed' when id=${lit(booking(3))} then 'arrived' else 'reserved' end;
    update public.reservations set starts_at='2032-11-08T11:30:00Z',ends_at='2032-11-08T12:30:00Z' where id=${lit(booking(4))};
    update public.restaurant_tables set label='Table '||label;`);
   if(applyMigration)await clock();
  }
  async function snapshot(user){return json(ctx(user,`select jsonb_build_object('revision',public.service_sync_state_v1()->>'revision','capabilities',public.service_sync_state_v1()->'capabilities','serverTime',public.service_sync_state_v1()->'server_time',
   'reservations',(select coalesce(jsonb_agg(r),'[]') from public.reservations r),'assignments',(select coalesce(jsonb_agg(r),'[]') from public.reservation_tables r),'rooms',(select coalesce(jsonb_agg(r),'[]') from public.restaurant_rooms r),'tables',(select coalesce(jsonb_agg(r),'[]') from public.restaurant_tables r),'holds',(select coalesce(jsonb_agg(r),'[]') from (select id,table_id,draft_role,held_by,starts_at,ends_at,expires_at,created_at from public.table_holds) r),'fusionLinks',(select coalesce(jsonb_agg(r),'[]') from (select table_a,table_b from public.table_fusion_links) r),'hours',(select to_jsonb(r) from public.restaurant_hours r limit 1))`))}
  async function rpc(name,args,user=1){
   assert.ok(['rm012_services_v1','rm012_regularize_v1','rm012_close_v1','close_service_v3'].includes(name));
   const r=await sql(ctx(user,'select public.'+name+'('+Object.entries(args).map(([k,v])=>{assert.match(k,/^p_[a-z_]+$/);return k+'=>'+lit(v)}).join(',')+')'));
   if(r.code){const match=r.stderr.match(/ERROR:\s+([A-Z0-9]{5}):\s*([^\n]+)/);return {data:null,error:{code:match?.[1]||'SQL',message:match?.[2]||r.stderr}}}
   return {data:JSON.parse(r.stdout.trim().split('\n').at(-1)),error:null};
  }
  await reset();
  return {container,docker,sql,ok,json,ctx,clock,reset,rpc,snapshot,stop,body,migration,policyBody,policyMigration};
 }catch(error){await stop();throw error}
}
module.exports={start,uid,rid,booking,lit};

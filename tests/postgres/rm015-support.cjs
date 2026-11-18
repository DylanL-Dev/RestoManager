'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {start:baseStart}=require('./rm012-support.cjs');
async function start(){
 const base=await baseStart();
 const migration=fs.readdirSync(path.resolve(__dirname,'../../supabase/migrations')).find(f=>f.endsWith('_rm015_secure_public_booking.sql'));
 const body=fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',migration),'utf8');
 let preservedFunctions;
 try{
  const before=await base.json("select jsonb_agg(jsonb_build_object('oid',p.oid,'name',p.oid::regprocedure::text,'owner',p.proowner,'config',p.proconfig,'definer',p.prosecdef,'anon',has_function_privilege('anon',p.oid,'execute'),'authenticated',has_function_privilege('authenticated',p.oid,'execute'),'service_role',has_function_privilege('service_role',p.oid,'execute')) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' and (p.prosrc ~ 'held_by[[:space:]]*<>' or p.proname in ('staff_restaurant','ranked_booking_sets','rm012_sync_api'))");
  await base.ok(body);await base.ok(body);
  const ids=before.map(f=>Number(f.oid)).join(',');
  const after=await base.json("select jsonb_agg(jsonb_build_object('oid',p.oid,'name',p.oid::regprocedure::text,'owner',p.proowner,'config',p.proconfig,'definer',p.prosecdef,'anon',has_function_privilege('anon',p.oid,'execute'),'authenticated',has_function_privilege('authenticated',p.oid,'execute'),'service_role',has_function_privilege('service_role',p.oid,'execute')) order by p.oid) from pg_proc p where p.oid in ("+ids+")");
  assert.deepEqual(after,before,'Legacy identity, ownership, search_path and existing role grants are preserved');preservedFunctions=before.map(f=>f.name);
 }catch(e){await base.stop();throw e}
 const lit=v=>v===null?'null':"'"+String(v).replaceAll("'","''")+"'";
 async function rpc(name,action,payload={},user=null){
  assert.ok(['rm015_gateway_v1','rm015_staff_v1','rm015_mail_v1'].includes(name));
  const statement='select public.'+name+'('+lit(action)+','+lit(JSON.stringify(payload))+'::jsonb)';
  const query=user===null?`begin;set local role service_role;select set_config('request.jwt.claim.sub','',true);${statement};commit;`:base.ctx(user,statement);
  const r=await base.sql(query);if(r.code){const m=r.stderr.match(/ERROR:\s+([A-Z0-9]{5}):\s*([^\n]+)/);return {data:null,error:{code:m?.[1],message:m?.[2],details:r.stderr.match(/DETAIL:\s*([^\n]+)/)?.[1]||r.stderr}}}
  return {data:JSON.parse(r.stdout.trim().split('\n').at(-1)),error:null};
 }
 async function backendRpc(name,args){
  if(name!=='rm015_rate_v1')return rpc(name,args.p_action,args.p_payload);
  const r=await base.sql(`begin;set local role service_role;select set_config('request.jwt.claim.sub','',true);select public.rm015_rate_v1(${lit(args.p_key)},${lit(args.p_bucket)},${Number(args.p_limit)},${Number(args.p_seconds)});commit;`);
  return r.code?{data:null,error:{code:'SQL',details:r.stderr}}:{data:JSON.parse(r.stdout.trim().split('\n').at(-1)),error:null};
 }
 return {...base,rpc,backendRpc,closeoutRpc:base.rpc,migration,body,lit,preservedFunctions};
}
module.exports={start};

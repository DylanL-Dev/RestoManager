'use strict';
// RM-020.5 — synthetic public DEV checks. No credentials, writes or access to production.
const ORIGIN='https://restomanager-v3-supabase-integration.onrender.com';
const targets=Object.freeze([
 {id:'release',path:'/app-release.json?check=rm0205',validate:async r=>{const j=await r.json();return j?.schema===1&&j.channel==='dev'&&typeof j.currentVersion==='string'&&j.currentVersion.length>0}},
 {id:'creator',path:'/creator.html?check=rm0205',validate:async r=>{const h=await r.text();return h.includes('id="ownerPanel"')&&h.includes('id="loginPanel"')}},
 {id:'icons',path:'/lucide-local.js?check=rm0205',validate:async r=>{const s=await r.text();return s.includes("const VERSION='1.79.0'")&&s.includes('createIcons')}}
]);
async function check(target,{fetcher=globalThis.fetch,now=Date.now,timeoutMs=8000}={}){
 const start=now();const controller=new AbortController();
 let timer;
 let httpStatus=null;
 try{
  const ok=await Promise.race([
   (async()=>{const response=await fetcher(ORIGIN+target.path,{method:'GET',cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});httpStatus=response.status;if(!response.ok)return false;return Boolean(await target.validate(response));})(),
   new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('timeout'))},timeoutMs)})
  ]);
  return {id:target.id,state:ok?'ok':'invalid_response',httpStatus,elapsedMs:Math.max(0,now()-start)};
 }catch{return {id:target.id,state:'unverified',httpStatus,elapsedMs:Math.max(0,now()-start)}}
 finally{clearTimeout(timer)}
}
async function runProbe(options={}){
 const results=await Promise.all(targets.map(target=>check(target,options)));
 return {schema:1,channel:'dev',scope:'public_http_only',checkedAt:new Date().toISOString(),state:results.every(r=>r.state==='ok')?'ok':'degraded_or_unverified',results};
}
if(require.main===module)runProbe().then(result=>{console.log(JSON.stringify(result));process.exitCode=result.state==='ok'?0:1}).catch(()=>{console.log(JSON.stringify({schema:1,channel:'dev',state:'unverified'}));process.exitCode=1});
module.exports={ORIGIN,runProbe};

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {ORIGIN,runProbe}=require('../scripts/rm0205-dev-probe.cjs');
const response=(body,status=200)=>new Response(body,{status});
test('RM-020.5 DEV probe only calls fixed public DEV GET paths and validates content',async()=>{
 const calls=[];const result=await runProbe({fetcher:async(url,opts)=>{
  calls.push([url,opts]);return url.includes('app-release')?response(JSON.stringify({schema:1,channel:'dev',currentVersion:'dev'})):url.includes('creator.html')?response('<div id="ownerPanel"></div><div id="loginPanel"></div>'):response("const VERSION='1.79.0'; function createIcons(){}");
 }});
 assert.equal(result.state,'ok');assert.equal(calls.length,3);
 for(const [url,opts] of calls){assert.equal(new URL(url).origin,ORIGIN);assert.equal(opts.method,'GET');assert.equal(opts.credentials,'omit');assert.equal(opts.redirect,'error');assert.equal(opts.cache,'no-store');}
});
test('RM-020.5 wrong environment, HTTP errors and network rejection cannot become healthy',async()=>{
 const r=await runProbe({fetcher:async url=>{if(url.includes('app-release'))return response(JSON.stringify({schema:1,channel:'prod',currentVersion:'x'}));if(url.includes('creator'))return response('error',503);throw Error('private error');}});
 assert.equal(r.state,'degraded_or_unverified');assert.deepEqual(r.results.map(x=>x.state),['invalid_response','invalid_response','unverified']);assert.ok(!JSON.stringify(r).includes('private error'));
});
test('RM-020.5 timeout fails closed even if fetch does not resolve',async()=>{
 const r=await runProbe({timeoutMs:10,fetcher:()=>new Promise(()=>{})});assert.equal(r.state,'degraded_or_unverified');assert.ok(r.results.every(x=>x.state==='unverified'));
});

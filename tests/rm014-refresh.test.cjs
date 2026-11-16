'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync('service-v3-refresh.js','utf8');
function fixture(options={}){
 const calls=[],flags={dirty:false,busy:false},win={location:{href:'https://fixture.invalid/v3-connected.html#tables',replace:url=>calls.push(['reload',url])}};
 win.RestoScreens={hasUnsavedChanges:()=>flags.dirty,confirmLeaveForRefresh:async opts=>{calls.push(['guard',opts]);options.afterGuard?.(flags);return options.confirm!==false}};
 win.RestoBookingDraft={checking:()=>flags.busy,close:async()=>{calls.push(['hold']);if(options.closeError)throw Error('Hold release failed');options.afterClose?.(flags)}};
 win.RestoEditNavigation={isBusy:()=>options.editBusy};win.RestoDialog={alert:async(message)=>calls.push(['alert',message])};
 win.RestoAppRelease={check:async()=>calls.push(['release-check']),availableVersion:()=>options.version||null};
 const navigator={onLine:options.online!==false};
 if(options.workerResult!==undefined||options.afterRegistration){
  navigator.serviceWorker={addEventListener(){},getRegistration:async()=>{options.afterRegistration?.(flags);return options.workerResult===undefined?null:{update:async()=>calls.push(['registration-update']),active:{postMessage(data,ports){calls.push(['worker',data.type]);ports[0].postMessage({ok:options.workerResult})}}}}};
 }
 vm.runInNewContext(code,{window:win,navigator,document:{getElementById:()=>null,querySelector:()=>null},URL,MessageChannel,setTimeout,clearTimeout});
 return {request:win.RestoAppRefresh.request,calls,flags};
}
test('clean refresh uses RM-011-A guard before closing the hold and reloading once',async()=>{
 const f=fixture();assert.equal(await f.request(),true);assert.deepEqual(f.calls.map(c=>c[0]),['guard','hold','reload']);assert.match(f.calls[2][1],/refresh=/);
});
test('cancelled refresh preserves the form and does not release its hold',async()=>{
 const f=fixture({confirm:false});assert.equal(await f.request(),false);assert.deepEqual(f.calls.map(c=>c[0]),['guard']);
});
test('application update asks the exact shared guard to preserve a draft, without discard',async()=>{
 const f=fixture({confirm:false});await f.request({kind:'update'});assert.equal(f.calls[0][1].preserveDraft,true);assert.equal(f.calls.length,1);
});
test('booking verification/submission or editor saving blocks any reload',async()=>{
 const f=fixture();f.flags.busy=true;assert.equal(await f.request(),false);assert.deepEqual(f.calls.map(c=>c[0]),['alert']);
 const e=fixture({editBusy:true});assert.equal(await e.request({kind:'update'}),false);assert.deepEqual(e.calls.map(c=>c[0]),['alert']);
});
test('offline update is postponed before any hold change',async()=>{
 const f=fixture({online:false});assert.equal(await f.request({kind:'update'}),false);assert.ok(!f.calls.some(c=>c[0]==='hold'||c[0]==='reload'));
});
test('a stale or unverified published version never reloads',async()=>{
 const f=fixture({version:'other'});assert.equal(await f.request({kind:'update',expectedVersion:'wanted'}),false);assert.ok(!f.calls.some(c=>c[0]==='hold'||c[0]==='reload'));
});
test('saisie becoming dirty during guard or worker lookup survives',async()=>{
 for(const opts of [{afterGuard:flags=>flags.dirty=true},{afterRegistration:flags=>flags.dirty=true}]){
  const f=fixture(opts);assert.equal(await f.request({kind:'update'}),false);assert.ok(!f.calls.some(c=>c[0]==='hold'||c[0]==='reload'));
 }
});
test('a failed hold release never reloads or clears caches',async()=>{
 const f=fixture({closeError:true});assert.equal(await f.request(),false);assert.ok(f.calls.some(c=>c[0]==='hold'));assert.ok(!f.calls.some(c=>c[0]==='reload'));
});
test('another tab refusing the worker check blocks activation and hold release',async()=>{
 const f=fixture({workerResult:false});assert.equal(await f.request({kind:'update'}),false);assert.ok(f.calls.some(c=>c[0]==='worker'));assert.ok(!f.calls.some(c=>c[0]==='reload'||c[0]==='hold'));
});
test('concurrent clicks cannot duplicate reload/hold release',async()=>{
 const f=fixture();await Promise.all([f.request(),f.request()]);assert.equal(f.calls.filter(c=>c[0]==='reload').length,1);assert.equal(f.calls.filter(c=>c[0]==='hold').length,1);
});
test('operation starting during hold release prevents the final page replacement',async()=>{
 const f=fixture({afterClose:flags=>flags.busy=true});assert.equal(await f.request({kind:'update'}),false);assert.ok(!f.calls.some(c=>c[0]==='reload'));
});

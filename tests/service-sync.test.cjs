const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../service-sync.js'),'utf8');
const modulePromise=import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function client({revisions=['1','1'],count=5,failAt,serverLimit=Infinity}={}){
 let reads=0;const calls=[];
 const api={calls,async rpc(name){assert.equal(name,'service_sync_state_v1');return {data:{revision:revisions[Math.min(reads++,revisions.length-1)],server_time:'2030-01-01T00:00:00Z',capabilities:{reservation_edits:4,booking_recovery:1,snapshot:1}}}},from(name){let columns,orders=[];return {
  select(value){columns=value;return this},order(value){orders.push(value);return this},async range(start,end){
   calls.push({name,columns,orders,start,end});
   if(name===failAt)return {error:{code:'42501'}};
   const total=name==='restaurant_hours'?1:count;
   return {count:total,data:Array.from({length:Math.max(0,Math.min(end+1,total,start+serverLimit)-start)},(_,i)=>({id:start+i}))};
  }
 }}};return api;
}
test('all seven collections paginate beyond the API row limit with stable ordering',async()=>{
 const {readRevisionSnapshot,canWrite}=await modulePromise,c=client();
 const snapshot=await readRevisionSnapshot(c,{pageSize:2});
 for(const name of ['reservations','assignments','rooms','tables','holds','fusionLinks'])assert.equal(snapshot[name].length,5);
 assert.equal(snapshot.hours.id,0);assert.equal(snapshot.revision,'1');assert.equal(canWrite(snapshot.capabilities),true);
 assert.equal(canWrite({reservation_edits:3,booking_recovery:1,snapshot:1}),false);
 assert.equal(new Set(c.calls.map(c=>c.name)).size,7);
 assert.ok(c.calls.every(c=>c.orders.length>0));
 assert.deepEqual(c.calls.find(c=>c.name==='restaurant_rooms').orders,['sort_order','id']);
 assert.deepEqual(c.calls.find(c=>c.name==='reservations').orders,['starts_at','id']);
 assert.ok(c.calls.filter(c=>c.name==='table_holds').every(c=>!c.columns.includes('owner_token')));
});
test('a server row cap smaller than the requested page cannot truncate history or availability',async()=>{
 const {readRevisionSnapshot}=await modulePromise,c=client({count:103,serverLimit:7});
 const snapshot=await readRevisionSnapshot(c,{pageSize:500});
 assert.equal(snapshot.reservations.length,103);assert.equal(snapshot.assignments.length,103);
 assert.equal(snapshot.tables.length,103);assert.equal(snapshot.reservations.at(-1).id,102);
 const pages=c.calls.filter(x=>x.name==='reservations');assert.equal(pages[1].start,7);
});
test('a changed revision discards every page and retries the entire snapshot',async()=>{
 const {readRevisionSnapshot}=await modulePromise,c=client({revisions:['1','2','2','2'],count:1});
 const snapshot=await readRevisionSnapshot(c,{pageSize:2});
 assert.equal(snapshot.revision,'2');assert.equal(c.calls.filter(c=>c.name==='reservations').length,2);
});
test('revision churn is bounded at three complete attempts and publishes no mixed snapshot',async()=>{
 const {readRevisionSnapshot}=await modulePromise,c=client({revisions:['1','2','3','4','5','6'],count:1});
 await assert.rejects(readRevisionSnapshot(c,{pageSize:2}),{code:'SYNC_BUSY'});
 assert.equal(c.calls.filter(c=>c.name==='reservations').length,3);
});
test('one failed collection rejects the snapshot, never substituting empty availability',async()=>{
 const {readRevisionSnapshot}=await modulePromise;
 await assert.rejects(readRevisionSnapshot(client({failAt:'reservations'})),{code:'42501'});
});

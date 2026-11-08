const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const code=fs.readFileSync(require.resolve('../supabase-service-bridge.js'),'utf8');
const source=code.slice(code.indexOf('export async function subscribeSharedService(')).replace('export async function','async function');
async function fixture(failures=1,code='SYNC_BUSY'){
 const channels=[],timeouts=new Map(),events={},snapshots=[],errors=[];let requests=0,id=0,poll;
 const supabase={channel(){const ch={on(_e,_f,fn){this.event=fn;return this},subscribe(fn){this.status=fn;return this}};channels.push(ch);return ch},removeChannel:async()=>{}};
 const network={onLine:true},window={addEventListener(k,f){events[k]=f},removeEventListener(k){delete events[k]}},document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
 const subscribe=new Function('supabase','window','document','navigator','setInterval','clearInterval','setTimeout','clearTimeout','loadSharedService','requireStaff','tables',source+';return subscribeSharedService;')(
  supabase,window,document,network,f=>(poll=f,1),()=>{},(fn,delay)=>{timeouts.set(++id,{fn,delay});return id},n=>timeouts.delete(n),async()=>{if(++requests<=failures)throw Object.assign(Error('Transient snapshot'),{code});return {syncSequence:requests}},async()=>{},['reservations']);
 const stop=await subscribe(s=>snapshots.push(s),e=>errors.push(e.code));
 const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve()};
 async function fire(){const [key,item]=timeouts.entries().next().value;timeouts.delete(key);item.fn();await settle()}
 return {channels,network,events,snapshots,errors,timeouts,stop,settle,fire,poll:()=>poll(),requests:()=>requests};
}
test('SYNC_BUSY retries after a bounded delay and recovers without any new DB or visibility event',async()=>{
 const t=await fixture();t.channels[0].status('SUBSCRIBED');await t.settle();
 assert.equal(t.requests(),1);assert.equal(t.timeouts.size,1);assert.equal([...t.timeouts.values()][0].delay,1000);
 t.channels[0].event();await t.settle();assert.equal(t.requests(),1,'events during backoff do not create a hot loop');
 await t.fire();assert.equal(t.requests(),2);assert.equal(t.snapshots.length,1);assert.equal(t.timeouts.size,0);t.stop();
});
test('retry bursts stop after 1/2/4 seconds; low frequency failed-snapshot polling still recovers a healthy socket',async()=>{
 const t=await fixture(4,'503');t.channels[0].status('SUBSCRIBED');await t.settle();
 for(const delay of [1000,2000,4000]){assert.equal([...t.timeouts.values()][0].delay,delay);await t.fire()}
 assert.equal(t.requests(),4);assert.equal(t.timeouts.size,0);assert.equal(t.snapshots.length,0);
 t.poll();await t.settle();assert.equal(t.requests(),5);assert.equal(t.snapshots.length,1);t.stop();
});
test('offline, replaced channel and stop invalidate pending retry callbacks',async()=>{
 const t=await fixture(1);t.channels[0].status('SUBSCRIBED');await t.settle();
 const stale=[...t.timeouts.values()][0].fn;t.network.onLine=false;t.events.offline();assert.equal(t.timeouts.size,0);
 stale();await t.settle();assert.equal(t.requests(),1);
 t.network.onLine=true;t.events.online();t.channels[1].status('SUBSCRIBED');await t.settle();assert.equal(t.requests(),2);
 stale();await t.settle();assert.equal(t.requests(),2);t.stop();assert.equal(t.timeouts.size,0);
});
test('permission and schema contract errors are not retried automatically as transient network failures',async()=>{
 for(const code of ['42501','PGRST301','SYNC_CONTRACT']){
  const t=await fixture(4,code);t.channels[0].status('SUBSCRIBED');await t.settle();assert.equal(t.timeouts.size,0);t.poll();await t.settle();assert.equal(t.requests(),1);t.stop();
 }
});

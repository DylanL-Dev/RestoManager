'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../supabase-service-bridge.js'),'utf8');
const source=code.slice(code.indexOf('export async function subscribeSharedService(')).replace('export async function','async function');
if(!source.startsWith('async function subscribeSharedService('))throw Error('Subscription source missing');
async function setup(){
 const channels=[],removed=[],win=new Map(),doc=new Map(),statuses=[],errors=[],snapshots=[];
 const supabase={
  channel(name){const ch={name,callback:null,on(event,filter,cb){this.event=cb;return this},subscribe(cb){this.callback=cb;return this}};channels.push(ch);return ch},
  removeChannel(ch){removed.push(ch);return Promise.resolve()}
 };
 const w={addEventListener(k,cb){win.set(k,cb)},removeEventListener(k){win.delete(k)}};
 const d={visibilityState:'visible',addEventListener(k,cb){doc.set(k,cb)},removeEventListener(k){doc.delete(k)}};
 const network={onLine:true};let sequence=0;
 const fn=new Function('supabase','window','document','navigator','setInterval','clearInterval','loadSharedService','requireStaff','tables',source+';return subscribeSharedService;');
 const subscribe=fn(supabase,w,d,network,()=>1,()=>{},async()=>({syncSequence:++sequence}),async()=>true,['reservations','reservation_tables']);
 const stop=await subscribe(s=>snapshots.push(s.syncSequence),e=>errors.push(e.code),s=>statuses.push(s));
 const settle=async()=>{for(let i=0;i<16;i++)await Promise.resolve()};
 return {channels,removed,win,doc,statuses,errors,snapshots,network,stop,settle};
}
test('reconnects after a websocket error, without keeping old channels',async()=>{
 const t=await setup();
 t.channels[0].callback('SUBSCRIBED');await t.settle();
 assert.deepEqual(t.snapshots,[1]);
 t.channels[0].callback('CHANNEL_ERROR');
 assert.equal(t.statuses.at(-1),false);
 t.win.get('online')();
 assert.equal(t.channels.length,2);
 assert.equal(t.removed.length,1);
 t.channels[1].callback('SUBSCRIBED');await t.settle();
 assert.deepEqual(t.snapshots,[1,2]);
 t.stop();
 assert.equal(t.removed.length,2);
 assert.equal(t.doc.size,0);
 assert.equal(t.win.size,0);
});
test('offline mode disables updates and online mode takes a fresh snapshot',async()=>{
 const t=await setup();
 t.channels[0].callback('SUBSCRIBED');await t.settle();
 t.network.onLine=false;
 t.win.get('offline')();
 assert.equal(t.statuses.at(-1),false);
 t.network.onLine=true;
 t.win.get('online')();
 assert.equal(t.channels.length,2);
 t.channels[1].callback('SUBSCRIBED');await t.settle();
 assert.deepEqual(t.snapshots,[1,2]);
 t.stop();
});

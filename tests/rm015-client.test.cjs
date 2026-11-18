'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../reservation/client.mjs');
const draft={party:2,date:'2032-11-08',time:'19:00',service:'dinner'};
const record={reference:'WEB-ABCDEF123456',state:'draft',version:1,draft,canModify:false,canCancel:false};
function options(extra={}){const values=new Map();return {endpoint:'/api',base:'https://public.example.test/reservation/live.html',restaurant:'fictional',storage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},...extra};}
test('Connected client refuses cross-origin APIs unless the exact HTTPS origin is approved',async()=>{
 const {createBookingClient}=await load();assert.throws(()=>createBookingClient(options({endpoint:'https://other.example.test/api'})));assert.throws(()=>createBookingClient(options({endpoint:'http://other.example.test/api',allowedOrigin:'http://other.example.test'})));
});
test('Unavailable session storage blocks a real hold before any network write',async()=>{
 const {createBookingClient}=await load();let writes=0;const api=createBookingClient(options({storage:{getItem(){throw Error()},setItem(){throw Error()},removeItem(){throw Error()}},fetcher:()=>{writes++;throw Error()}}));await assert.rejects(api.hold(draft),{code:'STORAGE'});assert.equal(writes,0);
});
test('A lost hold response persists only the proof and recovers the authoritative server result',async()=>{
 const {createBookingClient}=await load();const env=options(),calls=[];const fetcher=async(_,init)=>{calls.push(JSON.parse(init.body));if(calls.length===1)throw Error('lost');return new Response(JSON.stringify({data:record}))};
 const first=createBookingClient({...env,fetcher});await assert.rejects(first.hold(draft),{uncertain:true});const second=createBookingClient({...env,fetcher});assert.equal(second.hasPending(),true);assert.deepEqual(await second.recover(),record);assert.equal(calls[0].key,calls[1].key);assert.equal(calls[0].proof,calls[1].proof);assert.ok(!JSON.stringify(env.storage.getItem('rm0152:pending:fictional')).includes('firstName'));
});
test('A malformed or failed server response never becomes a local confirmation',async()=>{
 const {createBookingClient}=await load();for(const response of [new Response('broken'),new Response(JSON.stringify({data:null})),new Response(JSON.stringify({error:{code:'UNAVAILABLE'}}),{status:503})]){
  const api=createBookingClient(options({fetcher:async()=>response}));await assert.rejects(api.hold(draft),{uncertain:true});
 }
 const api=createBookingClient(options());assert.throws(()=>api.record({...record,state:'invented'}));assert.throws(()=>api.record({...record,version:null}));
});
test('Repeated confirmation after a lost response uses the original operation and version',async()=>{
 const {createBookingClient}=await load();const submitted=[],api=createBookingClient(options({fetcher:async(_,init)=>{const value=JSON.parse(init.body);if(value.action==='submit'){submitted.push(value);if(submitted.length===1)throw Error('lost')}return new Response(JSON.stringify({data:record}));}}));await api.hold(draft);await assert.rejects(api.submit(draft,{email:'fictif@example.test'},1));await api.submit(draft,{email:'fictif@example.test'},1);assert.equal(submitted[0].operation,submitted[1].operation);assert.equal(submitted[0].version,submitted[1].version);
});
test('A failed uncommitted hold retries its original proof when recovery finds no record',async()=>{
 const {createBookingClient}=await load();const calls=[],api=createBookingClient(options({fetcher:async(_,init)=>{const p=JSON.parse(init.body);calls.push(p);if(calls.length===1)return new Response(JSON.stringify({error:{code:'UNAVAILABLE'}}),{status:503});if(p.action==='recover')return new Response(JSON.stringify({error:{code:'TOKEN'}}),{status:404});return new Response(JSON.stringify({data:record}));}}));await assert.rejects(api.hold(draft));assert.deepEqual(await api.hold(draft),record);assert.equal(calls[0].key,calls[2].key);assert.equal(calls[0].proof,calls[2].proof);
});

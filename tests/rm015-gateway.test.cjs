'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const api=import('../supabase/functions/_shared/rm015-gateway.mjs'),crypt=import('../supabase/functions/_shared/rm015-crypto.mjs'),mail=import('../supabase/functions/_shared/rm015-mail.mjs');
const keys={v1:'1'.repeat(64)},rateSecret='2'.repeat(64),restaurant='fictif-a',origin='https://preview.example.test';
const draft={party:2,date:'2032-11-08',service:'dinner',time:'19:00'};
const contact={firstName:'Camille',lastName:'Fictif',email:'camille@example.test',phone:'',notes:'',accepted:true};
const request=(body,options={})=>new Request(origin+'/api',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...options.headers},body:typeof body==='string'?body:JSON.stringify(body),...options});
async function fixture(extra={}){
 const calls=[];let count=0;
 const rpc=async(name,args)=>{calls.push({name,args});if(name==='rm015_rate_v1')return {data:{allowed:true,count:++count},error:null};
  if(args.p_action==='profile')return {data:{name:'Restaurant fictif',slug:restaurant,tables:['private'],secret:'private'},error:null};
  if(args.p_action==='availability')return {data:{slots:[{time:'19:00',available:true,level:'limited',ids:['private']}],secret:'private'},error:null};
  if(args.p_action==='hold')return {data:{secret_cipher:args.p_payload.token_cipher,data:{reference:'WEB-FAKE',state:'draft',version:1,draft,table_ids:['private'],token_hash:'private'}},error:null};
  return {data:{},error:null};
 };
 const handler=(await api).createPublicHandler({rpc,keys,activeKey:'v1',rateSecret,allowedOrigins:[origin],ipForRequest:()=> '192.0.2.1',enabled:true,...extra});
 return {calls,handler};
}
test('RM015 public gateway stays disabled without explicit activation and touches no database',async()=>{
 const {handler,calls}=await fixture({enabled:false});const r=await handler(request({action:'profile',restaurant}));assert.equal(r.status,503);assert.equal(calls.length,0);
});
test('RM015 CORS, method, size, JSON and malformed inputs fail closed',async()=>{
 const {handler,calls}=await fixture();
 assert.equal((await handler(new Request(origin,{method:'POST',headers:{Origin:'https://foreign.example'}}))).status,403);
 assert.equal((await handler(new Request(origin,{method:'GET'}))).status,405);
 assert.equal(calls.length,0);
 assert.equal((await handler(new Request(origin,{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'}))).status,415);
 assert.equal((await handler(request('x'.repeat(16001)))).status,413);
 assert.equal((await handler(request('{bad'))).status,400);
 assert.equal((await handler(request({action:'profile'}))).status,400);
 assert.equal((await handler(request({action:'unknown',restaurant}))).status,400);
 assert.equal((await handler(request({action:'hold',restaurant,draft:{...draft,party:1.5}}))).status,400);
});
test('RM015 profile and availability responses exclude table IDs, secrets and arbitrary database fields',async()=>{
 const {handler}=await fixture();const r=await handler(request({action:'profile',restaurant})),value=await r.json();
 assert.deepEqual(value.data,{name:'Restaurant fictif',slug:restaurant});assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('access-control-allow-origin'),origin);
 const slots=await (await handler(request({action:'availability',restaurant,draft}))).json();assert.equal(JSON.stringify(slots).includes('private'),false);
});
test('RM015 server generates encrypted capabilities; caller cannot inject owner, token hash or tenant IDs',async()=>{
 const {handler,calls}=await fixture();const r=await handler(request({action:'hold',restaurant,draft,key:randomUUID(),proof:'a'.repeat(64),token_hash:'fake',restaurant_id:'fake'}));assert.equal(r.status,200);
 const json=await r.json();assert.match(json.data.managementToken,/^[a-f0-9]{64}$/);assert.equal(json.data.secret_cipher,undefined);assert.equal(json.data.table_ids,undefined);
 const payload=calls.find(c=>c.name==='rm015_gateway_v1').args.p_payload;assert.equal(payload.restaurant_id,undefined);assert.notEqual(payload.token_hash,'fake');assert.equal(payload.token_hash,await (await crypt).digest(json.data.managementToken));assert.equal(payload.proof_hash,await (await crypt).digest('a'.repeat(64)));assert.equal(payload.token_cipher.includes(json.data.managementToken),false);
});
test('RM015 shared rate limit precedes mutation; repeated holds require a verified challenge',async()=>{
 const {handler,calls}=await fixture();for(let i=0;i<3;i++)assert.equal((await handler(request({action:'hold',restaurant,draft,key:randomUUID(),proof:'a'.repeat(64)}))).status,200);
 const r=await handler(request({action:'hold',restaurant,draft,key:randomUUID(),proof:'a'.repeat(64)}));assert.equal(r.status,429);assert.equal((await r.json()).error.code,'CHALLENGE');assert.equal(calls.filter(c=>c.name==='rm015_gateway_v1').length,3);
});
test('RM015 errors are sanitized; no SQL, contacts, keys or stack reach the client',async()=>{
 const {handler}=await fixture({rpc:async(name)=>name==='rm015_rate_v1'?{data:{allowed:true,count:1},error:null}:{data:null,error:{code:'XX000',details:'secret private.customer email@example.test'}}});
 const r=await handler(request({action:'profile',restaurant}));assert.equal(r.status,503);assert.equal((await r.text()).includes('private.customer'),false);
});
test('RM015 invalid contact and malformed or missing capability cannot reach a mutation',async()=>{
 const {handler,calls}=await fixture();const key=randomUUID();
 assert.equal((await handler(request({action:'submit',restaurant,key,proof:'a'.repeat(64),draft,contact:{...contact,accepted:false},operation:randomUUID(),version:1}))).status,400);
 assert.equal((await handler(request({action:'cancel',restaurant,token:'bad',operation:randomUUID(),version:1}))).status,400);
 assert.equal(calls.filter(c=>c.name==='rm015_gateway_v1').length,0);
});
test('RM015 AES-GCM supports key rotation and refuses tampering or a different restaurant',async()=>{
 const c=await crypt,token=c.randomToken(),encrypted=await c.encryptToken(keys,'v1',restaurant,token);
 assert.equal(await c.decryptToken({...keys,v2:'3'.repeat(64)},restaurant,encrypted),token);
 await assert.rejects(c.decryptToken(keys,'foreign',encrypted));await assert.rejects(c.decryptToken(keys,restaurant,encrypted.slice(0,-4)+'AAAA'));
 assert.notEqual(await c.encryptToken(keys,'v1',restaurant,token),encrypted);
});
test('RM015 backend adapter calls only approved RPCs, puts new secret keys outside bearer JWT headers',async()=>{
 const a=await api,calls=[],rpc=a.createDatabaseRpc({url:'https://database.example.test',secret:'sb_secret_fictional',fetcher:async(url,options)=>{calls.push({url,options});return Response.json({ok:true})}});
 await rpc('rm015_gateway_v1',{p_action:'profile',p_payload:{restaurant}});assert.equal(calls[0].options.headers.Authorization,undefined);assert.equal(calls[0].options.headers.apikey,'sb_secret_fictional');
 await assert.rejects(rpc('delete_reservation',{}));assert.throws(()=>a.createDatabaseRpc({url:'http://foreign.example',secret:'fake'}));
});
test('RM015 email worker is disabled by default and cannot be invoked with public credentials',async()=>{
 const {createMailWorker}=await mail;let calls=0;const worker=createMailWorker({rpc:async()=>{calls++;return {data:[],error:null}},keys,workerSecret:'a'.repeat(64),publicBase:origin,sendMessage:async()=>{throw Error('must not send')}});
 assert.equal((await worker(new Request(origin,{method:'POST'}))).status,403);assert.equal((await worker(new Request(origin,{method:'POST',headers:{Authorization:'Bearer '+'a'.repeat(64)}}))).status,503);assert.equal(calls,0);
});
test('RM015 email provider receives a stable idempotency key; failed sends preserve one booking and retry one queue event',async()=>{
 const m=await mail,c=await crypt,calls=[],sent=[],token=c.randomToken(),job={id:randomUUID(),lease:randomUUID(),restaurant,restaurantName:'Restaurant <fictif>',email:'camille@example.test',event:'pending',tokenCipher:await c.encryptToken(keys,'v1',restaurant,token),record:{reference:'WEB-FAKE',state:'pending',draft,deadline:'2032-11-08T18:00Z'}};
 const worker=m.createMailWorker({enabled:true,keys,workerSecret:'a'.repeat(64),publicBase:origin,rpc:async(name,args)=>{calls.push({name,args});return {data:args.p_action==='claim'?[job]:{accepted:true},error:null}},sendMessage:async(message,meta)=>{sent.push({message,meta});throw Error('Simulated timeout')}});
 const req=()=>new Request(origin,{method:'POST',headers:{Authorization:'Bearer '+'a'.repeat(64)}});
 await worker(req());await worker(req());assert.equal(sent[0].meta.idempotencyKey,sent[1].meta.idempotencyKey);assert.equal(calls.filter(x=>x.args.p_action==='fail').length,2);assert.equal(calls.some(x=>x.name==='rm015_gateway_v1'),false);
 assert.match(sent[0].message.text,/Aucune confirmation n’est acquise/);assert.match(sent[0].message.html,/Restaurant &lt;fictif&gt;/);assert.equal(sent[0].message.html.includes('Restaurant <fictif>'),false);
});

test('RM015 gateway accepts an absent email but rejects a malformed supplied address before calling the business RPC',async()=>{const body={action:'submit',restaurant,key:randomUUID(),proof:'a'.repeat(64),draft,operation:randomUUID(),version:1},c={...contact};delete c.email;const {handler,calls}=await fixture();assert.equal((await handler(request({...body,contact:c}))).status,200);const sent=calls.find(x=>x.name==='rm015_gateway_v1').args.p_payload;assert.equal(Object.hasOwn(sent.contact,'email'),false);for(const email of ['bad',false,{},'a'.repeat(255)])assert.equal((await handler(request({...body,contact:{...c,email}}))).status,400);});

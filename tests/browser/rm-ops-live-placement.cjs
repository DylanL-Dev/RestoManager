'use strict';
/* RM-OPS — recette navigateur du moteur réel dans la vraie page `v3-connected.html`.
 * Serveur Supabase SIMULÉ dans le processus de test (aucun réseau externe, données fictives) :
 * il applique apply_smart_placement_v3 / change_reservation_status_v3 / install_walkin_group_v3
 * avec les mêmes garde-fous (état attendu, table d'origine, client installé) puis republie l'instantané.
 * Vérifie : RestoPlacement chargé, échange 214/215 bout en bout, double appui, Réception refusée,
 * coupure réseau, données périmées, passage via l'adaptateur Express. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const iso='2032-11-08',clock=new Date(iso+'T18:44:00Z');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const owned=row=>({...row,restaurant_id:'fixture-ops'});
let rows,assignments,revision,writes;
function reset(){
 const row=(room,table)=>({id:id(room),guest_name:room===214?'Dupont fictif':'Martin fictif',hotel_room:String(room),party_size:2,
  starts_at:iso+'T18:48:00Z',ends_at:iso+'T20:18:00Z',status:'reserved',notes:'',edit_version:id(room+1000),walkin_type:null,seated_at:null});
 rows=[row(214),row(215)];assignments=[{reservation_id:id(214),table_id:id(21)},{reservation_id:id(215),table_id:id(4)}];revision=0;writes=[];
}
const tables=[4,9,21].map(n=>({id:id(n),label:'Table '+n,seats:2,active:true,room_id:id(1)}));
function snapshot(){
 return {revision:String(++revision),syncSequence:revision,capabilities:{reservation_edits:4,booking_recovery:1,snapshot:1},
  hours:owned({lunch_enabled:true,lunch_start:'12:00:00',lunch_end:'14:00:00',dinner_enabled:true,dinner_start:'19:00:00',dinner_end:'23:00:00',duration:90,arrival_limit_percent:70}),
  rooms:[owned({id:id(1),name:'Salle principale',active:true})],tables:tables.map(owned),reservations:rows.map(owned),assignments:assignments.map(owned),holds:[],serviceClosures:[],fusionLinks:[]};
}
const tableOf=rid=>assignments.filter(a=>a.reservation_id===rid).map(a=>a.table_id);
const seatedOn=(table,except)=>rows.some(r=>r.id!==except&&r.status==='seated'&&tableOf(r.id).includes(table));
// Garde-fous identiques aux RPC DEV pour les cas testés (voir tests/postgres/rm-ops-engine.cjs).
function rpc(name,args){
 writes.push(name);
 const fail=(code,message)=>({error:{code,message,details:''}});
 if(name==='apply_smart_placement_v3'){
  for(const c of args.p_changes){const r=rows.find(x=>x.id===c.id);if(!r||r.status!==c.expected_status||tableOf(c.id)[0]!==c.from_table)return fail('40001','Une réservation a changé.')}
  for(const c of args.p_changes)if(seatedOn(c.to_table,c.id))return fail('23P01','Conflit de table détecté.');
  for(const c of args.p_changes)assignments.find(a=>a.reservation_id===c.id).table_id=c.to_table;
  Object.assign(rows.find(x=>x.id===args.p_target_reservation_id),{status:'seated',seated_at:clock.toISOString()});return {data:args.p_changes.length,error:null};
 }
 if(name==='change_reservation_status_v3'){
  const r=rows.find(x=>x.id===args.p_reservation_id);if(r.status!==args.p_expected)return fail('P0001','La réservation a déjà changé.');
  if(tableOf(r.id).some(t=>seatedOn(t,r.id)))return fail('P0001','Cette table est encore occupée.');
  Object.assign(r,{status:args.p_status,seated_at:clock.toISOString()});return {data:null,error:null};
 }
 if(name==='install_walkin_group_v3'){
  if(args.p_tables.some(t=>seatedOn(t)))return fail('P0001','Cette table est encore occupée.');
  const wid=id(900+writes.length);
  rows.push({id:wid,guest_name:args.p_name,hotel_room:null,party_size:args.p_guests,starts_at:clock.toISOString(),ends_at:new Date(clock.getTime()+90*60000).toISOString(),
   status:'seated',notes:'',edit_version:id(5000+writes.length),walkin_type:args.p_type,seated_at:clock.toISOString()});
  for(const t of args.p_tables)assignments.push({reservation_id:wid,table_id:t});return {data:wid,error:null};
 }
 return fail('PGRST202','Fonction absente du serveur simulé : '+name);
}
const bridge=`
export async function requireStaff(){return {user:{id:'fictional-user'},profile:{role:window.__opsRole,active:true,display_name:'Équipe fictive',restaurant_id:'fixture-ops'}}}
export async function loadSharedService(){return window.__opsSnapshot()}
export async function subscribeSharedService(onSnapshot,onError,onConnection){const apply=async()=>{onConnection(true);onSnapshot(await loadSharedService());};window.addEventListener('fixture:push',apply);window.addEventListener('online',apply);await apply();return ()=>{}}
function query(){const q={then:(yes,no)=>Promise.resolve({data:[],error:null}).then(yes,no)};for(const name of ['select','eq','order','limit','range','in','is','single','maybeSingle','gte','lte'])q[name]=()=>q;return q}
export const supabase={from:query,rpc:async(name,args)=>{if(name==='booking_draft_v3')return {data:{tables:[],holds:[],seconds:180},error:null};if(navigator.onLine===false)throw new TypeError('Failed to fetch');return window.__opsRpc(name,args);},auth:{getUser:async()=>({data:{user:{id:'fictional-user'}}}),signOut:async()=>({error:null})},removeChannel:async()=>{},channel:()=>({on(){return this},subscribe(){return this}})};`;
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
const server=http.createServer((req,res)=>{
 const file=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
 if(req.method!=='GET'||file.split('/').some(part=>part.startsWith('.')))return res.writeHead(404).end();
 if(file==='supabase-service-bridge.js')return res.writeHead(200,{'Content-Type':'text/javascript'}).end(bridge);
 fs.readFile(path.join(root,file),(error,value)=>error?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(value));
});
let origin,browser;const external=[],errors=[];
async function open(role='fb_admin',{exerciseGateway=false}={}){
 const context=await browser.newContext({viewport:{width:834,height:950},serviceWorkers:'block',timezoneId:'Europe/Paris'});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin||route.request().method()!=='GET'){external.push(url.href);return route.abort();}
  if(exerciseGateway&&url.pathname==='/placement-express-adapter.mjs'){
   // Exercise the gateway's legacy RPC contract only with the loopback RPC fixture.
   const response=await route.fetch(),body=await response.text();
   assert.ok(body.includes('const EXPRESS_WRITES_ENABLED=false;'));
   return route.fulfill({response,body:body.replace('const EXPRESS_WRITES_ENABLED=false;','const EXPRESS_WRITES_ENABLED=true;')});
  }
  return route.continue();
 });
 await context.routeWebSocket('**/*',ws=>ws.close());
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(r=>{window.__opsRole=r},role);
 await page.exposeFunction('__opsSnapshot',snapshot);
 await page.exposeFunction('__opsRpc',(name,args)=>rpc(name,args));
 await page.clock.install({time:clock});await page.goto(origin+'/v3-connected.html');
 await page.waitForFunction(()=>window.RestoSharedDataLoaded===true&&window.RestoSupabaseReady===true&&!!window.RestoPlacement);
 return {context,page};
}
const R214=id(214),R215=id(215);
const openWritable=(role='fb_admin')=>open(role,{exerciseGateway:true});
const state=()=>Object.fromEntries(rows.filter(r=>r.hotel_room).map(r=>[r.hotel_room,[r.status,tableOf(r.id).map(t=>Number(t.slice(-2)))[0]]]));
async function test(name,fn){reset();await fn();console.log('PASS '+name)}

(async()=>{
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch();
  await test('façade connectée en consultation : aperçus actifs, écritures bloquées malgré la capacité serveur',async()=>{
   const {context,page}=await open();
   const checks=await page.evaluate(async id=>{
    window.RestoServiceCapabilities={...window.RestoServiceCapabilities,placement:4};
    const placement=window.RestoPlacement,plan=placement.preview(id,[4]);
    const {createLiveAdapter}=await import('./placement-express-adapter.mjs');
    const adapter=createLiveAdapter({read:()=>({tables:TableStore.get().tables})});
    const error=async operation=>{try{await operation();return null}catch(err){return err.code}};
    const codes=await Promise.all([error(()=>placement.seat(plan)),error(()=>placement.walkIn({})),
     error(()=>adapter.seat(plan)),error(()=>adapter.walkIn({guests:2,table:9,type:'external'}))]);
    adapter.close();
    return {plan:plan.kind,caps:placement.capabilities(),codes};
   },R214);
   assert.equal(checks.plan,'swap');
   assert.deepEqual([checks.caps.seat,checks.caps.swapAndSeat,checks.caps.walkIn],[false,false,false]);
   assert.deepEqual(checks.codes,Array(4).fill('EXPRESS_WRITE_DISABLED'));
   assert.deepEqual(writes,[]);
   await context.close();
  });
  await test('capacités v1 du moteur sur le transport fictif explicite',async()=>{
   const {context,page}=await openWritable();
   const caps=await page.evaluate(()=>window.RestoPlacement.capabilities());
   assert.deepEqual([caps.version,caps.seat,caps.swapAndSeat,caps.walkIn,caps.releaseThenSeat],[1,true,true,true,false]);
   await context.close();
  });
  await test('échange 214 → T4 bout en bout : aperçu, écriture unique, instantané rafraîchi',async()=>{
   const {context,page}=await openWritable();
   const preview=await page.evaluate(id=>window.RestoPlacement.preview(id,[4]),R214);
   assert.equal(preview.kind,'swap');assert.deepEqual(preview.changes.map(c=>[c.label,c.from[0],c.to[0]]),[['Ch. 215',4,21]]);
   const [a,b]=await page.evaluate(p=>Promise.all([window.RestoPlacement.seat(p),window.RestoPlacement.seat(p)]),preview);
   assert.equal(a.ok,true);assert.deepEqual(a,b,'double appui : même résultat');
   assert.deepEqual(writes,['apply_smart_placement_v3']);
   assert.deepEqual(state(),{'214':['seated',4],'215':['reserved',21]});
   assert.equal(await page.evaluate(id=>window.RestoSharedReservations.find(r=>r.id===id).status,R214),'seated');
   await context.close();
  });
  await test('Réception : FORBIDDEN, aucune écriture',async()=>{
   const {context,page}=await openWritable('reception');
   assert.equal(await page.evaluate(id=>window.RestoPlacement.preview(id,[4]).code,R214),'NOT_SYNCED');
   const code=await page.evaluate(async id=>{try{await window.RestoPlacement.seat({ok:true,reservationId:id,targetTables:[4]})}catch(e){return e.code}},R214);
   assert.equal(code,'FORBIDDEN');assert.deepEqual(writes,[]);
   await context.close();
  });
  await test('coupure réseau : OFFLINE ; données modifiées par un collègue : STALE ; aucune écriture',async()=>{
   const {context,page}=await openWritable();
   const preview=await page.evaluate(id=>window.RestoPlacement.preview(id,[4]),R214);
   await context.setOffline(true);
   assert.equal(await page.evaluate(async p=>{try{await window.RestoPlacement.seat(p)}catch(e){return e.code}},preview),'OFFLINE');
   await context.setOffline(false);
   // Pendant la resynchronisation, la façade refuse aussi (NOT_SYNCED) ; on attend le retour à l'état prêt.
   await page.waitForFunction(()=>window.RestoSupabaseReady===true);
   rows.find(r=>r.id===R215).party_size=1;rows.find(r=>r.id===R215).edit_version=id(9999); // collègue
   assert.equal(await page.evaluate(async p=>{try{await window.RestoPlacement.seat(p)}catch(e){return e.code}},preview),'STALE');
   assert.deepEqual(writes,[]);
   await context.close();
  });
  await test('deux pupitres : 215 installé « sur T4 » pendant l’échange → constat SEATED_ELSEWHERE, jamais deux clients sur T4',async()=>{
   const A=await openWritable(),B=await openWritable();
   const pa=await A.page.evaluate(id=>window.RestoPlacement.preview(id,[4]),R214);
   const pb=await B.page.evaluate(id=>window.RestoPlacement.preview(id,[4]),R215);
   await A.page.evaluate(p=>window.RestoPlacement.seat(p),pa);
   const code=await B.page.evaluate(async p=>{try{await window.RestoPlacement.seat(p);return 'ok'}catch(e){return e.code}},pb);
   assert.ok(['STALE','TARGET_OCCUPIED','SEATED_ELSEWHERE'].includes(code),code);
   assert.equal(rows.filter(r=>r.status==='seated'&&tableOf(r.id).includes(id(4))).length,1);
   await A.context.close();await B.context.close();
  });
  await test('passage via l’adaptateur Express (interface de la simulation) : table conforme, une écriture',async()=>{
   const {context,page}=await openWritable();
   const result=await page.evaluate(async()=>{
    const {createLiveAdapter}=await import('./placement-express-adapter.mjs');
    const adapter=createLiveAdapter({read:()=>({tables:TableStore.get().tables})});
    const tables=adapter.suggestWalkIn(adapter.read(),2).map(t=>t.number);
    const out=await adapter.walkIn({guests:2,table:tables[0],type:'external',room:''});
    return {tables,out};
   });
   assert.deepEqual(result.tables,[9]);assert.equal(result.out.ok,true);assert.deepEqual(writes,['install_walkin_group_v3']);
   await context.close();
  });
  assert.deepEqual(external,[],'aucune requête externe');
  assert.deepEqual(errors,[],'aucune erreur JavaScript de page');
 }catch(error){console.error(error);process.exitCode=1}
 finally{await browser?.close();server.close()}
})();

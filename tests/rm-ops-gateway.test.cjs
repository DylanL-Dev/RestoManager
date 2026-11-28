'use strict';
/* RM-OPS ENGINE — façade RestoPlacement : écriture sûre, idempotence, erreurs. */
const test=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../smart-placement-engine.js');
const {createPlacementGateway,RestoEngineError}=require('../placement-gateway.js');

const D='2026-11-26',NOW=Date.parse('2026-11-26T19:04:00Z');
const r=(id,table,extra={})=>({id,client:'Ch. '+id,date:D,time:'20:00',duration:90,guests:2,status:'reserved',tables:[table],editVersion:'v1',...extra});
const plan=[4,9,21].map(number=>({number,capacity:2,capacityMin:1,roomId:'main'}));

test('Express refuses placement and walk-in if the session changes during refresh',async()=>{
 let scope='restaurant-a:user-a';
 const gw=createPlacementGateway({
  engine,expressOnly:true,now:()=>NOW,getRole:async()=> 'fb_admin',tableId:n=>'t'+n,
  getState:()=>({reservations:[r('214',21)],tablePlan:plan,holds:[],scope,revision:'42'}),
  serverFeatures:()=>({expressService:true}),
  refresh:async()=>{scope='restaurant-b:user-b';},
  rpc:async()=>assert.fail('No RPC may be sent after a context change')
 });
 await assert.rejects(gw.seat(gw.preview('214',[21])),{code:'NOT_SYNCED'});
 scope='restaurant-a:user-a';
 await assert.rejects(gw.walkIn({guests:2,tables:[9],type:'exterieur'}),{code:'NOT_SYNCED'});
});

function setup({reservations,role='fb_admin',online=true,rpcImpl,onRefresh}={}){
 const server={reservations:(reservations||[r('214',21),r('215',4,{time:'20:10'})]).map(x=>({...x,tables:x.tables.slice()}))};
 let local=JSON.parse(JSON.stringify(server.reservations));
 const calls=[];let refreshes=0;
 const apply=(name,args)=>{
  if(name==='change_reservation_status_v3'){const x=server.reservations.find(y=>y.id===args.p_reservation_id);if(x.status!==args.p_expected)throw {code:'P0001',message:'La réservation a déjà changé.'};x.status='seated';x.seatedAt='2026-11-26T19:05:00Z';return null}
  for(const c of args.p_changes){const x=server.reservations.find(y=>y.id===c.id);if(x.status!==c.expected_status)throw {code:'40001',message:'Une réservation a changé.'};x.tables=[Number(c.to_table.slice(1))]}
  const tgt=server.reservations.find(y=>y.id===args.p_target_reservation_id);tgt.status='seated';tgt.seatedAt='2026-11-26T19:05:00Z';return args.p_changes.length;
 };
 const gw=createPlacementGateway({
  engine,now:()=>NOW,isOnline:()=>online,getRole:async()=>role,tableId:n=>'t'+n,
  getState:()=>({reservations:local,tablePlan:plan,holds:[]}),
  refresh:async()=>{refreshes++;onRefresh?.(server);local=JSON.parse(JSON.stringify(server.reservations))},
  rpc:async(name,args)=>{calls.push([name,args]);await new Promise(res=>setTimeout(res,5));return rpcImpl?rpcImpl(name,args,apply,server):apply(name,args)}
 });
 return {gw,server,calls,get refreshes(){return refreshes}};
}

test('échange 214 → T4 : un seul appel atomique, cible en premier, état vérifié', async()=>{
 const s=setup();const p=s.gw.preview('214',[4]);
 assert.equal(p.kind,'swap');
 const out=await s.gw.seat(p);
 assert.equal(out.ok,true);assert.equal(out.alreadyApplied,false);
 assert.equal(s.calls.length,1);assert.equal(s.calls[0][0],'apply_smart_placement_v3');
 assert.deepEqual(s.calls[0][1].p_changes.map(c=>[c.id,c.from_table,c.to_table,c.expected_status]),[['214','t21','t4','reserved'],['215','t4','t21','reserved']]);
 assert.deepEqual(s.server.reservations.find(x=>x.id==='215').tables,[21]);
});

test('installation sur la table prévue : RPC de statut existante', async()=>{
 const s=setup();const out=await s.gw.seat(s.gw.preview('214',[21]));
 assert.equal(out.ok,true);assert.equal(s.calls[0][0],'change_reservation_status_v3');
});

test('table sans réservation : changement de table + installation en une transaction', async()=>{
 const s=setup();await s.gw.seat(s.gw.preview('214',[9]));
 assert.equal(s.calls[0][0],'apply_smart_placement_v3');assert.equal(s.calls[0][1].p_changes.length,1);
});

test('double appui : une seule écriture', async()=>{
 const s=setup();const p=s.gw.preview('214',[4]);
 const [a,b]=await Promise.all([s.gw.seat(p),s.gw.seat(p)]);
 assert.equal(s.calls.length,1);assert.deepEqual(a,b);
});

test('données modifiées entre l’aperçu et la confirmation : STALE, aucune écriture', async()=>{
 const s=setup({onRefresh:server=>{server.reservations.find(x=>x.id==='215').editVersion='v2'}});
 const p=s.gw.preview('214',[4]);
 await assert.rejects(s.gw.seat(p),e=>e instanceof RestoEngineError&&e.code==='STALE'&&e.preview?.ok===true);
 assert.equal(s.calls.length,0);
});

test('215 installé sur T4 par un autre appareil entre-temps : refus TARGET_OCCUPIED, aucune écriture', async()=>{
 const s=setup({onRefresh:server=>{const x=server.reservations.find(y=>y.id==='215');x.status='seated'}});
 await assert.rejects(s.gw.seat(s.gw.preview('214',[4])),e=>e.code==='TARGET_OCCUPIED');
 assert.equal(s.calls.length,0);
});

test('réseau coupé après l’envoi mais écriture faite : alreadyApplied, pas de nouvel essai', async()=>{
 const s=setup({rpcImpl:(name,args,apply)=>{apply(name,args);throw new TypeError('Failed to fetch')}});
 const out=await s.gw.seat(s.gw.preview('214',[4]));
 assert.equal(out.alreadyApplied,true);assert.equal(s.calls.length,1);
});

test('réseau coupé et rien écrit : RESULT_UNKNOWN, pas de nouvel essai', async()=>{
 const s=setup({rpcImpl:()=>{throw new TypeError('Failed to fetch')}});
 await assert.rejects(s.gw.seat(s.gw.preview('214',[4])),e=>e.code==='RESULT_UNKNOWN'&&e.refreshed===true);
 assert.equal(s.calls.length,1);
});

test('traduction des erreurs serveur', async()=>{
 for(const [err,code] of [[{code:'42501',details:'FORBIDDEN'},'FORBIDDEN'],[{code:'PGRST202'},'RPC_MISSING'],[{code:'23P01',message:'Conflit de table détecté.'},'CONFLICT'],
  [{code:'23P01',message:'Une table est maintenue pendant une réservation en cours.'},'TARGET_HELD'],[{code:'22023',details:'INVALID_INPUT'},'INVALID_INPUT'],[{code:'40001'},'STALE']]){
  const s=setup({rpcImpl:()=>{throw err}});
  await assert.rejects(s.gw.seat(s.gw.preview('214',[4])),e=>e.code===code,JSON.stringify(err));
 }
});

test('Réception, hors ligne, instantané absent : refus avant toute écriture', async()=>{
 const rec=setup({role:'reception'});
 await assert.rejects(rec.gw.seat(rec.gw.preview('214',[4])),e=>e.code==='FORBIDDEN');assert.equal(rec.calls.length,0);
 const off=setup({online:false});const p=off.gw.preview('214',[4]);
 assert.equal(p.offline,true);
 await assert.rejects(off.gw.seat(p),e=>e.code==='OFFLINE');assert.equal(off.calls.length,0);
 const gw=createPlacementGateway({engine,getState:()=>null,rpc:async()=>{throw Error('no')},refresh:async()=>{}});
 assert.equal(gw.preview('214',[4]).code,'NOT_SYNCED');
 await assert.rejects(gw.seat({ok:false}),e=>e.code==='INVALID_INPUT');
});

test('capacités annoncées : opérations futures désactivées', ()=>{
 const c=setup().gw.capabilities();
 assert.deepEqual([c.version,c.seat,c.swapAndSeat,c.swapWithoutSeat,c.releaseThenSeat,c.moveSeated,c.escortHold],[1,true,true,false,false,false,false]);
});

function walkSetup({impl,onRefresh,online=true}={}){
 const server={reservations:[r('214',21),r('S',9,{status:'seated'})]};
 let local=JSON.parse(JSON.stringify(server.reservations));let calls=0;
 const create=draft=>{server.reservations.push({id:'w'+(++calls),client:draft.client,date:D,time:'20:04',duration:90,guests:draft.guests,status:'seated',walkIn:true,tables:draft.tables.slice(),seatedAt:'2026-11-26T19:04:00Z'})};
 const gw=createPlacementGateway({engine,now:()=>NOW,isOnline:()=>online,getRole:async()=>'fb_admin',tableId:n=>'t'+n,
  getState:()=>({reservations:local,tablePlan:plan,holds:[],duration:90}),
  refresh:async()=>{onRefresh?.(server);local=JSON.parse(JSON.stringify(server.reservations))},
  rpc:async()=>{throw Error('unexpected')},
  installWalkin:async draft=>{await new Promise(res=>setTimeout(res,5));return impl?impl(draft,create,server):create(draft)}});
 return {gw,server,get calls(){return calls}};
}

test('passage : tables proposées = règle serveur ; installation vérifiée ; double appui = une écriture', async()=>{
 const s=walkSetup();
 assert.deepEqual(s.gw.walkInTables(2).map(x=>x.number),[4]);
 const draft={guests:2,tables:[4],type:'exterieur',name:''};
 const [a,b]=await Promise.all([s.gw.walkIn(draft),s.gw.walkIn(draft)]);
 assert.equal(s.calls,1);assert.equal(a.ok,true);assert.equal(a.verified,true);assert.deepEqual(a,b);
});

test('passage : table prise entre-temps → STALE sans écriture ; réseau coupé → OFFLINE', async()=>{
 const s=walkSetup({onRefresh:server=>{if(!server.reservations.some(x=>x.id==='X'))server.reservations.push(r('X',4,{status:'seated'}))}});
 await assert.rejects(s.gw.walkIn({guests:2,tables:[4],type:'exterieur'}),e=>e.code==='STALE');assert.equal(s.calls,0);
 const off=walkSetup({online:false});
 await assert.rejects(off.gw.walkIn({guests:2,tables:[4],type:'exterieur'}),e=>e.code==='OFFLINE');
});

test('passage : résultat incertain mais enregistré → alreadyApplied ; chambre déjà réservée → ROOM_CONFLICT', async()=>{
 const s=walkSetup({impl:(draft,create)=>{create(draft);throw new TypeError('Failed to fetch')}});
 const out=await s.gw.walkIn({guests:2,tables:[4],type:'hotel',name:'305'});
 assert.equal(out.alreadyApplied,true);
 const c=walkSetup({impl:()=>{throw {code:'23P01',message:'La chambre 214 possède déjà une réservation.'}}});
 await assert.rejects(c.gw.walkIn({guests:2,tables:[4],type:'hotel',name:'214'}),e=>e.code==='ROOM_CONFLICT');
 await assert.rejects(c.gw.walkIn({guests:2,tables:[4],type:'autre'}),e=>e.code==='INVALID_INPUT');
});

test('Express: ROOM_CONFLICT is explicit, never automatically retries or bypasses the guard',async()=>{
 const calls=[];
 const gw=createPlacementGateway({
  engine,expressOnly:true,now:()=>NOW,getRole:async()=> 'fb_admin',tableId:n=>'t'+n,
  getState:()=>({reservations:[],tablePlan:plan,holds:[],scope:'restaurant-a:user-a',revision:'42'}),
  serverFeatures:()=>({expressService:true}),
  refresh:async()=>{},
  rpc:async(name,args)=>{calls.push({name,args});throw {code:'23P01',details:'ROOM_CONFLICT',message:'Conflit'};}
 });
 await assert.rejects(gw.walkIn({guests:2,tables:[4],type:'hotel',name:'237'}),e=>e.code==='ROOM_CONFLICT'&&/mode complet.*confirmez/.test(e.message));
 assert.equal(calls.length,1);
 assert.equal(calls[0].name,'express_walkin_v1');
 assert.equal(calls[0].args.p_room,'237');
});

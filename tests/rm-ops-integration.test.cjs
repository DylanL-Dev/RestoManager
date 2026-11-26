'use strict';
/* RM-OPS — recette croisée moteur (#270) × Express (#271), sans navigateur ni Supabase.
 * Utilise le jeu fictif Codex de 200 couverts et l'adaptateur placement-express-adapter.mjs.
 * Ignoré automatiquement si les modules Express ne sont pas présents (branche moteur seule). */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const engine=require('../smart-placement-engine.js');
const {createPlacementGateway}=require('../placement-gateway.js');
const hasExpress=fs.existsSync(path.join(__dirname,'../service-v3-express-simulation.mjs'));
const skip=hasExpress?false:'modules Express (#271) absents : recette croisée ignorée';

// Serveur fictif reproduisant les garde-fous de apply_smart_placement_v3 / change_reservation_status_v3 /
// install_walkin_group_v3 (état attendu, installé bloquant, chevauchement), sérialisé comme les verrous.
function fakeServer(fixture){
 const state={reservations:JSON.parse(JSON.stringify(fixture.reservations)),tables:fixture.tables,clock:fixture.clock,writes:0};
 let queue=Promise.resolve();
 const serial=fn=>{const run=queue.then(fn);queue=run.catch(()=>{});return run};
 const find=id=>state.reservations.find(r=>r.id===id);
 const seatedOn=(n,except)=>state.reservations.some(r=>r.id!==except&&r.status==='seated'&&r.tables.includes(n));
 const rpc=(name,args)=>serial(async()=>{
  if(name==='change_reservation_status_v3'){
   const r=find(args.p_reservation_id);if(r.status!==args.p_expected)throw {code:'P0001',message:'La réservation a déjà changé.'};
   if(r.tables.some(n=>seatedOn(n,r.id)))throw {code:'P0001',message:'Cette table est encore occupée.'};
   r.status='seated';r.seatedAt=new Date(state.clock).toISOString();state.writes++;return null;
  }
  const entries=args.p_changes.map(c=>({...c,from:Number(c.from_table.slice(1)),to:Number(c.to_table.slice(1))}));
  for(const c of entries){const r=find(c.id);if(r.status!==c.expected_status||r.tables[0]!==c.from)throw {code:'40001',message:'Une réservation a changé.'}}
  for(const c of entries)if(seatedOn(c.to,c.id))throw {code:'23P01',message:'Conflit de table détecté.'};
  for(const c of entries)find(c.id).tables=[c.to];
  const t=find(args.p_target_reservation_id);t.status='seated';t.seatedAt=new Date(state.clock).toISOString();state.writes++;return entries.length;
 });
 const installWalkin=draft=>serial(async()=>{
  if(draft.tables.some(n=>seatedOn(n)))throw {code:'P0001',message:'Cette table est encore occupée.'};
  state.reservations.push({id:'passage-'+(++state.writes),client:draft.client,date:'2032-11-08',time:'19:44',duration:90,guests:draft.guests,tables:draft.tables.slice(),status:'seated',walkIn:true,seatedAt:new Date(state.clock).toISOString()});
 });
 return {state,rpc,installWalkin};
}

async function setup({online=()=>true}={}){
 const [{makeSimulation,simulationSnapshot},{createLiveAdapter}]=await Promise.all([
  import('../service-v3-express-simulation.mjs'),import('../placement-express-adapter.mjs')]);
 const fixture=makeSimulation();
 const server=fakeServer(fixture);
 // Chaque appareil a son propre instantané local, rafraîchi depuis le serveur.
 function device(){
  let local=JSON.parse(JSON.stringify(server.state.reservations));
  const placement=createPlacementGateway({engine,now:()=>server.state.clock,isOnline:online,getRole:async()=>'fb_admin',tableId:n=>'t'+n,
   getState:()=>({reservations:local,tablePlan:fixture.tables,holds:[],duration:90}),
   refresh:async()=>{local=JSON.parse(JSON.stringify(server.state.reservations))},rpc:server.rpc,installWalkin:server.installWalkin});
  const read=()=>simulationSnapshot({...fixture,reservations:local});
  return {placement,adapter:createLiveAdapter({read,placement,source:new EventTarget()}),read,refresh:()=>{local=JSON.parse(JSON.stringify(server.state.reservations))}};
 }
 return {fixture,server,device};
}

test('Express × moteur : 214/215 — deux propositions, échange visible dans « Autre table », installation atomique',{skip},async()=>{
 const {server,device}=await setup();const d=device();
 const snapshot=d.read();const row=snapshot.reservations.find(r=>r.id==='214');
 const {primary,entries}=d.adapter.suggestions(snapshot,row);
 assert.equal(primary.length,2);assert.equal(primary[0].table.number,21,'table prévue en premier');
 const four=entries.find(e=>e.table.number===4);
 assert.equal(four.plan.kind,'swap');assert.deepEqual(four.plan.changes.map(c=>[c.client,c.from,c.to]),[['Ch. 215',[4],[21]]]);
 const out=await d.adapter.seat(four.plan);
 assert.equal(out.ok,true);
 const final=Object.fromEntries(server.state.reservations.filter(r=>['214','215'].includes(r.id)).map(r=>[r.id,[r.status,r.tables[0]]]));
 assert.deepEqual(final,{'214':['seated',4],'215':['reserved',21]});
});

test('Express × moteur : deux pupitres simultanés sur la table 4 — une seule installation, l’autre refusée sans écriture',{skip},async()=>{
 const {server,device}=await setup();const a=device(),b=device();
 const planA=a.adapter.preview(a.read(),'214',4),planB=b.adapter.preview(b.read(),'215',4);
 assert.equal(planA.ok,true);assert.equal(planB.ok,true);
 const results=await Promise.allSettled([a.adapter.seat(planA),b.adapter.seat(planB)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results.map(r=>r.reason?.code)));
 assert.ok(['STALE','TARGET_OCCUPIED','CONFLICT'].includes(results.find(r=>r.status==='rejected').reason.code));
 const onFour=server.state.reservations.filter(r=>r.status==='seated'&&r.tables.includes(4));
 assert.equal(onFour.length,1);assert.equal(server.state.writes,1);
});

test('Express × moteur : installation anticipée sur une table encore promise à un client en retard — refusée',{skip},async()=>{
 const {server,device}=await setup();
 // 214 prévu 20:30 ; T4 promise à 215 prévu 19:00, toujours attendu à 19:44.
 server.state.reservations.find(r=>r.id==='214').time='20:30';
 Object.assign(server.state.reservations.find(r=>r.id==='215'),{time:'19:00',status:'late'});
 const d=device();
 const plan=d.adapter.preview(d.read(),'214',4);
 assert.equal(plan.ok,true,'l’échange avec 215 reste possible : 215 part sur T21');
 assert.ok(plan.warnings.some(w=>w.code==='EARLY_SEATING'&&w.message));
 // Sans échange possible (T21 occupée), l’installation anticipée sur T4 est refusée.
 server.state.reservations.push({id:'occ',client:'Installé',date:'2032-11-08',time:'19:30',duration:90,guests:2,tables:[21],status:'seated'});
 server.state.reservations.find(r=>r.id==='214').tables=[13];d.refresh();
 assert.notEqual(d.adapter.preview(d.read(),'214',4).ok,true);
});

test('Express × moteur : passage express — tables conformes au serveur, double appui = un seul passage',{skip},async()=>{
 const {server,device}=await setup();const d=device();
 const tables=d.adapter.suggestWalkIn(d.read(),2);
 assert.ok(tables.length>0);assert.ok(tables.every(t=>typeof t.number==='number'&&t.roomId));
 const draft={revision:0,guests:2,table:tables[0].number,type:'external',room:''};
 const [x,y]=await Promise.all([d.adapter.walkIn(draft),d.adapter.walkIn(draft)]);
 assert.deepEqual(x,y);assert.equal(server.state.reservations.filter(r=>r.walkIn&&r.tables.includes(draft.table)).length,1);
 d.refresh();assert.ok(!d.adapter.suggestWalkIn(d.read(),2).some(t=>t.number===draft.table),'table retirée après le passage');
});

test('Express × moteur : perte de connexion et données périmées — aucune écriture',{skip},async()=>{
 let online=true;
 const {server,device}=await setup({online:()=>online});const d=device();
 const plan=d.adapter.preview(d.read(),'214',4);
 online=false;
 await assert.rejects(d.adapter.seat(plan),e=>e.code==='OFFLINE');
 await assert.rejects(d.adapter.walkIn({guests:2,table:16,type:'external'}),e=>e.code==='OFFLINE');
 online=true;
 server.state.reservations.find(r=>r.id==='215').guests=1; // modifié par un collègue
 await assert.rejects(d.adapter.seat(plan),e=>e.code==='STALE'&&e.preview?.ok===true);
 assert.equal(server.state.writes,0);
});

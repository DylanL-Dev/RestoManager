'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const modules=Promise.all([import('../service-v3-express-data.mjs'),import('../service-v3-express-simulation.mjs')]);

test('Express simulates a 200-cover service and keeps unrecorded walk-ins visible as uncertainty',async()=>{
 const [data,fixture]=await modules;
 const snapshot=fixture.simulationSnapshot(fixture.makeSimulation());
 assert.deepEqual(snapshot.fixture,{groups:76,covers:200,unreportedWalkInCovers:30});
 assert.equal(snapshot.reservations.reduce((sum,row)=>sum+row.guests,0),170);
 assert.equal(data.roomViews(snapshot).filter(view=>view.counts.active>0).length,2);
 assert.ok(data.serviceIndicators(snapshot).groups>=12,'multiple arrivals in the same 15-minute window');
 assert.ok(snapshot.charge.blocked);
 assert.deepEqual(data.tableStatus(snapshot,12),{kind:'departure',label:'Départ à vérifier'});
 assert.equal(data.tableStatus(snapshot,16).label,'Aucun client enregistré');
});

test('Express searches the current service and includes other dates only on request',async()=>{
 const [data,fixture]=await modules;
 const snapshot=fixture.simulationSnapshot(fixture.makeSimulation());
 const dupont=snapshot.reservations.find(row=>row.id==='214');
 snapshot.reservations.push({...dupont,id:'tomorrow',date:'2032-11-09',client:'Düpont'});
 assert.deepEqual(data.findArrivals(snapshot,'214 Dupont').map(row=>row.id),['214']);
 assert.deepEqual(data.findArrivals(snapshot,'DUPONT',true).map(row=>row.id),['214','tomorrow']);
 assert.equal(data.findArrivals(snapshot,'inexistant').length,0);
});

test('the simulation proposes the 214/215 swap and protects seated guests, holds and fusions',async()=>{
 const [,fixture]=await modules;
 const snapshot=fixture.simulationSnapshot(fixture.makeSimulation());
 const row=snapshot.reservations.find(item=>item.id==='214');
 const other=snapshot.reservations.find(item=>item.id==='215');
 assert.deepEqual(fixture.suggestions(snapshot,row).primary.map(({table})=>table.number),[21,4]);
 const plan=fixture.previewPlacement(snapshot,'214',4);
 assert.deepEqual([plan.kind,plan.targetTables,plan.changes.map(change=>[change.id,change.from,change.to])],['swap',[4],[['215',[4],[21]]]]);
 const asOfYesterday={...other,date:'2032-11-07',status:'seated'};
 snapshot.reservations.push(asOfYesterday);
 assert.equal(fixture.previewPlacement(snapshot,'214',4).code,'TARGET_OCCUPIED');
 snapshot.reservations.pop();
 other.status='arrived';assert.equal(fixture.previewPlacement(snapshot,'214',4).code,'NO_SAFE_PLAN');
 other.status='reserved';
 snapshot.holds.push({number:4,start:-Infinity,end:Infinity});
 assert.equal(fixture.previewPlacement(snapshot,'214',4).code,'TARGET_HELD');
 snapshot.holds.pop();row.tables.push(5);
 assert.equal(fixture.previewPlacement(snapshot,'214',4).code,'FUSION_UNSUPPORTED');
});

test('Express retains empty rooms and reports recorded table states, including all-planned rooms and fusions',async()=>{
 const [data,fixture]=await modules;
 const snapshot=fixture.simulationSnapshot(fixture.makeSimulation());
 const activeRooms=data.roomViews(snapshot);
 assert.deepEqual(data.roomViews({...snapshot,rooms:[]}),[]);
 assert.equal(data.roomViews({...snapshot,rooms:[snapshot.rooms[0]]}).length,1);
 assert.deepEqual(activeRooms.find(room=>room.id==='verriere').counts,{configured:0,active:0,planned:0,installed:0,departures:0});
 const salon=activeRooms.find(room=>room.id==='salon');
 assert.equal(salon.counts.departures,1);assert.equal(salon.counts.installed,1);
 const main=activeRooms.find(room=>room.id==='main');
 assert.equal(main.counts.planned,main.counts.active);

 const row=snapshot.reservations.find(item=>item.id==='214');
 assert.deepEqual(fixture.suggestions(snapshot,row,'main').primary.map(({table})=>table.number),[21,4]);
 assert.deepEqual(fixture.suggestions(snapshot,row,'salon').primary.map(({table})=>table.number),[16,17]);
 assert.equal(fixture.previewPlacement(snapshot,'214',16).warnings[0].code,'ROOM_CHANGE');
 assert.deepEqual(fixture.suggestions(snapshot,row,'verriere').primary,[]);

 const occupied={...snapshot,reservations:[...snapshot.reservations,...main.tables.map(({table})=>({
  ...row,id:`installed-${table.number}`,tables:[table.number],status:'seated'
 }))]};
 assert.equal(data.roomViews(occupied).find(room=>room.id==='main').counts.installed,main.counts.active);
 assert.deepEqual(fixture.suggestions(occupied,row,'main').primary,[]);
 assert.deepEqual(fixture.suggestions(occupied,row).primary.map(({table})=>table.number),[16,17]);

 row.tables.push(4);
 assert.equal(data.assignedRoom(snapshot,row),'main');
 assert.deepEqual(fixture.suggestions(snapshot,row,'salon').primary,[]);
 row.tables.push(16);
 assert.equal(data.assignedRoom(snapshot,row),null);
 snapshot.rooms.find(room=>room.id==='salon').active=false;
 assert.ok(!data.roomViews(snapshot).some(room=>room.id==='salon'));
 assert.equal(fixture.previewPlacement(snapshot,'214',16).code,'INACTIVE');
 assert.ok(!fixture.suggestWalkIn(snapshot,2).some(table=>table.roomId==='salon'));
});

test('a live snapshot requires the authorized establishment before reading any plan or settings',async()=>{
 const [data]=await modules;
 const source={navigator:{onLine:true},RestoSharedDataLoaded:true,RestoSyncState:'ok',RestoExpressSnapshotRestaurantId:'a',
  RestoNotificationContext:{role:'fb_admin',restaurantId:'b'}};
 const view=data.liveSnapshot(source,()=>{assert.fail('plan from another establishment');});
 assert.deepEqual([view.loaded,view.fresh,view.rooms,view.reservations,view.charge],[false,false,[],[],null]);
});

test('the mock adapter rejects duplicate and offline confirmation without a partial transfer',async()=>{
 const [,fixture]=await modules;
 const source=new EventTarget();source.navigator={onLine:true};
 const adapter=fixture.createSimulation(source);
 const plan=adapter.preview(adapter.read(),'214',4);
 let updates=0;adapter.subscribe(()=>updates++);
 const competingPlan=adapter.preview(adapter.read(),'215',4);
 assert.equal((await adapter.seat(plan)).alreadyApplied,false);
 assert.equal((await adapter.seat(plan)).alreadyApplied,true);
 await assert.rejects(adapter.seat(competingPlan),{code:'STALE'});
 assert.equal(updates,1);
 assert.deepEqual(adapter.read().reservations.filter(item=>['214','215'].includes(item.id)).map(item=>[item.id,item.status,item.tables]),
  [['215','reserved',[21]],['214','seated',[4]]]);
 source.navigator.onLine=false;
 await assert.rejects(adapter.walkIn({revision:1,guests:2,table:16,type:'external',room:''}),/connexion interrompue/);
 assert.equal(adapter.read().revision,1);adapter.close();
});

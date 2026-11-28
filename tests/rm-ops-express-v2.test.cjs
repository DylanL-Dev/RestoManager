'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const engine=require('../smart-placement-engine.js');
const {createPlacementGateway}=require('../placement-gateway.js');

const date='2032-11-08',now=Date.parse(date+'T18:45Z');
const room='main',uuid=n=>'40000000-0000-4000-8000-'+String(n).padStart(12,'0');
const row=(i,guests)=>({id:String(i),client:'Client fictif '+i,date,time:'19:45',duration:90,
 status:'reserved',tables:[i],guests,editVersion:'version-'+i});
const table=(n,capacity=2,roomId=room)=>({number:n,capacity,roomId});
const chain=n=>({
 reservations:Array.from({length:n},(_,i)=>row(i+1,2+i*2)),
 tablePlan:Array.from({length:n+1},(_,i)=>table(i+1,2+i*2)),now,fusionLinks:[]
});

test('B3 solveur : chaînes jusqu’à huit dossiers, avec graphe connecté et refus des clients protégés',()=>{
 for(let size=3;size<=8;size++){
  const state=chain(size);
  const result=engine.preview({...state,reservationId:'1',targetTables:[2]});
  assert.equal(result.ok,true);
  assert.equal(result.changes.length,size-1);
  assert.deepEqual(result.changes.map(move=>[move.from[0],move.to[0]]),
   Array.from({length:size-1},(_,i)=>[i+2,i+3]));
  state.reservations[1].status='arrived';
  assert.equal(engine.preview({...state,reservationId:'1',targetTables:[2]}).detail.reason,'protected');
  state.reservations[1].status='seated';
  assert.equal(engine.preview({...state,reservationId:'1',targetTables:[2]}).code,'TARGET_OCCUPIED');
 }
});

test('B3 fusions : seuls les groupes connexes et disponibles de la même salle sont proposés',()=>{
 const state={reservations:[],tablePlan:[table(1),table(2),table(3),table(4),table(5),table(6,2,'salon')],
  fusionLinks:[[1,2],[2,3],[3,4],[4,6]],now};
 for(const guests of [4,6,8]){
  const count=guests/2;
  const options=engine.walkInGroups({...state,guests});
  assert.ok(options.some(g=>g.numbers.length===count));
  assert.ok(options.every(g=>!g.numbers.includes(5)&&!g.numbers.includes(6)));
 }
 assert.equal(engine.canWalkInGroup({...state,guests:4},[1,3]),false);
 assert.equal(engine.canWalkInGroup({...state,guests:4},[1,2]),true);
 assert.equal(engine.canWalkInGroup({...state,guests:4,holds:[{number:2,start:now,end:now+60000,expiry:now+60000}]},[1,2]),false);
 const target={...row(1,4),tables:[1,2]},input={...state,reservationId:'1',targetTables:[1,2],reservations:[target]};
 assert.equal(engine.preview(input).ok,true);
 assert.equal(engine.preview({...input,fusionLinks:[]}).ok,false);
 assert.equal(engine.preview({...input,targetTables:[3,4]}).ok,false);
});

test('B3 passerelle : la chaîne v2 transmet toutes les versions et refuse une révision ou capacité changée',async()=>{
 const state={...chain(3),scope:'restaurant:équipe',revision:'7'};
 let versioned=true,refreshes=0;
 const calls=[];
 const g=createPlacementGateway({engine,expressOnly:true,getState:()=>state,tableId:uuid,now:()=>now,
  getRole:async()=> 'fb_admin',serverFeatures:()=>({expressService:true,expressServiceV2:versioned}),
  refresh:async()=>{refreshes++},
  rpc:async(name,args)=>{
   calls.push([name,args]);
   state.reservations.forEach((r,i)=>{r.tables=[i+2];if(i===0)r.status='seated';});
   return {seated_at:new Date(now).toISOString()};
  }});
 const p=g.preview('1',[2]);
 state.revision='8';
 await assert.rejects(g.seat(p),{code:'STALE'});
 const fresh=g.preview('1',[2]);
 versioned=false;
 await assert.rejects(g.seat(fresh),{code:'STALE'});
 assert.equal(calls.length,0);
 versioned=true;
 const results=await Promise.all([g.seat(g.preview('1',[2])),g.seat(g.preview('1',[2]))]);
 assert.ok(results.every(r=>r.verified));
 assert.equal(calls.length,1);
 assert.equal(calls[0][0],'express_seat_v2');
 assert.deepEqual(calls[0][1].p_changes.map(c=>c.expected_version),['version-1','version-2','version-3']);
 assert.ok(refreshes>=4);
});

test('B3 passage : une réponse incertaine est relue sans réémission et un reçu ne bascule pas en v1',async()=>{
 const state={scope:'restaurant:équipe',revision:'1',reservations:[],tablePlan:[table(1),table(2)],fusionLinks:[[1,2]]};
 let versioned=true,refreshes=0,writes=0;
 const g=createPlacementGateway({engine,expressOnly:true,getState:()=>state,tableId:uuid,now:()=>now,
  getRole:async()=> 'fb_admin',serverFeatures:()=>({expressService:true,expressServiceV2:versioned}),
  refresh:async()=>{refreshes++;},
  rpc:async(name,args)=>{
   assert.equal(name,'express_walkin_v2');assert.equal(args.p_room,'237a');
   assert.deepEqual(args.p_tables,[uuid(1),uuid(2)]);
   writes++;
   if(args.p_confirmation)throw TypeError('Failed to fetch');
   return {status:'room_conflict',token:'jeton-fictif',reservation_id:'réservation-fictive',revision:'1'};
  }});
 const draft={contract:2,revision:state.revision,scope:state.scope,tables:[1,2],type:'hotel',guests:4,name:' 237A '};
 const reply=await g.walkIn(draft);
 assert.equal(reply.roomConflict,true);
 const confirm={...draft,confirmation:reply.token};
 await assert.rejects(g.walkIn(confirm),{code:'RESULT_UNKNOWN'});
 assert.equal(writes,2);assert.equal(refreshes,3);
 versioned=false;
 await assert.rejects(g.walkIn(confirm),{code:'CAPABILITY_REQUIRED'});
 assert.equal(writes,2);
});

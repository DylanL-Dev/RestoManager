'use strict';
/* RM-OPS ENGINE — moteur de placement : cas métier, invariants, charge 200 couverts. */
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../smart-placement-engine.js');

const D='2026-11-26';
const NOW=Date.parse('2026-11-26T19:04:00Z'); // 20:04 à Paris
const r=(id,table,extra={})=>({id,client:'Ch. '+id,date:D,time:'20:00',duration:90,guests:2,status:'reserved',tables:Array.isArray(table)?table:[table],...extra});
const t=(number,extra={})=>({number,capacity:2,capacityMin:1,roomId:'main',...extra});
const base=(reservations,tablePlan,extra={})=>({reservations,tablePlan,holds:[],now:NOW,...extra});

test('214 T21 → T4 : échange simple avec 215 non installé', ()=>{
 const p=E.preview(base([r('214',21),r('215',4,{time:'20:10'})],[t(4),t(21),t(9)],{reservationId:'214',targetTables:[4]}));
 assert.equal(p.ok,true);assert.equal(p.kind,'swap');
 assert.deepEqual(p.changes.map(c=>[c.id,c.from[0],c.to[0],c.roomChange]),[['215',4,21,false]]);
 assert.equal(typeof p.fingerprint,'string');
});

test('échange simple prioritaire sur une table libre plus petite', ()=>{
 const p=E.preview(base([r('214',21),r('215',4)],[t(4),t(9),t(21,{capacity:4})],{reservationId:'214',targetTables:[4]}));
 assert.equal(p.kind,'swap');assert.equal(p.changes[0].to[0],21);
});

test('table 4 occupée par un client installé : refus, aucune proposition', ()=>{
 const p=E.preview(base([r('214',21),r('215',4,{status:'seated',seatedAt:'2026-11-26T18:42:00Z'})],[t(4),t(21)],{reservationId:'214',targetTables:[4]}));
 assert.equal(p.ok,false);assert.equal(p.code,'TARGET_OCCUPIED');assert.equal(p.detail.since,'same-date');
});

test('client installé la veille et jamais libéré : la table reste bloquée (comme le serveur)', ()=>{
 const p=E.preview(base([r('214',21),r('99',4,{date:'2026-11-25',time:'21:00',status:'seated'})],[t(4),t(21)],{reservationId:'214',targetTables:[4]}));
 assert.equal(p.code,'TARGET_OCCUPIED');assert.equal(p.detail.since,'previous-date');
 const s=E.simulate({reservations:[r('214',21),r('99',4,{date:'2026-11-25',status:'seated'})],tablePlan:[t(4),t(21)],reservationId:'214',targetTable:4});
 assert.equal(s.ok,false,'ancienne API alignée');
});

test('même salle exigée par défaut ; changement de salle seulement sur demande explicite', ()=>{
 const plan=[t(4),t(21,{capacity:1}),t(30,{roomId:'terrasse'})];
 const res=[r('214',21,{guests:1}),r('215',4)];
 const p=E.preview(base(res,plan,{reservationId:'214',targetTables:[4]}));
 assert.equal(p.code,'ROOM_CHANGE_REQUIRED');assert.equal(p.detail.changes[0].toRoom,'terrasse');
 const ok=E.preview(base(res,plan,{reservationId:'214',targetTables:[4],allowRoomChange:true}));
 assert.equal(ok.ok,true);assert.equal(ok.changes[0].roomChange,true);
 assert.ok(ok.warnings.some(w=>w.code==='ROOM_CHANGE'));
});

test('fusions : jamais déplacées automatiquement', ()=>{
 assert.equal(E.preview(base([r('214',21),r('215',[4,5])],[t(4),t(5),t(21)],{reservationId:'214',targetTables:[4]})).code,'FUSION_UNSUPPORTED');
 assert.equal(E.preview(base([r('214',[21,22],{guests:4})],[t(4,{capacity:4}),t(21),t(22)],{reservationId:'214',targetTables:[4]})).code,'FUSION_UNSUPPORTED');
 const own=E.preview(base([r('214',[21,22],{guests:4})],[t(21),t(22)],{reservationId:'214',targetTables:[22,21]}));
 assert.equal(own.ok,true);assert.equal(own.kind,'direct');
});

test('réservation « arrived » d’un autre client : protégée', ()=>{
 assert.equal(E.preview(base([r('214',21),r('215',4,{status:'arrived'})],[t(4),t(21)],{reservationId:'214',targetTables:[4]})).code,'NO_SAFE_PLAN');
});

test('maintien actif sur la table voulue ou de repli', ()=>{
 const start=Date.parse('2026-11-26T18:55:00Z'),end=Date.parse('2026-11-26T20:30:00Z');
 const held=E.preview(base([r('214',21)],[t(4),t(21)],{reservationId:'214',targetTables:[4],holds:[{number:4,start,end,expiry:NOW+60000,team:'Réception'}]}));
 assert.equal(held.code,'TARGET_HELD');
 const expired=E.preview(base([r('214',21)],[t(4),t(21)],{reservationId:'214',targetTables:[4],holds:[{number:4,start,end,expiry:NOW-1}]}));
 assert.equal(expired.ok,true);
 const alt=E.preview(base([r('214',21),r('215',4)],[t(4),t(9),t(21)],{reservationId:'214',targetTables:[4],holds:[{number:21,start,end,expiry:NOW+60000}]}));
 assert.equal(alt.ok,true);assert.equal(alt.kind,'chain');assert.equal(alt.changes[0].to[0],9);
});

test('chaîne de déplacements limitée à 8 réservations, cible comprise', ()=>{
 const plan=[t(1),t(2),t(3),t(4)];
 const res=[r('A',1),r('B',2),r('C',3,{time:'20:30'})];
 const p=E.preview(base(res,plan,{reservationId:'A',targetTables:[2]}));
 assert.equal(p.ok,true);assert.ok(p.changes.length+1<=E.MAX_CHANGES);
});

test('couverts différents à l’arrivée : modification préalable exigée', ()=>{
 assert.equal(E.preview(base([r('214',21)],[t(4,{capacity:4}),t(21)],{reservationId:'214',targetTables:[4],guests:3})).code,'PARTY_SIZE_CHANGED');
});

test('service après minuit : chevauchement 23:30 / 00:30 détecté', ()=>{
 const res=[r('A',1,{time:'21:00'}),r('B',2,{date:'2026-11-26',time:'23:30'}),r('C',2,{date:'2026-11-27',time:'00:30',status:'confirmed'})];
 const p=E.preview(base(res,[t(1),t(2),t(3)],{reservationId:'B',targetTables:[1]}));
 assert.equal(p.ok,true);
 const conflict=E.preview(base([r('B',3,{time:'23:30'}),r('C',2,{date:'2026-11-27',time:'00:30',status:'arrived'})],[t(2),t(3)],{reservationId:'B',targetTables:[2]}));
 assert.equal(conflict.code,'NO_SAFE_PLAN','la réservation du lendemain 00:30 chevauche 23:30 + 90 min');
});

test('aucune réservation sur le créneau : installation directe', ()=>{
 const p=E.preview(base([r('214',21),r('300',4,{time:'22:00'})],[t(4),t(21)],{reservationId:'214',targetTables:[4]}));
 assert.equal(p.kind,'direct');assert.deepEqual(p.changes,[]);
});

test('erreurs d’entrée et statuts', ()=>{
 assert.equal(E.preview(base([r('214',21,{status:'seated'})],[t(21)],{reservationId:'214',targetTables:[21]})).code,'ALREADY_SEATED');
 assert.equal(E.preview(base([r('214',21,{status:'completed'})],[t(21)],{reservationId:'214',targetTables:[21]})).code,'NOT_FOUND');
 assert.equal(E.preview(base([r('214',21)],[t(21)],{reservationId:'214',targetTables:[999]})).code,'INVALID_INPUT');
 assert.equal(E.preview(base([r('214',21,{guests:3})],[t(21),t(4)],{reservationId:'214',targetTables:[4]})).code,'CAPACITY');
});

test('empreinte : stable, change si une réservation concernée change', ()=>{
 const res=[r('214',21),r('215',4,{editVersion:'v1'})];
 const a=E.preview(base(res,[t(4),t(21)],{reservationId:'214',targetTables:[4]}));
 const b=E.preview(base(res.map(x=>({...x})),[t(4),t(21)],{reservationId:'214',targetTables:[4]}));
 const c=E.preview(base([r('214',21),r('215',4,{editVersion:'v2'})],[t(4),t(21)],{reservationId:'214',targetTables:[4]}));
 assert.equal(a.fingerprint,b.fingerprint);assert.notEqual(a.fingerprint,c.fingerprint);
});

test('les données d’entrée ne sont jamais modifiées', ()=>{
 const res=[r('214',21),r('215',4)];const copy=JSON.stringify(res);
 E.preview(base(res,[t(4),t(21)],{reservationId:'214',targetTables:[4]}));E.suggest(base(res,[t(4),t(21),t(9)],{reservationId:'214'}));
 assert.equal(JSON.stringify(res),copy);
});

test('suggest : la table prévue d’abord, puis directe / échange, jamais une table occupée', ()=>{
 const res=[r('214',21),r('215',4),r('S',9,{status:'seated'})];
 const s=E.suggest(base(res,[t(4),t(9),t(10),t(21)],{reservationId:'214',limit:3}));
 assert.equal(s.ok,true);
 assert.deepEqual(s.choices.map(c=>[c.targetTables[0],c.kind]),[[21,'planned'],[10,'direct'],[4,'swap']]);
 assert.ok(!s.choices.some(c=>c.targetTables[0]===9));
});

test('tableStates : jamais « libre », départs jamais déduits', ()=>{
 const res=[r('A',1,{status:'seated',seatedAt:'2026-11-26T17:00:00Z'}),r('B',2,{status:'seated',seatedAt:'2026-11-26T18:50:00Z'}),
  r('C',3,{time:'19:30'}),r('E',4,{time:'20:30'}),r('F',5,{date:'2026-11-25',status:'seated',seatedAt:'2026-11-25T21:00:00Z'})];
 const s=Object.fromEntries(E.tableStates(base(res,[t(1),t(2),t(3),t(4),t(5),t(6)],{date:D})).map(x=>[x.number,x]));
 assert.equal(s[1].state,'overdue');assert.equal(s[2].state,'seated');assert.equal(s[3].state,'unknown');
 assert.equal(s[4].state,'planned');assert.equal(s[5].state,'overdue');assert.equal(s[5].previousDate,true);assert.equal(s[6].state,'none');
});

/* Invariant de sécurité : toute proposition acceptée conduit à un état final sans double occupation. */
function rng(seed){return()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff}}
function finalState(res,p){
 const out=res.map(x=>({...x,tables:x.tables.slice()}));
 const tgt=out.find(x=>x.id===p.reservationId);tgt.tables=p.targetTables.slice();tgt.status='seated';
 for(const c of p.changes){const o=out.find(x=>x.id===c.id);o.tables=c.to.slice()}
 return out;
}
const mins=x=>Date.UTC(...x.date.split('-').map((v,i)=>i===1?v-1:+v))/60000+Number(x.time.slice(0,2))*60+Number(x.time.slice(3));
function assertSafe(before,after,p,plan,allowRoomChange){
 const byNum=new Map(plan.map(x=>[x.number,x]));
 for(const c of p.changes){
  const o=before.find(x=>x.id===c.id);
  assert.ok(['reserved','confirmed','late'].includes(o.status),'seul un attendu est déplacé');
  assert.equal(o.tables.length,1);assert.ok(byNum.get(c.to[0]).capacity>=o.guests);
  if(!allowRoomChange)assert.equal(byNum.get(c.to[0]).roomId,byNum.get(c.from[0]).roomId,'même salle');
 }
 assert.ok(p.changes.length+1<=E.MAX_CHANGES);
 for(const x of before.filter(x=>x.status==='seated'))assert.deepEqual(after.find(y=>y.id===x.id).tables,x.tables,'un installé ne bouge jamais');
 const active=after.filter(x=>['reserved','confirmed','late','arrived','seated'].includes(x.status));
 for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
  const a=active[i],b=active[j];
  if(!a.tables.some(n=>b.tables.includes(n)))continue;
  const before_a=before.find(x=>x.id===a.id),before_b=before.find(x=>x.id===b.id);
  const moved=a.id===p.reservationId||b.id===p.reservationId||p.changes.some(c=>c.id===a.id||c.id===b.id);
  if(!moved)continue; // conflits préexistants hors périmètre
  const seatedClash=a.status==='seated'&&b.status==='seated';
  // La cible est installée maintenant : elle occupe [min(maintenant, prévu), max(…)+durée].
  const nowMin=Date.UTC(2026,10,26)/60000+20*60+4;
  const span=x=>x.id===p.reservationId?[Math.min(mins(x),nowMin),Math.max(mins(x),nowMin)+x.duration]:[mins(x),mins(x)+x.duration];
  const preSeated=x=>x.status==='seated'&&x.id!==p.reservationId;
  const overlap=preSeated(a)||preSeated(b)?true:span(a)[0]<span(b)[1]&&span(b)[0]<span(a)[1];
  assert.ok(!overlap&&!seatedClash,'double occupation entre '+a.id+' et '+b.id+' '+JSON.stringify([before_a,before_b,p]));
 }
}

test('propriété : 400 états aléatoires, aucune proposition ne crée de double occupation', ()=>{
 const rand=rng(20261126);let accepted=0;
 for(let k=0;k<400;k++){
  const plan=Array.from({length:12},(_,i)=>t(i+1,{capacity:rand()<.2?4:2,roomId:i<8?'main':'terrasse'}));
  const res=[];const statuses=['reserved','confirmed','late','arrived','seated'];
  for(let i=0;i<14;i++){
   const tb=1+Math.floor(rand()*12),h=19+Math.floor(rand()*3),m=[0,15,30,45][Math.floor(rand()*4)];
   const cand=r('R'+i,tb,{time:String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'),guests:rand()<.8?2:1,status:statuses[Math.floor(rand()*statuses.length)]});
   // on n'injecte que des états initialement cohérents
   const clash=res.some(o=>o.tables[0]===tb&&(o.status==='seated'||cand.status==='seated'||mins(o)<mins(cand)+90&&mins(cand)<mins(o)+90));
   if(!clash)res.push(cand);
  }
  const target=res.find(x=>['reserved','confirmed','late','arrived'].includes(x.status));if(!target)continue;
  const allow=rand()<.3;
  for(const dest of plan){
   const p=E.preview(base(res,plan,{reservationId:target.id,targetTables:[dest.number],allowRoomChange:allow}));
   if(!p.ok)continue;accepted++;
   assertSafe(res,finalState(res,p),p,plan,allow);
  }
 }
 assert.ok(accepted>200,'assez de cas acceptés pour être significatif ('+accepted+')');
});

test('charge : 200 couverts (~85 réservations, 40 tables), suggest < 250 ms', ()=>{
 const plan=Array.from({length:40},(_,i)=>t(i+1,{capacity:i%5===0?4:2,roomId:i<28?'main':'terrasse'}));
 const res=[];let n=0;
 for(let slot=0;slot<6;slot++)for(let tb=1;tb<=40&&n<85;tb+=2.7|0||1){
  const table=1+((tb+slot*7)%40);const time=['19:00','19:15','20:00','20:15','21:00','21:30'][slot];
  if(res.some(o=>o.tables[0]===table&&Math.abs(mins(o)-mins({date:D,time}))<90))continue;
  res.push(r('X'+n,table,{time,guests:2,status:n%9===0?'seated':'reserved'}));n++;
 }
 const target=res.find(x=>x.status==='reserved');
 const t0=process.hrtime.bigint();const s=E.suggest(base(res,plan,{reservationId:target.id,limit:2}));
 const ms=Number(process.hrtime.bigint()-t0)/1e6;
 assert.equal(s.ok,true);assert.ok(ms<250,'suggest '+ms.toFixed(1)+' ms');
});

test('intégration UI : messages d’avertissement, libellés d’affichage, installation anticipée signalée', ()=>{
 const p=E.preview(base([r('214',21,{time:'20:45',hotelRoom:'214'}),r('215',4,{time:'20:45',hotelRoom:'215'})],[t(4),t(21)],{reservationId:'214',targetTables:[4]}));
 assert.equal(p.ok,true);assert.equal(p.label,'Ch. 214');assert.equal(p.changes[0].label,'Ch. 215');
 const early=p.warnings.find(w=>w.code==='EARLY_SEATING');
 assert.ok(early&&early.minutesEarly===41&&/41 min/.test(early.message),JSON.stringify(p.warnings));
 assert.ok(p.warnings.every(w=>typeof w.message==='string'&&w.message.length));
});

test('réservation d’un autre service ou d’une autre date : OUT_OF_SERVICE (preview et suggest), ancienne API inchangée', ()=>{
 const res=[r('214',21,{date:'2026-11-27'})];
 assert.equal(E.preview(base(res,[t(4),t(21)],{reservationId:'214',targetTables:[4]})).code,'OUT_OF_SERVICE');
 assert.equal(E.suggest(base(res,[t(4),t(21)],{reservationId:'214'})).code,'OUT_OF_SERVICE');
 assert.equal(E.simulate({reservations:res,tablePlan:[t(4),t(21)],reservationId:'214',targetTable:4,now:NOW}).ok,true);
});

test('passage : mêmes règles que la RPC (installé, réservation dans la durée, maintien)', ()=>{
 const res=[r('S',1,{status:'seated'}),r('P',2,{time:'20:30'}),r('L',3,{time:'22:00'}),r('Y',5,{date:'2026-11-25',status:'seated'})];
 const holds=[{number:6,start:NOW,end:NOW+3600e3,expiry:NOW+60e3}];
 const tables=E.walkInTables(base(res,[t(1),t(2),t(3),t(4,{capacity:4}),t(5),t(6),t(7,{capacity:1})],{guests:2,duration:90,holds}));
 assert.deepEqual(tables.map(x=>x.number),[3,4]);
 assert.deepEqual(E.walkInTables(base(res,[t(3)],{guests:0})),[]);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../service-v3.js'),'utf8');
const end=source.indexOf('})();\n(function(){const k=');
assert.ok(end>0,'Rush logic IIFE exists');
const first=source.slice(0,end+5);
function elem(tag){
 return {tag,className:'',children:[],attrs:{},dataset:{},style:{},textContent:'',innerHTML:'',
  append(...x){this.children.push(...x)},
  replaceChildren(...x){this.children=x},
  setAttribute(k,v){this.attrs[k]=v},
  addEventListener(k,cb){(this.listeners??={})[k]=cb}};
}
const flatten=e=>[e,...(e.children||[]).flatMap(flatten)];
test('rush dashboard does not throw and splits 22 planned into 20 expected + 2 seated',()=>{
 const target=elem('section');
 const doc={createElement:elem,getElementById:id=>id==='rushDashboard'?target:null,addEventListener(){}};
 const win={};
 const engine={getShifts:()=>({lunch:{enabled:true,start:'00:00',end:'23:30'}}),
  isBlocking:r=>['reserved','confirmed','late','arrived','seated'].includes(r.status),
  getDefaultDuration:()=>90,rankedTableChoices:()=>[]};
 const tables={get:()=>({tables:[{number:1,capacity:4},{number:2,capacity:10},...Array.from({length:20},(_,i)=>({number:i+3,capacity:2}))]})};
 const store={getItem:()=>JSON.stringify({percent:40})};
 const app=new Function('document','window','ReservationEngine','TableStore','localStorage','setInterval',
  first+'\nreturn window.RestoRush;')(doc,win,engine,tables,store,()=>{});
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
  timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'
 }).formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 const date=parts.year+'-'+parts.month+'-'+parts.day,time=parts.hour+':30';
 const booking=(status,guests,id)=>({status,guests,id,date,time,tables:[id],walkIn:false});
 assert.doesNotThrow(()=>app.dashboard(date,[booking('reserved',20,1),booking('seated',2,2),booking('cancelled',5,3)]));
 const nodes=flatten(target);
 const expectedCards=nodes.filter(n=>n.className.startsWith('rushArrivalBreakdownItem'));
 assert.equal(expectedCards.length,3);
 const iconNodes=nodes.filter(n=>n.tag==='i'&&n.dataset?.lucide);
 assert.deepEqual(iconNodes.map(n=>n.dataset.lucide),[
  'settings','activity','calendar-clock','alert-triangle','users'
 ]);

 assert.equal(Number(expectedCards[0].children[0].textContent)+Number(expectedCards[1].children[0].textContent),20);
 assert.ok(nodes.some(n=>n.textContent==='22 / 22'));
 assert.ok(nodes.some(n=>n.textContent==='Encore à venir'));
 assert.ok(nodes.some(n=>n.textContent==='Heure prévue dépassée'));
 assert.ok(nodes.some(n=>n.textContent==='Déjà arrivés / installés'));
 assert.ok(nodes.some(n=>n.textContent==='2'));
 assert.ok(nodes.some(n=>n.className==='rushProgress'));
});

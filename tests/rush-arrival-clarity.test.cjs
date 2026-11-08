'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../service-v3.js'),'utf8');
function section(begin,end){
 const i=source.indexOf(begin),j=source.indexOf(end,i);
 assert.ok(i>=0&&j>i,'rush function markers must exist');
 return source.slice(i,j);
}
const progress= new Function('document',section('function progress(data){','// The service dashboard follows')+'\nreturn progress;')({
 createElement(tag){return {tag,attrs:{},style:{},children:[],className:'',setAttribute(k,v){this.attrs[k]=v},append(item){this.children.push(item)}}}
});
for(const [covers,limit,percent,kind] of [
 [0,22,0,'rushProgressFill'],
 [11,22,50,'rushProgressFill'],
 [18,22,100*18/22,'rushProgressFill busy'],
 [22,22,100,'rushProgressFill busy'],
 [25,22,100,'rushProgressFill full']
]){
 test('arrival gauge uses advised limit '+covers+'/'+limit,()=>{
  const gauge=progress({after:covers,limit,max:54});
  assert.equal(Number(gauge.attrs['aria-valuemax']),limit);
  assert.ok(Math.abs(parseFloat(gauge.children[0].style.width)-percent)<.0001);
  assert.equal(gauge.children[0].className,kind);
 });
}
test('suggestions exclude temporarily held and occupied tables',()=>{
 const mins=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
 const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
 const engine={
  getDefaultDuration:()=>90,
  rankedTableChoices:()=>[{numbers:[2]},{numbers:[3]}],
  validate:c=>({valid:!(c.time==='19:30'&&c.tables[0]===3)&&c.time!=='20:00'})
 };
 const app={
  RestoFusion:{pairs:()=>[]},
  RestoBookingInterval:(date,time,duration)=>[time,duration],
  RestoBookingDraft:{occupied:(tables,time)=>time==='19:30'?tables.filter(t=>t===2):[]}
 };
 const evaluateCandidate=c=>({current:c.time==='19:00'?22:0,limit:22,blocked:c.time==='19:00'});
 const suggestions=new Function('service','mins','clock','evaluate','ReservationEngine','TableStore','window',
  section('function suggestions(candidate,all,ignoreId){','function progress(data){')+'\nreturn suggestions;')(
   ()=>({start:'18:00',end:'22:00'}),mins,clock,evaluateCandidate,engine,{get:()=>({tables:[]})},app);
 // This case isolates holds and occupancy; today's clock filtering is covered
 // separately. A fixed historical day becomes time-dependent during CI runs.
 const available=suggestions({date:'2035-11-07',time:'19:00',duration:90,guests:2,tables:[2]},[]);
 assert.ok(available.some(s=>s.at==='18:30'));
 assert.ok(!available.some(s=>s.at==='19:30'||s.at==='20:00'));
 assert.ok(available.every(s=>Array.isArray(s.tables)&&s.tables.length));
});
test('forecast and live occupancy remain different sections',()=>{
 assert.match(source,/EN DIRECT · CLIENTS INSTALLÉS/);
 assert.match(source,/PRÉVISIONS · ARRIVÉES À VENIR/);
 assert.match(source,/Charge des arrivées/);
 assert.match(source,/RestoTablePressure\?\.availability/);
});

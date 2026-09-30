const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Node {
 constructor(){this.value='';this.children=[];this.events={};this.attributes={};this.style={};this.classes=new Set();this.classList={add:(...cs)=>cs.forEach(c=>this.classes.add(c)),remove:(...cs)=>cs.forEach(c=>this.classes.delete(c)),contains:c=>this.classes.has(c),toggle:(c,force)=>{const yes=force===undefined?!this.classes.has(c):force;yes?this.classes.add(c):this.classes.delete(c);return yes}};}
 addEventListener(name,fn){(this.events[name] ||= []).push(fn)}
 fire(name,event={}){for(const fn of this.events[name]||[])fn({preventDefault(){},target:this,...event})}
 append(n){this.children.push(n)} appendChild(n){this.append(n)} replaceChildren(...nodes){this.children=nodes}
 setAttribute(k,v){this.attributes[k]=v} focus(){} reset(){this.value=''}
 querySelector(){return new Node()} querySelectorAll(){return []}
 set innerHTML(value){this.html=value;this.children=[]} get innerHTML(){return this.html||''}
}
const html=fs.readFileSync('index.html','utf8');const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Node()]));
const sections={'.tables-section':new Node(),'.reservations-section':new Node()}; const ready=[];const data=new Map();let confirms=true,alerts=[];
const context={console,structuredClone,Date,Set,Math,crypto:require('node:crypto').webcrypto,setTimeout(){},setInterval(){},alert:m=>alerts.push(m),confirm:()=>confirms,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},document:{getElementById:id=>{assert(nodes.has(id),'Missing HTML element '+id);return nodes.get(id)},createElement:()=>new Node(),addEventListener:(e,fn)=>{if(e==='DOMContentLoaded')ready.push(fn)},querySelector:s=>sections[s]||null,querySelectorAll:()=>[]},window:{addEventListener(){}}};
vm.createContext(context);for(const path of ['reservation-engine.js','floor-plan.js','app.js','service-ui.js'])vm.runInContext(fs.readFileSync(path,'utf8'),context,{filename:path});
for(const fn of ready)fn();const run=s=>vm.runInContext(s,context);const node=id=>nodes.get(id);
assert.equal(node('tablesGrid').children.length,21);assert.equal(run('TABLES.length'),21);assert.equal(run('CAPACITY[25]'),10);
node('editPlanBtn').fire('click');node('addTableBtn').fire('click');node('tableNumberInput').value='26';node('tableCapacityInput').value='4';node('tableShapeInput').value='round';node('tableEditForm').fire('submit');assert.equal(run('floorDraft.tables.length'),22);assert.equal(run('TABLES.length'),21);
node('savePlanBtn').fire('click');assert.equal(run('TABLES.length'),22);assert.equal(run('CAPACITY[26]'),4);
assert.equal(run("ReservationEngine.validate({client:'Test',type:'exterieur',date:'2026-10-01',time:'19:00',duration:90,guests:4,tables:[26]},[]).valid"),true);
run("reservations=[{id:'protected',tables:[26],status:'reserved',guests:4,date:'2026-10-01',time:'19:00',duration:90,type:'hotel',client:'214'}]");node('editPlanBtn').fire('click');run("openTableEditor(floorDraft.tables.find(t=>t.number===26).id)");node('deleteTableBtn').fire('click');assert.match(node('tableEditError').textContent,/liée/);node('tableCapacityInput').value='2';node('tableEditForm').fire('submit');assert.match(node('tableEditError').textContent,/insuffisante/);
node('cancelPlanBtn').fire('click');assert.equal(run('floorDraft'),null);assert.equal(run('CAPACITY[26]'),4);
node('roomName').value='Terrasse';node('roomForm').fire('submit');assert.equal(run('floorDraft.rooms.length'),2);node('savePlanBtn').fire('click');assert.equal(run('FloorPlan.get().rooms.length'),2);
node('listTab').fire('click');assert(sections['.tables-section'].classes.has('hidden'));node('planTab').fire('click');assert(!sections['.tables-section'].classes.has('hidden'));
assert.equal(run("ReservationEngine.validate({client:'214',type:'hotel',date:'2026-10-01',time:'19:30',duration:90,guests:2,tables:[1]},reservations).valid"),false);
const stored=JSON.parse(data.get('restomanager_floor_plan_v1'));assert.equal(stored.tables.find(t=>t.number===26).capacity,4);
console.log('PASS: startup, draft isolation, table creation, capacity, reference protection, cancel, rooms, navigation, room conflict, persistence.');

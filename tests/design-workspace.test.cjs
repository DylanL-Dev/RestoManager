const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Node {
 constructor(){this.clientWidth=580;this.clientHeight=580;this.scrollLeft=0;this.scrollTop=0;this.value='';this.children=[];this.events={};this.attributes={};this.style={};this.classes=new Set();this.classList={add:(...cs)=>cs.forEach(c=>this.classes.add(c)),remove:(...cs)=>cs.forEach(c=>this.classes.delete(c)),contains:c=>this.classes.has(c),toggle:(c,force)=>{const yes=force===undefined?!this.classes.has(c):force;yes?this.classes.add(c):this.classes.delete(c);return yes}};}
 addEventListener(name,fn){(this.events[name] ||= []).push(fn)}
 fire(name,event={}){for(const fn of this.events[name]||[])fn({preventDefault(){},target:this,...event})}
 append(n){this.children.push(n)} appendChild(n){this.append(n)} replaceChildren(...nodes){this.children=nodes}
 getBoundingClientRect(){return {left:0,top:0,width:580,height:580}}
 setPointerCapture(){} closest(){return null}
 setAttribute(k,v){this.attributes[k]=v} focus(){} reset(){this.value=''}
 querySelector(){return new Node()} querySelectorAll(){return []}
 set innerHTML(value){this.html=value;this.children=[]} get innerHTML(){return this.html||''}
}
const html=fs.readFileSync('index.html','utf8');const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Node()]));
const sections={'.tables-section':new Node(),'.reservations-section':new Node()}; const ready=[];const data=new Map();let confirms=true,alerts=[];
const context={console,structuredClone,Date,Set,Math,crypto:require('node:crypto').webcrypto,setTimeout(){},setInterval(){},alert:m=>alerts.push(m),confirm:()=>confirms,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},document:{getElementById:id=>{assert(nodes.has(id),'Missing HTML element '+id);return nodes.get(id)},createElement:()=>new Node(),addEventListener:(e,fn)=>{if(e==='DOMContentLoaded')ready.push(fn)},querySelector:s=>sections[s]||null,querySelectorAll:()=>[]},window:{addEventListener(){}}};
vm.createContext(context);for(const path of ['reservation-engine.js','floor-plan.js','app.js','service-ui.js','floor-zoom.js'])vm.runInContext(fs.readFileSync(path,'utf8'),context,{filename:path});
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

const positions=run('JSON.stringify(FloorPlan.get().tables)');
node('zoomInBtn').fire('click');assert.equal(run('FloorZoom.getScale()'),1.2);
node('zoomOutBtn').fire('click');assert.equal(run('FloorZoom.getScale()'),1);
node('floorViewport').fire('wheel',{deltaY:-100,deltaMode:0,clientX:200,clientY:200});assert(run('FloorZoom.getScale()')>1);
run('FloorZoom.setScale(100)');assert.equal(run('FloorZoom.getScale()'),2.5);run('FloorZoom.setScale(0.01)');assert.equal(run('FloorZoom.getScale()'),0.4);
node('floorViewport').fire('touchstart',{touches:[{clientX:0,clientY:0},{clientX:100,clientY:0}]});assert(run('FloorZoom.isPinching()'));
node('floorViewport').fire('touchmove',{touches:[{clientX:0,clientY:0},{clientX:200,clientY:0}]});assert.equal(run('FloorZoom.getScale()'),0.8);
node('floorViewport').fire('touchend',{touches:[]});assert(!run('FloorZoom.isPinching()'));assert(run('FloorZoom.ignoreClick()'));
node('floorViewport').clientWidth=348;node('zoomFitBtn').fire('click');assert.equal(run('FloorZoom.getScale()'),348/576);assert.equal(node('floorViewport').scrollLeft,0);
assert.equal(run('JSON.stringify(FloorPlan.get().tables)'),positions);
console.log('PASS: zoom buttons, wheel, pinch, scale limits, mobile fit and table position preservation.');

// Room dimensions change the physical space without scaling the furniture.
run("floorRoom='main';startFloorEdit();");
const before=run('structuredClone(floorDraft.tables[0])');
run("FloorPlan.resizeRoom(floorDraft,'main',60,30)");
const after=run('structuredClone(floorDraft.tables[0])');
assert.equal(after.width,before.width);assert.equal(after.depth,before.depth);
assert(Math.abs(after.x*60-before.x*12)<1e-8);assert(Math.abs(after.y*30-before.y*12)<1e-8);
run('afficherTables()');assert.match(node('roomDimensionsLabel').textContent,/60 × 30/);
node('zoomFitBtn').fire('click');assert(run('FloorZoom.getScale()')<0.4);
node('addElementBtn').fire('click');node('elementTypeInput').value='bar';node('elementTypeInput').fire('change');node('elementForm').fire('submit');assert.equal(run('floorDraft.elements.length'),1);
node('rotateElementBtn').fire('click');assert.equal(Number(node('elementWidthInput').value),0.8);
node('savePlanBtn').fire('click');assert.equal(run('FloorPlan.get().elements.length'),1);assert.equal(run('TABLES.length'),22);
run('startFloorEdit()');assert.throws(()=>run("FloorPlan.resizeRoom(floorDraft,'main',1,1)"),/trop petite/);assert.equal(run("floorDraft.rooms.find(r=>r.id==='main').width"),60);
// Large layouts no longer stop at 25 grid slots.
assert(run(`(() => { const p={version:2,rooms:[{id:'main',name:'Large',width:60,depth:60}],tables:[],elements:[]};for(let i=0;i<50;i++){const t={id:'t'+i,number:i+1,roomId:'main',shape:'square',capacity:2,width:1,depth:1,x:0,y:0};const spot=FloorPlan.freeSpot(p,t);if(!spot)return false;Object.assign(t,spot);p.tables.push(t);}return FloorPlan.valid(p)&&p.tables.length===50;})()`));
assert(run(`(() => { const old={version:1,rooms:[{id:'main',name:'Original'}],tables:[{id:'t1',number:1,capacity:2,roomId:'main',shape:'square',x:83,y:83},{id:'t25',number:25,capacity:10,roomId:'main',shape:'rectangle',x:3,y:83}]};const p=FloorPlan.migrate(old);return FloorPlan.valid(p)&&p.tables[0].x===83&&p.tables[1].number===25; })()`));
console.log('PASS: independent dimensions, unchanged physical placement, large-room fit, furniture, shrink protection, >25 tables and legacy migration.');

node('floorViewport').scrollLeft=200;node('floorViewport').scrollTop=200;
node('floorViewport').fire('pointerdown',{pointerType:'mouse',button:0,clientX:200,clientY:200,pointerId:1});
node('floorViewport').fire('pointermove',{clientX:100,clientY:150});assert.equal(node('floorViewport').scrollLeft,300);assert.equal(node('floorViewport').scrollTop,250);
node('floorViewport').fire('pointerup');assert(!node('floorViewport').classes.has('panning'));
const tableBeforeMove=run('floorDraft.tables[0].x');const roomWidth=run("floorDraft.rooms.find(r=>r.id==='main').width");
run('afficherTables()');node('tablesGrid').children[0].fire('keydown',{key:'ArrowRight'});
assert(Math.abs(run('floorDraft.tables[0].x')-tableBeforeMove-10/roomWidth)<1e-8);
console.log('PASS: mouse panning and fixed 10 cm keyboard movement.');

const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Node {
 constructor(){this.dataset={};this.clientWidth=580;this.clientHeight=580;this.scrollLeft=0;this.scrollTop=0;this.value='';this.children=[];this.events={};this.attributes={};this.style={};this.classes=new Set();this.classList={add:(...cs)=>cs.forEach(c=>this.classes.add(c)),remove:(...cs)=>cs.forEach(c=>this.classes.delete(c)),contains:c=>this.classes.has(c),toggle:(c,force)=>{const yes=force===undefined?!this.classes.has(c):force;yes?this.classes.add(c):this.classes.delete(c);return yes}};}
 addEventListener(name,fn){(this.events[name] ||= []).push(fn)}
 fire(name,event={}){for(const fn of this.events[name]||[])fn({preventDefault(){},target:this,...event})}
 append(n){this.children.push(n)} appendChild(n){this.append(n)} replaceChildren(...nodes){this.children=nodes}
 getBoundingClientRect(){return {left:0,top:0,width:580,height:580}}
 setPointerCapture(){} closest(){return null}
 getAttribute(k){return this.attributes[k]} scrollIntoView(){} setAttribute(k,v){this.attributes[k]=v} focus(){} reset(){this.value=''}
 querySelector(){return new Node()} querySelectorAll(){return []}
 set innerHTML(value){this.html=value;this.children=[]} get innerHTML(){return this.html||''}
}
const html=fs.readFileSync('index.html','utf8');const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Node()]));
const sections={'.tables-section':new Node(),'.reservations-section':new Node()}; const ready=[];const data=new Map();let confirms=true,alerts=[];
const context={console,structuredClone,Date,Set,Math,crypto:require('node:crypto').webcrypto,setTimeout(){},setInterval(){},alert:m=>alerts.push(m),confirm:()=>confirms,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},document:{getElementById:id=>{assert(nodes.has(id),'Missing HTML element '+id);return nodes.get(id)},createElement:()=>new Node(),addEventListener:(e,fn)=>{if(e==='DOMContentLoaded')ready.push(fn)},querySelector:s=>sections[s]||null,querySelectorAll:()=>[]},window:{addEventListener(){}}};
vm.createContext(context);for(const path of ['reservation-engine.js','floor-plan.js','app.js','floor-3d.js','service-ui.js','floor-zoom.js','table-service.js'])vm.runInContext(fs.readFileSync(path,'utf8'),context,{filename:path});
for(const fn of ready)fn();const run=s=>vm.runInContext(s,context);const node=id=>nodes.get(id);
assert.equal(node('tablesGrid').children.length,1);assert.equal(run('TABLES.length'),1);assert.equal(run('CAPACITY[1]'),2);
node('editPlanBtn').fire('click');node('addTableBtn').fire('click');node('tableNumberInput').value='26';node('tableCapacityInput').value='4';node('tableShapeInput').value='round';node('tableEditForm').fire('submit');assert.equal(run('floorDraft.tables.length'),2);assert.equal(run('TABLES.length'),1);
node('savePlanBtn').fire('click');assert.equal(run('TABLES.length'),2);assert.equal(run('CAPACITY[26]'),4);
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
node('rotateElementBtn').fire('click');assert.equal(Number(node('elementWidthInput').value),300);assert.equal(Number(node('elementAngleInput').value),90);
node('savePlanBtn').fire('click');assert.equal(run('FloorPlan.get().elements.length'),1);assert.equal(run('TABLES.length'),2);
run('startFloorEdit()');assert.throws(()=>run("FloorPlan.resizeRoom(floorDraft,'main',1,1)"),/trop petite/);assert.equal(run("floorDraft.rooms.find(r=>r.id==='main').width"),60);
// Large layouts no longer stop at 25 grid slots.
assert(run(`(() => { const p={version:3,rooms:[{id:'main',name:'Large',width:60,depth:60,floor:'plain'}],tables:[],elements:[]};for(let i=0;i<50;i++){const t=FloorPlan.tableOptions({id:'t'+i,number:i+1,roomId:'main',shape:'square',capacity:2,width:1,depth:1,x:0,y:0});const spot=FloorPlan.freeSpot(p,t);if(!spot)return false;Object.assign(t,spot);p.tables.push(t);}return FloorPlan.valid(p)&&p.tables.length===50;})()`));
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

// Floors persist per room, while cancelled changes remain a draft.
node('roomDimensionsBtn').fire('click');node('floorWoodBtn').fire('click');node('roomDimensionsForm').fire('submit');assert(node('tablesGrid').classes.has('floor-wood'));
node('savePlanBtn').fire('click');assert.equal(run("FloorPlan.get().rooms.find(r=>r.id==='main').floor"),'wood');assert.equal(run("FloorPlan.get().rooms.find(r=>r.id!=='main').floor"),'plain');
node('editPlanBtn').fire('click');node('roomDimensionsBtn').fire('click');node('floorStoneBtn').fire('click');node('roomDimensionsForm').fire('submit');assert(node('tablesGrid').classes.has('floor-stone'));node('cancelPlanBtn').fire('click');assert(node('tablesGrid').classes.has('floor-wood'));
// The editor writes colours, cm dimensions, suffixes and a free rotation angle.
node('editPlanBtn').fire('click');run("Object.assign(floorDraft.tables.find(t=>t.number===26),{x:50,y:50})");run("openTableEditor(floorDraft.tables.find(t=>t.number===26).id)");node('tableLetterInput').value='A';node('tableMinCapacityInput').value='2';node('tableColorInput').value='#28734f';node('tableAnglePlus').fire('click');node('tableEditForm').fire('submit');
assert.equal(run('floorDraft.tables.find(t=>t.number===26).angle'),45);assert.equal(run('floorDraft.tables.find(t=>t.number===26).color'),'#28734f');assert.equal(run('floorDraft.tables.find(t=>t.number===26).width'),1.2);
node('savePlanBtn').fire('click');assert.equal(run('FloorPlan.label(26)'),'T26A');assert.equal(run('CAPACITY[26]'),4);
node('editPlanBtn').fire('click');run("openTableEditor(floorDraft.tables.find(t=>t.number===26).id)");node('tableMinCapacityInput').value=5;node('tableEditForm').fire('submit');assert.match(node('tableEditError').textContent,/minimum/);node('tableMinCapacityMinus').fire('click');assert.equal(Number(node('tableMinCapacityInput').value),4);
node('tableShapeInput').value='bench';node('tableSizeMedium').fire('click');assert.equal(Number(node('tableWidthInput').value),190);assert.equal(Number(node('tableDepthInput').value),80);
// Rotated footprints must fit the room and spacing uses physical distance.
assert(run(`(()=>{const p={rooms:[{id:'main',width:10,depth:10}]};const t={id:'a',roomId:'main',x:90,y:0,width:2,depth:1,angle:90};return FloorPlan.inside(p,t)&&!FloorPlan.inside(p,{...t,x:91});})()`));
assert(run(`(()=>{const a={id:'a',roomId:'main',x:0,y:0,width:1,depth:1,angle:0},b={...a,id:'b',x:19};const p={rooms:[{id:'main',width:10,depth:10}],tables:[a,b]};if(Math.abs(FloorPlan.gap(p,a,b)-0.9)>1e-8||FloorPlan.nearby(p,a).length)return false;b.x=18;return FloorPlan.nearby(p,a).length===1;})()`));
assert(run(`(()=>{const p={version:2,rooms:[{id:'main',name:'Saved',width:12,depth:8}],tables:[],elements:[{id:'bar',type:'bar',label:'Bar',roomId:'main',x:0,y:0,width:3,depth:0.8}]};const m=FloorPlan.migrate(p);return FloorPlan.valid(m)&&m.version===3&&m.rooms[0].floor==='plain'&&m.elements[0].angle===0;})()`));
console.log('PASS: floor rendering classes/persistence/cancel, cm sizes, colours, angle, suffix, min/max, presets, rotated bounds, 90 cm spacing, v2 migration and vector art.');

// A table click opens its service sheet, never immediately opens a booking form.
run("floorDraft=null;floorRoom='main';reservations=[{id:'service-first',tables:[1],status:STATUS.RESERVED,guests:2,date:getServiceDate(),time:'19:00',duration:90,type:'hotel',client:'214'},{id:'service-next',tables:[1],status:STATUS.RESERVED,guests:2,date:getServiceDate(),time:'20:30',duration:60,type:'exterieur',client:'Martin'}];cliquerTable(1)");
assert.equal(run('serviceTableNumber'),1);assert(!node('tableServiceModal').classes.has('hidden'));
assert.equal(run('tableServiceReservations(1)[0].id'),'service-first');
assert.equal(run('serviceEndTime(reservations[0])'),'20:30');
let actions=node('tableServiceContent').children[2];assert(!actions.children[0].disabled);assert(actions.children[1].disabled);
actions.children[0].fire('click');assert.equal(run('reservations[0].status'),'arrived');
actions=node('tableServiceContent').children[2];assert(!actions.children[1].disabled);actions.children[1].fire('click');assert.equal(run('reservations[0].status'),'seated');
confirms=false;node('tableServiceContent').children[2].children[2].fire('click');assert.equal(run('reservations[0].status'),'seated');
confirms=true;node('tableServiceContent').children[2].children[2].fire('click');assert.equal(run('reservations[0].status'),'completed');assert.equal(run('tableServiceReservations(1)[0].id'),'service-next');
run('cliquerTable(26)');assert.match(node('tableServiceContent').children[1].textContent,/Aucune réservation/);
node('tableServiceContent').children[2].fire('click');assert.equal(run('serviceTableNumber'),null);assert(!node('reservationModal').classes.has('hidden'));
console.log('PASS: service sheet, arrivals, seating, confirmed release, next booking and free-table booking.');
assert(run(`(()=>{const p=FloorPlan.get();const spot=FloorPlan.freeSpot(p,{roomId:'main',width:.5,depth:.5,angle:0});p.elements.push(FloorPlan.itemOptions({id:'lamp-test',type:'lamp',label:'Lampe',roomId:'main',width:.5,depth:.5,...spot}));return FloorPlan.valid(p);})()`));
assert.equal(node('furnitureCatalog').children.length,14);
console.log('PASS: furniture types and visual catalog.');
// Rotating genuine geometry must preserve heights and the physical floor centre.
assert(run(`(()=>{const p=[.5,.7,.2],r=Floor3D.rotate(p,Math.PI/2);return r[1]===p[1]&&Math.abs(r[0]-.2)<1e-9&&Math.abs(r[2]+.5)<1e-9;})()`));
assert.notEqual(run("Floor3D.shade('#ad814f',[0,0,1])"),run("Floor3D.shade('#ad814f',[1,0,0])"));
run("floorDraft=FloorPlan.get();floorRoom='main';");
const rotationCentre=run(`(()=>{const t=floorDraft.tables[0],b=FloorPlan.bounds(t),r=floorDraft.rooms[0];return [t.x*r.width/100+b.width/2,t.y*r.depth/100+b.depth/2];})()`);
assert(run('rotateFloorTable(floorDraft.tables[0],90)'));
assert(run(`(()=>{const t=floorDraft.tables[0],b=FloorPlan.bounds(t),r=floorDraft.rooms[0];return Math.abs(t.x*r.width/100+b.width/2-${rotationCentre[0]})<1e-9&&Math.abs(t.y*r.depth/100+b.depth/2-${rotationCentre[1]})<1e-9;})()`));
run('afficherTables()');assert.match(node('tablesGrid').children[0].innerHTML,/geometry-3d/);
node('rotationSnapToggle').fire('click');assert.equal(run('snapFloorRotation'),false);
console.log('PASS: vertical-axis 3D rotation, fixed lighting, floor-centre preservation, free rotation.');
for(const type of ['bar','buffet','reception','sofa','chair','plant','lamp','wall','pillar','door','window','kitchen','toilets']) {
    for(const angle of [0,45,90,180,270]) {
        const svg=run(`Floor3D.render({type:'${type}',width:1.2,depth:.8,angle:${angle},color:'#ad814f'})`);
        assert.match(svg,/<polygon/);assert.doesNotMatch(svg,/NaN|Infinity/);
    }
}
run('floorDraft=null;afficherTables()');assert(node('rotationSnapToggle').classes.has('hidden'));
run('startFloorEdit()');assert(!node('rotationSnapToggle').classes.has('hidden'));
console.log('PASS: structural furniture at five orientations and editing-only rotation control.');

run("floorDraft=FloorPlan.get();floorRoom='main';");
const resizeStart=run("({...floorDraft.tables[0]})");
assert(run('resizeFloorItem(floorDraft.tables[0],1.3)'));
assert(Math.abs(run('floorDraft.tables[0].width')-resizeStart.width*1.3)<1e-9);
assert.equal(run('floorDraft.tables[0].x'),resizeStart.x);
assert.equal(run('floorDraft.tables[0].capacity'),resizeStart.capacity);
assert(run('resizeFloorItem(floorDraft.tables[0],.7)'));
assert(run('resizeFloorItem(floorDraft.tables[0],1000)'));
assert(run('FloorPlan.inside(floorDraft,floorDraft.tables[0])'));
run("floorDraft=FloorPlan.get();afficherTables()");
const sizeHandle=node('tablesGrid').children[0].children.find(n=>n.className==='resize-handle');
assert(sizeHandle);
const gestureWidth=run('floorDraft.tables[0].width');
sizeHandle.fire('pointerdown',{button:0,clientX:100,clientY:100,pointerId:1,stopPropagation(){}});
sizeHandle.fire('pointermove',{clientX:158,clientY:158,stopPropagation(){}});
sizeHandle.fire('pointerup',{stopPropagation(){}});
assert(Math.abs(run('floorDraft.tables[0].width')-gestureWidth*1.1)<1e-9);
run('floorDraft=null;afficherTables()');
assert(!node('tablesGrid').children[0].children.some(n=>n.className==='resize-handle'));
console.log('PASS: direct resize gesture, proportional dimensions, room limits, capacity preservation and editing-only handles.');
run("floorDraft=FloorPlan.get();floorRoom='main';reservations=[];history=[]");
const simpleSavedCount=run('FloorPlan.get().tables.length');
confirms=false;node('startSimplePlanBtn').fire('click');assert.equal(run('floorDraft.tables.length'),simpleSavedCount);
confirms=true;node('startSimplePlanBtn').fire('click');assert.equal(run("floorDraft.tables.filter(t=>t.roomId==='main').length"),1);assert.equal(run('FloorPlan.get().tables.length'),simpleSavedCount);
node('addTableBtn').fire('click');assert.equal(Number(node('tableNumberInput').value),2);
console.log('PASS: single-table defaults, reversible one-table restart and progressive numbering.');
// Advance past the earlier pinch suppression interval before testing fresh clicks.
context.Date=class extends Date { static now(){return Date.now()+1000;} };
// A mixed selection moves as a rigid group, including against room edges.
run(`floorDraft=FloorPlan.get();floorRoom='main';multiSelectMode=false;floorSelection.clear();floorDraft.tables[0].x=10;floorDraft.tables[0].y=10;floorDraft.elements.push(FloorPlan.itemOptions({id:'group-plant',roomId:'main',type:'plant',label:'Plante',width:.6,depth:.6,x:35,y:25,angle:45}));afficherTables();`);
node('multiSelectBtn').fire('click');
const firstGroupTable=node('tablesGrid').children.find(n=>n.getAttribute('data-table-number')==='1');
const groupPlant=node('tablesGrid').children.find(n=>n.getAttribute('data-floor-id')==='group-plant');
firstGroupTable.fire('click');groupPlant.fire('click');assert.equal(run('floorSelection.size'),2);
assert(firstGroupTable.classes.has('group-selected'));assert(groupPlant.classes.has('group-selected'));
firstGroupTable.fire('pointerdown',{button:0,clientX:100,clientY:100,pointerId:4});
firstGroupTable.fire('pointermove',{clientX:158,clientY:158});firstGroupTable.fire('pointerup');firstGroupTable.fire('click');
assert.equal(run('floorDraft.tables[0].x'),20);assert.equal(run("floorDraft.elements.find(t=>t.id==='group-plant').x"),45);assert.equal(run('floorSelection.size'),2);
run(`(()=>{const items=selectedRoomItems();moveFloorGroup(items,items.map(t=>({x:t.x,y:t.y})),1000,1000);})()`);
assert(run("selectedRoomItems().every(t=>FloorPlan.inside(floorDraft,t))"));
assert(Math.abs(run("floorDraft.elements.find(t=>t.id==='group-plant').x-floorDraft.tables[0].x")-25)<1e-9);
confirms=true;node('cancelPlanBtn').fire('click');assert.equal(run('floorSelection.size'),0);assert.equal(run('multiSelectMode'),false);
assert(!run("FloorPlan.get().elements.some(t=>t.id==='group-plant')"));
console.log('PASS: mixed multi-selection, pointer group drag, preserved spacing, room boundary clamp and cancel.');
run(`floorDraft=FloorPlan.get();floorRoom='main';multiSelectMode=true;floorSelection.clear();Object.assign(floorDraft.tables[0],{x:10,y:10,width:1,depth:1,angle:45});floorDraft.elements.push(FloorPlan.itemOptions({id:'scale-plant',roomId:'main',type:'plant',label:'Plante',width:.6,depth:.6,x:30,y:25,angle:90}));floorSelection.add(floorDraft.tables[0].id);floorSelection.add('scale-plant');afficherTables();`);
const scaleHandle=node('tablesGrid').children[0].children.find(n=>n.className==='resize-handle');
scaleHandle.fire('pointerdown',{button:0,clientX:0,clientY:0,pointerId:2,stopPropagation(){}});
scaleHandle.fire('pointermove',{clientX:290,clientY:290,stopPropagation(){}});
scaleHandle.fire('pointerup',{stopPropagation(){}});
assert.equal(run('floorDraft.tables[0].width'),1.5);
assert(Math.abs(run("floorDraft.elements.find(t=>t.id==='scale-plant').width")-.9)<1e-9);
assert.equal(run("floorDraft.elements.find(t=>t.id==='scale-plant').x"),40);
assert.equal(run('floorDraft.tables[0].angle'),45);
assert(run(`(()=>{const a=selectedRoomItems();return resizeFloorGroup(a,a.map(t=>({...t})),.5);})()`));
assert.equal(run('floorDraft.tables[0].width'),.75);
assert(run(`(()=>{const a=selectedRoomItems();resizeFloorGroup(a,a.map(t=>({...t})),1000);return a.every(t=>FloorPlan.inside(floorDraft,t));})()`));
console.log('PASS: group resize pointer gesture, shared scale, spacing, rotations and room bounds.');

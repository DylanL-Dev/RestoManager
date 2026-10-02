const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Node {
 constructor(){this.dataset={};this.clientWidth=580;this.clientHeight=580;this.scrollLeft=0;this.scrollTop=0;this.value='';this.children=[];this.events={};this.attributes={};this.style={setProperty(name,value){this[name]=value;}};this.classes=new Set();this.classList={add:(...cs)=>cs.forEach(c=>this.classes.add(c)),remove:(...cs)=>cs.forEach(c=>this.classes.delete(c)),contains:c=>this.classes.has(c),toggle:(c,force)=>{const yes=force===undefined?!this.classes.has(c):force;yes?this.classes.add(c):this.classes.delete(c);return yes}};}
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
vm.createContext(context);for(const path of ['reservation-engine.js','floor-plan.js','app.js','floor-3d.js','service-ui.js','floor-zoom.js','table-service.js','editor-workspace.js'])vm.runInContext(fs.readFileSync(path,'utf8'),context,{filename:path});
for(const fn of ready)fn();const run=s=>vm.runInContext(s,context);const node=id=>nodes.get(id);
assert.equal(node('tablesGrid').children.filter(n=>n.getAttribute('data-table-number')).length,1);assert.equal(run('TABLES.length'),1);assert.equal(run('CAPACITY[1]'),2);
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
run(`floorDraft=FloorPlan.get();floorRoom='main';floorDraft.rooms[0].autoSize=false;alignmentEnabled=false;multiSelectMode=false;floorSelection.clear();floorDraft.tables[0].x=10;floorDraft.tables[0].y=10;floorDraft.elements.push(FloorPlan.itemOptions({id:'group-plant',roomId:'main',type:'plant',label:'Plante',width:.6,depth:.6,x:35,y:25,angle:45}));afficherTables();`);
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
run(`floorDraft=FloorPlan.get();floorRoom='main';floorDraft.rooms[0].autoSize=false;multiSelectMode=true;floorSelection.clear();Object.assign(floorDraft.tables[0],{x:10,y:10,width:1,depth:1,angle:45});floorDraft.elements.push(FloorPlan.itemOptions({id:'scale-plant',roomId:'main',type:'plant',label:'Plante',width:.6,depth:.6,x:30,y:25,angle:90}));floorSelection.add(floorDraft.tables[0].id);floorSelection.add('scale-plant');afficherTables();`);
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
run(`floorDraft={version:3,rooms:[{id:'main',name:'Test',width:10,depth:10,floor:'plain'}],tables:[],elements:[FloorPlan.itemOptions({id:'snap-a',roomId:'main',type:'bar',label:'A',width:1,depth:1,x:10,y:10}),FloorPlan.itemOptions({id:'snap-b',roomId:'main',type:'bar',label:'B',width:1,depth:1,x:40,y:40})]};floorRoom='main';`);
let snapped=run(`snapFloorGroup([floorDraft.elements[0]],[{x:10,y:10}],29.4,18,{width:1000,height:1000})`);
assert.equal(snapped.dx,30);assert([40,45,50].includes(snapped.x));
assert.equal(snapped.dy,18);assert.equal(snapped.y,undefined);
snapped=run(`snapFloorGroup([floorDraft.elements[0]],[{x:10,y:10}],29.4,18,{width:2000,height:2000})`);
assert.equal(snapped.dx,29.4);assert.equal(snapped.x,undefined);
snapped=run(`snapFloorGroup([floorDraft.elements[0]],[{x:10,y:10}],34.6,18,{width:1000,height:1000})`);
assert.equal(snapped.dx,35);
run('showAlignmentGuides({x:50,y:50})');assert(run('alignmentGuides.every(g=>!g.classList.contains("hidden"))'));
run('hideAlignmentGuides()');assert(run('alignmentGuides.every(g=>g.classList.contains("hidden"))'));
console.log('PASS: edge and centre snapping, screen-space threshold across zoom levels, and guide cleanup.');

run("floorDraft={version:3,rooms:[{id:'main',name:'Test',width:20,depth:20,floor:'plain'}],tables:[],elements:[]};floorRoom='main';FloorZoom.updateRoom(floorDraft,floorRoom);FloorZoom.setScale(2)");
node('floorViewport').scrollLeft=600;node('floorViewport').scrollTop=400;
let central=run("visibleFurnitureSpot({roomId:'main',width:1,depth:1,angle:0})");
assert(Math.abs(central.x-((600+node('floorViewport').clientWidth/2)/1920*100-2.5))<1e-9);
assert(Math.abs(central.y-((400+node('floorViewport').clientHeight/2)/1920*100-2.5))<1e-9);
run(`floorDraft.elements.push(FloorPlan.itemOptions({id:'last-bar',roomId:'main',type:'bar',label:'Bar',width:6,depth:1.6,x:0,y:0}));rememberAddedFurniture(floorDraft.elements[0]);`);
assert.deepEqual(Array.from(run("suggestedFurnitureSize('chair')")),[1.1,1.1]);
assert.deepEqual(Array.from(run('suggestedFurnitureSize()')),[2.4,2.4]);
run('floorDraft.elements[0].width=3;floorDraft.elements[0].depth=.8');
assert.deepEqual(Array.from(run('suggestedFurnitureSize()')),[1.2,1.2]);
run(`floorDraft.elements.push(FloorPlan.itemOptions({id:'obstacle',roomId:'main',type:'chair',label:'Chaise',width:1,depth:1,x:${central.x},y:${central.y}}))`);
const nearbySpot=run("visibleFurnitureSpot({roomId:'main',width:1,depth:1,angle:0})");
assert(Math.hypot(nearbySpot.x-central.x,nearbySpot.y-central.y)>0);
assert(run(`!FloorPlan.overlaps(floorDraft,{roomId:'main',width:1,depth:1,angle:0,x:${nearbySpot.x},y:${nearbySpot.y}},floorDraft.elements[1])`));
console.log('PASS: visible-centre placement after zoom/pan, nearby vacancy and inherited furniture scale.');

// Automatic room growth preserves physical geometry, group offsets and camera.
run("floorDraft=FloorPlan.defaults();floorRoom='main';FloorZoom.updateRoom(floorDraft,floorRoom);FloorZoom.setScale(1.5)");
node('floorViewport').scrollLeft=100;node('floorViewport').scrollTop=120;
const growScale=run('FloorZoom.getScale()');
run("floorDraft.elements.push(FloorPlan.itemOptions({id:'grow-bar',roomId:'main',type:'bar',label:'Bar',width:3,depth:1,x:-10,y:-20,angle:90}))");
const beforeGrow=run('structuredClone(floorDraft)');
const growth=run('expandFloor()');
assert(growth.x>0&&growth.y>0);assert.equal(run('FloorZoom.getScale()'),growScale);
assert.equal(node('floorViewport').scrollLeft,100+growth.x*48*growScale);
assert.equal(node('floorViewport').scrollTop,120+growth.y*48*growScale);
assert(run('FloorPlan.valid(floorDraft)'));
for(const old of beforeGrow.tables.concat(beforeGrow.elements)){
 const updated=run(`floorDraft.tables.concat(floorDraft.elements).find(t=>t.id==='${old.id}')`);
 assert.equal(updated.width,old.width);assert.equal(updated.depth,old.depth);assert.equal(updated.angle,old.angle);
 assert(Math.abs(updated.x*growth.width/100-old.x*growth.oldWidth/100-growth.x)<1e-9);
 assert(Math.abs(updated.y*growth.depth/100-old.y*growth.oldDepth/100-growth.y)<1e-9);
}
assert.equal(run('expandFloor()'),null);
run('floorDraft.elements=[]');assert.equal(run('expandFloor()'),null);
run('FloorPlan.save(floorDraft)');assert.equal(run('FloorPlan.get().rooms[0].width'),growth.width);
// A crowded visible region expands rather than placing another object over it.
run("floorDraft=FloorPlan.defaults();floorDraft.tables=[];floorDraft.elements=[FloorPlan.itemOptions({id:'full',roomId:'main',type:'bar',label:'Full',width:12,depth:12,x:0,y:0})];FloorZoom.updateRoom(floorDraft,floorRoom);FloorZoom.fit()");
const expandedSpot=run("visibleFurnitureSpot({id:'new',roomId:'main',width:2,depth:2,angle:0})");
assert(run('floorDraft.rooms[0].width>12'));
assert(run(`!FloorPlan.overlaps(floorDraft,{id:'new',roomId:'main',width:2,depth:2,angle:0,x:${expandedSpot.x},y:${expandedSpot.y}},floorDraft.elements[0])`));
// Consecutive pointer events keep moving after growth, without resetting the zoom.
run("floorDraft=FloorPlan.defaults();floorDraft.tables[0].x=85;floorDraft.tables[0].y=50;multiSelectMode=false;floorSelection.clear();alignmentEnabled=false;afficherTables();FloorZoom.setScale(1)");
const growingTable=node('tablesGrid').children.find(n=>n.getAttribute('data-table-number')==='1');
growingTable.fire('pointerdown',{button:0,clientX:100,clientY:100,pointerId:8});
growingTable.fire('pointermove',{clientX:158,clientY:100});
const firstPhysical=run('floorDraft.tables[0].x*floorDraft.rooms[0].width/100');
growingTable.fire('pointermove',{clientX:180,clientY:100});growingTable.fire('pointerup');
assert(run('floorDraft.tables[0].x*floorDraft.rooms[0].width/100')>firstPhysical);
assert(run('FloorPlan.valid(floorDraft)'));assert.equal(run('FloorZoom.getScale()'),1);
// Huge furniture expands on insertion; fixed mode continues to enforce limits.
run("floorDraft=FloorPlan.defaults();FloorZoom.updateRoom(floorDraft,floorRoom)");
assert(run("visibleFurnitureSpot({id:'big',roomId:'main',width:20,depth:4,angle:45})")!==null);
assert(run('floorDraft.rooms[0].width>12&&floorDraft.rooms[0].depth>12'));
run('floorDraft.rooms[0].autoSize=false');assert.equal(run("visibleFurnitureSpot({id:'too-big',roomId:'main',width:100,depth:100,angle:0})"),null);
console.log('PASS: automatic four-sided growth, stable geometry/camera, no shrink, persistence, crowded insertion and continuous drag.');

run("floorDraft=FloorPlan.defaults();floorRoom='main';floorDraft.tables[0].x=85;floorDraft.tables[0].y=85;afficherTables();FloorZoom.setScale(1)");
const autoResize=node('tablesGrid').children[0].children.find(n=>n.className==='resize-handle');
autoResize.fire('pointerdown',{button:0,clientX:0,clientY:0,pointerId:9,stopPropagation(){}});
autoResize.fire('pointermove',{clientX:580,clientY:580,stopPropagation(){}});
autoResize.fire('pointermove',{clientX:1160,clientY:1160,stopPropagation(){}});
autoResize.fire('pointerup',{stopPropagation(){}});
assert(Math.abs(run('floorDraft.tables[0].width')-3.6)<1e-9);
assert(Math.abs(run('floorDraft.tables[0].x*floorDraft.rooms[0].width/100')-10.2)<1e-9);
assert(run('FloorPlan.valid(floorDraft)'));assert.equal(run('FloorZoom.getScale()'),1);
const savedWidth=run('FloorPlan.get().rooms[0].width');
node('cancelPlanBtn').fire('click');assert.equal(run('FloorPlan.get().rooms[0].width'),savedWidth);
console.log('PASS: repeated automatic growth during resize preserves anchor and proportional size; cancel preserves saved room.');

run("floorDraft=null;reservations=[];history=[];startFloorEdit();floorDraft=FloorPlan.defaults();resetEditorHistory();afficherTables()");
const baseline=run('JSON.stringify(floorDraft)');
run("quickAddFurniture('plant')");assert.equal(run('floorDraft.elements.length'),1);assert.equal(run('floorSelection.size'),1);
assert.equal(node('undoFloorBtn').disabled,false);
node('undoFloorBtn').fire('click');assert.equal(run('JSON.stringify(floorDraft)'),baseline);
node('redoFloorBtn').fire('click');assert.equal(run('floorDraft.elements.length'),1);
run("floorSelection.clear();floorSelection.add(floorDraft.tables[0].id);floorSelection.add(floorDraft.elements[0].id);refreshFloorSelection()");
node('selectionDuplicateBtn').fire('click');assert.equal(run('floorDraft.tables.length'),2);assert.equal(run('floorDraft.elements.length'),2);assert.equal(run('floorSelection.size'),2);
assert.equal(run('new Set(floorDraft.tables.map(t=>t.number)).size'),2);
node('selectionDeleteBtn').fire('click');assert.equal(run('floorDraft.tables.length'),1);assert.equal(run('floorDraft.elements.length'),1);
node('undoFloorBtn').fire('click');assert.equal(run('floorDraft.tables.length'),2);
run("floorSelection.add(floorDraft.tables[0].id);reservations=[{tables:[floorDraft.tables[0].number]}];refreshFloorSelection()");
node('selectionDeleteBtn').fire('click');assert.equal(run('floorDraft.tables.length'),2);assert.equal(node('selectionDeleteBtn').disabled,true);
run("reservations=[];floorSelection.clear();floorSelection.add(floorDraft.tables[0].id);refreshFloorSelection()");
node('inspectorWidth').value='200';node('inspectorDepth').value='140';node('inspectorAngle').value='90';node('inspectorColor').value='#28734f';node('inspectorForm').fire('submit');
assert.equal(run('floorDraft.tables[0].width'),2);assert.equal(run('floorDraft.tables[0].angle'),90);
node('undoFloorBtn').fire('click');assert.equal(run('floorDraft.tables[0].width'),1.2);
run("quickAddFurniture('chair')");assert.equal(node('redoFloorBtn').disabled,true);
node('openCatalogBtn').fire('click');assert(node('floorWorkspace').classes.has('catalog-open'));
node('openInspectorBtn').fire('click');assert(!node('floorWorkspace').classes.has('catalog-open'));assert(node('floorWorkspace').classes.has('inspector-open'));
node('cancelPlanBtn').fire('click');assert.equal(run('editorHistory.length'),0);assert(node('workspaceCatalog').classes.has('hidden'));
console.log('PASS: catalog creation, atomic group duplication/deletion, protected reservations, inline properties, undo/redo branching and mobile panels.');
// Broad-phase spacing must match exact geometry, including rotation/overlap.
run(`var densePlan=FloorPlan.defaults();densePlan.rooms[0].width=20;densePlan.rooms[0].depth=20;densePlan.tables=Array.from({length:70},(_,i)=>FloorPlan.tableOptions({id:'dense'+i,number:i+1,roomId:'main',capacity:2,shape:'square',width:.5+(i%5)*.3,depth:.7+(i%3)*.2,angle:(i*37)%360,x:(i*17)%85,y:(i*23)%85}));`);
const exactSpacing=run(`(()=>{let pairs=0,ids=new Set();densePlan.tables.forEach((a,i)=>densePlan.tables.slice(i+1).forEach(b=>{if(FloorPlan.gap(densePlan,a,b)<.9-1e-7){pairs++;ids.add(a.id);ids.add(b.id)}}));return {pairs,ids:[...ids].sort()};})()`);
const fastSpacing=run("(()=>{const s=FloorPlan.spacingSummary(densePlan,'main');return {pairs:s.pairs,ids:[...s.closeIds].sort()};})()");
assert.equal(JSON.stringify(fastSpacing),JSON.stringify(exactSpacing));
const vectorImage=run('Floor3D.image(densePlan.tables[0])');
assert(vectorImage.startsWith('<img '));assert(!vectorImage.includes('<polygon'));
assert(decodeURIComponent(vectorImage).includes('xmlns="http://www.w3.org/2000/svg"'));
assert.equal(vectorImage,run('Floor3D.image({...densePlan.tables[0],id:"another",x:90})'));
assert.notEqual(vectorImage,run('Floor3D.image({...densePlan.tables[0],angle:19})'));
// A burst of pointer events produces one frame; pointer-up flushes the final move.
let frames=new Map(),frameNumber=0;
context.requestAnimationFrame=fn=>{frames.set(++frameNumber,fn);return frameNumber;};context.cancelAnimationFrame=id=>frames.delete(id);
run("floorDraft=FloorPlan.defaults();floorRoom='main';multiSelectMode=false;floorSelection.clear();alignmentEnabled=false;resetEditorHistory();afficherTables()");
const framedTable=node('tablesGrid').children.find(n=>n.getAttribute('data-table-number')==='1');
framedTable.fire('pointerdown',{button:0,clientX:100,clientY:100,pointerId:10});
framedTable.fire('pointermove',{clientX:120,clientY:100});framedTable.fire('pointermove',{clientX:158,clientY:100});
assert.equal(frames.size,1);assert.equal(run('floorDraft.tables[0].x'),45);
framedTable.fire('pointerup');assert.equal(frames.size,0);assert.equal(run('floorDraft.tables[0].x'),55);
assert.equal(run('editorHistory.length'),2);
console.log('PASS: exact spacing equivalence on rotated dense scene, reusable lightweight SVG images, frame coalescing and final pointer flush.');

// Resizing a model must preserve the same relief, rather than flatten its legs.
for(const type of ['table','bar','chair','buffet','plant','lamp','wall','door','window','sofa','kitchen','toilets','reception','pillar']){
 const expression=type==='table'?"{shape:'square',width:1.2,depth:1.2,capacity:4,angle:45}":`{type:'${type}',width:2,depth:1,angle:45}`;
 assert(run(`(()=>{const t=${expression};return Floor3D.render(t)===Floor3D.render({...t,width:t.width*25,depth:t.depth*25})&&Floor3D.render(t)===Floor3D.render({...t,width:t.width/4,depth:t.depth/4});})()`),type+' preserves relief across scale');
}
assert(run("Floor3D.render({shape:'square',width:2,depth:1})!==Floor3D.render({shape:'square',width:1,depth:2})"));
console.log('PASS: furniture relief preserved at 25× and ¼ size across catalog; width/depth aspect ratio remains editable.');

// Selection controls compensate for canvas zoom, including very large rooms.
run("floorDraft=FloorPlan.defaults();floorDraft.rooms[0].width=328;floorDraft.rooms[0].depth=150;FloorZoom.updateRoom(floorDraft,'main');FloorZoom.setScale(.06)");
assert(Math.abs(Number(node('tablesGrid').style['--floor-inverse-zoom'])*run('FloorZoom.getScale()')-1)<1e-9);
run('FloorZoom.setScale(2.5)');
assert.equal(Number(node('tablesGrid').style['--floor-inverse-zoom']),.4);
console.log('PASS: constant screen-size selection controls from 6% to 250% zoom.');

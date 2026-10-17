'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const root=path.join(__dirname,'..');
const key='restomanager_floor_plan_v1',backupKey=key+'_backup_before_v4';

function load(raw,options={}) {
    const data=new Map(),writes=[],failures={write:null},syncs={count:0};
    if(raw!==undefined)data.set(key,typeof raw==='string'?raw:JSON.stringify(raw));
    const context=vm.createContext({structuredClone,console,localStorage:{
        getItem:k=>{if(options.failRead)throw new Error('Storage unavailable');return data.has(k)?data.get(k):null;},
        setItem:(k,v)=>{if(failures.write===k)throw new Error('Quota exceeded');data.set(k,v);writes.push(k);}
    }});
    vm.runInContext(fs.readFileSync(path.join(root,'reservation-engine.js'),'utf8'),context);
    const engine=vm.runInContext('ReservationEngine',context),splice=engine.TABLES.splice;
    engine.TABLES.splice=function(...args){syncs.count++;return splice.apply(this,args);};
    vm.runInContext(fs.readFileSync(path.join(root,'floor-plan.js'),'utf8'),context);
    return {api:vm.runInContext('FloorPlan',context),engine,data,writes,failures,syncs};
}
const plain=value=>JSON.parse(JSON.stringify(value));
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const room=(id='main',width=12,depth=10)=>({id,name:id,width,depth,floor:'plain'});
const table=(overrides={})=>({id:'t1',number:1,roomId:'main',capacity:4,capacityMin:2,letter:'',shape:'rectangle',width:2,depth:1,x:3,y:3,angle:0,color:'#8a5a29',...overrides});
const element=(type='wall',overrides={})=>({id:type,roomId:'main',type,label:type,width:3,depth:0.2,x:3,y:3,angle:0,color:'#3b4553',...overrides});
const plan=(overrides={})=>({version:4,rooms:[room()],tables:[],elements:[],...overrides});

test('v4 defaults retain the legacy display and expose metric centres',()=>{
    const {api}=load();
    const p=api.get(),t=p.tables[0],display=api.sizePercent(p,t);
    assert.equal(p.version,4);assert(api.valid(p));
    close(t.x,0.96);close(t.y,0.96);close(display.left,3);close(display.top,3);
    close(display.width,10);close(display.height,10);
});

test('v3 migration preserves rotated envelopes, rooms, IDs, numbers and custom metadata without mutation',()=>{
    const {api}=load();
    const original=plan({version:3,rooms:[room(),room('terrace',20,8)],tables:[table({x:20,y:30,angle:37.5}),table({id:'t2',number:29,roomId:'terrace',x:15,y:10,angle:90})],elements:[element('wall',{x:30,y:20,angle:22.3})],custom:{note:'preserved'}});
    const before=JSON.stringify(original),m=api.migrate(original);
    assert.equal(JSON.stringify(original),before);assert(api.valid(m));assert.equal(m.version,4);
    assert.deepEqual(plain(m.rooms),original.rooms);assert.deepEqual(plain(m.custom),original.custom);
    for(const item of [...original.tables,...original.elements]){
        const target=[...m.tables,...m.elements].find(t=>t.id===item.id),display=api.sizePercent(m,target);
        close(display.left,item.x);close(display.top,item.y);
        assert.equal(target.number,item.number);assert.equal(target.angle,item.angle);
        assert.equal(target.width,item.width);assert.equal(target.depth,item.depth);
    }
    const twice=api.migrate(m);assert.deepEqual(plain(twice),plain(m));assert.notEqual(twice,m);
});

test('v1 and v2 migrations retain their historical physical footprint and options',()=>{
    const {api}=load();
    const first={version:1,rooms:[{id:'main',name:'Original'}],tables:[{id:'old',number:25,capacity:10,roomId:'main',shape:'rectangle',x:3,y:83}]};
    const before=JSON.stringify(first),m=api.migrate(first),item=m.tables[0];
    assert.equal(JSON.stringify(first),before);assert(api.valid(m));
    close(item.width,2.04);close(item.depth,1.44);close(api.sizePercent(m,item).top,85.5);
    assert.equal(item.number,25);assert.equal(item.id,'old');assert.equal(item.angle,0);
    const second={version:2,rooms:[{id:'main',name:'Saved',width:12,depth:8}],tables:[],elements:[{id:'bar',type:'bar',label:'Bar',roomId:'main',x:3,y:4,width:3,depth:0.8}]};
    const m2=api.migrate(second);assert(api.valid(m2));assert.equal(m2.rooms[0].floor,'plain');
    close(m2.elements[0].x,1.86);close(m2.elements[0].y,0.72);
});

test('repeated 90° rotations and free rotation retain the centre and rigid physical footprint',()=>{
    const {api}=load(),p=plan(),item=table({angle:37.25});
    const first=api.polygons(p,item);
    for(let i=0;i<400;i++){
        item.angle=(item.angle+90)%360;
        const points=api.polygons(p,item),display=api.sizePercent(p,item);
        close(points.reduce((sum,p)=>sum+p.x,0)/4,item.x);
        close(points.reduce((sum,p)=>sum+p.y,0)/4,item.y);
        close((display.left+display.width/2)*p.rooms[0].width/100,item.x);
        close((display.top+display.height/2)*p.rooms[0].depth/100,item.y);
        close(Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y),2);
        close(Math.hypot(points[2].x-points[1].x,points[2].y-points[1].y),1);
    }
    api.polygons(p,item).forEach((point,i)=>{close(point.x,first[i].x);close(point.y,first[i].y);});
});

test('moving and resizing a rotated item keep the same pivot and correct edges',()=>{
    const {api}=load(),p=plan(),item=table({angle:33.3}),before=api.polygons(p,item);
    item.x+=1.25;item.y+=0.4;
    api.polygons(p,item).forEach((point,i)=>{close(point.x-before[i].x,1.25);close(point.y-before[i].y,0.4);});
    item.width=3.2;item.depth=0.8;
    const points=api.polygons(p,item);
    close(points.reduce((sum,p)=>sum+p.x,0)/4,4.25);
    close(points.reduce((sum,p)=>sum+p.y,0)/4,3.4);
    close(Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y),3.2);
    assert(api.inside(p,item));
});

test('oriented bounds and clamping respect room edges without mutating input',()=>{
    const {api}=load(),p=plan({rooms:[room('main',10,8)]}),item=table({x:-10,y:20,angle:90}),before=structuredClone(item);
    assert(!api.inside(p,item));const clamped=api.clampItem(p,item);
    assert.deepEqual(item,before);close(clamped.x,0.5);close(clamped.y,7);assert(api.inside(p,clamped));
    assert.equal(api.clampItem(p,{...item,width:20}),null);
    assert.equal(api.clampItem(p,{...item,x:NaN}),null);
    const atEdge=table({x:9.5,y:1,angle:90});assert(api.inside(p,atEdge));
    assert(!api.inside(p,{...atEdge,x:9.501}));
});

test('SAT rejects AABB false positives and handles contact, overlap and other rooms',()=>{
    const {api}=load(),p=plan(),a=table({width:4,depth:0.2,angle:45}),b={...a,id:'b',y:4};
    assert(!api.overlaps(p,a,b));assert(api.overlaps(p,a,{...b,y:3.1}));
    assert(!api.overlaps(p,a,{...a,id:'other',roomId:'terrace'}));
    const square=table({x:1,y:1,width:2,depth:1});
    assert(!api.overlaps(p,square,{...square,id:'touching',x:3}));
    close(api.gap(p,square,{...square,id:'separated',x:3.9}),0.9);
    assert.equal(api.gap(p,a,{...a,roomId:'terrace'}),Infinity);
});

test('collision policy includes architectural obstacles and allows intentional overlays',()=>{
    const {api}=load(),a=table(),wall=element(),p=plan({tables:[a],elements:[wall,...['zone','door','window','lamp'].map(type=>element(type))]});
    assert.deepEqual([...api.conflicts(p,a)].map(t=>t.id),['wall']);
    assert.deepEqual([...api.conflicts(p,a,['wall'])],[]);
    for(const type of ['zone','door','window','lamp'])assert.equal(api.conflicts(p,element(type)).length,0);
    assert.deepEqual([...api.conflicts(p,wall)].map(t=>t.id),['t1']);
    for(const type of ['chair','armchair','bench','partition','counter'])assert(api.valid(plan({elements:[element(type)]})));
});

test('automatic placement avoids solid walls with a fixed 12 cm gap across room sizes',()=>{
    const {api}=load();
    for(const width of [10,60]){
        const wall=element('wall',{x:width/2,y:0.1,width,depth:0.2}),p=plan({rooms:[room('main',width,10)],elements:[wall]}),item=table({width:1,depth:1});
        const spot=api.freeSpot(p,item),placed={...item,...spot};
        assert(spot);assert(api.inside(p,placed));assert.equal(api.conflicts(p,placed).length,0);
        close(api.gap(p,wall,placed),0.12);close(spot.y,0.82);
    }
});

test('automatic placement scales beyond 25 objects without overlaps or changed IDs',()=>{
    const {api}=load(),p=plan({rooms:[room('main',20,20)]});
    for(let i=0;i<100;i++){
        const item=table({id:'t'+i,number:i+1,width:1,depth:1});
        const spot=api.freeSpot(p,item);assert(spot,'No space for object '+i);
        Object.assign(item,spot);assert.equal(api.conflicts(p,item).length,0);p.tables.push(item);
    }
    assert(api.valid(p));assert.equal(new Set(p.tables.map(t=>t.id)).size,100);
    assert.equal(api.freeSpot(plan({rooms:[room('main',0.5,0.5)]}),table()),null);
});

test('room enlargement and permitted shrink keep positions and sizes exactly unchanged',()=>{
    const {api}=load(),p=plan({tables:[table({angle:37})],elements:[element('plant',{x:6,y:5,width:1,depth:1})]}),before=JSON.stringify([p.tables,p.elements]);
    api.resizeRoom(p,'main',60,30);assert.equal(JSON.stringify([p.tables,p.elements]),before);
    api.resizeRoom(p,'main',9,8);assert.equal(JSON.stringify([p.tables,p.elements]),before);
    const snapshot=JSON.stringify(p);
    assert.throws(()=>api.resizeRoom(p,'main',1,1),/trop petite/);assert.equal(JSON.stringify(p),snapshot);
    assert.throws(()=>api.resizeRoom(p,'missing',10,10),/introuvable/);
    assert.throws(()=>api.resizeRoom(p,'main',Infinity,10),/supérieures/);
});

test('automatic room fitting uses rotated content, configurable margin and leaves centres fixed',()=>{
    const {api}=load(),p=plan({tables:[table({x:4,y:5,angle:90})]}),before=JSON.stringify(p.tables);
    const fitted=api.fitRoom(p,'main',0.75);
    close(fitted.width,5.25);close(fitted.depth,6.75);assert.equal(JSON.stringify(p.tables),before);
    const snapshot=JSON.stringify(p);assert.throws(()=>api.fitRoom(p,'main',-1),/marge/);assert.equal(JSON.stringify(p),snapshot);
    assert.throws(()=>api.fitRoom(p,'missing',0.5),/introuvable/);
    p.tables[0].x=0;const invalid=JSON.stringify(p);
    assert.throws(()=>api.fitRoom(p,'main',0.5),/origine/);assert.equal(JSON.stringify(p),invalid);
});

test('validation rejects duplicate numbers and IDs across rooms and malformed data without throwing',()=>{
    const {api}=load(),a=table(),p=plan({rooms:[room(),room('terrace')],tables:[a,table({id:'t2',roomId:'terrace'})]});
    assert(!api.valid(p));p.tables[1].number=2;assert(api.valid(p));
    p.elements=[element('wall',{id:a.id})];assert(!api.valid(p));
    for(const bad of [null,{},plan({rooms:[null]}),plan({tables:[null]}),plan({elements:[null]}),plan({tables:[table({angle:NaN})]})]){
        assert.doesNotThrow(()=>assert.equal(api.valid(bad),false));
    }
});

test('legacy load performs no write, first save backs up the exact raw data, reload preserves v4',()=>{
    const legacy=plan({version:3,tables:[table({x:20,y:30,angle:37.5,number:29})]}),raw=JSON.stringify(legacy,null,2);
    const h=load(raw),next=h.api.get();assert.equal(h.api.getLoadError(),null);assert.equal(h.writes.length,0);assert.equal(h.data.get(key),raw);
    next.tables[0].x+=0.25;h.api.save(next);
    assert.equal(h.data.get(backupKey),raw);assert.deepEqual(h.writes,[backupKey,key]);
    const stored=h.data.get(key),reloaded=load(stored);assert.deepEqual(plain(reloaded.api.get()),plain(next));assert.equal(reloaded.api.getLoadError(),null);
    assert.deepEqual([...h.engine.TABLES],[29]);assert.equal(h.engine.CAPACITY[29],4);
    h.api.save(h.api.get());assert.equal(h.writes.filter(k=>k===backupKey).length,1);
    next.tables[0].x=100;assert.notEqual(h.api.get().tables[0].x,100);
});

test('invalid, corrupt and unsupported stored data remain untouched and block save and engine sync',()=>{
    for(const raw of ['{broken',JSON.stringify(plan({version:900})),JSON.stringify(plan({tables:[null]})),JSON.stringify({version:2,rooms:null})]){
        const h=load(raw);assert.match(h.api.getLoadError(),/conservées/);assert.equal(h.syncs.count,0);
        assert.equal(h.data.get(key),raw);assert.throws(()=>h.api.save(h.api.defaults()),/bloqué/);
        assert.equal(h.writes.length,0);assert.equal(h.data.get(key),raw);
    }
    const unavailable=load(undefined,{failRead:true});assert.match(unavailable.api.getLoadError(),/Storage unavailable/);
    assert.equal(unavailable.syncs.count,0);assert.throws(()=>unavailable.api.save(unavailable.api.get()),/bloqué/);
});

test('failed backup or save leaves active data, draft isolation and reservation capacities intact',()=>{
    const legacy=plan({version:3,tables:[table({x:20,y:30})]}),h=load(legacy),before=plain(h.api.get()),raw=h.data.get(key),next=h.api.get();
    next.tables[0].capacity=8;
    h.failures.write=backupKey;assert.throws(()=>h.api.save(next),/Quota/);
    assert.equal(h.data.get(key),raw);assert.deepEqual(plain(h.api.get()),before);assert.equal(h.engine.CAPACITY[1],4);
    h.failures.write=key;assert.throws(()=>h.api.save(next),/Quota/);
    assert.equal(h.data.get(key),raw);assert.equal(h.data.get(backupKey),raw);assert.deepEqual(plain(h.api.get()),before);assert.equal(h.engine.CAPACITY[1],4);
    h.failures.write=null;h.api.save(next);assert.equal(h.engine.CAPACITY[1],8);
    const writes=h.writes.length,bad=h.api.get();bad.tables[0].x=-50;
    assert.throws(()=>h.api.save(bad),/invalide/);assert.equal(h.writes.length,writes);assert.equal(h.engine.CAPACITY[1],8);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..');
let buildFloorModel,framingDistance,labelScreenScale,Floor3D,THREE,OrbitControls;
const room=(id='main',floor='wood')=>({id,name:id,width:12,depth:10,floor});
const table=(overrides={})=>({id:'table-1',roomId:'main',number:1,letter:'A',capacity:4,shape:'rectangle',width:2,depth:1,x:3,y:4,angle:37,color:'#28734f',...overrides});
const element=(type,overrides={})=>({id:type,roomId:'main',type,label:type,width:1.2,depth:0.8,x:5,y:6,angle:12.5,color:'#8a5a29',...overrides});
const plan=(overrides={})=>({version:4,rooms:[room(),room('terrace','tile')],tables:[table()],elements:[],...overrides});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test.before(async()=>{
    ({buildFloorModel,framingDistance,labelScreenScale,Floor3D}=await import(pathToFileURL(path.join(root,'floor-3d.mjs')).href));
    THREE=await import(pathToFileURL(path.join(root,'vendor/three/three.module.min.js')).href);
    ({OrbitControls}=await import(pathToFileURL(path.join(root,'vendor/three/OrbitControls.js')).href));
});

test('headless module import and hidden sync never allocate a WebGL renderer',()=>{
    let state=Floor3D.getState();assert.equal(state.ready,false);assert.equal(state.visible,false);assert.equal(state.loading,false);assert.deepEqual(state.objects,[]);
    const source=plan(),before=JSON.stringify(source);Floor3D.sync(source,'main');
    state=Floor3D.getState();assert.equal(state.frames,0);assert.equal(state.renderer.calls,0);assert.equal(JSON.stringify(source),before);Floor3D.dispose();
});

test('vendored Three r180 and OrbitControls load locally with matching inheritance',()=>{
    assert.equal(THREE.REVISION,'180');assert.equal(typeof THREE.InstancedMesh,'function');assert.equal(typeof OrbitControls,'function');
    assert.equal(Object.getPrototypeOf(OrbitControls.prototype),THREE.Controls.prototype);
});

test('model preserves physical centres, dimensions, colors, labels and suffixes without mutation',()=>{
    const source=plan(),before=JSON.stringify(source),model=buildFloorModel(source,'main'),item=model.items[0];
    assert.equal(JSON.stringify(source),before);assert.equal(item.id,'table-1');assert.equal(item.label,'T1A');assert.equal(item.color,'#28734f');
    close(item.x,3);close(item.z,4);close(item.width,2);close(item.depth,1);close(item.rotationY,-37*Math.PI/180);
});

test('room filtering and floor finishes preserve every room independently',()=>{
    const source=plan({tables:[table(),table({id:'other',number:27,letter:'B',roomId:'terrace'})],elements:[element('plant'),element('wall',{roomId:'terrace'})]});
    assert.deepEqual(buildFloorModel(source,'main').items.map(item=>item.id),['table-1','plant']);
    const terrace=buildFloorModel(source,'terrace');assert.deepEqual(terrace.items.map(item=>item.id),['other','wall']);assert.equal(terrace.items[0].label,'T27B');
    const colors=new Set();for(const finish of ['plain','wood','tile','stone']){source.rooms[0].floor=finish;const model=buildFloorModel(source,'main');colors.add(model.room.color);assert(model.room.x>0&&model.room.z>0);}
    assert.equal(colors.size,4);
});

test('all table shapes include volumetric furniture and bounded chair counts',()=>{
    for(const shape of ['round','square','rectangle','bench']){
        const model=buildFloorModel(plan({tables:[table({shape,capacity:4})]}),'main'),item=model.items[0];
        assert(item.parts.length>=10,shape);assert(item.parts.some(part=>part.y===0.75&&part.height===0.08));
        if(shape==='round')assert(item.parts.some(part=>part.shape==='cylinder'));
    }
    const twelve=buildFloorModel(plan({tables:[table({shape:'round',capacity:12})]}),'main').items[0];
    const hundred=buildFloorModel(plan({tables:[table({shape:'round',capacity:100})]}),'main').items[0];
    assert.equal(twelve.parts.length,hundred.parts.length,'Capacity does not create unbounded chair meshes');
});

test('the complete furniture catalogue has finite, positive 3D primitives',()=>{
    const types=['bar','wall','door','window','pillar','plant','kitchen','toilets','zone','chair','armchair','bench','partition','lamp','counter'];
    const model=buildFloorModel(plan({tables:[],elements:types.map(type=>element(type))}),'main');assert.equal(model.items.length,types.length);
    for(const item of model.items){
        assert(item.parts.length>0,item.type);assert(item.parts.some(part=>part.color===item.color),'Original material '+item.type);
        for(const part of item.parts){
            assert(['box','cylinder','sphere','cone'].includes(part.shape));
            assert([part.x,part.y,part.z,part.width,part.height,part.depth,part.rotationY,part.opacity].every(Number.isFinite));
            assert(part.width>0&&part.height>0&&part.depth>0);assert(part.opacity>0&&part.opacity<=1);
        }
    }
});

test('door and window overlays have frames while zone surfaces remain translucent',()=>{
    const model=buildFloorModel(plan({tables:[],elements:['door','window','zone'].map(type=>element(type))}),'main');
    assert(model.items[0].parts.some(part=>part.height>=2));assert(model.items[1].parts.some(part=>part.opacity<1));
    assert(model.items[2].parts.every(part=>part.height<=0.03&&part.opacity<1));
});

test('real Three group matrices match the 2D rotation convention at every quarter turn and free angle',()=>{
    for(const angle of [0,37.5,90,180,270,359.9]){
        const item=buildFloorModel(plan({tables:[table({angle})]}),'main').items[0];
        const group=new THREE.Group();group.position.set(item.x,0,item.z);group.rotation.y=item.rotationY;group.scale.set(item.width,1,item.depth);group.updateMatrixWorld(true);
        const point=new THREE.Vector3(0.5,0,0.5).applyMatrix4(group.matrixWorld),r=angle*Math.PI/180;
        close(point.x,3+Math.cos(r)-0.5*Math.sin(r));close(point.z,4+Math.sin(r)+0.5*Math.cos(r));
        const centre=new THREE.Vector3(0,0,0).applyMatrix4(group.matrixWorld);close(centre.x,3);close(centre.z,4);
    }
});

test('physical room enlargement never changes furniture model coordinates or dimensions',()=>{
    const source=plan(),before=buildFloorModel(source,'main').items;source.rooms[0].width=60;source.rooms[0].depth=30;
    assert.deepEqual(buildFloorModel(source,'main').items,before);
});

test('100 tables reuse a small set of primitive and material batch keys',()=>{
    const source=plan({tables:Array.from({length:100},(_,i)=>table({id:'t'+i,number:i+1,x:1+(i%10),y:1+Math.floor(i/10),angle:i*15%360}))});
    const model=buildFloorModel(source,'main'),keys=new Set(model.items.flatMap(item=>item.parts.map(part=>part.shape+':'+part.color+':'+part.opacity)));
    assert.equal(model.items.length,100);assert(keys.size<=4);assert.equal(new Set(model.items.map(item=>item.label)).size,100);
});

test('camera fitting keeps the whole room inside the smaller horizontal or vertical field of view',()=>{
    const radius=Math.hypot(30,20)/2;
    for(const aspect of [0.45,0.75,1,1.7,3]){
        const distance=framingDistance(30,20,45,aspect),vertical=Math.PI/8,horizontal=Math.atan(Math.tan(vertical)*aspect);
        assert(distance*Math.sin(Math.min(vertical,horizontal))>radius);
    }
    assert(framingDistance(30,20,45,0.5)>framingDistance(30,20,45,1.8));
    assert.throws(()=>framingDistance(30,20,45,0),/camera/);
});

test('number labels maintain a readable pixel size across phone and desktop viewports',()=>{
    for(const height of [300,550,1000])for(const fov of [30,45,70]){
        const projectionY=1/Math.tan(fov*Math.PI/360),scale=labelScreenScale(52,26,height,projectionY);
        close(scale.x*projectionY*height/2,52);close(scale.y*projectionY*height/2,26);
    }
    assert.throws(()=>labelScreenScale(52,26,0,2),/label/);
});

test('bad or legacy geometry is rejected without changing input data',()=>{
    for(const source of [plan({version:3}),plan({rooms:[]}),plan({tables:[table({width:-1})]}),plan({tables:[table({angle:NaN})]})]){
        const before=structuredClone(source);assert.throws(()=>buildFloorModel(source,'main'));assert.deepEqual(source,before);
    }
});

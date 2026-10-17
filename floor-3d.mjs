// Three.js is deliberately imported only when the 3D view is opened.
const floorStyles={plain:{color:'#e9e5d9',line:'#d2cfc6',x:1,z:1},wood:{color:'#c7a579',line:'#a3835c',x:0.5,z:2},tile:{color:'#dce3df',line:'#bcc7c0',x:1,z:1},stone:{color:'#babcb5',line:'#969b92',x:1.5,z:1}};
const number=n=>Number.isFinite(n);
const normalize=angle=>((angle%360)+360)%360;

export function framingDistance(width,depth,fov,aspect){
    if(![width,depth,fov,aspect].every(number)||width<=0||depth<=0||fov<=0||fov>=180||aspect<=0)throw new Error('Invalid camera frame');
    const verticalHalf=fov*Math.PI/360,horizontalHalf=Math.atan(Math.tan(verticalHalf)*aspect);
    return Math.hypot(width,depth)/2/Math.sin(Math.min(verticalHalf,horizontalHalf))*1.12;
}

export function labelScreenScale(width,height,viewportHeight,projectionY){
    if(![width,height,viewportHeight,projectionY].every(number)||Math.min(width,height,viewportHeight,projectionY)<=0)throw new Error('Invalid label frame');
    const unit=2/(viewportHeight*projectionY);return {x:width*unit,y:height*unit};
}

// Pure scene description. X/Z dimensions are normalized to the item's physical
// footprint; its actual Object3D applies width/depth and the centre rotation.
export function buildFloorModel(plan,roomId){
    if(plan?.version!==4||!Array.isArray(plan.rooms)||!Array.isArray(plan.tables)||!Array.isArray(plan.elements))throw new Error('Invalid floor plan version');
    const room=plan?.rooms?.find(room=>room.id===roomId);
    if(!room||!number(room.width)||!number(room.depth)||room.width<=0||room.depth<=0)throw new Error('Invalid room dimensions');
    const items=plan.tables.concat(plan.elements).filter(item=>item.roomId===roomId).map(item=>{
        if(![item.x,item.y,item.width,item.depth,item.angle??0].every(number)||item.width<=0||item.depth<=0)throw new Error('Invalid furniture geometry');
        const color=item.color||'#8a5a29',parts=[];
        const add=(shape,x,y,z,width,height,depth,paint=color,rotationY=0,opacity=1)=>parts.push({shape,x,y,z,width,height,depth,color:paint,rotationY,opacity});
        const box=(x,y,z,w,h,d,paint=color,rotation=0)=>add('box',x,y,z,w,h,d,paint,rotation);
        const cylinder=(x,y,z,w,h,d,paint=color)=>add('cylinder',x,y,z,w,h,d,paint);
        const chair=(x,z,angle=0,w=0.16,d=0.1,armchair=false)=>{
            const a=-angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
            const part=(lx,y,lz,pw,h,pd,paint=color)=>box(x+lx*c+lz*s,y,z-lx*s+lz*c,pw,h,pd,paint,a);
            part(0,0.45,0,w,0.09,d);part(0,0.68,-d*0.43,w,0.46,d*0.15);
            for(const lx of [-w*0.35,w*0.35])for(const lz of [-d*0.3,d*0.3])part(lx,0.22,lz,w*0.09,0.44,d*0.14,'#48534d');
            if(armchair)for(const lx of [-w*0.48,w*0.48])part(lx,0.62,0,w*0.12,0.12,d);
        };
        const tableTop=(shape,w,d)=>{
            add(shape,0,0.75,0,w,0.08,d);
            for(const x of [-w*0.32,w*0.32])for(const z of [-d*0.3,d*0.3])box(x,0.35,z,0.045,0.7,0.045,'#48534d');
        };
        if(item.number!==undefined){
            const count=Math.min(12,Math.max(1,item.capacity));
            if(item.shape==='round'){
                for(let i=0;i<count;i++){const angle=i*360/count,r=angle*Math.PI/180;chair(0.39*Math.sin(r),-0.39*Math.cos(r),angle);}
                tableTop('cylinder',0.58,0.58);
            }else if(item.shape==='bench'){
                tableTop('box',0.76,0.38);
                for(const sign of [-1,1]){box(0,0.45,sign*0.34,0.76,0.14,0.16);box(0,0.73,sign*0.41,0.76,0.55,0.035);for(const x of [-0.29,0.29])box(x,0.2,sign*0.34,0.05,0.4,0.1,'#48534d');}
            }else{
                if(item.shape==='square'&&count<=4){[[0,-0.41,0],[0,0.41,180],[-0.41,0,-90],[0.41,0,90]].slice(0,count).forEach(p=>chair(...p));}
                else{const top=Math.ceil(count/2),bottom=Math.floor(count/2);for(let i=0;i<top;i++)chair(-0.35+(i+0.5)*0.7/top,-0.41);for(let i=0;i<bottom;i++)chair(-0.35+(i+0.5)*0.7/bottom,0.41,180);}
                tableTop('box',0.66,0.6);
            }
        }else switch(item.type){
            case 'wall':box(0,1.25,0,1,2.5,1);break;
            case 'partition':box(0,0.75,0,1,1.5,1);break;
            case 'pillar':box(0,1.3,0,0.9,2.6,0.9);break;
            case 'door':
                for(const x of [-0.45,0.45])box(x,1.1,-0.43,0.07,2.2,0.14);
                box(0,2.17,-0.43,0.97,0.08,0.14);box(0,1.03,0.44,0.88,2.06,0.045);break;
            case 'window':
                for(const x of [-0.47,0.47])box(x,1.45,0,0.06,1.3,1);
                for(const y of [0.82,2.08])box(0,y,0,1,0.06,1);
                box(0,1.45,0,0.035,1.25,1);add('box',0,1.45,0,0.9,1.2,0.2,'#92c5d6',0,0.35);break;
            case 'plant':
                cylinder(0,0.18,0,0.55,0.36,0.55,'#aa7758');
                for(const [x,z] of [[-0.18,-0.16],[0.18,-0.16],[-0.16,0.18],[0.16,0.18],[0,0]])add('sphere',x,0.68,z,0.5,0.7,0.5);
                break;
            case 'bar':case 'counter':
                box(0,0.5,-0.025,0.94,1,0.75);box(0,1.04,-0.025,0.99,0.08,0.84);
                if(item.type==='bar')for(const x of [-0.3,0,0.3]){cylinder(x,0.72,0.43,0.11,0.08,0.11);cylinder(x,0.35,0.43,0.025,0.7,0.025,'#48534d');}
                break;
            case 'kitchen':
                box(0,0.46,0,0.94,0.92,0.94);box(0,0.95,0,0.98,0.06,0.98,'#b9c1c0');
                for(const x of [-0.28,-0.08])for(const z of [-0.27,-0.07])cylinder(x,0.99,z,0.12,0.025,0.12,'#48534d');
                box(0.27,0.99,-0.16,0.22,0.025,0.34,'#718987');break;
            case 'toilets':
                add('box',0,0.015,0,0.94,0.03,0.94,color,0,0.3);box(0,0.8,0,0.025,1.6,0.9);
                for(const x of [-0.25,0.25]){cylinder(x,0.22,0.1,0.22,0.44,0.3,'#f2f2eb');box(x,0.55,-0.17,0.22,0.5,0.12,'#f2f2eb');}
                break;
            case 'chair':chair(0,0,0,0.78,0.68);break;
            case 'armchair':chair(0,0,0,0.78,0.68,true);break;
            case 'bench':
                box(0,0.44,0.05,0.94,0.16,0.72);box(0,0.74,-0.35,0.94,0.64,0.16);
                for(const x of [-0.34,0.34])for(const z of [-0.23,0.3])box(x,0.18,z,0.06,0.36,0.08,'#48534d');break;
            case 'lamp':
                cylinder(0,0.025,0,0.5,0.05,0.5);cylinder(0,1,0,0.055,2,0.055,'#48534d');
                add('cone',0,1.9,0,0.8,0.42,0.8);add('sphere',0,1.82,0,0.2,0.18,0.2,'#fff0bd');break;
            default:add('box',0,0.015,0,0.94,0.03,0.94,color,0,0.26);
        }
        return {id:item.id,number:item.number,label:item.number!==undefined?'T'+item.number+(item.letter||''):item.label||'',type:item.number!==undefined?'table':item.type,shape:item.shape,x:item.x,z:item.y,width:item.width,depth:item.depth,angle:normalize(item.angle??0),rotationY:-normalize(item.angle??0)*Math.PI/180,color,parts};
    });
    return {room:{id:room.id,name:room.name,width:room.width,depth:room.depth,floor:room.floor,...(floorStyles[room.floor]||floorStyles.plain)},items};
}

export const Floor3D=(()=>{
    let THREE=null,OrbitControls=null,renderer=null,scene=null,camera=null,controls=null,canvas=null,observer=null;
    let latestPlan=null,latestRoom=null,pendingSignature='',renderedSignature='',renderedRoom=null,model=null;
    let visible=false,wanted=false,loading=false,error=null,loadPromise=null,frame=null,rendering=false,generation=0,frames=0,revision=0;
    let content=[],groups=new Map(),labels=[],batches=[],geometries=new Map(),materials=new Map(),labelCache=new Map(),initialized=false;
    const $=id=>typeof document==='undefined'?null:document.getElementById(id);
    const notice=message=>{const node=$('floor3DNotice');if(node){node.textContent=message;node.classList.toggle('hidden',!message);}};
    const request=fn=>window.requestAnimationFrame(fn);
    function ui(active){
        $('floorViewport')?.classList.toggle('hidden',active);$('floor3DViewport')?.classList.toggle('hidden',!active);
        document.querySelector('.zoom-toolbar')?.classList.toggle('hidden',active);
        document.querySelector('.tables-section')?.classList.toggle('view-3d',active);
        $('floor2DBtn')?.setAttribute('aria-pressed',String(!active));$('floor3DBtn')?.setAttribute('aria-pressed',String(active));
        $('reset3DBtn')?.classList.toggle('hidden',!active);
    }
    function schedule(){
        if(!visible||!renderer||frame!==null||rendering)return;
        frame=request(()=>{
            frame=null;if(!visible||!renderer)return;rendering=true;
            try{resize();if(renderedSignature!==pendingSignature)rebuild();sizeLabels();renderer.render(scene,camera);frames++;}
            catch(failure){error=failure.message||'render-failed';dispose(true);notice('La vue 3D est indisponible. Le plan 2D reste utilisable.');}
            finally{rendering=false;}
        });
    }
    function resize(){
        if(!renderer)return;const host=$('floor3DViewport'),width=Math.max(1,host.clientWidth),height=Math.max(1,host.clientHeight);
        const size=renderer.getSize(new THREE.Vector2());
        if(size.x!==width||size.y!==height){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
    }
    function geometry(shape){
        if(!geometries.has(shape)){
            const value=shape==='cylinder'?new THREE.CylinderGeometry(0.5,0.5,1,16):shape==='sphere'?new THREE.SphereGeometry(0.5,12,8):shape==='cone'?new THREE.ConeGeometry(0.5,1,16):new THREE.BoxGeometry(1,1,1);
            geometries.set(shape,value);
        }
        return geometries.get(shape);
    }
    function material(color,opacity=1){
        const key=color+':'+opacity;
        if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness:0.78,metalness:0.04,transparent:opacity<1,opacity,depthWrite:opacity===1}));
        return {key,value:materials.get(key)};
    }
    function clearContent(){
        for(const entry of content){scene.remove(entry);if(entry.isInstancedMesh)entry.dispose();if(entry.userData.temporary){entry.geometry.dispose();entry.material.dispose();}}
        content=[];groups.clear();labels=[];batches=[];
    }
    function add(node){scene.add(node);content.push(node);return node;}
    function labelFor(text){
        if(labelCache.has(text))return labelCache.get(text);
        const image=document.createElement('canvas');image.width=128;image.height=64;
        const context=image.getContext('2d');
        context.fillStyle='#fffffff2';context.fillRect(2,5,124,54);context.strokeStyle='#43584e';context.lineWidth=2;context.strokeRect(2,5,124,54);
        context.fillStyle='#193b30';context.font='bold 30px sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(text,64,33,116);
        const texture=new THREE.CanvasTexture(image);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;
        const value={texture,material:new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,sizeAttenuation:false})};labelCache.set(text,value);return value;
    }
    function sizeLabels(){
        for(const sprite of labels){
            const width=Math.max(44,Math.min(64,sprite.userData.text.length*9+16));
            const scale=labelScreenScale(width,26,Math.max(1,$('floor3DViewport').clientHeight),camera.projectionMatrix.elements[5]);
            sprite.scale.set(scale.x,scale.y,1);
        }
    }
    function rebuild(){
        if(!latestPlan)return;const next=buildFloorModel(latestPlan,latestRoom),roomChanged=renderedRoom!==latestRoom;
        clearContent();model=next;const usedMaterials=new Set(),usedLabels=new Set(),collected=new Map();
        const floorMat=material(next.room.color);usedMaterials.add(floorMat.key);
        const floor=new THREE.Mesh(geometry('box'),floorMat.value);floor.position.set(next.room.width/2,-0.03,next.room.depth/2);floor.scale.set(next.room.width,0.05,next.room.depth);add(floor);
        const coordinates=[],maxLines=160,step=Math.max(1,Math.ceil(Math.max(next.room.width/next.room.x,next.room.depth/next.room.z)/maxLines));
        for(let x=0;x<=next.room.width;x+=next.room.x*step)coordinates.push(x,0.001,0,x,0.001,next.room.depth);
        for(let z=0;z<=next.room.depth;z+=next.room.z*step)coordinates.push(0,0.001,z,next.room.width,0.001,z);
        const lines=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(coordinates,3)),new THREE.LineBasicMaterial({color:next.room.line,transparent:true,opacity:0.55}));lines.userData.temporary=true;add(lines);
        for(const item of next.items){
            const group=new THREE.Group();group.name='floor-'+item.id;group.userData.floorId=item.id;group.userData.label=item.label;
            group.position.set(item.x,0,item.z);group.rotation.y=item.rotationY;group.scale.set(item.width,1,item.depth);add(group);groups.set(item.id,group);
            for(const part of item.parts){
                const paint=material(part.color,part.opacity);usedMaterials.add(paint.key);
                if(part.color===item.color&&!group.userData.primaryMaterial)group.userData.primaryMaterial=paint.value;
                const node=new THREE.Object3D();node.position.set(part.x,part.y,part.z);node.scale.set(part.width,part.height,part.depth);node.rotation.y=part.rotationY;group.add(node);
                const key=part.shape+':'+paint.key;if(!collected.has(key))collected.set(key,{shape:part.shape,material:paint.value,nodes:[]});collected.get(key).nodes.push(node);
            }
            if(item.number!==undefined){
                const cached=labelFor(item.label);usedLabels.add(item.label);const sprite=new THREE.Sprite(cached.material);
                sprite.position.set(item.x,1.08,item.z);sprite.scale.set(Math.max(0.65,Math.min(1.15,item.width*0.7)),0.4,1);sprite.renderOrder=10;sprite.userData.floorId=item.id;sprite.userData.text=item.label;labels.push(sprite);add(sprite);
            }
        }
        scene.updateMatrixWorld(true);
        for(const batch of collected.values()){
            const mesh=new THREE.InstancedMesh(geometry(batch.shape),batch.material,batch.nodes.length);
            batch.nodes.forEach((node,index)=>mesh.setMatrixAt(index,node.matrixWorld));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();add(mesh);batches.push(mesh);
        }
        for(const [key,value] of materials)if(!usedMaterials.has(key)){value.dispose();materials.delete(key);}
        for(const [key,value] of labelCache)if(!usedLabels.has(key)){value.texture.dispose();value.material.dispose();labelCache.delete(key);}
        renderedSignature=pendingSignature;renderedRoom=latestRoom;revision++;
        if(roomChanged)reset();
    }
    function reset(){
        if(!camera||!controls||!model)return;
        const r=model.room,span=Math.max(r.width,r.depth),distance=framingDistance(r.width,r.depth,camera.fov,camera.aspect);
        controls.target.set(r.width/2,0.25,r.depth/2);
        camera.position.copy(controls.target).add(new THREE.Vector3(1,1.1,1).normalize().multiplyScalar(distance));
        camera.near=0.05;camera.far=Math.max(100,span*20);camera.zoom=1;camera.updateProjectionMatrix();
        controls.minDistance=Math.max(0.4,Math.min(r.width,r.depth)*0.05);controls.maxDistance=distance*6;controls.update();camera.updateMatrixWorld(true);schedule();
    }
    function sync(plan,roomId){
        try{
            const room=plan.rooms.find(room=>room.id===roomId);
            const signature=JSON.stringify({room,items:plan.tables.concat(plan.elements).filter(item=>item.roomId===roomId)});
            latestPlan=plan;latestRoom=roomId;if(signature===pendingSignature)return;pendingSignature=signature;schedule();
        }catch(_){if(visible)notice('Le plan ne peut pas être affiché en 3D. Vérifiez ses dimensions.');}
    }
    async function ensureRenderer(){
        if(renderer)return true;if(loadPromise)return loadPromise;
        const token=generation;let probeGL=null;loading=true;notice('Chargement de la vue 3D…');
        loadPromise=(async()=>{
            const candidate=document.createElement('canvas');
            let gl;try{gl=candidate.getContext('webgl2',{alpha:false,antialias:false,powerPreference:'default'});}catch(_){}
            if(!gl){error='webgl-unavailable';notice('La vue 3D est indisponible sur cet appareil. Le plan 2D reste utilisable.');return false;}
            probeGL=gl;
            const [three,orbit]=await Promise.all([import('./vendor/three/three.module.min.js'),import('./vendor/three/OrbitControls.js')]);
            if(token!==generation){gl.getExtension('WEBGL_lose_context')?.loseContext();probeGL=null;return false;}
            THREE=three;OrbitControls=orbit.OrbitControls;canvas=candidate;
            renderer=new THREE.WebGLRenderer({canvas,context:gl,antialias:false,alpha:false});
            probeGL=null;
            const mobile=window.matchMedia?.('(pointer: coarse)').matches||window.innerWidth<700;
            renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,mobile?1:1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
            renderer.setClearColor('#edf2ef');renderer.shadowMap.enabled=false;
            scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(45,1,0.05,1000);
            scene.add(new THREE.HemisphereLight('#ffffff','#83918b',2.1));const light=new THREE.DirectionalLight('#fff5e5',1.4);light.position.set(4,9,5);scene.add(light);
            controls=new OrbitControls(camera,canvas);controls.enableDamping=false;controls.autoRotate=false;controls.maxPolarAngle=Math.PI*0.49;controls.enablePan=true;controls.screenSpacePanning=true;controls.addEventListener('change',schedule);
            canvas.setAttribute('aria-label','Plan de salle en trois dimensions');canvas.addEventListener('webglcontextlost',contextLost);$('floor3DViewport').append(canvas);
            if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(schedule);observer.observe($('floor3DViewport'));}
            error=null;return true;
        })().catch(failure=>{probeGL?.getExtension('WEBGL_lose_context')?.loseContext();error=failure.message||'initialization-failed';dispose(true);notice('La vue 3D est indisponible. Le plan 2D reste utilisable.');return false;}).finally(()=>{if(token===generation)loading=false;});
        return loadPromise;
    }
    async function show(){
        const token=generation;wanted=true;if(typeof currentPlan==='function')sync(currentPlan(),floorRoom);
        const success=await ensureRenderer();if(token!==generation)return false;if(!success){visible=false;ui(false);return false;}if(!wanted)return false;
        visible=true;controls.enabled=true;ui(true);notice('Un doigt pour tourner. Deux doigts pour zoomer ou déplacer la vue.');schedule();return true;
    }
    function hide(){wanted=false;visible=false;if(controls)controls.enabled=false;if(frame!==null){window.cancelAnimationFrame(frame);frame=null;}ui(false);if(!error)notice('');}
    function contextLost(event){event.preventDefault();error='context-lost';dispose(true);notice('La vue 3D a été interrompue. Le plan 2D reste utilisable.');}
    function dispose(keepError=false){
        generation++;wanted=false;visible=false;loading=false;if(frame!==null){window.cancelAnimationFrame(frame);frame=null;}
        observer?.disconnect();observer=null;controls?.dispose();controls=null;
        if(scene)clearContent();for(const value of geometries.values())value.dispose();geometries.clear();for(const value of materials.values())value.dispose();materials.clear();
        for(const value of labelCache.values()){value.texture.dispose();value.material.dispose();}labelCache.clear();
        if(canvas)canvas.removeEventListener('webglcontextlost',contextLost);
        if(renderer){renderer.dispose();renderer.forceContextLoss();}canvas?.remove();renderer=null;canvas=null;scene=null;camera=null;model=null;
        groups.clear();labels=[];batches=[];content=[];renderedSignature='';renderedRoom=null;loadPromise=null;if(!keepError)error=null;
        if(typeof document!=='undefined'){ui(false);if(!keepError)notice('');}
    }
    function getState(){
        return {visible,ready:!!renderer,loading,error,roomId:renderedRoom,frames,revision,
            objects:[...groups].map(([id,group])=>({id,position:group.position.toArray(),rotationY:group.rotation.y,width:group.scale.x,depth:group.scale.z,color:group.userData.primaryMaterial?'#'+group.userData.primaryMaterial.color.getHexString():null,label:group.userData.label})),
            labels:labels.map(sprite=>({id:sprite.userData.floorId,text:sprite.userData.text,position:sprite.position.toArray(),visible:sprite.visible,scale:sprite.scale.toArray(),sizeAttenuation:sprite.material.sizeAttenuation,screenSize:{width:sprite.scale.x*camera.projectionMatrix.elements[5]*$('floor3DViewport').clientHeight/2,height:sprite.scale.y*camera.projectionMatrix.elements[5]*$('floor3DViewport').clientHeight/2}})),
            camera:camera?{position:camera.position.toArray(),target:controls.target.toArray(),matrix:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray(),zoom:camera.zoom}:null,
            viewport:{width:$('floor3DViewport')?.clientWidth||0,height:$('floor3DViewport')?.clientHeight||0},
            renderer:renderer?{calls:renderer.info.render.calls,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,programs:renderer.info.programs?.length||0}: {calls:0,geometries:0,textures:0,programs:0},
            batches:batches.map(mesh=>({count:mesh.count,geometry:mesh.geometry.type}))};
    }
    function init(){
        if(initialized)return;initialized=true;
        $('floor3DBtn')?.addEventListener('click',()=>{void show();});$('floor2DBtn')?.addEventListener('click',hide);$('reset3DBtn')?.addEventListener('click',reset);
        window.addEventListener('resize',schedule);window.addEventListener('beforeunload',()=>dispose());
    }
    if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();}
    return {sync,show,hide,reset,dispose,getState};
})();
if(typeof window!=='undefined')window.Floor3D=Floor3D;

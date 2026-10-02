import * as THREE from './vendor/three/three.module.min.js';
import { OrbitControls } from './vendor/three/OrbitControls.js';

// One geometry and one draw call per furniture item, with per-vertex colours.
export function furnitureGeometry(faces){
    const positions=[],normals=[],colours=[],colour=new THREE.Color();
    for(const face of faces){
        const n=face.normal,axis=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
        const points=face.points.map(p=>new THREE.Vector2(p[(axis+1)%3],p[(axis+2)%3]));
        const triangles=THREE.ShapeUtils.triangulateShape(points,[]);colour.set(face.color);
        for(const triangle of triangles){
            const a=face.points[triangle[0]],b=face.points[triangle[1]],c=face.points[triangle[2]];
            const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);
            const dot=(u[1]*v[2]-u[2]*v[1])*n[0]+(u[2]*v[0]-u[0]*v[2])*n[1]+(u[0]*v[1]-u[1]*v[0])*n[2];
            const ordered=dot<0?[a,c,b]:[a,b,c];
            for(const p of ordered){positions.push(...p);normals.push(...n);colours.push(colour.r,colour.g,colour.b);}
        }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
    geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
// Fit projected geometry rather than estimating from the room's depth.
export function fitCameraToPoints(camera,points,direction){
    const box=new THREE.Box3().setFromPoints(points),target=box.getCenter(new THREE.Vector3());
    const toward=direction.clone().normalize(),right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),toward).normalize(),up=new THREE.Vector3().crossVectors(toward,right);
    const tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanX=tanY*camera.aspect;
    let distance=.1;
    function measure(){
        distance=.1;
        for(const point of points){const q=point.clone().sub(target),z=q.dot(toward);distance=Math.max(distance,z+Math.abs(q.dot(right))/(tanX*.88),z+Math.abs(q.dot(up))/(tanY*.88));}
        camera.position.copy(target).addScaledVector(toward,distance);camera.lookAt(target);camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
    }
    // Centre the projected silhouette, including tall and asymmetrical furniture.
    for(let pass=0;pass<4;pass++){
        measure();const projected=points.map(p=>p.clone().project(camera));
        const x=(Math.min(...projected.map(p=>p.x))+Math.max(...projected.map(p=>p.x)))/2;
        const y=(Math.min(...projected.map(p=>p.y))+Math.max(...projected.map(p=>p.y)))/2;
        target.addScaledVector(right,x*distance*tanX).addScaledVector(up,y*distance*tanY);
    }
    measure();return target;
}
export function placeLabels(candidates,width,height){
    const placed=[];
    for(const label of [...candidates].sort((a,b)=>Number(b.selected)-Number(a.selected)||a.z-b.z)){
        if(placed.length>=80&&!label.selected)continue;
        for(const offset of [0,-24,24,-48,48]){
            const rect={...label,x:Math.max(4,Math.min(width-label.width-4,label.x-label.width/2)),y:label.y-label.height+offset};
            if(rect.y<4||rect.y+rect.height>height-4)continue;
            if(placed.some(p=>rect.x<p.x+p.width+4&&rect.x+rect.width+4>p.x&&rect.y<p.y+p.height+3&&rect.y+rect.height+3>p.y))continue;
            placed.push(rect);break;
        }
    }
    return placed;
}
function floorTexture(style){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle={plain:'#eeeae0',wood:'#a78960',tile:'#e3dfd4',stone:'#b7b5aa'}[style]||'#eeeae0';ctx.fillRect(0,0,256,256);
    if(style==='wood'){
        for(let row=0;row<4;row++){
            ctx.fillStyle=row%2?'#ad906b':'#9f825c';ctx.fillRect(0,row*64,256,63);
            ctx.strokeStyle='#756044';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,row*64);ctx.lineTo(256,row*64);ctx.moveTo(row%2?80:192,row*64);ctx.lineTo(row%2?80:192,row*64+64);ctx.stroke();
            ctx.strokeStyle='#d2b99135';for(let i=0;i<8;i++){ctx.beginPath();ctx.moveTo(0,row*64+i*7);ctx.bezierCurveTo(80,row*64+i*7+4,180,row*64+i*7-3,256,row*64+i*7);ctx.stroke();}
        }
    }else if(style!=='plain'){
        ctx.strokeStyle=style==='tile'?'#fff9ef':'#e0ddd1';ctx.lineWidth=2;
        for(let i=0;i<=256;i+=64){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,256);ctx.moveTo(0,i);ctx.lineTo(256,i);ctx.stroke();}
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;return texture;
}
export function createFloorScene(host,api){
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor('#e8eee8');
    renderer.domElement.setAttribute('aria-label','Plan de salle en 3D : glissez pour tourner, utilisez la molette pour zoomer');
    renderer.domElement.setAttribute('tabindex','0');host.append(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.01,1000);
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=false;controls.maxPolarAngle=Math.PI/2-.04;controls.minDistance=.3;controls.maxDistance=200;
    controls.target.set(0,0,0);camera.position.set(8,11,12);controls.update();
    scene.add(new THREE.HemisphereLight('#ffffff','#718070',2));
    const sun=new THREE.DirectionalLight('#fff4dc',2.3);sun.position.set(-6,12,8);scene.add(sun);
    const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8,metalness:.02});
    const models=new THREE.Group();scene.add(models);
    const geometryCache=new Map(),objects=new Map(),labels=new Map();
    const overlay=document.createElement('div');overlay.className='three-labels';host.append(overlay);
    const selectionGroup=new THREE.Group();scene.add(selectionGroup);
    const selectionMaterial=new THREE.LineBasicMaterial({color:'#138a70',depthTest:false});
    let ground=null,texture=null,roomKey='',roomId='',unit=1,room=null,active=true,frame=null,selected=new Set(),mode='camera',drag=null,pointerStart=null,disposed=false;
    const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
    function requestRender(){if(active&&!disposed&&frame===null)frame=requestAnimationFrame(render);}
    function render(){
        frame=null;if(!active||disposed)return;
        const width=host.clientWidth,height=host.clientHeight;if(!width||!height)return;
        if(renderer.domElement.width!==Math.floor(width*renderer.getPixelRatio())||renderer.domElement.height!==Math.floor(height*renderer.getPixelRatio())){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
        renderer.render(scene,camera);
        const candidates=[];
        for(const [id,label] of labels){
            const mesh=objects.get(id),p=new THREE.Vector3(mesh.position.x,mesh.position.y+mesh.userData.height+.08,mesh.position.z).project(camera);
            label.hidden=true;label.classList.toggle('is-selected',selected.has(id));
            if(p.z>-1&&p.z<1&&Math.abs(p.x)<1&&Math.abs(p.y)<1)candidates.push({id,x:(p.x*.5+.5)*width,y:(-p.y*.5+.5)*height,z:p.z,width:Math.max(34,label.textContent.length*8+16),height:23,selected:selected.has(id)});
        }
        for(const p of placeLabels(candidates,width,height)){const label=labels.get(p.id);label.hidden=false;label.style.left=p.x+'px';label.style.top=p.y+'px';}

    }
    controls.addEventListener('change',requestRender);
    const observer=new ResizeObserver(requestRender);observer.observe(host);
    function geometryFor(item){
        const visual=api.visual(item),key=JSON.stringify([visual.type,visual.shape,visual.width,visual.depth,visual.capacity,visual.color]);
        if(!geometryCache.has(key))geometryCache.set(key,furnitureGeometry(api.model(item)));
        return geometryCache.get(key);
    }
    function position(mesh,item){
        const b=api.bounds(item),visual=api.visual(item),scale=item.width/visual.width*unit;
        mesh.position.set((item.x*room.width/100+b.width/2-room.width/2)*unit,0,(item.y*room.depth/100+b.depth/2-room.depth/2)*unit);
        mesh.rotation.y=(item.angle||0)*Math.PI/180;mesh.scale.setScalar(scale);
        mesh.userData.height=(mesh.geometry.boundingBox?.max.y||1)*scale;
    }
    function setSelection(ids){
        selected=new Set(ids);
        for(const child of [...selectionGroup.children]){child.geometry.dispose();selectionGroup.remove(child);}
        for(const id of selected){const mesh=objects.get(id);if(!mesh)continue;const b=api.bounds(mesh.userData.item),w=b.width*unit/2,d=b.depth*unit/2;
            const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-w,.025,-d),new THREE.Vector3(w,.025,-d),new THREE.Vector3(w,.025,d),new THREE.Vector3(-w,.025,d),new THREE.Vector3(-w,.025,-d)]);
            const line=new THREE.Line(geometry,selectionMaterial);line.position.copy(mesh.position);line.renderOrder=2;selectionGroup.add(line);
        }
        requestRender();
    }
    function fit(top=false){
        if(!room)return;const box=new THREE.Box3();for(const mesh of objects.values())box.expandByObject(mesh);
        if(box.isEmpty())box.setFromCenterAndSize(new THREE.Vector3(),new THREE.Vector3(room.width*unit,.1,room.depth*unit));
        camera.aspect=Math.max(.2,host.clientWidth/Math.max(1,host.clientHeight));
        const points=[];
        for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new THREE.Vector3(x,y,z));
        controls.target.copy(fitCameraToPoints(camera,points,top?new THREE.Vector3(0,1,.001):new THREE.Vector3(.45,1,.8)));
        controls.update();requestRender();
    }
    function sync(plan,id,ids){
        room=plan.rooms.find(r=>r.id===id);if(!room)return;
        const changedRoom=roomId!==id;roomId=id;unit=12/Math.max(12,room.width,room.depth);
        const key=JSON.stringify([room.id,room.width,room.depth,room.floor]);
        if(key!==roomKey){
            if(ground){scene.remove(ground);ground.geometry.dispose();ground.material.dispose();texture.dispose();}
            texture=floorTexture(room.floor);const scales=plan.tables.filter(t=>t.roomId===id).map(t=>t.width/api.visual(t).width).sort((a,b)=>a-b);
            const furnitureScale=scales.length?scales[Math.floor(scales.length/2)]:1;
            texture.repeat.set(Math.max(1,room.width/furnitureScale/4),Math.max(1,room.depth/furnitureScale/4));texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
            ground=new THREE.Mesh(new THREE.PlaneGeometry(room.width*unit,room.depth*unit),new THREE.MeshStandardMaterial({map:texture,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.015;scene.add(ground);roomKey=key;
        }
        const items=plan.tables.concat(plan.elements).filter(t=>t.roomId===id),idsNow=new Set(items.map(t=>t.id));
        for(const [id,mesh] of objects)if(!idsNow.has(id)){models.remove(mesh);if(mesh.userData.zone){mesh.geometry.dispose();mesh.material.dispose();}objects.delete(id);labels.get(id)?.remove();labels.delete(id);}
        for(const item of items){
            let mesh=objects.get(item.id);
            if(mesh&&!!mesh.userData.zone!==(item.type==='zone')){models.remove(mesh);if(mesh.userData.zone){mesh.geometry.dispose();mesh.material.dispose();}objects.delete(item.id);mesh=null;}
            if(item.type==='zone'){
                if(!mesh){mesh=new THREE.Mesh(new THREE.BoxGeometry(1,.01,1),new THREE.MeshBasicMaterial({color:item.color,transparent:true,opacity:.15,depthWrite:false}));mesh.userData.zone=true;objects.set(item.id,mesh);models.add(mesh);}
                const b=api.bounds(item);mesh.position.set((item.x*room.width/100+b.width/2-room.width/2)*unit,.005,(item.y*room.depth/100+b.depth/2-room.depth/2)*unit);mesh.rotation.y=(item.angle||0)*Math.PI/180;mesh.scale.set(item.width*unit,1,item.depth*unit);mesh.material.color.set(item.color);mesh.userData.height=.01;
            }else{
                const geometry=geometryFor(item);if(!mesh){mesh=new THREE.Mesh(geometry,material);objects.set(item.id,mesh);models.add(mesh);}else mesh.geometry=geometry;
                position(mesh,item);
            }
            mesh.userData.item=item;
            if(item.number!==undefined){let label=labels.get(item.id);if(!label){label=document.createElement('span');label.className='three-table-label';overlay.append(label);labels.set(item.id,label);}label.textContent='T'+item.number+(item.letter||'');}
        }
        const used=new Set([...objects.values()].map(m=>m.geometry));for(const [key,g] of geometryCache)if(!used.has(g)){g.dispose();geometryCache.delete(key);}
        setSelection(ids);if(changedRoom)fit();requestRender();
    }
    function pick(event){const rect=renderer.domElement.getBoundingClientRect();mouse.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(mouse,camera);const hits=raycaster.intersectObjects([...objects.values()],false);return (hits.find(h=>!h.object.userData.zone)||hits[0])?.object;}
    function floorPoint(event){pick(event);return raycaster.ray.intersectPlane(plane,new THREE.Vector3());}
    renderer.domElement.addEventListener('pointerdown',event=>{
        if(event.button!==0)return;pointerStart={x:event.clientX,y:event.clientY};
        const mesh=pick(event);if(mode!=='move'||!api.editing()||!mesh)return;
        const point=floorPoint(event);if(!point)return;controls.enabled=false;
        api.select(mesh.userData.item.id,event.shiftKey||event.ctrlKey||event.metaKey);
        drag={point,unit,width:room.width,depth:room.depth,ids:new Set(api.selected())};api.beginMove();renderer.domElement.setPointerCapture(event.pointerId);
    },true);
    renderer.domElement.addEventListener('pointermove',event=>{
        if(!drag)return;const point=floorPoint(event);if(!point)return;
        api.move((point.x-drag.point.x)/drag.unit/drag.width*100,(point.z-drag.point.z)/drag.unit/drag.depth*100);
        const latest=api.items();for(const item of latest){const mesh=objects.get(item.id);if(mesh&&drag.ids.has(item.id)){mesh.userData.item=item;if(!mesh.userData.zone)position(mesh,item);else{const b=api.bounds(item);mesh.position.x=(item.x*room.width/100+b.width/2-room.width/2)*unit;mesh.position.z=(item.y*room.depth/100+b.depth/2-room.depth/2)*unit;}}}
        setSelection(api.selected());
    });
    function endPointer(event){
        if(drag){drag=null;controls.enabled=true;api.endMove();pointerStart=null;return;}
        if(pointerStart&&Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)<6){const mesh=pick(event);if(mesh)api.select(mesh.userData.item.id,event.shiftKey||event.ctrlKey||event.metaKey);}
        pointerStart=null;
    }
    renderer.domElement.addEventListener('pointerup',endPointer);
    renderer.domElement.addEventListener('pointercancel',()=>{if(drag){drag=null;controls.enabled=true;api.endMove();}pointerStart=null;});
    const contextLost=event=>{event.preventDefault();api.error('La vue 3D a été interrompue. Votre plan reste disponible en vue 2D.');};renderer.domElement.addEventListener('webglcontextlost',contextLost);
    return {sync,setSelection,fit,requestRender,centre(){return room?{x:(controls.target.x/unit+room.width/2)/room.width*100,y:(controls.target.z/unit+room.depth/2)/room.depth*100}:null;},setMode(value){mode=value;renderer.domElement.style.cursor=value==='move'?'grab':'var(--resto-cursor)';},setActive(value){active=value;controls.enabled=value;if(!value&&frame!==null){cancelAnimationFrame(frame);frame=null;}if(value)requestRender();},dispose(){disposed=true;if(frame!==null)cancelAnimationFrame(frame);observer.disconnect();controls.dispose();for(const g of geometryCache.values())g.dispose();for(const mesh of objects.values())if(mesh.userData.zone){mesh.geometry.dispose();mesh.material.dispose();}for(const line of selectionGroup.children)line.geometry.dispose();ground?.geometry.dispose();ground?.material.dispose();texture?.dispose();selectionMaterial.dispose();material.dispose();renderer.dispose();host.replaceChildren();}};
}

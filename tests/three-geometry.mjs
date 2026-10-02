import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {furnitureGeometry} from '../floor-three-scene.mjs';
const context=vm.createContext({});vm.runInContext(fs.readFileSync('floor-3d.js','utf8'),context);
const model=vm.runInContext('Floor3D.model',context);
for(const type of ['table','bar','wall','door','window','pillar','plant','kitchen','toilets','lamp','chair','buffet','reception','sofa']){
 for(const scale of [.25,1,25]){
  const geometry=furnitureGeometry(model({type:type==='table'?undefined:type,shape:'square',capacity:4,width:1.2*scale,depth:1.2*scale,color:'#8a5a29'}));
  const p=geometry.attributes.position,n=geometry.attributes.normal;
  assert(p.count>0&&p.count%3===0,type);assert([...p.array,...n.array].every(Number.isFinite),type);
  assert(geometry.boundingSphere.radius>0,type);
  for(let i=0;i<p.count;i+=3){
   const a=[p.getX(i),p.getY(i),p.getZ(i)],b=[p.getX(i+1),p.getY(i+1),p.getZ(i+1)],c=[p.getX(i+2),p.getY(i+2),p.getZ(i+2)];
   const u=b.map((v,j)=>v-a[j]),v=c.map((v,j)=>v-a[j]);
   assert((u[1]*v[2]-u[2]*v[1])*n.getX(i)+(u[2]*v[0]-u[0]*v[2])*n.getY(i)+(u[0]*v[1]-u[1]*v[0])*n.getZ(i)>=-1e-7,'Outward triangle: '+type);
  }
  geometry.dispose();
 }
}
console.log('PASS: 14 furniture types, three scales, finite vertices and consistent outward triangles.');

const THREE=await import('../vendor/three/three.module.min.js');
const {fitCameraToPoints,placeLabels}=await import('../floor-three-scene.mjs');
for(const aspect of [.5,1,2.4])for(const size of [[12,1,8],[12,4,2],[2,6,12]])for(const top of [false,true]){
 const camera=new THREE.PerspectiveCamera(40,aspect,.01,1000),points=[];
 for(const x of [-size[0]/2,size[0]/2])for(const y of [0,size[1]])for(const z of [-size[2]/2,size[2]/2])points.push(new THREE.Vector3(x,y,z));
 fitCameraToPoints(camera,points,top?new THREE.Vector3(0,1,.001):new THREE.Vector3(.45,1,.8));
 const projected=points.map(p=>p.clone().project(camera));
 assert(projected.every(p=>Math.abs(p.x)<=.881&&Math.abs(p.y)<=.881&&p.z>-1&&p.z<1),'Furniture fits viewport');
 for(const axis of ['x','y'])assert(Math.abs(Math.min(...projected.map(p=>p[axis]))+Math.max(...projected.map(p=>p[axis])))<.1,'Projection centred');
}
const crowded=Array.from({length:30},(_,i)=>({id:i,x:90+i%5*18,y:100+Math.floor(i/5)*12,width:40,height:23,z:i/30,selected:i===29}));
const packed=placeLabels(crowded,320,250);assert(packed.some(p=>p.id===29));
for(let i=0;i<packed.length;i++)for(let j=i+1;j<packed.length;j++){const a=packed[i],b=packed[j];assert(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y),'No overlapping labels');}
console.log('PASS: perspective/top framing on phone/desktop, tall/wide scenes, and collision-free table labels.');

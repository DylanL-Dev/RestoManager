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

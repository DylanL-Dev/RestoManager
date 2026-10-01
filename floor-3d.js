'use strict';
// Actual XYZ geometry, rotated around the vertical axis before fixed-camera projection.
const Floor3D=(()=>{
 const camera=[0,.866,.5],light=[-.45,.8,.4],cache=new Map();
 const rotate=(p,a)=>[p[0]*Math.cos(a)+p[2]*Math.sin(a),p[1],-p[0]*Math.sin(a)+p[2]*Math.cos(a)];
 const project=p=>[p[0],p[2]*.866-p[1]*.5];
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
 function shade(hex,normal){const n=hex.replace('#','');const rgb=[0,2,4].map(i=>parseInt(n.slice(i,i+2),16));const k=.5+.5*Math.max(0,dot(normal,light));return '#'+rgb.map(c=>Math.min(255,Math.round(c*k)).toString(16).padStart(2,'0')).join('');}
 function model(item){
  const faces=[],wood=item.color||'#ad814f',green='#39745b',leg='#604530';
  const face=(points,normal,color)=>faces.push({points,normal,color});
  const box=(x,y,z,w,h,d,color)=>{
   const p=[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]].map(q=>[x+q[0]*w/2,y+q[1]*h/2,z+q[2]*d/2]);
   [[[4,7,6,5],[0,1,0]],[[0,1,2,3],[0,-1,0]],[[0,4,5,1],[0,0,-1]],[[3,2,6,7],[0,0,1]],[[0,3,7,4],[-1,0,0]],[[1,5,6,2],[1,0,0]]].forEach(([ids,n])=>face(ids.map(i=>p[i]),n,color));
  };
  const cylinder=(x,y,z,r,h,color,segments=20)=>{
   const top=[],bottom=[];for(let i=0;i<segments;i++){const a=i*2*Math.PI/segments;top.push([x+r*Math.cos(a),y+h/2,z+r*Math.sin(a)]);bottom.push([x+r*Math.cos(a),y-h/2,z+r*Math.sin(a)]);}
   face(top,[0,1,0],color);for(let i=0;i<segments;i++){const j=(i+1)%segments,a=(i+.5)*2*Math.PI/segments;face([bottom[i],bottom[j],top[j],top[i]],[Math.cos(a),0,Math.sin(a)],color);}
  };
  const w=item.width||1.2,d=item.depth||1.2,tw=w*.62,td=d*.60,ty=.70*Math.min(1,w/1.2,d/1.2),count=Math.min(12,item.capacity||2);
  if(item.shape==='round')cylinder(0,ty,0,Math.min(tw,td)/2,.075,wood,36);else box(0,ty,0,tw,.075,td,wood);
  const lh=ty-.05;for(const x of [-tw*.39,tw*.39])for(const z of [-td*.38,td*.38])box(x,lh/2,z,.05,lh,.05,leg);
  // Subtle grain strips live on the horizontal tabletop and rotate with it.
  if(item.shape!=='round')for(let i=1;i<8;i++)box(-tw/2+i*tw/8,ty+.039,0,.006,.001,td*.93,'#bf9968');
  function chair(x,z,a,benchWidth){
   const start=faces.length,cw=benchWidth||Math.min(w,d)*.23,cd=Math.min(w,d)*.21,sy=ty*.58;
   box(0,sy,0,cw,.10,cd,green);box(0,sy+.19,-cd*.46,cw,.32,.06,green);
   box(0,sy+.35,-cd*.46,cw,.035,.065,'#8b9c71');
   for(const lx of [-cw*.35,cw*.35])for(const lz of [-cd*.35,cd*.35])box(lx,sy/2,lz,.025,sy,.025,leg);
   for(let i=start;i<faces.length;i++){faces[i].points=faces[i].points.map(p=>{const q=rotate(p,a);return [q[0]+x,q[1],q[2]+z];});faces[i].normal=rotate(faces[i].normal,a);}
  }
  if(item.shape==='bench'){chair(0,-d*.38,0,w*.86);chair(0,d*.38,Math.PI,w*.86);}
  else if(item.shape==='round'){for(let i=0;i<count;i++){const a=i*2*Math.PI/count;chair(Math.sin(a)*w*.38,-Math.cos(a)*d*.38,-a);}}
  else if(item.shape==='square'&&count<=4){[[0,-d*.38,0],[0,d*.38,Math.PI],[-w*.38,0,-Math.PI/2],[w*.38,0,Math.PI/2]].slice(0,count).forEach(p=>chair(...p));}
  else{for(let i=0;i<count;i++){const row=i%2,col=Math.floor(i/2),cols=Math.ceil(count/2);chair(-tw*.42+(col+.5)*tw*.84/cols,row?d*.38:-d*.38,row?Math.PI:0);}}
  const pr=Math.min(tw,td)*.09;
  for(const z of [-td*.29,td*.29]){cylinder(0,ty+.048,z,pr,.015,'#f1eee0');cylinder(0,ty+.057,z,pr*.75,.004,'#fffaf0');}
  return faces;
 }
 function render(item){
  const key=JSON.stringify([item.width,item.depth,item.angle,item.shape,item.capacity,item.color]);if(cache.has(key))return cache.get(key);
  const a=(item.angle||0)*Math.PI/180;
  const visible=model(item).map(f=>({...f,points:f.points.map(p=>rotate(p,a)),normal:rotate(f.normal,a)})).filter(f=>dot(f.normal,camera)>.00001);
  visible.sort((a,b)=>a.points.reduce((s,p)=>s+dot(p,camera),0)/a.points.length-b.points.reduce((s,p)=>s+dot(p,camera),0)/b.points.length);
  const vertices=visible.flatMap(f=>f.points.map(project)),xs=vertices.map(p=>p[0]),ys=vertices.map(p=>p[1]);
  const minx=Math.min(...xs)-.035,miny=Math.min(...ys)-.035,width=Math.max(...xs)-minx+.035,height=Math.max(...ys)-miny+.035;
  const polygons=visible.map(f=>'<polygon points="'+f.points.map(p=>project(p).map(v=>v.toFixed(4)).join(',')).join(' ')+'" fill="'+shade(f.color,f.normal)+'" stroke="'+shade(f.color,f.normal)+'" stroke-width="0.002" stroke-linejoin="round"/>').join('');
  const result='<svg class="geometry-3d" viewBox="'+[minx,miny,width,height].join(' ')+'" preserveAspectRatio="none" aria-hidden="true">'+polygons+'</svg>';
  if(cache.size>=128)cache.delete(cache.keys().next().value);cache.set(key,result);return result;
 }
 return {render,model,rotate,project,shade};
})();

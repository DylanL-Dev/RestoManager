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
  const tint=(hex,k)=>'#'+[1,3,5].map(i=>Math.min(255,Math.round(parseInt(hex.slice(i,i+2),16)*k)).toString(16).padStart(2,'0')).join('');
  // Three rounded rings form a bevel; normals keep highlights fixed in world space.
  const softBox=(x,y,z,w,h,d,color,r=Math.min(w,d)*.12)=>{
   r=Math.min(r,w*.45,d*.45);const bevel=Math.min(h*.22,r*.4);
   const ring=(inset,height)=>{const rw=w/2-inset,rd=d/2-inset,rr=Math.max(.001,r-inset),out=[];
    for(let corner=0;corner<4;corner++){const a0=corner*Math.PI/2,cx=(corner===0||corner===3?1:-1)*(rw-rr),cz=(corner<2?1:-1)*(rd-rr);
     for(let j=0;j<=3;j++){const a=a0+j*Math.PI/6;out.push([x+cx+Math.cos(a)*rr,height,z+cz+Math.sin(a)*rr]);}}
    return out;
   };
   const rings=[ring(bevel,y-h/2),ring(0,y+h/2-bevel),ring(bevel,y+h/2)];
   face(rings[2],[0,1,0],color);
   for(let k=0;k<2;k++)for(let i=0;i<16;i++){const j=(i+1)%16,p=rings[k][i],q=rings[k][j],u=rings[k+1][i],a=q.map((v,n)=>v-p[n]),b=u.map((v,n)=>v-p[n]);let n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];const len=Math.hypot(...n)||1;n=n.map(v=>-v/len);face([p,q,rings[k+1][j],u],n,k?tint(color,1.1):color);}
  };
  const box=(x,y,z,w,h,d,color)=>{
   const p=[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]].map(q=>[x+q[0]*w/2,y+q[1]*h/2,z+q[2]*d/2]);
   [[[4,7,6,5],[0,1,0]],[[0,1,2,3],[0,-1,0]],[[0,4,5,1],[0,0,-1]],[[3,2,6,7],[0,0,1]],[[0,3,7,4],[-1,0,0]],[[1,5,6,2],[1,0,0]]].forEach(([ids,n])=>face(ids.map(i=>p[i]),n,color));
  };
  const cylinder=(x,y,z,r,h,color,segments=20)=>{
   const top=[],bottom=[];for(let i=0;i<segments;i++){const a=i*2*Math.PI/segments;top.push([x+r*Math.cos(a),y+h/2,z+r*Math.sin(a)]);bottom.push([x+r*Math.cos(a),y-h/2,z+r*Math.sin(a)]);}
   face(top,[0,1,0],color);for(let i=0;i<segments;i++){const j=(i+1)%segments,a=(i+.5)*2*Math.PI/segments;face([bottom[i],bottom[j],top[j],top[i]],[Math.cos(a),0,Math.sin(a)],color);}
  };
  const w=item.width||1.2,d=item.depth||1.2,tw=w*.62,td=d*.60,ty=.70*Math.min(1,w/1.2,d/1.2),count=Math.min(12,item.capacity||2);
  // Structural pieces use the same vertical axis, camera and lighting as tables.
  if(item.type){
   const metal='#b09a68',cream='#e5ddcb',dark='#354b43';
   const cabinet=(height=.9)=>{box(0,height/2,0,w*.94,height,d*.88,wood);box(0,height+.035,0,w,.07,d,cream);for(let i=0;i<Math.max(2,Math.ceil(w/.6));i++){const n=Math.max(2,Math.ceil(w/.6)),x=-w*.47+(i+.5)*w*.94/n;box(x,height*.48,d*.445,w*.94/n-.018,height*.82,.012,wood);box(x,height*.65,d*.46,.09,.014,.015,metal);}};
   const armchair=(width=w,depth=d)=>{box(0,.23,0,width*.74,.35,depth*.7,green);box(0,.43,0,width*.7,.12,depth*.65,'#51806b');box(0,.63,-depth*.34,width*.8,.5,depth*.16,green);for(const x of [-width*.39,width*.39])box(x,.48,0,width*.13,.28,depth*.78,green);for(const x of [-width*.3,width*.3])for(const z of [-depth*.28,depth*.28])box(x,.08,z,.035,.16,.035,leg);};
   switch(item.type){
    case 'bar':
     box(0,.51,0,w*.93,.96,d*.82,wood);
     box(0,.09,0,w*.88,.18,d*.76,dark);
     for(let i=0,n=Math.min(36,Math.max(8,Math.round(w/.09)));i<n;i++){const x=-w*.45+(i+.5)*w*.9/n;softBox(x,.56,d*.42,w*.9/n*.68,.83,.035,i%3?wood:tint(wood,1.1),.008);}
     softBox(0,1.055,0,w,.105,d,cream,.06);
     box(0,.22,d*.48,w*.9,.025,.025,metal);
     for(const x of [-w*.35,w*.35])box(x,.18,d*.44,.025,.09,.09,metal);
     break;
    case 'buffet': cabinet();for(const x of [-w*.28,0,w*.28]){box(x,.965,0,w*.2,.055,d*.55,'#b8c0bc');box(x,1.01,-d*.16,w*.2,.045,.03,metal);}break;
    case 'reception': cabinet(1);box(-w*.22,1.15,0,w*.22,.22,.045,dark);box(-w*.22,1.03,.07,w*.25,.02,.13,dark);break;
    case 'sofa': armchair();for(let i=1;i<3;i++)box(-w*.35+i*w*.7/3,.495,0,.012,.005,d*.62,'#2b5947');break;
    case 'chair': armchair();break;
    case 'plant': cylinder(0,.17,0,Math.min(w,d)*.25,.34,'#c59b74');cylinder(0,.345,0,Math.min(w,d)*.23,.02,'#514335');box(0,.55,0,.035,.5,.035,leg);for(let i=0;i<9;i++){const a=i*2.4,r=Math.min(w,d)*(.18+.12*(i%2)),y=.5+i*.05;const start=faces.length;box(0,y,0,.09,.035,r*1.7,i%2?'#49805a':'#2e6545');for(let j=start;j<faces.length;j++){faces[j].points=faces[j].points.map(p=>{const q=rotate(p,a);return [q[0]+Math.sin(a)*r*.45,q[1],q[2]+Math.cos(a)*r*.45];});faces[j].normal=rotate(faces[j].normal,a);}}break;
    case 'lamp': cylinder(0,.025,0,Math.min(w,d)*.27,.05,dark);cylinder(0,.72,0,.018,1.4,metal,12);cylinder(0,1.32,0,Math.min(w,d)*.46,.32,cream);cylinder(0,1.49,0,Math.min(w,d)*.43,.018,'#f5ead0');break;
    case 'wall': box(0,.6,0,w,1.2,d,cream);box(0,.055,d*.51,w,.11,.025,'#b7a78b');break;
    case 'pillar': box(0,.65,0,w*.85,1.3,d*.85,cream);box(0,.06,0,w,.12,d,'#b7a78b');box(0,1.29,0,w,.08,d,'#eee6d7');break;
    case 'door': for(const x of [-w*.46,w*.46])box(x,.65,0,w*.08,1.3,d,leg);box(0,1.27,0,w,.08,d,leg);box(-w*.03,.62,0,w*.82,1.2,d*.35,wood);cylinder(w*.28,.61,d*.3,.025,.06,metal,12);break;
    case 'window': box(0,.75,0,w,1.15,d,'#689eab');for(const x of [-w*.47,0,w*.47])box(x,.75,d*.55,.035,1.2,.035,cream);for(const y of [.17,.75,1.33])box(0,y,d*.55,w,.035,.035,cream);break;
    case 'kitchen': cabinet();for(const x of [-w*.28,0])for(const z of [-d*.2,d*.2])cylinder(x,.955,z,Math.min(w*.12,d*.15),.018,dark);box(w*.28,.95,0,w*.24,.04,d*.58,'#9eaaa8');box(w*.28,1.06,-d*.24,.025,.23,.025,metal);break;
    case 'toilets': box(0,.05,0,w,.1,d,'#dcd9cc');for(const x of [-w*.27,w*.27]){box(x,.38,-d*.23,w*.24,.6,d*.24,'#f3eee2');cylinder(x,.28,d*.05,Math.min(w*.15,d*.2),.4,'#eee9de');cylinder(x,.49,d*.05,Math.min(w*.12,d*.16),.025,'#a4b6b1');}break;
    default: return [];
   }
   return faces;
  }
  if(item.shape==='round'){cylinder(0,ty-.012,0,Math.min(tw,td)/2,.065,tint(wood,.8),36);cylinder(0,ty+.024,0,Math.min(tw,td)/2*.99,.025,wood,36);}else softBox(0,ty,0,tw,.075,td,wood,.045);
  box(0,ty-.085,0,tw*.83,.085,td*.82,tint(wood,.72));
  const lh=ty-.05;for(const x of [-tw*.39,tw*.39])for(const z of [-td*.38,td*.38])box(x,lh/2,z,.05,lh,.05,leg);
  // Subtle grain strips live on the horizontal tabletop and rotate with it.
  if(item.shape!=='round')for(let i=1;i<15;i++){const x=-tw*.45+i*tw*.9/15;const points=[];for(let j=0;j<7;j++)points.push([x+Math.sin(i*2+j*.9)*.003,ty+.039,-td*.43+j*td*.86/6]);face(points.concat(points.slice().reverse().map(p=>[p[0]+.002,p[1],p[2]])),[0,1,0],tint(wood,i%3?1.07:.9));}
  function chair(x,z,a,benchWidth){
   const start=faces.length,cw=benchWidth||Math.min(w,d)*.23,cd=Math.min(w,d)*.21,sy=ty*.58;
   softBox(0,sy,0,cw,.085,cd,tint(green,.78));softBox(0,sy+.06,0,cw*.93,.09,cd*.92,'#51806b');
   // Rounded padded back, gently wrapped towards the sitter.
   softBox(0,sy+.2,-cd*.44,cw,.32,.075,green,.03);
   softBox(0,sy+.2,-cd*.39,cw*.85,.265,.04,'#467e64',.018);
   for(const x of [-cw*.46,cw*.46])softBox(x,sy+.1,0,.035,.13,cd*.8,green,.013);
   for(const x of [-cw*.25,0,cw*.25])box(x,sy+.2,-cd*.30,.003,.21,.003,'#386c53');
   for(const lx of [-cw*.35,cw*.35])for(const lz of [-cd*.35,cd*.35])box(lx,sy/2,lz,.025,sy,.025,leg);
   for(let i=start;i<faces.length;i++){faces[i].points=faces[i].points.map(p=>{const q=rotate(p,a);return [q[0]+x,q[1],q[2]+z];});faces[i].normal=rotate(faces[i].normal,a);}
  }
  if(item.shape==='bench'){chair(0,-d*.38,0,w*.86);chair(0,d*.38,Math.PI,w*.86);}
  else if(item.shape==='round'){for(let i=0;i<count;i++){const a=i*2*Math.PI/count;chair(Math.sin(a)*w*.38,-Math.cos(a)*d*.38,-a);}}
  else if(item.shape==='square'&&count<=4){[[0,-d*.38,0],[0,d*.38,Math.PI],[-w*.38,0,-Math.PI/2],[w*.38,0,Math.PI/2]].slice(0,count).forEach(p=>chair(...p));}
  else{for(let i=0;i<count;i++){const row=i%2,col=Math.floor(i/2),cols=Math.ceil(count/2);chair(-tw*.42+(col+.5)*tw*.84/cols,row?d*.38:-d*.38,row?Math.PI:0);}}
  const pr=Math.min(tw,td)*.09;
  const settings=Math.min(count,10);
  for(let i=0;i<settings;i++){let x,z;if(item.shape==='round'){const a=i*2*Math.PI/settings;x=Math.sin(a)*tw*.31;z=Math.cos(a)*td*.31;}else{const cols=Math.ceil(settings/2);x=-tw*.42+(Math.floor(i/2)+.5)*tw*.84/cols;z=(i%2?1:-1)*td*.29;}
   cylinder(x,ty+.048,z,pr,.015,'#f1eee0');cylinder(x,ty+.057,z,pr*.75,.004,'#fffaf0');box(x+pr*1.5,ty+.049,z,.018,.003,pr*1.5,'#c5c9c0');box(x-pr*1.5,ty+.049,z,.022,.003,pr*1.5,'#c5c9c0');cylinder(x+pr,ty+.075,z-pr*1.5,pr*.25,.045,'#bbc9bd',12);
  }
  if(count>=4){cylinder(0,ty+.08,0,pr*.4,.08,'#c1a079');for(const x of [-pr*.2,0,pr*.2])box(x,ty+.145,0,pr*.3,.065,pr*.65,green);}
  return faces;
 }
 function render(item){
  const key=JSON.stringify([item.type,item.width,item.depth,item.angle,item.shape,item.capacity,item.color]);if(cache.has(key))return cache.get(key);
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

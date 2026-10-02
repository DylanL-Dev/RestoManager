'use strict';

// Room dimensions and furniture sizes are metres; positions are percentages.
// Retain the storage key so existing layouts migrate without being discarded.
const FloorPlan = (() => {
    const key = 'restomanager_floor_plan_v1';
    const elementTypes = ['bar','wall','door','window','pillar','plant','kitchen','toilets','zone','lamp','chair','buffet','reception','sofa'];
    const positive = n => Number.isFinite(n) && n > 0;
    function roomFor(plan, item) { return plan.rooms.find(r => r.id === item.roomId); }
    const floors=['plain','wood','tile','stone'];
    const itemOptions=t=>({...t,angle:t.angle??0,color:t.color??(t.type==='wall'?'#3b4553':'#8a5a29')});
    const tableOptions=t=>({...itemOptions(t),letter:t.letter??'',capacityMin:t.capacityMin??Math.min(2,t.capacity)});
    function bounds(item) {
        const angle=(item.angle||0)*Math.PI/180,c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
        return {width:item.width*c+item.depth*s,depth:item.width*s+item.depth*c};
    }
    function polygons(plan,item) {
        const room=roomFor(plan,item),box=bounds(item),cx=item.x*room.width/100+box.width/2,cy=item.y*room.depth/100+box.depth/2;
        const angle=(item.angle||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
        return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>({x:cx+x*item.width/2*c-y*item.depth/2*s,y:cy+x*item.width/2*s+y*item.depth/2*c}));
    }
    function sizePercent(plan, item) {
        const room = roomFor(plan,item);
        const box=bounds(item);return { width:box.width / room.width * 100, height:box.depth / room.depth * 100 };
    }
    function inside(plan,item) {
        const room = roomFor(plan,item);
        if (!room || !positive(item.width) || !positive(item.depth) || !Number.isFinite(item.x) || !Number.isFinite(item.y)) return false;
        const box=bounds(item);return item.x >= 0 && item.y >= 0 && item.x * room.width / 100 + box.width <= room.width + 1e-7 && item.y * room.depth / 100 + box.depth <= room.depth + 1e-7;
    }
    function overlaps(plan,a,b) {
        if(a.roomId!==b.roomId)return false;
        const ap=polygons(plan,a),bp=polygons(plan,b);
        for(const poly of [ap,bp])for(let i=0;i<4;i++){
            const edge={x:poly[(i+1)%4].x-poly[i].x,y:poly[(i+1)%4].y-poly[i].y};const axis={x:-edge.y,y:edge.x};
            const pa=ap.map(p=>p.x*axis.x+p.y*axis.y),pb=bp.map(p=>p.x*axis.x+p.y*axis.y);
            if(Math.max(...pa)<=Math.min(...pb)+1e-7||Math.max(...pb)<=Math.min(...pa)+1e-7)return false;
        }
        return true;
    }
    function gap(plan,a,b){
        if(a.roomId!==b.roomId)return Infinity;if(overlaps(plan,a,b))return 0;
        const ap=polygons(plan,a),bp=polygons(plan,b);
        const pointSegment=(p,u,v)=>{const dx=v.x-u.x,dy=v.y-u.y;const t=Math.max(0,Math.min(1,((p.x-u.x)*dx+(p.y-u.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-u.x-t*dx,p.y-u.y-t*dy);};
        let nearest=Infinity;
        for(let i=0;i<4;i++)for(let j=0;j<4;j++){nearest=Math.min(nearest,pointSegment(ap[i],bp[j],bp[(j+1)%4]),pointSegment(bp[j],ap[i],ap[(i+1)%4]));}
        return nearest;
    }
    function nearby(plan,table){return plan.tables.filter(t=>t.id!==table.id&&t.roomId===table.roomId).map(t=>({table:t,gap:gap(plan,table,t)})).filter(p=>p.gap<0.9-1e-7);}
    function defaults() {
        return { version:3, rooms:[{id:'main',name:'Salle principale',width:12,depth:12,floor:'plain'}], elements:[],
            tables:[tableOptions({id:'table-1',number:1,roomId:'main',capacity:2,shape:'square',width:1.2,depth:1.2,x:45,y:45})] };
    }
    function migrate(raw) {
        if(!raw)return raw;
        if(raw.version===1)raw={...raw,version:2,rooms:raw.rooms?.map(r=>({...r,width:12,depth:12})),elements:[],tables:raw.tables?.map(t=>({...t,width:2.04,depth:t.shape==='rectangle'?1.44:2.04,y:t.y+(t.shape==='rectangle'?2.5:0)}))};
        if(raw.version===2)return {...raw,version:3,rooms:raw.rooms.map(r=>({...r,floor:r.floor??'plain'})),tables:raw.tables.map(tableOptions),elements:raw.elements.map(itemOptions)};
        return raw;
    }
    const validOptions=t=>Number.isFinite(t.angle)&&t.angle>=0&&t.angle<360&&typeof t.color==='string'&&/^#[0-9a-f]{6}$/i.test(t.color);
    function valid(plan) {
        return !!(plan && plan.version===3 && Array.isArray(plan.rooms) && plan.rooms.some(r=>r.id==='main') &&
            plan.rooms.every(r=>typeof r.id==='string' && typeof r.name==='string' && r.name.trim() && positive(r.width) && positive(r.depth) && floors.includes(r.floor)) &&
            new Set(plan.rooms.map(r=>r.id)).size===plan.rooms.length && Array.isArray(plan.tables) && Array.isArray(plan.elements) &&
            new Set(plan.tables.map(t=>t.number)).size===plan.tables.length &&
            new Set(plan.tables.concat(plan.elements).map(t=>t.id)).size===plan.tables.length+plan.elements.length &&
            plan.tables.every(t=>typeof t.id==='string' && Number.isInteger(t.number) && t.number>0 && Number.isInteger(t.capacity) && t.capacity>0 && ['square','round','rectangle','bench'].includes(t.shape) && validOptions(t) && ['', 'A', 'B'].includes(t.letter) && Number.isInteger(t.capacityMin) && t.capacityMin>=1 && t.capacityMin<=t.capacity && inside(plan,t)) &&
            plan.elements.every(t=>typeof t.id==='string' && typeof t.label==='string' && elementTypes.includes(t.type) && validOptions(t) && inside(plan,t)));
    }
    // Preserve physical positions when enlarging or changing the room aspect ratio.
    function resizeRoom(plan,id,width,depth) {
        if (!positive(width) || !positive(depth)) throw new Error('Indiquez une largeur et une profondeur supérieures à zéro.');
        const room=plan.rooms.find(r=>r.id===id);
        const items=plan.tables.concat(plan.elements).filter(t=>t.roomId===id);
        const next=items.map(t=>({...t,x:t.x*room.width/width,y:t.y*room.depth/depth}));
        if (next.some(t=>t.x*width/100+bounds(t).width>width+1e-7 || t.y*depth/100+bounds(t).depth>depth+1e-7)) throw new Error('La salle serait trop petite pour les éléments placés. Déplacez-les avant de réduire sa taille.');
        room.width=width;room.depth=depth;items.forEach((t,i)=>{t.x=next[i].x;t.y=next[i].y;});
    }
    // Grow only: translate every item together when extending left/up.
    function growRoom(plan,id,extras=[]) {
        const room=plan.rooms.find(r=>r.id===id);
        if(!room || room.autoSize===false)return null;
        const existing=plan.tables.concat(plan.elements).filter(t=>t.roomId===id);
        const items=existing.filter(t=>!extras.some(e=>e.id===t.id)).concat(extras);
        if(!items.length || items.some(t=>![t.x,t.y,t.width,t.depth].every(Number.isFinite)||t.width<=0||t.depth<=0))return null;
        const oldWidth=room.width,oldDepth=room.depth;
        const left=Math.min(...items.map(t=>t.x*oldWidth/100)),top=Math.min(...items.map(t=>t.y*oldDepth/100));
        const right=Math.max(...items.map(t=>t.x*oldWidth/100+bounds(t).width)),bottom=Math.max(...items.map(t=>t.y*oldDepth/100+bounds(t).depth));
        // Trigger within 50 cm; add at least a metre of working space.
        const x=left<.5?Math.ceil(1-left):0,y=top<.5?Math.ceil(1-top):0;
        const width=Math.max(oldWidth+x,right>oldWidth-.5?Math.ceil(right+1)+x:oldWidth+x);
        const depth=Math.max(oldDepth+y,bottom>oldDepth-.5?Math.ceil(bottom+1)+y:oldDepth+y);
        if(width===oldWidth&&depth===oldDepth)return null;
        const rebase=t=>{t.x=(t.x*oldWidth/100+x)/width*100;t.y=(t.y*oldDepth/100+y)/depth*100;};
        new Set(existing.concat(extras)).forEach(rebase);
        room.width=width;room.depth=depth;
        return {x,y,oldWidth,oldDepth,width,depth};
    }
    function freeSpot(plan,item) {
        const room=roomFor(plan,item);if(bounds(item).width>room.width || bounds(item).depth>room.depth)return null;
        const others=plan.tables.filter(t=>t.roomId===item.roomId && t.id!==item.id);
        // Test rows around existing tables rather than an arbitrary fixed 25-slot grid.
        const xs=[0,...others.map(t=>t.x+bounds(t).width/room.width*100+1)].sort((a,b)=>a-b);
        const ys=[0,...others.map(t=>t.y+bounds(t).depth/room.depth*100+1)].sort((a,b)=>a-b);
        for(const y of ys)for(const x of xs){const candidate={...item,x,y};if(inside(plan,candidate)&&!others.some(t=>overlaps(plan,candidate,t)))return {x,y};}
        return null;
    }
    let plan;
    try { plan=migrate(JSON.parse(localStorage.getItem(key))); } catch (_) {}
    if(!valid(plan))plan=defaults();
    function sync(){ReservationEngine.TABLES.splice(0,ReservationEngine.TABLES.length,...plan.tables.map(t=>t.number));Object.keys(ReservationEngine.CAPACITY).forEach(k=>delete ReservationEngine.CAPACITY[k]);plan.tables.forEach(t=>{ReservationEngine.CAPACITY[t.number]=t.capacity;});}
    sync();
    return {get:()=>structuredClone(plan),defaults,migrate,valid,inside,overlaps,sizePercent,resizeRoom,growRoom,freeSpot,bounds,nearby,gap,tableOptions,itemOptions,label:number=>{const t=plan.tables.find(t=>t.number===number);return 'T'+number+(t?.letter||'');},save(next){
        if(!valid(next))throw new Error('Plan invalide : vérifiez les dimensions et les éléments de la salle.');
        localStorage.setItem(key,JSON.stringify(next));plan=structuredClone(next);sync();
    }};
})();

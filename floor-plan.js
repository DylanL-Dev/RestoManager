'use strict';

// Room dimensions and furniture sizes are metres; positions are percentages.
// Retain the storage key so existing layouts migrate without being discarded.
const FloorPlan = (() => {
    const key = 'restomanager_floor_plan_v1';
    const elementTypes = ['bar','wall','door','window','pillar','plant','kitchen','toilets','zone'];
    const positive = n => Number.isFinite(n) && n > 0;
    function roomFor(plan, item) { return plan.rooms.find(r => r.id === item.roomId); }
    function sizePercent(plan, item) {
        const room = roomFor(plan,item);
        return { width:item.width / room.width * 100, height:item.depth / room.depth * 100 };
    }
    function inside(plan,item) {
        const room = roomFor(plan,item);
        if (!room || !positive(item.width) || !positive(item.depth) || !Number.isFinite(item.x) || !Number.isFinite(item.y)) return false;
        return item.x >= 0 && item.y >= 0 && item.x * room.width / 100 + item.width <= room.width + 1e-7 && item.y * room.depth / 100 + item.depth <= room.depth + 1e-7;
    }
    function overlaps(plan,a,b) {
        if (a.roomId !== b.roomId) return false;
        const as=sizePercent(plan,a),bs=sizePercent(plan,b),epsilon=1e-7;
        return a.x < b.x+bs.width-epsilon && a.x+as.width > b.x+epsilon && a.y < b.y+bs.height-epsilon && a.y+as.height > b.y+epsilon;
    }
    function defaults() {
        return { version:2, rooms:[{id:'main',name:'Salle principale',width:12,depth:12}], elements:[],
            tables:ReservationEngine.TABLES.map((number,i) => ({id:'table-'+number,number,roomId:'main',capacity:ReservationEngine.CAPACITY[number],shape:number===25?'rectangle':'square',width:number===25?2:1.2,depth:1.2,x:3+(i%5)*20,y:3+Math.floor(i/5)*20})) };
    }
    function migrate(raw) {
        if (!raw || raw.version !== 1) return raw;
        return {...raw,version:2,rooms:raw.rooms?.map(r=>({...r,width:12,depth:12})),elements:[],tables:raw.tables?.map(t=>({...t,width:2.04,depth:t.shape==='rectangle'?1.44:2.04,y:t.y+(t.shape==='rectangle'?2.5:0)}))};
    }
    function valid(plan) {
        return !!(plan && plan.version===2 && Array.isArray(plan.rooms) && plan.rooms.some(r=>r.id==='main') &&
            plan.rooms.every(r=>typeof r.id==='string' && typeof r.name==='string' && r.name.trim() && positive(r.width) && positive(r.depth)) &&
            new Set(plan.rooms.map(r=>r.id)).size===plan.rooms.length && Array.isArray(plan.tables) && Array.isArray(plan.elements) &&
            new Set(plan.tables.map(t=>t.number)).size===plan.tables.length &&
            new Set(plan.tables.concat(plan.elements).map(t=>t.id)).size===plan.tables.length+plan.elements.length &&
            plan.tables.every(t=>typeof t.id==='string' && Number.isInteger(t.number) && t.number>0 && Number.isInteger(t.capacity) && t.capacity>0 && ['square','round','rectangle','bench'].includes(t.shape) && inside(plan,t)) &&
            plan.elements.every(t=>typeof t.id==='string' && typeof t.label==='string' && elementTypes.includes(t.type) && inside(plan,t)));
    }
    // Preserve physical positions when enlarging or changing the room aspect ratio.
    function resizeRoom(plan,id,width,depth) {
        if (!positive(width) || !positive(depth)) throw new Error('Indiquez une largeur et une profondeur supérieures à zéro.');
        const room=plan.rooms.find(r=>r.id===id);
        const items=plan.tables.concat(plan.elements).filter(t=>t.roomId===id);
        const next=items.map(t=>({...t,x:t.x*room.width/width,y:t.y*room.depth/depth}));
        if (next.some(t=>t.x*width/100+t.width>width+1e-7 || t.y*depth/100+t.depth>depth+1e-7)) throw new Error('La salle serait trop petite pour les éléments placés. Déplacez-les avant de réduire sa taille.');
        room.width=width;room.depth=depth;items.forEach((t,i)=>{t.x=next[i].x;t.y=next[i].y;});
    }
    function freeSpot(plan,item) {
        const room=roomFor(plan,item);if(item.width>room.width || item.depth>room.depth)return null;
        const others=plan.tables.filter(t=>t.roomId===item.roomId && t.id!==item.id);
        // Test rows around existing tables rather than an arbitrary fixed 25-slot grid.
        const xs=[0,...others.map(t=>t.x+t.width/room.width*100+1)].sort((a,b)=>a-b);
        const ys=[0,...others.map(t=>t.y+t.depth/room.depth*100+1)].sort((a,b)=>a-b);
        for(const y of ys)for(const x of xs){const candidate={...item,x,y};if(inside(plan,candidate)&&!others.some(t=>overlaps(plan,candidate,t)))return {x,y};}
        return null;
    }
    let plan;
    try { plan=migrate(JSON.parse(localStorage.getItem(key))); } catch (_) {}
    if(!valid(plan))plan=defaults();
    function sync(){ReservationEngine.TABLES.splice(0,ReservationEngine.TABLES.length,...plan.tables.map(t=>t.number));Object.keys(ReservationEngine.CAPACITY).forEach(k=>delete ReservationEngine.CAPACITY[k]);plan.tables.forEach(t=>{ReservationEngine.CAPACITY[t.number]=t.capacity;});}
    sync();
    return {get:()=>structuredClone(plan),defaults,migrate,valid,inside,overlaps,sizePercent,resizeRoom,freeSpot,save(next){
        if(!valid(next))throw new Error('Plan invalide : vérifiez les dimensions et les éléments de la salle.');
        localStorage.setItem(key,JSON.stringify(next));plan=structuredClone(next);sync();
    }};
})();

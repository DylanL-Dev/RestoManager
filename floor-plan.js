'use strict';

// v4 stores centres, dimensions and distances in metres. Keep the historical
// storage key and back up legacy data before its first save in the new format.
const FloorPlan = (() => {
    const key='restomanager_floor_plan_v1', backupKey=key+'_backup_before_v4', epsilon=1e-7;
    const elementTypes=['bar','wall','door','window','pillar','plant','kitchen','toilets','zone','chair','armchair','bench','partition','lamp','counter'];
    const floors=['plain','wood','tile','stone'];
    const passableTypes=new Set(['zone','door','window','lamp']);
    const positive=n=>Number.isFinite(n)&&n>0;
    const named=value=>typeof value==='string'&&value.trim().length>0;
    const roomFor=(plan,item)=>plan.rooms.find(r=>r.id===item.roomId);
    const allItems=plan=>plan.tables.concat(plan.elements);
    const isSolid=item=>item.number!==undefined||!passableTypes.has(item.type);
    const itemOptions=t=>t&&typeof t==='object'?({...t,angle:t.angle??0,color:t.color??(t.type==='wall'?'#3b4553':'#8a5a29')}):t;
    const tableOptions=t=>t&&typeof t==='object'?({...itemOptions(t),letter:t.letter??'',capacityMin:t.capacityMin??Math.min(2,t.capacity)}):t;
    function bounds(item) {
        const angle=(item.angle??0)*Math.PI/180,c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
        return {width:item.width*c+item.depth*s,depth:item.width*s+item.depth*c};
    }
    function geometryValid(item) {
        return !!item&&positive(item.width)&&positive(item.depth)&&Number.isFinite(item.x)&&Number.isFinite(item.y)&&Number.isFinite(item.angle??0);
    }
    function polygons(plan,item) {
        const angle=(item.angle??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
        return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>({x:item.x+x*item.width/2*c-y*item.depth/2*s,y:item.y+x*item.width/2*s+y*item.depth/2*c}));
    }
    function sizePercent(plan,item) {
        const room=roomFor(plan,item),box=bounds(item);
        return {left:(item.x-box.width/2)/room.width*100,top:(item.y-box.depth/2)/room.depth*100,width:box.width/room.width*100,height:box.depth/room.depth*100};
    }
    function inside(plan,item) {
        const room=item&&roomFor(plan,item);
        if(!room||!positive(room.width)||!positive(room.depth)||!geometryValid(item))return false;
        const box=bounds(item);
        return item.x-box.width/2>=-epsilon&&item.y-box.depth/2>=-epsilon&&item.x+box.width/2<=room.width+epsilon&&item.y+box.depth/2<=room.depth+epsilon;
    }
    // Pure helper: failed placement leaves the caller's draft untouched.
    function clampItem(plan,item) {
        const room=item&&roomFor(plan,item);
        if(!room||!positive(room.width)||!positive(room.depth)||!geometryValid(item))return null;
        const box=bounds(item);
        if(box.width>room.width+epsilon||box.depth>room.depth+epsilon)return null;
        return {...item,x:Math.max(box.width/2,Math.min(room.width-box.width/2,item.x)),y:Math.max(box.depth/2,Math.min(room.depth-box.depth/2,item.y))};
    }
    function overlaps(plan,a,b) {
        if(a.roomId!==b.roomId||!geometryValid(a)||!geometryValid(b))return false;
        const ab=bounds(a),bb=bounds(b);
        if(Math.abs(a.x-b.x)>=(ab.width+bb.width)/2-epsilon||Math.abs(a.y-b.y)>=(ab.depth+bb.depth)/2-epsilon)return false;
        const ap=polygons(plan,a),bp=polygons(plan,b);
        for(const poly of [ap,bp])for(let i=0;i<4;i++){
            const edge={x:poly[(i+1)%4].x-poly[i].x,y:poly[(i+1)%4].y-poly[i].y},length=Math.hypot(edge.x,edge.y),axis={x:-edge.y/length,y:edge.x/length};
            const pa=ap.map(p=>p.x*axis.x+p.y*axis.y),pb=bp.map(p=>p.x*axis.x+p.y*axis.y);
            if(Math.max(...pa)<=Math.min(...pb)+epsilon||Math.max(...pb)<=Math.min(...pa)+epsilon)return false;
        }
        return true;
    }
    // Zones, openings and lights may intentionally intersect other objects.
    function conflicts(plan,item,ignoreIds=[]) {
        if(!isSolid(item))return [];
        const excluded=new Set(ignoreIds);
        return allItems(plan).filter(other=>other.id!==item.id&&!excluded.has(other.id)&&isSolid(other)&&overlaps(plan,item,other));
    }
    function gap(plan,a,b) {
        if(a.roomId!==b.roomId||!geometryValid(a)||!geometryValid(b))return Infinity;
        if(overlaps(plan,a,b))return 0;
        const ap=polygons(plan,a),bp=polygons(plan,b);
        const pointSegment=(p,u,v)=>{const dx=v.x-u.x,dy=v.y-u.y,t=Math.max(0,Math.min(1,((p.x-u.x)*dx+(p.y-u.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-u.x-t*dx,p.y-u.y-t*dy);};
        let nearest=Infinity;
        for(let i=0;i<4;i++)for(let j=0;j<4;j++)nearest=Math.min(nearest,pointSegment(ap[i],bp[j],bp[(j+1)%4]),pointSegment(bp[j],ap[i],ap[(i+1)%4]));
        return nearest;
    }
    // AABB distance is a lower bound on distance between oriented footprints.
    // Distant pairs therefore need neither polygons nor segment distances.
    function mayBeNear(a,b,ab,bb,distance) {
        const dx=Math.max(0,Math.abs(a.x-b.x)-(ab.width+bb.width)/2);
        if(dx>=distance)return false;
        const dy=Math.max(0,Math.abs(a.y-b.y)-(ab.depth+bb.depth)/2);
        return dy<distance&&dx*dx+dy*dy<distance*distance;
    }
    function nearby(plan,table) {
        const box=bounds(table),result=[];
        for(const other of plan.tables){
            if(other.id===table.id||other.roomId!==table.roomId||!mayBeNear(table,other,box,bounds(other),0.9))continue;
            const distance=gap(plan,table,other);if(distance<0.9-epsilon)result.push({table:other,gap:distance});
        }
        return result;
    }
    function spacingPairs(plan,roomId,distance=0.9) {
        if(!Number.isFinite(distance)||distance<0)throw new Error('Indiquez une distance positive ou nulle en mètres.');
        if(!distance)return [];
        const items=plan.tables.filter(item=>item.roomId===roomId),boxes=items.map(bounds),pairs=[];
        for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
            if(!mayBeNear(items[i],items[j],boxes[i],boxes[j],distance))continue;
            const measured=gap(plan,items[i],items[j]);if(measured<distance-epsilon)pairs.push({a:items[i],b:items[j],gap:measured});
        }
        return pairs;
    }
    function migrate(raw) {
        if(!raw||typeof raw!=='object')return raw;
        let next=structuredClone(raw);
        if(next.version===1)next={...next,version:2,
            rooms:Array.isArray(next.rooms)?next.rooms.map(r=>r&&({...r,width:12,depth:12})):next.rooms,
            elements:next.elements??[],
            // Match v1's 17% furniture and rectangles' 12% depth + 2.5% margin.
            tables:Array.isArray(next.tables)?next.tables.map(t=>t&&({...t,width:2.04,depth:t.shape==='rectangle'?1.44:2.04,y:t.y+(t.shape==='rectangle'?2.5:0)})):next.tables};
        if(next.version===2)next={...next,version:3,
            rooms:Array.isArray(next.rooms)?next.rooms.map(r=>r&&({...r,floor:r.floor??'plain'})):next.rooms,
            tables:Array.isArray(next.tables)?next.tables.map(tableOptions):next.tables,
            elements:Array.isArray(next.elements)?next.elements.map(itemOptions):next.elements};
        if(next.version===3){
            const centre=item=>{
                if(!item||!Array.isArray(next.rooms))return item;
                const room=next.rooms.find(r=>r&&r.id===item.roomId);
                if(!room||!positive(room.width)||!positive(room.depth)||!geometryValid(item))return item;
                const box=bounds(item);
                return {...item,x:item.x*room.width/100+box.width/2,y:item.y*room.depth/100+box.depth/2};
            };
            next={...next,version:4,tables:Array.isArray(next.tables)?next.tables.map(centre):next.tables,elements:Array.isArray(next.elements)?next.elements.map(centre):next.elements};
        }
        return next;
    }
    function defaults() {
        return migrate({version:3,rooms:[{id:'main',name:'Salle principale',width:12,depth:12,floor:'plain'}],elements:[],
            tables:ReservationEngine.TABLES.map((number,i)=>tableOptions({id:'table-'+number,number,roomId:'main',capacity:ReservationEngine.CAPACITY[number],shape:number===25?'rectangle':'square',width:number===25?2:1.2,depth:1.2,x:3+(i%5)*20,y:3+Math.floor(i/5)*20}))});
    }
    const validOptions=t=>Number.isFinite(t.angle)&&t.angle>=0&&t.angle<360&&typeof t.color==='string'&&/^#[0-9a-f]{6}$/i.test(t.color);
    function valid(plan) {
        if(!plan||plan.version!==4||!Array.isArray(plan.rooms)||!Array.isArray(plan.tables)||!Array.isArray(plan.elements))return false;
        if(!plan.rooms.some(r=>r&&r.id==='main')||!plan.rooms.every(r=>r&&named(r.id)&&named(r.name)&&positive(r.width)&&positive(r.depth)&&floors.includes(r.floor)))return false;
        if(new Set(plan.rooms.map(r=>r.id)).size!==plan.rooms.length)return false;
        if(!plan.tables.every(t=>t&&named(t.id)&&Number.isInteger(t.number)&&t.number>0&&Number.isInteger(t.capacity)&&t.capacity>0&&['square','round','rectangle','bench'].includes(t.shape)&&validOptions(t)&&['','A','B'].includes(t.letter)&&Number.isInteger(t.capacityMin)&&t.capacityMin>=1&&t.capacityMin<=t.capacity&&inside(plan,t)))return false;
        if(!plan.elements.every(t=>t&&named(t.id)&&typeof t.label==='string'&&elementTypes.includes(t.type)&&validOptions(t)&&inside(plan,t)))return false;
        return new Set(plan.tables.map(t=>t.number)).size===plan.tables.length&&new Set(allItems(plan).map(t=>t.id)).size===plan.tables.length+plan.elements.length;
    }
    // Room dimensions change without changing any object's physical centre.
    function resizeRoom(plan,id,width,depth) {
        if(!positive(width)||!positive(depth))throw new Error('Indiquez une largeur et une profondeur supérieures à zéro.');
        const room=plan.rooms.find(r=>r.id===id);
        if(!room)throw new Error('Salle introuvable.');
        const candidate={...plan,rooms:plan.rooms.map(r=>r.id===id?{...r,width,depth}:r)};
        if(allItems(plan).filter(t=>t.roomId===id).some(t=>!inside(candidate,t)))throw new Error('La salle serait trop petite pour les éléments placés. Déplacez-les avant de réduire sa taille.');
        room.width=width;room.depth=depth;
    }
    function fitRoom(plan,id,margin=0.5) {
        if(!Number.isFinite(margin)||margin<0)throw new Error('Indiquez une marge positive ou nulle en mètres.');
        if(!plan.rooms.some(r=>r.id===id))throw new Error('Salle introuvable.');
        let width=Math.max(1,margin*2),depth=Math.max(1,margin*2);
        for(const item of allItems(plan).filter(t=>t.roomId===id)){
            if(!geometryValid(item))throw new Error('Un élément possède des dimensions ou une position invalides.');
            const box=bounds(item);
            if(item.x-box.width/2 < -epsilon||item.y-box.depth/2 < -epsilon)throw new Error('Un élément dépasse l’origine de la salle. Déplacez-le avant l’ajustement.');
            width=Math.max(width,item.x+box.width/2+margin);depth=Math.max(depth,item.y+box.depth/2+margin);
        }
        resizeRoom(plan,id,width,depth);return {width,depth};
    }
    function freeSpot(plan,item) {
        const room=roomFor(plan,item),box=bounds(item);
        if(!room||!positive(room.width)||!positive(room.depth)||!positive(item.width)||!positive(item.depth)||!Number.isFinite(box.width)||!Number.isFinite(box.depth)||box.width>room.width+epsilon||box.depth>room.depth+epsilon)return null;
        const others=isSolid(item)?allItems(plan).filter(t=>t.roomId===item.roomId&&t.id!==item.id&&isSolid(t)):[];
        const spacing=0.12,xs=[box.width/2,room.width-box.width/2],ys=[box.depth/2,room.depth-box.depth/2];
        for(const other of others){const b=bounds(other);xs.push(other.x+b.width/2+spacing+box.width/2,other.x-b.width/2-spacing-box.width/2);ys.push(other.y+b.depth/2+spacing+box.depth/2,other.y-b.depth/2-spacing-box.depth/2);}
        const sorted=values=>[...new Set(values)].sort((a,b)=>a-b);
        const rows=sorted(ys),columns=sorted(xs);
        for(const y of rows)for(const x of columns){
            const candidate={...item,x,y};
            if(inside(plan,candidate)&&!others.some(t=>{
                const b=bounds(t),dx=Math.max(0,Math.abs(x-t.x)-(box.width+b.width)/2),dy=Math.max(0,Math.abs(y-t.y)-(box.depth+b.depth)/2);
                return Math.hypot(dx,dy)<spacing-epsilon&&gap(plan,candidate,t)<spacing-epsilon;
            }))return {x,y};
        }
        return null;
    }
    let plan,loadError=null,legacyRaw=null,migrationPending=false;
    try{
        const raw=localStorage.getItem(key);
        if(raw===null)plan=defaults();
        else{
            const parsed=JSON.parse(raw);plan=migrate(parsed);
            if(!valid(plan))throw new Error('Le plan enregistré est invalide ou utilise une version non prise en charge.');
            migrationPending=parsed.version!==4;if(migrationPending)legacyRaw=raw;
        }
    }catch(error){loadError='Le plan enregistré ne peut pas être chargé. Les données sont conservées et l’enregistrement est bloqué. '+error.message;plan=defaults();}
    function sync(){ReservationEngine.TABLES.splice(0,ReservationEngine.TABLES.length,...plan.tables.map(t=>t.number));Object.keys(ReservationEngine.CAPACITY).forEach(k=>delete ReservationEngine.CAPACITY[k]);plan.tables.forEach(t=>{ReservationEngine.CAPACITY[t.number]=t.capacity;});}
    // Never change reservation table references after a failed load.
    if(!loadError)sync();
    return {get:()=>structuredClone(plan),getLoadError:()=>loadError,defaults,migrate,valid,inside,overlaps,sizePercent,resizeRoom,fitRoom,freeSpot,bounds,polygons,clampItem,conflicts,nearby,spacingPairs,gap,tableOptions,itemOptions,
        label:number=>{const t=plan.tables.find(t=>t.number===number);return 'T'+number+(t?.letter||'');},
        save(next){
            if(loadError)throw new Error(loadError);
            if(!valid(next))throw new Error('Plan invalide : vérifiez les dimensions et les éléments de la salle.');
            const snapshot=structuredClone(next),serialized=JSON.stringify(snapshot);
            if(migrationPending&&localStorage.getItem(backupKey)===null)localStorage.setItem(backupKey,legacyRaw);
            localStorage.setItem(key,serialized);plan=snapshot;migrationPending=false;legacyRaw=null;sync();
        }};
})();

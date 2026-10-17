'use strict';

// The editor owns only the draft. Service actions and persistence stay in service-ui.
const FloorEditor = (() => {
    const $=id=>document.getElementById(id);
    let selected=new Set(), bindings=new Map(), gesture=null, frame=null, latest=null;
    let snapshots=[],position=-1,session=false,restoring=false,lastRoom='',snap=true,multi=false,initialized=false,ignoreUntil=0;
    const touches=new Set(),historyLimit=61;
    const all=()=>floorDraft ? floorDraft.tables.concat(floorDraft.elements) : [];
    const room=()=>currentPlan().rooms.find(r=>r.id===floorRoom);
    const selectedItems=()=>all().filter(item=>item.roomId===floorRoom&&selected.has(item.id));
    const say=message=>{if($('editorStatus'))$('editorStatus').textContent=message;};
    const normalize=angle=>((angle%360)+360)%360;
    const raf=fn=>window.requestAnimationFrame ? window.requestAnimationFrame(fn) : setTimeout(fn,16);
    const caf=id=>window.cancelAnimationFrame ? window.cancelAnimationFrame(id) : clearTimeout(id);
    function point(event) {
        const rect=$('tablesGrid').getBoundingClientRect(),r=room();
        return {x:(event.clientX-rect.left)/rect.width*r.width,y:(event.clientY-rect.top)/rect.height*r.depth};
    }
    function visibleCenter() {
        const grid=$('tablesGrid').getBoundingClientRect(),view=$('floorViewport').getBoundingClientRect(),r=room();
        const left=Math.max(grid.left,view.left),top=Math.max(grid.top,view.top);
        const right=Math.min(grid.right??grid.left+grid.width,view.right??view.left+view.width);
        const bottom=Math.min(grid.bottom??grid.top+grid.height,view.bottom??view.top+view.height);
        if(!grid.width||!grid.height||right<=left||bottom<=top)return {x:r.width/2,y:r.depth/2};
        return {x:((left+right)/2-grid.left)/grid.width*r.width,y:((top+bottom)/2-grid.top)/grid.height*r.depth};
    }
    function extent(items) {
        let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
        for(const item of items){const b=FloorPlan.bounds(item);left=Math.min(left,item.x-b.width/2);right=Math.max(right,item.x+b.width/2);top=Math.min(top,item.y-b.depth/2);bottom=Math.max(bottom,item.y+b.depth/2);}
        return {left,top,right,bottom,x:(left+right)/2,y:(top+bottom)/2,width:right-left,depth:bottom-top};
    }
    function removeNodes(selector){for(const node of $('tablesGrid').querySelectorAll(selector))node.remove();}
    function controls() {
        const count=selectedItems().length;
        for(const id of ['rotate45Btn','rotate90Btn','duplicateFloorBtn','deleteFloorBtn'])if($(id))$(id).disabled=!floorDraft||!count;
        if($('propertiesFloorBtn'))$('propertiesFloorBtn').disabled=!floorDraft||count!==1;
        if($('undoFloorBtn'))$('undoFloorBtn').disabled=!floorDraft||position<=0;
        if($('redoFloorBtn'))$('redoFloorBtn').disabled=!floorDraft||position>=snapshots.length-1;
        if($('snapFloorBtn'))$('snapFloorBtn').setAttribute('aria-pressed',String(snap));
        if($('multiSelectBtn'))$('multiSelectBtn').setAttribute('aria-pressed',String(multi));
    }
    function overlay() {
        const items=selectedItems();if(!floorDraft||!items.length){removeNodes('#selectionOverlay');return;}
        const single=items.length===1,r=room(),box=single?items[0]:extent(items);
        let node=$('selectionOverlay');const fresh=!node;
        if(fresh){node=document.createElement('div');node.id='selectionOverlay';node.className='selection-overlay';}
        node.style.left=box.x/r.width*100+'%';node.style.top=box.y/r.depth*100+'%';
        node.style.width=(single?box.width:box.width)/r.width*100+'%';node.style.height=(single?box.depth:box.depth)/r.depth*100+'%';
        node.style.transform='translate(-50%,-50%) rotate('+(single?box.angle:0)+'deg)';
        node.style.setProperty('--handle-scale',String(1/FloorZoom.getScale()));
        if(!fresh)return;
        for(const corner of ['nw','ne','se','sw']){
            const handle=document.createElement('button');handle.type='button';handle.className='editor-handle resize-handle resize-'+corner;
            handle.dataset.transform='resize';handle.dataset.corner=corner;handle.setAttribute('aria-label','Redimensionner '+corner);
            handle.addEventListener('pointerdown',event=>beginTransform(event,'resize',corner,handle));node.append(handle);
        }
        const rotate=document.createElement('button');rotate.type='button';rotate.className='editor-handle rotate-handle';rotate.dataset.transform='rotate';rotate.textContent='↻';rotate.setAttribute('aria-label','Rotation libre');
        rotate.addEventListener('pointerdown',event=>beginTransform(event,'rotate',null,rotate));node.append(rotate);$('tablesGrid').append(node);
    }
    function paint(changed=selectedItems()) {
        for(const item of changed){
            const binding=bindings.get(item.id);if(!binding)continue;
            placeFloorItem(binding.button,item);
            const art=binding.button.querySelector('.furniture-art'),b=FloorPlan.bounds(item);
            if(art){art.style.width=item.width/b.width*100+'%';art.style.height=item.depth/b.depth*100+'%';art.style.transform='translate(-50%,-50%) rotate('+item.angle+'deg)';}
        }
        const collisionIds=new Set();
        if(floorDraft)for(const item of all())for(const other of FloorPlan.conflicts(floorDraft,item)){collisionIds.add(item.id);collisionIds.add(other.id);}
        for(const [id,binding] of bindings){binding.button.classList.toggle('floor-selected',!!floorDraft&&selected.has(id));binding.button.classList.toggle('floor-collision',!!floorDraft&&collisionIds.has(id));if(floorDraft)binding.button.setAttribute('aria-pressed',String(selected.has(id)));}
        overlay();controls();
        if(typeof Floor3D!=='undefined')Floor3D.sync(currentPlan(),floorRoom);
        if(collisionIds.size)say(collisionIds.size+' objets se chevauchent. Écartez-les avant d’enregistrer.');
        else if(selectedItems().length)say(selectedItems().length+' objet'+(selectedItems().length>1?'s sélectionnés':' sélectionné')+'. Glissez, tournez ou utilisez les poignées.');
        else if(floorDraft)say('Sélectionnez un objet, ou tracez un rectangle sur ordinateur.');
    }
    function record() {
        const snapshot=JSON.stringify(floorDraft);
        if(snapshot===snapshots[position])return;
        snapshots.splice(position+1);snapshots.push(snapshot);
        if(snapshots.length>historyLimit)snapshots.shift();position=snapshots.length-1;
    }
    function onRender() {
        if(!floorDraft){
            if(gesture)cancelGesture(false);
            selected.clear();bindings.clear();snapshots=[];position=-1;session=false;lastRoom='';touches.clear();multi=false;removeNodes('#selectionOverlay,.snap-guide,#selectionMarquee');controls();return;
        }
        const ids=new Set(all().map(item=>item.id));
        for(const [id,binding] of bindings)if(!ids.has(id)||binding.button.parentNode!==$('tablesGrid'))bindings.delete(id);
        if(lastRoom!==floorRoom){selected.clear();lastRoom=floorRoom;}
        for(const id of selected)if(!ids.has(id))selected.delete(id);
        if(!session){snapshots=[JSON.stringify(floorDraft)];position=0;session=true;}
        else if(!gesture&&!restoring){
            const previous=JSON.parse(snapshots[position]),oldIds=new Set(previous.tables.concat(previous.elements).map(item=>item.id));
            const added=all().filter(item=>item.roomId===floorRoom&&!oldIds.has(item.id));
            if(added.length)selected=new Set(added.map(item=>item.id));
            record();
        }
        paint();
    }
    function render(){afficherTables();}
    function changeSelection(id,toggle=false) {
        if(toggle){selected.has(id)?selected.delete(id):selected.add(id);}
        else if(!selected.has(id))selected=new Set([id]);
        paint([]);
    }
    function clearSelection(){cancelGesture();selected.clear();paint([]);}
    function selectAll(){if(!floorDraft)return;selected=new Set(all().filter(item=>item.roomId===floorRoom).map(item=>item.id));paint([]);}
    function setSnap(value){snap=!!value;removeNodes('.snap-guide');controls();say('Magnétisme '+(snap?'activé.':'désactivé.'));}
    function setMulti(value){multi=!!value;controls();say('Sélection multiple tactile '+(multi?'activée. Touchez les objets à ajouter.':'désactivée.'));}
    function targets(items) {
        const r=room(),ids=new Set(items.map(item=>item.id)),x=[0,r.width/2,r.width],y=[0,r.depth/2,r.depth];
        for(const item of all().filter(item=>item.roomId===floorRoom&&!ids.has(item.id))){const b=FloorPlan.bounds(item);x.push(item.x-b.width/2,item.x,item.x+b.width/2);y.push(item.y-b.depth/2,item.y,item.y+b.depth/2);}
        return {x,y};
    }
    function guides(lines) {
        removeNodes('.snap-guide');const r=room();
        for(const [axis,value] of Object.entries(lines))if(value!==null){const node=document.createElement('div');node.className='snap-guide snap-guide-'+axis;node.style[axis==='x'?'left':'top']=value/(axis==='x'?r.width:r.depth)*100+'%';$('tablesGrid').append(node);}
    }
    function snapMove(dx,dy,g) {
        if(!snap){guides({});return {dx,dy};}
        const rect=$('tablesGrid').getBoundingClientRect(),threshold=8*room().width/rect.width,box=g.box,lines={x:null,y:null};
        function adjust(value,axes,candidates,axis){
            const centre=axis==='x'?box.x:box.y,grid=Math.round((centre+value)*10)/10;
            // Furniture and room guides take precedence over the fine grid.
            // Otherwise a grid step within 5 cm masks almost every alignment.
            let correction=0,best=Infinity,target=null;
            for(const edge of axes)for(const candidate of candidates){const diff=candidate-edge-value;if(Math.abs(diff)<=threshold&&Math.abs(diff)<best){best=Math.abs(diff);correction=diff;target=candidate;}}
            if(target===null&&Math.abs(grid-centre-value)<=threshold){correction=grid-centre-value;best=Math.abs(correction);target=grid;}
            lines[axis]=target;return value+(best<Infinity?correction:0);
        }
        dx=adjust(dx,[box.left,box.x,box.right],g.targets.x,'x');dy=adjust(dy,[box.top,box.y,box.bottom],g.targets.y,'y');guides(lines);return {dx,dy};
    }
    function apply(items) {
        if(items.some(item=>!FloorPlan.inside(floorDraft,item))){say('La transformation dépasserait les limites de la salle.');return false;}
        const byId=new Map(all().map(item=>[item.id,item]));for(const item of items)Object.assign(byId.get(item.id),item);
        paint(items);return true;
    }
    function capture(target,id){try{target.setPointerCapture(id);}catch(_){} }
    function release(g){try{if(g.target.hasPointerCapture?.(g.pointerId))g.target.releasePointerCapture(g.pointerId);}catch(_){} }
    function beginTransform(event,kind,corner,target) {
        if(!floorDraft||event.button!==0||touches.size>1||event.isPrimary===false)return;
        event.preventDefault();event.stopPropagation();
        const originals=selectedItems().map(item=>structuredClone(item));if(!originals.length)return;
        const box=extent(originals),start=point(event);
        gesture={kind,corner,target,pointerId:event.pointerId,start,client:{x:event.clientX,y:event.clientY},originals,box,pivot:{x:box.x,y:box.y},moved:false,targets:targets(originals)};
        if(originals.length===1)gesture.pivot={x:originals[0].x,y:originals[0].y};
        gesture.startAngle=Math.atan2(start.y-gesture.pivot.y,start.x-gesture.pivot.x);capture(target,event.pointerId);
    }
    function bind(button,item,onClick) {
        button.dataset.floorId=item.id;bindings.set(item.id,{button,onClick});let pointerHandled=false;
        button.addEventListener('pointerdown',event=>{
            if(!floorDraft||event.button!==0||event.altKey)return;
            if(touches.size>1||event.isPrimary===false){cancelGesture();return;}
            event.stopPropagation();event.preventDefault();button.focus({preventScroll:true});pointerHandled=true;
            const selectionBefore=new Set(selected),toggle=event.shiftKey||event.ctrlKey||event.metaKey||multi;
            // A selected member must remain available for a group drag while
            // multiple selection is enabled. Toggle it off only after a tap.
            const deferToggle=toggle&&selected.has(item.id);
            if(!deferToggle)changeSelection(item.id,toggle);
            if(selected.has(item.id)){
                beginTransform(event,'move',null,button);
                if(gesture){gesture.selectionBefore=selectionBefore;gesture.toggleOnClick=deferToggle?item.id:null;}
            }
        });
        button.addEventListener('click',event=>{
            if((event.detail!==0&&Date.now()<ignoreUntil)||FloorZoom.ignoreClick()){pointerHandled=false;return;}
            if(!floorDraft){onClick();return;}
            if(!pointerHandled||event.detail===0)changeSelection(item.id,event.shiftKey||event.ctrlKey||event.metaKey||multi);pointerHandled=false;
        });
        button.addEventListener('dblclick',event=>{
            if(!floorDraft||FloorZoom.ignoreClick())return;event.preventDefault();cancelGesture();selected=new Set([item.id]);paint([]);onClick();
        });
    }
    function updateGesture(event) {
        const g=gesture;if(!g||event.pointerId!==g.pointerId)return;
        if(FloorZoom.isPinching()||touches.size>1){cancelGesture();return;}
        const clientDistance=Math.hypot(event.clientX-g.client.x,event.clientY-g.client.y);
        if(!g.moved&&clientDistance<4)return;g.moved=true;
        const p=point(event),dx=p.x-g.start.x,dy=p.y-g.start.y;
        if(g.kind==='marquee'){
            const left=Math.min(g.start.x,p.x),top=Math.min(g.start.y,p.y),width=Math.abs(dx),depth=Math.abs(dy),r=room();
            let node=$('selectionMarquee');if(!node){node=document.createElement('div');node.id='selectionMarquee';node.className='selection-marquee';$('tablesGrid').append(node);}
            node.style.left=left/r.width*100+'%';node.style.top=top/r.depth*100+'%';node.style.width=width/r.width*100+'%';node.style.height=depth/r.depth*100+'%';
            const rectangle={roomId:floorRoom,x:left+width/2,y:top+depth/2,width,depth,angle:0};selected=new Set(g.selection);
            for(const item of all().filter(item=>item.roomId===floorRoom))if(FloorPlan.overlaps(floorDraft,item,rectangle)){if(g.toggle&&g.selection.has(item.id))selected.delete(item.id);else selected.add(item.id);}
            paint([]);return;
        }
        let next;
        if(g.kind==='move'){
            const aligned=snapMove(dx,dy,g),r=room(),mx=Math.max(-g.box.left,Math.min(r.width-g.box.right,aligned.dx)),my=Math.max(-g.box.top,Math.min(r.depth-g.box.bottom,aligned.dy));
            next=g.originals.map(item=>({...item,x:item.x+mx,y:item.y+my}));
        }else if(g.kind==='rotate'){
            let delta=(Math.atan2(p.y-g.pivot.y,p.x-g.pivot.x)-g.startAngle)*180/Math.PI;
            if(event.shiftKey)delta=Math.round(delta/15)*15;next=rotated(g.originals,delta,g.pivot);
        }else if(g.originals.length===1){
            const item=g.originals[0],angle=item.angle*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),sx=g.corner.includes('e')?1:-1,sy=g.corner.includes('s')?1:-1;
            const lx=dx*c+dy*s,ly=-dx*s+dy*c;
            let width=Math.max(0.1,item.width+sx*lx),depth=Math.max(0.1,item.depth+sy*ly);
            if(event.shiftKey){const factor=Math.max(0.1/item.width,0.1/item.depth,1+(sx*lx*item.width+sy*ly*item.depth)/(item.width**2+item.depth**2));width=item.width*factor;depth=item.depth*factor;}
            const ox=sx*(width-item.width)/2,oy=sy*(depth-item.depth)/2;
            next=[{...item,width,depth,x:item.x+ox*c-oy*s,y:item.y+ox*s+oy*c}];
        }else{
            const vx=(g.corner.includes('e')?1:-1)*g.box.width/2,vy=(g.corner.includes('s')?1:-1)*g.box.depth/2;
            const minimum=Math.max(...g.originals.map(item=>Math.max(0.1/item.width,0.1/item.depth)));
            const factor=Math.max(minimum,((p.x-g.pivot.x)*vx+(p.y-g.pivot.y)*vy)/(vx*vx+vy*vy));
            next=g.originals.map(item=>({...item,x:g.pivot.x+(item.x-g.pivot.x)*factor,y:g.pivot.y+(item.y-g.pivot.y)*factor,width:item.width*factor,depth:item.depth*factor}));
        }
        apply(next);
    }
    function cancelGesture(redraw=true) {
        if(frame!==null){caf(frame);frame=null;}latest=null;
        if(!gesture)return;
        const g=gesture;gesture=null;release(g);
        if(floorDraft){const byId=new Map(all().map(item=>[item.id,item]));for(const item of g.originals||[])if(byId.has(item.id))Object.assign(byId.get(item.id),item);}
        if(g.kind==='marquee')selected=new Set(g.selection);
        else if(g.selectionBefore)selected=new Set(g.selectionBefore);
        ignoreUntil=Date.now()+450;removeNodes('.snap-guide,#selectionMarquee');if(redraw&&floorDraft)paint();
    }
    function end(event) {
        if(!gesture||event.pointerId!==gesture.pointerId)return;
        if(frame!==null){caf(frame);frame=null;}if(latest){updateGesture(latest);latest=null;}if(!gesture)return;
        const g=gesture;gesture=null;release(g);removeNodes('.snap-guide,#selectionMarquee');
        if(g.moved)ignoreUntil=Date.now()+300;
        else if(g.toggleOnClick)selected.delete(g.toggleOnClick);
        if(g.kind!=='marquee'&&g.moved)render();else paint([]);
    }
    function rotated(items,delta,pivot) {
        const radians=delta*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
        return items.map(item=>({...item,x:pivot.x+(item.x-pivot.x)*c-(item.y-pivot.y)*s,y:pivot.y+(item.x-pivot.x)*s+(item.y-pivot.y)*c,angle:normalize(item.angle+delta)}));
    }
    function rotate(delta) {
        cancelGesture();const items=selectedItems();if(!items.length)return;
        const box=extent(items);if(apply(rotated(items,delta,{x:box.x,y:box.y})))render();
    }
    function restore(index) {
        cancelGesture();if(index<0||index>=snapshots.length)return;
        position=index;floorDraft=JSON.parse(snapshots[position]);restoring=true;
        try{roomOptions();render();}finally{restoring=false;}
    }
    function undo(){if(floorDraft)restore(position-1);}
    function redo(){if(floorDraft)restore(position+1);}
    function duplicate() {
        cancelGesture();const items=selectedItems();if(!items.length)return;
        let number=Math.max(0,...floorDraft.tables.map(item=>item.number));
        const copies=items.map(item=>({...structuredClone(item),id:crypto.randomUUID(),...(item.number!==undefined?{number:++number}:{})})),box=extent(items);
        const valid=(dx,dy)=>copies.every(item=>{const moved={...item,x:item.x+dx,y:item.y+dy};return FloorPlan.inside(floorDraft,moved)&&!FloorPlan.conflicts(floorDraft,moved).length;});
        let offset=[{x:0.3,y:0.3},{x:box.width+0.12,y:0},{x:0,y:box.depth+0.12},{x:-box.width-0.12,y:0},{x:0,y:-box.depth-0.12}].find(p=>valid(p.x,p.y));
        if(!offset){const spot=FloorPlan.freeSpot(floorDraft,{id:'duplicate-group',roomId:floorRoom,type:'partition',width:box.width,depth:box.depth,x:box.x,y:box.y,angle:0});if(spot&&valid(spot.x-box.x,spot.y-box.y))offset={x:spot.x-box.x,y:spot.y-box.y};}
        if(!offset){say('Pas de place libre pour dupliquer ce groupe. Agrandissez la salle.');return;}
        for(const item of copies){item.x+=offset.x;item.y+=offset.y;(item.number!==undefined?floorDraft.tables:floorDraft.elements).push(item);}
        selected=new Set(copies.map(item=>item.id));render();
    }
    function remove() {
        cancelGesture();const items=selectedItems();if(!items.length)return;
        if(items.some(item=>item.number!==undefined&&referencedTable(item.number))){say('Suppression refusée : une table sélectionnée est liée à une réservation ou à l’historique.');return;}
        if(!confirm('Supprimer '+items.length+' objet'+(items.length>1?'s':'')+' du brouillon ?'))return;
        const ids=new Set(items.map(item=>item.id));floorDraft.tables=floorDraft.tables.filter(item=>!ids.has(item.id));floorDraft.elements=floorDraft.elements.filter(item=>!ids.has(item.id));selected.clear();render();
    }
    function properties(){const items=selectedItems();if(items.length===1)bindings.get(items[0].id)?.onClick();}
    function keyboard(event) {
        if(!floorDraft||event.target.closest?.('input,textarea,select,[contenteditable="true"],.modal'))return;
        const key=event.key.toLowerCase(),command=event.ctrlKey||event.metaKey;
        if(command&&key==='s'){event.preventDefault();$('savePlanBtn')?.click();return;}
        if(command&&['a','d','z','y'].includes(key)){
            event.preventDefault();if(key==='a')selectAll();else if(key==='d')duplicate();else if(key==='y'||event.shiftKey)redo();else undo();return;
        }
        if(event.key==='Escape'){event.preventDefault();clearSelection();return;}
        if(['Delete','Backspace'].includes(event.key)){event.preventDefault();remove();return;}
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||!selectedItems().length)return;
        event.preventDefault();cancelGesture();const items=selectedItems(),box=extent(items),r=room(),step=event.shiftKey?0.01:0.1;
        const dx=Math.max(-box.left,Math.min(r.width-box.right,event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0));
        const dy=Math.max(-box.top,Math.min(r.depth-box.bottom,event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0));
        if(apply(items.map(item=>({...item,x:item.x+dx,y:item.y+dy}))))render();
    }
    function init() {
        if(initialized)return;initialized=true;
        const commands={undoFloorBtn:undo,redoFloorBtn:redo,rotate45Btn:()=>rotate(45),rotate90Btn:()=>rotate(90),duplicateFloorBtn:duplicate,deleteFloorBtn:remove,propertiesFloorBtn:properties,snapFloorBtn:()=>setSnap(!snap),multiSelectBtn:()=>setMulti(!multi)};
        for(const [id,fn] of Object.entries(commands))if($(id))$(id).addEventListener('click',fn);
        document.addEventListener('keydown',keyboard);
        document.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'){touches.add(event.pointerId);if(touches.size>1)cancelGesture();}},true);
        document.addEventListener('pointermove',event=>{
            if(!gesture||event.pointerId!==gesture.pointerId)return;event.preventDefault();latest=event;
            if(frame===null)frame=raf(()=>{frame=null;const pending=latest;latest=null;if(pending)updateGesture(pending);});
        },{passive:false});
        document.addEventListener('pointerup',event=>{touches.delete(event.pointerId);end(event);});
        document.addEventListener('pointercancel',event=>{touches.delete(event.pointerId);if(gesture?.pointerId===event.pointerId)cancelGesture();});
        $('tablesGrid').addEventListener('pointerdown',event=>{
            if(!floorDraft||event.button!==0||event.altKey||event.pointerType==='touch'||event.target.closest?.('[data-floor-id],.editor-handle'))return;
            if(event.target!==$('tablesGrid')&&!event.target.classList.contains('floor-empty'))return;
            event.preventDefault();cancelGesture();const add=event.shiftKey||event.ctrlKey||event.metaKey;
            if(!add)selected.clear();gesture={kind:'marquee',pointerId:event.pointerId,target:$('tablesGrid'),start:point(event),client:{x:event.clientX,y:event.clientY},selection:new Set(selected),toggle:!!(event.ctrlKey||event.metaKey),moved:false,originals:[]};
            capture(gesture.target,event.pointerId);paint([]);
        });
        controls();
    }
    document.addEventListener('DOMContentLoaded',init);
    return {bind,onRender,init,cancelGesture,selectedItems,clearSelection,visibleCenter,selectAll,setSnap,setMulti,undo,redo,rotate,duplicate,remove,properties,onZoom:()=>{if(floorDraft)overlay();}};
})();

'use strict';
// Draft history is independent of reservations and is discarded on save/exit.
let editorHistory=[],editorHistoryIndex=-1,restoringEditor=false;
function resetEditorHistory(){editorHistory=[];editorHistoryIndex=-1;}
function recordEditorHistory(){
    if(!floorDraft){resetEditorHistory();updateHistoryButtons();return;}
    if(restoringEditor)return;
    const snapshot=JSON.stringify(floorDraft);
    if(editorHistory[editorHistoryIndex]!==snapshot){
        editorHistory.splice(editorHistoryIndex+1);editorHistory.push(snapshot);
        if(editorHistory.length>80)editorHistory.shift();
        editorHistoryIndex=editorHistory.length-1;
    }
    updateHistoryButtons();
}
function updateHistoryButtons(){el('undoFloorBtn').disabled=editorHistoryIndex<=0;el('redoFloorBtn').disabled=editorHistoryIndex>=editorHistory.length-1;}
function travelEditorHistory(delta){
    if(!floorDraft)return;
    recordEditorHistory();const index=editorHistoryIndex+delta;
    if(index<0||index>=editorHistory.length)return;
    restoringEditor=true;editorHistoryIndex=index;floorDraft=JSON.parse(editorHistory[index]);
    floorSelection.clear();roomOptions();afficherTables();restoringEditor=false;updateHistoryButtons();
}
function workspacePanel(name,open=true){
    ['catalog','inspector'].forEach(panel=>{
        const active=panel===name&&open;
        el('floorWorkspace').classList.toggle(panel+'-open',active);
        el(panel==='catalog'?'openCatalogBtn':'openInspectorBtn').setAttribute('aria-expanded',String(active));
    });
}
function refreshWorkspace(){
    const editing=!!floorDraft,items=editing?selectedRoomItems():[];
    el('floorWorkspace').classList.toggle('is-editing',editing);
    document.querySelector('.tables-section').classList.toggle('workspace-active',editing);
    ['workspaceCatalog','workspaceInspector','workspaceMobileTools','workspaceHelp'].forEach(id=>el(id).classList.toggle('hidden',!editing));
    el('inspectorEmpty').classList.toggle('hidden',!!items.length);
    el('inspectorActions').classList.toggle('hidden',!items.length);
    el('inspectorForm').classList.toggle('hidden',items.length!==1);
    el('selectionDetailsBtn').classList.toggle('hidden',items.length!==1);
    el('inspectorTitle').textContent=items.length===1?(items[0].number!==undefined?'Table '+items[0].number:items[0].label):items.length?items.length+' éléments':'Votre sélection';
    if(items.length===1){const t=items[0];el('inspectorWidth').value=Math.round(t.width*100);el('inspectorDepth').value=Math.round(t.depth*100);el('inspectorAngle').value=t.angle||0;el('inspectorColor').value=t.color;}
    el('selectionDeleteBtn').disabled=items.some(t=>t.number!==undefined&&referencedTable(t.number));
    el('workspaceMessage').textContent=el('selectionDeleteBtn').disabled?'Une table est liée à une réservation : sa suppression est protégée.':'';
    if(!editing)workspacePanel('',false);
}
function workspaceChange(action){
    if(!floorDraft)return;
    recordEditorHistory();const previous=structuredClone(floorDraft);
    try{action();if(!FloorPlan.valid(floorDraft))throw new Error('Ces éléments dépassent les dimensions fixes de la salle.');afficherTables();}
    catch(error){floorDraft=previous;afficherTables();el('workspaceMessage').textContent=error.message;}
}
function quickAddFurniture(kind){
    workspaceChange(()=>{
        const table=['square','round','rectangle','bench'].includes(kind),size=suggestedFurnitureSize(table?undefined:kind);
        const item=table?FloorPlan.tableOptions({id:crypto.randomUUID(),roomId:floorRoom,number:Math.max(0,...floorDraft.tables.map(t=>t.number))+1,capacity:kind==='rectangle'||kind==='bench'?4:2,shape:kind,width:size[0]*(kind==='rectangle'||kind==='bench'?1.5:1),depth:size[1],x:0,y:0}):FloorPlan.itemOptions({id:crypto.randomUUID(),roomId:floorRoom,type:kind,label:elementPresets[kind][0],width:size[0],depth:size[1],x:0,y:0});
        const spot=visibleFurnitureSpot(item);if(!spot)throw new Error('Pas assez de place dans cette salle aux dimensions fixes.');
        Object.assign(item,spot);expandFloor([item]);(table?floorDraft.tables:floorDraft.elements).push(item);rememberAddedFurniture(item);
        floorSelection.clear();floorSelection.add(item.id);
    });
}
function duplicateFloorSelection(){
    workspaceChange(()=>{
        const items=selectedRoomItems();if(!items.length)return;
        const room=floorDraft.rooms.find(r=>r.id===floorRoom);
        // Place the copy beside the entire group, preserving relative distances.
        const left=Math.min(...items.map(t=>t.x*room.width/100));
        const right=Math.max(...items.map(t=>t.x*room.width/100+FloorPlan.bounds(t).width));
        let number=Math.max(0,...floorDraft.tables.map(t=>t.number));
        const copies=items.map(t=>({...t,id:crypto.randomUUID(),x:t.x+(right-left+.5)/room.width*100,...(t.number!==undefined?{number:++number}:{})}));
        copies.forEach(t=>(t.number!==undefined?floorDraft.tables:floorDraft.elements).push(t));expandFloor();
        floorSelection.clear();copies.forEach(t=>floorSelection.add(t.id));rememberAddedFurniture(copies[copies.length-1]);
    });
}
function deleteFloorSelection(){
    if(!floorDraft)return;
    const items=selectedRoomItems();if(!items.length)return;
    if(items.some(t=>t.number!==undefined&&referencedTable(t.number))){el('workspaceMessage').textContent='Une table sélectionnée est liée à une réservation et ne peut pas être supprimée.';return;}
    workspaceChange(()=>{const ids=new Set(items.map(t=>t.id));floorDraft.tables=floorDraft.tables.filter(t=>!ids.has(t.id));floorDraft.elements=floorDraft.elements.filter(t=>!ids.has(t.id));floorSelection.clear();});
}
const workspaceCategories={Tables:['square','round','rectangle','bench'],Assises:['chair','sofa'],Décor:['plant','lamp','buffet','reception'],Structure:['bar','wall','door','window','pillar','kitchen','toilets','zone']};
function renderWorkspaceCatalog(category){
    el('workspaceCatalogItems').replaceChildren();
    for(const button of el('catalogCategories').children)button.setAttribute('aria-pressed',String(button.textContent===category));
    workspaceCategories[category].forEach(kind=>{
        const table=['square','round','rectangle','bench'].includes(kind),preset=table?null:elementPresets[kind];
        const item=table?{shape:kind,width:kind==='rectangle'||kind==='bench'?1.8:1.2,depth:1.2,capacity:kind==='rectangle'||kind==='bench'?4:2,angle:25}:{type:kind,width:preset[1],depth:preset[2],angle:25};
        const label=table?{square:'Table carrée',round:'Table ronde',rectangle:'Table rectangulaire',bench:'Banquette avec table'}[kind]:preset[0];
        const button=document.createElement('button');button.type='button';button.className='workspace-catalog-item';button.setAttribute('aria-label','Ajouter : '+label);
        button.innerHTML=(kind==='zone'?'<span class="catalog-zone">▧</span>':'<span class="catalog-preview">'+Floor3D.render(item)+'</span>')+'<span>'+label+'</span>';
        button.addEventListener('click',()=>quickAddFurniture(kind));el('workspaceCatalogItems').append(button);
    });
}
document.addEventListener('DOMContentLoaded',()=>{
    Object.keys(workspaceCategories).forEach(category=>{const button=document.createElement('button');button.type='button';button.textContent=category;button.addEventListener('click',()=>renderWorkspaceCatalog(category));el('catalogCategories').append(button);});renderWorkspaceCatalog('Tables');
    el('undoFloorBtn').addEventListener('click',()=>travelEditorHistory(-1));el('redoFloorBtn').addEventListener('click',()=>travelEditorHistory(1));
    el('openCatalogBtn').addEventListener('click',()=>workspacePanel('catalog',!el('floorWorkspace').classList.contains('catalog-open')));
    el('openInspectorBtn').addEventListener('click',()=>workspacePanel('inspector',!el('floorWorkspace').classList.contains('inspector-open')));
    el('closeCatalogBtn').addEventListener('click',()=>workspacePanel('',false));el('closeInspectorBtn').addEventListener('click',()=>workspacePanel('',false));
    el('selectionDuplicateBtn').addEventListener('click',duplicateFloorSelection);el('selectionDeleteBtn').addEventListener('click',deleteFloorSelection);
    el('selectionRotateBtn').addEventListener('click',()=>workspaceChange(()=>{for(const t of selectedRoomItems())if(!rotateFloorTable(t,t.angle+45))throw new Error('Pas assez de place pour tourner dans cette salle fixe.');}));
    [['selectionSmallerBtn',1/1.1],['selectionLargerBtn',1.1]].forEach(([id,factor])=>el(id).addEventListener('click',()=>workspaceChange(()=>{const items=selectedRoomItems();resizeFloorGroup(items,items.map(t=>({...t})),factor);expandFloor();})));
    el('selectionDetailsBtn').addEventListener('click',()=>{const t=selectedRoomItems()[0];if(t)t.number!==undefined?openTableEditor(t.id):openElementEditor(t.id);});
    el('inspectorForm').addEventListener('submit',event=>{event.preventDefault();workspaceChange(()=>{
        const t=selectedRoomItems()[0];if(!t)return;const width=Number(el('inspectorWidth').value)/100,depth=Number(el('inspectorDepth').value)/100,angle=Number(el('inspectorAngle').value),color=el('inspectorColor').value;
        if(![width,depth,angle].every(Number.isFinite)||width<.1||depth<.1||angle<0||angle>=360||!/^#[0-9a-f]{6}$/i.test(color))throw new Error('Vérifiez les dimensions, l’angle et la couleur.');
        const room=floorDraft.rooms.find(r=>r.id===floorRoom),before=FloorPlan.bounds(t);Object.assign(t,{width,depth,angle,color});const after=FloorPlan.bounds(t);
        t.x+=(before.width-after.width)/2/room.width*100;t.y+=(before.depth-after.depth)/2/room.depth*100;expandFloor();
    });});
    document.addEventListener('keydown',event=>{
        if(!floorDraft||event.target.closest('input,textarea,select,[contenteditable="true"],.modal:not(.hidden)'))return;
        const key=event.key.toLowerCase(),modifier=event.ctrlKey||event.metaKey;
        if(modifier&&key==='z'){event.preventDefault();travelEditorHistory(event.shiftKey?1:-1);}
        else if(modifier&&key==='y'){event.preventDefault();travelEditorHistory(1);}
        else if(modifier&&key==='d'){event.preventDefault();duplicateFloorSelection();}
        else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();deleteFloorSelection();}
        else if(event.key==='Escape'){floorSelection.clear();refreshFloorSelection();workspacePanel('',false);}
    });
    // Shift + drag adds a rectangular selection on desktop; ordinary drag pans.
    const viewport=el('floorViewport');let marquee=null;
    viewport.addEventListener('pointerdown',event=>{
        if(!floorDraft||event.pointerType!=='mouse'||event.button!==0||!event.shiftKey||event.target.closest('button'))return;
        event.preventDefault();const rect=el('tablesGrid').getBoundingClientRect();
        const box=document.createElement('div');box.className='selection-marquee';el('tablesGrid').append(box);
        marquee={x:event.clientX,y:event.clientY,rect,box,ids:new Set(floorSelection)};viewport.setPointerCapture(event.pointerId);
    });
    viewport.addEventListener('pointermove',event=>{
        if(!marquee)return;const m=marquee,r=m.rect;
        const x=(Math.min(m.x,event.clientX)-r.left)/r.width*100,y=(Math.min(m.y,event.clientY)-r.top)/r.height*100,w=Math.abs(event.clientX-m.x)/r.width*100,h=Math.abs(event.clientY-m.y)/r.height*100;
        Object.assign(m.box.style,{left:x+'%',top:y+'%',width:w+'%',height:h+'%'});floorSelection.clear();m.ids.forEach(id=>floorSelection.add(id));
        floorDraft.tables.concat(floorDraft.elements).filter(t=>t.roomId===floorRoom).forEach(t=>{const b=FloorPlan.sizePercent(floorDraft,t);if(t.x<=x+w&&t.x+b.width>=x&&t.y<=y+h&&t.y+b.height>=y)floorSelection.add(t.id);});refreshFloorSelection();
    });
    ['pointerup','pointercancel'].forEach(name=>viewport.addEventListener(name,()=>{if(marquee){marquee.box.remove();marquee=null;}}));
    refreshWorkspace();recordEditorHistory();
});

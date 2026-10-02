'use strict';
const FloorThree=(()=>{
    let scene=null,active=false,loading=false,moving=null;
    function selection(){if(scene&&active)scene.setSelection(floorSelection);}
    function sync(){
        el('threeMoveBtn').classList.toggle('hidden',!floorDraft);
        if(!floorDraft){scene?.setMode('camera');el('threeMoveBtn').setAttribute('aria-pressed','false');}
        if(scene&&active)scene.sync(currentPlan(),floorRoom,floorSelection);
    }
    function show(value){
        active=value;el('floorWorkspace').classList.toggle('three-active',value);
        el('floorThreeHost').classList.toggle('hidden',!value);el('threeControls').classList.toggle('hidden',!value);
        el('threeViewBtn').setAttribute('aria-pressed',String(value));el('twoViewBtn').setAttribute('aria-pressed',String(!value));
        scene?.setActive(value&&!document.hidden);sync();
        if(!value)FloorZoom.updateRoom(currentPlan(),floorRoom);
    }
    function error(message){show(false);scene?.dispose();scene=null;el('threeStatus').textContent=message;}
    async function open(){
        if(loading)return;if(scene){show(true);return;}
        loading=true;el('threeViewBtn').disabled=true;el('threeStatus').textContent='Chargement de la 3D…';
        try{
            const module=await import('./floor-three-scene.mjs?v=3');
            scene=module.createFloorScene(el('floorThreeHost'),{
                model:Floor3D.model,visual:Floor3D.visual,bounds:FloorPlan.bounds,
                editing:()=>!!floorDraft,selected:()=>floorSelection,
                items:()=>currentPlan().tables.concat(currentPlan().elements).filter(t=>t.roomId===floorRoom),
                select(id,additive){
                    if(!floorDraft){const t=currentPlan().tables.find(t=>t.id===id);if(t)cliquerTable(t.number);return;}
                    if(additive||multiSelectMode){if(floorSelection.has(id))floorSelection.delete(id);else floorSelection.add(id);}
                    else if(!floorSelection.has(id)){floorSelection.clear();floorSelection.add(id);}
                    refreshFloorSelection();workspacePanel('inspector');
                },
                beginMove(){recordEditorHistory();const items=selectedRoomItems();moving={items,origins:items.map(t=>({...t}))};},
                move(dx,dy){if(moving)moveFloorGroup(moving.items,moving.origins,dx,dy);},
                endMove(){if(!moving)return;moving=null;expandFloor();afficherTables();finishFloorGesture();},error
            });
            el('threeStatus').textContent='Glissez pour tourner · Molette ou deux doigts pour zoomer · Touchez un meuble pour le sélectionner.';show(true);
        }catch(e){error('La 3D ne peut pas démarrer sur ce navigateur. Votre plan reste accessible en 2D.');console.warn('Three.js',e);}
        finally{loading=false;el('threeViewBtn').disabled=false;}
    }
    document.addEventListener('DOMContentLoaded',()=>{
        el('threeViewBtn').addEventListener('click',open);el('twoViewBtn').addEventListener('click',()=>show(false));
        el('threeTopBtn').addEventListener('click',()=>scene?.fit(true));el('threePerspectiveBtn').addEventListener('click',()=>scene?.fit(false));
        el('threeMoveBtn').addEventListener('click',()=>{const move=el('threeMoveBtn').getAttribute('aria-pressed')!=='true';el('threeMoveBtn').setAttribute('aria-pressed',String(move));scene?.setMode(move?'move':'camera');el('threeStatus').textContent=move?'Glissez un meuble pour déplacer la sélection. Rotation et taille : panneau de réglages.':'Glissez le fond pour tourner autour du plan. Deux doigts ou molette pour zoomer.';});
        document.addEventListener('visibilitychange',()=>scene?.setActive(active&&!document.hidden));
    });
    return {sync,selection,isActive:()=>active,centre:()=>scene?.centre()};
})();

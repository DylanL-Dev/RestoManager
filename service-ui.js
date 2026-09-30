'use strict';
let floorRoom = 'main';
let floorDraft = null;
let selectedFloorTable = null;
let serviceView = 'plan';
let selectedFloorElement = null;
const el = id => document.getElementById(id);
const currentPlan = () => floorDraft || FloorPlan.get();
const referencedTable = number => reservations.concat(...history.map(day => day.reservations)).some(r => r.tables.includes(number));
function roomOptions() {
    const plan = currentPlan();
    if (!plan.rooms.some(r => r.id === floorRoom)) floorRoom = 'main';
    ['roomSelect', 'manageRoomSelect'].forEach(id => {
        el(id).replaceChildren(...plan.rooms.map(room => {
            const option = document.createElement('option'); option.value = room.id; option.textContent = room.name; return option;
        }));
        el(id).value = floorRoom;
    });
    el('renameRoomName').value = plan.rooms.find(r => r.id === floorRoom).name;
}
function setServiceView(view) {
    serviceView = view;
    document.querySelector('.tables-section').classList.toggle('hidden', view !== 'plan');
    document.querySelector('.reservations-section').classList.toggle('hidden', view !== 'list');
    ['plan', 'list'].forEach(name => { el(name + 'Tab').classList.toggle('active', name === view); el(name + 'Tab').setAttribute('aria-pressed', String(name === view)); });
}
function startFloorEdit() {
    if (!floorDraft) floorDraft = FloorPlan.get();
    fermerAdministration(); setServiceView('plan'); roomOptions(); afficherTables();
}
function placeFloorItem(button,item) {
    const size=FloorPlan.sizePercent(currentPlan(),item);
    button.style.left=item.x+'%';button.style.top=item.y+'%';button.style.width=size.width+'%';button.style.height=size.height+'%';
}
function bindFloorItem(button,item,onClick) {
    const grid=el('tablesGrid');let drag=null,moved=false;
    const move=(x,y)=>{const size=FloorPlan.sizePercent(currentPlan(),item);item.x=Math.max(0,Math.min(100-size.width,x));item.y=Math.max(0,Math.min(100-size.height,y));placeFloorItem(button,item);};
    button.addEventListener('pointerdown',event=>{
        if(!floorDraft||event.button!==0)return;const rect=grid.getBoundingClientRect();drag={x:event.clientX,y:event.clientY,tx:item.x,ty:item.y,rect};moved=false;button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointermove',event=>{
        if(!drag)return;if(FloorZoom.isPinching()){drag=null;moved=true;return;}
        const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)<6&&!moved)return;moved=true;
        move(drag.tx+dx/drag.rect.width*100,drag.ty+dy/drag.rect.height*100);
    });
    button.addEventListener('pointerup',()=>{drag=null;});button.addEventListener('pointercancel',()=>{drag=null;});
    button.addEventListener('keydown',event=>{
        if(!floorDraft||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();
        const room=currentPlan().rooms.find(r=>r.id===item.roomId);
        move(item.x+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0)*10/room.width,item.y+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0)*10/room.depth);
    });
    button.addEventListener('click',()=>{if(moved||FloorZoom.ignoreClick()){moved=false;return;}onClick();});
}
function swapDimensions(widthId,depthId){const width=el(widthId).value;el(widthId).value=el(depthId).value;el(depthId).value=width;}
const elementPresets={bar:['Bar',3,0.8],wall:['Mur',3,0.2],door:['Porte',1,0.2],window:['Fenêtre',1.5,0.2],pillar:['Pilier',0.5,0.5],plant:['Plante',0.6,0.6],kitchen:['Cuisine',3,2],toilets:['Toilettes',2,1.5],zone:['Zone',3,2]};
function setElementDefaults(){const preset=elementPresets[el('elementTypeInput').value];el('elementLabelInput').value=preset[0];el('elementWidthInput').value=preset[1];el('elementDepthInput').value=preset[2];}
function openElementEditor(id){
    selectedFloorElement=id;const item=floorDraft.elements.find(t=>t.id===id);el('elementTitle').textContent=item?'Modifier '+item.label:'Ajouter un élément';
    if(item){el('elementTypeInput').value=item.type;el('elementLabelInput').value=item.label;el('elementWidthInput').value=item.width;el('elementDepthInput').value=item.depth;}
    else{el('elementTypeInput').value='bar';setElementDefaults();}
    el('elementError').textContent='';el('deleteElementBtn').classList.toggle('hidden',!item);el('elementModal').classList.remove('hidden');
}
afficherTables = function () {
    const grid = el('tablesGrid'); grid.replaceChildren();
    const editing = !!floorDraft;
    grid.classList.toggle('editing', editing); el('editorBar').classList.toggle('hidden', !editing);
    el('floorHint').textContent = editing ? 'Glissez pour déplacer. Touchez pour modifier.' : 'Touchez une table pour ouvrir sa fiche.';
    currentPlan().tables.filter(t => t.roomId === floorRoom).forEach(table => {
        const status = getTableStatus(table.number);
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'table-card ' + status + ' shape-' + table.shape;
        placeFloorItem(button, table);
        const r = reservations.filter(r => r.date === getServiceDate() && r.tables.includes(table.number) && ReservationEngine.isBlocking(r)).sort((a,b) => (b.status === STATUS.SEATED) - (a.status === STATUS.SEATED) || a.time.localeCompare(b.time))[0];
        const client = r ? (r.type === 'hotel' ? 'Ch. ' : '') + r.client : table.capacity + ' places';
        button.innerHTML = '<strong class="table-number">T' + table.number + '</strong><span class="table-capacity">' + escapeHTML(client) + '</span><span class="table-status">' + (r ? r.time + ' · ' + r.guests + ' pers.' : 'Libre') + '</span>';
        button.setAttribute('aria-label', 'Table ' + table.number + ', ' + table.capacity + ' places, ' + (r ? texteStatut(r.status) + ', ' + client : 'libre'));
        bindFloorItem(button, table, () => { if (floorDraft) openTableEditor(table.id); else cliquerTable(table.number); });
        grid.append(button);
    });
    currentPlan().elements.filter(item=>item.roomId===floorRoom).forEach(item=> {
        const button=document.createElement('button');button.type='button';button.className='floor-element element-'+item.type;
        button.textContent=item.label;button.setAttribute('aria-label',item.label+', '+item.width+' × '+item.depth+' mètres');
        placeFloorItem(button,item);
        if(editing)bindFloorItem(button,item,()=>openElementEditor(item.id));
        else { button.disabled=true; }
        grid.append(button);
    });
    const room=currentPlan().rooms.find(r=>r.id===floorRoom);
    el('roomDimensionsLabel').textContent=room.width+' × '+room.depth+' m';
    FloorZoom.updateRoom(currentPlan(),floorRoom);
    if (!grid.children.length) { const message = document.createElement('p'); message.className = 'floor-empty'; message.textContent = editing ? 'Cette salle est vide. Ajoutez une table.' : 'Aucune table dans cette salle.'; grid.append(message); }
};
function openTableEditor(id) {
    selectedFloorTable = id;
    const table = floorDraft.tables.find(t => t.id === id);
    el('tableEditTitle').textContent = table ? 'Modifier T' + table.number : 'Ajouter une table';
    el('tableNumberInput').value = table ? table.number : Math.max(25, ...floorDraft.tables.map(t => t.number)) + 1;
    el('tableCapacityInput').value = table ? table.capacity : 2;
    el('tableShapeInput').value = table ? table.shape : 'square';
    el('tableWidthInput').value=table?table.width:1.2;el('tableDepthInput').value=table?table.depth:1.2;
    el('deleteTableBtn').classList.toggle('hidden', !table); el('tableEditError').textContent = '';
    el('tableEditModal').classList.remove('hidden'); el('tableNumberInput').focus();
}
const originalVoirReservation = voirReservation;
voirReservation = function(id) { setServiceView('list'); originalVoirReservation(id); };
const originalOpenManagement = ouvrirAdministration;
ouvrirAdministration = function() { roomOptions(); originalOpenManagement(); };
document.addEventListener('DOMContentLoaded', () => {
    roomOptions(); afficherTables();
    el('menuBtn').addEventListener('click', () => { const open = el('serviceMenu').classList.toggle('hidden') === false; el('menuBtn').setAttribute('aria-expanded', String(open)); });
    el('serviceMenu').addEventListener('click', event => { if (event.target.closest('button')) { el('serviceMenu').classList.add('hidden'); el('menuBtn').setAttribute('aria-expanded', 'false'); } });
    el('planTab').addEventListener('click', () => setServiceView('plan')); el('listTab').addEventListener('click', () => setServiceView('list'));
    ['roomSelect','manageRoomSelect'].forEach(id => el(id).addEventListener('change', () => { floorRoom = el(id).value; roomOptions(); afficherTables(); }));
    el('editPlanBtn').addEventListener('click', startFloorEdit);
    el('addTableBtn').addEventListener('click', () => openTableEditor(null));
    el('savePlanBtn').addEventListener('click', () => {
        try {
            const saved = FloorPlan.get();
            if (saved.tables.some(t => referencedTable(t.number) && !floorDraft.tables.some(n => n.id===t.id && n.number===t.number))) throw new Error('Une table modifiée est maintenant liée à une réservation. Annulez ses modifications.');
            if (reservations.some(r => ReservationEngine.isBlocking(r) && r.tables.reduce((sum,n) => sum + (floorDraft.tables.find(t => t.number===n)?.capacity || 0),0) < r.guests)) throw new Error('La capacité du plan est insuffisante pour une réservation existante.');
            const overlapping = floorDraft.tables.some((a,i) => floorDraft.tables.slice(i+1).some(b => FloorPlan.overlaps(floorDraft,a,b)));
            if (overlapping) throw new Error('Des tables se chevauchent. Écartez-les avant d’enregistrer.');
            FloorPlan.save(floorDraft); floorDraft = null; roomOptions(); refreshUI(); } catch (error) { alert(error.message); }
    });
    el('cancelPlanBtn').addEventListener('click', () => { if (!confirm('Abandonner les modifications du plan ?')) return; floorDraft = null; roomOptions(); refreshUI(); });
    el('resetPlanBtn').addEventListener('click', () => {
        if (!confirm('Réorganiser les positions des tables de cette salle dans le brouillon ?')) return;
        const candidate=structuredClone(floorDraft);
        const tables=candidate.tables.filter(t=>t.roomId===floorRoom);candidate.tables=candidate.tables.filter(t=>t.roomId!==floorRoom);
        for(const t of tables){const spot=FloorPlan.freeSpot(candidate,t);if(!spot)return alert('La salle est trop petite pour réorganiser ces tables. Agrandissez ses dimensions.');Object.assign(t,spot);candidate.tables.push(t);}
        floorDraft=candidate;afficherTables();
    });
    el('closeTableEditBtn').addEventListener('click', () => el('tableEditModal').classList.add('hidden'));
    el('tableEditForm').addEventListener('submit', event => {
        event.preventDefault(); const number = Number(el('tableNumberInput').value), capacity = Number(el('tableCapacityInput').value);
        const width=Number(el('tableWidthInput').value),depth=Number(el('tableDepthInput').value);
        const old = floorDraft.tables.find(t => t.id === selectedFloorTable);
        const fail = message => { el('tableEditError').textContent = message; };
        if (!Number.isInteger(number) || number < 1 || !Number.isInteger(capacity) || capacity < 1 || capacity > 100) return fail('Indiquez un numéro et une capacité valides.');
        if (floorDraft.tables.some(t => t.number === number && t.id !== selectedFloorTable)) return fail('Ce numéro existe déjà dans une salle.');
        if (old && old.number !== number && referencedTable(old.number)) return fail('Cette table est liée à des réservations. Son numéro doit être conservé.');
        if (old && capacity < old.capacity && reservations.some(r => ReservationEngine.isBlocking(r) && r.tables.includes(old.number) && r.tables.reduce((sum,n) => sum + (n === old.number ? capacity : floorDraft.tables.find(t => t.number === n)?.capacity || 0),0) < r.guests)) return fail('Cette capacité est insuffisante pour une réservation existante.');
        const candidate={...(old||{id:crypto.randomUUID(),roomId:floorRoom,x:0,y:0}),number,capacity,width,depth,shape:el('tableShapeInput').value};
        if(!Number.isFinite(width)||!Number.isFinite(depth)||width<0.1||depth<0.1)return fail('Indiquez des dimensions de mobilier valides.');
        if(!old){const spot=FloorPlan.freeSpot(floorDraft,candidate);if(!spot)return fail('Pas assez de place. Agrandissez la salle ou déplacez les tables.');Object.assign(candidate,spot);}
        if(!FloorPlan.inside(floorDraft,candidate))return fail('La table dépasse la salle. Déplacez-la ou agrandissez la salle.');
        if(old)Object.assign(old,candidate);else floorDraft.tables.push(candidate);
        el('tableEditModal').classList.add('hidden'); afficherTables();
    });
    el('deleteTableBtn').addEventListener('click', () => {
        const table = floorDraft.tables.find(t => t.id === selectedFloorTable);
        if (referencedTable(table.number)) { el('tableEditError').textContent = 'Cette table est liée à des réservations ou à l’historique.'; return; }
        if (!confirm('Supprimer T' + table.number + ' du brouillon ?')) return;
        floorDraft.tables = floorDraft.tables.filter(t => t.id !== table.id); el('tableEditModal').classList.add('hidden'); afficherTables();
    });
    el('roomForm').addEventListener('submit', event => {
        event.preventDefault(); const name=el('roomName').value.trim(); if (!name) return;
        startFloorEdit(); const id=crypto.randomUUID(); floorDraft.rooms.push({id,name,width:12,depth:8}); floorRoom=id; el('roomForm').reset(); roomOptions(); afficherTables();
    });
    el('renameRoomForm').addEventListener('submit', event => { event.preventDefault(); const name=el('renameRoomName').value.trim(); if (!name) return; startFloorEdit(); floorDraft.rooms.find(r => r.id===floorRoom).name=name; roomOptions(); afficherTables(); });
    el('deleteRoomBtn').addEventListener('click', () => {
        if (floorRoom==='main') return alert('La salle principale doit être conservée.');
        if (currentPlan().tables.concat(currentPlan().elements).some(t => t.roomId===floorRoom)) return alert('Retirez les tables et les éléments de cette salle avant de la supprimer.');
        if (!confirm('Supprimer cette salle dans le brouillon ?')) return;
        startFloorEdit(); floorDraft.rooms=floorDraft.rooms.filter(r => r.id!==floorRoom); floorRoom='main'; roomOptions(); afficherTables();
    });
    el('roomDimensionsBtn').addEventListener('click',()=>{
        const room=floorDraft.rooms.find(r=>r.id===floorRoom);el('roomWidthInput').value=room.width;el('roomDepthInput').value=room.depth;el('roomDimensionsError').textContent='';el('roomDimensionsModal').classList.remove('hidden');
    });
    el('closeDimensionsBtn').addEventListener('click',()=>el('roomDimensionsModal').classList.add('hidden'));
    el('roomDimensionsForm').addEventListener('submit',event=>{event.preventDefault();try{FloorPlan.resizeRoom(floorDraft,floorRoom,Number(el('roomWidthInput').value),Number(el('roomDepthInput').value));el('roomDimensionsModal').classList.add('hidden');afficherTables();}catch(error){el('roomDimensionsError').textContent=error.message;}});
    el('rotateTableBtn').addEventListener('click',()=>swapDimensions('tableWidthInput','tableDepthInput'));
    el('addElementBtn').addEventListener('click',()=>openElementEditor(null));
    el('closeElementBtn').addEventListener('click',()=>el('elementModal').classList.add('hidden'));
    el('elementTypeInput').addEventListener('change',()=>{if(!selectedFloorElement)setElementDefaults();});
    el('rotateElementBtn').addEventListener('click',()=>swapDimensions('elementWidthInput','elementDepthInput'));
    el('elementForm').addEventListener('submit',event=>{
        event.preventDefault();const old=floorDraft.elements.find(t=>t.id===selectedFloorElement);
        const candidate={...(old||{id:crypto.randomUUID(),roomId:floorRoom,x:0,y:0}),type:el('elementTypeInput').value,label:el('elementLabelInput').value.trim(),width:Number(el('elementWidthInput').value),depth:Number(el('elementDepthInput').value)};
        if(!old){const spot=FloorPlan.freeSpot(floorDraft,candidate);if(spot)Object.assign(candidate,spot);}
        if(!candidate.label||!FloorPlan.inside(floorDraft,candidate)){el('elementError').textContent='Vérifiez le nom et les dimensions : l’élément doit tenir dans la salle.';return;}
        if(old)Object.assign(old,candidate);else floorDraft.elements.push(candidate);
        el('elementModal').classList.add('hidden');afficherTables();
    });
    el('deleteElementBtn').addEventListener('click',()=>{if(!confirm('Supprimer cet élément du brouillon ?'))return;floorDraft.elements=floorDraft.elements.filter(t=>t.id!==selectedFloorElement);el('elementModal').classList.add('hidden');afficherTables();});
    document.addEventListener('keydown', event => { if (event.key==='Escape') { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); el('serviceMenu').classList.add('hidden'); el('menuBtn').setAttribute('aria-expanded','false'); } });
    window.addEventListener('beforeunload', event => { if (floorDraft) { event.preventDefault(); event.returnValue=''; } });
});

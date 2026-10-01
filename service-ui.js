'use strict';
let floorRoom = 'main';
let floorDraft = null;
let selectedFloorTable = null;
let serviceView = 'plan';
let selectedFloorElement = null;
let roomFloorChoice = 'plain';
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
function furnitureMarkup(item) {
    const box=FloorPlan.bounds(item),width=item.width/box.width*100,height=item.depth/box.depth*100;
    return '<span class="furniture-art" style="width:'+width+'%;height:'+height+'%;transform:translate(-50%,-50%) rotate('+(item.angle||0)+'deg);--furniture-color:'+item.color+'">'+FloorArt.render(item)+'</span>';
}
function setEditorAngle(prefix,value){const angle=((Math.round(Number(value)||0)%360)+360)%360;el(prefix+'AngleInput').value=angle;el(prefix+'AngleRange').value=angle;}
function setEditorColor(prefix,color){el(prefix+'ColorInput').value=color;document.querySelectorAll('[data-owner="'+prefix+'"]').forEach(button=>button.setAttribute('aria-pressed',String(button.getAttribute('data-color')===color)));}
function setEditorOptions(prefix,item){setEditorAngle(prefix,item?.angle||0);setEditorColor(prefix,item?.color||'#8a5a29');}
function setFloorChoice(floor){roomFloorChoice=floor;['plain','wood','tile','stone'].forEach(key=>el('floor'+key[0].toUpperCase()+key.slice(1)+'Btn').setAttribute('aria-pressed',String(floor===key)));}
function spacingDescription(plan,table){const nearby=FloorPlan.nearby(plan,table);return nearby.length?'Espace à vérifier : moins de 90 cm de '+nearby.map(p=>'T'+p.table.number+(p.table.letter||'')+' ('+Math.round(p.gap*100)+' cm)').join(', ')+'.':'';}
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
const elementPresets={bar:['Bar',3,0.8],wall:['Mur',3,0.2],door:['Porte',1,1],window:['Fenêtre',1.5,0.2],pillar:['Pilier',0.5,0.5],plant:['Plante',0.6,0.6],kitchen:['Cuisine',3,2],toilets:['Toilettes',2,1.5],zone:['Zone',3,2]};
function setElementDefaults(){const preset=elementPresets[el('elementTypeInput').value];el('elementLabelInput').value=preset[0];el('elementWidthInput').value=Math.round(preset[1]*100);el('elementDepthInput').value=Math.round(preset[2]*100);setEditorColor('element',{plant:'#28734f',window:'#28536d',wall:'#3b4553',toilets:'#6c3187'}[el('elementTypeInput').value]||'#8a5a29');}
function openElementEditor(id){
    selectedFloorElement=id;const item=floorDraft.elements.find(t=>t.id===id);el('elementTitle').textContent=item?'Modifier '+item.label:'Ajouter un élément';
    if(item){el('elementTypeInput').value=item.type;el('elementLabelInput').value=item.label;el('elementWidthInput').value=Math.round(item.width*100);el('elementDepthInput').value=Math.round(item.depth*100);}
    else{el('elementTypeInput').value='bar';setElementDefaults();}
    if(item)setEditorOptions('element',item);else setEditorAngle('element',0);
    el('elementError').textContent='';el('deleteElementBtn').classList.toggle('hidden',!item);el('elementModal').classList.remove('hidden');
}
afficherTables = function () {
    const plan=currentPlan();
    const grid = el('tablesGrid'); grid.replaceChildren();
    const editing = !!floorDraft;
    grid.classList.toggle('editing', editing); el('editorBar').classList.toggle('hidden', !editing);
    el('floorHint').textContent = editing ? 'Glissez pour déplacer. Touchez pour modifier.' : 'Touchez une table pour ouvrir sa fiche.';
    plan.tables.filter(t => t.roomId === floorRoom).forEach(table => {
        const status = getTableStatus(table.number);
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'table-card ' + status + ' shape-' + table.shape;
        button.setAttribute('data-table-number',String(table.number));
        button.classList.toggle('service-selected',typeof serviceTableNumber!=='undefined'&&serviceTableNumber===table.number);
        placeFloorItem(button, table);
        const r = reservations.filter(r => r.date === getServiceDate() && r.tables.includes(table.number) && ReservationEngine.isBlocking(r)).sort((a,b) => (b.status === STATUS.SEATED) - (a.status === STATUS.SEATED) || a.time.localeCompare(b.time))[0];
        const client = r ? (r.type === 'hotel' ? 'Ch. ' : '') + r.client : (table.capacityMin===table.capacity?table.capacity:table.capacityMin+'–'+table.capacity)+' places';
        button.innerHTML=furnitureMarkup(table)+'<span class="furniture-label"><strong class="table-number">T'+table.number+(table.letter||'')+'</strong><span class="table-capacity">'+escapeHTML(client)+'</span><span class="table-status">'+(r?r.time:'Libre')+'</span></span>';
        button.classList.toggle('close-spacing',editing&&FloorPlan.nearby(plan,table).length>0);
        button.setAttribute('aria-label', 'Table ' + table.number + ', ' + table.capacity + ' places, ' + (r ? texteStatut(r.status) + ', ' + client : 'libre'));
        bindFloorItem(button, table, () => { if (floorDraft) openTableEditor(table.id); else cliquerTable(table.number); });
        grid.append(button);
    });
    plan.elements.filter(item=>item.roomId===floorRoom).forEach(item=> {
        const button=document.createElement('button');button.type='button';button.className='floor-element element-'+item.type;
        button.innerHTML=furnitureMarkup(item)+'<span class="element-label">'+escapeHTML(item.label)+'</span>';button.setAttribute('aria-label',item.label+', '+item.width+' × '+item.depth+' mètres');
        placeFloorItem(button,item);
        if(editing)bindFloorItem(button,item,()=>openElementEditor(item.id));
        else { button.disabled=true; }
        grid.append(button);
    });
    const room=plan.rooms.find(r=>r.id===floorRoom);
    el('roomDimensionsLabel').textContent=room.width+' × '+room.depth+' m';
    ['plain','wood','tile','stone'].forEach(key=>grid.classList.toggle('floor-'+key,room.floor===key));
    const tables=plan.tables.filter(t=>t.roomId===floorRoom);
    const pairs=tables.reduce((count,t,i)=>count+tables.slice(i+1).filter(other=>FloorPlan.gap(plan,t,other)<0.9-1e-7).length,0);
    el('floorSpacingNotice').textContent=pairs+' rapprochement'+(pairs>1?'s':'')+' de tables à moins de 90 cm. Vérifiez les passages.';
    el('floorSpacingNotice').classList.toggle('hidden',!editing||!pairs);
    FloorZoom.updateRoom(plan,floorRoom);
    if (!grid.children.length) { const message = document.createElement('p'); message.className = 'floor-empty'; message.textContent = editing ? 'Cette salle est vide. Ajoutez une table.' : 'Aucune table dans cette salle.'; grid.append(message); }
};
function openTableEditor(id) {
    selectedFloorTable = id;
    const table = floorDraft.tables.find(t => t.id === id);
    el('tableEditTitle').textContent = table ? 'Modifier T' + table.number : 'Ajouter une table';
    el('tableNumberInput').value = table ? table.number : Math.max(25, ...floorDraft.tables.map(t => t.number)) + 1;
    el('tableCapacityInput').value = table ? table.capacity : 2;
    el('tableMinCapacityInput').value=table?table.capacityMin:2;el('tableLetterInput').value=table?table.letter:'';
    setEditorOptions('table',table);el('tableSpacingHint').textContent=table?spacingDescription(floorDraft,table):'';
    el('tableShapeInput').value = table ? table.shape : 'square';
    el('tableWidthInput').value=table?Math.round(table.width*100):120;el('tableDepthInput').value=table?Math.round(table.depth*100):120;
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
        const width=Number(el('tableWidthInput').value)/100,depth=Number(el('tableDepthInput').value)/100;
        const capacityMin=Number(el('tableMinCapacityInput').value),letter=el('tableLetterInput').value,angle=Number(el('tableAngleInput').value),color=el('tableColorInput').value;
        const old = floorDraft.tables.find(t => t.id === selectedFloorTable);
        const fail = message => { el('tableEditError').textContent = message; };
        if (!Number.isInteger(number) || number < 1 || !Number.isInteger(capacity) || capacity < 1 || capacity > 100) return fail('Indiquez un numéro et une capacité valides.');
        if(!['','A','B'].includes(letter))return fail('Choisissez une lettre proposée.');
        if(!Number.isInteger(capacityMin)||capacityMin<1||capacityMin>capacity)return fail('Les couverts minimum doivent être compris entre 1 et le maximum.');
        if(!Number.isInteger(angle)||angle<0||angle>=360||!/^#[0-9a-f]{6}$/i.test(color))return fail('Vérifiez l’angle et la couleur.');
        if (floorDraft.tables.some(t => t.number === number && t.id !== selectedFloorTable)) return fail('Ce numéro existe déjà dans une salle.');
        if (old && old.number !== number && referencedTable(old.number)) return fail('Cette table est liée à des réservations. Son numéro doit être conservé.');
        if (old && capacity < old.capacity && reservations.some(r => ReservationEngine.isBlocking(r) && r.tables.includes(old.number) && r.tables.reduce((sum,n) => sum + (n === old.number ? capacity : floorDraft.tables.find(t => t.number === n)?.capacity || 0),0) < r.guests)) return fail('Cette capacité est insuffisante pour une réservation existante.');
        const candidate={...(old||{id:crypto.randomUUID(),roomId:floorRoom,x:0,y:0}),number,capacity,capacityMin,letter,angle,color,width,depth,shape:el('tableShapeInput').value};
        if(!Number.isFinite(width)||!Number.isFinite(depth)||width<0.1||depth<0.1)return fail('Indiquez des dimensions de mobilier valides.');
        if(old){const room=floorDraft.rooms.find(r=>r.id===old.roomId),before=FloorPlan.bounds(old),after=FloorPlan.bounds(candidate);candidate.x+=((before.width-after.width)/2)/room.width*100;candidate.y+=((before.depth-after.depth)/2)/room.depth*100;}
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
        startFloorEdit(); const id=crypto.randomUUID(); floorDraft.rooms.push({id,name,width:12,depth:8,floor:'plain'}); floorRoom=id; el('roomForm').reset(); roomOptions(); afficherTables();
    });
    el('renameRoomForm').addEventListener('submit', event => { event.preventDefault(); const name=el('renameRoomName').value.trim(); if (!name) return; startFloorEdit(); floorDraft.rooms.find(r => r.id===floorRoom).name=name; roomOptions(); afficherTables(); });
    el('deleteRoomBtn').addEventListener('click', () => {
        if (floorRoom==='main') return alert('La salle principale doit être conservée.');
        if (currentPlan().tables.concat(currentPlan().elements).some(t => t.roomId===floorRoom)) return alert('Retirez les tables et les éléments de cette salle avant de la supprimer.');
        if (!confirm('Supprimer cette salle dans le brouillon ?')) return;
        startFloorEdit(); floorDraft.rooms=floorDraft.rooms.filter(r => r.id!==floorRoom); floorRoom='main'; roomOptions(); afficherTables();
    });
    el('roomDimensionsBtn').addEventListener('click',()=>{
        const room=floorDraft.rooms.find(r=>r.id===floorRoom);el('roomWidthInput').value=room.width;el('roomDepthInput').value=room.depth;setFloorChoice(room.floor);el('roomDimensionsError').textContent='';el('roomDimensionsModal').classList.remove('hidden');
    });
    el('closeDimensionsBtn').addEventListener('click',()=>el('roomDimensionsModal').classList.add('hidden'));
    el('roomDimensionsForm').addEventListener('submit',event=>{event.preventDefault();try{FloorPlan.resizeRoom(floorDraft,floorRoom,Number(el('roomWidthInput').value),Number(el('roomDepthInput').value));floorDraft.rooms.find(r=>r.id===floorRoom).floor=roomFloorChoice;el('roomDimensionsModal').classList.add('hidden');afficherTables();}catch(error){el('roomDimensionsError').textContent=error.message;}});
    el('rotateTableBtn').addEventListener('click',()=>setEditorAngle('table',Number(el('tableAngleInput').value)+90));
    el('addElementBtn').addEventListener('click',()=>openElementEditor(null));
    el('closeElementBtn').addEventListener('click',()=>el('elementModal').classList.add('hidden'));
    el('elementTypeInput').addEventListener('change',()=>{if(!selectedFloorElement)setElementDefaults();});
    el('rotateElementBtn').addEventListener('click',()=>setEditorAngle('element',Number(el('elementAngleInput').value)+90));
    el('elementForm').addEventListener('submit',event=>{
        event.preventDefault();const old=floorDraft.elements.find(t=>t.id===selectedFloorElement);
        const candidate={...(old||{id:crypto.randomUUID(),roomId:floorRoom,x:0,y:0}),type:el('elementTypeInput').value,label:el('elementLabelInput').value.trim(),width:Number(el('elementWidthInput').value)/100,depth:Number(el('elementDepthInput').value)/100,angle:Number(el('elementAngleInput').value),color:el('elementColorInput').value};
        if(!Number.isInteger(candidate.angle)||candidate.angle<0||candidate.angle>=360||!/^#[0-9a-f]{6}$/i.test(candidate.color)){el('elementError').textContent='Vérifiez l’angle et la couleur.';return;}
        if(old){const room=floorDraft.rooms.find(r=>r.id===old.roomId),before=FloorPlan.bounds(old),after=FloorPlan.bounds(candidate);candidate.x+=((before.width-after.width)/2)/room.width*100;candidate.y+=((before.depth-after.depth)/2)/room.depth*100;}
        if(!old){const spot=FloorPlan.freeSpot(floorDraft,candidate);if(spot)Object.assign(candidate,spot);}
        if(!candidate.label||!FloorPlan.inside(floorDraft,candidate)){el('elementError').textContent='Vérifiez le nom et les dimensions : l’élément doit tenir dans la salle.';return;}
        if(old)Object.assign(old,candidate);else floorDraft.elements.push(candidate);
        el('elementModal').classList.add('hidden');afficherTables();
    });
    el('deleteElementBtn').addEventListener('click',()=>{if(!confirm('Supprimer cet élément du brouillon ?'))return;floorDraft.elements=floorDraft.elements.filter(t=>t.id!==selectedFloorElement);el('elementModal').classList.add('hidden');afficherTables();});
    [['tableMinCapacity','tableMinCapacityInput'],['tableCapacity','tableCapacityInput']].forEach(([prefix,id])=>{
        ['Minus','Plus'].forEach(direction=>el(prefix+direction).addEventListener('click',()=>{
            el(id).value=Math.max(1,Math.min(100,Number(el(id).value)+(direction==='Plus'?1:-1)));
        }));
    });
    ['plain','wood','tile','stone'].forEach(key=>el('floor'+key[0].toUpperCase()+key.slice(1)+'Btn').addEventListener('click',()=>setFloorChoice(key)));
    ['table','element'].forEach(prefix=>{
        el(prefix+'AngleRange').addEventListener('input',()=>setEditorAngle(prefix,el(prefix+'AngleRange').value));
        el(prefix+'AngleInput').addEventListener('input',()=>setEditorAngle(prefix,el(prefix+'AngleInput').value));
        el(prefix+'AngleMinus').addEventListener('click',()=>setEditorAngle(prefix,Number(el(prefix+'AngleInput').value)-45));
        el(prefix+'AnglePlus').addEventListener('click',()=>setEditorAngle(prefix,Number(el(prefix+'AngleInput').value)+45));
        el(prefix+'ColorInput').addEventListener('input',()=>setEditorColor(prefix,el(prefix+'ColorInput').value));
        document.querySelectorAll('[data-owner="'+prefix+'"]').forEach(button=>button.addEventListener('click',()=>setEditorColor(prefix,button.getAttribute('data-color'))));
        ['Small','Medium','Large'].forEach((size,index)=>el(prefix+'Size'+size).addEventListener('click',()=>{
            if(prefix==='table'){
                const presets={round:[[90,90],[110,110],[130,130]],square:[[80,80],[90,90],[110,110]],rectangle:[[120,75],[160,85],[200,90]],bench:[[150,70],[190,80],[240,90]]};
                const dimensions=presets[el('tableShapeInput').value][index];el('tableWidthInput').value=dimensions[0];el('tableDepthInput').value=dimensions[1];
            }else{const preset=elementPresets[el('elementTypeInput').value],factor=[0.75,1,1.25][index];el('elementWidthInput').value=Math.round(preset[1]*factor*100);el('elementDepthInput').value=Math.round(preset[2]*factor*100);}
        }));
    });
    document.addEventListener('keydown', event => { if (event.key==='Escape') { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); el('serviceMenu').classList.add('hidden'); el('menuBtn').setAttribute('aria-expanded','false'); } });
    window.addEventListener('beforeunload', event => { if (floorDraft) { event.preventDefault(); event.returnValue=''; } });
});

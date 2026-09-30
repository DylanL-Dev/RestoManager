'use strict';
let floorRoom = 'main';
let floorDraft = null;
let selectedFloorTable = null;
let serviceView = 'plan';
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
afficherTables = function () {
    const grid = el('tablesGrid'); grid.replaceChildren();
    const editing = !!floorDraft;
    grid.classList.toggle('editing', editing); el('editorBar').classList.toggle('hidden', !editing);
    el('floorHint').textContent = editing ? 'Glissez pour déplacer. Touchez pour modifier.' : 'Touchez une table pour ouvrir sa fiche.';
    currentPlan().tables.filter(t => t.roomId === floorRoom).forEach(table => {
        const status = getTableStatus(table.number);
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'table-card ' + status + ' shape-' + table.shape;
        button.style.left = table.x + '%'; button.style.top = table.y + '%';
        const r = reservations.filter(r => r.date === getServiceDate() && r.tables.includes(table.number) && ReservationEngine.isBlocking(r)).sort((a,b) => (b.status === STATUS.SEATED) - (a.status === STATUS.SEATED) || a.time.localeCompare(b.time))[0];
        const client = r ? (r.type === 'hotel' ? 'Ch. ' : '') + r.client : table.capacity + ' places';
        button.innerHTML = '<strong class="table-number">T' + table.number + '</strong><span class="table-capacity">' + escapeHTML(client) + '</span><span class="table-status">' + (r ? r.time + ' · ' + r.guests + ' pers.' : 'Libre') + '</span>';
        button.setAttribute('aria-label', 'Table ' + table.number + ', ' + table.capacity + ' places, ' + (r ? texteStatut(r.status) + ', ' + client : 'libre'));
        let drag = null, moved = false;
        button.addEventListener('pointerdown', event => {
            if (!floorDraft || event.button !== 0) return;
            const rect = grid.getBoundingClientRect(); drag = {x:event.clientX, y:event.clientY, tx:table.x, ty:table.y, rect}; moved = false;
            button.setPointerCapture(event.pointerId);
        });
        button.addEventListener('pointermove', event => {
            if (!drag) return;
            const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
            if (Math.abs(dx) + Math.abs(dy) < 6 && !moved) return;
            moved = true;
            table.x = Math.max(0, Math.min(83, drag.tx + dx / drag.rect.width * 100));
            table.y = Math.max(0, Math.min(83, drag.ty + dy / drag.rect.height * 100));
            button.style.left = table.x + '%'; button.style.top = table.y + '%';
        });
        const finish = () => { drag = null; }; button.addEventListener('pointerup', finish); button.addEventListener('pointercancel', finish);
        button.addEventListener('keydown', event => {
            if (!floorDraft || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            table.x = Math.max(0, Math.min(83, table.x + (event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0)));
            table.y = Math.max(0, Math.min(83, table.y + (event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0)));
            button.style.left=table.x+'%'; button.style.top=table.y+'%';
        });
        button.addEventListener('click', () => {
            if (moved) { moved = false; return; }
            if (editing) openTableEditor(table.id); else cliquerTable(table.number);
        });
        grid.append(button);
    });
    if (!grid.children.length) { const message = document.createElement('p'); message.className = 'floor-empty'; message.textContent = editing ? 'Cette salle est vide. Ajoutez une table.' : 'Aucune table dans cette salle.'; grid.append(message); }
};
function openTableEditor(id) {
    selectedFloorTable = id;
    const table = floorDraft.tables.find(t => t.id === id);
    el('tableEditTitle').textContent = table ? 'Modifier T' + table.number : 'Ajouter une table';
    el('tableNumberInput').value = table ? table.number : Math.max(25, ...floorDraft.tables.map(t => t.number)) + 1;
    el('tableCapacityInput').value = table ? table.capacity : 2;
    el('tableShapeInput').value = table ? table.shape : 'square';
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
            const overlapping = floorDraft.tables.some((a,i) => floorDraft.tables.slice(i+1).some(b => a.roomId===b.roomId && Math.abs(a.x-b.x)<17 && Math.abs(a.y-b.y)<17));
            if (overlapping) throw new Error('Des tables se chevauchent. Écartez-les avant d’enregistrer.');
            FloorPlan.save(floorDraft); floorDraft = null; roomOptions(); refreshUI(); } catch (error) { alert(error.message); }
    });
    el('cancelPlanBtn').addEventListener('click', () => { if (!confirm('Abandonner les modifications du plan ?')) return; floorDraft = null; roomOptions(); refreshUI(); });
    el('resetPlanBtn').addEventListener('click', () => {
        if (!confirm('Réorganiser les positions des tables de cette salle dans le brouillon ?')) return;
        floorDraft.tables.filter(t => t.roomId === floorRoom).forEach((t,i) => { t.x = 3 + (i % 5) * 20; t.y = 3 + (Math.floor(i/5) % 5) * 20; }); afficherTables();
    });
    el('closeTableEditBtn').addEventListener('click', () => el('tableEditModal').classList.add('hidden'));
    el('tableEditForm').addEventListener('submit', event => {
        event.preventDefault(); const number = Number(el('tableNumberInput').value), capacity = Number(el('tableCapacityInput').value);
        const old = floorDraft.tables.find(t => t.id === selectedFloorTable);
        const fail = message => { el('tableEditError').textContent = message; };
        if (!Number.isInteger(number) || number < 1 || !Number.isInteger(capacity) || capacity < 1 || capacity > 100) return fail('Indiquez un numéro et une capacité valides.');
        if (floorDraft.tables.some(t => t.number === number && t.id !== selectedFloorTable)) return fail('Ce numéro existe déjà dans une salle.');
        if (old && old.number !== number && referencedTable(old.number)) return fail('Cette table est liée à des réservations. Son numéro doit être conservé.');
        if (old && capacity < old.capacity && reservations.some(r => ReservationEngine.isBlocking(r) && r.tables.includes(old.number) && r.tables.reduce((sum,n) => sum + (n === old.number ? capacity : floorDraft.tables.find(t => t.number === n)?.capacity || 0),0) < r.guests)) return fail('Cette capacité est insuffisante pour une réservation existante.');
        if (old) Object.assign(old, {number,capacity,shape:el('tableShapeInput').value});
        else {
            const others = floorDraft.tables.filter(t => t.roomId === floorRoom); let spot;
            for (let i=0;i<25;i++) { const x=3+(i%5)*20,y=3+Math.floor(i/5)*20; if (!others.some(t => Math.abs(t.x-x)<17 && Math.abs(t.y-y)<17)) { spot={x,y}; break; } }
            if (!spot) return fail('Déplacez les tables pour libérer une place avant d’en ajouter une.');
            floorDraft.tables.push({id:crypto.randomUUID(),number,capacity,shape:el('tableShapeInput').value,roomId:floorRoom,...spot});
        }
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
        startFloorEdit(); const id=crypto.randomUUID(); floorDraft.rooms.push({id,name}); floorRoom=id; el('roomForm').reset(); roomOptions(); afficherTables();
    });
    el('renameRoomForm').addEventListener('submit', event => { event.preventDefault(); const name=el('renameRoomName').value.trim(); if (!name) return; startFloorEdit(); floorDraft.rooms.find(r => r.id===floorRoom).name=name; roomOptions(); afficherTables(); });
    el('deleteRoomBtn').addEventListener('click', () => {
        if (floorRoom==='main') return alert('La salle principale doit être conservée.');
        if (currentPlan().tables.some(t => t.roomId===floorRoom)) return alert('Retirez les tables de cette salle avant de la supprimer.');
        if (!confirm('Supprimer cette salle dans le brouillon ?')) return;
        startFloorEdit(); floorDraft.rooms=floorDraft.rooms.filter(r => r.id!==floorRoom); floorRoom='main'; roomOptions(); afficherTables();
    });
    document.addEventListener('keydown', event => { if (event.key==='Escape') { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); el('serviceMenu').classList.add('hidden'); el('menuBtn').setAttribute('aria-expanded','false'); } });
    window.addEventListener('beforeunload', event => { if (floorDraft) { event.preventDefault(); event.returnValue=''; } });
});

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ReservationEngine = require('../reservation-engine.js');
const RESERVATIONS = 'restomanager_reservations';
const HISTORY = 'restomanager_history';

function reservation(overrides = {}) {
    return Object.assign({ id: 'past', type: 'exterieur', client: 'Client', date: '2026-09-16',
        time: '19:00', guests: 2, duration: 90, tables: [1], status: 'reserved' }, overrides);
}

function harness(initial = {}) {
    const storage = new Map(Object.entries(initial));
    const failures = new Set();
    const alerts = [];
    const nodes = new Map();
    const ready = [];
    let refreshes = 0;
    function createNode() {
        const classes = new Set();
        const attributes = new Map();
        return { value: '', textContent: '', innerHTML: '', children: [],
            appendChild(child) { this.children.push(child); },
            setAttribute(key, value) { attributes.set(key, value); },
            getAttribute(key) { return attributes.get(key) ?? null; },
            addEventListener() {},
            classList: { add: c => classes.add(c), remove: c => classes.delete(c),
                contains: c => classes.has(c) } };
    }
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, createNode());
        return nodes.get(id);
    };
    const context = {
        ReservationEngine, console: { error() {} }, Date, Set,
        localStorage: {
            getItem: key => storage.has(key) ? storage.get(key) : null,
            setItem(key, value) {
                if (failures.has(key)) throw new Error('QuotaExceededError');
                storage.set(key, value);
            },
            removeItem: key => storage.delete(key),
        },
        document: { addEventListener: (name, callback) => ready.push(callback),
            getElementById: node, createElement: createNode,
            querySelectorAll: () => node('tableSelection').children.filter(child => child.classList.contains('selected')) },
        FloorPlan: {
            get: () => ({ tables: [{ number: 2, roomId: 'terrace' }], rooms: [{ id: 'terrace', name: 'Terrasse' }] }),
            label: number => 'T' + number + (number === 1 ? 'A' : ''),
        },
        alert: message => alerts.push(message), confirm: () => true, prompt: () => '15', setInterval() {},
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('app.js', 'utf8'), context);
    // UI rendering is covered in design-workspace; these checks exercise persistence decisions.
    context.refreshUI = () => refreshes++;
    context.afficherTables = context.afficherReservations = context.mettreAJourCompteurs = () => refreshes++;
    context.configurerEvenements = () => {};
    const run = source => vm.runInContext(source, context);
    const state = () => run('JSON.stringify({reservations, history})');
    return { storage, failures, alerts, node, ready, run, state, refreshes: () => refreshes };
}

const archived = harness({ [RESERVATIONS]: JSON.stringify([reservation()]), [HISTORY]: '[]' });
assert.equal(archived.run("archiveReservationsBefore('2026-09-17')"), true);
assert.equal(archived.run('reservations.length'), 0);
assert.equal(JSON.parse(archived.storage.get(HISTORY))[0].reservations[0].id, 'past');
['reserved', 'confirmed', 'late', 'arrived', 'seated', 'occupied', 'completed', 'cancelled', 'no_show', 'released'].forEach(status => {
    assert.equal(archived.run('texteStatut(' + JSON.stringify(status) + ')').includes('Inconnu'), false);
});

// Labels can include a suffix and a room name without changing reservation identifiers.
const selection = harness();
selection.run('afficherSelectionTables([1,2])');
assert.equal(selection.node('tableSelection').children[0].textContent, 'T1A');
assert.equal(selection.node('tableSelection').children[1].textContent, 'T2 · Terrasse');
assert.equal(selection.run('JSON.stringify(getSelectedTables())'), '[1,2]');

// An absent table must remain associated through startup normalisation and persistence.
const unknown = harness({ [RESERVATIONS]: JSON.stringify([reservation({ tables: [26] })]), [HISTORY]: '[]' });
assert.equal(unknown.run('saveNormalizedData()'), true);
assert.deepEqual(JSON.parse(unknown.storage.get(RESERVATIONS))[0].tables, [26]);

// Neither malformed JSON nor a wrong top-level shape may be replaced by the fallback arrays.
for (const key of [RESERVATIONS, HISTORY]) {
    for (const raw of ['', '{broken', '{}', 'null']) {
        const corrupt = harness({ [RESERVATIONS]: '[]', [HISTORY]: '[]', [key]: raw });
        corrupt.ready[0]();
        assert.equal(corrupt.storage.get(key), raw);
        assert.equal(corrupt.run('saveNormalizedData()'), false);
        assert.equal(corrupt.run('saveData(' + JSON.stringify(key) + ', [])'), false);
        assert.equal(corrupt.storage.get(key), raw);
        assert(corrupt.alerts.some(message => message.includes('illisibles')));
    }
}

// Both archive write failure points leave memory and persisted associations intact.
for (const failingKey of [HISTORY, RESERVATIONS]) {
    const existing = [{ date: '2026-09-15', reservations: [reservation({ id: 'older' })] }];
    const archive = harness({ [RESERVATIONS]: JSON.stringify([reservation()]), [HISTORY]: JSON.stringify(existing) });
    const before = archive.state();
    const beforeStorage = new Map(archive.storage);
    archive.failures.add(failingKey);
    assert.equal(archive.run("archiveReservationsBefore('2026-09-17')"), false);
    assert.equal(archive.state(), before);
    assert.deepEqual(archive.storage, beforeStorage);
    assert.equal(archive.refreshes(), 0);
}

function failingService() {
    const service = harness({ [RESERVATIONS]: JSON.stringify([reservation()]),
        [HISTORY]: JSON.stringify([{ date: '2026-09-15', reservations: [reservation({ id: 'older' })] }]) });
    service.failures.add(RESERVATIONS);
    return service;
}
for (const action of ["supprimerReservationDefinitivement('past')", "changerStatut('past', STATUS.SEATED)",
    "prolongerReservation('past')", 'reinitialiserDonneesTest()', 'cloturerService()']) {
    const service = failingService();
    service.run("getServiceDate = () => '2026-09-16'");
    const before = service.state();
    const beforeStorage = new Map(service.storage);
    service.run(action);
    assert.equal(service.state(), before, action);
    assert.deepEqual(service.storage, beforeStorage, action);
    assert.equal(service.refreshes(), 0, action);
    assert.equal(service.alerts.some(message => message.includes('✅')), false, action);
}

// Failed create/edit keeps the form open, its editing identifier and the original reservation.
for (const editing of [false, true]) {
    const service = failingService();
    const before = service.state();
    const values = { clientType: 'exterieur', clientInfo: 'Changed', reservationDate: '2099-10-17',
        reservationTime: '19:00', guestNumber: '2', reservationDuration: '60' };
    for (const [key, value] of Object.entries(values)) service.node(key).value = value;
    service.run('afficherSelectionTables([1]); editingId = ' + (editing ? "'past'" : 'null'));
    service.run('enregistrerReservation({preventDefault(){}})');
    assert.equal(service.state(), before);
    assert.equal(service.run('editingId'), editing ? 'past' : null);
    assert.equal(service.node('reservationModal').classList.contains('hidden'), false);
    assert.equal(service.alerts.some(message => message.includes('✅')), false);
    assert.equal(service.refreshes(), 0);
}

// Successful edit persists before closing and keeps the service status.
const edited = harness({ [RESERVATIONS]: JSON.stringify([reservation({ status: 'seated' })]), [HISTORY]: '[]' });
for (const [key, value] of Object.entries({ clientType: 'exterieur', clientInfo: 'Changed', reservationDate: '2099-10-17',
    reservationTime: '19:00', guestNumber: '2', reservationDuration: '60' })) edited.node(key).value = value;
edited.run("afficherSelectionTables([1]); editingId = 'past'; enregistrerReservation({preventDefault(){}})");
assert.equal(JSON.parse(edited.storage.get(RESERVATIONS))[0].client, 'Changed');
assert.equal(JSON.parse(edited.storage.get(RESERVATIONS))[0].status, 'seated');
assert(edited.node('reservationModal').classList.contains('hidden'));
assert(edited.alerts.includes('✅ Réservation modifiée.'));

console.log('app-storage: associations, sélection enrichie, données illisibles et échecs de sauvegarde validés');

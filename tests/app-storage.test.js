'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ReservationEngine = require('../reservation-engine.js');
const storage = new Map();
const context = {
    ReservationEngine: ReservationEngine,
    localStorage: {
        getItem: function (key) { return storage.has(key) ? storage.get(key) : null; },
        setItem: function (key, value) { storage.set(key, value); },
    },
    document: { addEventListener: function () {} },
    console: console,
    alert: function () {},
    Date: Date,
    Set: Set,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('app.js', 'utf8'), context);

vm.runInContext("reservations = [ReservationEngine.normalizeReservation({id: 'past', client: '214', date: '2026-09-16', time: '19:00', guests: 2, duration: 90, tables: [1], status: 'reserved'})]; history = [];", context);
assert.equal(vm.runInContext("archiveReservationsBefore('2026-09-17')", context), true);
assert.equal(vm.runInContext('reservations.length', context), 0);
assert.equal(vm.runInContext('history.length', context), 1);
assert.equal(JSON.parse(storage.get('restomanager_history'))[0].reservations[0].id, 'past');
assert.doesNotThrow(function () {
    vm.runInContext("loadData('invalid', [])", context);
});
['reserved', 'confirmed', 'late', 'arrived', 'seated', 'occupied', 'completed', 'cancelled', 'no_show', 'released'].forEach(function (status) {
    assert.equal(vm.runInContext("texteStatut('" + status + "')", context).includes('Inconnu'), false);
});
console.log('app-storage: archivage non destructif et persistance validés');

'use strict';

const assert = require('assert');
const engine = require('../reservation-engine.js');

function reservation(overrides) {
    return Object.assign({
        id: 'base', type: 'hotel', client: '214', date: '2026-09-17', time: '19:00',
        guests: 2, duration: 90, tables: [1], status: engine.STATUS.RESERVED,
    }, overrides || {});
}

const first = reservation();
assert.equal(engine.validate(first, []).valid, true);
assert.equal(engine.validate(reservation({ id: 'edited', client: '215' }), [first], 'base').valid, true);
assert.equal(engine.validate(reservation({ id: 'later', time: '20:30', duration: 60 }), [first]).valid, true);
assert.equal(engine.validate(reservation({ id: 'conflict', time: '20:00' }), [first]).valid, false);
const roomFirst = reservation({ id: 'room-first', client: '600', tables: [9] });
assert.equal(engine.validate(reservation({ id: 'room-overlap', client: '600', time: '19:30', tables: [10] }), [roomFirst]).valid, false);
assert.equal(engine.validate(reservation({ id: 'room-adjacent', client: '600', time: '20:30', duration: 60, tables: [10] }), [roomFirst]).valid, true);
assert.equal(engine.validate(reservation({ id: 'room-cancelled', client: '600', time: '19:30', tables: [10] }), [Object.assign({}, roomFirst, { status: engine.STATUS.CANCELLED })]).valid, true);
assert.equal(engine.validate(reservation({ id: 'room-no-show', client: '600', time: '19:30', tables: [10] }), [Object.assign({}, roomFirst, { status: engine.STATUS.NO_SHOW })]).valid, true);
assert.equal(engine.validate(reservation({ guests: 4, tables: [2, 3] }), []).valid, true);
assert.equal(engine.validate(reservation({ guests: 6, tables: [2, 3, 4] }), []).valid, true);
assert.equal(engine.validate(reservation({ guests: 8, tables: [2, 3, 4, 5] }), []).valid, true);
assert.equal(engine.validate(reservation({ guests: 4, tables: [2] }), []).valid, false);
assert.equal(engine.validate(reservation({ time: '20:30', duration: 90 }), []).valid, false);

const late = engine.transition(first, engine.STATUS.LATE).reservation;
assert.equal(engine.isBlocking(late), true);
const noShow = engine.transition(late, engine.STATUS.NO_SHOW).reservation;
assert.equal(engine.isBlocking(noShow), false);
assert.equal(engine.validate(reservation({ id: 'reuse', time: '19:00' }), [noShow]).valid, true);
const arrived = engine.transition(first, engine.STATUS.ARRIVED).reservation;
const seated = engine.transition(arrived, engine.STATUS.SEATED).reservation;
assert.equal(engine.transition(seated, engine.STATUS.COMPLETED).valid, true);

const following = reservation({ id: 'following', time: '20:45', tables: [1] });
assert.equal(engine.extend(first, 30, [first, following]).valid, false);
assert.equal(engine.extend(first, 15, [first, following]).valid, true);

const migrated = engine.normalizeReservation({ id: 7, client: 'Dupont', date: '2026-09-17', time: '18:00', guests: '2', duration: '90', tables: ['1'], status: 'occupied', note: 'VIP' });
assert.equal(migrated.status, engine.STATUS.SEATED);
assert.equal(migrated.note, 'VIP');
const missingTable = engine.normalizeReservation(reservation({ tables: ['26', 26, 0, -1, 1.5, 'invalid'] }));
assert.deepEqual(missingTable.tables, [26]);
assert.equal(engine.validate(missingTable, []).valid, false);
assert(engine.validate(missingTable, []).errors.some(function (error) { return error.includes('inconnue'); }));
assert.equal(engine.TABLES.includes(13), false);
assert.equal(engine.TABLES.includes(16), false);
assert.equal(engine.TABLES.length, 21);
assert.equal(engine.CAPACITY[25], 10);
Object.values(engine.STATUS).forEach(function (status) {
    assert.notEqual(status, 'unknown');
});

assert.equal(engine.validate(reservation({date:'2026-02-29'}),[]).valid,false,'Date impossible');
assert.equal(engine.validate(reservation({date:'2028-02-29'}),[]).valid,true,'Date bissextile');
assert.equal(engine.validate(reservation({date:'2026-99-99'}),[]).valid,false,'Date invalide');
assert.equal(engine.validate(reservation({guests:1.5}),[]).valid,false,'Couverts entiers');
assert.equal(engine.validate(reservation({duration:-10}),[]).valid,false,'Durée positive');
assert.equal(engine.validate(reservation({duration:1.5}),[]).valid,false,'Durée entière');
assert.equal(engine.validate(reservation({tables:[1,1],guests:3}),[]).valid,false,'Table dupliquée ne double pas sa capacité');
assert.equal(engine.validate(reservation({time:'19:0'}),[]).valid,false,'Format horaire');
const formatMinutes = m => String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
for(let i=0;i<1000;i++){
    const start=16*60+(i%9)*15;
    const existing=reservation({id:'stress-'+i,time:formatMinutes(start)});
    const overlapping=reservation({id:'overlap-'+i,time:formatMinutes(start+15)});
    const adjacent=reservation({id:'adjacent-'+i,time:formatMinutes(start+90)});
    assert.equal(engine.validate(overlapping,[existing]).valid,false,'Chevauchement '+i);
    assert.equal(engine.validate(adjacent,[existing]).valid,true,'Créneau suivant '+i);
}

console.log('reservation-engine: scénarios métier et 1000 cas de concurrence horaire validés');

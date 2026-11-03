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
assert.equal(engine.validate(reservation({ time: '20:30', duration: 90 }), []).valid, true);


const lastOrder = reservation({id:'late-order',client:'702',time:'20:15',duration:90,tables:[22,23],guests:3});
assert.equal(engine.validate(lastOrder,[]).valid,true,'20h15 + 90 minutes autorisé (fin 21h45)');
assert.equal(engine.endMinutes(lastOrder),21*60+45,'Occupation prévue jusqu’à 21h45');
assert.equal(engine.validate(reservation({time:'21:30'}),[]).valid,true,'Dernière commande 21h30 autorisée');
assert.equal(engine.validate(reservation({time:'21:31'}),[]).valid,false,'Nouvelle réservation après 21h30 refusée');
assert.equal(engine.validate(reservation({time:'22:00'}),[]).valid,false,'22h00 refusée');
assert.equal(engine.validate({...lastOrder,id:'late-conflict',client:'703',time:'20:30'},[lastOrder]).valid,false,'Conflit après 21h30 conservé');
assert.equal(engine.validate({...lastOrder,id:'late-adjacent',client:'703',time:'21:45'},[lastOrder]).valid,false,'Créneau après dernière commande refusé');

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


const seatedBefore=reservation({id:'seated-before',client:'602',date:'2026-11-04',time:'19:00',duration:90,tables:[17,18],status:'seated',guests:3});
const nextParty=reservation({id:'next-party',client:'Du Pont',date:'2026-11-04',time:'21:30',duration:90,tables:[17,18],status:'reserved',guests:4});
assert.equal(engine.validate(nextParty,[seatedBefore]).valid,true,'Future slot still valid');
assert.equal(engine.seatingWarnings(nextParty,[seatedBefore]).length,1,'Seated party requires confirmation');
assert.equal(engine.seatingWarnings(nextParty,[seatedBefore])[0].plannedEnd,'20:30','Planned departure');
assert.equal(engine.seatingWarnings(nextParty,[seatedBefore])[0].gapMinutes,60,'Gap minutes');
assert.equal(engine.seatingWarnings(nextParty,[{...seatedBefore,status:'completed'}]).length,0,'Completed releases warning');
assert.equal(engine.seatingWarnings({...nextParty,tables:[22,23]},[seatedBefore]).length,0,'Other tables unaffected');
assert.equal(engine.validate({...nextParty,time:'20:00'},[seatedBefore]).valid,false,'Overlapping seated booking blocked');
assert.equal(engine.seatingWarnings(nextParty,[seatedBefore],seatedBefore.id).length,0,'Self ignored on edit');

const seatedAt=new Date(2026,10,4,19,15).toISOString();
const lateSeated={...seatedBefore,seatedAt};
assert.equal(engine.startMinutes(lateSeated),19*60+15,'Début réel 19h15');
assert.equal(engine.endMinutes(lateSeated),20*60+45,'Fin estimée 20h45');
assert.equal(engine.validate({...nextParty,time:'20:30'},[lateSeated]).valid,false,'Créneau 20h30 bloqué');
assert.equal(engine.seatingWarnings({...nextParty,time:'21:00'},[lateSeated])[0].plannedEnd,'20:45','Avertissement actualisé');
assert.equal(engine.seatingWarnings({...nextParty,time:'21:00'},[lateSeated])[0].gapMinutes,15,'Marge actualisée');
assert.equal(engine.endMinutes({...lateSeated,seatedAt:undefined}),20*60+30,'Anciennes données sans horodatage');

console.log('reservation-engine: scénarios métier et 1000 cas de concurrence horaire validés');

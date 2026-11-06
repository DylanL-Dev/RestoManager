const test = require('node:test');
const assert = require('node:assert/strict');
const {rankedTableChoices} = require('../reservation-engine.js');

const tables = [
    {number: 25, capacity: 10},
    {number: 1, capacity: 4},
    {number: 2, capacity: 2},
    {number: 3, capacity: 2},
    {number: 4, capacity: 2}
];
const groups = [[2,3], [3,4], [2,3,4]];
function first(guests, unavailable = [], allowed = groups) {
    const available = tables.filter(t => !unavailable.includes(t.number));
    return rankedTableChoices(available, allowed, guests)[0]?.numbers;
}

test('une petite table libre suffit pour un ou deux couverts', () => {
    for (const guests of [1,2]) assert.deepEqual(first(guests), [2]);
});
test('à capacité égale, préférer une seule table à une fusion', () => {
    for (const guests of [3,4]) assert.deepEqual(first(guests), [1]);
});
test('garder la table de dix places disponible tant qu’une fusion convient', () => {
    assert.deepEqual(first(3,[1]), [2,3]);
    assert.deepEqual(first(4,[1,2]), [3,4]);
    assert.deepEqual(first(6), [2,3,4]);
    assert.deepEqual(first(3,[1],[]), [25]);
    assert.deepEqual(first(3,[1,3]), [25]);
    assert.equal(first(11), undefined);
});

'use strict';

// Positions are percentages of the usable floor area; table numbers stay global.
const FloorPlan = (() => {
    const key = 'restomanager_floor_plan_v1';
    function defaults() {
        return { version: 1, rooms: [{ id: 'main', name: 'Salle principale' }], tables: ReservationEngine.TABLES.map((number, i) => ({
            id: 'table-' + number, number, roomId: 'main', capacity: ReservationEngine.CAPACITY[number],
            shape: number === 25 ? 'rectangle' : 'square', x: 3 + (i % 5) * 20, y: 3 + Math.floor(i / 5) * 20
        })) };
    }
    function valid(plan) {
        return plan && plan.version === 1 && Array.isArray(plan.rooms) && plan.rooms.some(r => r.id === 'main') &&
            plan.rooms.every(r => typeof r.id === 'string' && typeof r.name === 'string') &&
            new Set(plan.rooms.map(r => r.id)).size === plan.rooms.length && Array.isArray(plan.tables) &&
            new Set(plan.tables.map(t => t.number)).size === plan.tables.length &&
            new Set(plan.tables.map(t => t.id)).size === plan.tables.length && plan.tables.every(t =>
                typeof t.id === 'string' && Number.isInteger(t.number) && t.number > 0 &&
                Number.isInteger(t.capacity) && t.capacity > 0 && plan.rooms.some(r => r.id === t.roomId) &&
                ['square', 'round', 'rectangle'].includes(t.shape) && Number.isFinite(t.x) && Number.isFinite(t.y) &&
                t.x >= 0 && t.x <= 83 && t.y >= 0 && t.y <= 83);
    }
    let plan;
    try { plan = JSON.parse(localStorage.getItem(key)); } catch (_) {}
    if (!valid(plan)) plan = defaults();
    function sync() {
        ReservationEngine.TABLES.splice(0, ReservationEngine.TABLES.length, ...plan.tables.map(t => t.number));
        Object.keys(ReservationEngine.CAPACITY).forEach(k => delete ReservationEngine.CAPACITY[k]);
        plan.tables.forEach(t => { ReservationEngine.CAPACITY[t.number] = t.capacity; });
    }
    sync();
    return { get: () => structuredClone(plan), defaults, valid, save(next) {
        if (!valid(next)) throw new Error('Plan de salle invalide.');
        localStorage.setItem(key, JSON.stringify(next));
        plan = structuredClone(next); sync();
    } };
})();

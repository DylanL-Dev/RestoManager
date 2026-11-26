'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../rm-ux-pack.js'), 'utf8');
const firstEnd = source.indexOf('/* =========================================================\n   v2 — Notifications');
assert.ok(firstEnd > 0, 'UX bootstrap must be testable separately from DOM-only features');

function fixture(rows, loaded = true, reduced = true) {
  const events = new Map(), frames = [], observers = [];
  const node = { children: [], textContent: '2', offsetWidth: 10, classList: { remove(){}, add(){} } };
  const window = {
    RestoNotificationContext: { userId: 'fixture-user', restaurantId: 'fixture-A', role: 'fb_admin' },
    RestoSharedDataLoaded: loaded, RestoSharedReservations: rows,
    addEventListener(name, callback) { events.set(name, callback); }
  };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-11-26T18:15:00Z'])); }
    static now() { return new Date('2026-11-26T18:15:00Z').getTime(); }
  }
  const document = {
    body: {}, querySelector: () => null,
    querySelectorAll: selector => selector.startsWith('.kpi strong') ? [node] : [],
    addEventListener() {}
  };
  vm.runInNewContext(source.slice(0, firstEnd), {
    window, document, Date: FixedDate,
    matchMedia: () => ({ matches: reduced }),
    MutationObserver: class { constructor(cb) { observers.push(cb); } observe() {} },
    requestAnimationFrame: cb => frames.push(cb),
    setInterval() {}, setTimeout() {}, innerHeight: 844
  }, { filename: 'rm-ux-pack.js' });
  return { window, node, events, frames, observers };
}
const row = (status, guests, extras={}) => ({
  date: '2026-11-26', time: '20:00', type: 'exterior', status, guests, ...extras
});

test('UX v11 distinguishes finished, seated and pending reservations', () => {
  const {window} = fixture([
    row('completed', 4, {type:'hotel'}), row('released', 2, {type:'chambre'}),
    row('seated', 3), row('arrived', 5), row('reserved', 6, {time:'18:00'}),
    row('confirmed', 2, {time:'20:30'}), row('cancelled', 20), row('no_show', 4),
    row('seated', 1, {date:'2026-11-25'}),
    row('completed', 8, {date:'2026-11-19'}),
    row('confirmed', 7, {date:'2026-11-27'})
  ]);
  const s = window.RestoUX.stats();
  assert.equal(s.ready, true);
  assert.equal(s.servedToday, 6);
  assert.equal(s.seatedNow, 4);
  assert.equal(s.expectedCovers, 13);
  assert.equal(s.expectedCount, 3);
  assert.equal(s.nextTime, '20:30');
  assert.equal(s.hotelShare, 100);
  assert.equal(s.noShows, 1);
  assert.equal(s.lastWeek, 8);
  assert.equal(s.tomorrowCovers, 7);
  assert.equal(s.days.at(-1).v, 6);
  assert.equal(window.RestoUX.preview, undefined);
});

test('UX v11 does not expose a snapshot before loading or across a tenant switch', () => {
  const {window, events} = fixture([row('completed', 9)], false);
  assert.equal(window.RestoUX.stats().ready, false);
  window.RestoSharedDataLoaded = true;
  events.get('restomanager:supabase-snapshot')();
  assert.equal(window.RestoUX.stats().servedToday, 9);
  window.RestoNotificationContext = {userId:'fixture-user2', restaurantId:'fixture-B', role:'reception'};
  events.get('restomanager:notification-context')();
  assert.equal(window.RestoUX.stats().ready, false);
  assert.equal(window.RestoUX.stats().servedToday, 0);
  window.RestoSharedReservations = [row('completed', 3)];
  events.get('restomanager:supabase-snapshot')();
  assert.equal(window.RestoUX.stats().servedToday, 3);
});

test('UX v11 visual pulse never overwrites a native KPI with interpolated numbers', () => {
  const {node, observers, frames} = fixture([], true, false);
  while (frames.length) frames.shift()(0);
  node.textContent = '9';
  observers[0]([]);
  while (frames.length) frames.shift()(650);
  assert.equal(node.textContent, '9');
});

test('UX v11 recommended cards use a non-geometric entry animation', () => {
  const css = fs.readFileSync(path.join(__dirname, '../rm-ux-pack.css'), 'utf8');
  assert.match(css, /\.walkinTableCard\.rm-card-in\s*\{animation:rm-card-outline/);
  const frames = css.match(/@keyframes rm-card-outline\{([^\n]*)\}/);
  assert.ok(frames);
  assert.doesNotMatch(frames[1], /transform|opacity/);
});

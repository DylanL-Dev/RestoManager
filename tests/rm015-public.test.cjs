'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { webcrypto } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const M = require('../reservation/model.js'), D = require('../reservation/demo.js');
const config = M.venue('a-lepicerie-rouen'), at = Date.parse('2032-11-08T10:00Z');
const draft = { party: 2, date: '2032-11-08', service: 'dinner', time: '19:00' };
const contact = { firstName: 'Camille', lastName: 'Exemple', email: 'camille@example.test', phone: '', notes: '', accepted: true };
function setup(slug = config.slug) { const map = new Map(); let clock = at; return { map, storage: { getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }, now: () => clock, setNow: value => { clock = value; }, slug, crypto: webcrypto }; }
test('RM015 registry is immutable, unknown tenants fail closed and URLs are tenant-specific', () => {
  assert.ok(Object.isFrozen(config.services)); assert.equal(M.venue('__proto__'), null); assert.equal(M.venue('unknown'), null);
  assert.equal(M.publicURL('https://example.test/app/', config.slug), 'https://example.test/app/reservation/?restaurant=a-lepicerie-rouen');
  assert.notEqual(M.publicURL('https://example.test/', config.slug), M.publicURL('https://example.test/', 'le-jardin-demo'));
  assert.throws(() => M.publicURL('javascript:bad', config.slug)); assert.throws(() => D.createAdapter({ slug: 'unknown' }));
});
test('RM015 date and Paris timezone boundaries remain correct around midnight and DST', () => {
  assert.deepEqual(M.paris(new Date('2032-06-01T22:30Z')), { date: '2032-06-02', time: '00:30' });
  assert.equal(M.paris(new Date('2032-03-28T01:30Z')).time, '03:30');
  assert.equal(M.paris(new Date('2032-10-31T01:30Z')).time, '02:30');
  assert.equal(M.addDays('2032-03-27', 1), '2032-03-28'); assert.equal(M.addDays('2032-10-30', 1), '2032-10-31');
  assert.equal(M.validDate('2032-02-30'), false); assert.equal(M.validDate('2032-02-29'), true);
});
test('RM015 demo closures, service, bounds, max party and no fake remaining seats', () => {
  const now = new Date(at), a = d => M.availability(config, { ...draft, ...d }, now);
  assert.equal(a({ date: '2032-11-07' }).state, 'date'); assert.equal(a({ date: '2033-01-08' }).state, 'date');
  assert.equal(a({ date: '2032-11-13', service: 'lunch' }).state, 'closed');
  assert.equal(a({ service: '__proto__' }).state, 'closed'); assert.equal(a({ party: 9 }).state, 'party');
  assert.equal(a({ date: '2032-12-25' }).state, 'closed');
  assert.equal(a({}).slots.find(s => s.time === '19:30').available, false);
  assert.equal(M.availability(config, draft, new Date('2032-11-08T21:00Z')).state, 'full');
  assert.ok(a({}).slots.every(s => Object.keys(s).join() === 'time,available'));
});
test('RM015 real future availability cannot be inferred from the demo contract', () => {
  assert.equal(M.availability(M.venue('le-jardin-demo'), draft, new Date(at)).state, 'closed');
  assert.equal(Object.keys(M.validate(config, draft, contact, new Date(at))).length, 0);
  for (const field of ['firstName', 'lastName', 'email', 'accepted']) assert.ok(M.validate(config, draft, { ...contact, [field]: field === 'accepted' ? false : '' }, new Date(at))[field]);
  assert.ok(M.validate(config, { ...draft, time: '19:30' }, contact, new Date(at)).venue);
  assert.ok(M.validate(config, draft, { ...contact, notes: 'x'.repeat(501) }, new Date(at)).notes);
});
test('RM015 random capabilities, same-click idempotence and refresh recovery are local only', () => {
  const env = setup(), a = D.createAdapter(env), record = a.create(draft, contact);
  assert.match(record.token, /^[a-f0-9]{64}$/); assert.match(record.reference, /^DEMO-/);
  assert.equal(a.create(draft, contact, record.token).reference, record.reference);
  assert.deepEqual(D.createAdapter(env).read(record.token), record);
  assert.notEqual(D.createAdapter(setup()).create(draft, contact).token, record.token);
  assert.equal(env.map.size, 1);
});
test('RM015 foreign tenant, foreign session, malformed and unknown links reveal no record', () => {
  const env = setup(), record = D.createAdapter(env).create(draft, contact);
  for (const [adapter, token] of [[D.createAdapter({ ...env, slug: 'le-jardin-demo' }), record.token], [D.createAdapter(setup()), record.token], [D.createAdapter(env), 'bad'], [D.createAdapter(env), 'a'.repeat(64)]]) assert.throws(() => adapter.read(token), { code: 'not_found' });
});
test('RM015 expiration refuses consultation and mutation, removes expired session record', () => {
  const env = setup(), a = D.createAdapter(env), record = a.create(draft, contact);
  env.setNow(at + D.TTL); assert.throws(() => a.read(record.token), { code: 'expired' }); assert.equal(env.map.size, 0);
  assert.throws(() => a.update(record.token, draft, contact, 1), { code: 'not_found' });
});
test('RM015 stale edits rejected, cancellation idempotent, cancelled record cannot be edited', () => {
  const a = D.createAdapter(setup()), r = a.create(draft, contact);
  const updated = a.update(r.token, { ...draft, party: 3 }, contact, 1); assert.equal(updated.draft.party, 3);
  assert.throws(() => a.update(r.token, draft, contact, 1), { code: 'conflict' });
  const cancelled = a.cancel(r.token, 2); assert.equal(cancelled.status, 'cancelled'); assert.deepEqual(a.cancel(r.token, 2), cancelled);
  assert.throws(() => a.update(r.token, draft, contact, 3), { code: 'cancelled' });
});
test('RM015 denied storage permits memory-only exercise and reset removes only its own tenant key', () => {
  const env = setup(), storage = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
  const a = D.createAdapter({ ...env, storage }), r = a.create(draft, contact); assert.equal(a.durable(), false); assert.equal(a.read(r.token).reference, r.reference);
  a.clear(); assert.throws(() => a.read(r.token), { code: 'not_found' });
  env.map.set('existing-staff-storage', 'preserve'); const b = D.createAdapter(env); b.create(draft, contact); b.clear(); assert.equal(env.map.get('existing-staff-storage'), 'preserve');
});
test('RM015 malformed stored record is refused instead of rendered', () => {
  const env = setup(), r = D.createAdapter(env).create(draft, contact);
  env.map.set('rm0151:demo:' + config.slug, JSON.stringify({ ...r, draft: { ...r.draft, party: '<img src=x onerror=alert(1)>' } }));
  assert.throws(() => D.createAdapter(env).read(r.token), { code: 'not_found' });
});
test('RM015 public entry imports no employee modules, endpoint, secret or service worker', () => {
  const root = path.resolve(__dirname, '../reservation'), files = fs.readdirSync(root);
  const all = files.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  const forbidden = /(?:supabase\.co|service_role|sb_secret_|eyJhbGci|\.rpc\(|fetch\(|XMLHttpRequest|WebSocket|serviceWorker\.register|v3-connected|creator\.html|booking-draft\.js)/;
  assert.equal(all.match(forbidden)?.[0], undefined, 'Public source has no API, credential or employee import');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /connect-src 'none'/); assert.match(html, /form-action 'none'/); assert.match(html, /no-referrer/);
});
test('RM015 isolated publish artifact contains exactly eight public static files', () => {
  const root = path.resolve(__dirname, '..'), result = spawnSync(process.execPath, ['scripts/build-public-demo.cjs'], { cwd: root });
  assert.equal(result.status, 0, result.stderr.toString());
  const files = fs.readdirSync(path.join(root, 'dist/public-demo'), { recursive: true }).filter(f => fs.statSync(path.join(root, 'dist/public-demo', f)).isFile());
  assert.deepEqual(files.sort(), ['lucide-local.js', 'pwa-icon.svg', 'reservation/demo.js', 'reservation/dining.svg', 'reservation/index.html', 'reservation/model.js', 'reservation/portal.css', 'reservation/portal.js'].sort());
});

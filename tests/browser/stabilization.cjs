'use strict';

// Run from the repository with the HTTP server running: node tests/browser/stabilization.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; playwright = require('/tmp/restomanager-browser/node_modules/playwright'); }
const { chromium } = playwright;
const origin = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:8000';
const artifacts = process.env.BROWSER_ARTIFACTS || '/tmp/restomanager-artifacts';
const planKey = 'restomanager_floor_plan_v1', reservationKey = 'restomanager_reservations', historyKey = 'restomanager_history';
const catalogue = ['bar', 'wall', 'door', 'window', 'pillar', 'plant', 'kitchen', 'toilets', 'zone', 'chair', 'armchair', 'bench', 'partition', 'lamp', 'counter'];
const profiles = { desktop: { viewport: { width: 1440, height: 1000 } }, tablet: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true },
    phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, narrow: { viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true } };
const cases = [], results = [];
const test = (name, run, options = {}) => cases.push({ name, run, ...options });
const near = (actual, expected, tolerance = 1e-6) => assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
const median = values => { const sorted = values.slice().sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? null; };
function table(id, number, x, y, extra = {}) { return { id, number, x, y, roomId: 'main', width: 1.2, depth: 1.2,
    angle: 0, shape: 'square', capacity: 4, capacityMin: 2, color: '#28734f', letter: '', ...extra }; }
function fixture() {
    return { plan: { version: 4, rooms: [{ id: 'main', name: 'Salle principale', width: 12, depth: 10, floor: 'wood' },
        { id: 'terrace', name: 'Terrasse', width: 12, depth: 8, floor: 'tile' }], elements: [],
    tables: [table('t1', 1, 3, 3, { shape: 'rectangle', width: 1.6, depth: 0.8 }), table('t2', 2, 7, 3),
        table('t26', 26, 3, 6, { letter: 'A' }), table('t27', 27, 6, 4, { roomId: 'terrace', letter: 'B' })] },
    reservations: [{ id: 'existing-reservation', type: 'exterieur', client: 'Client existant', date: '2099-10-17',
        time: '19:00', guests: 4, duration: 90, tables: [26, 27], status: 'reserved', note: 'À préserver' }],
    history: [{ date: '2026-01-01', reservations: [{ id: 'historic-reservation', type: 'hotel', client: '214', date: '2026-01-01',
        time: '19:00', guests: 2, duration: 90, tables: [26], status: 'completed' }] }] };
}
function emptyFixture() { const seed = fixture(); seed.plan.tables = []; seed.reservations = []; seed.history = []; return seed; }
function hundredFixture() {
    const seed = emptyFixture(); seed.plan.rooms[0].width = 30; seed.plan.rooms[0].depth = 30;
    seed.plan.tables = Array.from({ length: 100 }, (_, index) => table('perf-' + index, index + 1,
        1.5 + index % 10 * 2.7, 1.5 + Math.floor(index / 10) * 2.7, { width: 0.8, depth: 0.8 }));
    return seed;
}
const model = page => page.evaluate(() => structuredClone(currentPlan()));
const stored = page => page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [planKey, reservationKey, historyKey]);
async function startEdit(page) {
    await page.locator('#menuBtn').click(); await page.locator('#adminBtn').click(); await page.locator('#editPlanBtn').click();
    await page.waitForFunction(() => floorDraft !== null);
}
async function select(page, id) { await page.locator(`[data-floor-id="${id}"]`).click(); }
async function noSnap(page) { if (await page.locator('#snapFloorBtn').getAttribute('aria-pressed') === 'true') await page.locator('#snapFloorBtn').click(); }
async function point(page, x, y) { return page.evaluate(({ x, y }) => {
    const rect = document.getElementById('tablesGrid').getBoundingClientRect(), room = currentPlan().rooms.find(value => value.id === floorRoom);
    return { x: rect.left + x / room.width * rect.width, y: rect.top + y / room.depth * rect.height };
}, { x, y }); }
async function drag(page, from, to, steps = 12) {
    await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps }); await page.mouse.up();
}
async function frame(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve))); }
async function noOverflow(page) {
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    assert(dimensions.scroll <= dimensions.client + 1, 'Débordement horizontal document : ' + JSON.stringify(dimensions));
}
function touchPoints(points) { return points.map((value, index) => ({ ...value, id: index + 1, radiusX: 3, radiusY: 3, force: 1 })); }

test('catalogue-fifteen-types-support-selection-move-rotate-resize-delete', async ({ page }) => {
    await startEdit(page); await noSnap(page);
    await page.locator('#addElementBtn').click();
    assert.deepEqual((await page.locator('#elementTypeInput option').evaluateAll(nodes => nodes.map(node => node.value))).sort(), catalogue.slice().sort());
    await page.locator('#closeElementBtn').click();
    for (const type of catalogue) {
        await page.locator('#addElementBtn').click(); await page.locator('#elementTypeInput').selectOption(type);
        await page.locator('#elementForm button[type="submit"]').click();
        let element = (await model(page)).elements[0]; assert(element && element.type === type, 'Ajout ' + type);
        await select(page, element.id);
        assert.deepEqual(await page.evaluate(() => FloorEditor.selectedItems().map(value => value.id)), [element.id]);
        await page.keyboard.press('ArrowRight');
        let changed = (await model(page)).elements[0]; near(changed.x, element.x + 0.1); near(changed.y, element.y);
        await page.locator('#rotate45Btn').click(); changed = (await model(page)).elements[0]; near(changed.angle, 45);
        const handle = page.locator('[data-transform="resize"][data-corner="se"]'); await handle.scrollIntoViewIfNeeded();
        const box = await handle.boundingBox(); assert(box, 'Poignée ' + type);
        await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, { x: box.x + box.width / 2 + 14, y: box.y + box.height / 2 + 14 });
        const resized = (await model(page)).elements[0]; assert(resized.width > element.width || resized.depth > element.depth, 'Redimensionnement ' + type);
        await page.locator('#deleteFloorBtn').click(); assert.equal((await model(page)).elements.length, 0, 'Suppression ' + type);
    }
}, { seed: emptyFixture });

test('quick-inspector-commits-one-operation-and-rejects-invalid-limits', async ({ page }) => {
    assert.equal(await page.locator('#floorInspector').isVisible(), false);
    await startEdit(page); await select(page, 't1'); assert(await page.locator('#floorInspector').isVisible());
    const before = (await model(page)).tables.find(value => value.id === 't1');
    const values = { quickX: '4.2', quickY: '3.4', quickWidth: '1.4', quickDepth: '0.9', quickAngle: '37.5', quickColor: '#28536d' };
    for (const [id, value] of Object.entries(values)) {
        if (id === 'quickColor') {
            // Native colour pickers are outside the page DOM; emulate their input.
            await page.locator('#' + id).evaluate((node, color) => { node.value = color; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); }, value);
        } else await page.locator('#' + id).fill(value);
    }
    await page.locator('#quickPropertiesForm button[type="submit"]').click();
    const changed = (await model(page)).tables.find(value => value.id === 't1');
    near(changed.x, 4.2); near(changed.y, 3.4); near(changed.width, 1.4); near(changed.depth, 0.9); near(changed.angle, 37.5); assert.equal(changed.color, '#28536d');
    await page.locator('#undoFloorBtn').click(); assert.deepEqual((await model(page)).tables.find(value => value.id === 't1'), before);
    await page.locator('#redoFloorBtn').click(); assert.deepEqual((await model(page)).tables.find(value => value.id === 't1'), changed);
    await page.locator('#quickX').fill('-3'); await page.locator('#quickPropertiesForm button[type="submit"]').click();
    assert((await page.locator('#quickPropertiesError').textContent()).trim().length > 0);
    assert.deepEqual((await model(page)).tables.find(value => value.id === 't1'), changed);
    await page.locator('#quickDetailsBtn').click(); assert(await page.locator('#tableEditModal').isVisible());
    near(Number(await page.locator('#tableWidthInput').inputValue()), changed.width * 100); near(Number(await page.locator('#tableAngleInput').inputValue()), changed.angle);
    await page.locator('#closeTableEditBtn').click(); await page.locator('#cancelPlanBtn').click();
    assert.equal(await page.locator('#floorInspector').isVisible(), false);
});

test('automatic-room-fitting-previews-margin-and-applies-without-moving-content', async ({ page }) => {
    await startEdit(page); const before = await model(page); await page.locator('#roomDimensionsBtn').click();
    await page.locator('#roomMarginInput').fill('1.2'); await page.locator('#fitRoomBtn').click();
    near(Number(await page.locator('#roomWidthInput').inputValue()), 8.8, 0.01); near(Number(await page.locator('#roomDepthInput').inputValue()), 7.8, 0.01);
    assert.deepEqual(await model(page), before, 'Le calcul des dimensions reste une prévisualisation');
    await page.locator('#roomDimensionsForm button[type="submit"]').click();
    const fitted = await model(page); near(fitted.rooms[0].width, 8.8, 0.01); near(fitted.rooms[0].depth, 7.8, 0.01); assert.deepEqual(fitted.tables, before.tables);
    await page.locator('#undoFloorBtn').click(); assert.deepEqual(await model(page), before);
});

for (const profile of Object.keys(profiles)) {
    test(`responsive-${profile}-service-controls-inspector-and-modal`, async ({ page }) => {
        await noOverflow(page);
        assert.equal(await page.locator('#editorBar').isVisible(), false); assert.equal(await page.locator('#floorInspector').isVisible(), false);
        assert.equal(await page.locator('.editor-handle').count(), 0);
        await startEdit(page); await select(page, 't1'); await noOverflow(page);
        assert(await page.locator('#floorInspector').isVisible());
        for (const id of ['menuBtn', 'rotate45Btn', 'propertiesFloorBtn']) {
            const box = await page.locator('#' + id).boundingBox(); assert(box && box.height >= 43, 'Commande tactile accessible ' + id);
        }
        await page.locator('#propertiesFloorBtn').click(); const box = await page.locator('#tableEditModal .modal-content').boundingBox();
        const height = await page.evaluate(() => innerHeight); assert(box && box.y >= -1 && box.y + box.height <= height + 1, 'Formulaire contenu dans la hauteur disponible');
        if (profile === 'phone' || profile === 'narrow') near(box.y + box.height, height, 2);
        await noOverflow(page); await page.locator('#closeTableEditBtn').click(); await page.locator('#cancelPlanBtn').click(); await noOverflow(page);
    }, { profile });
}

for (const profile of ['phone', 'tablet']) {
    test(`touch-${profile}-two-finger-pan-with-constant-distance`, async ({ page, diagnostics }) => {
        await startEdit(page); await page.evaluate(() => FloorZoom.setScale(2)); await page.locator('#floorViewport').scrollIntoViewIfNeeded();
        const before = await model(page);
        const scroll = await page.evaluate(() => { const node = document.getElementById('floorViewport'); node.scrollLeft = 140; node.scrollTop = 140; return [node.scrollLeft, node.scrollTop]; });
        assert(scroll[0] >= 50 && scroll[1] >= 50);
        const box = await page.locator('#floorViewport').boundingBox(), x = box.x + box.width / 2, y = box.y + Math.min(100, box.height / 2);
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoints([{ x: x - 45, y }, { x: x + 45, y }]) });
        for (let index = 1; index <= 10; index++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
            touchPoints: touchPoints([{ x: x - 45 + index * 6, y: y + index * 4 }, { x: x + 45 + index * 6, y: y + index * 4 }]) });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); await frame(page);
        const after = await page.evaluate(() => { const node = document.getElementById('floorViewport'); return { scroll: [node.scrollLeft, node.scrollTop], scale: FloorZoom.getScale() }; });
        near(after.scale, 2, 0.01); assert(Math.abs(after.scroll[0] - scroll[0]) > 30 && Math.abs(after.scroll[1] - scroll[1]) > 20, 'Translation pure de la vue');
        assert.deepEqual(await model(page), before); diagnostics.pan = { before: scroll, after };
    }, { profile, seed: emptyFixture });
}

test('touch-second-finger-cancels-object-drag-without-history-entry', async ({ page }) => {
    await startEdit(page); await noSnap(page); await select(page, 't1'); await page.locator('[data-floor-id="t1"]').scrollIntoViewIfNeeded();
    const before = await model(page), start = await point(page, 3, 3), cdp = await page.context().newCDPSession(page);
    assert(await page.locator('#undoFloorBtn').isDisabled());
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoints([start]) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoints([{ x: start.x + 24, y: start.y + 12 }]) });
    await frame(page); assert.notDeepEqual(await model(page), before, 'Le premier doigt avait commencé à déplacer l’objet');
    const second = [{ x: start.x + 24, y: start.y + 12 }, { x: start.x + 80, y: start.y + 12 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoints(second) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); await frame(page);
    assert.deepEqual(await model(page), before); assert(await page.locator('#undoFloorBtn').isDisabled());
    assert.deepEqual(await page.evaluate(() => FloorEditor.selectedItems().map(value => value.id)), ['t1']);
}, { profile: 'phone' });

test('reservation-created-through-form-survives-reload-and-plan-edit', async ({ page }) => {
    const initial = await stored(page); await page.locator('#newReservationBtn').click();
    await page.locator('#clientType').selectOption('exterieur'); await page.locator('#clientInfo').fill('Nouvelle réservation mission 3');
    await page.locator('#reservationDate').fill('2099-10-18'); await page.locator('#reservationTime').fill('19:00');
    await page.locator('#guestNumber').fill('4'); await page.locator('#reservationDuration').selectOption('60');
    await page.locator('[data-table-number="26"]').click(); await page.locator('[data-table-number="27"]').click();
    await page.locator('#reservationForm button[type="submit"]').click(); await page.locator('#reservationModal').waitFor({ state: 'hidden' });
    const persisted = await stored(page), bookings = JSON.parse(persisted[1]); assert.equal(bookings.length, 2);
    const created = bookings.find(value => value.client === 'Nouvelle réservation mission 3'); assert(created); assert.deepEqual(created.tables, [26, 27]);
    assert.deepEqual(bookings.find(value => value.id === 'existing-reservation'), JSON.parse(initial[1])[0]); assert.equal(persisted[2], initial[2]);
    await page.reload(); assert.equal((await stored(page))[1], persisted[1]);
    await startEdit(page); await select(page, 't1'); await page.locator('#rotate45Btn').click(); await page.locator('#savePlanBtn').click();
    await page.reload(); const after = await stored(page); assert.equal(after[1], persisted[1]); assert.equal(after[2], initial[2]);
    await startEdit(page); await select(page, 't26'); await page.locator('#propertiesFloorBtn').click(); await page.locator('#deleteTableBtn').click();
    assert.match(await page.locator('#tableEditError').textContent(), /liée/); assert((await model(page)).tables.some(value => value.number === 26));
});

test('hundred-object-2d-render-and-drag-diagnostics', async ({ page, diagnostics }) => {
    await startEdit(page); await noSnap(page);
    const samples = await page.evaluate(async () => {
        const durations = [];
        for (let index = 0; index < 6; index++) { const started = performance.now(); afficherTables(); durations.push(performance.now() - started); await new Promise(resolve => requestAnimationFrame(resolve)); }
        return durations;
    });
    assert.equal(await page.locator('[data-floor-id]').count(), 100);
    diagnostics.renderCpuMs = { samples, median: median(samples), max: Math.max(...samples), note: 'Coût CPU de reconstruction DOM ; aucune assertion FPS ni seuil CI.' };
    await page.evaluate(() => FloorZoom.setScale(1)); // Keep transform handles clear of the item's drag target.
    await select(page, 'perf-0'); await page.locator('[data-floor-id="perf-0"]').scrollIntoViewIfNeeded();
    const from = await point(page, 1.5, 1.5), to = await point(page, 1.8, 1.7);
    await page.evaluate(() => { window.__floorDiagnosticFrames = []; window.__floorDiagnosticActive = true;
        const tick = time => { window.__floorDiagnosticFrames.push(time); if (window.__floorDiagnosticActive) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    await drag(page, from, to, 30); await page.waitForTimeout(80);
    const timestamps = await page.evaluate(() => { window.__floorDiagnosticActive = false; return window.__floorDiagnosticFrames; });
    const intervals = timestamps.slice(1).map((time, index) => time - timestamps[index]);
    diagnostics.dragAnimationFrameMs = { samples: intervals, median: median(intervals), max: intervals.length ? Math.max(...intervals) : null,
        note: 'Profil Chromium émulé ; une mesure physique PC/téléphone reste nécessaire.' };
    const moved = (await model(page)).tables.find(value => value.id === 'perf-0'); assert(moved.x > 1.5 && moved.y > 1.5);
}, { seed: hundredFixture });

async function main() {
    fs.mkdirSync(artifacts, { recursive: true });
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
        for (const spec of cases.filter(value => value.name.includes(process.env.BROWSER_CASE || ''))) {
            const started = Date.now(), errors = [], diagnostics = {}, dialogs = [], seed = (spec.seed || fixture)();
            const context = await browser.newContext(profiles[spec.profile || 'desktop']);
            await context.addInitScript(({ seed, planKey, reservationKey, historyKey }) => {
                if (sessionStorage.getItem('restomanager-stabilization-fixture')) return;
                localStorage.clear(); localStorage.setItem(planKey, JSON.stringify(seed.plan)); localStorage.setItem(reservationKey, JSON.stringify(seed.reservations)); localStorage.setItem(historyKey, JSON.stringify(seed.history));
                sessionStorage.setItem('restomanager-stabilization-fixture', '1');
            }, { seed, planKey, reservationKey, historyKey });
            const page = await context.newPage(); page.setDefaultTimeout(10000);
            page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
            page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
            await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
            try {
                await page.goto(origin, { waitUntil: 'networkidle' }); await page.waitForFunction(() => typeof FloorEditor !== 'undefined');
                await spec.run({ page, seed, diagnostics }); assert.deepEqual(errors, [], 'Aucune erreur JavaScript inattendue');
                results.push({ name: spec.name, status: 'passed', durationMs: Date.now() - started, diagnostics }); console.log('PASS ' + spec.name);
            } catch (error) {
                await page.screenshot({ path: path.join(artifacts, spec.name + '-failure.png'), fullPage: true }).catch(() => {});
                results.push({ name: spec.name, status: 'failed', durationMs: Date.now() - started, error: error.stack, errors, dialogs, diagnostics }); console.error('FAIL ' + spec.name + ': ' + error.message);
            } finally { await context.close(); }
        }
    } finally { await browser.close(); }
    fs.writeFileSync(path.join(artifacts, 'browser-stabilization-results.json'), JSON.stringify(results, null, 2));
    console.log(`${results.filter(value => value.status === 'passed').length}/${results.length} scénarios de stabilisation réussis ; artefacts : ${artifacts}`);
    if (!results.length || results.some(value => value.status === 'failed')) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });

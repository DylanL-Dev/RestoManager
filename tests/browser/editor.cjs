'use strict';

// Run: node tests/browser/editor.cjs (HTTP server at :8000).
// Playwright/Chromium can be supplied externally;
// this script deliberately does not change the application's dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = (()=>{if(process.env.PLAYWRIGHT_MODULE)return require(process.env.PLAYWRIGHT_MODULE);try{return require('playwright');}catch(_){return require('/tmp/restomanager-browser/node_modules/playwright');}})();
const origin = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:8000';
const artifacts = process.env.BROWSER_ARTIFACTS || '/tmp/restomanager-artifacts';
const planKey = 'restomanager_floor_plan_v1';
const reservationKey = 'restomanager_reservations';
const historyKey = 'restomanager_history';
const cases = [];
const results = [];
const baselineOnly = process.argv.includes('--baseline');
const filter = process.env.BROWSER_CASE || '';
const near = (actual, expected, tolerance = 1e-7) => assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);

function table(id, number, x, y, overrides = {}) {
    return { id, number, x, y, roomId: 'main', width: 1.2, depth: 1.2, angle: 0,
        shape: 'square', capacity: 4, capacityMin: 2, color: '#8a5a29', letter: '', ...overrides };
}
function fixture() {
    return {
        plan: { version: 4, rooms: [{ id: 'main', name: 'Salle principale', width: 12, depth: 10, floor: 'wood' },
            { id: 'terrace', name: 'Terrasse', width: 12, depth: 8, floor: 'tile' }], elements: [],
        tables: [table('t1', 1, 3, 3, { shape: 'rectangle', width: 1.6, depth: 0.8 }),
            table('t2', 2, 6, 3), table('t26', 26, 3, 6, { letter: 'A' }),
            table('t27', 27, 6, 4, { roomId: 'terrace', letter: 'B' })] },
        reservations: [{ id: 'preserve-reservation', type: 'exterieur', client: 'Client conservé', date: '2099-10-17',
            time: '19:00', guests: 4, duration: 90, tables: [26, 27], status: 'reserved', note: 'Métadonnée conservée' }],
        history: [{ date: '2026-01-01', reservations: [{ id: 'historic-reservation', type: 'hotel', client: '214',
            date: '2026-01-01', time: '19:00', guests: 2, duration: 90, tables: [26], status: 'completed' }] }],
    };
}
function emptyFixture() { const value = fixture(); value.plan.tables = []; value.reservations = []; value.history = []; return value; }
function test(name, run, options = {}) { cases.push({ name, run, ...options }); }
async function state(page) { return page.evaluate(() => structuredClone(floorDraft || FloorPlan.get())); }
async function item(page, id) { return (await state(page)).tables.concat((await state(page)).elements).find(value => value.id === id); }
async function selectedIds(page) { return page.evaluate(() => FloorEditor.selectedItems().map(value => value.id).sort()); }
async function startEdit(page) {
    await page.locator('#menuBtn').click();
    await page.locator('#adminBtn').click();
    await page.locator('#editPlanBtn').click();
    await page.waitForFunction(() => floorDraft !== null);
}
async function select(page, id, modifiers) { await page.locator(`[data-floor-id="${id}"]`).click({ modifiers }); }
async function noSnap(page) {
    if (await page.locator('#snapFloorBtn').getAttribute('aria-pressed') === 'true') await page.locator('#snapFloorBtn').click();
}
async function point(page, x, y) {
    return page.evaluate(({ x, y }) => {
        const rect = document.getElementById('tablesGrid').getBoundingClientRect();
        const room = currentPlan().rooms.find(value => value.id === floorRoom);
        return { x: rect.left + x / room.width * rect.width, y: rect.top + y / room.depth * rect.height };
    }, { x, y });
}
async function mouseDrag(page, start, end, beforeRelease) {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    if (beforeRelease) await beforeRelease();
    await page.mouse.up();
}
async function dragItem(page, id, dx, dy) {
    const current = await item(page, id);
    await mouseDrag(page, await point(page, current.x, current.y), await point(page, current.x + dx, current.y + dy));
}
async function handleDrag(page, selector, dx, dy) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    const box = await page.locator(selector).boundingBox();
    assert(box, 'Poignée visible : ' + selector);
    await mouseDrag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy });
}
async function rawReservations(page) {
    return page.evaluate(({ reservationKey, historyKey }) => [localStorage.getItem(reservationKey), localStorage.getItem(historyKey)], { reservationKey, historyKey });
}
async function touchGesture(page, frames) {
    const cdp = await page.context().newCDPSession(page);
    const touchPoints = frame => frame.map((value, index) => ({ ...value, id: index + 1, radiusX: 3, radiusY: 3, force: 1 }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoints(frames[0]) });
    for (const frame of frames.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoints(frame) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(80); // Allow the browser's touch/pointer dispatch to settle.
}

test('migration-v3-save-reload-preserves-centres-ids-reservations', async ({ page, seed }) => {
    const loaded = await state(page);
    assert.equal(loaded.version, 4);
    assert.deepEqual(loaded.tables.map(value => [value.id, value.number]), seed.expected.tables.map(value => [value.id, value.number]));
    for (const current of loaded.tables) {
        const expected = seed.expected.tables.find(value => value.id === current.id);
        near(current.x, expected.x); near(current.y, expected.y);
    }
    const originalRaw = JSON.stringify(seed.plan);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), planKey), originalRaw);
    const reservations = await rawReservations(page);
    await startEdit(page);
    await page.locator('#savePlanBtn').click();
    assert.equal(await page.evaluate(key => localStorage.getItem(key + '_backup_before_v4'), planKey), originalRaw);
    await page.reload();
    assert.deepEqual(await state(page), loaded);
    assert.deepEqual(await rawReservations(page), reservations);
}, { baseline: true, seed: () => {
    const value = fixture(); value.expected = structuredClone(value.plan); value.plan.version = 3;
    for (const current of value.plan.tables) {
        const room = value.plan.rooms.find(room => room.id === current.roomId), angle = current.angle * Math.PI / 180;
        const width = current.width * Math.abs(Math.cos(angle)) + current.depth * Math.abs(Math.sin(angle));
        const depth = current.width * Math.abs(Math.sin(angle)) + current.depth * Math.abs(Math.cos(angle));
        current.x = (current.x - width / 2) / room.width * 100; current.y = (current.y - depth / 2) / room.depth * 100;
    }
    return value;
} });

test('invalid-plan-remains-stored-and-editing-is-blocked', async ({ page, seed }) => {
    const original = JSON.stringify(seed.plan);
    assert(await page.locator('#floorLoadNotice').isVisible());
    await page.locator('#menuBtn').click(); await page.locator('#adminBtn').click(); await page.locator('#editPlanBtn').click();
    assert.equal(await page.evaluate(() => floorDraft), null);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), planKey), original);
    assert.deepEqual((await page.evaluate(() => reservations))[0].tables, [26, 27]);
}, { baseline: true, seed: () => { const value = fixture(); value.plan.tables[0].x = -100; return value; } });

test('reservation-selection-uses-stable-numbers-with-suffix-and-room', async ({ page }) => {
    await page.locator('#newReservationBtn').click();
    await page.locator('[data-table-number="26"]').click();
    await page.locator('[data-table-number="27"]').click();
    assert.deepEqual(await page.evaluate(() => getSelectedTables()), [26, 27]);
}, { baseline: true });

test('repeated-right-angle-rotations-keep-centre-and-size', async ({ page }) => {
    await startEdit(page); await select(page, 't1');
    const before = await item(page, 't1');
    for (let index = 0; index < 8; index++) await page.locator('#rotate90Btn').click();
    assert.deepEqual(await item(page, 't1'), before);
    await page.screenshot({ path: path.join(artifacts, 'desktop-editor.png'), fullPage: true });
});

test('free-handle-rotation-and-drag-after-rotation', async ({ page }) => {
    await startEdit(page); await noSnap(page); await select(page, 't1');
    const before = await item(page, 't1');
    const centre = await point(page, before.x, before.y);
    const handle = await page.locator('[data-transform="rotate"]').boundingBox();
    assert(handle, 'Poignée de rotation présente');
    const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
    const dx = start.x - centre.x, dy = start.y - centre.y, angle = 37 * Math.PI / 180;
    await mouseDrag(page, start, { x: centre.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: centre.y + dx * Math.sin(angle) + dy * Math.cos(angle) });
    const rotated = await item(page, 't1');
    assert(rotated.angle > 25 && rotated.angle < 50, 'Angle libre proche de 37° : ' + rotated.angle);
    near(rotated.x, before.x); near(rotated.y, before.y); near(rotated.width, before.width); near(rotated.depth, before.depth);
    await dragItem(page, 't1', 0.6, 0.4);
    const moved = await item(page, 't1');
    near(moved.x, before.x + 0.6, 0.05); near(moved.y, before.y + 0.4, 0.05); near(moved.angle, rotated.angle);
    assert(await page.evaluate(() => FloorPlan.inside(floorDraft, floorDraft.tables.find(value => value.id === 't1'))));
});

test('resize-rotated-rectangle-with-visible-handle', async ({ page }) => {
    await startEdit(page); await noSnap(page); await select(page, 't1'); await page.locator('#rotate45Btn').click();
    const before = await item(page, 't1');
    await handleDrag(page, '[data-transform="resize"][data-corner="se"]', 38, 38);
    const after = await item(page, 't1');
    assert(after.width > before.width + 0.2 || after.depth > before.depth + 0.2);
    near(after.angle, 45);
    assert(await page.evaluate(() => FloorPlan.inside(floorDraft, floorDraft.tables.find(value => value.id === 't1'))));
});

test('properties-preserve-free-geometry-without-rounding', async ({ page }) => {
    await startEdit(page);
    await page.evaluate(() => { Object.assign(floorDraft.tables[0], { width: 1.234567, depth: 0.987654, angle: 37.12345 }); afficherTables(); });
    const before = await item(page, 't1');
    await select(page, 't1'); await page.locator('#propertiesFloorBtn').click();
    await page.locator('#tableEditForm button[type="submit"]').click();
    assert.deepEqual(await item(page, 't1'), before);
});

test('desktop-marquee-group-move-rotate-resize-duplicate-delete', async ({ page }) => {
    await startEdit(page); await noSnap(page);
    const first = await page.locator('[data-floor-id="t1"]').boundingBox(), second = await page.locator('[data-floor-id="t2"]').boundingBox();
    await mouseDrag(page, { x: first.x - 15, y: Math.min(first.y, second.y) - 15 },
        { x: second.x + second.width + 15, y: Math.max(first.y + first.height, second.y + second.height) + 15 });
    assert.deepEqual(await selectedIds(page), ['t1', 't2']);
    const initial = [await item(page, 't1'), await item(page, 't2')];
    await dragItem(page, 't1', 0, 0.7);
    const moved = [await item(page, 't1'), await item(page, 't2')];
    for (let index = 0; index < 2; index++) { near(moved[index].x, initial[index].x, 0.04); near(moved[index].y, initial[index].y + 0.7, 0.04); }
    const distance = Math.hypot(moved[0].x - moved[1].x, moved[0].y - moved[1].y);
    await page.locator('#rotate90Btn').click();
    const rotated = [await item(page, 't1'), await item(page, 't2')];
    near(Math.hypot(rotated[0].x - rotated[1].x, rotated[0].y - rotated[1].y), distance);
    await handleDrag(page, '[data-transform="resize"][data-corner="se"]', 20, 20);
    const resized = [await item(page, 't1'), await item(page, 't2')];
    assert(resized[0].width > rotated[0].width); near(resized[0].width / rotated[0].width, resized[1].width / rotated[1].width, 1e-6);
    const reservations = await rawReservations(page), count = (await state(page)).tables.length;
    await page.locator('#duplicateFloorBtn').click();
    const duplicated = await state(page);
    assert.equal(duplicated.tables.length, count + 2);
    assert.equal(new Set(duplicated.tables.map(value => value.id)).size, duplicated.tables.length);
    assert.equal(new Set(duplicated.tables.map(value => value.number)).size, duplicated.tables.length);
    await page.locator('#deleteFloorBtn').click();
    assert.equal((await state(page)).tables.length, count);
    assert.deepEqual(await rawReservations(page), reservations);
});

test('history-retains-at-least-thirty-operations-and-keyboard-shortcuts', async ({ page }) => {
    await startEdit(page); await select(page, 't1');
    for (let index = 0; index < 35; index++) await page.locator('#rotate45Btn').click();
    const changed = await item(page, 't1');
    for (let index = 0; index < 30; index++) await page.locator('#undoFloorBtn').click();
    near((await item(page, 't1')).angle, 225);
    for (let index = 0; index < 30; index++) await page.locator('#redoFloorBtn').click();
    assert.deepEqual(await item(page, 't1'), changed);
    await page.keyboard.press('Control+z');
    near((await item(page, 't1')).angle, 90);
    await page.keyboard.press('Control+Shift+z');
    assert.deepEqual(await item(page, 't1'), changed);
});

test('snap-guides-toggle-and-oriented-boundaries', async ({ page }) => {
    await startEdit(page); await select(page, 't2');
    if (await page.locator('#snapFloorBtn').getAttribute('aria-pressed') !== 'true') await page.locator('#snapFloorBtn').click();
    const start = await item(page, 't2');
    let guides = 0;
    await mouseDrag(page, await point(page, start.x, start.y), await point(page, 3.06, 4.6), async () => {
        guides = await page.locator('.snap-guide-x,.snap-guide-y').count();
    });
    near((await item(page, 't2')).x, 3, 0.025);
    assert(guides > 0, 'Guide magnétique pendant le mouvement');
    await noSnap(page);
    await dragItem(page, 't2', 0.13, 0);
    near((await item(page, 't2')).x, 3.13, 0.04);
    await select(page, 't1'); await page.locator('#rotate45Btn').click();
    await dragItem(page, 't1', -10, -10);
    assert(await page.evaluate(() => FloorPlan.inside(floorDraft, floorDraft.tables.find(value => value.id === 't1'))));
});

test('new-table-and-element-appear-at-visible-centre', async ({ page }) => {
    await startEdit(page);
    await page.locator('#zoomInBtn').click(); await page.locator('#zoomInBtn').click();
    await page.evaluate(() => { const viewport = document.getElementById('floorViewport'); viewport.scrollLeft = 80; viewport.scrollTop = 65; });
    const centre = await page.evaluate(() => FloorEditor.visibleCenter());
    await page.locator('#addTableBtn').click(); await page.locator('#tableEditForm button[type="submit"]').click();
    const created = (await state(page)).tables[0];
    near(created.x, centre.x, 0.01); near(created.y, centre.y, 0.01);
    await page.locator('#cancelPlanBtn').click(); await startEdit(page);
    const elementCentre = await page.evaluate(() => FloorEditor.visibleCenter());
    await page.locator('#addElementBtn').click(); await page.locator('#elementForm button[type="submit"]').click();
    const element = (await state(page)).elements[0];
    near(element.x, elementCentre.x, 0.01); near(element.y, elementCentre.y, 0.01);
}, { seed: emptyFixture });

test('room-resize-save-reload-and-cancel-keep-physical-positions', async ({ page }) => {
    const initial = await state(page), reservations = await rawReservations(page);
    await startEdit(page); await page.locator('#roomDimensionsBtn').click();
    await page.locator('#roomWidthInput').fill('24'); await page.locator('#roomDepthInput').fill('20');
    await page.locator('#roomDimensionsForm button[type="submit"]').click();
    assert.deepEqual((await state(page)).tables, initial.tables);
    await page.locator('#roomDimensionsBtn').click(); await page.locator('#roomWidthInput').fill('2'); await page.locator('#roomDepthInput').fill('2');
    await page.locator('#roomDimensionsForm button[type="submit"]').click();
    assert.match(await page.locator('#roomDimensionsError').textContent(), /petite/);
    await page.locator('#closeDimensionsBtn').click(); await page.locator('#savePlanBtn').click();
    await page.reload();
    near((await state(page)).rooms[0].width, 24); assert.deepEqual((await state(page)).tables, initial.tables);
    const savedRaw = await page.evaluate(key => localStorage.getItem(key), planKey);
    await startEdit(page); await select(page, 't1'); await page.locator('#rotate45Btn').click(); await page.locator('#cancelPlanBtn').click();
    assert.equal(await page.evaluate(() => floorDraft), null);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), planKey), savedRaw);
    assert.deepEqual(await rawReservations(page), reservations);
});

for (const device of ['mobile', 'tablet']) {
    test(`${device}-touch-selection-multi-drag-and-two-finger-zoom-pan`, async ({ page }) => {
        await startEdit(page); await noSnap(page);
        await page.locator('#multiSelectBtn').tap(); await page.locator('[data-floor-id="t1"]').tap(); await page.locator('[data-floor-id="t2"]').tap();
        assert.deepEqual(await selectedIds(page), ['t1', 't2']);
        await page.locator('[data-floor-id="t1"]').scrollIntoViewIfNeeded();
        const before = await item(page, 't1'), start = await point(page, before.x, before.y), end = await point(page, before.x + 0.5, before.y + 0.4);
        const frames = Array.from({ length: 11 }, (_, index) => [{ x: start.x + (end.x - start.x) * index / 10, y: start.y + (end.y - start.y) * index / 10 }]);
        await touchGesture(page, frames);
        const moved = await item(page, 't1'); assert(moved.x > before.x + 0.2, 'Déplacement au doigt effectif');
        await page.evaluate(() => FloorEditor.clearSelection());
        const content = await state(page), scale = await page.evaluate(() => FloorZoom.getScale());
        await page.locator('#floorViewport').scrollIntoViewIfNeeded();
        const viewport = await page.locator('#floorViewport').boundingBox(), cx = viewport.x + viewport.width / 2, cy = viewport.y + Math.min(80, viewport.height / 3);
        const pinch = Array.from({ length: 11 }, (_, index) => [
            { x: cx - 35 - index * 3 + index * 2, y: cy + index },
            { x: cx + 35 + index * 3 + index * 2, y: cy + index },
        ]);
        await touchGesture(page, pinch);
        assert((await page.evaluate(() => FloorZoom.getScale())) > scale * 1.3, 'Zoom à deux doigts effectif');
        assert.deepEqual(await state(page), content, 'Le pincement ne modifie aucun objet');
        await page.locator('#zoomFitBtn').click();
        const fit = await page.evaluate(() => { const node = document.getElementById('floorViewport'); return [node.scrollLeft, node.scrollTop]; });
        near(fit[0], 0, 1); near(fit[1], 0, 1);
        await page.screenshot({ path: path.join(artifacts, `${device}-editor.png`), fullPage: true });
    }, { device });
}

async function main() {
    fs.mkdirSync(artifacts, { recursive: true });
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined), headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
        for (const spec of cases.filter(value => (!baselineOnly || value.baseline) && value.name.includes(filter))) {
            const started = Date.now(), errors = [], dialogs = [];
            const context = await browser.newContext(spec.device === 'mobile' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
                : spec.device === 'tablet' ? { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true }
                    : { viewport: { width: 1440, height: 1000 } });
            const seed = (spec.seed || fixture)();
            await context.addInitScript(({ seed, planKey, reservationKey, historyKey }) => {
                if (sessionStorage.getItem('restomanager-browser-fixture')) return;
                localStorage.clear(); localStorage.setItem(planKey, JSON.stringify(seed.plan));
                localStorage.setItem(reservationKey, JSON.stringify(seed.reservations)); localStorage.setItem(historyKey, JSON.stringify(seed.history));
                sessionStorage.setItem('restomanager-browser-fixture', '1');
            }, { seed, planKey, reservationKey, historyKey });
            const page = await context.newPage();
            page.setDefaultTimeout(10000);
            page.on('pageerror', error => errors.push(error.message));
            page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
            page.on('dialog', async dialog => { dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.accept(); });
            await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
            try {
                await page.goto(origin, { waitUntil: 'networkidle' });
                await page.waitForFunction(() => typeof FloorPlan !== 'undefined');
                if (!spec.baseline) await page.waitForFunction(() => typeof FloorEditor !== 'undefined');
                await spec.run({ page, seed, dialogs });
                assert.deepEqual(errors, [], 'Aucune erreur de console/runtime');
                results.push({ name: spec.name, status: 'passed', durationMs: Date.now() - started, dialogs });
                console.log('PASS ' + spec.name);
            } catch (error) {
                await page.screenshot({ path: path.join(artifacts, spec.name + '-failure.png'), fullPage: true }).catch(() => {});
                results.push({ name: spec.name, status: 'failed', durationMs: Date.now() - started, error: error.stack, errors, dialogs });
                console.error('FAIL ' + spec.name + ': ' + error.message);
            } finally { await context.close(); }
        }
    } finally { await browser.close(); }
    fs.writeFileSync(path.join(artifacts, 'browser-editor-results.json'), JSON.stringify(results, null, 2));
    console.log(`${results.filter(value => value.status === 'passed').length}/${results.length} scénarios navigateur réussis ; artefacts : ${artifacts}`);
    if (!results.length || results.some(value => value.status === 'failed')) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });

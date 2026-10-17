'use strict';

// Run from the repository: node tests/browser/three.cjs
// Requires an HTTP server and Playwright/Chromium. This suite uses software WebGL;
// its timings are diagnostic and do not establish a real phone's frame rate.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = (()=>{if(process.env.PLAYWRIGHT_MODULE)return require(process.env.PLAYWRIGHT_MODULE);try{return require('playwright');}catch(_){return require('/tmp/restomanager-browser/node_modules/playwright');}})();
const origin = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:8000';
const artifacts = process.env.BROWSER_ARTIFACTS || '/tmp/restomanager-artifacts';
const planKey = 'restomanager_floor_plan_v1', reservationKey = 'restomanager_reservations', historyKey = 'restomanager_history';
const cases = [], results = [];
const near = (actual, expected, tolerance = 1e-6) => assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
const changed = (first, second) => JSON.stringify(first) !== JSON.stringify(second);
function table(id, number, x, y, extra = {}) {
    return { id, number, x, y, roomId: 'main', width: 1.2, depth: 1.2, angle: 0,
        capacity: 4, capacityMin: 2, shape: 'square', letter: '', color: '#28734f', ...extra };
}
function fixture() {
    const plan = { version: 4, rooms: [{ id: 'main', name: 'Salle principale', width: 30, depth: 20, floor: 'wood' },
        { id: 'terrace', name: 'Terrasse', width: 15, depth: 12, floor: 'tile' }],
    tables: [table('t1', 1, 4, 4, { width: 2, depth: 1, angle: 37, shape: 'rectangle', letter: 'A' }),
        table('t2', 2, 8, 4, { angle: 90, color: '#732433' }), table('t3', 3, 12, 4, { shape: 'round', color: '#28536d' }),
        table('t4', 4, 16, 4, { shape: 'bench', width: 2, depth: 0.8, angle: 45 }),
        table('t27', 27, 6, 6, { roomId: 'terrace', letter: 'B' })], elements: [] };
    const items = [['chair', 4, 8, 0.5, 0.5], ['armchair', 8, 8, 0.8, 0.8], ['bench', 12, 8, 2, 0.8],
        ['wall', 4, 12, 4, 0.2], ['door', 10, 12, 0.9, 0.15], ['window', 14, 12, 1.6, 0.15],
        ['pillar', 18, 12, 0.4, 0.4], ['partition', 22, 12, 2, 0.15], ['plant', 4, 16, 0.6, 0.6],
        ['lamp', 8, 16, 0.4, 0.4], ['counter', 12, 16, 2, 0.8], ['bar', 16, 16, 3, 0.9],
        ['kitchen', 20, 16, 3, 2], ['toilets', 24, 16, 2, 2], ['zone', 26, 5, 3, 3]];
    plan.elements = items.map(([type, x, y, width, depth], index) => ({ id: 'e-' + type, type, label: type,
        roomId: 'main', x, y, width, depth, angle: index % 2 ? 12 : 0, color: '#8a5a29' }));
    return { plan, reservations: [{ id: 'preserved-reservation', type: 'exterieur', client: 'Client conservé', date: '2099-10-17',
        time: '19:00', guests: 4, duration: 90, tables: [1, 27], status: 'reserved' }], history: [] };
}
function hundredFixture() {
    const seed = fixture(); seed.plan.rooms[0].width = 30; seed.plan.rooms[0].depth = 30; seed.plan.elements = [];
    seed.plan.tables = Array.from({ length: 100 }, (_, index) => table('hundred-' + index, index + 1,
        1.5 + index % 10 * 2.7, 1.5 + Math.floor(index / 10) * 2.7, { width: 0.8, depth: 0.8, angle: index * 15 % 360 }));
    seed.reservations = []; return seed;
}
const test = (name, run, options = {}) => cases.push({ name, run, ...options });
async function getState(page) { return page.evaluate(() => Floor3D.getState()); }
async function model(page) { return page.evaluate(() => structuredClone(currentPlan())); }
async function stored(page) {
    return page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [planKey, reservationKey, historyKey]);
}
async function show(page) {
    await page.locator('#floor3DBtn').click();
    await page.waitForFunction(() => { const state = Floor3D.getState(); return state.ready && state.visible; });
    await page.locator('#floor3DViewport canvas').waitFor({ state: 'visible' });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return getState(page);
}
async function hide(page) { await page.locator('#floor2DBtn').click(); assert(await page.locator('#floorViewport').isVisible()); }
async function startEdit(page) {
    await page.locator('#menuBtn').click(); await page.locator('#adminBtn').click(); await page.locator('#editPlanBtn').click();
    await page.waitForFunction(() => floorDraft !== null);
}
async function canvasDrag(page, dx, dy, button = 'left') {
    const canvas = page.locator('#floor3DViewport canvas'); await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y); await page.mouse.down({ button }); await page.mouse.move(x + dx, y + dy, { steps: 12 }); await page.mouse.up({ button });
    await page.waitForTimeout(150);
}
// Validate the actual Three Object3D transforms exposed by the debug snapshot.
async function assertScene(page) {
    const [scene, plan] = await Promise.all([getState(page), model(page)]);
    const expected = plan.tables.concat(plan.elements).filter(value => value.roomId === scene.roomId);
    assert.equal(scene.objects.length, expected.length, 'Chaque objet du plan possède un groupe 3D');
    for (const source of expected) {
        const rendered = scene.objects.find(value => value.id === source.id);
        assert(rendered, 'Groupe 3D pour ' + source.id);
        near(rendered.position[0], source.x); near(rendered.position[2], source.y);
        near(rendered.width, source.width); near(rendered.depth, source.depth);
        near(rendered.rotationY, -source.angle * Math.PI / 180);
        assert.equal(rendered.color.toLowerCase(), source.color.toLowerCase());
    }
    const labels = scene.labels;
    for (const source of plan.tables.filter(value => value.roomId === scene.roomId)) {
        const label = labels.find(value => value.id === source.id && value.text === 'T' + source.number + source.letter);
        assert(label, 'Numéro lisible pour ' + source.id);
        assert.equal(label.visible, true);
        assert.equal(label.sizeAttenuation, false, 'La taille du numéro reste lisible quelle que soit la distance');
        // Sprite's vertex shader cancels perspective distance when sizeAttenuation
        // is false. Derive CSS pixels independently from its real scale/projection.
        const pixelHeight = label.scale[1] * scene.camera.projection[5] * scene.viewport.height / 2;
        const pixelWidth = label.scale[0] * scene.camera.projection[0] * scene.viewport.width / 2;
        assert(pixelHeight >= 18, `${source.id}: numéro trop petit (${pixelHeight.toFixed(1)} px)`);
        assert(pixelWidth >= 40, `${source.id}: étiquette trop étroite (${pixelWidth.toFixed(1)} px)`);
    }
    assert(scene.renderer.calls > 0, 'Une frame WebGL a effectivement été rendue');
    return scene;
}

test('three-switches-and-scene-match-model-with-readable-labels', async ({ page }) => {
    const before = await model(page), raw = await stored(page);
    await show(page); await assertScene(page);
    assert.equal(await page.locator('#floorViewport').isVisible(), false);
    await page.screenshot({ path: path.join(artifacts, 'desktop-three.png'), fullPage: true });
    await hide(page); assert.deepEqual(await model(page), before); assert.deepEqual(await stored(page), raw);
    assert.equal((await getState(page)).visible, false);
});

test('three-camera-orbit-pan-wheel-and-reset', async ({ page }) => {
    const initial = await show(page);
    await canvasDrag(page, 80, 30);
    const orbit = await getState(page); assert(changed(orbit.camera.matrix, initial.camera.matrix), 'Rotation orbitale effective');
    await canvasDrag(page, 50, 25, 'right');
    const pan = await getState(page); assert(changed(pan.camera.target, orbit.camera.target), 'Déplacement caméra effectif');
    await page.locator('#floor3DViewport canvas').hover(); await page.mouse.wheel(0, 180); await page.waitForTimeout(150);
    const zoom = await getState(page); assert(changed(zoom.camera.position, pan.camera.position) || zoom.camera.zoom !== pan.camera.zoom, 'Zoom caméra effectif');
    await page.locator('#reset3DBtn').click(); await page.waitForTimeout(100);
    const reset = await getState(page);
    for (let index = 0; index < initial.camera.matrix.length; index++) near(reset.camera.matrix[index], initial.camera.matrix[index], 1e-5);
});

test('three-syncs-2d-edits-rooms-cancel-save-and-reload', async ({ page }) => {
    const initial = await model(page), initialRaw = await stored(page);
    await startEdit(page); await page.locator('[data-floor-id="t1"]').click(); await page.locator('#rotate45Btn').click();
    await show(page); await assertScene(page);
    await page.locator('#roomSelect').selectOption('terrace');
    await page.waitForFunction(() => Floor3D.getState().roomId === 'terrace'); await assertScene(page);
    assert.equal((await getState(page)).objects.length, 1);
    await hide(page); await page.locator('#roomSelect').selectOption('main'); await page.locator('#cancelPlanBtn').click();
    assert.deepEqual(await model(page), initial); assert.deepEqual(await stored(page), initialRaw);
    await show(page); await assertScene(page); await hide(page);
    await startEdit(page); await page.locator('[data-floor-id="t1"]').click(); await page.locator('#rotate90Btn').click(); await page.locator('#savePlanBtn').click();
    const saved = await model(page); await page.reload(); await show(page); await assertScene(page);
    assert.deepEqual(await model(page), saved);
    const finalRaw = await stored(page); assert.equal(finalRaw[1], initialRaw[1]); assert.equal(finalRaw[2], initialRaw[2]);
});

test('three-hundred-objects-and-repeated-syncs-keep-resources-bounded', async ({ page, diagnostics }) => {
    const baseline = await show(page); await assertScene(page);
    assert.equal(baseline.objects.length, 100);
    assert(baseline.renderer.calls < 250, 'Moins de 250 draw calls pour 100 objets');
    assert(baseline.renderer.geometries < 200, 'Géométries partagées pour 100 objets');
    assert(baseline.renderer.textures <= 125, 'Textures limitées aux étiquettes et ressources légères');
    await page.waitForTimeout(120); // Let initial ResizeObserver/render requests settle.
    const idleFrames = (await getState(page)).frames;
    await page.waitForTimeout(220);
    assert.equal((await getState(page)).frames, idleFrames, 'Aucun rendu permanent lorsque la scène reste inactive');
    for (let index = 0; index < 6; index++) {
        await hide(page); await startEdit(page); await page.locator('[data-floor-id="hundred-0"]').click();
        await page.locator('#rotate45Btn').click(); await show(page); await assertScene(page);
        await hide(page); await page.locator('#cancelPlanBtn').click(); await show(page);
    }
    const final = await getState(page);
    assert(final.renderer.geometries <= baseline.renderer.geometries + 5, 'Pas d’accumulation de géométries après synchronisation');
    assert(final.renderer.textures <= baseline.renderer.textures + 2, 'Pas d’accumulation de textures après synchronisation');
    assert(final.renderer.programs <= baseline.renderer.programs + 2, 'Nombre de programmes stable');
    assert.equal(await page.locator('#floor3DViewport canvas').count(), 1, 'Un seul canvas WebGL');
    diagnostics.resources = { baseline: baseline.renderer, final: final.renderer };
    await page.evaluate(() => Floor3D.dispose());
    const disposed = await getState(page); assert.equal(disposed.visible, false); assert.equal(disposed.ready, false);
    assert.equal(disposed.objects.length, 0);
    await show(page); await assertScene(page);
}, { seed: hundredFixture });

test('three-mobile-view-is-usable-without-mutating-the-plan', async ({ page }) => {
    const initial = await model(page); await show(page); await assertScene(page);
    const box = await page.locator('#floor3DViewport canvas').boundingBox();
    assert(box.width >= 250 && box.height >= 200);
    await page.screenshot({ path: path.join(artifacts, 'mobile-three.png'), fullPage: true });
    await hide(page); assert.deepEqual(await model(page), initial);
}, { mobile: true });

test('three-webgl-unavailable-keeps-2d-editable-and-data-intact', async ({ page }) => {
    const initial = await model(page), raw = await stored(page);
    await page.locator('#floor3DBtn').click();
    await page.locator('#floor3DNotice').waitFor({ state: 'visible' });
    assert(await page.locator('#floorViewport').isVisible()); assert.match(await page.locator('#floor3DNotice').textContent(), /WebGL|3D/i);
    await startEdit(page); await page.locator('[data-floor-id="t1"]').click(); await page.locator('#rotate90Btn').click();
    const draft = await model(page); near(draft.tables[0].angle, (initial.tables[0].angle + 90) % 360);
    await page.locator('#cancelPlanBtn').click(); assert.deepEqual(await model(page), initial); assert.deepEqual(await stored(page), raw);
}, { noWebGL: true });

test('three-context-loss-falls-back-to-2d-without-data-loss', async ({ page }) => {
    const initial = await model(page), raw = await stored(page); await show(page);
    const supported = await page.evaluate(() => {
        const canvas = document.querySelector('#floor3DViewport canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        const extension = gl && gl.getExtension('WEBGL_lose_context');
        if (!extension) return false; extension.loseContext(); return true;
    });
    assert(supported, 'Extension de perte de contexte disponible dans le navigateur de test');
    await page.locator('#floorViewport').waitFor({ state: 'visible' });
    assert(await page.locator('#floor3DNotice').isVisible()); assert.equal((await getState(page)).visible, false);
    assert.deepEqual(await model(page), initial); assert.deepEqual(await stored(page), raw);
});

async function main() {
    fs.mkdirSync(artifacts, { recursive: true });
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined), headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    try {
        for (const spec of cases.filter(value => value.name.includes(process.env.BROWSER_CASE || ''))) {
            const started = Date.now(), errors = [], diagnostics = {};
            const context = await browser.newContext(spec.mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
                : { viewport: { width: 1440, height: 1000 } });
            const seed = (spec.seed || fixture)();
            await context.addInitScript(({ seed, planKey, reservationKey, historyKey, noWebGL }) => {
                if (noWebGL) {
                    const original = HTMLCanvasElement.prototype.getContext;
                    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
                        return /webgl/i.test(type) ? null : original.call(this, type, ...args);
                    };
                }
                if (!sessionStorage.getItem('restomanager-three-fixture')) {
                    localStorage.clear(); localStorage.setItem(planKey, JSON.stringify(seed.plan));
                    localStorage.setItem(reservationKey, JSON.stringify(seed.reservations)); localStorage.setItem(historyKey, JSON.stringify(seed.history));
                    sessionStorage.setItem('restomanager-three-fixture', '1');
                }
            }, { seed, planKey, reservationKey, historyKey, noWebGL: !!spec.noWebGL });
            const page = await context.newPage(); page.setDefaultTimeout(15000);
            page.on('pageerror', error => errors.push(error.message));
            page.on('console', message => { if (message.type() === 'error' && !(spec.noWebGL && /webgl|context/i.test(message.text()))) errors.push(message.text()); });
            page.on('dialog', dialog => dialog.accept());
            await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
            try {
                await page.goto(origin, { waitUntil: 'networkidle' }); await page.waitForFunction(() => typeof Floor3D !== 'undefined');
                await spec.run({ page, seed, diagnostics }); assert.deepEqual(errors, [], 'Aucune erreur JavaScript inattendue');
                results.push({ name: spec.name, status: 'passed', durationMs: Date.now() - started, diagnostics }); console.log('PASS ' + spec.name);
            } catch (error) {
                await page.screenshot({ path: path.join(artifacts, spec.name + '-failure.png'), fullPage: true }).catch(() => {});
                results.push({ name: spec.name, status: 'failed', durationMs: Date.now() - started, error: error.stack, errors, diagnostics }); console.error('FAIL ' + spec.name + ': ' + error.message);
            } finally { await context.close(); }
        }
    } finally { await browser.close(); }
    fs.writeFileSync(path.join(artifacts, 'browser-three-results.json'), JSON.stringify(results, null, 2));
    console.log(`${results.filter(value => value.status === 'passed').length}/${results.length} scénarios 3D réussis ; artefacts : ${artifacts}`);
    if (!results.length || results.some(value => value.status === 'failed')) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });

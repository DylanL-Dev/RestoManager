'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict'), { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..'), out = path.resolve(process.env.BROWSER_ARTIFACTS || 'test-results/rm0151-public');
const widths = process.env.RM015_WIDTHS ? process.env.RM015_WIDTHS.split(',').map(Number).filter(Boolean) : [360, 390, 430, 768, 1024, 1440, 1920], results = [];
const received = [];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  received.push(req.url);
  let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/__sw-harness') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><html lang="fr"><title>Isolated worker harness</title><body>Fictional isolated test</body></html>'); }
  const file = pathname === '/__axe.js' ? path.join(root, 'node_modules/axe-core/axe.min.js') : path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (error, bytes) => { if (error) { res.writeHead(404); return res.end(); } res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(bytes); });
});
let browser, origin;
const pass = name => { console.log('PASS ' + name); results.push({ name, status: 'passed' }); };
async function layout(page) {
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1); }).map(e => ({ tag: e.tagName, class: e.className?.baseVal || e.className, id: e.id, width: e.getBoundingClientRect().width, scroll: e.scrollWidth, text: e.textContent.slice(0, 40) })).slice(0, 15) }));
  assert.ok(size.scroll <= size.width + 1, 'No horizontal overflow: ' + JSON.stringify(size));
}
async function capture(page, name) { await layout(page); await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true, animations: 'disabled' }); }
async function axe(page, name) {
  await page.evaluate(async () => { await Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))); });
  if (!await page.evaluate(() => !!window.axe)) await page.addScriptTag({ url: origin + '/__axe.js' });
  const report = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })));
  assert.deepEqual(report, [], 'axe ' + name + ': ' + JSON.stringify(report));
}
async function context(options = {}) {
  const c = await browser.newContext({ serviceWorkers: 'block', locale: 'fr-FR', ...options });
  await c.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  return c;
}
async function chooseTime(page) {
  await page.locator('input[name=time]:not(:disabled)').first().check();
  await page.getByRole('button', { name: 'Continuer', exact: false }).click();
}
async function complete(page) {
  await chooseTime(page); await page.getByLabel('J’accepte les conditions').check();
  await page.getByRole('button', { name: 'Vérifier mon exemple' }).click();
  await page.getByRole('button', { name: 'Terminer la réservation fictive' }).click();
  await page.getByRole('heading', { name: 'Votre exemple est prêt' }).waitFor();
}
(async () => {
  try {
    fs.mkdirSync(out, { recursive: true }); await new Promise(r => server.listen(0, '127.0.0.1', r)); origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ args: ['--no-sandbox'] });
    for (const width of widths) {
      const c = await context({ viewport: { width, height: width < 700 ? 844 : 1000 }, isMobile: width < 700, hasTouch: width <= 1024 });
      const page = await c.newPage(), errors = [], requests = [];
      page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push({ method: r.method(), url: r.url() }));
      await page.goto(origin + '/reservation/?restaurant=a-lepicerie-rouen'); await page.locator('#party-2+label').waitFor();
      assert.equal(await page.locator('[data-lucide]').count(), 0, 'Every icon resolves from the local Lucide set');
      await layout(page); await axe(page, 'welcome ' + width);
      if ([390, 768, 1440].includes(width)) await capture(page, 'welcome-' + width);
      assert.ok(await page.getByRole('button', { name: 'Continuer' }).isDisabled());
      assert.ok(await page.locator('input[name=time][disabled]').count() > 0);
      await chooseTime(page); await layout(page); await axe(page, 'contact ' + width);
      await page.getByLabel('Prénom fictif').fill(''); await page.getByRole('button', { name: 'Vérifier mon exemple' }).click();
      assert.ok(await page.locator('#firstName').getAttribute('aria-invalid')); assert.equal(await page.evaluate(() => document.activeElement.id), 'firstName');
      await page.getByLabel('Prénom fictif').fill('Camille'); await page.getByLabel('J’accepte les conditions').check();
      await page.getByLabel('Une demande particulière').fill('Une poussette, si possible.');
      if ([390, 768, 1440].includes(width)) await capture(page, 'contact-' + width);
      await page.getByRole('button', { name: 'Vérifier mon exemple' }).click(); await layout(page); await axe(page, 'review ' + width);
      assert.equal(await page.evaluate(() => window.injected), undefined);
      assert.ok((await page.locator('h2').allTextContents()).includes('Tout est prêt ?'));
      await page.getByRole('button', { name: 'Coordonnées', exact: true }).click(); assert.equal(await page.locator('#firstName').inputValue(), 'Camille');
      await page.getByRole('button', { name: 'Vérifier mon exemple' }).click();
      await page.getByRole('button', { name: 'Terminer la réservation fictive' }).click();
      await page.getByRole('heading', { name: 'Votre exemple est prêt' }).waitFor(); await layout(page); await axe(page, 'confirmation ' + width);
      assert.equal(await page.evaluate(() => window.injected), undefined); assert.match(await page.locator('.reference').innerText(), /^DEMO-/);
      if ([390, 768, 1440].includes(width)) await capture(page, 'confirmation-' + width);
      await page.getByRole('link', { name: 'Consulter ou modifier mon exemple' }).click(); await page.getByRole('button', { name: 'Modifier mon exemple' }).waitFor();
      assert.match(page.url(), /#manage=[a-f0-9]{64}$/); assert.doesNotMatch(page.url(), /Camille|example.test/);
      await page.reload(); await page.getByRole('button', { name: 'Modifier mon exemple' }).click();
      await page.locator('#party-3').check(); await page.getByRole('button', { name: 'Continuer' }).click(); await page.getByRole('button', { name: 'Vérifier mon exemple' }).click();
      await page.getByRole('button', { name: 'Enregistrer la modification fictive' }).click(); assert.match(await page.locator('.summary').innerText(), /3 personnes/);
      await page.reload(); await page.getByRole('button', { name: 'Annuler mon exemple' }).click();
      await page.getByRole('dialog').waitFor(); await axe(page, 'cancel dialog ' + width); await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').isVisible(), false);
      await page.getByRole('button', { name: 'Annuler mon exemple' }).click(); await page.getByRole('button', { name: 'Oui, annuler cet exemple' }).click();
      await page.getByRole('heading', { name: 'Votre exemple est annulé' }).waitFor(); assert.equal(await page.getByRole('button', { name: 'Modifier mon exemple' }).count(), 0);
      if ([390, 768, 1440].includes(width)) await capture(page, 'cancelled-' + width);
      await layout(page); assert.deepEqual(errors, []);
      assert.ok(requests.every(r => r.method === 'GET' && ['/reservation/', '/lucide-local.js', '/pwa-icon.svg', '/__axe.js'].some(prefix => new URL(r.url).pathname.startsWith(prefix))), JSON.stringify(requests));
      assert.equal(await page.evaluate(() => ['supabase', 'RestoScreens', 'RestoSharedService', 'RestoCreator', 'RestoTutorial'].some(k => k in window)), false);
      pass('Complete public demo, validation, back, refresh, edit, cancellation, axe and no internal requests ' + width); await c.close();
    }
    {
      const c = await context({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }), page = await c.newPage();
      await page.goto(origin + '/reservation/?restaurant=a-lepicerie-rouen');
      await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.className), 'skip'); await page.keyboard.press('Enter');
      await page.locator('#time-19\\:00').focus(); await page.keyboard.press('Space'); await page.getByRole('button', { name: 'Continuer' }).focus(); await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.tagName), 'H2');
      await page.getByRole('button', { name: 'Confidentialité', exact: true }).first().click();
      for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); assert.ok(await page.evaluate(() => !!document.activeElement.closest('dialog'))); }
      await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Votre venue', exact: true }).click();
      // Browser zoom equivalent: double the root font, preserving CSS viewport width.
      await page.evaluate(() => document.documentElement.style.fontSize = '32px'); await layout(page); await axe(page, 'large text');
      pass('Keyboard, skip link, focus return, dialog trap, reduced motion and enlarged text'); await c.close();
    }
    {
      const c = await context(), page = await c.newPage();
      await page.goto(origin + '/reservation/?restaurant=a-lepicerie-rouen');
      const futureSaturday = await page.evaluate(() => { const M = window.RMPublicModel; let d = M.addDays(M.paris().date, 1); while (new Date(d + 'T12:00Z').getUTCDay() !== 6) d = M.addDays(d, 1); return d; });
      await page.locator('#visitDate').fill(futureSaturday); await page.locator('#service-lunch').check(); assert.equal(await page.locator('input[name=time]').count(), 0); assert.ok(await page.getByRole('button', { name: 'Continuer' }).isDisabled());
      await page.goto(origin + '/reservation/?restaurant=%3Cscript%3E'); assert.equal(await page.getByRole('heading', { name: 'Ce lien de démonstration n’est pas disponible' }).count(), 1);
      await page.goto(origin + '/reservation/'); await page.getByRole('heading', { name: 'Choisissez votre établissement fictif' }).waitFor();
      const examples=await page.locator('.choice-row a').allTextContents();assert.equal(examples.length,2);assert.ok(examples.some(t=>t.includes('Jardin'))&&examples.some(t=>t.includes('Rives')));
      assert.ok(!examples.some(t=>/Épicerie|Mercure|Rouen/i.test(t)),'No historic hotel suggested in generic demos');
      await page.getByRole('link',{name:/Rives/}).click();
      assert.match(await page.locator('h1').innerText(),/Rives/);assert.match(page.url(),/restaurant=hotel-des-rives-demo/);
      await page.goto(origin + '/reservation/');
      await page.getByRole('button', { name: 'Confidentialité', exact: true }).click(); await page.getByRole('heading', { name: 'Vos données dans cet aperçu' }).waitFor(); await page.keyboard.press('Escape');
      await page.goto(origin + '/reservation/?restaurant=a-lepicerie-rouen'); await complete(page); const link = await page.locator('a[href*="#manage="]').getAttribute('href');
      await page.goto(origin + '/reservation/?restaurant=le-jardin-demo' + new URL(link, origin).hash); await page.getByRole('heading', { name: 'Ce lien n’est plus disponible' }).waitFor(); assert.equal(await page.locator('.summary').count(), 0);
      await page.goto(origin + '/reservation/?restaurant=le-jardin-demo'); assert.equal(await page.locator('#party-8').count(), 0); assert.match(await page.locator('h1').innerText(), /Jardin/);
      const foreign = await context(), other = await foreign.newPage(); await other.goto(origin + '/reservation/' + link); await other.getByRole('heading', { name: 'Ce lien n’est plus disponible' }).waitFor(); await foreign.close();
      pass('Closures, unknown/missing restaurant, independent venue settings, foreign tenant/session links'); await c.close();
    }
    {
      const c = await context(), page = await c.newPage(); await page.goto(origin + '/reservation/?restaurant=a-lepicerie-rouen'); await complete(page);
      const link = await page.locator('a[href*="#manage="]').getAttribute('href');
      await page.evaluate(() => { const k = 'rm0151:demo:a-lepicerie-rouen', r = JSON.parse(sessionStorage.getItem(k)); r.expiresAt = Date.now() - 1; sessionStorage.setItem(k, JSON.stringify(r)); });
      await page.goto(origin + '/reservation/' + link); await page.reload(); await page.getByText('Ce lien de démonstration a expiré.', { exact: true }).waitFor(); assert.equal(await page.locator('.summary').count(), 0);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('rm0151:demo:a-lepicerie-rouen')), null);
      pass('Expired demo link fails closed and erases its local record'); await c.close();
    }
    {
      const c = await context(); await c.addInitScript(() => { Object.defineProperty(window, 'sessionStorage', { get() { throw Error('Storage unavailable'); } }); });
      const page = await c.newPage(); await page.goto(origin + '/reservation/?restaurant=a-lepicerie-rouen'); await complete(page);
      await page.getByText('Le stockage est indisponible.', { exact: false }).waitFor(); await page.getByRole('link', { name: 'Consulter ou modifier mon exemple' }).click(); await page.getByRole('button', { name: 'Modifier mon exemple' }).waitFor();
      await page.getByRole('button', { name: 'Commencer un nouvel exemple' }).click(); await page.getByRole('heading', { name: 'Réservez votre table' }).waitFor();
      pass('Storage refusal remains usable in memory, explains limitations, restart clears example'); await c.close();
    }
    {
      const c = await context(), page = await c.newPage(); await page.goto(origin + '/reservation/?restaurant=a-lepicerie-rouen');
      await chooseTime(page); await page.getByLabel('Une demande particulière').fill('<script>window.injected=true</script>'); await page.getByLabel('J’accepte les conditions').check();
      await page.getByRole('button', { name: 'Vérifier mon exemple' }).click(); assert.match(await page.locator('.summary').innerText(), /<script>/); assert.equal(await page.evaluate(() => window.injected), undefined);
      await page.getByRole('button', { name: 'Terminer la réservation fictive' }).click(); assert.equal(await page.evaluate(() => window.injected), undefined);
      const before = received.length;
      const denied = await page.evaluate(async () => {
        const violations = []; document.addEventListener('securitypolicyviolation', e => violations.push(e.effectiveDirective));
        let blocked = false; try { await fetch('/supabase-service-bridge.js'); } catch { blocked = true; }
        await new Promise(r => setTimeout(r, 30)); return { blocked, violations };
      });
      assert.equal(denied.blocked, true); assert.ok(denied.violations.includes('connect-src')); assert.ok(!received.slice(before).some(u => u.includes('supabase-service-bridge')));
      pass('HTML notes remain text; public CSP blocks internal data fetch before any HTTP request'); await c.close();
    }
    {
      const c = await context({ serviceWorkers: 'allow' }), page = await c.newPage(); await page.goto(origin + '/__sw-harness');
      await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; navigator.serviceWorker.addEventListener('message', e => { if (e.data.type === 'RESTO_UPDATE_CHECK') e.ports[0].postMessage({ type: 'RESTO_UPDATE_STATE', dirty: false, busy: false }); }); });
      const publicPage = await c.newPage(); await publicPage.goto(origin + '/reservation/?restaurant=a-lepicerie-rouen'); await publicPage.locator('#party-2').waitFor({ state: 'attached' });
      const canUpdate = await page.evaluate(async () => { const worker = (await navigator.serviceWorker.ready).active, channel = new MessageChannel(); return new Promise(resolve => { channel.port1.onmessage = e => resolve(e.data.ok); worker.postMessage({ type: 'RESTO_CAN_UPDATE' }, [channel.port2]); }); }); assert.equal(canUpdate, true, 'Public page never blocks employee update checks');
      await c.setOffline(true); await publicPage.goto(origin + '/reservation/?restaurant=a-lepicerie-rouen&offline=1', { timeout: 10000 }).catch(() => {});
      assert.equal(await publicPage.locator('#integrationBanner, #loginForm, #bookingForm, #rmLearningHelp').count(), 0, 'Offline public route never returns the employee shell');
      const cachedPublic = await page.evaluate(async () => { const keys = await caches.keys(); const urls = []; for (const key of keys) for (const r of await (await caches.open(key)).keys()) urls.push(r.url); return urls.some(u => new URL(u).pathname.startsWith('/reservation/')); }); assert.equal(cachedPublic, false);
      pass('Actual employee service worker excludes public cache, offline staff fallback and update acknowledgements'); await c.close();
    }
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ widths, results, privacy: 'Fictitious browser-only records; no credentials, APIs or business writes', limitation: 'Automated accessibility and simulated journeys; no human usability study' }, null, 2));
  } finally { await browser?.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

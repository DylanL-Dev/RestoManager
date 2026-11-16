'use strict';
// Real SW and HTTP cache on a loopback server. Auth/service bridge served by the
// in-memory harness even for worker-originated fetches; no external data access.
process.argv.push('--pwa-fixture');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const {open,server,bumpWorker,getCalls}=require('./rm013a-management.cjs');
const out=process.env.BROWSER_ARTIFACTS||path.resolve('test-results/rm014-pwa'),results=[];
const pass=name=>{results.push(name);console.log('PASS '+name)};
async function waitAsync(page,predicate){const end=Date.now()+30000;while(Date.now()<end){if(await page.evaluate(predicate))return;await new Promise(resolve=>setTimeout(resolve,100))}throw Error('PWA condition timed out')}
async function request(page){await page.evaluate(()=>{window.__updateResult='pending';void window.RestoAppRefresh.request({kind:'update'}).then(value=>window.__updateResult=value)})}
async function reset(page){await page.evaluate(()=>{window.RestoPrepareNewReservation();window.RestoScreens.markBookingSaved();window.RestoScreens.show('tables')})}
(async()=>{let browser;try{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true});
 for(const basePath of ['', '/RestoManager']){
  const v=await open(browser,origin,390,'fb_admin',{serviceWorkers:'allow',basePath}),{context,page}=v;
  await page.evaluate(()=>window.RestoScreens.show('tables'));
  await waitAsync(page,async()=>{const r=await navigator.serviceWorker.getRegistration('./');return Boolean(r?.active)});
  const cache=await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration('./');const names=await caches.keys();const name=names.find(n=>n.includes('dev-rm014-fixture'));const urls=(await (await caches.open(name)).keys()).map(req=>new URL(req.url).pathname);return {scope:new URL(r.scope).pathname,urls}});
  assert.equal(cache.scope,basePath+'/');assert.ok(cache.urls.includes(basePath+'/v3-connected.html'));assert.ok(cache.urls.includes(basePath+'/service-v3-notification-model.js'));assert.ok(!cache.urls.includes(basePath+'/app-release.json'));pass('PWA shell + safe manifest bypass, scope '+(basePath||'/'));
  const second=await context.newPage();await second.goto(origin+basePath+'/v3-connected.html');await second.waitForFunction(()=>window.RestoSupabaseReady===true);
  const welcome=second.locator('#restoTourWelcome');if(await welcome.isVisible())await second.getByRole('button',{name:'Plus tard',exact:true}).click();
  await second.evaluate(()=>window.RestoScreens.show('reservationForm'));await second.locator('#bookingNotes').fill('Autre onglet : notes à préserver');await second.locator('#bookingAllergies').fill('Autre onglet : allergies à préserver');
  await page.evaluate(()=>window.__noReload='kept');await request(page);await page.getByRole('alertdialog').waitFor({timeout:15000});assert.match(await page.getByRole('alertdialog').innerText(),/autre fenêtre/);await page.getByRole('alertdialog').getByRole('button',{name:'Fermer',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__noReload),'kept');assert.equal(await second.locator('#bookingNotes').inputValue(),'Autre onglet : notes à préserver');assert.equal(await second.locator('#bookingAllergies').inputValue(),'Autre onglet : allergies à préserver');pass('Dirty second tab blocks request without losing either draft '+(basePath||'/'));
  // Install a changed worker while both pages are open; it must remain waiting.
  bumpWorker();await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration('./');await r.update()});
  await waitAsync(page,async()=>Boolean((await navigator.serviceWorker.getRegistration('./'))?.waiting));
  assert.equal(await page.evaluate(async()=>(await navigator.serviceWorker.getRegistration('./')).waiting.state),'installed');
  assert.equal(await page.evaluate(()=>window.__noReload),'kept');pass('New worker stays waiting; no automatic claim/reload '+(basePath||'/'));
  await request(page);await page.getByRole('alertdialog').waitFor({timeout:15000});await page.getByRole('alertdialog').getByRole('button',{name:'Fermer',exact:true}).click();assert.ok(await page.evaluate(async()=>Boolean((await navigator.serviceWorker.getRegistration('./')).waiting)));pass('Waiting activation also refuses dirty peer '+(basePath||'/'));
  await reset(second);await page.waitForFunction(()=>window.__updateResult===false);
  await request(page);await page.waitForURL(url=>url.searchParams.has('refresh'),{timeout:30000});await page.waitForFunction(()=>window.RestoSupabaseReady===true);
  assert.equal(await page.evaluate(()=>window.__noReload),undefined);assert.equal(await second.evaluate(()=>window.RestoScreens.current()),'tables');assert.equal(await second.evaluate(()=>location.search),'');pass('Clean explicit update reloads requesting tab only '+(basePath||'/'));
  // A controlled page can reload its shell offline; latest publication cannot be asserted offline.
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>Boolean(window.RestoNotifications));
  await page.locator('.serviceBell').click();assert.match(await page.locator('[data-notification-id="important:sync"]').innerText(),/hors ligne/);assert.equal(await page.locator('[data-notification-id^="release:"]').count(),0);pass('Controlled PWA offline shell: explicit stale status, no fake update '+(basePath||'/'));
  await context.setOffline(false);assert.deepEqual(v.errors,[]);assert.ok(!getCalls().some(c=>c.name&&c.name!=='booking_draft_v3'));await context.close();
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:results.length,failed:0,results,network:'Loopback only; actual SW; in-memory bridge'},null,2));
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});

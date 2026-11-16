'use strict';
// Real application/auth guard; all data lives in the existing in-memory boundary.
// External HTTP and WebSocket traffic is blocked by the harness.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,server,configure,getCalls}=require('./rm013a-management.cjs');
const out=process.env.BROWSER_ARTIFACTS||path.resolve('test-results/rm014');
const baseline=process.argv.includes('--baseline'),prototype=process.argv.includes('--prototype');
const widths=[360,390,430,768,1024,1440,1920],results=[];
const releaseTitle=JSON.parse(fs.readFileSync('app-release.json','utf8')).releases[0].title;
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const event=(extra={})=>({id:'booking-1',reservation_id:'new-1',guest_name:'118',hotel_room:'118',party_size:2,starts_at:'2032-11-08T11:30:00Z',created_at:'2032-11-08T09:58:00Z',read_at:null,restaurant_id:'fictional-venue',...extra});
async function seed(page){
 configure(state=>{
  const common={restaurant_id:'fictional-venue',party_size:2,notes:'CONFIDENTIEL\nALLERGIES À VÉRIFIER : ALLERGIE SECRÈTE\n[RESTOMANAGER:HOTEL]',edit_version:'fixture-version'};
  state.reservations=[
   {...common,id:'late-1',guest_name:'204',hotel_room:'204',starts_at:'2032-11-08T09:30:00Z',ends_at:'2032-11-08T10:30:00Z',status:'reserved'},
   {...common,id:'departure-1',guest_name:'312',hotel_room:'312',starts_at:'2032-11-08T08:45:00Z',ends_at:'2032-11-08T09:45:00Z',seated_at:'2032-11-08T08:45:00Z',status:'seated'},
   {...common,id:'new-1',guest_name:'118',hotel_room:'118',starts_at:'2032-11-08T11:30:00Z',ends_at:'2032-11-08T12:30:00Z',status:'reserved'}
  ];state.assignments=state.reservations.map((r,i)=>({reservation_id:r.id,table_id:id(100+i)}));state.bookingAlerts=[event()];state.changeAlerts=[];
 });
 await page.evaluate(async()=>{await window.RestoRefreshSharedService();await window.RestoRefreshFbAlerts?.();window.dispatchEvent(new Event('restomanager:fb-alerts'))});
 if(baseline)await page.evaluate(a=>{window.RestoFbReservationAlerts=[a];window.dispatchEvent(new Event('restomanager:fb-alerts'))},event());
 else await page.evaluate(()=>window.RestoAppRelease.check());
}
const card=(page,id)=>page.locator('[data-notification-id="'+id+'"]');
async function close(page){await page.getByRole('button',{name:'Fermer les notifications',exact:true}).click()}
async function screenshot(page,name){await page.clock.runFor(180);await page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'})}
async function noOverflow(page){
 const layout=await page.evaluate(()=>{
  const d=document.querySelector('.rmNotificationCenter'),r=d.getBoundingClientRect();
  const footer=d.querySelector('.rmNcFooter').getBoundingClientRect();
  const controls=[...d.querySelectorAll('button')].filter(n=>n.getClientRects().length).map(n=>({text:n.getAttribute('aria-label')||n.textContent,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}));
  function luminance(c){const [r,g,b]=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return r*.2126+g*.7152+b*.0722}
  function background(el){const c=getComputedStyle(el).backgroundColor;return c==='rgba(0, 0, 0, 0)'?background(el.parentElement):c}
  const contrasts=[...d.querySelectorAll('.rmNcCardTitle,.rmNcBody,.rmNcPrimary,.rmNcSubtitle,.rmNcMeta,.rmNcGroupTitle')].filter(e=>e.getClientRects().length).map(e=>{const a=luminance(getComputedStyle(e).color),b=luminance(background(e));return {text:e.textContent,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}});
  return {contrasts,page:document.documentElement.scrollWidth<=innerWidth+1,panel:d.scrollWidth<=d.clientWidth+1,inside:r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1,footer:footer.bottom<=innerHeight+1,controls};
 });
 assert.ok(layout.page&&layout.panel&&layout.inside&&layout.footer,JSON.stringify(layout));
 for(const c of layout.contrasts)assert.ok(c.ratio>=4.5,JSON.stringify(c));
 for(const c of layout.controls)assert.ok(c.width>=24&&c.height>=43,c.text+' touch target '+c.width+'x'+c.height);
}
async function expectHistory(page){
 assert.equal(await page.locator('#rmNcTitle').textContent(),'Quoi de neuf ?');
 assert.ok(await page.locator('.rmNcHistoryEntry').count()>=2,'Actual release history entries must be rendered, not only its title');
 assert.equal(await page.locator('#serviceReminderPanel .rmNcCard').count(),0,'Notification cards cannot remain in the history view');
 assert.ok((await page.locator('.rmNcHistoryEntry').first().innerText()).includes(releaseTitle));
 assert.equal(await page.evaluate(()=>document.activeElement.id),'rmNcTitle');
}
async function newsNavigation(page,role,width){
 const release=()=>page.locator('[data-notification-id^="release:"]').getByRole('button',{name:'Voir les nouveautés',exact:true});
 // Reading an unread release can remove its card during the same click.
 await page.getByRole('button',{name:'Non lues',exact:true}).click();await release().click();await expectHistory(page);
 await page.getByRole('button',{name:'Retour aux notifications',exact:true}).click();
 assert.equal(await page.locator('.rmNcHistoryEntry').count(),0);
 await page.getByRole('button',{name:'Non lues',exact:true}).click();
 // The history cache must not mistake the restored notification flow for history.
 await release().click();await expectHistory(page);
 if([390,768,1440].includes(width))await screenshot(page,'history-from-card-'+role+'-'+width);
 await close(page);await page.locator('.serviceBell').click();await release().click();await expectHistory(page);
 await close(page);await page.evaluate(()=>window.RestoScreens.request('administration'));
 await page.locator('#manageNewsToggle').click();await page.locator('#manageNews').getByRole('button',{name:'Voir les nouveautés',exact:true}).click();await expectHistory(page);
 await close(page);await page.evaluate(()=>window.RestoScreens.request('tables'));await page.locator('.serviceBell').click();
 assert.equal(await page.locator('.rmNcHistoryEntry').count(),0);
}
async function basic(page,role,width){
 const bell=page.locator('.serviceBell');assert.equal(await bell.count(),1);
 await page.evaluate(()=>{window.__previousSync=window.RestoSyncState;delete window.RestoSyncState;window.dispatchEvent(new Event('restomanager:connection-state'))});
 await bell.click();assert.match(await card(page,'important:sync').innerText(),/Vérification des notifications/);assert.match(await card(page,'important:sync').innerText(),/En cours/);assert.ok(!(await page.locator('#serviceReminderPanel').innerText()).includes('Aucune notification pour le moment'));
 await close(page);await page.evaluate(()=>{window.RestoSyncState=window.__previousSync;window.dispatchEvent(new Event('restomanager:connection-state'))});
 await bell.focus();await page.keyboard.press('Enter');await page.locator('#serviceReminderPanel').waitFor({state:'visible'});
 assert.equal(await bell.getAttribute('aria-expanded'),'true');assert.equal(await page.evaluate(()=>document.activeElement.id),'rmNcTitle');
 assert.equal(await page.locator('#serviceReminderPanel').getAttribute('aria-labelledby'),'rmNcTitle');
 const text=await page.locator('#serviceReminderPanel').innerText();assert.ok(!text.includes('CONFIDENTIEL')&&!text.includes('SECRÈTE'));
 if(role==='reception'){
  assert.equal(await page.locator('[data-notification-id^="event:"],[data-notification-id^="late:"],[data-notification-id^="departure:"]').count(),0);
 }else{
  assert.equal(await card(page,'late:late-1').count(),1);assert.equal(await card(page,'departure:departure-1').count(),1);assert.equal(await card(page,'event:new-1').count(),1);
  assert.match(await card(page,'event:new-1').innerText(),/Chambre 118/);
 }
 await noOverflow(page);await page.clock.runFor(100);assert.equal(await page.locator('#serviceReminderPanel [data-lucide]').count(),0,'Every notification icon is available in the offline Lucide set');
 const footer=page.getByRole('button',{name:'Quoi de neuf ?',exact:true});await footer.focus();await page.keyboard.press('Tab');
 assert.ok(await page.evaluate(()=>document.querySelector('#serviceReminderPanel').contains(document.activeElement)),'Native dialog contains keyboard focus');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('.serviceBell').getAttribute('aria-expanded')==='false');assert.equal(await bell.getAttribute('aria-expanded'),'false');assert.equal(await bell.evaluate(b=>b===document.activeElement),true);
 await bell.click();
 if([390,768,1440].includes(width)){await screenshot(page,'after-'+role+'-'+width);const release=page.locator('[data-notification-id^="release:"]');await release.scrollIntoViewIfNeeded();await screenshot(page,'news-'+role+'-'+width);await page.locator('.rmNcScroll').evaluate(el=>el.scrollTop=0)}
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');
 await noOverflow(page);if([390,768,1440].includes(width))await screenshot(page,'after-'+role+'-'+width+'-dark');
 // Text contrast (actual inherited colors for body, primary, heading) in each theme.
 const contrast=await page.evaluate(()=>{
  function rgb(c){return c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4})}
  function lum(c){const [r,g,b]=rgb(c);return r*.2126+g*.7152+b*.0722}
  function bg(el){let c=getComputedStyle(el).backgroundColor;return c==='rgba(0, 0, 0, 0)'?bg(el.parentElement):c}
  return [...document.querySelectorAll('.rmNcCardTitle,.rmNcBody,.rmNcPrimary,.rmNcSubtitle')].filter(e=>e.getClientRects().length).map(e=>{const a=lum(getComputedStyle(e).color),b=lum(bg(e));return {text:e.textContent,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}});
 });for(const c of contrast)assert.ok(c.ratio>=4.5,JSON.stringify(c));
 await page.evaluate(()=>document.documentElement.dataset.theme='light');
 await newsNavigation(page,role,width);
 if(role==='fb_admin'){
  const initial=await bell.locator('.serviceBellCount').textContent();
  configure(s=>s.bookingAlerts.push({...s.bookingAlerts[0]}));await page.evaluate(()=>window.RestoRefreshFbAlerts());
  assert.equal(await bell.locator('.serviceBellCount').textContent(),initial,'Duplicate source row does not change unread count');
  const late=card(page,'late:late-1');await late.getByRole('button',{name:'Marquer comme lue : Arrivée à vérifier',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-notification-id="late:late-1"] .rmNcMeta').textContent.includes('Lue'));
  assert.equal(await late.count(),1,'Read active reminder remains in flow');
  await page.getByRole('button',{name:'Non lues',exact:true}).click();assert.equal(await late.count(),1,'Important unresolved reminder survives unread filter');
  await page.getByRole('button',{name:'Non lues',exact:true}).click();
  await late.getByRole('button',{name:'Reporter 10 min',exact:true}).click();assert.equal(await late.count(),0);
  await page.getByRole('button',{name:'Reportés (1)',exact:true}).click();assert.equal(await late.count(),1);
  await late.getByRole('button',{name:'Réactiver le rappel',exact:true}).click();
  await page.getByRole('button',{name:'Retour au flux',exact:true}).click();assert.equal(await late.count(),1);
  await page.getByRole('button',{name:'Tout marquer comme lu',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.serviceBellCount').hidden);
  assert.equal(await card(page,'event:new-1').count(),1,'Read server event remains available in short history');
  assert.ok(getCalls().filter(c=>c.table==='fb_reservation_alerts').every(c=>Object.keys(c.values).join(',')==='read_at'),'Only server reading markers mutate');
  configure(s=>{s.reservations.find(r=>r.id==='late-1').status='arrived';s.reservations.find(r=>r.id==='departure-1').status='departed'});
  await page.evaluate(async()=>{await window.RestoRefreshSharedService();return true});assert.equal(await late.count(),0);assert.equal(await card(page,'departure:departure-1').count(),0);
 }
 await page.getByRole('button',{name:'Quoi de neuf ?',exact:true}).click();assert.equal(await page.locator('#rmNcTitle').textContent(),'Quoi de neuf ?');
 assert.ok(await page.locator('.rmNcHistoryEntry').count()>=2);assert.ok((await page.locator('.rmNcHistoryEntry').first().innerText()).includes(releaseTitle));
 await noOverflow(page);if([390,768,1440].includes(width))await screenshot(page,'history-'+role+'-'+width);
 await close(page);await page.locator('.serviceBell').click();assert.equal(await page.locator('.rmNcHistoryEntry').count(),0,'Reopening bell returns to flow, not stale history DOM');await close(page);assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
 await page.evaluate(()=>{window.RestoSyncState='error';window.dispatchEvent(new Event('restomanager:connection-state'))});await bell.click();
 assert.match(await card(page,'important:sync').innerText(),/Synchronisation indisponible/);assert.ok(!(await page.locator('#serviceReminderPanel').innerText()).includes('Aucune notification pour le moment'));
 await close(page);await page.evaluate(()=>{window.RestoSyncState='ok';window.RestoFbAlertsStatus='ready';window.dispatchEvent(new Event('restomanager:connection-state'))});await bell.click();assert.equal(await card(page,'important:sync').count(),0);await close(page);
}
(async()=>{let browser;try{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
 if(baseline||prototype){
  for(const width of [390,768,1440]){
   if(prototype){const p=await browser.newPage({viewport:{width,height:width===768?1024:900}});await p.goto(origin+'/docs/audits/maquettes/rm014.html');await p.screenshot({path:path.join(out,'prototype-'+width+'.png')});await p.close();continue}
   const v=await open(browser,origin,width,'fb_admin');await v.page.evaluate(()=>window.RestoScreens.show('tables'));await seed(v.page);await v.page.locator('.serviceBell').click();await screenshot(v.page,'before-'+width);assert.deepEqual(v.errors,[]);await v.context.close();
  }
 }else{
  for(const width of (process.env.RM014_WIDTH?[Number(process.env.RM014_WIDTH)]:widths))for(const role of ['fb_admin','reception']){
   const v=await open(browser,origin,width,role);await v.page.evaluate(()=>window.RestoAppRelease.check());const published=JSON.parse(fs.readFileSync('app-release.json','utf8'));published.releases[0].date='2032-11-08';await v.context.route('**/app-release.json?*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(published)}));await seed(v.page);await v.page.evaluate(()=>window.RestoScreens.show('tables'));try{await basic(v.page,role,width)}catch(error){console.error('Failure state',{url:v.page.url(),pageErrors:v.errors,calls:getCalls()});await v.page.screenshot({path:path.join(out,'failure-'+role+'-'+width+'.png')}).catch(()=>{});throw error}
   assert.deepEqual(v.errors,[]);assert.ok(!getCalls().some(c=>c.name&&c.name!=='booking_draft_v3'),'No booking/closeout mutation');
   results.push({width,role,status:'passed'});await v.context.close();console.log('PASS RM-014 layout, notifications, read, resolved, ARIA, dark, history '+role+' '+width);
  }
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({base:'e3a5daa',backend:'In-memory boundary, real frontend/auth; external HTTP/WS blocked',passed:results.length,failed:0,results},null,2));
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});

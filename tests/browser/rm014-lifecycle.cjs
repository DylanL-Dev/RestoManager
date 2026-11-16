'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const {open,server,configure,failNotifications,getNotificationQueries,getCalls}=require('./rm013a-management.cjs');
const out=process.env.BROWSER_ARTIFACTS||path.resolve('test-results/rm014-lifecycle'),results=[];
const raw=JSON.parse(fs.readFileSync('app-release.json','utf8'));
const alert=(extra={})=>({id:'new',restaurant_id:'fictional-venue',reservation_id:'fixture-booking',starts_at:'2032-11-08T09:30:00Z',created_at:'2032-11-08T09:59:00Z',guest_name:'204',hotel_room:'204',party_size:2,read_at:null,...extra});
const card=(p,id)=>p.locator('[data-notification-id="'+id+'"]');
const push=page=>page.evaluate(async()=>{await window.RestoRefreshSharedService();await window.RestoRefreshFbAlerts?.()});
async function dismiss(page){await page.getByRole('alertdialog').getByRole('button',{name:'Fermer',exact:true}).click();assert.equal(await page.evaluate(()=>document.body.style.overflow),'','Dialog closing restores application scrolling')}
function pass(name){results.push(name);console.log('PASS '+name)}
(async()=>{let browser;try{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true});
 for(const role of ['fb_admin','reception']){
  const v=await open(browser,origin,390,role),{page,context}=v;
  configure(s=>{
   s.reservations=[{id:'fixture-booking',guest_name:'204',hotel_room:'204',party_size:2,starts_at:'2032-11-08T09:30:00Z',ends_at:'2032-11-08T10:30:00Z',status:'reserved',notes:'CONFIDENTIEL\nALLERGIES À VÉRIFIER : SECRÈTE\n[RESTOMANAGER:HOTEL]',edit_version:'v1'}];
   s.assignments=[{reservation_id:'fixture-booking',table_id:s.tables[0].id}];s.bookingAlerts=[alert(),alert({id:'foreign',restaurant_id:'other-venue',reservation_id:'foreign-booking',guest_name:'CLIENT INTERDIT'})];s.changeAlerts=[];
  });await push(page);await page.evaluate(()=>window.RestoAppRelease.check());await page.locator('.serviceBell').click();
  assert.ok(!(await page.locator('#serviceReminderPanel').innerText()).includes('INTERDIT'));
  if(role==='fb_admin'){
   assert.ok(getNotificationQueries().every(q=>q.filters.some(([key,val])=>key==='restaurant_id'&&val==='fictional-venue')));pass('Tenant filtered for every select/update');
   failNotifications(true);await page.evaluate(()=>window.RestoRefreshFbAlerts());assert.match(await card(page,'important:sync').innerText(),/Réception ne sont pas à jour/);
   failNotifications(false);await page.evaluate(()=>window.RestoRefreshFbAlerts());assert.equal(await card(page,'important:sync').count(),0);assert.equal(await page.evaluate(()=>window.RestoFbAlertsError),null);pass('Source error → stale data explicit → recovery clears error');
   await card(page,'late:fixture-booking').getByRole('button',{name:'Reporter 10 min'}).click();assert.equal(await card(page,'late:fixture-booking').count(),0);
   await page.clock.fastForward(601000);await page.evaluate(()=>window.RestoNotifications.refresh());assert.equal(await card(page,'late:fixture-booking').count(),1);pass('Snooze expiry survives background clock catch-up');
   await card(page,'late:fixture-booking').getByRole('button',{name:'Marquer comme lue : Arrivée à vérifier'}).click();
   await page.waitForFunction(()=>document.querySelector('[data-notification-id="late:fixture-booking"] .rmNcMeta').textContent.includes('Lue'));
   await page.getByRole('button',{name:'Fermer les notifications',exact:true}).click();await page.reload();await page.waitForFunction(()=>window.RestoSupabaseReady===true);await page.evaluate(()=>window.RestoAppRelease.check());await page.locator('.serviceBell').click();
   assert.match(await card(page,'late:fixture-booking').innerText(),/Lue/);pass('Scoped read state persists across reload without re-counting an active reminder');
   configure(s=>s.changeAlerts=[alert({id:'modified',event_type:'modified',created_at:'2032-11-08T10:10:02Z',changed_fields:['couverts','consignes'],previous_party_size:1})]);await page.evaluate(()=>window.RestoRefreshFbAlerts());assert.equal(await card(page,'event:fixture-booking').count(),1);assert.match(await card(page,'event:fixture-booking').innerText(),/2 événements regroupés/);assert.ok(!(await card(page,'event:fixture-booking').innerText()).includes('SECRÈTE'));pass('Created + modified grouped with confidential contents excluded');
   configure(s=>{s.changeAlerts.push(alert({id:'cancelled',event_type:'cancelled',created_at:'2032-11-08T10:10:03Z'}));s.reservations[0].status='cancelled'});await push(page);assert.equal(await card(page,'late:fixture-booking').count(),0);assert.match(await card(page,'event:fixture-booking').innerText(),/Réservation annulée/);pass('Cancellation supersedes creation and resolves arrival reminder');
   await card(page,'event:fixture-booking').getByRole('button',{name:'Voir la réservation',exact:true}).click();await page.waitForFunction(()=>window.RestoScreens.current()==='reservations');assert.equal(await page.locator('#reservationQuery').inputValue(),'204');assert.match(await page.locator('.reservationExpanded').innerText(),/Statut : Annulé/);pass('Real contextual navigation expands cancelled reservation');
   configure(s=>s.reservations[0].status='reserved');await push(page);
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('restomanager:open-reservation',{detail:{view:'active',reservationId:'fixture-booking'}})));
   await page.locator('[data-reservation-action="edit"]').first().click();await page.locator('#editForm').waitFor({state:'visible'});await page.locator('#editNotes').fill('NOTE ÉDITEUR À PRÉSERVER');
   await page.locator('.serviceBell').click();await card(page,'late:fixture-booking').getByRole('button',{name:'Voir la réservation'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();
   assert.equal(await page.locator('#editNotes').inputValue(),'NOTE ÉDITEUR À PRÉSERVER');assert.equal(await page.locator('#editForm').isVisible(),true);assert.equal(await page.evaluate(()=>document.body.style.overflow),'');pass('Same-screen contextual action respects refused editor navigation and preserves unsaved notes');
   await page.locator('#editCancel').click();await page.getByRole('alertdialog').getByRole('button',{name:'Quitter sans enregistrer'}).click();
   await page.locator('.serviceBell').click();
  }
  await page.evaluate(()=>{
   window.__rm012Opened=0;
   window.__unregister=window.RestoNotifications.registerSource('rm012-fixture',{
    roles:['fb_admin'],collect:({context,now})=>[
     {id:'unclosed:2032-11-07',restaurantId:context.restaurantId,group:'important',priority:'high',title:'Service du 07/11/2032 à régulariser',body:'2 éléments à vérifier.',createdAt:now-60000,expiresAt:now+3600000,targetScreen:'administration',actionLabel:'Régulariser le service du 07/11/2032'},
     {id:'foreign',restaurantId:'another-venue',title:'INTERDIT'},
     {id:'resolved',restaurantId:context.restaurantId,title:'RÉSOLU INTERDIT',resolved:true},
     {id:'expired',restaurantId:context.restaurantId,title:'EXPIRÉ INTERDIT',expiresAt:now-1}
    ],open:async()=>{window.__rm012Opened++}
   });
  });
  if(role==='reception')assert.equal(await card(page,'rm012-fixture:unclosed:2032-11-07').count(),0);
  else{
   assert.equal(await page.locator('[data-notification-id^="rm012-fixture:"]').count(),1);await card(page,'rm012-fixture:unclosed:2032-11-07').getByRole('button',{name:'Régulariser le service du 07/11/2032'}).click();await page.waitForFunction(()=>window.__rm012Opened===1);assert.equal(await page.evaluate(()=>window.RestoScreens.current()),'administration');await page.locator('.serviceBell').click();
  }
  await page.evaluate(()=>window.__unregister());assert.equal(await page.locator('[data-notification-id^="rm012-fixture:"]').count(),0);pass(role+' RM-012 fixture only, permission / venue / resolved / expiry, no closeout');
  await page.getByRole('button',{name:'Fermer les notifications',exact:true}).click();
  // Publication proof: a mismatched candidate manifest never creates an update.
  let mode='candidate';
  const candidate={...raw,currentVersion:'2032.11.08-new',releases:[{...raw.releases[0],version:'2032.11.08-new',date:'2032-11-08',title:'Version fictive publiée'},...raw.releases]};
  await context.route('**/app-release.json?*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(mode==='wrong-channel'?{...candidate,channel:'main'}:mode==='notes-only'?{...candidate,releases:[{...candidate.releases[0],requiresReload:false},...candidate.releases.slice(1)]}:candidate)}));
  await context.route('**/v3-connected.html?release-check=*',async route=>{let html=fs.readFileSync('v3-connected.html','utf8');if(['published','notes-only'].includes(mode))html=html.replace('content="'+raw.currentVersion+'"','content="2032.11.08-new"');await route.fulfill({contentType:'text/html',body:html})});
  await page.evaluate(()=>window.RestoAppRelease.check());assert.equal(await page.evaluate(()=>window.RestoAppRelease.availableVersion()),null);pass(role+' candidate-only publication is not announced');
  mode='wrong-channel';await page.evaluate(()=>window.RestoAppRelease.check());assert.equal(await page.evaluate(()=>window.RestoAppRelease.availableVersion()),null);pass(role+' DEV rejects MAIN channel manifest');
  mode='notes-only';assert.equal(await page.evaluate(()=>window.RestoAppRelease.check()),true);assert.equal(await page.evaluate(()=>window.RestoAppRelease.availableVersion()),null);await page.locator('.serviceBell').click();assert.equal(await card(page,'release:2032.11.08-new').getByRole('button',{name:'Mettre à jour',exact:true}).count(),0);assert.match(await card(page,'release:2032.11.08-new').innerText(),/Aucune actualisation/);await page.getByRole('button',{name:'Fermer les notifications',exact:true}).click();pass(role+' published notes-only release does not request an unnecessary reload');
  mode='published';assert.equal(await page.evaluate(()=>window.RestoAppRelease.check()),true);assert.equal(await page.evaluate(()=>window.RestoAppRelease.availableVersion()),'2032.11.08-new');await page.locator('.serviceBell').click();assert.equal(await card(page,'release:2032.11.08-new').locator('.rmNcDismiss').count(),0,'An available application update remains accessible');await page.clock.runFor(150);await page.screenshot({path:path.join(out,'published-update-'+role+'.png')});await page.getByRole('button',{name:'Fermer les notifications',exact:true}).click();
  await page.evaluate(()=>window.RestoScreens.show('reservationForm'));await page.locator('#bookingNotes').fill('BROUILLON NOTES À CONSERVER');await page.locator('#bookingAllergies').fill('ALLERGIES À CONSERVER');
  await page.evaluate(()=>window.__noReload='unchanged');await page.locator('.serviceBell').click();await card(page,'release:2032.11.08-new').getByRole('button',{name:'Mettre à jour',exact:true}).click();
  await page.getByRole('alertdialog').waitFor();assert.match(await page.getByRole('alertdialog').innerText(),/Votre saisie est conservée/);await dismiss(page);
  assert.equal(await page.locator('#bookingNotes').inputValue(),'BROUILLON NOTES À CONSERVER');assert.equal(await page.locator('#bookingAllergies').inputValue(),'ALLERGIES À CONSERVER');assert.equal(await page.evaluate(()=>window.__noReload),'unchanged');pass(role+' published update preserves actual dirty notes + allergies, offers later');
  // A real notification must also respect the same existing navigation confirmation.
  if(role==='fb_admin'){
   configure(s=>s.reservations[0].status='reserved');await push(page);await page.locator('.serviceBell').click();await card(page,'late:fixture-booking').getByRole('button',{name:'Voir la réservation'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();assert.equal(await page.evaluate(()=>window.RestoScreens.current()),'reservationForm');assert.equal(await page.locator('#bookingNotes').inputValue(),'BROUILLON NOTES À CONSERVER');pass('Notification navigation cancellation preserves booking form');
  }
  await page.evaluate(()=>{window.RestoPrepareNewReservation();window.RestoScreens.markBookingSaved();window.RestoScreens.show('tables');window.__originalChecking=window.RestoBookingDraft.checking;window.RestoBookingDraft.checking=()=>true});
  await page.locator('.serviceBell').click();await card(page,'release:2032.11.08-new').getByRole('button',{name:'Mettre à jour',exact:true}).click();await page.getByRole('alertdialog').waitFor();assert.match(await page.getByRole('alertdialog').innerText(),/enregistrement.*en cours/);await dismiss(page);assert.equal(await page.evaluate(()=>window.__noReload),'unchanged');await page.evaluate(()=>window.RestoBookingDraft.checking=window.__originalChecking);pass(role+' application update blocked during booking submission/checking');
  await context.setOffline(true);await page.evaluate(()=>window.dispatchEvent(new Event('offline')));await page.locator('.serviceBell').click();assert.equal(await card(page,'release:2032.11.08-new').count(),0);assert.match(await card(page,'important:sync').innerText(),/hors ligne/);await page.getByRole('button',{name:'Quoi de neuf ?',exact:true}).click();assert.match(await page.locator('.rmNcHelp').innerText(),/dernières nouveautés vérifiées/);pass(role+' offline history available without fake update');
  await context.setOffline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.evaluate(()=>window.RestoAppRelease.check());await page.getByRole('button',{name:'Fermer les notifications',exact:true}).click();
  await page.evaluate(()=>{window.RestoNotificationContext={...window.RestoNotificationContext,userId:'other-user'};window.dispatchEvent(new Event('restomanager:notification-context'))});if(role==='fb_admin'){await page.waitForFunction(()=>window.RestoNotificationContext===null);assert.equal(await page.locator('.serviceBell').isVisible(),false);pass('Changed authenticated identity clears confidential notifications and closes access')}
  assert.ok(!getCalls().some(c=>c.name&&c.name!=='booking_draft_v3'));assert.deepEqual(v.errors,[]);await context.close();
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:results.length,failed:0,results},null,2));
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
